export function rawErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function isModelUnavailableError(err: unknown): boolean {
  const msg = rawErrorMessage(err);
  return /\b404\b|NOT_FOUND|model_not_found|model_decommissioned|does not exist or you do not have access|model.*not found|decommissioned|no longer supported|unknown model/i.test(
    msg
  );
}

export function isAccountAuthOrBillingError(err: unknown): boolean {
  const msg = rawErrorMessage(err);
  if (isModelUnavailableError(err)) return false;
  return /exceeded your current quota|plan and billing|billing details|insufficient_quota|limit:\s*0|PERMISSION_DENIED|API_KEY_INVALID|invalid_api_key|API key not valid|\b401\b/i.test(
    msg
  );
}

export function isHardQuotaOrAuthError(err: unknown): boolean {
  const msg = rawErrorMessage(err);
  if (
    /exceeded your current quota|plan and billing|billing details|insufficient_quota|limit:\s*0|PERMISSION_DENIED|API_KEY_INVALID|invalid_api_key|API key not valid|\b401\b|\b403\b|\b404\b|NOT_FOUND/i.test(
      msg
    )
  ) {
    return true;
  }
  return false;
}

export function isTransientRetryableError(err: unknown): boolean {
  if (isHardQuotaOrAuthError(err)) return false;
  const msg = rawErrorMessage(err);
  return /\b(429|503|502|504)\b|RESOURCE_EXHAUSTED|UNAVAILABLE|rate limit|overloaded/i.test(msg);
}

export function formatGeminiError(err: unknown): string {
  const msg = rawErrorMessage(err).trim();
  const jsonStart = msg.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(msg.slice(jsonStart)) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed?.error?.message) {
        const code = parsed.error.code ? `${parsed.error.code} ` : '';
        const status = parsed.error.status ? `(${parsed.error.status}) ` : '';
        return `${code}${status}${parsed.error.message}`.trim();
      }
    } catch {
      // Fall back to raw message
    }
  }
  return msg;
}

export function isQuotaOrAuthMessage(msg: string): boolean {
  return /quota|RESOURCE_EXHAUSTED|429|rate limit|tokens per|PERMISSION_DENIED|API_KEY_INVALID|invalid_api_key|API key|billing|403|401/i.test(
    msg
  );
}

export const DEFAULT_GROQ_CHAT_MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai/gpt-oss-120b',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b',
  'moonshotai/kimi-k2-instruct',
  'llama3-70b-8192',
  'llama3-8b-8192',
  'gemma2-9b-it',
  'mixtral-8x7b-32768',
] as const;

const NON_CHAT_GROQ_MODEL_RE =
  /(whisper|tts|orpheus|guard|safeguard|prompt-guard|embed|rerank|moderation|speech|audio)/i;

export function selectGroqChatModels(availableIds: string[], preferredOverride?: string): string[] {
  const cleanAvailable = availableIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && !NON_CHAT_GROQ_MODEL_RE.test(id));

  const result: string[] = [];
  const pushUnique = (id?: string) => {
    const trimmed = id?.trim();
    if (trimmed && !result.includes(trimmed)) {
      result.push(trimmed);
    }
  };

  if (preferredOverride?.trim()) {
    pushUnique(preferredOverride);
  }

  if (cleanAvailable.length > 0) {
    const availableSet = new Set(cleanAvailable);
    for (const preferred of DEFAULT_GROQ_CHAT_MODELS) {
      if (availableSet.has(preferred)) {
        pushUnique(preferred);
      }
    }
    for (const id of cleanAvailable) {
      pushUnique(id);
    }
    return result;
  }

  for (const fallback of DEFAULT_GROQ_CHAT_MODELS) {
    pushUnique(fallback);
  }
  return result;
}

