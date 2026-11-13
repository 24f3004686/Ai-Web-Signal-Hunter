import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, ExternalLink, AlertTriangle, CheckCircle2, X, Search } from 'lucide-react';
import {
  CATEGORY_LABELS,
  SIGNAL_CATEGORIES,
  type Finding,
  type SignalCategory,
  type SignalRun,
} from '../shared/types.ts';
import {
  filterAndSortFindings,
  type SignalSortDir,
  type SignalSortField,
} from '../utils/signalFilters.ts';

interface SignalsSectionProps {
  run: SignalRun;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  themeFilter: string;
  setThemeFilter: (v: string) => void;
  domainFilter: string;
  setDomainFilter: (v: string) => void;
  minScore: number;
  setMinScore: (v: number) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  onResetFilters: () => void;
}

export const SignalsSection: React.FC<SignalsSectionProps> = ({
  run,
  categoryFilter,
  setCategoryFilter,
  themeFilter,
  setThemeFilter,
  domainFilter,
  setDomainFilter,
  minScore,
  setMinScore,
  searchQuery,
  setSearchQuery,
  onResetFilters,
}) => {
  const [sortField, setSortField] = useState<SignalSortField>('relevance');
  const [sortDir, setSortDir] = useState<SignalSortDir>('desc');
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);

  useEffect(() => {
    setSelectedFinding(null);
  }, [run.id]);

  const uniqueThemes = useMemo(() => {
    const set = new Set<string>();
    for (const f of run.findings) {
      if (f.theme) set.add(f.theme);
    }
    return Array.from(set).sort();
  }, [run.findings]);

  const uniqueDomains = useMemo(() => {
    const set = new Set<string>();
    for (const f of run.findings) {
      if (f.domain) set.add(f.domain);
    }
    return Array.from(set).sort();
  }, [run.findings]);

  const filteredFindings = useMemo(() => {
    return filterAndSortFindings(run.findings, {
      categoryFilter,
      themeFilter,
      domainFilter,
      minScore,
      searchQuery,
      sortField,
      sortDir,
    });
  }, [run.findings, categoryFilter, themeFilter, domainFilter, minScore, searchQuery, sortField, sortDir]);

  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (categoryFilter !== 'all') {
      parts.push(`Category: ${CATEGORY_LABELS[categoryFilter as SignalCategory] ?? categoryFilter}`);
    }
    if (themeFilter !== 'all') parts.push(`Theme: ${themeFilter}`);
    if (domainFilter !== 'all') parts.push(`Domain: ${domainFilter}`);
    if (minScore > 0) parts.push(`Min score: ${minScore}`);
    if (searchQuery.trim()) parts.push(`Search: “${searchQuery.trim()}”`);
    return parts;
  }, [categoryFilter, themeFilter, domainFilter, minScore, searchQuery]);

  const toggleSort = (field: SignalSortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'category' || field === 'theme' ? 'asc' : 'desc');
    }
  };

  return (
    <section id="signals" className="scroll-mt-20 flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Extracted Signals Table
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Click any row to inspect verbatim evidence, surrounding passage context, and AI reasoning.
          </p>
        </div>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
          Showing {filteredFindings.length} of {run.findings.length} pages
        </span>
      </div>

      {/* Filters Toolbar */}
      <div className="print-hide bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-2xs flex flex-col gap-3 transition-colors">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label htmlFor="filter-category" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Category
            </label>
            <select
              id="filter-category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
            >
              <option value="all">All categories</option>
              {SIGNAL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-theme" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Theme
            </label>
            <select
              id="filter-theme"
              value={themeFilter}
              onChange={(e) => setThemeFilter(e.target.value)}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
            >
              <option value="all">All themes</option>
              {uniqueThemes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-domain" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Domain
            </label>
            <select
              id="filter-domain"
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
            >
              <option value="all">All domains</option>
              {uniqueDomains.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex justify-between">
              <label htmlFor="filter-min-score" className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Min score
              </label>
              <span className="text-xs font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                {minScore}
              </span>
            </div>
            <input
              id="filter-min-score"
              type="range"
              min={0}
              max={95}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="w-full accent-teal-700 dark:accent-teal-500 cursor-pointer my-1"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filter-search" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Keyword search
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="filter-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search summary, who, or theme..."
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 pl-7 pr-7 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear keyword search"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {activeFilterSummary.length > 0 && (
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-slate-600 dark:text-slate-400">
              Active filters:{' '}
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {activeFilterSummary.join(' · ')}
              </span>
            </span>
            <button
              type="button"
              onClick={onResetFilters}
              className="text-teal-700 dark:text-teal-400 hover:text-teal-900 dark:hover:text-teal-300 font-medium underline underline-offset-2 cursor-pointer"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Table + Detail Split View */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div
          className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-2xs transition-colors ${
            selectedFinding ? 'xl:col-span-8' : 'xl:col-span-12'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <th className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('category')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer whitespace-nowrap"
                    >
                      Category <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3">
                    <button
                      type="button"
                      onClick={() => toggleSort('theme')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer whitespace-nowrap"
                    >
                      Theme <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('relevance')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer whitespace-nowrap"
                    >
                      Rel <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('urgency')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer whitespace-nowrap"
                    >
                      Urg <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('confidence')}
                      className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer whitespace-nowrap"
                    >
                      Conf <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                  <th className="py-2.5 px-3">Summary</th>
                  <th className="py-2.5 px-3">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filteredFindings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                      No findings match the current filters.{' '}
                      <button
                        type="button"
                        onClick={onResetFilters}
                        className="text-teal-700 dark:text-teal-400 underline font-medium cursor-pointer"
                      >
                        Reset filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredFindings.map((f) => {
                    const isSelected = selectedFinding?.id === f.id;
                    const isUseful = f.category !== 'irrelevant';
                    const catColor =
                      f.category === 'pain_point'
                        ? 'text-red-700 dark:text-red-400'
                        : f.category === 'demand_signal'
                          ? 'text-teal-800 dark:text-teal-400'
                          : f.category === 'pricing_concern'
                            ? 'text-amber-700 dark:text-amber-400'
                            : f.category === 'irrelevant'
                              ? 'text-slate-400 dark:text-slate-500'
                              : 'text-sky-800 dark:text-sky-400';

                    return (
                      <tr
                        key={f.id}
                        onClick={() => setSelectedFinding(f)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-teal-50/70 dark:bg-teal-950/40'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <td className={`py-2.5 px-2.5 text-xs font-medium whitespace-nowrap ${catColor}`}>
                          {CATEGORY_LABELS[f.category as SignalCategory] ?? f.category}
                        </td>
                        <td
                          className={`py-2.5 px-2.5 text-xs text-slate-700 dark:text-slate-300 truncate ${
                            selectedFinding ? 'max-w-[105px]' : 'max-w-[160px]'
                          }`}
                          title={f.theme}
                        >
                          {f.theme}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-slate-800 dark:text-slate-200 tabular-nums">
                          {f.relevance}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-slate-800 dark:text-slate-200 tabular-nums">
                          {f.urgency}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-xs text-slate-800 dark:text-slate-200 tabular-nums">
                          {f.confidence}
                        </td>
                        <td
                          className={`py-2.5 px-2.5 text-xs text-slate-800 dark:text-slate-200 ${
                            selectedFinding ? 'max-w-[200px]' : 'max-w-[320px]'
                          }`}
                        >
                          <div className="line-clamp-2">{f.summary}</div>
                          {f.who && f.who !== 'unclear' && (
                            <div
                              className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate"
                              title={f.who}
                            >
                              Who: {f.who}
                            </div>
                          )}
                          {isUseful && !f.evidence_verified && (
                            <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              Unverified evidence (excluded from ranking)
                            </div>
                          )}
                        </td>
                        <td
                          className={`py-2.5 px-2.5 text-xs ${
                            selectedFinding ? 'max-w-[105px]' : 'max-w-[150px]'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <a
                            href={f.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={f.domain}
                            className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 hover:text-teal-900 dark:hover:text-teal-300 underline underline-offset-2 max-w-full"
                          >
                            <span className="truncate">{f.domain}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail Inspector Panel */}
        {selectedFinding && (
          <aside
            aria-label="Signal Detail Inspector"
            className="print-hide xl:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-2xs flex flex-col gap-4 sticky top-[72px] transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {CATEGORY_LABELS[selectedFinding.category]} · {selectedFinding.theme}
                </div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 leading-snug">
                  {selectedFinding.title || selectedFinding.domain}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close detail panel"
                onClick={() => setSelectedFinding(null)}
                className="p-1 rounded text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedFinding.category !== 'irrelevant' && (
              <div
                className={`rounded-md border px-3 py-2 text-xs flex items-center gap-2 ${
                  selectedFinding.evidence_verified
                    ? 'border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                    : 'border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200'
                }`}
              >
                {selectedFinding.evidence_verified ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                    <span>Evidence verified in crawled page text (included in theme ranking)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span>Unverified excerpt — excluded from theme ranking calculations</span>
                  </>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 border-y border-slate-200 dark:border-slate-800 py-3 text-center">
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Relevance</div>
                <div className="text-base font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {selectedFinding.relevance}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Urgency</div>
                <div className="text-base font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {selectedFinding.urgency}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Confidence</div>
                <div className="text-base font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  {selectedFinding.confidence}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 text-xs leading-relaxed">
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mb-0.5">Summary</div>
                <p className="text-slate-700 dark:text-slate-300">{selectedFinding.summary}</p>
              </div>

              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mb-0.5">
                  Who has the need
                </div>
                <p className="text-slate-700 dark:text-slate-300">{selectedFinding.who}</p>
              </div>

              {selectedFinding.evidence && (
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                    {selectedFinding.evidence_context
                      ? 'Verified Quote & Page Context'
                      : 'Verbatim Evidence Excerpt'}
                  </div>
                  {selectedFinding.evidence_context ? (
                    <blockquote className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-md p-3 text-slate-600 dark:text-slate-400 leading-relaxed">
                      <span>{selectedFinding.evidence_context.before}</span>
                      <mark className="bg-teal-100/80 dark:bg-teal-900/70 text-teal-950 dark:text-teal-100 font-medium px-1 py-0.5 rounded-xs">
                        {selectedFinding.evidence_context.match}
                      </mark>
                      <span>{selectedFinding.evidence_context.after}</span>
                    </blockquote>
                  ) : (
                    <blockquote className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-md p-3 text-slate-800 dark:text-slate-200 italic">
                      “{selectedFinding.evidence}”
                    </blockquote>
                  )}
                </div>
              )}

              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 mb-0.5">
                  AI Reasoning
                </div>
                <p className="text-slate-600 dark:text-slate-400">{selectedFinding.reasoning}</p>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Source URL
                </div>
                <a
                  href={selectedFinding.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 hover:text-teal-900 dark:hover:text-teal-300 underline break-all"
                >
                  {selectedFinding.source_url}
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              </div>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
};
