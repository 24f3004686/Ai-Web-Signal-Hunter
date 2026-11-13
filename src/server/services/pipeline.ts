import { EventEmitter } from 'node:events';
import type {
  CrawlLogEntry,
  CrawledPage,
  Finding,
  LlmProvider,
  PipelinePhase,
  SignalRun,
} from '../../shared/types.ts';
import { extractDomain, normalizeUrl } from '../logic/urlAndText.ts';
import {
  formatGeminiError,
  isQuotaOrAuthMessage,
  isRedirectCandidateUrl,
} from '../logic/discoveryAndErrors.ts';
import { computeThemeRankings } from '../logic/scoring.ts';
import { PoliteCrawler, resolveRedirectUrl } from './crawler.ts';
import { cleanAndDeduplicatePages } from './cleaner.ts';
import {
  analyzePageWithGemini,
  discoverUrlsWithSearch,
  generateOpportunityBrief,
  groupFindingsIntoThemes,
} from './geminiClient.ts';
import { hasGeminiApiKey, hasGroqApiKey } from './groqClient.ts';
import { saveRun } from './storage.ts';

const MAX_PAGES_PER_DOMAIN = 8;
const MIN_TARGET_PAGES = 25;
const MIN_TARGET_DOMAINS = 3;

export interface StartRunInput {
  topic: string;
  keywords: string;
  seedUrls: string[];
  maxPages: number;
  provider?: LlmProvider;
}

class PipelineManager {
  private activeRuns = new Map<string, { run: SignalRun; emitter: EventEmitter; cancelled: boolean }>();

  getRunState(id: string): SignalRun | undefined {
    return this.activeRuns.get(id)?.run;
  }

  getEmitter(id: string): EventEmitter | undefined {
    return this.activeRuns.get(id)?.emitter;
  }

  cancelRun(id: string): boolean {
    const entry = this.activeRuns.get(id);
    if (!entry) return false;
    entry.cancelled = true;
    return true;
  }

  async startRun(input: StartRunInput): Promise<SignalRun> {
    const id = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const maxPages = Math.max(25, Math.min(40, Math.round(input.maxPages || 30)));

    const run: SignalRun = {
      id,
      created_at: new Date().toISOString(),
      topic: input.topic.trim(),
      keywords: input.keywords.trim(),
      seed_urls: input.seedUrls,
      max_pages: maxPages,
      llm_provider: input.provider ?? 'auto',
      is_sample: false,
      status: 'running',
      phase: 'discover',
      progress: 2,
      warnings: [],
      stats: {
        discovered_count: 0,
        crawled_count: 0,
        skipped_count: 0,
        failed_count: 0,
        cleaned_count: 0,
        domains_count: 0,
        useful_signals_count: 0,
        irrelevant_count: 0,
        unverified_count: 0,
        themes_count: 0,
      },
      logs: [],
      findings: [],
      themes: [],
      briefs: [],
    };

    const emitter = new EventEmitter();
    this.activeRuns.set(id, { run, emitter, cancelled: false });
    await saveRun(run);

    // Run pipeline asynchronously so POST /api/run returns immediately with runId
    this.executePipeline(id).catch((err) => {
      console.error('Pipeline uncaught error:', err);
    });

    return run;
  }

  private emitUpdate(id: string, eventName = 'update') {
    const entry = this.activeRuns.get(id);
    if (!entry) return;
    entry.emitter.emit(eventName, entry.run);
  }

  private pushLog(
    id: string,
    phase: PipelinePhase,
    status: CrawlLogEntry['status'],
    url: string,
    reason?: string
  ) {
    const entry = this.activeRuns.get(id);
    if (!entry) return;
    const logItem: CrawlLogEntry = {
      id: `log-${entry.run.logs.length + 1}`,
      timestamp: new Date().toISOString(),
      url,
      domain: url.startsWith('http') ? extractDomain(url) : 'pipeline',
      status,
      reason,
      phase,
    };
    entry.run.logs.push(logItem);
    if (entry.run.logs.length > 400) {
      entry.run.logs = entry.run.logs.slice(-400);
    }
    this.emitUpdate(id, 'update');
  }

