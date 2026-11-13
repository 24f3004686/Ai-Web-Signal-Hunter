import {
  DEFAULT_FORMULA_WEIGHTS,
  type Finding,
  type FormulaWeights,
  type ThemeScoreBreakdown,
} from '../../shared/types.ts';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function normalizeFormulaWeights(weights: FormulaWeights): FormulaWeights {
  const f = Math.max(0, Number.isFinite(weights.frequency) ? weights.frequency : 0);
  const r = Math.max(0, Number.isFinite(weights.relevance) ? weights.relevance : 0);
  const u = Math.max(0, Number.isFinite(weights.urgency) ? weights.urgency : 0);
  const c = Math.max(0, Number.isFinite(weights.confidence) ? weights.confidence : 0);
  const rec = Math.max(0, Number.isFinite(weights.recency) ? weights.recency : 0);
  const total = f + r + u + c + rec;
  if (total <= 0) {
    return { ...DEFAULT_FORMULA_WEIGHTS };
  }
  return {
    frequency: f / total,
    relevance: r / total,
    urgency: u / total,
    confidence: c / total,
    recency: rec / total,
  };
}

export function computeRecencyScore(
  publishDateIso: string | undefined,
  crawlDateIso: string,
  now: Date = new Date()
): number {
  let targetMs = NaN;
  if (publishDateIso) {
    const parsed = Date.parse(publishDateIso);
    if (!Number.isNaN(parsed)) {
      targetMs = parsed;
    }
  }
  if (Number.isNaN(targetMs)) {
    const parsedCrawl = Date.parse(crawlDateIso);
    targetMs = Number.isNaN(parsedCrawl) ? now.getTime() : parsedCrawl;
  }

  const diffDays = Math.max(0, (now.getTime() - targetMs) / (1000 * 60 * 60 * 24));
  if (diffDays <= 30) return 100;
  if (diffDays >= 365) return 0;

  const score = 100 * (1 - (diffDays - 30) / (365 - 30));
  return round1(Math.max(0, Math.min(100, score)));
}

export function computeThemeRankings(
  findings: Finding[],
  totalDomainsCrawled: number,
  now: Date = new Date(),
  weights: FormulaWeights = DEFAULT_FORMULA_WEIGHTS
): ThemeScoreBreakdown[] {
  const safeDomainsTotal = Math.max(1, totalDomainsCrawled);
  const w = normalizeFormulaWeights(weights);
  const byTheme = new Map<string, { verified: Finding[]; unverified: Finding[] }>();

  for (const f of findings) {
    if (f.category === 'irrelevant') continue;
    const themeLabel = f.theme?.trim() || 'Uncategorized';
    let bucket = byTheme.get(themeLabel);
    if (!bucket) {
      bucket = { verified: [], unverified: [] };
      byTheme.set(themeLabel, bucket);
    }
    if (f.evidence_verified) {
      bucket.verified.push(f);
    } else {
      bucket.unverified.push(f);
    }
  }

  const breakdowns: ThemeScoreBreakdown[] = [];

  for (const [theme, bucket] of byTheme.entries()) {
    const verified = bucket.verified;
    if (verified.length === 0) {
      breakdowns.push({
        theme,
        theme_score: 0,
        frequency: 0,
        avg_relevance: 0,
        avg_urgency: 0,
        avg_confidence: 0,
        recency: 0,
        distinct_domains: 0,
        verified_finding_count: 0,
        unverified_finding_count: bucket.unverified.length,
      });
      continue;
    }

    const distinctDomains = new Set(verified.map((f) => f.domain)).size;
    const frequency = Math.min(100, (distinctDomains / safeDomainsTotal) * 100);
    const avgRelevance = verified.reduce((acc, f) => acc + f.relevance, 0) / verified.length;
    const avgUrgency = verified.reduce((acc, f) => acc + f.urgency, 0) / verified.length;
    const avgConfidence = verified.reduce((acc, f) => acc + f.confidence, 0) / verified.length;
    const avgRecency =
      verified.reduce((acc, f) => acc + computeRecencyScore(f.publish_date, f.crawl_date, now), 0) /
      verified.length;

    const themeScore =
      w.frequency * frequency +
      w.relevance * avgRelevance +
      w.urgency * avgUrgency +
      w.confidence * avgConfidence +
      w.recency * avgRecency;

    breakdowns.push({
      theme,
      theme_score: round1(themeScore),
      frequency: round1(frequency),
      avg_relevance: round1(avgRelevance),
      avg_urgency: round1(avgUrgency),
      avg_confidence: round1(avgConfidence),
      recency: round1(avgRecency),
      distinct_domains: distinctDomains,
      verified_finding_count: verified.length,
      unverified_finding_count: bucket.unverified.length,
    });
  }

  return breakdowns.sort((a, b) => {
    if (b.theme_score !== a.theme_score) return b.theme_score - a.theme_score;
    return b.verified_finding_count - a.verified_finding_count;
  });
}
