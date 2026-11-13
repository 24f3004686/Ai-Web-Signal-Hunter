import {
  DEFAULT_GROQ_CHAT_MODELS,
  formatGeminiError,
  isAccountAuthOrBillingError,
  isModelUnavailableError,
  isTransientRetryableError,
  selectGroqChatModels,
} from '../logic/discoveryAndErrors.ts';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODELS_URL = 'https://api.groq.com/openai/v1/models';
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

export const GROQ_FALLBACK_MODELS = DEFAULT_GROQ_CHAT_MODELS;

export function hasGroqApiKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim());
}

export function hasGeminiApiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
}

function getGroqApiKey(): string {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    throw new Error('GROQ_API_KEY is not configured in environment variables.');
  }
  return key;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function extractJsonFromLlmText(raw: string): unknown {
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fenced = withoutThink.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : withoutThink;
  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('Malformed JSON output from model');
  }
}

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

interface GroqModelsResponse {
  data?: Array<{
    id?: string;
    active?: boolean;
  }>;
}

let cachedModelDiscovery: {
  keyTag: string;
  fetchedAt: number;
  models: string[];
} | null = null;

let cachedWorkingModel: {
  keyTag: string;
  model: string;
} | null = null;

const unavailableModelsForKey = new Map<string, Set<string>>();

function getKeyTag(apiKey: string): string {
  return `${apiKey.slice(0, 6)}:${apiKey.slice(-4)}:${apiKey.length}`;
}

export function resetGroqClientCache(): void {
  cachedModelDiscovery = null;
  cachedWorkingModel = null;
  unavailableModelsForKey.clear();
}

async function resolveGroqCandidateModels(
  apiKey: string,
  fetchFn: typeof fetch
): Promise<string[]> {
  const keyTag = getKeyTag(apiKey);
  const envOverride = process.env.GROQ_MODEL?.trim();

  if (
    !cachedModelDiscovery ||
    cachedModelDiscovery.keyTag !== keyTag ||
    Date.now() - cachedModelDiscovery.fetchedAt > MODEL_CACHE_TTL_MS
  ) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let discoveredIds: string[] = [];
    try {
      const res = await fetchFn(GROQ_MODELS_URL, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });
      if (res.ok) {
        const payload = (await res.json()) as GroqModelsResponse;
        discoveredIds = (payload.data ?? [])
          .filter((m) => m && typeof m.id === 'string' && m.active !== false)
          .map((m) => m.id as string);
      }
    } catch {
      // Fall back to static preference list if /models fails
    } finally {
      clearTimeout(timer);
    }

    cachedModelDiscovery = {
      keyTag,
      fetchedAt: Date.now(),
      models: selectGroqChatModels(discoveredIds, envOverride),
    };
  }

  const deadSet = unavailableModelsForKey.get(keyTag);
  const ordered: string[] = [];
  if (
    cachedWorkingModel &&
    cachedWorkingModel.keyTag === keyTag &&
    !deadSet?.has(cachedWorkingModel.model)
  ) {
    ordered.push(cachedWorkingModel.model);
  }
  for (const m of cachedModelDiscovery.models) {
    if (!deadSet?.has(m) && !ordered.includes(m)) {
      ordered.push(m);
    }
  }

  if (ordered.length > 0) {
    return ordered;
  }

  // If all cached models were marked unavailable in a previous transient issue, reset and try full list once
  unavailableModelsForKey.delete(keyTag);
  return cachedModelDiscovery.models;
}

export async function callGroqJson<T>(
  systemInstruction: string,
  userContent: string,
  maxTokens = 1200,
  fetchFn: typeof fetch = fetch
): Promise<{ data: T; model: string }> {
  const apiKey = getGroqApiKey();
  const keyTag = getKeyTag(apiKey);
  const candidateModels = await resolveGroqCandidateModels(apiKey, fetchFn);
  let lastError: unknown = new Error('Groq completion failed');

  for (const model of candidateModels) {
    let useJsonFormat = true;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);
      try {
        const bodyPayload: Record<string, unknown> = {
          model,
          temperature: 0.2,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userContent },
          ],
        };
        if (useJsonFormat) {
          bodyPayload.response_format = { type: 'json_object' };
        }

        const res = await fetchFn(GROQ_API_URL, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bodyPayload),
        });

        const text = await res.text();
        if (!res.ok) {
          let errMsg = `Groq HTTP ${res.status}`;
          try {
            const parsedErr = JSON.parse(text) as GroqChatResponse;
            if (parsedErr?.error?.message) {
              errMsg = `${res.status} (${parsedErr.error.code || parsedErr.error.type || 'groq_error'}) ${parsedErr.error.message}`;
            }
          } catch {
            if (text.trim()) errMsg = `Groq HTTP ${res.status}: ${text.slice(0, 200)}`;
          }
          const err = new Error(errMsg);
          lastError = err;

          if (res.status === 401 || isAccountAuthOrBillingError(err)) {
            throw err;
          }

          if (res.status === 404 || isModelUnavailableError(err)) {
            let deadSet = unavailableModelsForKey.get(keyTag);
            if (!deadSet) {
              deadSet = new Set<string>();
              unavailableModelsForKey.set(keyTag, deadSet);
            }
            deadSet.add(model);
            if (cachedWorkingModel?.keyTag === keyTag && cachedWorkingModel.model === model) {
              cachedWorkingModel = null;
            }
            break;
          }

          if (
            res.status === 400 &&
            useJsonFormat &&
            /response_format|json_object|json mode/i.test(errMsg)
          ) {
            useJsonFormat = false;
            continue;
          }

          if (res.status === 403) {
            // Often per-model access restriction; try next model
            break;
          }

          if (attempt === 0 && (res.status === 429 || res.status >= 500 || isTransientRetryableError(err))) {
            await sleep(900 + Math.floor(Math.random() * 300));
            continue;
          }
          break;
        }

        const payload = JSON.parse(text) as GroqChatResponse;
        const content = payload.choices?.[0]?.message?.content ?? '';
        if (!content.trim()) {
          lastError = new Error(`Empty Groq output from ${model}`);
          continue;
        }

        const parsedJson = extractJsonFromLlmText(content) as T;
        cachedWorkingModel = { keyTag, model };
        return { data: parsedJson, model };
      } catch (err) {
        lastError = err;
        if (isAccountAuthOrBillingError(err)) {
          throw err;
        }
        if (isModelUnavailableError(err)) {
          break;
        }
        if (attempt === 0 && isTransientRetryableError(err)) {
          await sleep(900);
          continue;
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }

  throw new Error(formatGeminiError(lastError));
}

