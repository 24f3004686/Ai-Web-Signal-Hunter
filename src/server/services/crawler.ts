import robotsParser, { type Robot } from 'robots-parser';
import { extractDomain, normalizeUrl } from '../logic/urlAndText.ts';
import type { RawFetchedPage } from './cleaner.ts';

export const CRAWLER_USER_AGENT = 'SignalHunterBot/1.0 (student assignment)';
const REQUEST_TIMEOUT_MS = 10_000;
const SAME_DOMAIN_DELAY_MS = 1_500;
const MAX_CONCURRENT_DOMAINS = 3;

export interface CrawlCandidateResult {
  status: 'crawled' | 'skipped' | 'failed';
  url: string;
  finalUrl: string;
  domain: string;
  reason?: string;
  page?: RawFetchedPage;
}

const PAYWALL_OR_CAPTCHA_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /verify you are human/i, reason: 'CAPTCHA challenge detected' },
  { pattern: /attention required!\s*\|\s*cloudflare/i, reason: 'Cloudflare bot challenge' },
  { pattern: /cf-chl-bypass|g-recaptcha|h-captcha|px-captcha/i, reason: 'CAPTCHA widget detected' },
  { pattern: /this article is for subscribers only/i, reason: 'Paywall detected' },
  { pattern: /subscribe to continue reading|subscription required to read/i, reason: 'Paywall detected' },
  { pattern: /sign in to continue|log in to view this page|please log in to continue/i, reason: 'Login wall detected' },
  { pattern: /you must be logged in to/i, reason: 'Login required' },
  { pattern: /enable javascript and cookies to continue/i, reason: 'Bot protection interstitial' },
];

