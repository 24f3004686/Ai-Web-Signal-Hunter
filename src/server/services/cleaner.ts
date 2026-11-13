import * as cheerio from 'cheerio';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import {
  collapseWhitespaceAndTruncate,
  extractDomain,
  jaccardSimilarity,
  normalizeUrl,
  wordShingles,
} from '../logic/urlAndText.ts';
import type { CrawledPage } from '../../shared/types.ts';

export interface RawFetchedPage {
  url: string;
  html: string;
  crawl_date: string;
}

export interface CleanResult {
  pages: CrawledPage[];
  dropped: Array<{ url: string; domain: string; reason: string }>;
}

const NOISE_SELECTORS = [
  'nav',
  'header',
  'footer',
  'aside',
  'script',
  'style',
  'noscript',
  'iframe',
  'svg',
  'form',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[class*="cookie"]',
  '[id*="cookie"]',
  '[class*="consent"]',
  '[id*="consent"]',
  '[class*="gdpr"]',
  '[id*="gdpr"]',
  '[class*="advert"]',
  '[id*="advert"]',
  '[class*="ad-slot"]',
  '[class*="ad-banner"]',
  '[class*="ads-"]',
  '[id*="ad-"]',
  '[aria-label*="advertisement" i]',
  '.advertisement',
  '.cookie-banner',
  '.sidebar',
].join(', ');

function extractPublishDate($: cheerio.CheerioAPI): string | undefined {
  const candidates = [
    $('meta[property="article:published_time"]').attr('content'),
    $('meta[property="og:published_time"]').attr('content'),
    $('meta[name="publish-date"]').attr('content'),
    $('meta[name="pubdate"]').attr('content'),
    $('meta[name="date"]').attr('content'),
    $('meta[itemprop="datePublished"]').attr('content'),
    $('time[datetime]').first().attr('datetime'),
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const ms = Date.parse(raw.trim());
    if (!Number.isNaN(ms) && ms > Date.UTC(2005, 0, 1) && ms <= Date.now() + 86400000) {
      return new Date(ms).toISOString();
    }
  }
  return undefined;
}

export function extractCleanPage(raw: RawFetchedPage): { ok: true; page: CrawledPage } | { ok: false; reason: string } {
  const $ = cheerio.load(raw.html);
  const metaTitle =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    raw.url;
  const publish_date = extractPublishDate($);

  $(NOISE_SELECTORS).remove();
  const strippedHtml = $.html();

  let title = metaTitle;
  let extractedText = '';

  try {
    const dom = new JSDOM(strippedHtml, { url: raw.url });
    const reader = new Readability(dom.window.document);
    const parsed = reader.parse();
    if (parsed && parsed.textContent) {
      extractedText = parsed.textContent;
      if (parsed.title && parsed.title.trim()) {
        title = parsed.title.trim();
      }
    }
    dom.window.close();
  } catch {
    // Fallback below
  }

  if (collapseWhitespaceAndTruncate(extractedText, 6000).length < 300) {
    const fallbackRoot = $('main, article, [role="main"]').first();
    const fallbackText = fallbackRoot.length > 0 ? fallbackRoot.text() : $('body').text();
    if (fallbackText && fallbackText.length > extractedText.length) {
      extractedText = fallbackText;
    }
  }

  const main_text = collapseWhitespaceAndTruncate(extractedText, 6000);
  if (main_text.length < 300) {
    return { ok: false, reason: `Extracted text too short (${main_text.length} chars < 300)` };
  }

  const normalizedUrl = normalizeUrl(raw.url);
  return {
    ok: true,
    page: {
      url: raw.url,
      normalizedUrl,
      domain: extractDomain(raw.url),
      title: collapseWhitespaceAndTruncate(title, 180) || raw.url,
      crawl_date: raw.crawl_date,
      publish_date,
      main_text,
      char_count: main_text.length,
    },
  };
}

export function cleanAndDeduplicatePages(rawPages: RawFetchedPage[]): CleanResult {
  const pages: CrawledPage[] = [];
  const dropped: Array<{ url: string; domain: string; reason: string }> = [];
  const seenNormalizedUrls = new Set<string>();
  const keptShingles: Array<{ url: string; shingles: Set<string> }> = [];

  for (const raw of rawPages) {
    const normUrl = normalizeUrl(raw.url);
    const domain = extractDomain(raw.url);

    if (seenNormalizedUrls.has(normUrl)) {
      dropped.push({ url: raw.url, domain, reason: 'Duplicate normalized URL' });
      continue;
    }

    const extracted = extractCleanPage(raw);
    if (!extracted.ok) {
      dropped.push({ url: raw.url, domain, reason: extracted.reason });
      continue;
    }

    const shingles = wordShingles(extracted.page.main_text, 5);
    let isNearDup = false;
    for (const existing of keptShingles) {
      if (jaccardSimilarity(shingles, existing.shingles) > 0.85) {
        isNearDup = true;
        break;
      }
    }

    if (isNearDup) {
      dropped.push({ url: raw.url, domain, reason: 'Near-duplicate content (Jaccard > 0.85)' });
      continue;
    }

    seenNormalizedUrls.add(normUrl);
    keptShingles.push({ url: raw.url, shingles });
    pages.push(extracted.page);
  }

  return { pages, dropped };
}
