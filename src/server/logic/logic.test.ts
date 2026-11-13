import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseWhitespaceAndTruncate,
  countWords,
  extractDomain,
  extractEvidenceContext,
  jaccardSimilarity,
  normalizeUrl,
  validateAnalysisResponse,
  verifyEvidenceInText,
  wordShingles,
} from './urlAndText.ts';
import { computeRecencyScore, computeThemeRankings, normalizeFormulaWeights } from './scoring.ts';
import { findingsToCsv, generateFindingsMarkdownNote } from './exportFormatters.ts';
import {
  buildConciseSearchQueries,
  extractBingNewsRssUrls,
  extractDuckDuckGoLiteUrls,
  formatGeminiError,
  isAccountAuthOrBillingError,
  isHardQuotaOrAuthError,
  isModelUnavailableError,
  isQuotaOrAuthMessage,
  isRedirectCandidateUrl,
  isTransientRetryableError,
  selectGroqChatModels,
} from './discoveryAndErrors.ts';
import {
  callGroqJson,
  extractJsonFromLlmText,
  resetGroqClientCache,
} from '../services/groqClient.ts';
import type { Finding, SignalRun } from '../../shared/types.ts';

test('normalizeUrl strips tracking params, fragments, and trailing slashes', () => {
  const raw = 'https://WWW.Example.com/posts/ev-pune/?utm_source=x&fbclid=123&page=2#comments';
  assert.equal(normalizeUrl(raw), 'https://www.example.com/posts/ev-pune?page=2');
  assert.equal(extractDomain(raw), 'example.com');
});

test('jaccardSimilarity detects near-duplicate texts above 0.85', () => {
  const base =
    'Public EV chargers near Hinjewadi IT park in Pune frequently go offline during peak evening commute hours leaving commuters stranded.';
  const nearDup =
    'Public EV chargers near Hinjewadi IT park in Pune frequently go offline during peak evening commute hours leaving drivers stranded.';
  const diff =
    'Apartment RWA committees in Baner are drafting new guidelines for installing 7.4kW AC wallboxes in shared stilt parking.';

  const s1 = wordShingles(base, 5);
  const s2 = wordShingles(nearDup, 5);
  const s3 = wordShingles(diff, 5);

  assert.ok(jaccardSimilarity(s1, s2) > 0.7);
  assert.equal(jaccardSimilarity(s1, s1), 1);
  assert.ok(jaccardSimilarity(s1, s3) < 0.2);
});

test('collapseWhitespaceAndTruncate collapses whitespace and truncates cleanly', () => {
  const text = 'Hello   \n\t  world   test';
  assert.equal(collapseWhitespaceAndTruncate(text, 6000), 'Hello world test');
  const long = 'a '.repeat(4000);
  assert.ok(collapseWhitespaceAndTruncate(long, 6000).length <= 6000);
});

test('verifyEvidenceInText performs case- and whitespace-insensitive substring verification', () => {
  const pageText =
    'Many Tata Nexon EV owners in Kothrud reported that   DC fast chargers at Baner Road\nwere showing offline status for three consecutive days.';
  assert.equal(
    verifyEvidenceInText('dc fast chargers at baner road were showing offline status', pageText),
    true
  );
  assert.equal(
    verifyEvidenceInText('fast chargers are completely free across Pune', pageText),
    false
  );
  const over30Words = new Array(32).fill('word').join(' ');
  assert.equal(countWords(over30Words), 32);
  assert.equal(verifyEvidenceInText(over30Words, over30Words), false);
});

