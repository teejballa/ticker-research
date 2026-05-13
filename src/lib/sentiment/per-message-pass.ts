// @model-card: docs/cards/MODEL-CARD-finbert-prosus.md
// src/lib/sentiment/per-message-pass.ts
//
// Plan 20-B-02 — FinBERT per-StockTwits-message orchestrator with 3-tier
// fallback chain + volume gate + per-ticker daily cost cap.
//
// Activates only when StockTwits `message_count > 50` (CONTEXT.md line 114 —
// 20-B-01 Gemini per-document is cost-prohibitive above that threshold).
// Each successful classification persists a `SentimentObservation` row (20-Z-01)
// tagged `classifier_version='finbert-prosus-{sha8}'` and `model_version`
// `finbert-prosus-{sha8}-v1`. Re-pin → bump MODEL_VERSION suffix to -v2; the
// 20-Z-01 composite-unique guard then preserves clean partitioning of
// historical rows.
//
// Fallback chain per message (T-20-B-02-01 mitigation):
//   1. HF endpoint  (classifyFinBERT — telemetered via Task 2 wrapper)
//   2. local CPU    (classifyFinBERTLocal — lazy-loaded @xenova/transformers)
//   3. null sentinel (classifier_score=null persisted with `-null` suffix)
//
// Cost cap (T-20-B-02-02 mitigation):
//   1000 messages/ticker/day. Today's count of `classifier_version LIKE
//   'finbert-prosus-%'` rows is read via prisma.$queryRaw; over-cap messages
//   skipped with `cost_capped_count++`.

import { Prisma } from '@prisma/client';
import { classifyFinBERT, FINBERT_PINNED_SHA8, type SentimentScore } from './finsentllm';
import {
  insertObservation,
  SentimentObservationDuplicateError,
  type AuthorFeaturesSnapshot,
} from './observation-store';
import { prisma } from '@/lib/db';

/** CONTEXT.md line 114 — Gemini per-document cost-prohibitive above 50 messages. */
export const VOLUME_GATE = 50;

/** CONTEXT.md $0.0001/call × 1000 = $0.10/ticker/day budget ceiling. */
export const COST_CAP_MESSAGES_PER_TICKER_PER_DAY = 1000;

/** Classifier version persisted on every SentimentObservation row. */
export const CLASSIFIER_VERSION = `finbert-prosus-${FINBERT_PINNED_SHA8}`;

/** Model version (partition key). Re-pin → bump to `-v2` so 20-Z-01 composite unique partitions cleanly. */
export const MODEL_VERSION = `${CLASSIFIER_VERSION}-v1`;

export type PerMessagePassMode = 'off' | 'shadow' | 'on';

export interface PerMessagePassMessage {
  message_id: string;
  body: string;
  author_handle: string;
  // LOOKAHEAD-OK: input-shape field. Carries upstream-claimed StockTwits timestamp into the DAO write only; the DAO writes it to an informational-only schema column (// PIT-INVARIANT marker on prisma/schema.prisma forbids backtest joins). The PIT join key is fetched_at, defaulted by Prisma at write time.
  published_at: Date | null;
  author_features: AuthorFeaturesSnapshot;
}

export interface PerMessagePassInput {
  ticker: string;
  messages: PerMessagePassMessage[];
}

export interface PerMessagePassResult {
  classified_count: number;       // total non-null OR null-persisted classifications written this call
  null_count: number;             // tier-3 (null sentinel) — same as tertiary_path_count
  cost_capped_count: number;      // messages skipped because daily cap reached
  primary_path_count: number;     // tier-1 (HF endpoint) successes
  secondary_path_count: number;   // tier-2 (local) successes
  tertiary_path_count: number;    // tier-3 (null sentinel) writes
}

function zeroResult(): PerMessagePassResult {
  return {
    classified_count: 0,
    null_count: 0,
    cost_capped_count: 0,
    primary_path_count: 0,
    secondary_path_count: 0,
    tertiary_path_count: 0,
  };
}

