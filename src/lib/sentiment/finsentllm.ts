// @model-card: docs/cards/MODEL-CARD-finbert-prosus.md
// src/lib/sentiment/finsentllm.ts
//
// FinSentLLM clients per CONTEXT decision D-33.
//
// Three independent HuggingFace Inference Endpoint clients (FinGPT v3,
// Mistral 7B finance-tuned, FinBERT) returning a uniform `SentimentScore`.
// Per D-33 + threat T-19-C-01-02, errors return null sentinels rather than
// throwing — the C-02 ensemble degrades gracefully when 1-2 clients null
// out (cold-start latency, rate limits, etc.).
//
// IMPORTANT: HF model revision SHAs MUST be pinned in the endpoint URL itself
// (RESEARCH Open Question 1 — pin HF model revisions). Endpoint env vars
// should look like:
//
//     HF_FINGPT_ENDPOINT=https://<id>.aws.endpoints.huggingface.cloud/fingpt-v3@<commit-sha>
//     HF_MISTRAL_FIN_ENDPOINT=https://<id>.aws.endpoints.huggingface.cloud/mistral-fin-7b@<commit-sha>
//     HF_FINBERT_ENDPOINT=https://<id>.aws.endpoints.huggingface.cloud/finbert@<commit-sha>
//
// The implementer/operator MUST verify pinned revisions at deploy time and
// record the specific revisions in `.env.local` for production. Without
// pinning, HF model upgrades can silently change scoring distributions.
//
// SECURITY (T-19-C-01-01): endpoint URLs include opaque IDs and are
// secrets. We never log the endpoint URL on error — only the SDK error
// message (which the SDK is responsible for sanitizing).

import { HfInference } from '@huggingface/inference';
import { withTelemetry } from '@/lib/telemetry/withTelemetry';

export interface SentimentScore {
  score: number | null;        // [-1, 1] — positive bullish, negative bearish
  confidence: number | null;   // [0, 1] — max class probability
  model: 'fingpt-v3' | 'mistral-fin-7b' | 'finbert';
  error?: string;
}

/**
 * Plan 20-B-02 — first 8 hex chars of the pinned ProsusAI/finbert commit SHA.
 *
 * Verified 2026-05-13 by GETting https://huggingface.co/api/models/ProsusAI/finbert
 * (model.sha = `4556d13015211d73dccd3fdd39d39232506f3e43`).
 *
 * Re-pin procedure (T-20-B-02-05 mitigation):
 *   1. Bump this constant to the new SHA's first 8 hex chars.
 *   2. Bump `MODEL_VERSION` suffix in src/lib/sentiment/per-message-pass.ts
 *      from `-v1` to `-v2` so 20-Z-01 composite unique enforces clean
 *      partitioning of historical SentimentObservation rows.
 *   3. Re-run `npm run check-finbert-sha` to confirm the new value matches
 *      HF main.
 */
export const FINBERT_PINNED_SHA8 = '4556d130';

function getClient(): HfInference {
  const token = process.env.HF_INFERENCE_TOKEN;
  if (!token) throw new Error('HF_INFERENCE_TOKEN not set');
  return new HfInference(token);
}

/**
 * Reduce HF text-classification output to a unified bullish/bearish score.
 *
 * Per threat T-19-C-01-03, label matching is prefix-based (`pos*`, `neg*`).
 * Labels not matching either prefix do not contribute — yielding a
 * conservative neutral (score=0) when a model returns only `neutral`-class
 * outputs.
 */
function reduceLabels(out: Array<{ label: string; score: number }>): { score: number; confidence: number } {
  let pos = 0, neg = 0, max = 0;
  for (const r of out) {
    const l = r.label.toLowerCase();
    if (l.startsWith('pos')) pos = r.score;
    else if (l.startsWith('neg')) neg = r.score;
    if (r.score > max) max = r.score;
  }
  return { score: pos - neg, confidence: max };
}

async function classifyVia(
  model: SentimentScore['model'],
  endpointEnv: string,
  text: string,
): Promise<SentimentScore> {
  try {
    const endpoint = process.env[endpointEnv];
    if (!endpoint) throw new Error(`${endpointEnv} not set`);
    const client = getClient();
    const out = await client.textClassification({ model: endpoint, inputs: text });
    const arr = Array.isArray(out) ? out : [out];
    const { score, confidence } = reduceLabels(arr as Array<{ label: string; score: number }>);
    return { score, confidence, model };
  } catch (err) {
    // SECURITY: do not log endpoint URL (per T-19-C-01-01).
    const msg = err instanceof Error ? err.message : String(err);
    return { score: null, confidence: null, model, error: msg };
  }
}

export const classifyFinGPT     = (text: string) => classifyVia('fingpt-v3',      'HF_FINGPT_ENDPOINT', text);
export const classifyMistralFin = (text: string) => classifyVia('mistral-fin-7b', 'HF_MISTRAL_FIN_ENDPOINT', text);

/**
 * Plan 20-B-02 — FinBERT per-message backstop wrapped in 20-Z-03 telemetry.
 *
 * `withTelemetry('finbert-hf', ..., { cost_usd_estimator: () => 0.0001 })`
 * persists ProviderCallLog rows so `/insights/sentiment-health` renders a
 * `finbert-hf` provider tile with non-zero data after one shadow-mode cron tick.
 *
 * Cost basis: CONTEXT.md line 67 — `$0.033/hr CPU × ~80 inferences/hr ≈ $0.0001/call`.
 * Signature preserved (`(text: string) => Promise<SentimentScore>`); the
 * underlying `classifyVia` still returns the null-sentinel on error per D-33.
 */
export const classifyFinBERT = (text: string): Promise<SentimentScore> =>
  withTelemetry(
    'finbert-hf',
    () => classifyVia('finbert', 'HF_FINBERT_ENDPOINT', text),
    { cost_usd_estimator: () => 0.0001 },
  );