test('validateAnalysisResponse enforces schema, integer scores, and word limit', () => {
  const ok = validateAnalysisResponse(
    {
      category: 'pain_point',
      summary: 'Chargers frequently fail authentication.',
      who: 'Daily EV commuters in Pune',
      evidence: 'RFID card failed three times at the station',
      relevance: 85,
      urgency: 74,
      confidence: 80,
      reasoning: 'Specific firsthand report.',
      source_url: 'https://example.com/thread',
    },
    'https://fallback.com'
  );
  assert.equal(ok.valid, true);

  const badCat = validateAnalysisResponse(
    {
      category: 'unknown_type',
      summary: 'Test summary',
      who: 'Users',
      evidence: 'short',
      relevance: 50,
      urgency: 50,
      confidence: 50,
      reasoning: 'Ok',
    },
    'https://fallback.com'
  );
  assert.equal(badCat.valid, false);

  const outOfRange = validateAnalysisResponse(
    {
      category: 'demand_signal',
      summary: 'Test summary',
      who: 'Users',
      evidence: 'short quote',
      relevance: 120,
      urgency: 50,
      confidence: 50,
      reasoning: 'Ok',
    },
    'https://fallback.com'
  );
  assert.equal(outOfRange.valid, false);
});

test('computeRecencyScore scales 100 within 30 days linearly to 0 at 365 days', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  assert.equal(computeRecencyScore('2026-11-01T00:00:00Z', '2026-11-13T00:00:00Z', now), 100);
  assert.equal(computeRecencyScore('2025-11-01T00:00:00Z', '2026-11-13T00:00:00Z', now), 0);
  const mid = computeRecencyScore('2026-04-30T00:00:00Z', '2026-11-13T00:00:00Z', now);
  assert.ok(mid > 45 && mid < 55, `Expected ~50, got ${mid}`);
});

test('computeThemeRankings excludes unverified and irrelevant findings and computes exact weights', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  const findings: Finding[] = [
    {
      id: '1',
      category: 'pain_point',
      theme: 'Charger Uptime',
      summary: 'Broken chargers',
      who: 'Commuters',
      evidence: 'charger offline',
      evidence_verified: true,
      relevance: 80,
      urgency: 90,
      confidence: 70,
      reasoning: 'Direct report',
      source_url: 'https://a.com/1',
      domain: 'a.com',
      title: 'T1',
      crawl_date: '2026-11-10T00:00:00Z',
    },
    {
      id: '2',
      category: 'pain_point',
      theme: 'Charger Uptime',
      summary: 'Hallucinated finding',
      who: 'Commuters',
      evidence: 'not in text',
      evidence_verified: false,
      relevance: 100,
      urgency: 100,
      confidence: 100,
      reasoning: 'Should be excluded',
      source_url: 'https://b.com/2',
      domain: 'b.com',
      title: 'T2',
      crawl_date: '2026-11-10T00:00:00Z',
    },
    {
      id: '3',
      category: 'irrelevant',
      theme: 'Charger Uptime',
      summary: 'Ad page',
      who: 'unclear',
      evidence: '',
      evidence_verified: false,
      relevance: 10,
      urgency: 10,
      confidence: 10,
      reasoning: 'Promo',
      source_url: 'https://c.com/3',
      domain: 'c.com',
      title: 'T3',
      crawl_date: '2026-11-10T00:00:00Z',
    },
  ];

  // Total domains = 4. Verified domains in theme = 1 => frequency = 25.
  // relevance=80, urgency=90, confidence=70, recency=100.
  // Expected score = 0.30*25 + 0.25*80 + 0.20*90 + 0.15*70 + 0.10*100
  // = 7.5 + 20 + 18 + 10.5 + 10 = 66.0
  const ranked = computeThemeRankings(findings, 4, now);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].frequency, 25);
  assert.equal(ranked[0].theme_score, 66);
  assert.equal(ranked[0].verified_finding_count, 1);
  assert.equal(ranked[0].unverified_finding_count, 1);
});