export function extractDuckDuckGoLiteUrls(html: string): string[] {
  const urls = new Set<string>();

  const uddgMatches = html.matchAll(/uddg=([^&"'\s<>]+)/gi);
  for (const match of uddgMatches) {
    try {
      const decoded = decodeURIComponent(match[1]);
      if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
        const host = new URL(decoded).hostname.toLowerCase();
        if (!host.includes('duckduckgo.com')) {
          urls.add(decoded);
        }
      }
    } catch {
      // Ignore malformed URI component
    }
  }

  const hrefMatches = html.matchAll(/href=["'](https?:\/\/[^"'\s<>]+)["']/gi);
  for (const match of hrefMatches) {
    try {
      const candidate = match[1].replace(/&amp;/g, '&');
      const host = new URL(candidate).hostname.toLowerCase();
      if (
        !host.includes('duckduckgo.com') &&
        !host.includes('w3.org') &&
        !candidate.endsWith('.xml') &&
        !candidate.endsWith('.ico')
      ) {
        urls.add(candidate);
      }
    } catch {
      // Ignore invalid URL
    }
  }

  return Array.from(urls);
}

export function extractBingNewsRssUrls(xml: string): string[] {
  const urls = new Set<string>();
  const linkMatches = xml.matchAll(/<link>(https?:\/\/[^<]+)<\/link>/gi);
  for (const match of linkMatches) {
    const raw = match[1].replace(/&amp;/g, '&').trim();
    try {
      const parsed = new URL(raw);
      if (parsed.hostname.includes('bing.com') && parsed.searchParams.has('url')) {
        const target = parsed.searchParams.get('url');
        if (target && (target.startsWith('http://') || target.startsWith('https://'))) {
          urls.add(target);
        }
      } else if (!parsed.hostname.includes('bing.com')) {
        urls.add(raw);
      }
    } catch {
      // Ignore invalid URL
    }
  }
  return Array.from(urls);
}

const REDIRECT_HOST_MARKERS = [
  'vertexaisearch.cloud.google.com',
  'news.google.com',
  'bing.com',
  'duckduckgo.com',
  't.co',
  'bit.ly',
  'tinyurl.com',
  'lnkd.in',
  'goo.gl',
];

export function isRedirectCandidateUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    if (REDIRECT_HOST_MARKERS.some((m) => host === m || host.endsWith(`.${m}`))) {
      return true;
    }
    return parsed.pathname.toLowerCase().includes('redirect');
  } catch {
    return false;
  }
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'for',
  'with',
  'without',
  'from',
  'about',
  'into',
  'over',
  'what',
  'when',
  'where',
  'which',
  'who',
  'whom',
  'how',
  'why',
  'are',
  'is',
  'was',
  'were',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'can',
  'could',
  'would',
  'should',
  'using',
  'use',
  'used',
  'in',
  'on',
  'of',
  'to',
  'at',
  'by',
  'or',
  'demand',
  'complaints',
  'complaint',
  'complain',
  'complaining',
  'frustrations',
  'frustration',
  'problems',
  'problem',
  'issues',
  'issue',
  'reviews',
  'review',
  'market',
  'signals',
  'signal',
  'trends',
  'feedback',
]);

export function buildConciseSearchQueries(
  topic: string,
  keywords: string,
  roundIndex: number
): { webQuery: string; newsQuery: string; newsQueryAlt?: string } {
  const cleanTopic = topic.replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const topicWords = cleanTopic.split(' ').filter(Boolean);
  const coreWords = topicWords.filter((w) => !STOP_WORDS.has(w.toLowerCase()));
  const baseTopic = (coreWords.length >= 2 ? coreWords : topicWords).slice(0, 5).join(' ');
  const baseLowerSet = new Set(baseTopic.toLowerCase().split(/\s+/));

  const rawKeywords = keywords
    .split(/[,;\n]+/)
    .map((k) => k.trim())
    .filter(Boolean);

  // Filter out keywords whose tokens are already fully covered by baseTopic
  const distinctKeywords = rawKeywords.filter((kw) => {
    const tokens = kw.toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.some((t) => !baseLowerSet.has(t));
  });

  const kwForRound =
    distinctKeywords.length > 0
      ? distinctKeywords[(roundIndex > 0 ? roundIndex - 1 : 0) % distinctKeywords.length]
      : '';

  if (roundIndex === 0) {
    return {
      webQuery: cleanTopic.slice(0, 100),
      newsQuery: baseTopic.slice(0, 90),
      newsQueryAlt: `${baseTopic} ${kwForRound || 'complaints'}`.trim().slice(0, 90),
    };
  }

  const fallbackAngles = ['reddit forum', 'complaints issues', 'reviews pricing'];
  const angle = fallbackAngles[(roundIndex - 1) % fallbackAngles.length];

  const newsParts = [baseTopic, kwForRound || angle.split(' ')[0]].filter(Boolean);
  const webParts =
    roundIndex === 1
      ? [baseTopic, 'reddit forum']
      : [baseTopic, kwForRound || angle.split(' ')[0], roundIndex === 3 ? 'review' : ''].filter(Boolean);

  return {
    webQuery: webParts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 100),
    newsQuery: newsParts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 90),
  };
}

