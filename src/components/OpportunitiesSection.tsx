import React, { useMemo, useState } from 'react';
import { ExternalLink, SlidersHorizontal, RotateCcw, ArrowRight } from 'lucide-react';
import {
  DEFAULT_FORMULA_WEIGHTS,
  type FormulaWeights,
  type SignalRun,
} from '../shared/types.ts';
import { computeThemeRankings, normalizeFormulaWeights } from '../server/logic/scoring.ts';

interface OpportunitiesSectionProps {
  run: SignalRun;
  onSelectTheme?: (theme: string) => void;
}

const DEFAULT_SLIDERS: FormulaWeights = {
  frequency: 30,
  relevance: 25,
  urgency: 20,
  confidence: 15,
  recency: 10,
};

const WEIGHT_FIELDS: Array<{ key: keyof FormulaWeights; label: string; short: string }> = [
  { key: 'frequency', label: 'Domain Frequency', short: 'Freq' },
  { key: 'relevance', label: 'Relevance', short: 'Rel' },
  { key: 'urgency', label: 'Urgency', short: 'Urg' },
  { key: 'confidence', label: 'Confidence', short: 'Conf' },
  { key: 'recency', label: 'Recency', short: 'Rec' },
];

export const OpportunitiesSection: React.FC<OpportunitiesSectionProps> = ({
  run,
  onSelectTheme,
}) => {
  const [showTuner, setShowTuner] = useState(false);
  const [sliderWeights, setSliderWeights] = useState<FormulaWeights>(DEFAULT_SLIDERS);

  const isCustomWeights =
    sliderWeights.frequency !== DEFAULT_SLIDERS.frequency ||
    sliderWeights.relevance !== DEFAULT_SLIDERS.relevance ||
    sliderWeights.urgency !== DEFAULT_SLIDERS.urgency ||
    sliderWeights.confidence !== DEFAULT_SLIDERS.confidence ||
    sliderWeights.recency !== DEFAULT_SLIDERS.recency;

  const normalizedWeights = useMemo(
    () =>
      isCustomWeights
        ? normalizeFormulaWeights(sliderWeights)
        : DEFAULT_FORMULA_WEIGHTS,
    [isCustomWeights, sliderWeights]
  );

  const displayedThemes = useMemo(() => {
    if (!isCustomWeights) return run.themes;
    return computeThemeRankings(
      run.findings,
      Math.max(1, run.stats.domains_count),
      new Date(run.created_at),
      sliderWeights
    );
  }, [isCustomWeights, run.findings, run.stats.domains_count, run.created_at, run.themes, sliderWeights]);

  const pct = (val: number) => Math.round(val * 100);

  const leadSpansFull = run.briefs.length >= 3 && run.briefs.length % 2 === 1;

  return (
    <section id="opportunities" className="scroll-mt-20 flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Ranked Opportunity Themes & Top 5 Briefs
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Auditable formula:{' '}
            <code className="font-mono text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-slate-800 dark:text-slate-200">
              {normalizedWeights.frequency.toFixed(2)}×frequency + {normalizedWeights.relevance.toFixed(2)}×avg_relevance + {normalizedWeights.urgency.toFixed(2)}×avg_urgency + {normalizedWeights.confidence.toFixed(2)}×avg_confidence + {normalizedWeights.recency.toFixed(2)}×recency
            </code>{' '}
            (evidence-verified findings only).
          </p>
        </div>
      </div>

      {/* Per-component Formula Breakdown Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-2xs print-break-inside-avoid transition-colors">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/40 dark:bg-slate-950/40">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Theme Scoring Matrix
            </h3>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Frequency = (theme domains / {Math.max(1, run.stats.domains_count)} total domains) × 100
            </span>
          </div>

          <div className="print-hide flex items-center gap-2">
            {isCustomWeights && (
              <button
                type="button"
                onClick={() => setSliderWeights(DEFAULT_SLIDERS)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3 h-3" />
                Reset defaults
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowTuner((prev) => !prev)}
              aria-expanded={showTuner}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                showTuner || isCustomWeights
                  ? 'border-teal-700 dark:border-teal-500 bg-teal-50/70 dark:bg-teal-950/50 text-teal-800 dark:text-teal-300'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {showTuner ? 'Hide weight tuner' : 'Tune formula weights'}
            </button>
          </div>
        </div>

        {showTuner && (
          <div className="print-hide px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Sensitivity simulation (weights normalize automatically to 100%)
              </span>
              {isCustomWeights && (
                <span className="text-xs text-teal-800 dark:text-teal-300 font-medium">
                  Custom weights active — matrix re-ranked client-side
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {WEIGHT_FIELDS.map(({ key, label }) => (
                <div key={key} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor={`weight-${key}`} className="font-medium text-slate-700 dark:text-slate-300">
                      {label}
                    </label>
                    <span className="font-mono font-semibold text-teal-800 dark:text-teal-300 tabular-nums">
                      {pct(normalizedWeights[key])}%
                    </span>
                  </div>
                  <input
                    id={`weight-${key}`}
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={sliderWeights[key]}
                    onChange={(e) =>
                      setSliderWeights((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                    className="w-full accent-teal-700 dark:accent-teal-500 cursor-pointer"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs font-medium text-slate-600 dark:text-slate-400">
                <th className="py-2.5 px-4">Theme</th>
                <th className="py-2.5 px-3 text-right font-mono">Score</th>
                <th className="py-2.5 px-3 text-right font-mono">
                  Freq ({pct(normalizedWeights.frequency)}%)
                </th>
                <th className="py-2.5 px-3 text-right font-mono">
                  Rel ({pct(normalizedWeights.relevance)}%)
                </th>
                <th className="py-2.5 px-3 text-right font-mono">
                  Urg ({pct(normalizedWeights.urgency)}%)
                </th>
                <th className="py-2.5 px-3 text-right font-mono">
                  Conf ({pct(normalizedWeights.confidence)}%)
                </th>
                <th className="py-2.5 px-3 text-right font-mono">
                  Rec ({pct(normalizedWeights.recency)}%)
                </th>
                <th className="py-2.5 px-3 text-right font-mono">Domains</th>
                <th className="py-2.5 px-4 text-right font-mono">Verified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {displayedThemes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 px-4 text-center text-xs text-slate-500 dark:text-slate-400">
                    No ranked themes available yet.
                  </td>
                </tr>
              ) : (
                displayedThemes.map((t, idx) => (
                  <tr
                    key={t.theme}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                      {onSelectTheme ? (
                        <button
                          type="button"
                          onClick={() => onSelectTheme(t.theme)}
                          className="inline-flex items-center gap-2 text-left hover:text-teal-800 dark:hover:text-teal-300 group cursor-pointer"
                        >
                          <span className="font-mono text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="group-hover:underline underline-offset-2">{t.theme}</span>
                          <ArrowRight className="w-3 h-3 text-slate-300 dark:text-slate-600 group-hover:text-teal-700 dark:group-hover:text-teal-400 opacity-0 group-hover:opacity-100 transition-opacity print-hide" />
                        </button>
                      ) : (
                        <>
                          <span className="font-mono text-xs text-slate-400 dark:text-slate-500 mr-2 tabular-nums">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          {t.theme}
                        </>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-teal-800 dark:text-teal-300 tabular-nums bg-teal-50/30 dark:bg-teal-950/30">
                      {t.theme_score.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      {t.frequency.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      {t.avg_relevance.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      {t.avg_urgency.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      {t.avg_confidence.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      {t.recency.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                      {t.distinct_domains}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                      {t.verified_finding_count}
                      {t.unverified_finding_count > 0 && (
                        <span className="text-amber-700 dark:text-amber-400 text-xs ml-1">
                          (+{t.unverified_finding_count} unverified)
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top 5 Opportunity Brief Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {run.briefs.length === 0 ? (
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 text-sm text-slate-500 dark:text-slate-400">
            No opportunity briefs were generated for this run.
          </div>
        ) : (
          run.briefs.slice(0, 5).map((brief, idx) => (
            <article
              key={`${brief.theme}-${idx}`}
              className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-2xs flex flex-col gap-4 print-break-inside-avoid transition-colors ${
                idx === 0 && leadSpansFull ? 'lg:col-span-2' : ''
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    Opportunity {String(idx + 1).padStart(2, '0')} · {brief.theme}
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                    {brief.title}
                  </h3>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-medium">
                    Theme Score
                  </div>
                  <div className="text-lg font-mono font-semibold text-teal-800 dark:text-teal-300 tabular-nums leading-tight">
                    {brief.theme_score.toFixed(1)}
                  </div>
                </div>
              </div>

              <div
                className={`text-sm text-slate-700 dark:text-slate-300 leading-relaxed grid gap-3.5 ${
                  idx === 0 && leadSpansFull ? 'md:grid-cols-3 md:gap-5' : 'grid-cols-1'
                }`}
              >
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-0.5">
                    What is happening
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">{brief.what_is_happening}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-0.5">
                    Why now
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">{brief.why_now}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-0.5">
                    Business angle
                  </div>
                  <p className="text-slate-700 dark:text-slate-300">{brief.business_angle}</p>
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex flex-col gap-2">
                <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Grounded Evidence
                </span>
                <ul className="flex flex-col gap-1.5">
                  {brief.evidence.map((ev, evIdx) => (
                    <li key={evIdx} className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                      “{ev.excerpt}”{' '}
                      <a
                        href={ev.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-teal-700 dark:text-teal-400 hover:text-teal-900 dark:hover:text-teal-300 underline underline-offset-2 font-medium"
                      >
                        Source <ExternalLink className="w-3 h-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 flex flex-col gap-1.5 text-xs">
                <div className="text-slate-800 dark:text-slate-200">
                  <span className="font-semibold text-slate-900 dark:text-slate-100">Next step: </span>
                  {brief.next_step}
                </div>
                <div className="text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-600 dark:text-slate-300">Caveats: </span>
                  {brief.caveats}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
};