test('export formatters generate valid CSV and Markdown note', () => {
  const sampleFinding: Finding = {
    id: 'f1',
    category: 'demand_signal',
    theme: 'Society Charging',
    summary: 'Residents request "shared, metered" sockets.',
    who: 'Apartment owners',
    evidence: 'RWA needs metered sockets',
    evidence_verified: true,
    relevance: 82,
    urgency: 70,
    confidence: 76,
    reasoning: 'Clear demand',
    source_url: 'https://example.com/1',
    domain: 'example.com',
    title: 'Society EV',
    crawl_date: '2026-11-12T00:00:00Z',
  };
  const csv = findingsToCsv([sampleFinding]);
  assert.ok(csv.includes('"Residents request ""shared, metered"" sockets."'));

  const run: SignalRun = {
    id: 'run-1',
    created_at: '2026-11-13T00:00:00Z',
    topic: 'EV Charging in Pune',
    keywords: 'charging, RWA',
    seed_urls: [],
    max_pages: 30,
    is_sample: false,
    status: 'completed',
    phase: 'done',
    progress: 100,
    warnings: [],
    stats: {
      discovered_count: 10,
      crawled_count: 1,
      skipped_count: 0,
      failed_count: 0,
      cleaned_count: 1,
      domains_count: 1,
      useful_signals_count: 1,
      irrelevant_count: 0,
      unverified_count: 0,
      themes_count: 1,
    },
    logs: [],
    findings: [sampleFinding],
    themes: [],
    briefs: [
      {
        theme: 'Society Charging',
        theme_score: 75,
        title: 'Turnkey RWA Metered Charging',
        what_is_happening: 'Apartment residents struggle to get RWA approval.',
        why_now: 'Two-wheeler and car EV adoption is surging.',
        business_angle: 'Pre-approved society sub-metering service.',
        evidence: [{ excerpt: 'RWA needs metered sockets', source_url: 'https://example.com/1' }],
        next_step: 'Interview 10 RWA treasurers in Baner and Wakad.',
        caveats: 'Limited to public forum mentions.',
      },
    ],
  };
  const md = generateFindingsMarkdownNote(run);
  assert.ok(md.includes('# Market Signal Findings Note: EV Charging in Pune'));
  assert.ok(md.includes('Turnkey RWA Metered Charging'));
  assert.ok(md.includes('https://example.com/1'));
});

test('discoveryAndErrors classifies hard quota vs transient errors and parses error JSON', () => {
  const quotaErr = new Error(
    '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing details.","status":"RESOURCE_EXHAUSTED"}}'
  );
  assert.equal(isHardQuotaOrAuthError(quotaErr), true);
  assert.equal(isTransientRetryableError(quotaErr), false);
  assert.equal(
    formatGeminiError(quotaErr),
    '429 (RESOURCE_EXHAUSTED) You exceeded your current quota, please check your plan and billing details.'
  );

  const transient503 = new Error('503 UNAVAILABLE overloaded');
  assert.equal(isHardQuotaOrAuthError(transient503), false);
  assert.equal(isTransientRetryableError(transient503), true);
});

test('discoveryAndErrors extracts URLs from DuckDuckGo Lite and Bing News RSS', () => {
  const ddgHtml = `
    <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpune-ev&amp;rut=1">Result 1</a>
    <a href="https://duckduckgo.com/settings">Settings</a>
    <a href="https://forum.example.org/thread-42">Direct link</a>
  `;
  const ddgUrls = extractDuckDuckGoLiteUrls(ddgHtml);
  assert.deepEqual(ddgUrls, ['https://example.com/pune-ev', 'https://forum.example.org/thread-42']);

  const bingXml = `
    <rss><channel>
      <link>https://www.bing.com/news/search?q=ev</link>
      <item><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=https%3A%2F%2Fnews.example.in%2Fev-pune&amp;c=1</link></item>
    </channel></rss>
  `;
  assert.deepEqual(extractBingNewsRssUrls(bingXml), ['https://news.example.in/ev-pune']);

  assert.equal(isRedirectCandidateUrl('https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc'), true);
  assert.equal(isRedirectCandidateUrl('https://timesofindia.indiatimes.com/city/pune/story.cms'), false);

  const q0 = buildConciseSearchQueries('EV charging demand and complaints in Pune', 'Pune, EV charging, fast charger, RWA, pricing', 0);
  const q1 = buildConciseSearchQueries('EV charging demand and complaints in Pune', 'Pune, EV charging, fast charger, RWA, pricing', 1);
  const q2 = buildConciseSearchQueries('EV charging demand and complaints in Pune', 'Pune, EV charging, fast charger, RWA, pricing', 2);
  assert.equal(q0.newsQuery, 'EV charging Pune');
  assert.equal(q0.newsQueryAlt, 'EV charging Pune fast charger');
  assert.equal(q1.webQuery, 'EV charging Pune reddit forum');
  assert.equal(q2.newsQuery, 'EV charging Pune RWA');

  const qFreelance = buildConciseSearchQueries(
    'What do freelancers complain about when using invoicing and payment tools?',
    '',
    0
  );
  assert.equal(qFreelance.newsQuery, 'freelancers invoicing payment tools');
});

