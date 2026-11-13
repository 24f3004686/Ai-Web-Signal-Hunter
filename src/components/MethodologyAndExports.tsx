import React from 'react';
import { Download, FileText, Printer } from 'lucide-react';
import type { SignalRun } from '../shared/types.ts';
import {
  downloadBriefsJson,
  downloadFindingsCsv,
  downloadFindingsJson,
  downloadFindingsMarkdownNote,
} from '../utils/clientExports.ts';

interface MethodologyAndExportsProps {
  run: SignalRun;
}

export const MethodologyAndExports: React.FC<MethodologyAndExportsProps> = ({ run }) => {
  return (
    <section id="methodology" className="scroll-mt-20 flex flex-col gap-6 pb-10">
      {/* Export Bar */}
      <div className="print-hide bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-2xs flex flex-wrap items-center justify-between gap-4 transition-colors">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Export Research Artifacts
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Download structured datasets, print a PDF report, or export a one-page Markdown summary.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => downloadFindingsCsv(run)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Findings CSV
          </button>
          <button
            type="button"
            onClick={() => downloadFindingsJson(run)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Findings JSON
          </button>
          <button
            type="button"
            onClick={() => downloadBriefsJson(run)}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Briefs JSON
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / PDF
          </button>
          <button
            type="button"
            onClick={() => downloadFindingsMarkdownNote(run)}
            className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 dark:bg-teal-600 px-3.5 py-2 text-xs font-medium text-white shadow-xs hover:bg-teal-800 dark:hover:bg-teal-500 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileText className="w-3.5 h-3.5" />
            Download findings note
          </button>
        </div>
      </div>

      {/* Methodology & Limitations Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-2xs grid grid-cols-1 md:grid-cols-2 gap-6 print-break-inside-avoid transition-colors">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Scoring Methodology
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Themes are ranked strictly from evidence-verified, non-irrelevant findings using the formula:
          </p>
          <pre className="bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-md p-3 text-xs font-mono text-slate-800 dark:text-slate-200 overflow-x-auto">
{`theme_score =
  0.30 * frequency +
  0.25 * avg_relevance +
  0.20 * avg_urgency +
  0.15 * avg_confidence +
  0.10 * recency`}
          </pre>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <strong>Frequency</strong> equals (distinct domains in theme / total domains crawled) × 100.{' '}
            <strong>Recency</strong> scores 100 for pages published or crawled within 30 days, scaling linearly down to 0 at 365 days.
          </p>
        </div>

        <div className="flex flex-col gap-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Limitations & Polite Crawling
          </h3>
          <p>
            <strong className="text-slate-900 dark:text-slate-100">AI Score Estimates:</strong> Relevance, urgency, and confidence scores are model-generated estimates for triage—not objective market facts. Always inspect the verbatim quote and primary source before acting.
          </p>
          <p>
            <strong className="text-slate-900 dark:text-slate-100">Small-Sample & Visibility Bias:</strong> Crawling 25–40 publicly indexed pages reflects vocal online discussions and search ranking visibility, not a statistically representative market survey.
          </p>
          <p>
            <strong className="text-slate-900 dark:text-slate-100">robots.txt & Access Compliance:</strong> All requests run server-side as{' '}
            <code className="font-mono text-slate-800 dark:text-slate-200">
              SignalHunterBot/1.0 (student assignment)
            </code>{' '}
            with per-domain 1.5s rate limiting, strict <code>robots.txt</code> compliance, and automatic skipping of login walls, paywalls, and CAPTCHAs.
          </p>
        </div>
      </div>
    </section>
  );
};
