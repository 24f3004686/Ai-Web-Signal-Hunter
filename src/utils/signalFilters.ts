import type { Finding } from '../shared/types.ts';

export type SignalSortField = 'category' | 'theme' | 'relevance' | 'urgency' | 'confidence';
export type SignalSortDir = 'asc' | 'desc';

export interface SignalFilterOptions {
  categoryFilter: string;
  themeFilter: string;
  domainFilter: string;
  minScore: number;
  searchQuery: string;
  sortField: SignalSortField;
  sortDir: SignalSortDir;
}

export function parseSearchKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function matchesSignalKeywords(finding: Finding, keywords: string[]): boolean {
  if (keywords.length === 0) return true;
  const searchable = `${finding.summary} ${finding.who} ${finding.theme}`.toLowerCase();
  return keywords.every((kw) => searchable.includes(kw));
}

export function filterAndSortFindings(
  findings: Finding[],
  options: SignalFilterOptions
): Finding[] {
  const keywords = parseSearchKeywords(options.searchQuery);

  return findings
    .filter((f) => {
      if (options.categoryFilter !== 'all' && f.category !== options.categoryFilter) return false;
      if (options.themeFilter !== 'all' && f.theme !== options.themeFilter) return false;
      if (options.domainFilter !== 'all' && f.domain !== options.domainFilter) return false;
      if (Math.max(f.relevance, f.urgency, f.confidence) < options.minScore) return false;
      if (!matchesSignalKeywords(f, keywords)) return false;
      return true;
    })
    .sort((a, b) => {
      const mult = options.sortDir === 'asc' ? 1 : -1;
      if (options.sortField === 'category' || options.sortField === 'theme') {
        return a[options.sortField].localeCompare(b[options.sortField]) * mult;
      }
      return (a[options.sortField] - b[options.sortField]) * mult;
    });
}
