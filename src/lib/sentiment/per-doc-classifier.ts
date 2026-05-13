// src/lib/sentiment/per-doc-classifier.ts
// Plan 20-B-01 — Gemini per-document sentiment + aspect classifier.
//
// One batched Gemini call per ticker (NOT one per doc) defends T-20-B-01-02
// cost runaway. One retry on Zod-enum / range violation defends
// T-20-B-01-01 (aspect hallucination outside the fixed taxonomy). Final
// fallback emits records with aspects:[] polarity:0 confidence:0 — the
// classifier NEVER fabricates an aspect outside ASPECT_TAGS.
//
// Wrapped in withTelemetry('gemini', ...) per 20-Z-03 S6 so every batch logs a
// row to ProviderCallLog (latency, status, cost, retry_count, ticker context).
//
// Prompt is pinned to gemini-per-doc-sentiment@v1 via the 20-Z-04 registry —
// any body edit without a sibling _v2/ directory fails the CI golden-snapshot
// gate (T-20-B-01-05 prompt drift mitigation).

import { generateText, Output } from 'ai';
import { z } from 'zod';
import { renderPrompt } from '@/lib/prompts/render';
import { withTelemetry } from '@/lib/telemetry/withTelemetry';
import { GEMINI_TOKEN_RATES } from '@/lib/telemetry/cost-estimators';
import { ASPECT_TAGS, type AspectTag } from './aspects';

export interface PerDocInput {
  /** Stable id — for news, sha256(url) prefix; for community, `${source}:${message_id}`. */
  doc_id: string;
  /** Full body text — caller is responsible for truncation (recommend <=2000 chars). */
  text: string;
  /** Routing for telemetry tagging. */
  source: 'news' | 'community';
}

export interface PerDocSentimentResult {
  doc_id: string;
  polarity: number; // Zod-enforced [-1, +1]
  confidence: number; // Zod-enforced [0, +1]
  aspects: AspectTag[]; // ⊆ ASPECT_TAGS; max 7; empty means "no aspect applies / off-topic"
}

export interface ClassifyOpts {
  /** Override default prompt version pin (gemini-per-doc-sentiment@v1). */
  promptVersion?: 'v1' | 'v2';
  /** Optional ticker context surfaced into ProviderCallLog rows. */
  ticker?: string;
  /** Injected for tests — defaults to renderPrompt + generateText structured pipeline. */
  _gemini?: (prompt: string) => Promise<unknown>;
}

const PerDocSchema = z.object({
  doc_id: z.string().min(1),
  polarity: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
  aspects: z.array(z.enum(ASPECT_TAGS)).max(7),
});

const ResponseSchema = z.object({
  per_document_sentiment: z.array(PerDocSchema),
});

const RETRY_APPENDIX =
  '\n\nRETRY: aspects MUST be one of: earnings, guidance, regulatory, M&A, macro, product, management. Return [] if no aspect applies. polarity ∈ [-1,+1]. confidence ∈ [0,1]. doc_id MUST echo the input doc_id verbatim. Return ONLY the JSON object — no prose.';

/**
 * Single batched Gemini call per input array. One retry on Zod failure;
 * final fallback returns per-doc records with aspects:[] polarity:0 confidence:0
 * (NEVER fabricates an aspect outside ASPECT_TAGS).
 *
 * Empty input → returns [] without calling Gemini (T-20-B-01-02 cost defense).
 * Empty doc_id in any input → throws synchronously (caller-side contract violation).
 */
export async function classifyDocumentsBatch(
  docs: PerDocInput[],
  opts: ClassifyOpts = {},
): Promise<PerDocSentimentResult[]> {
  if (!Array.isArray(docs) || docs.length === 0) return [];

  // Input-contract validation — caller-side bug; NOT retried.
  for (const d of docs) {
    if (!d || typeof d.doc_id !== 'string' || d.doc_id.length === 0) {
      throw new Error('PerDocInput.doc_id must be a non-empty string');
    }
  }

  const prompt = renderPrompt(
    'gemini-per-doc-sentiment',
    { docs_json: JSON.stringify(docs.map((d) => ({ doc_id: d.doc_id, text: d.text }))) },
    opts.promptVersion ?? 'v1',
  );

  const callGemini =
    opts._gemini ??
    (async (p: string) => {
      // AI SDK v6: generateText + Output.object for structured outputs through the AI Gateway.
      // Model pinned per S5 (CONTEXT.md pinned-versions invariant).
      const res = await generateText({
        model: 'google/gemini-3.1-flash-lite',
        output: Output.object({ schema: ResponseSchema }),
        prompt: p,
      });
      return (res as unknown as { experimental_output?: unknown }).experimental_output ?? res;
    });

  // Single withTelemetry wrap covers BOTH attempts as one logical batch call
  // — the retry_count on ProviderCallLog increments when we hit the catch path.
  return withTelemetry(
    'gemini',
    async () => {
      // Attempt 1
      try {
        const raw = await callGemini(prompt);
        const parsed = ResponseSchema.parse(raw);
        return parsed.per_document_sentiment as PerDocSentimentResult[];
      } catch {
        // Attempt 2 — appendix reminds Gemini of the enum + ranges.
        try {
          const raw2 = await callGemini(prompt + RETRY_APPENDIX);
          const parsed2 = ResponseSchema.parse(raw2);
          return parsed2.per_document_sentiment as PerDocSentimentResult[];
        } catch {
          // Final fallback: aspects:[] polarity:0 confidence:0 — NEVER fabricates an aspect.
          return docs.map<PerDocSentimentResult>((d) => ({
            doc_id: d.doc_id,
            polarity: 0,
            confidence: 0,
            aspects: [],
          }));
        }
      }
    },
    {
      ticker: opts.ticker,
      // Token-rate-based cost; falls back to flat per-call estimate if usage is absent.
      cost_usd_estimator: (r: unknown) => {
        const usage = (r as { usage?: { inputTokens?: number; outputTokens?: number } })?.usage;
        if (!usage) return 0;
        const inTok = usage.inputTokens ?? 0;
        const outTok = usage.outputTokens ?? 0;
        return inTok * GEMINI_TOKEN_RATES.input + outTok * GEMINI_TOKEN_RATES.output;
      },
    },
  );
}
