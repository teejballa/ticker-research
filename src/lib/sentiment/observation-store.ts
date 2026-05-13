/**
 * Plan 20-Z-01 — Sentiment feature store with PIT snapshots.
 *
 * Insert-only DAO for SentimentObservation. Enforces:
 *  - SHA-256 hashing of raw bodies (T-20-Z-01-02 — raw text never persisted)
 *  - Allowlist on author_features_snapshot keys (T-20-Z-01-01 — PII defense)
 *  - Runtime rejection of UPDATE-shaped calls (T-20-Z-01-04 — model_version partition integrity)
 *
 * Read consumers come in later plans (20-A-03 time decay, 20-B-01 per-doc NLP,
 * 20-B-04 source-tier weighting, 20-C-01 per-source ICIR). This plan ships writes
 * only — that is why no shadow lifecycle is required (S3 documented skip).
 */
import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

export type SentimentObservationSource =
  | 'stocktwits' | 'reddit' | 'x' | 'news' | 'sec' | 'apewisdom' | 'firecrawl';

// T-20-Z-01-01 — allowlist. Widening this list requires a new model_version (S2 immutability).
const AUTHOR_FEATURE_ALLOWLIST = [
  'account_age_days',
  'follower_count',
  'is_verified',
  'message_count_30d',
] as const;

export type AuthorFeaturesSnapshot = {
  account_age_days: number | null;
  follower_count: number | null;
  is_verified: boolean | null;
  message_count_30d: number | null;
};

export interface SentimentObservationInput {
  ticker: string;
  source: SentimentObservationSource;
  message_id: string;
  raw_body: string;
  classifier_version: string;
  classifier_score: number | null;
  model_version: string;
  decay_weight: number | null;
  author_id: string;
  author_features_snapshot: AuthorFeaturesSnapshot;
  fetched_at?: Date;
  // LOOKAHEAD-OK: DAO input field — published_at is informational only (Plan 20-Z-01 schema marker); never used in backtest joins. The PIT join key is fetched_at. Static-check exemption granted because this is a WRITE-side type, not a query.
  published_at?: Date | null;
  // Plan 20-B-01 — fixed 7-element AspectTag taxonomy (subset). Empty default for
  // pre-20-B-01 callers; 20-B-01 per-doc classifier populates this column directly.
  // Widening the taxonomy requires a new model_version per S2 immutability.
  aspects?: string[];
}

export class SentimentObservationDuplicateError extends Error {
  constructor(
    public readonly ticker: string,
    public readonly message_id: string,
    public readonly model_version: string,
  ) {
    super(
      `SentimentObservation already exists for (ticker=${ticker}, message_id=${message_id}, model_version=${model_version}). ` +
      `Backfills must use a NEW model_version (PIT immutability — see Plan 20-Z-01).`,
    );
    this.name = 'SentimentObservationDuplicateError';
  }
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

function assertNonEmpty(name: string, value: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`SentimentObservation: ${name} must be a non-empty string (got: ${JSON.stringify(value)})`);
  }
}

function assertAllowlist(features: AuthorFeaturesSnapshot): void {
  const keys = Object.keys(features);
  for (const k of keys) {
    if (!(AUTHOR_FEATURE_ALLOWLIST as readonly string[]).includes(k)) {
      throw new Error(
        `SentimentObservation: author_features_snapshot key "${k}" not in allowlist ` +
        `[${AUTHOR_FEATURE_ALLOWLIST.join(', ')}] (T-20-Z-01-01 PII defense). ` +
        `Widening the allowlist requires a new model_version per S2 immutability.`,
      );
    }
  }
}

export async function insertObservation(
  input: SentimentObservationInput,
): Promise<{ id: string }> {
  assertNonEmpty('ticker', input.ticker);
  assertNonEmpty('source', input.source);
  assertNonEmpty('message_id', input.message_id);
  assertNonEmpty('classifier_version', input.classifier_version);
  assertNonEmpty('model_version', input.model_version);
  if (typeof input.raw_body !== 'string' || input.raw_body.length === 0) {
    throw new Error('SentimentObservation: raw_body must be a non-empty string (upstream signal bug otherwise)');
  }
  assertAllowlist(input.author_features_snapshot);

  const raw_body_hash = sha256Hex(input.raw_body);

  try {
    const row = await prisma.sentimentObservation.create({
      data: {
        ticker: input.ticker,
        source: input.source,
        message_id: input.message_id,
        fetched_at: input.fetched_at ?? new Date(),
        // LOOKAHEAD-OK: insert-only write of the upstream-claimed timestamp into the schema column; the column itself carries a // PIT-INVARIANT marker in prisma/schema.prisma forbidding backtest joins. This is a WRITE, not a query — no lookahead risk.
        published_at: input.published_at ?? null,
        raw_body_hash,
        classifier_version: input.classifier_version,
        classifier_score: input.classifier_score,
        decay_weight: input.decay_weight,
        author_id: input.author_id,
        author_features_snapshot: input.author_features_snapshot as unknown as Prisma.InputJsonValue,
        model_version: input.model_version,
        // Plan 20-B-01 — empty default if caller omits; otherwise persisted as text[].
        aspects: input.aspects ?? [],
      },
      select: { id: true },
    });
    return row;
  } catch (e) {
    // Prisma P2002 = unique constraint violation on (ticker, message_id, model_version)
    const err = e as { code?: string };
    if (err.code === 'P2002') {
      throw new SentimentObservationDuplicateError(
        input.ticker,
        input.message_id,
        input.model_version,
      );
    }
    throw e;
  }
}
