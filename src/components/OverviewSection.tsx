import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CATEGORY_LABELS, type SignalCategory, type SignalRun } from '../shared/types.ts';

interface OverviewSectionProps {
  run: SignalRun;
  isDark?: boolean;
  onSelectCategory?: (category: SignalCategory) => void;
  onSelectTheme?: (theme: string) => void;
  onSelectDomain?: (domain: string) => void;
}

export const OverviewSection: React.FC<OverviewSectionProps> = ({
  run,
  isDark = false,
  onSelectCategory,
  onSelectTheme,
  onSelectDomain,
}) => {
  const categoryData = useMemo(() => {
    const counts = new Map<SignalCategory, number>();
    for (const f of run.findings) {
      counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
    }
    return (Object.keys(CATEGORY_LABELS) as SignalCategory[]).map((cat) => ({
      categoryKey: cat,
      name: CATEGORY_LABELS[cat],
      count: counts.get(cat) ?? 0,
    }));
  }, [run.findings]);

  const themeData = useMemo(() => {
    return run.themes
      .filter((t) => t.verified_finding_count > 0)
      .slice(0, 8)
      .map((t) => ({
        name: t.theme.length > 20 ? `${t.theme.slice(0, 19)}…` : t.theme,
        fullName: t.theme,
        score: t.theme_score,
      }));
  }, [run.themes]);

  const domainData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of run.findings) {
      counts.set(f.domain, (counts.get(f.domain) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([domain, count]) => ({
        domain: domain.length > 20 ? `${domain.slice(0, 19)}…` : domain,
        fullDomain: domain,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [run.findings]);

  const kpis = [
    {
      label: 'Pages Crawled',
      value: run.stats.crawled_count,
      note: `${run.stats.skipped_count} skipped · ${run.stats.failed_count} failed`,
      accent: false,
    },
    {
      label: 'Distinct Domains',
      value: run.stats.domains_count,
      note: 'Max 8 pages/domain cap',
      accent: false,
    },
    {
      label: 'Useful Signals',
      value: run.stats.useful_signals_count,
      note: `${run.stats.unverified_count} unverified`,
      accent: true,
    },
    {
      label: 'Irrelevant Pages',
      value: run.stats.irrelevant_count,
      note: 'Excluded from briefs',
      accent: false,
    },
    {
      label: 'Ranked Themes',
      value: run.stats.themes_count,
      note: 'Verified evidence only',
      accent: true,
    },
  ];

  const handleBarClick = (
    callback: ((val: string) => void) | undefined,
    payload: unknown,
    key: string
  ) => {
    if (!callback || !payload || typeof payload !== 'object') return;
    const record = payload as Record<string, unknown>;
    const raw = record[key] ?? (record.payload as Record<string, unknown> | undefined)?.[key];
    if (typeof raw === 'string' && raw) {
      callback(raw);
    }
  };

  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const xTickFill = isDark ? '#94a3b8' : '#64748b';
  const yTickFill = isDark ? '#cbd5e1' : '#334155';
  const cursorFill = isDark ? '#1e293b' : '#f1f5f9';
  const tooltipStyle = {
    fontSize: 12,
    borderRadius: 6,
    backgroundColor: isDark ? '#0f172a' : '#ffffff',
    border: isDark ? '1px solid #334155' : '1px solid #cbd5e1',
    color: isDark ? '#f1f5f9' : '#0f172a',
    boxShadow: isDark
      ? '0 4px 14px rgba(0, 0, 0, 0.45)'
      : '0 4px 12px rgba(15, 23, 42, 0.06)',
  };
  const tooltipLabelStyle = { color: isDark ? '#f8fafc' : '#0f172a', fontWeight: 600 };
  const tooltipItemStyle = { color: isDark ? '#e2e8f0' : '#0f172a' };

  return (
    <section id="overview" className="scroll-mt-20 flex flex-col gap-5">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-2xs grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 transition-colors">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="px-5 py-4 flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {kpi.label}
            </span>
            <span
              className={`text-[26px] leading-tight font-semibold font-mono tabular-nums ${
                kpi.accent
                  ? 'text-teal-800 dark:text-teal-400'
                  : 'text-slate-900 dark:text-slate-100'
              }`}
            >
              {kpi.value}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">{kpi.note}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-2xs flex flex-col gap-3 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Signal Categories
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Distribution across analyzed pages
              </p>
            </div>
            {onSelectCategory && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                Click to filter
              </span>
            )}
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={categoryData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: xTickFill }}
                  axisLine={{ stroke: gridStroke }}
                  tickLine={{ stroke: gridStroke }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={126}
                  tick={{ fontSize: 11, fill: yTickFill }}
                  axisLine={{ stroke: gridStroke }}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: cursorFill }}
                  contentStyle={tooltipStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Bar
                  dataKey="count"
                  name="Findings"
                  fill={isDark ? '#14b8a6' : '#0f766e'}
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(data) =>
                    handleBarClick(
                      (val) => onSelectCategory?.(val as SignalCategory),
                      data,
                      'categoryKey'
                    )
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-2xs flex flex-col gap-3 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Theme Opportunity Scores
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Weighted 0–100 (verified only)
              </p>
            </div>
            {onSelectTheme && themeData.length > 0 && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                Click to filter
              </span>
            )}
          </div>
          <div className="h-56 w-full">
            {themeData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                No verified themes ranked yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={themeData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: xTickFill }}
                    axisLine={{ stroke: gridStroke }}
                    tickLine={{ stroke: gridStroke }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    tick={{ fontSize: 11, fill: yTickFill }}
                    axisLine={{ stroke: gridStroke }}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: cursorFill }}
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Bar
                    dataKey="score"
                    name="Score"
                    fill={isDark ? '#38bdf8' : '#0284c7'}
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(data) => handleBarClick(onSelectTheme, data, 'fullName')}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-2xs flex flex-col gap-3 transition-colors">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Findings per Domain
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Source diversity across sites
              </p>
            </div>
            {onSelectDomain && domainData.length > 0 && (
              <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                Click to filter
              </span>
            )}
          </div>
          <div className="h-56 w-full">
            {domainData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
                No domain data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={domainData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: xTickFill }}
                    axisLine={{ stroke: gridStroke }}
                    tickLine={{ stroke: gridStroke }}
                  />
                  <YAxis
                    type="category"
                    dataKey="domain"
                    width={140}
                    tick={{ fontSize: 11, fill: yTickFill }}
                    axisLine={{ stroke: gridStroke }}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: cursorFill }}
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Bar
                    dataKey="count"
                    name="Pages"
                    fill={isDark ? '#94a3b8' : '#475569'}
                    radius={[0, 4, 4, 0]}
                    cursor="pointer"
                    onClick={(data) => handleBarClick(onSelectDomain, data, 'fullDomain')}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
