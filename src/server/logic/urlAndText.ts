import { SIGNAL_CATEGORIES, type EvidenceContext, type SignalCategory } from '../../shared/types.ts';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'si',
  'yclid',
  '_hsenc',
  '_hsmi',
  'ref',
  'ref_src',
  'ref_url',
  'trk',
  'share',
]);

export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return rawUrl.trim();
    }
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();

    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((_val, key) => {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) {
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }
    parsed.searchParams.sort();

    if (parsed.pathname.length > 1 && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

export function extractDomain(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'unknown';
  }
}

export function collapseWhitespaceAndTruncate(text: string, maxChars = 6000): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxChars) return collapsed;
  return collapsed.slice(0, maxChars).trim();
}

export function wordShingles(text: string, shingleSize = 5): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const shingles = new Set<string>();
  if (words.length === 0) return shingles;
  if (words.length <= shingleSize) {
    shingles.add(words.join(' '));
    return shingles;
  }
  for (let i = 0; i <= words.length - shingleSize; i++) {
    shingles.add(words.slice(i, i + shingleSize).join(' '));
  }
  return shingles;
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of smaller) {
    if (larger.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function normalizeForSubstringMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function verifyEvidenceInText(evidence: string, pageText: string): boolean {
  const trimmed = evidence.trim();
  if (!trimmed) return false;
  if (countWords(trimmed) > 30) return false;
  const normEvidence = normalizeForSubstringMatch(trimmed);
  const normPage = normalizeForSubstringMatch(pageText);
  if (!normEvidence || !normPage) return false;
  return normPage.includes(normEvidence);
}

export function extractEvidenceContext(
  evidence: string,
  pageText: string,
  radius = 140
): EvidenceContext | undefined {
  const trimmed = evidence.trim();
  if (!trimmed || countWords(trimmed) > 30) return undefined;

  const cleanPage = pageText.replace(/\s+/g, ' ').trim();
  if (!cleanPage) return undefined;

  // Preserve exact 1:1 character positions when normalizing case & smart punctuation
  const searchablePage = cleanPage
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0/g, ' ');

  const normEvidence = normalizeForSubstringMatch(trimmed);
  if (!normEvidence) return undefined;

  const idx = searchablePage.indexOf(normEvidence);
  if (idx === -1) return undefined;

  const matchEnd = idx + normEvidence.length;
  const rawBeforeStart = Math.max(0, idx - radius);
  const rawAfterEnd = Math.min(cleanPage.length, matchEnd + radius);

  let before = cleanPage.slice(rawBeforeStart, idx);
  if (rawBeforeStart > 0) {
    const firstSpace = before.indexOf(' ');
    if (firstSpace > 0 && firstSpace < 24) {
      before = before.slice(firstSpace + 1);
    }
    before = `…${before}`;
  }

  let after = cleanPage.slice(matchEnd, rawAfterEnd);
  if (rawAfterEnd < cleanPage.length) {
    const lastSpace = after.lastIndexOf(' ');
    if (lastSpace > after.length - 24 && lastSpace > 0) {
      after = after.slice(0, lastSpace);
    }
    after = `${after}…`;
  }

  return {
    before,
    match: cleanPage.slice(idx, matchEnd),
    after,
  };
}

export interface ValidatedAnalysisOutput {
  category: SignalCategory;
  summary: string;
  who: string;
  evidence: string;
  relevance: number;
  urgency: number;
  confidence: number;
  reasoning: string;
  source_url: string;
}

export function validateAnalysisResponse(
  raw: unknown,
  fallbackUrl: string
): { valid: true; data: ValidatedAnalysisOutput } | { valid: false; reason: string } {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, reason: 'Response is not a JSON object' };
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj.category !== 'string' || !SIGNAL_CATEGORIES.includes(obj.category as SignalCategory)) {
    return { valid: false, reason: `Invalid category: ${String(obj.category)}` };
  }
  const category = obj.category as SignalCategory;

  if (typeof obj.summary !== 'string' || obj.summary.trim().length < 5) {
    return { valid: false, reason: 'Missing or too short summary' };
  }
  const whoStr =
    typeof obj.who === 'string' && obj.who.trim()
      ? obj.who.trim()
      : category === 'irrelevant'
        ? 'unclear'
        : '';
  if (!whoStr) {
    return { valid: false, reason: 'Missing who field' };
  }
  const rawEvidence =
    typeof obj.evidence === 'string'
      ? obj.evidence
      : category === 'irrelevant' && (obj.evidence === null || obj.evidence === undefined)
        ? ''
        : null;
  if (rawEvidence === null) {
    return { valid: false, reason: 'Missing evidence field' };
  }
  const reasoningStr =
    typeof obj.reasoning === 'string' && obj.reasoning.trim()
      ? obj.reasoning.trim()
      : typeof obj.reason === 'string' && obj.reason.trim()
        ? obj.reason.trim()
        : category === 'irrelevant'
          ? 'Marked irrelevant to research topic.'
          : '';
  if (!reasoningStr) {
    return { valid: false, reason: 'Missing reasoning field' };
  }

  const scoreFields = ['relevance', 'urgency', 'confidence'] as const;
  const scores: Record<string, number> = {};
  for (const field of scoreFields) {
    const rawVal = obj[field];
    const val =
      typeof rawVal === 'number'
        ? rawVal
        : typeof rawVal === 'string' && rawVal.trim() !== ''
          ? Number(rawVal.trim())
          : NaN;
    if (!Number.isFinite(val)) {
      return { valid: false, reason: `Invalid numeric score for ${field}` };
    }
    const intVal = Math.round(val);
    if (intVal < 0 || intVal > 100) {
      return { valid: false, reason: `Score out of 0-100 range for ${field}: ${rawVal}` };
    }
    scores[field] = intVal;
  }

  let evidence = rawEvidence.trim();
  if (category === 'irrelevant') {
    evidence = '';
  } else if (countWords(evidence) > 30) {
    return { valid: false, reason: `Evidence exceeds 30 words (${countWords(evidence)} words)` };
  }

  const sourceUrl =
    typeof obj.source_url === 'string' && obj.source_url.trim().startsWith('http')
      ? obj.source_url.trim()
      : fallbackUrl;

  return {
    valid: true,
    data: {
      category,
      summary: obj.summary.trim(),
      who: whoStr,
      evidence,
      relevance: scores.relevance,
      urgency: scores.urgency,
      confidence: scores.confidence,
      reasoning: reasoningStr,
      source_url: sourceUrl,
    },
  };
}
