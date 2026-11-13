import fs from 'node:fs/promises';
import path from 'node:path';
import type { RunSummary, SignalRun } from '../../shared/types.ts';

const RUNS_DIR = path.resolve(process.cwd(), 'data', 'runs');
const INDEX_PATH = path.join(RUNS_DIR, 'index.json');

async function ensureRunsDir(): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
}

function toSummary(run: SignalRun): RunSummary {
  return {
    id: run.id,
    created_at: run.created_at,
    topic: run.topic,
    keywords: run.keywords,
    is_sample: run.is_sample,
    status: run.status,
    useful_signals_count: run.stats.useful_signals_count,
    crawled_count: run.stats.crawled_count,
    domains_count: run.stats.domains_count,
  };
}

export async function saveRun(run: SignalRun): Promise<void> {
  await ensureRunsDir();
  const safeId = run.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const runPath = path.join(RUNS_DIR, `${safeId}.json`);
  const tmpPath = `${runPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(run, null, 2), 'utf8');
  await fs.rename(tmpPath, runPath);

  // Update index.json
  const summaries = await listRuns();
  const nextSummary = toSummary(run);
  const existingIdx = summaries.findIndex((s) => s.id === run.id);
  if (existingIdx >= 0) {
    summaries[existingIdx] = nextSummary;
  } else {
    summaries.unshift(nextSummary);
  }
  summaries.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const tmpIndex = `${INDEX_PATH}.tmp`;
  await fs.writeFile(tmpIndex, JSON.stringify(summaries, null, 2), 'utf8');
  await fs.rename(tmpIndex, INDEX_PATH);
}

export async function loadRun(id: string): Promise<SignalRun | null> {
  await ensureRunsDir();
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  const runPath = path.join(RUNS_DIR, `${safeId}.json`);
  try {
    const raw = await fs.readFile(runPath, 'utf8');
    return JSON.parse(raw) as SignalRun;
  } catch {
    return null;
  }
}

export async function deleteRun(id: string): Promise<boolean> {
  await ensureRunsDir();
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return false;
  const runPath = path.join(RUNS_DIR, `${safeId}.json`);
  let fileDeleted = false;
  try {
    await fs.unlink(runPath);
    fileDeleted = true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      throw err;
    }
  }

  const summaries = await listRuns();
  const nextSummaries = summaries.filter((s) => s.id !== safeId);
  const removedFromIndex = nextSummaries.length !== summaries.length;
  if (removedFromIndex) {
    const tmpIndex = `${INDEX_PATH}.tmp`;
    await fs.writeFile(tmpIndex, JSON.stringify(nextSummaries, null, 2), 'utf8');
    await fs.rename(tmpIndex, INDEX_PATH);
  }

  return fileDeleted || removedFromIndex;
}

export async function listRuns(): Promise<RunSummary[]> {
  await ensureRunsDir();
  try {
    const raw = await fs.readFile(INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as RunSummary[];
  } catch {
    // Reconstruct index from directory if index.json missing
    try {
      const files = await fs.readdir(RUNS_DIR);
      const summaries: RunSummary[] = [];
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'index.json') {
          try {
            const content = await fs.readFile(path.join(RUNS_DIR, file), 'utf8');
            const run = JSON.parse(content) as SignalRun;
            summaries.push(toSummary(run));
          } catch {
            // Skip corrupted file
          }
        }
      }
      summaries.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      return summaries;
    } catch {
      return [];
    }
  }
  return [];
}
