import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { PipelinePhase, SignalRun } from '../shared/types.ts';

interface LiveCrawlPanelProps {
  run: SignalRun;
}

const PHASE_LABELS: Record<PipelinePhase, string> = {
  idle: 'Ready',
  discover: '1. Discovering URLs via Search',
  crawl: '2. Polite Crawling (robots.txt & rate limits)',
  clean: '3. Cleaning & Deduplicating Content',
  analyze: '4. Analyzing Pages & Extracting Signals',
  group: '5. Grouping Signals into Themes',
  rank: '6. Ranking Opportunities by Formula',
  briefs: '7. Writing Top 5 Opportunity Briefs',
  done: '8. Complete & Persisted',
  error: 'Pipeline Stopped / Error',
};

export const LiveCrawlPanel: React.FC<LiveCrawlPanelProps> = ({ run }) => {
  const isRunning = run.status === 'running';
  const [expanded, setExpanded] = useState<boolean>(isRunning || run.status === 'failed');

  useEffect(() => {
    if (run.status === 'failed' || run.status === 'running') {
      setExpanded(true);
    }
  }, [run.id, run.status]);

  const showLog = isRunning || expanded;

  return (
    <section
      aria-label="Crawl Progress and Log"
      className="print-hide bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-2xs transition-colors"
    >
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Loader2
                className="w-4 h-4 text-teal-700 dark:text-teal-400 animate-spin shrink-0"
                aria-hidden="true"
              />
            ) : run.status === 'failed' ? (
              <AlertTriangle
                className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <CheckCircle2
                className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0"
                aria-hidden="true"
              />
            )}
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {PHASE_LABELS[run.phase] ?? run.phase}
            </span>
            <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
              {run.progress}%
            </span>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                run.status === 'failed'
                  ? 'bg-red-600 dark:bg-red-500'
                  : 'bg-teal-700 dark:bg-teal-500'
              }`}
              style={{ width: `${Math.max(2, run.progress)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400 font-sans">Discovered</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {run.stats.discovered_count}
            </span>
          </div>
          <span className="text-slate-200 dark:text-slate-700 select-none" aria-hidden="true">
            |
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400 font-sans">Crawled</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              {run.stats.crawled_count}
            </span>
          </div>
          <span className="text-slate-200 dark:text-slate-700 select-none" aria-hidden="true">
            |
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400 font-sans">Skipped</span>
            <span className="font-semibold text-amber-700 dark:text-amber-400">
              {run.stats.skipped_count}
            </span>
          </div>
          <span className="text-slate-200 dark:text-slate-700 select-none" aria-hidden="true">
            |
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 dark:text-slate-400 font-sans">Failed</span>
            <span className="font-semibold text-red-700 dark:text-red-400">
              {run.stats.failed_count}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 font-sans font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            {showLog ? (
              <>
                Hide log <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                View log ({run.logs.length}) <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {run.error && (
        <div className="px-5 py-3 border-t border-red-200 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 text-xs text-red-800 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
          <span>{run.error}</span>
        </div>
      )}

      {showLog && (
        <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 px-5 py-3 max-h-64 overflow-y-auto">
          {run.logs.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Waiting for pipeline events...
            </p>
          ) : (
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-1.5 pr-3 font-medium">Status</th>
                  <th className="py-1.5 pr-3 font-medium">Domain</th>
                  <th className="py-1.5 pr-3 font-medium">URL / Stage</th>
                  <th className="py-1.5 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                {[...run.logs].reverse().map((log) => {
                  const statusClass =
                    log.status === 'crawled' || log.status === 'analyzed'
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : log.status === 'skipped'
                        ? 'text-amber-700 dark:text-amber-400'
                        : log.status === 'failed'
                          ? 'text-red-700 dark:text-red-400'
                          : 'text-slate-600 dark:text-slate-400';

                  return (
                    <tr key={log.id} className="align-top">
                      <td className={`py-1.5 pr-3 font-medium whitespace-nowrap ${statusClass}`}>
                        {log.status}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {log.domain}
                      </td>
                      <td
                        className="py-1.5 pr-3 text-slate-800 dark:text-slate-200 max-w-[300px] truncate"
                        title={log.url}
                      >
                        {log.url}
                      </td>
                      <td className="py-1.5 text-slate-600 dark:text-slate-400 font-sans">
                        {log.reason ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
};
