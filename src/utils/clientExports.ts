import type { SignalRun } from '../shared/types.ts';
import { findingsToCsv, generateFindingsMarkdownNote } from '../server/logic/exportFormatters.ts';

function triggerDownload(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function slugifyTopic(topic: string): string {
  return (
    topic
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'signal-run'
  );
}

export function downloadFindingsCsv(run: SignalRun) {
  const csv = findingsToCsv(run.findings);
  triggerDownload(`${slugifyTopic(run.topic)}-findings.csv`, csv, 'text/csv;charset=utf-8;');
}

export function downloadFindingsJson(run: SignalRun) {
  triggerDownload(
    `${slugifyTopic(run.topic)}-findings.json`,
    JSON.stringify(run.findings, null, 2),
    'application/json;charset=utf-8;'
  );
}

export function downloadBriefsJson(run: SignalRun) {
  triggerDownload(
    `${slugifyTopic(run.topic)}-briefs.json`,
    JSON.stringify(run.briefs, null, 2),
    'application/json;charset=utf-8;'
  );
}

export function downloadFindingsMarkdownNote(run: SignalRun) {
  const md = generateFindingsMarkdownNote(run);
  triggerDownload(`${slugifyTopic(run.topic)}-findings-note.md`, md, 'text/markdown;charset=utf-8;');
}
