import { CATEGORY_LABELS, type Finding, type SignalRun } from '../../shared/types.ts';

function csvEscape(value: string | number | boolean | undefined): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function findingsToCsv(findings: Finding[]): string {
  const headers = [
    'id',
    'category',
    'theme',
    'evidence_verified',
    'relevance',
    'urgency',
    'confidence',
    'who',
    'summary',
    'evidence',
    'reasoning',
    'domain',
    'title',
    'source_url',
    'crawl_date',
    'publish_date',
  ];

  const rows = findings.map((f) =>
    [
      f.id,
      CATEGORY_LABELS[f.category] ?? f.category,
      f.theme,
      f.evidence_verified,
      f.relevance,
      f.urgency,
      f.confidence,
      f.who,
      f.summary,
      f.evidence,
      f.reasoning,
      f.domain,
      f.title,
      f.source_url,
      f.crawl_date,
      f.publish_date ?? '',
    ]
      .map(csvEscape)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

export function generateFindingsMarkdownNote(run: SignalRun): string {
  const lines: string[] = [];
  lines.push(`# Market Signal Findings Note: ${run.topic}`);
  lines.push('');
  lines.push(`- **Run ID**: \`${run.id}\``);
  lines.push(`- **Generated**: ${new Date(run.created_at).toISOString().slice(0, 10)}`);
  if (run.keywords) {
    lines.push(`- **Keywords**: ${run.keywords}`);
  }
  lines.push(
    `- **Coverage**: ${run.stats.crawled_count} pages crawled across ${run.stats.domains_count} domains (${run.stats.useful_signals_count} useful signals, ${run.stats.irrelevant_count} irrelevant)`
  );
  if (run.is_sample) {
    lines.push(`- **Dataset Notice**: Pre-built sample dataset`);
  }
  lines.push('');
  lines.push('## Scoring Formula');
  lines.push(
    '`theme_score = 0.30*frequency + 0.25*avg_relevance + 0.20*avg_urgency + 0.15*avg_confidence + 0.10*recency` (calculated exclusively from evidence-verified findings).'
  );
  lines.push('');
  lines.push('## Top 5 Opportunity Briefs');
  lines.push('');

  const topBriefs = run.briefs.slice(0, 5);
  if (topBriefs.length === 0) {
    lines.push('_No opportunity briefs generated for this run._');
  } else {
    topBriefs.forEach((brief, index) => {
      lines.push(`### ${index + 1}. ${brief.title} (Theme: ${brief.theme} — Score ${brief.theme_score.toFixed(1)})`);
      lines.push('');
      lines.push(`**What is happening:** ${brief.what_is_happening}`);
      lines.push('');
      lines.push(`**Why now:** ${brief.why_now}`);
      lines.push('');
      lines.push(`**Business angle:** ${brief.business_angle}`);
      lines.push('');
      lines.push('**Evidence:**');
      brief.evidence.forEach((ev) => {
        lines.push(`- "${ev.excerpt}" — [Source](${ev.source_url})`);
      });
      lines.push('');
      lines.push(`**Next step:** ${brief.next_step}`);
      lines.push('');
      lines.push(`**Caveats:** ${brief.caveats}`);
      lines.push('');
    });
  }

  lines.push('---');
  lines.push(
    '_Note: AI-assigned scores are analytical estimates derived from retrieved public snippets, not objective market measurements. Small-sample and search-visibility biases apply._'
  );

  return lines.join('\n');
}
