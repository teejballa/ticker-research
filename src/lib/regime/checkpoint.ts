/**
 * Phase 22 D-10 — Regime backfill checkpoint module.
 *
 * Wraps two env vars used by `/api/cron/backfill-regime` for resumable + auto-
 * disabling one-shot semantics. Mirrors the P27 BACKFILL_DISABLED pattern.
 *
 * - `BACKFILL_REGIME_DISABLED` — string "true" short-circuits the cron with a
 *   `{ status: 'disabled' }` 200. Operator clears the env var (Vercel dashboard
 *   or `vercel env rm`) to force a delta re-pass.
 * - `BACKFILL_REGIME_CHECKPOINT` — JSON-encoded `{ snapshot_id, ic_id }` cursor
 *   the cron writes after each successful (or skipped) row so the next
 *   invocation resumes from the last position (saves redundant findMany work
 *   on partial passes).
 *
 * Zod module-load validation per `src/lib/regime/hyperparameters.ts:46` precedent:
 * malformed checkpoint JSON throws at READ time so the cron fails fast instead
 * of silently restarting from null.
 *
 * @knowable_at — Process-local env state only. Vercel rebuilds rehydrate from
 *   the project's stored env vars before each invocation. Race-free in the
 *   single-invocation cron context.
 */

import { z } from 'zod';

const CheckpointSchema = z
  .object({
    snapshot_id: z.string().nullable(),
    ic_id: z.string().nullable(),
  })
  .strict();

export type RegimeBackfillCheckpoint = z.infer<typeof CheckpointSchema>;

const EMPTY_CHECKPOINT: RegimeBackfillCheckpoint = {
  snapshot_id: null,
  ic_id: null,
};

/**
 * Returns the persisted cursor from `BACKFILL_REGIME_CHECKPOINT`, or both-null
 * when the var is unset / empty. Throws on malformed JSON or schema mismatch
 * (fail-fast per `<investigation-mode>` skill — silent restarts are worse than
 * a loud 500).
 */
export function readRegimeBackfillCheckpoint(): RegimeBackfillCheckpoint {
  const raw = process.env.BACKFILL_REGIME_CHECKPOINT;
  if (!raw || raw.trim() === '') return { ...EMPTY_CHECKPOINT };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `BACKFILL_REGIME_CHECKPOINT is not valid JSON: ${(err as Error).message}`,
    );
  }
  const result = CheckpointSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `BACKFILL_REGIME_CHECKPOINT failed validation: ${result.error.issues
        .map((i) => i.path.join('.') + ': ' + i.message)
        .join('; ')}`,
    );
  }
  return result.data;
}

/**
 * Writes the cursor to `BACKFILL_REGIME_CHECKPOINT` (process-local). Vercel's
 * cron model invokes a fresh process per schedule tick, so writing to
 * `process.env` is observable WITHIN THE INVOCATION (idempotent across the
 * route's internal control flow) but is NOT durable across invocations on
 * Vercel — that's accepted per D-10 because the WHERE regime='ALL' filter
 * is itself the durable cursor (already-labeled rows are skipped by the next
 * pass). The env var primarily aids local development + integration tests.
 */
export function writeRegimeBackfillCheckpoint(state: RegimeBackfillCheckpoint): void {
  CheckpointSchema.parse(state); // throws on malformed callsite
  process.env.BACKFILL_REGIME_CHECKPOINT = JSON.stringify(state);
}

/**
 * Returns true when `BACKFILL_REGIME_DISABLED` is the string "true" (case-
 * insensitive). The route uses this to short-circuit after a complete pass.
 */
export function isRegimeBackfillDisabled(): boolean {
  const v = process.env.BACKFILL_REGIME_DISABLED;
  return typeof v === 'string' && v.toLowerCase() === 'true';
}

/**
 * Sets / clears the auto-disable flag. The cron calls `setRegimeBackfillDisabled(true)`
 * after a 0-rows pass; the operator clears it (via Vercel env var management or
 * `delete process.env.BACKFILL_REGIME_DISABLED` in tests) to force a delta re-pass.
 */
export function setRegimeBackfillDisabled(disabled: boolean): void {
  if (disabled) process.env.BACKFILL_REGIME_DISABLED = 'true';
  else delete process.env.BACKFILL_REGIME_DISABLED;
}
