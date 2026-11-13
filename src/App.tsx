import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Database, FileText, Moon, Sun } from 'lucide-react';
import type { LlmProvider, RunSummary, SignalCategory, SignalRun } from './shared/types.ts';
import { Sidebar } from './components/Sidebar.tsx';
import { LiveCrawlPanel } from './components/LiveCrawlPanel.tsx';
import { OverviewSection } from './components/OverviewSection.tsx';
import { OpportunitiesSection } from './components/OpportunitiesSection.tsx';
import { SignalsSection } from './components/SignalsSection.tsx';
import { MethodologyAndExports } from './components/MethodologyAndExports.tsx';
import { downloadFindingsMarkdownNote } from './utils/clientExports.ts';
import {
  getNextTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from './utils/theme.ts';

const LAST_RUN_KEY = 'signal_hunter_last_run_id';

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(THEME_STORAGE_KEY) : null;
    const prefersDark =
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    return resolveInitialTheme(stored, prefersDark);
  });

  const [topic, setTopic] = useState('EV charging demand and complaints in Pune');
  const [keywords, setKeywords] = useState('charging station, fast charger, RWA, complaints');
  const [seedUrls, setSeedUrls] = useState('');
  const [maxPages, setMaxPages] = useState(30);
  const [provider, setProvider] = useState<LlmProvider>('auto');
  const [availableProviders, setAvailableProviders] = useState<{ gemini: boolean; groq: boolean }>({
    gemini: true,
    groq: false,
  });

  const [savedRuns, setSavedRuns] = useState<RunSummary[]>([]);
  const [activeRun, setActiveRun] = useState<SignalRun | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoadingSample, setIsLoadingSample] = useState(false);

  // Lifted Signals table filter state for cross-filtering from Overview charts & Theme Matrix
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [themeFilter, setThemeFilter] = useState<string>('all');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [minScore, setMinScore] = useState<number>(0);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => getNextTheme(prev));
  };

  const resetSignalsFilters = () => {
    setCategoryFilter('all');
    setThemeFilter('all');
    setDomainFilter('all');
    setMinScore(0);
    setSearchQuery('');
  };

  const scrollToSignalsWithFilter = (next: {
    category?: SignalCategory;
    theme?: string;
    domain?: string;
  }) => {
    setCategoryFilter(next.category ?? 'all');
    setThemeFilter(next.theme ?? 'all');
    setDomainFilter(next.domain ?? 'all');
    setMinScore(0);
    setSearchQuery('');
    const el = document.getElementById('signals');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const closeStream = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const refreshRunList = async (): Promise<RunSummary[]> => {
    try {
      const res = await fetch('/api/runs');
      if (res.ok) {
        const data = (await res.json()) as { runs: RunSummary[] };
        const runs = data.runs ?? [];
        setSavedRuns(runs);
        return runs;
      }
    } catch {
      // Ignore background list failure
    }
    return [];
  };

  const syncActiveRunUrl = (runId: string | null) => {
    const url = new URL(window.location.href);
    if (runId) {
      localStorage.setItem(LAST_RUN_KEY, runId);
      url.searchParams.set('run', runId);
    } else {
      localStorage.removeItem(LAST_RUN_KEY);
      url.searchParams.delete('run');
    }
    window.history.replaceState({}, '', url.toString());
  };

  const subscribeToStream = (runId: string) => {
    closeStream();
    const es = new EventSource(`/api/run/${encodeURIComponent(runId)}/stream`);
    eventSourceRef.current = es;

    es.addEventListener('update', (ev) => {
      try {
        const updated = JSON.parse((ev as MessageEvent).data) as SignalRun;
        setActiveRun(updated);
      } catch {
        // Ignore malformed event
      }
    });

    es.addEventListener('complete', (ev) => {
      try {
        const finalRun = JSON.parse((ev as MessageEvent).data) as SignalRun;
        setActiveRun(finalRun);
      } catch {
        // Ignore
      }
      closeStream();
      refreshRunList();
    });

    es.onerror = () => {
      closeStream();
      refreshRunList();
    };
  };

  const selectRun = async (id: string) => {
    closeStream();
    resetSignalsFilters();
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { run: SignalRun };
      setActiveRun(data.run);
      syncActiveRunUrl(data.run.id);
      if (data.run.status === 'running') {
        subscribeToStream(data.run.id);
      }
    } catch {
      // Ignore
    }
  };

  const handleCloneRun = async (id: string) => {
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { run: SignalRun };
      setTopic(data.run.topic);
      setKeywords(data.run.keywords);
      setSeedUrls((data.run.seed_urls ?? []).join('\n'));
      setMaxPages(Math.max(25, Math.min(40, data.run.max_pages || 30)));
      setFormError(null);
      document.getElementById('topic-input')?.focus();
    } catch {
      // Ignore
    }
  };

  const handleDeleteRun = async (id: string) => {
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) return;
      if (activeRun?.id === id) {
        closeStream();
      }
      const runs = await refreshRunList();
      if (activeRun?.id === id) {
        const nextRun = runs[0];
        if (nextRun) {
          await selectRun(nextRun.id);
        } else {
          setActiveRun(null);
          syncActiveRunUrl(null);
        }
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const healthRes = await fetch('/api/health');
        if (healthRes.ok) {
          const health = (await healthRes.json()) as {
            providers?: { gemini?: boolean; groq?: boolean };
          };
          if (health.providers) {
            setAvailableProviders({
              gemini: Boolean(health.providers.gemini),
              groq: Boolean(health.providers.groq),
            });
          }
        }
      } catch {
        // Ignore health check error
      }
      const runs = await refreshRunList();
      const params = new URLSearchParams(window.location.search);
      const urlRunId = params.get('run');
      const storedId = urlRunId || localStorage.getItem(LAST_RUN_KEY) || runs[0]?.id;
      if (storedId) {
        await selectRun(storedId);
      }
    };
    init();
    return () => closeStream();
  }, []);

  const handleRunCrawl = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trimmedTopic = topic.trim();
    if (trimmedTopic.length < 3) {
      setFormError('Please enter a research topic (at least 3 characters).');
      return;
    }

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: trimmedTopic,
          keywords: keywords.trim(),
          seedUrls,
          maxPages,
          provider,
        }),
      });

      const data = (await res.json()) as { runId?: string; run?: SignalRun; error?: string };
      if (!res.ok || !data.run) {
        setFormError(data.error || 'Failed to start crawl.');
        return;
      }

      resetSignalsFilters();
      setActiveRun(data.run);
      syncActiveRunUrl(data.run.id);
      subscribeToStream(data.run.id);
      refreshRunList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Network error starting crawl.');
    }
  };

  const handleCancelCrawl = async () => {
    if (!activeRun) return;
    try {
      await fetch(`/api/runs/${encodeURIComponent(activeRun.id)}/cancel`, { method: 'POST' });
    } catch {
      // Ignore
    }
  };

  const handleLoadSample = async () => {
    setFormError(null);
    setIsLoadingSample(true);
    closeStream();
    try {
      const res = await fetch('/api/runs/sample', { method: 'POST' });
      const data = (await res.json()) as { run?: SignalRun; error?: string };
      if (!res.ok || !data.run) {
        setFormError(data.error || 'Failed to load sample run.');
        return;
      }
      resetSignalsFilters();
      setActiveRun(data.run);
      setTopic(data.run.topic);
      setKeywords(data.run.keywords);
      setSeedUrls('');
      syncActiveRunUrl(data.run.id);
      await refreshRunList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to load sample run.');
    } finally {
      setIsLoadingSample(false);
    }
  };

  const isRunning = activeRun?.status === 'running';
  const isDark = theme === 'dark';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="print-hide bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between gap-8 sticky top-0 z-20 transition-colors">
        <a
          href="#top"
          className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          AI Web Signal Hunter
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <a href="#overview" className="hover:text-teal-800 dark:hover:text-teal-300 transition-colors whitespace-nowrap shrink-0">
            Overview
          </a>
          <a href="#opportunities" className="hover:text-teal-800 dark:hover:text-teal-300 transition-colors whitespace-nowrap shrink-0">
            Opportunities
          </a>
          <a href="#signals" className="hover:text-teal-800 dark:hover:text-teal-300 transition-colors whitespace-nowrap shrink-0">
            Signals
          </a>
          <a href="#methodology" className="hover:text-teal-800 dark:hover:text-teal-300 transition-colors whitespace-nowrap shrink-0">
            Methodology
          </a>
        </nav>

        <div className="shrink-0 flex items-center gap-2.5">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={isDark}
            className="inline-flex items-center justify-center rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          {activeRun && activeRun.status === 'completed' ? (
            <button
              type="button"
              onClick={() => downloadFindingsMarkdownNote(activeRun)}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 dark:bg-teal-600 px-3.5 py-2 text-xs font-medium text-white shadow-xs hover:bg-teal-800 dark:hover:bg-teal-500 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5" />
              Download note
            </button>
          ) : (
            <button
              type="button"
              onClick={() => document.getElementById('topic-input')?.focus()}
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 dark:bg-teal-600 px-3.5 py-2 text-xs font-medium text-white shadow-xs hover:bg-teal-800 dark:hover:bg-teal-500 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              New research
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace */}
      <div id="top" className="flex-1 flex flex-col lg:flex-row">
        <Sidebar
          topic={topic}
          setTopic={setTopic}
          keywords={keywords}
          setKeywords={setKeywords}
          seedUrls={seedUrls}
          setSeedUrls={setSeedUrls}
          maxPages={maxPages}
          setMaxPages={setMaxPages}
          provider={provider}
          setProvider={setProvider}
          availableProviders={availableProviders}
          isRunning={Boolean(isRunning)}
          isLoadingSample={isLoadingSample}
          formError={formError}
          onRunCrawl={handleRunCrawl}
          onCancelCrawl={handleCancelCrawl}
          onLoadSample={handleLoadSample}
          savedRuns={savedRuns}
          activeRunId={activeRun?.id ?? null}
          onSelectRun={selectRun}
          onCloneRun={handleCloneRun}
          onDeleteRun={handleDeleteRun}
        />

        <main className="flex-1 min-w-0 p-5 lg:p-7 flex flex-col gap-6 max-w-[1280px]">
          {!activeRun ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-10 shadow-2xs flex flex-col items-start gap-4 max-w-2xl">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                Extract Verified Market Signals from Public Web Discussions
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Enter a research topic in the sidebar to discover public threads, politely crawl them respecting{' '}
                <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded text-slate-800 dark:text-slate-200">
                  robots.txt
                </code>
                , verify verbatim evidence quotes against page text, and rank opportunity themes using an auditable formula.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleLoadSample}
                  disabled={isLoadingSample}
                  className="inline-flex items-center gap-2 rounded-md bg-teal-700 dark:bg-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-teal-800 dark:hover:bg-teal-500 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Database className="w-4 h-4" />
                  Load sample run (EV charging in Pune)
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Active Run Heading & Notices */}
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                    {activeRun.topic}
                  </h1>
                  <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                    Run {activeRun.id} · {new Date(activeRun.created_at).toLocaleDateString()}
                  </span>
                </div>

                {activeRun.is_sample && (
                  <div
                    role="status"
                    className="rounded-md border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3"
                  >
                    <span>
                      <strong>Sample Data:</strong> Showing the pre-built benchmark run for “EV charging demand and complaints in Pune” (27 pages across 6 domains, 5 briefs).
                    </span>
                    <span className="font-mono font-medium shrink-0">sample data</span>
                  </div>
                )}

                {activeRun.warnings.map((w, idx) => (
                  <div
                    key={idx}
                    role="alert"
                    className="rounded-md border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/40 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>

              <LiveCrawlPanel run={activeRun} />

              <OverviewSection
                run={activeRun}
                isDark={isDark}
                onSelectCategory={(category) => scrollToSignalsWithFilter({ category })}
                onSelectTheme={(t) => scrollToSignalsWithFilter({ theme: t })}
                onSelectDomain={(domain) => scrollToSignalsWithFilter({ domain })}
              />

              <OpportunitiesSection
                run={activeRun}
                onSelectTheme={(t) => scrollToSignalsWithFilter({ theme: t })}
              />

              <SignalsSection
                run={activeRun}
                categoryFilter={categoryFilter}
                setCategoryFilter={setCategoryFilter}
                themeFilter={themeFilter}
                setThemeFilter={setThemeFilter}
                domainFilter={domainFilter}
                setDomainFilter={setDomainFilter}
                minScore={minScore}
                setMinScore={setMinScore}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                onResetFilters={resetSignalsFilters}
              />

              <MethodologyAndExports run={activeRun} />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