function detectBlockedContent(html: string): string | null {
  // Strip tags lightly for text-length context
  const textLen = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
  for (const check of PAYWALL_OR_CAPTCHA_PATTERNS) {
    if (check.pattern.test(html)) {
      // Only treat login/paywall phrases as blocks if the page itself is short or explicitly gated
      if (check.reason.includes('CAPTCHA') || check.reason.includes('Cloudflare') || check.reason.includes('interstitial')) {
        return check.reason;
      }
      if (textLen < 3500) {
        return check.reason;
      }
    }
  }
  if (/<input[^>]+type=["']password["']/i.test(html) && textLen < 1800) {
    return 'Login form wall detected';
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': CRAWLER_USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export class PoliteCrawler {
  private robotsCache = new Map<string, Robot | null>();
  private domainLastRequest = new Map<string, number>();
  private domainLocks = new Map<string, Promise<void>>();

  private async getRobots(origin: string): Promise<Robot | null> {
    if (this.robotsCache.has(origin)) {
      return this.robotsCache.get(origin) ?? null;
    }
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const res = await fetchWithTimeout(robotsUrl, 5000);
      if (!res.ok) {
        this.robotsCache.set(origin, null);
        return null;
      }
      const text = await res.text();
      const parsed = robotsParser(robotsUrl, text);
      this.robotsCache.set(origin, parsed);
      return parsed;
    } catch {
      this.robotsCache.set(origin, null);
      return null;
    }
  }

  private async waitForDomainTurn(domain: string): Promise<void> {
    const prevLock = this.domainLocks.get(domain) ?? Promise.resolve();
    let release!: () => void;
    const nextLock = new Promise<void>((res) => {
      release = res;
    });
    this.domainLocks.set(domain, prevLock.then(() => nextLock));

    await prevLock;
    try {
      const last = this.domainLastRequest.get(domain) ?? 0;
      const elapsed = Date.now() - last;
      if (elapsed < SAME_DOMAIN_DELAY_MS) {
        await sleep(SAME_DOMAIN_DELAY_MS - elapsed);
      }
      this.domainLastRequest.set(domain, Date.now());
    } finally {
      release();
    }
  }

  async crawlOne(rawUrl: string): Promise<CrawlCandidateResult> {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return {
        status: 'failed',
        url: rawUrl,
        finalUrl: rawUrl,
        domain: 'unknown',
        reason: 'Invalid URL',
      };
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return {
        status: 'skipped',
        url: rawUrl,
        finalUrl: rawUrl,
        domain: extractDomain(rawUrl),
        reason: `Unsupported protocol (${parsedUrl.protocol})`,
      };
    }

    const domain = extractDomain(rawUrl);
    const origin = parsedUrl.origin;

    try {
      const robots = await this.getRobots(origin);
      if (robots && robots.isDisallowed(rawUrl, CRAWLER_USER_AGENT)) {
        return {
          status: 'skipped',
          url: rawUrl,
          finalUrl: rawUrl,
          domain,
          reason: 'Disallowed by robots.txt',
        };
      }

      await this.waitForDomainTurn(domain);

      const res = await fetchWithTimeout(rawUrl, REQUEST_TIMEOUT_MS);
      const finalUrl = res.url || rawUrl;
      const finalDomain = extractDomain(finalUrl);

      if (res.status === 401 || res.status === 403) {
        return {
          status: 'skipped',
          url: rawUrl,
          finalUrl,
          domain: finalDomain,
          reason: `Access restricted (HTTP ${res.status})`,
        };
      }
      if (res.status === 429) {
        return {
          status: 'failed',
          url: rawUrl,
          finalUrl,
          domain: finalDomain,
          reason: 'Rate limited (HTTP 429)',
        };
      }
      if (!res.ok) {
        return {
          status: 'failed',
          url: rawUrl,
          finalUrl,
          domain: finalDomain,
          reason: `HTTP error ${res.status}`,
        };
      }

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        return {
          status: 'skipped',
          url: rawUrl,
          finalUrl,
          domain: finalDomain,
          reason: `Non-HTML content-type (${contentType || 'unknown'})`,
        };
      }

      // Guard against huge responses (> 3MB)
      const contentLength = Number(res.headers.get('content-length') || '0');
      if (contentLength > 3 * 1024 * 1024) {
        return {
          status: 'skipped',
          url: rawUrl,
          finalUrl,
          domain: finalDomain,
          reason: 'Page exceeds 3MB size limit',
        };
      }

      const html = await res.text();
      const blockedReason = detectBlockedContent(html);
      if (blockedReason) {
        return {
          status: 'skipped',
          url: rawUrl,
          finalUrl,
          domain: finalDomain,
          reason: blockedReason,
        };
      }

      return {
        status: 'crawled',
        url: rawUrl,
        finalUrl: normalizeUrl(finalUrl),
        domain: finalDomain,
        page: {
          url: finalUrl,
          html,
          crawl_date: new Date().toISOString(),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      return {
        status: 'failed',
        url: rawUrl,
        finalUrl: rawUrl,
        domain,
        reason: isAbort ? 'Request timed out (10s)' : message.slice(0, 120),
      };
    }
  }

  async crawlBatch(
    urls: string[],
    targetMaxPages: number,
    onResult: (result: CrawlCandidateResult) => void,
    isCancelled: () => boolean
  ): Promise<RawFetchedPage[]> {
    // Group URLs into domain queues so we run max 3 concurrent domains at once
    const byDomain = new Map<string, string[]>();
    for (const u of urls) {
      const dom = extractDomain(u);
      const list = byDomain.get(dom) ?? [];
      list.push(u);
      byDomain.set(dom, list);
    }

    // Interleave domains in round-robin queue for diversity
    const domainQueues = Array.from(byDomain.entries());
    const activeDomains = new Set<string>();
    const results: RawFetchedPage[] = [];
    let crawledSuccessCount = 0;

    // Helper to pick next URL from a domain not currently active
    const pickNext = (): { domain: string; url: string } | null => {
      for (const [dom, queue] of domainQueues) {
        if (!activeDomains.has(dom) && queue.length > 0) {
          const url = queue.shift()!;
          return { domain: dom, url };
        }
      }
      return null;
    };

    const hasRemaining = (): boolean => domainQueues.some(([, q]) => q.length > 0);

    await new Promise<void>((resolve) => {
      let running = 0;

      const schedule = () => {
        if (isCancelled() || crawledSuccessCount >= targetMaxPages) {
          if (running === 0) resolve();
          return;
        }

        while (running < MAX_CONCURRENT_DOMAINS) {
          if (crawledSuccessCount >= targetMaxPages || isCancelled()) break;
          const next = pickNext();
          if (!next) break;

          activeDomains.add(next.domain);
          running++;

          this.crawlOne(next.url)
            .then((res) => {
              if (res.status === 'crawled' && res.page) {
                crawledSuccessCount++;
                results.push(res.page);
              }
              onResult(res);
            })
            .finally(() => {
              activeDomains.delete(next.domain);
              running--;
              if (running === 0 && (!hasRemaining() || crawledSuccessCount >= targetMaxPages || isCancelled())) {
                resolve();
              } else {
                schedule();
              }
            });
        }

        if (running === 0) {
          resolve();
        }
      };

      schedule();
    });

    return results;
  }
}

export async function resolveRedirectUrl(rawUrl: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(rawUrl, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': CRAWLER_USER_AGENT },
      });
      if (res.url && res.url.startsWith('http')) {
        return res.url;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Fallback to GET if HEAD is blocked
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      try {
        const res = await fetch(rawUrl, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: { 'User-Agent': CRAWLER_USER_AGENT },
        });
        if (res.body) {
          await res.body.cancel().catch(() => {});
        }
        if (res.url && res.url.startsWith('http')) {
          return res.url;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return rawUrl;
    }
  }
  return rawUrl;
}
