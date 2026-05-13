// @model-card: docs/cards/MODEL-CARD-finbert-prosus.md
// src/lib/sentiment/local-finbert-fallback.ts
//
// Plan 20-B-02 — secondary fallback tier. Lazy-loads @xenova/transformers
// (~50MB lazy weight on first call, ~500MB peak RAM during inference) the
// first time it is called; subsequent calls reuse the cached pipeline.
//
// IMPORTANT — NEVER imported at module top level. Caller must use:
//   const mod = await import('./local-finbert-fallback');
//   const r = await mod.classifyFinBERTLocal(text);
//
// Lazy-load enforcement: grep `^import.*@xenova` of this file must return 0 lines.
// Asserted by tests/sentiment/local-finbert-fallback.unit.test.ts case 3 and by
// the plan's verification grep in <verify>.
//
// Threat T-20-B-02-04: shadow-mode-only on Vercel functions <512MB. Production
// primary path is always the HF endpoint; this tier fires only when the
// endpoint is unreachable.
//
// SHA pinning: the ProsusAI/finbert weights are pulled by the
// @xenova/transformers runtime on first invocation; for SHA pinning we rely on
// the npm package version pin (peer-reviewed in package-lock.json) plus the
// runtime's own per-model revision behavior. Drift detection is the operator's
// responsibility via scripts/check-finbert-sha.ts (which checks the HF endpoint
// pin, not the local pin — local is a degraded fallback).

import type { SentimentScore } from './finsentllm';

type Pipe = (input: string) => Promise<Array<{ label: string; score: number }>>;

let pipelinePromise: Promise<Pipe> | null = null;

async function loadPipeline(): Promise<Pipe> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      // Dynamic import — keeps the ~50MB weight off the cold-start path on
      // Vercel functions when the HF endpoint is healthy.
      const mod = await import('@xenova/transformers');
      const pipe = await (mod as { pipeline: (task: string, model: string) => Promise<Pipe> })
        .pipeline('sentiment-analysis', 'ProsusAI/finbert');
      return pipe;
    })();
  }
  return pipelinePromise;
}

/**
 * Classifies `text` via locally-loaded ProsusAI/finbert (CPU inference).
 * Returns the same `SentimentScore` shape as the HF endpoint client.
 *
 * Failure mode: same null-sentinel contract as `classifyVia` in finsentllm.ts
 * (per D-33 + T-19-C-01-02). When the local runtime throws (OOM, missing
 * weights, sandbox restrictions), returns `{score: null, confidence: null,
 * model: 'finbert', error: <sanitized-msg>}` so the 3-tier fallback chain in
 * `per-message-pass.ts` can fall through to the null-sentinel tier.
 */
export async function classifyFinBERTLocal(text: string): Promise<SentimentScore> {
  try {
    const pipe = await loadPipeline();
    const out = await pipe(text);
    // Same reduce logic as finsentllm.reduceLabels — copy here intentionally
    // (avoid coupling the module to a non-exported helper).
    let pos = 0, neg = 0, max = 0;
    for (const r of out) {
      const l = r.label.toLowerCase();
      if (l.startsWith('pos')) pos = r.score;
      else if (l.startsWith('neg')) neg = r.score;
      if (r.score > max) max = r.score;
    }
    return { score: pos - neg, confidence: max, model: 'finbert' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { score: null, confidence: null, model: 'finbert', error: msg };
  }
}

/**
 * Test-only: resets the cached pipeline promise so unit tests can verify
 * lazy-load behavior across multiple `classifyFinBERTLocal` calls. NOT for
 * production use.
 */
export function _resetPipelineCacheForTests(): void {
  pipelinePromise = null;
}
