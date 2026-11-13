import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipelineManager } from './src/server/services/pipeline.ts';
import { deleteRun, listRuns, loadRun, saveRun } from './src/server/services/storage.ts';
import { buildSampleRun } from './src/server/data/sampleRun.ts';
import { hasGeminiApiKey, hasGroqApiKey } from './src/server/services/groqClient.ts';
import type { LlmProvider } from './src/shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function parseSeedUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((u) => (typeof u === 'string' ? u.trim() : ''))
      .filter((u) => u.startsWith('http://') || u.startsWith('https://'));
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => u.startsWith('http://') || u.startsWith('https://'));
  }
  return [];
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      providers: {
        gemini: hasGeminiApiKey(),
        groq: hasGroqApiKey(),
      },
    });
  });

  app.get('/api/runs', async (_req, res) => {
    try {
      const runs = await listRuns();
      res.json({ runs });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to list runs' });
    }
  });

  app.post('/api/runs/sample', async (_req, res) => {
    try {
      const sample = buildSampleRun();
      await saveRun(sample);
      res.json({ run: sample });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load sample run' });
    }
  });

  app.get('/api/runs/:id', async (req, res) => {
    const { id } = req.params;
    const active = pipelineManager.getRunState(id);
    if (active) {
      res.json({ run: active });
      return;
    }
    const stored = await loadRun(id);
    if (stored) {
      res.json({ run: stored });
      return;
    }
    if (id === 'sample-ev-pune') {
      const sample = buildSampleRun();
      await saveRun(sample);
      res.json({ run: sample });
      return;
    }
    res.status(404).json({ error: 'Run not found' });
  });

  app.post('/api/run', async (req, res) => {
    const body = req.body ?? {};
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    const keywords = typeof body.keywords === 'string' ? body.keywords.trim() : '';
    const seedUrls = parseSeedUrls(body.seedUrls);
    const maxPagesRaw = Number(body.maxPages ?? 30);
    const maxPages = Number.isFinite(maxPagesRaw) ? Math.max(25, Math.min(40, Math.round(maxPagesRaw))) : 30;
    const rawProvider = typeof body.provider === 'string' ? body.provider.trim().toLowerCase() : 'auto';
    const provider: LlmProvider =
      rawProvider === 'groq' || rawProvider === 'gemini' ? rawProvider : 'auto';

    if (!topic || topic.length < 3) {
      res.status(400).json({ error: 'Please enter a research topic (at least 3 characters).' });
      return;
    }

    if (provider === 'groq' && !hasGroqApiKey()) {
      res.status(400).json({
        error: 'GROQ_API_KEY is not configured on the server. Add GROQ_API_KEY in AI Studio Secrets (or switch provider to Auto / Gemini).',
      });
      return;
    }

    if (provider === 'gemini' && !hasGeminiApiKey()) {
      res.status(400).json({
        error: 'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in AI Studio Secrets.',
      });
      return;
    }

    if (!hasGeminiApiKey() && !hasGroqApiKey()) {
      res.status(500).json({
        error: 'No LLM API key is configured. Add GEMINI_API_KEY or GROQ_API_KEY in AI Studio Secrets.',
      });
      return;
    }

    try {
      const run = await pipelineManager.startRun({
        topic,
        keywords,
        seedUrls,
        maxPages,
        provider,
      });
      res.status(202).json({ runId: run.id, run });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to start crawl run' });
    }
  });

  app.post('/api/runs/:id/cancel', (req, res) => {
    const cancelled = pipelineManager.cancelRun(req.params.id);
    res.json({ ok: cancelled });
  });

  app.delete('/api/runs/:id', async (req, res) => {
    const { id } = req.params;
    pipelineManager.cancelRun(id);
    try {
      const deleted = await deleteRun(id);
      if (!deleted) {
        res.status(404).json({ error: 'Run not found' });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete run' });
    }
  });

  app.get('/api/run/:id/stream', async (req, res) => {
    const { id } = req.params;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const activeRun = pipelineManager.getRunState(id);
    const emitter = pipelineManager.getEmitter(id);

    if (!activeRun || !emitter) {
      const stored = await loadRun(id);
      if (stored) {
        sendEvent('update', stored);
        sendEvent('complete', stored);
      } else {
        sendEvent('error', { error: 'Run not found' });
      }
      res.end();
      return;
    }

    sendEvent('update', activeRun);
    if (activeRun.status !== 'running') {
      sendEvent('complete', activeRun);
      res.end();
      return;
    }

    const onUpdate = (updatedRun: unknown) => {
      sendEvent('update', updatedRun);
    };
    const onComplete = (finalRun: unknown) => {
      sendEvent('complete', finalRun);
      cleanup();
      res.end();
    };

    const heartbeat = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000);

    const cleanup = () => {
      clearInterval(heartbeat);
      emitter.off('update', onUpdate);
      emitter.off('complete', onComplete);
    };

    emitter.on('update', onUpdate);
    emitter.on('complete', onComplete);
    req.on('close', cleanup);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Web Signal Hunter running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
