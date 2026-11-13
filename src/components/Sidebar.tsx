import React from 'react';
import { Play, Database, Square, Clock, Copy, Trash2 } from 'lucide-react';
import type { LlmProvider, RunSummary } from '../shared/types.ts';

interface SidebarProps {
  topic: string;
  setTopic: (v: string) => void;
  keywords: string;
  setKeywords: (v: string) => void;
  seedUrls: string;
  setSeedUrls: (v: string) => void;
  maxPages: number;
  setMaxPages: (v: number) => void;
  provider: LlmProvider;
  setProvider: (v: LlmProvider) => void;
  availableProviders: { gemini: boolean; groq: boolean };
  isRunning: boolean;
  isLoadingSample: boolean;
  formError: string | null;
  onRunCrawl: (e: React.FormEvent) => void;
  onCancelCrawl: () => void;
  onLoadSample: () => void;
  savedRuns: RunSummary[];
  activeRunId: string | null;
  onSelectRun: (id: string) => void;
  onCloneRun: (id: string) => void;
  onDeleteRun: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  topic,
  setTopic,
  keywords,
  setKeywords,
  seedUrls,
  setSeedUrls,
  maxPages,
  setMaxPages,
  provider,
  setProvider,
  availableProviders,
  isRunning,
  isLoadingSample,
  formError,
  onRunCrawl,
  onCancelCrawl,
  onLoadSample,
  savedRuns,
  activeRunId,
  onSelectRun,
  onCloneRun,
  onDeleteRun,
}) => {
  return (
    <aside className="print-hide w-full lg:w-[304px] shrink-0 bg-white dark:bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 p-5 flex flex-col gap-6 lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] lg:overflow-y-auto transition-colors">
      <form onSubmit={onRunCrawl} className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Research Parameters
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
            Server-side discovery, polite crawl, and AI signal extraction.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="topic-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Topic or research question
          </label>
          <input
            id="topic-input"
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. EV charging demand in Pune"
            disabled={isRunning}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-700 dark:focus:ring-teal-500 disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-500 transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="keywords-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Optional keywords
          </label>
          <input
            id="keywords-input"
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="e.g. complaints, pricing, RWA"
            disabled={isRunning}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-700 dark:focus:ring-teal-500 disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-500 transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="seed-urls-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Optional seed URLs (one per line)
          </label>
          <textarea
            id="seed-urls-input"
            rows={3}
            value={seedUrls}
            onChange={(e) => setSeedUrls(e.target.value)}
            placeholder="https://example.com/forum-thread"
            disabled={isRunning}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-700 dark:focus:ring-teal-500 disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-500 transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="max-pages-input" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Max pages to crawl
            </label>
            <span className="text-xs font-mono font-semibold text-teal-800 dark:text-teal-300 tabular-nums">
              {maxPages}
            </span>
          </div>
          <input
            id="max-pages-input"
            type="range"
            min={25}
            max={40}
            step={1}
            value={maxPages}
            onChange={(e) => setMaxPages(Number(e.target.value))}
            disabled={isRunning}
            className="w-full accent-teal-700 dark:accent-teal-500 cursor-pointer"
          />
          <div className="flex justify-between text-[11px] font-mono text-slate-400 dark:text-slate-500 tabular-nums">
            <span>25 min</span>
            <span>30 default</span>
            <span>40 max</span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="provider-select" className="text-xs font-medium text-slate-700 dark:text-slate-300">
              AI extraction provider
            </label>
            <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
              {[availableProviders.gemini ? 'Gemini' : null, availableProviders.groq ? 'Groq' : null]
                .filter(Boolean)
                .join(' · ') || 'No keys'}
            </span>
          </div>
          <select
            id="provider-select"
            value={provider}
            onChange={(e) => setProvider(e.target.value as LlmProvider)}
            disabled={isRunning}
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:border-teal-700 dark:focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-700 dark:focus:ring-teal-500 disabled:bg-slate-50 dark:disabled:bg-slate-900 disabled:text-slate-500 transition-colors"
          >
            <option value="auto">Auto (Gemini + Groq fallback)</option>
            <option value="groq">Groq (Auto-select model)</option>
            <option value="gemini">Gemini (4 Flash)</option>
          </select>
        </div>

        {formError && (
          <div
            role="alert"
            className="rounded-md border border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-800 dark:text-red-300"
          >
            {formError}
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          {!isRunning ? (
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-teal-700 dark:bg-teal-600 px-4 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-teal-800 dark:hover:bg-teal-500 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Play className="w-4 h-4 shrink-0" />
              Run crawl
            </button>
          ) : (
            <button
              type="button"
              onClick={onCancelCrawl}
              className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-red-600 dark:bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-xs hover:bg-red-700 dark:hover:bg-red-500 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Square className="w-4 h-4 shrink-0" />
              Stop crawl
            </button>
          )}

          <button
            type="button"
            onClick={onLoadSample}
            disabled={isRunning || isLoadingSample}
            className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-colors disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            <Database className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400" />
            {isLoadingSample ? 'Loading sample...' : 'Load sample run'}
          </button>
        </div>
      </form>

      <div className="border-t border-slate-200 dark:border-slate-800 pt-5 flex flex-col gap-2.5 min-h-0 flex-1">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            Saved Runs
          </h3>
          <span className="text-xs font-mono text-slate-400 dark:text-slate-500 tabular-nums">
            {savedRuns.length}
          </span>
        </div>

        {savedRuns.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            No saved runs yet. Run a crawl or load the sample dataset.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5 overflow-y-auto pr-1">
            {savedRuns.map((item) => {
              const active = item.id === activeRunId;
              return (
                <div
                  key={item.id}
                  className={`group relative rounded-md border transition-colors ${
                    active
                      ? 'border-teal-700 dark:border-teal-500 bg-teal-50/50 dark:bg-teal-950/40 text-slate-900 dark:text-slate-100'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectRun(item.id)}
                    className="text-left w-full px-3 py-2 pr-14 cursor-pointer rounded-md"
                  >
                    <div className="text-xs font-medium truncate text-slate-900 dark:text-slate-100">
                      {item.topic}
                    </div>
                    <div className="mt-1 flex items-center flex-wrap gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      <span>{item.useful_signals_count} signals</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.domains_count} domains</span>
                      {item.is_sample && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-amber-700 dark:text-amber-400 font-sans font-medium">
                            Sample
                          </span>
                        </>
                      )}
                      {item.status === 'failed' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-red-700 dark:text-red-400 font-sans font-medium">
                            Failed
                          </span>
                        </>
                      )}
                      {item.status === 'running' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-teal-700 dark:text-teal-400 font-sans font-medium">
                            Running
                          </span>
                        </>
                      )}
                    </div>
                  </button>

                  <div className="absolute right-1.5 top-2 flex items-center gap-0.5 opacity-80 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => onCloneRun(item.id)}
                      disabled={isRunning}
                      title="Copy parameters to form"
                      aria-label={`Copy parameters from ${item.topic}`}
                      className="p-1 rounded text-slate-400 dark:text-slate-500 hover:text-teal-700 dark:hover:text-teal-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRun(item.id)}
                      title="Delete saved run"
                      aria-label={`Delete run ${item.topic}`}
                      className="p-1 rounded text-slate-400 dark:text-slate-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