async function readTodayClassifiedCount(ticker: string): Promise<number> {
  // Prisma raw query: count of today's finbert-prosus-* rows for this ticker.
  // PIT-INVARIANT: fetched_at is the only PIT-safe join key (20-Z-01 schema).
  const rows = await prisma.$queryRaw<Array<{ count: bigint | number }>>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM sentiment_observations
      WHERE ticker = ${ticker}
        AND classifier_version LIKE 'finbert-prosus-%'
        AND fetched_at >= date_trunc('day', NOW())
    `,
  );
  if (!rows[0]) return 0;
  const c = rows[0].count;
  return typeof c === 'bigint' ? Number(c) : Number(c);
}

async function persist(
  ticker: string,
  message: PerMessagePassMessage,
  result: SentimentScore,
): Promise<boolean> {
  const success = result.score !== null;
  const classifier_version = success ? CLASSIFIER_VERSION : `${CLASSIFIER_VERSION}-null`;
  try {
    await insertObservation({
      ticker,
      source: 'stocktwits',
      message_id: message.message_id,
      raw_body: message.body,                 // hashed inside insertObservation (T-20-Z-01-02)
      classifier_version,
      classifier_score: result.score,
      model_version: MODEL_VERSION,
      decay_weight: null,                     // 20-A-03 populates later
      author_id: `stocktwits:${message.author_handle}`,
      author_features_snapshot: message.author_features,
      // LOOKAHEAD-OK: write-side passthrough into the 20-Z-01 DAO; the DAO writes published_at to an informational-only schema column (// PIT-INVARIANT marker forbids backtest joins). The PIT join key is fetched_at, defaulted by Prisma.
      published_at: message.published_at,
    });
    return true;
  } catch (err) {
    if (err instanceof SentimentObservationDuplicateError) {
      // Already classified earlier today under same model_version — skip silently.
      return false;
    }
    throw err;
  }
}

// Conditional dynamic-import resolver for the secondary tier. Extracted so
// tests can mock the local-finbert-fallback module without involving the real
// @xenova runtime. The import path here is exactly what the plan's <verify>
// grep expects (`await import.*local-finbert-fallback`).
async function callLocalFallback(text: string): Promise<SentimentScore> {
  const fallback = await import('./local-finbert-fallback');
  return fallback.classifyFinBERTLocal(text);
}

/**
 * Runs the FinBERT per-message classification pass.
 *
 * Mode contract (S3):
 *   - `off`    → returns zero-counts immediately; no classifier invoked.
 *   - `shadow` → classifier runs; rows persisted; no read consumers active yet.
 *   - `on`     → identical to shadow for now; consumer reads land in 20-A-03/20-B-04.
 *
 * Volume gate (S1): messages.length <= 50 → zero-counts; no classifier invoked.
 *
 * Cost cap (T-20-B-02-02): rejects messages once today's
 * `finbert-prosus-%`-versioned row count + in-call counter reaches 1000 per
 * ticker. Over-cap messages bump `cost_capped_count` and do NOT classify.
 *
 * Fallback chain (T-20-B-02-01):
 *   1. classifyFinBERT (HF endpoint, telemetered)
 *   2. classifyFinBERTLocal (lazy-loaded @xenova/transformers)
 *   3. null sentinel — STILL persists a row with classifier_score=null so the
 *      failure is visible in the PIT log (20-Z-01 D-04 conventions).
 */
export async function runPerMessagePass(
  input: PerMessagePassInput,
  mode: PerMessagePassMode,
): Promise<PerMessagePassResult> {
  if (mode === 'off') return zeroResult();
  if (input.messages.length <= VOLUME_GATE) return zeroResult();

  const counters = zeroResult();
  let todayCount = await readTodayClassifiedCount(input.ticker);

  for (const message of input.messages) {
    if (todayCount + counters.classified_count >= COST_CAP_MESSAGES_PER_TICKER_PER_DAY) {
      counters.cost_capped_count++;
      continue;
    }

    // Tier 1 — HF endpoint
    let result = await classifyFinBERT(message.body);
    if (result.score !== null) {
      const inserted = await persist(input.ticker, message, result);
      if (inserted) {
        counters.primary_path_count++;
        counters.classified_count++;
      }
      continue;
    }

    // Tier 2 — local CPU fallback (lazy-loaded)
    result = await callLocalFallback(message.body);
    if (result.score !== null) {
      const inserted = await persist(input.ticker, message, result);
      if (inserted) {
        counters.secondary_path_count++;
        counters.classified_count++;
      }
      continue;
    }

    // Tier 3 — null sentinel (still persist a row for PIT visibility)
    const inserted = await persist(input.ticker, message, result);
    if (inserted) {
      counters.tertiary_path_count++;
      counters.null_count++;
      counters.classified_count++;
    }
  }

  // Reference `todayCount` to satisfy strict no-unused-vars (it influenced the cap loop above).
  void todayCount;

  return counters;
}
