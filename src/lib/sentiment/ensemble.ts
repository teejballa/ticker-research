// @model-card: docs/cards/MODEL-CARD-finbert.md
// src/lib/sentiment/ensemble.ts
//
// Phase 19 / Plan 19-C-02 — FinSentLLM ensemble meta-classifier (D-34).
//
// Composes the three FinSentLLM primitives from 19-C-01 (FinGPT v3 +
// Mistral 7B finance-tuned + FinBERT) into a single weighted-average score
// with a model-agreement metric. Falls back to whatever subset of the three
// returned non-null SentimentScores; returns full nulls only if all three null.
//
// Pinned formulas (per threat T-19-C-02-02):
//   score        = Σ(score_i × conf_i) / Σ(conf_i)   over non-null per_model
//   confidence   = mean(conf_i)                       over non-null per_model
//   agreement    = 1 - std(score_i)                   over non-null per_model
//                  null when n_non_null < 2
//   per_model    = always 3 entries (FinGPT, Mistral-Fin, FinBERT) — even on error
//
// Robustness (per threat T-19-C-02-01):
//   - `Promise.allSettled` is used (NOT `Promise.all`) so one slow / rejected
//     model never blocks or crashes the ensemble.
//   - Rejections are surfaced as null-sentinel SentimentScore entries in
//     per_model so the caller has full telemetry without exception handling.
//
// Cold-start awareness (per RESEARCH Pitfall 4 / threat T-19-C-02-03):
//   - The shadow window for 19-C-02 is 7d; verdict uses latency p50 (not p95)
//     since HF endpoints can take 10-30s on the first invocation per
//     scale-to-zero. The ensemble itself does not gate on latency — it just
//     waits for `allSettled`. Operator can layer a Promise.race timeout in
//     a follow-up plan if shadow data shows it's needed.

import {
  classifyFinGPT,
  classifyMistralFin,
  classifyFinBERT,
  type SentimentScore,
} from '@/lib/sentiment/finsentllm';

export interface EnsembleResult {
  /** Weighted-average score over non-null per_model entries; null when all null. */
  score: number | null;
  /** Mean confidence over non-null per_model entries; null when all null. */
  confidence: number | null;
  /** 1 - std(non-null scores); null when fewer than 2 non-null contributors. */
  model_agreement: number | null;
  /** Always 3 entries (FinGPT, Mistral-Fin, FinBERT) — null sentinels on error. */
  per_model: SentimentScore[];
}

const MODELS: Array<SentimentScore['model']> = ['fingpt-v3', 'mistral-fin-7b', 'finbert'];

/**
 * Run all three FinSentLLM clients in parallel and reduce to a single
 * EnsembleResult. Never throws — null sentinels on error per D-33 contract.
 */
export async function ensembleSentiment(text: string): Promise<EnsembleResult> {
  const settled = await Promise.allSettled([
    classifyFinGPT(text),
    classifyMistralFin(text),
    classifyFinBERT(text),
  ]);

  const per_model: SentimentScore[] = settled.map((r, i) => {
    const model = MODELS[i];
    if (r.status === 'fulfilled') return r.value;
    const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
    return { score: null, confidence: null, model, error: `rejected: ${reason}` };
  });

  // Filter to contributors with both score AND confidence non-null. Either
  // alone is insufficient for the weighted-average formula.
  const valid = per_model.filter(
    (s): s is SentimentScore & { score: number; confidence: number } =>
      s.score !== null && s.confidence !== null,
  );

  if (valid.length === 0) {
    return { score: null, confidence: null, model_agreement: null, per_model };
  }

  const weightedSum = valid.reduce((acc, s) => acc + s.score * s.confidence, 0);
  const totalWeight = valid.reduce((acc, s) => acc + s.confidence, 0);
  const score = totalWeight > 0 ? weightedSum / totalWeight : null;

  const confidence =
    valid.reduce((acc, s) => acc + s.confidence, 0) / valid.length;

  // model_agreement = 1 - std(non-null scores). std(single sample) is 0,
  // which would make agreement=1 and overstate consensus — return null
  // instead so callers can distinguish "1 contributor" from "3 agreeing".
  let model_agreement: number | null = null;
  if (valid.length >= 2) {
    const scores = valid.map(s => s.score);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance =
      scores.reduce((acc, x) => acc + (x - mean) ** 2, 0) / scores.length;
    model_agreement = 1 - Math.sqrt(variance);
  }

  return { score, confidence, model_agreement, per_model };
}