  private async executePipeline(id: string): Promise<void> {
    const entry = this.activeRuns.get(id);
    if (!entry) return;
    const { run } = entry;
    const isCancelled = () => entry.cancelled;

    try {
      // 1. DISCOVER
      const provider: LlmProvider = run.llm_provider ?? 'auto';
      let useGroqForLlm =
        provider === 'groq' || (provider === 'auto' && !hasGeminiApiKey() && hasGroqApiKey());
      let skipGeminiSearch = useGroqForLlm || !hasGeminiApiKey();

      run.phase = 'discover';
      run.progress = 5;
      this.pushLog(
        id,
        'discover',
        'info',
        skipGeminiSearch ? 'public-search' : 'gemini-search',
        skipGeminiSearch
          ? 'Starting URL discovery via public web search'
          : 'Starting URL discovery via Gemini Search grounding'
      );

      const candidateMap = new Map<string, string>(); // normalizedUrl -> finalUrl
      const domainCounts = new Map<string, number>();

      const addCandidate = (resolvedUrl: string) => {
        if (!resolvedUrl.startsWith('http')) return;
        const norm = normalizeUrl(resolvedUrl);
        if (candidateMap.has(norm)) return;
        const dom = extractDomain(norm);
        if (dom === 'unknown' || dom.includes('google.com') || dom.includes('vertexaisearch.cloud.google.com')) {
          return;
        }
        const currentDomCount = domainCounts.get(dom) ?? 0;
        if (currentDomCount >= MAX_PAGES_PER_DOMAIN) return;

        candidateMap.set(norm, norm);
        domainCounts.set(dom, currentDomCount + 1);
        run.stats.discovered_count = candidateMap.size;
      };

      // Seed URLs first
      for (const seed of run.seed_urls) {
        if (isCancelled()) break;
        const resolved = await resolveRedirectUrl(seed);
        addCandidate(resolved);
        this.pushLog(id, 'discover', 'discovered', resolved, 'User-provided seed URL');
      }

      const queryVariations = [
        'forum threads, Reddit discussions, community complaints, product reviews',
        'blog posts, user problems, unmet needs, frustrations',
        'pricing complaints, alternatives, feature requests, comparison reviews',
        'news reports, local discussions, buyer feedback, troubleshooting',
      ];

      // Target slightly above max_pages to buffer for skipped/short pages
      const desiredCandidates = Math.min(run.max_pages + 12, 52);
      let lastDiscoveryError = '';
      let addedFallbackWarning = false;

      for (let i = 0; i < queryVariations.length; i++) {
        if (isCancelled()) break;
        if (candidateMap.size >= desiredCandidates && domainCounts.size >= MIN_TARGET_DOMAINS) {
          break;
        }
        this.pushLog(
          id,
          'discover',
          'info',
          skipGeminiSearch ? 'public-search' : 'gemini-search',
          `Search round ${i + 1}: ${queryVariations[i]}`
        );
        try {
          const discovery = await discoverUrlsWithSearch(run.topic, run.keywords, queryVariations[i], {
            roundIndex: i,
            skipGeminiSearch,
          });
          if (discovery.hardQuotaFailed) {
            skipGeminiSearch = true;
          }
          if (discovery.source === 'public-search-fallback') {
            if (discovery.geminiError) {
              lastDiscoveryError = discovery.geminiError;
            }
            if (!addedFallbackWarning) {
              this.pushLog(
                id,
                'discover',
                'info',
                'public-search',
                discovery.geminiError
                  ? `Gemini Search unavailable (${discovery.geminiError}); using public web search fallback`
                  : 'Using public web search fallback'
              );
              if (discovery.geminiError) {
                addedFallbackWarning = true;
                run.warnings.push(
                  `Gemini Search Grounding returned an error (${discovery.geminiError}). Discovered public URLs using web search fallback instead.`
                );
              }
            }
          } else if (discovery.modelUsed && discovery.modelUsed !== 'gemini-4-hydrogen') {
            this.pushLog(id, 'discover', 'info', 'gemini-search', `Search round ${i + 1} served via ${discovery.modelUsed}`);
          }

          // Resolve redirects in small concurrent batches of 5 only for redirector links
          const rawFound = discovery.urls;
          for (let j = 0; j < rawFound.length; j += 5) {
            if (isCancelled()) break;
            const batch = rawFound.slice(j, j + 5);
            const resolvedBatch = await Promise.all(
              batch.map((u) => (isRedirectCandidateUrl(u) ? resolveRedirectUrl(u) : Promise.resolve(u)))
            );
            for (const finalUrl of resolvedBatch) {
              const before = candidateMap.size;
              addCandidate(finalUrl);
              if (candidateMap.size > before) {
                this.pushLog(id, 'discover', 'discovered', finalUrl, `Round ${i + 1} search hit`);
              }
            }
          }
        } catch (err) {
          const msg = formatGeminiError(err);
          lastDiscoveryError = msg;
          this.pushLog(id, 'discover', 'failed', 'gemini-search', `Search round ${i + 1} error: ${msg}`);
        }
        run.progress = Math.min(20, 5 + (i + 1) * 4);
        this.emitUpdate(id);
      }

      const candidates = Array.from(candidateMap.values());
      if (candidates.length === 0) {
        if (lastDiscoveryError && isQuotaOrAuthMessage(lastDiscoveryError)) {
          throw new Error(
            `Gemini API quota/key error during discovery (${lastDiscoveryError}). Update or upgrade your key in Settings > Secrets, or click "Load sample run" to inspect the dashboard.`
          );
        }
        throw new Error(
          lastDiscoveryError
            ? `No candidate URLs could be discovered (${lastDiscoveryError}). Try adding seed URLs or checking your Gemini API key.`
            : 'No candidate URLs could be discovered for this topic. Try adding broader keywords or seed URLs.'
        );
      }

      if (candidates.length < MIN_TARGET_PAGES || domainCounts.size < MIN_TARGET_DOMAINS) {
        run.warnings.push(
          `Discovery found ${candidates.length} candidate URLs across ${domainCounts.size} domains (target: >=${MIN_TARGET_PAGES} pages across >=${MIN_TARGET_DOMAINS} domains). Continuing with available pages.`
        );
      }

      // 2. CRAWL
      run.phase = 'crawl';
      run.progress = 22;
      this.emitUpdate(id);

      const crawler = new PoliteCrawler();
      let processedCrawlCount = 0;

      const rawPages = await crawler.crawlBatch(
        candidates,
        run.max_pages,
        (res) => {
          processedCrawlCount++;
          if (res.status === 'crawled') {
            run.stats.crawled_count++;
            this.pushLog(id, 'crawl', 'crawled', res.finalUrl, 'Fetched HTML');
          } else if (res.status === 'skipped') {
            run.stats.skipped_count++;
            this.pushLog(id, 'crawl', 'skipped', res.finalUrl, res.reason);
          } else {
            run.stats.failed_count++;
            this.pushLog(id, 'crawl', 'failed', res.finalUrl, res.reason);
          }
          run.progress = Math.min(55, 22 + Math.round((processedCrawlCount / Math.max(1, candidates.length)) * 33));
          this.emitUpdate(id);
        },
        isCancelled
      );

      if (isCancelled()) {
        run.status = 'failed';
        run.phase = 'error';
        run.error = 'Crawl cancelled by user.';
        await saveRun(run);
        this.emitUpdate(id, 'complete');
        return;
      }

      // 3. CLEAN
      run.phase = 'clean';
      run.progress = 58;
      this.emitUpdate(id);

      const cleanResult = cleanAndDeduplicatePages(rawPages);
      for (const dropped of cleanResult.dropped) {
        run.stats.skipped_count++;
        this.pushLog(id, 'clean', 'skipped', dropped.url, dropped.reason);
      }

      const cleanedPages: CrawledPage[] = cleanResult.pages.slice(0, run.max_pages);
      run.stats.cleaned_count = cleanedPages.length;
      const crawledDomains = new Set(cleanedPages.map((p) => p.domain));
      run.stats.domains_count = crawledDomains.size;

      if (cleanedPages.length < MIN_TARGET_PAGES || crawledDomains.size < MIN_TARGET_DOMAINS) {
        const msg = `Crawled & cleaned ${cleanedPages.length} usable pages across ${crawledDomains.size} domains (target: >=${MIN_TARGET_PAGES} pages across >=${MIN_TARGET_DOMAINS} domains).`;
        if (!run.warnings.includes(msg)) {
          run.warnings.push(msg);
        }
      }

      if (cleanedPages.length === 0) {
        throw new Error('All crawled pages were skipped, blocked, or under 300 characters after cleaning.');
      }

      // 4. ANALYZE (max 2 concurrent LLM calls)
      run.phase = 'analyze';
      run.progress = 62;
      this.emitUpdate(id);

      const findings: Finding[] = new Array(cleanedPages.length);
      let nextIndex = 0;
      let completedAnalyze = 0;
      let loggedGroqFallback = false;

      const onFallbackToGroq = (reason: string) => {
        useGroqForLlm = true;
        if (!loggedGroqFallback) {
          loggedGroqFallback = true;
          this.pushLog(
            id,
            'analyze',
            'info',
            'groq-fallback',
            `Gemini hit rate/quota limits (${reason}); switched analysis to Groq (auto-selecting available model)`
          );
          run.warnings.push(
            `Gemini hit rate/quota limits (${reason}). Automatically switched page analysis, theme grouping, and briefs to Groq.`
          );
        }
      };

      const worker = async () => {
        while (true) {
          if (isCancelled()) return;
          const idx = nextIndex++;
          if (idx >= cleanedPages.length) return;
          const page = cleanedPages[idx];
          const finding = await analyzePageWithGemini(page, run.topic, run.keywords, `sig-${idx + 1}`, {
            provider,
            useGroqOnly: useGroqForLlm,
            onFallbackToGroq,
          });
          findings[idx] = finding;
          completedAnalyze++;

          if (finding.error) {
            this.pushLog(id, 'analyze', 'failed', page.url, `Analysis error: ${finding.error}`);
          } else if (finding.category === 'irrelevant') {
            this.pushLog(id, 'analyze', 'analyzed', page.url, 'Classified as irrelevant');
          } else if (!finding.evidence_verified) {
            this.pushLog(id, 'analyze', 'analyzed', page.url, `${finding.category} (unverified evidence)`);
          } else {
            this.pushLog(id, 'analyze', 'analyzed', page.url, `${finding.category} (verified)`);
          }

          run.progress = Math.min(84, 62 + Math.round((completedAnalyze / cleanedPages.length) * 22));
          this.emitUpdate(id);
        }
      };

      await Promise.all([worker(), worker()]);
      run.findings = findings.filter(Boolean);

      if (run.findings.length > 0 && run.findings.every((f) => Boolean(f.error))) {
        const sampleErr = run.findings.find((f) => f.error)?.error || 'Unknown analysis error';
        if (isQuotaOrAuthMessage(sampleErr)) {
          throw new Error(
            `LLM API quota/key error during page analysis (${sampleErr}). Configure GEMINI_API_KEY or GROQ_API_KEY in AI Studio Secrets, or use "Load sample run".`
          );
        }
        throw new Error(`All ${run.findings.length} pages failed LLM analysis (${sampleErr}).`);
      }

      run.stats.useful_signals_count = run.findings.filter((f) => f.category !== 'irrelevant').length;
      run.stats.irrelevant_count = run.findings.filter((f) => f.category === 'irrelevant').length;
      run.stats.unverified_count = run.findings.filter(
        (f) => f.category !== 'irrelevant' && !f.evidence_verified
      ).length;

      // 5. GROUP
      run.phase = 'group';
      run.progress = 86;
      this.pushLog(
        id,
        'group',
        'info',
        useGroqForLlm ? 'groq-grouping' : 'gemini-grouping',
        'Grouping useful signals into 4-10 themes'
      );

      const themeMap = await groupFindingsIntoThemes(run.findings, run.topic, {
        provider,
        useGroqOnly: useGroqForLlm,
      });
      for (const f of run.findings) {
        if (f.category !== 'irrelevant') {
          f.theme = themeMap.get(f.id) ?? 'General Signals';
        }
      }

      // 6. RANK
      run.phase = 'rank';
      run.progress = 90;
      this.pushLog(id, 'rank', 'info', 'ranking-engine', 'Computing transparent theme scores from verified findings');
      run.themes = computeThemeRankings(run.findings, Math.max(1, run.stats.domains_count));
      run.stats.themes_count = run.themes.filter((t) => t.verified_finding_count > 0).length;

      // 7. BRIEFS (Top 5 themes with verified findings)
      run.phase = 'briefs';
      run.progress = 93;
      const topThemes = run.themes.filter((t) => t.verified_finding_count > 0).slice(0, 5);
      this.pushLog(
        id,
        'briefs',
        'info',
        useGroqForLlm ? 'groq-briefs' : 'gemini-briefs',
        `Generating opportunity briefs for top ${topThemes.length} themes`
      );

      const briefs = [];
      for (let i = 0; i < topThemes.length; i++) {
        if (isCancelled()) break;
        const themeObj = topThemes[i];
        const themeFindings = run.findings.filter(
          (f) => f.theme === themeObj.theme && f.category !== 'irrelevant' && f.evidence_verified
        );
        const brief = await generateOpportunityBrief(
          themeObj.theme,
          themeObj.theme_score,
          themeFindings,
          run.topic,
          { provider, useGroqOnly: useGroqForLlm }
        );
        briefs.push(brief);
        run.progress = Math.min(98, 93 + i + 1);
        this.emitUpdate(id);
      }
      run.briefs = briefs;

      // 8. PERSIST
      run.phase = 'done';
      run.status = 'completed';
      run.progress = 100;
      this.pushLog(id, 'done', 'info', 'storage', `Run persisted (${run.stats.useful_signals_count} signals, ${run.briefs.length} briefs)`);
      await saveRun(run);
      this.emitUpdate(id, 'complete');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      run.status = 'failed';
      run.phase = 'error';
      run.error = msg;
      this.pushLog(id, 'error', 'failed', 'pipeline', msg);
      await saveRun(run);
      this.emitUpdate(id, 'complete');
    }
  }
}

export const pipelineManager = new PipelineManager();