test('extractEvidenceContext returns surrounding context around matched quote', () => {
  const pageText =
    'Residents across Baner and Wakad societies met on Sunday to discuss charging safety. One treasurer noted that "three-phase meters require separate MSEDCL load sanction" before wallboxes can be installed cleanly in stilt parking.';
  const ctx = extractEvidenceContext(
    'three-phase meters require separate MSEDCL load sanction',
    pageText,
    40
  );
  assert.ok(ctx);
  assert.equal(ctx.match, 'three-phase meters require separate MSEDCL load sanction');
  assert.ok(ctx.before.startsWith('…'));
  assert.ok(ctx.after.endsWith('…'));
  assert.equal(extractEvidenceContext('nonexistent sentence in page', pageText), undefined);
});

test('computeThemeRankings supports normalized custom formula weights', () => {
  const now = new Date('2026-11-13T00:00:00Z');
  const findings: Finding[] = [
    {
      id: 'a',
      category: 'pain_point',
      theme: 'High Urgency Theme',
      summary: 'Urgent outage',
      who: 'Drivers',
      evidence: 'station down',
      evidence_verified: true,
      relevance: 60,
      urgency: 100,
      confidence: 60,
      reasoning: 'Urgent',
      source_url: 'https://a.com/1',
      domain: 'a.com',
      title: 'A',
      crawl_date: '2026-11-10T00:00:00Z',
    },
    {
      id: 'b',
      category: 'demand_signal',
      theme: 'High Frequency Theme',
      summary: 'Frequent mention',
      who: 'Drivers',
      evidence: 'more chargers',
      evidence_verified: true,
      relevance: 80,
      urgency: 40,
      confidence: 80,
      reasoning: 'Frequent',
      source_url: 'https://b.com/1',
      domain: 'b.com',
      title: 'B1',
      crawl_date: '2026-11-10T00:00:00Z',
    },
    {
      id: 'c',
      category: 'demand_signal',
      theme: 'High Frequency Theme',
      summary: 'Another mention',
      who: 'Drivers',
      evidence: 'queue length',
      evidence_verified: true,
      relevance: 80,
      urgency: 40,
      confidence: 80,
      reasoning: 'Frequent',
      source_url: 'https://c.com/1',
      domain: 'c.com',
      title: 'C1',
      crawl_date: '2026-11-10T00:00:00Z',
    },
  ];

  const norm = normalizeFormulaWeights({
    frequency: 0,
    relevance: 0,
    urgency: 100,
    confidence: 0,
    recency: 0,
  });
  assert.equal(norm.urgency, 1);

  const urgencyFirst = computeThemeRankings(findings, 3, now, {
    frequency: 0,
    relevance: 0,
    urgency: 1,
    confidence: 0,
    recency: 0,
  });
  assert.equal(urgencyFirst[0].theme, 'High Urgency Theme');
  assert.equal(urgencyFirst[0].theme_score, 100);
});

test('extractJsonFromLlmText parses plain, code-fenced, think-tagged, and prose-wrapped JSON cleanly', () => {
  const plain = extractJsonFromLlmText('{"category":"pain_point","relevance":80}') as Record<string, unknown>;
  assert.equal(plain.category, 'pain_point');

  const fenced = extractJsonFromLlmText('```json\n{"assignments":[{"id":"1","theme":"Pricing"}]}\n```') as {
    assignments: Array<{ id: string; theme: string }>;
  };
  assert.equal(fenced.assignments[0].theme, 'Pricing');

  const withThink = extractJsonFromLlmText(
    '<think>Let me analyze the page carefully...</think>\nHere is the JSON:\n{"ok":true,"score":91}\nDone.'
  ) as { ok: boolean; score: number };
  assert.equal(withThink.ok, true);
  assert.equal(withThink.score, 91);

  assert.equal(isQuotaOrAuthMessage('429 (rate_limit_exceeded) Rate limit reached on tokens per minute'), true);
});

test('selectGroqChatModels filters non-chat models and distinguishes 404 model errors from account auth errors', () => {
  const selected = selectGroqChatModels([
    'whisper-large-v3-turbo',
    'meta-llama/llama-guard-4-12b',
    'playai-tts',
    'llama-3.1-8b-instant',
    'openai/gpt-oss-120b',
    'custom-active-chat-model',
  ]);
  assert.deepEqual(selected, [
    'openai/gpt-oss-120b',
    'llama-3.1-8b-instant',
    'custom-active-chat-model',
  ]);

  const model404 = new Error(
    '404 (model_not_found) The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.'
  );
  assert.equal(isModelUnavailableError(model404), true);
  assert.equal(isAccountAuthOrBillingError(model404), false);

  const auth401 = new Error('401 (invalid_api_key) Invalid API Key');
  assert.equal(isModelUnavailableError(auth401), false);
  assert.equal(isAccountAuthOrBillingError(auth401), true);
});

test('callGroqJson resolves /models, falls back cleanly past 404 model_not_found, and caches working model', async () => {
  const prevKey = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'gsk_test_mock_key_123456';
  resetGroqClientCache();

  const calledModels: string[] = [];
  let modelsEndpointCalls = 0;

  const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.endsWith('/models')) {
      modelsEndpointCalls++;
      return new Response(
        JSON.stringify({
          data: [
            { id: 'whisper-large-v3', active: true },
            { id: 'llama-3.3-70b-versatile', active: true },
            { id: 'llama-3.1-8b-instant', active: true },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = JSON.parse(String(init?.body ?? '{}')) as {
      model: string;
      response_format?: unknown;
    };
    calledModels.push(body.model);

    if (body.model === 'llama-3.3-70b-versatile') {
      return new Response(
        JSON.stringify({
          error: {
            message: 'The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.',
            type: 'invalid_request_error',
            code: 'model_not_found',
          },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (body.model === 'llama-3.1-8b-instant' && body.response_format) {
      return new Response(
        JSON.stringify({
          error: {
            message: 'response_format json_object is not supported',
            type: 'invalid_request_error',
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"category":"demand_signal","relevance":88}' } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    const first = await callGroqJson<{ category: string; relevance: number }>(
      'sys',
      'user',
      500,
      mockFetch
    );
    assert.equal(first.model, 'llama-3.1-8b-instant');
    assert.equal(first.data.category, 'demand_signal');
    assert.deepEqual(calledModels, [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'llama-3.1-8b-instant',
    ]);

    const second = await callGroqJson<{ category: string; relevance: number }>(
      'sys',
      'user2',
      500,
      mockFetch
    );
    assert.equal(second.model, 'llama-3.1-8b-instant');
    assert.equal(modelsEndpointCalls, 1);
    assert.deepEqual(calledModels, [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'llama-3.1-8b-instant',
      'llama-3.1-8b-instant',
      'llama-3.1-8b-instant',
    ]);
  } finally {
    resetGroqClientCache();
    if (prevKey === undefined) {
      delete process.env.GROQ_API_KEY;
    } else {
      process.env.GROQ_API_KEY = prevKey;
    }
  }
});



