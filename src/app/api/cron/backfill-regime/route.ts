/**
 * Phase 22 Wave 2 — Historical regime backfill cron (D-10 + D-12 + CORE-ML-08).
 *
 * One-shot, P27-style backfill that sweeps every legacy SentimentSnapshot and
 * PerSourceIC row carrying the cold-start `regime='ALL'` default and assigns
 * the historical regime via `classifyRegimeAt({ asOf: row.<PIT_date> })`. The
 * helper `classifyRegimeAt` is the SINGLE source of truth for the 4-bucket
 * label (Wave 1 deliverable); there is NO parallel/forked regime logic in this
 * file per CLAUDE.md rule #6.
 *
 * Why this cron exists (Pitfall 4 from RESEARCH §H):
 *   Wave 3's source-tier-recompute reads PerSourceIC slices per regime. Without
 *   backfill, ~100% of rows carry regime='ALL' and the EB shrinkage looks fine
 *   numerically but the regime-conditional signal is washed out.
 *
 * Trust + isolation model (D-10):
 *   - Bearer CRON_SECRET guard (T-22-02-01 — matches /api/cron/relabel verbatim).
 *   - Isolated failure domain: this cron does NOT touch `learn` or `relabel`.
 *   - One-shot semantics: after a complete (0-row) pass, the cron auto-disables
 *     via `BACKFILL_REGIME_DISABLED=true`. Operator clears the env var to re-run.
 *   - Idempotent: re-running on already-labeled rows is a no-op because the
 *     WHERE `regime='ALL'` filter excludes them.
 *
 * D-12 dual-provider-null semantics:
 *   When `classifyRegimeAt` returns `regime='ALL'` with all-null audit fields
 *   (both Yahoo AND Polygon failed, no prior-trading-day fallback resolved
 *   within 14 calendar days), the row is logged + skipped (NOT updated). The
 *   row stays at regime='ALL' so the next cron pass naturally retries.
 *
 * Per-row PIT input (Pitfall 1 — lookahead-bias defense):
 *   Each row's `scanned_at` (SentimentSnapshot) or `computed_at` (PerSourceIC)
 *   is passed as the classifier's `asOf`. The cron NEVER passes `new Date()`
 *   wholesale.
 *
 * @knowable_at row.scanned_at / row.computed_at — caller (this handler) hoists
 *   the row's PIT date directly into the classifier call; no forward data is
 *   used.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { classifyRegimeAt } from '@/lib/regime/classify';
import {
  isRegimeBackfillDisabled,
  readRegimeBackfillCheckpoint,
  setRegimeBackfillDisabled,
  writeRegimeBackfillCheckpoint,
} from '@/lib/regime/checkpoint';

export const dynamic = 'force-dynamic';
// Pro tier (RESEARCH §D + 22-02-PLAN T-22-02-03 DoS mitigation). The per-tick
// batch budget bounds work to ~1000 classifier calls per invocation. Hobby
// plan caps at 300s; with 250ms throttle a 500-row batch finishes in ~125s,
// well under cap. Operator runs the loop more times if more work remains.
export const maxDuration = 300;

/** D-10 per-tick budget. 500 SentimentSnapshot + 500 PerSourceIC rows per invocation. */
const BACKFILL_REGIME_BATCH_SIZE = (() => {
  const raw = process.env.BACKFILL_REGIME_BATCH_SIZE;
  if (!raw) return 500;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 && n <= 5000 ? n : 500;
})();

export async function POST(request: Request): Promise<Response> {
  // T-22-02-01 Spoofing defense — Bearer CRON_SECRET (mirrors relabel/route.ts:38).
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  // D-10 auto-disable short-circuit — operator clears BACKFILL_REGIME_DISABLED
  // to force a delta re-pass.
  if (isRegimeBackfillDisabled()) {
    console.log('[cron:backfill-regime] short-circuit', { reason: 'auto-disabled' });
    return Response.json({
      status: 'disabled',
      reason: 'auto-disabled after complete pass',
    });
  }

  const startedAt = new Date();
  const checkpoint = readRegimeBackfillCheckpoint();

  console.log('[cron:backfill-regime] start', {
    batch_size: BACKFILL_REGIME_BATCH_SIZE,
    snapshot_cursor: checkpoint.snapshot_id,
    ic_cursor: checkpoint.ic_id,
  });

  const counters = {
    processed_snapshots: 0,
    processed_ic_rows: 0,
    dual_provider_skips: 0,
  };

  // -------------------------------------------------------------------------
  // 1. SentimentSnapshot sweep — D-06 + CORE-ML-08 backfill path.
  //    WHERE regime='ALL' ORDER BY scanned_at ASC LIMIT batch.
  // -------------------------------------------------------------------------
  const snapshotRows = await prisma.sentimentSnapshot.findMany({
    where: { regime: 'ALL' },
    orderBy: { scanned_at: 'asc' },
    take: BACKFILL_REGIME_BATCH_SIZE,
    select: {
      id: true,
      ticker: true,
      scanned_at: true,
    },
  });

  let lastSnapshotId: string | null = checkpoint.snapshot_id;

  for (const row of snapshotRows) {
    // D-12 — classifyRegimeAt owns Yahoo primary + Polygon fallback + holiday-
    // gap tolerance. This cron only sees the result.
    const regimeResult = await classifyRegimeAt({ asOf: row.scanned_at });

    if (regimeResult.regime === 'ALL' && regimeResult.vix_level == null) {
      // D-12 dual-provider failure — log + skip. Row stays at regime='ALL'
      // so the next pass retries it once data is available.
      console.log('[cron:backfill-regime] skipped row', {
        table: 'sentiment_snapshots',
        row_id: row.id,
        ticker: row.ticker,
        scanned_at: row.scanned_at.toISOString(),
        reason: 'dual_provider_null',
      });
      counters.dual_provider_skips++;
      lastSnapshotId = row.id;
      continue;
    }

    await prisma.sentimentSnapshot.update({
      where: { id: row.id },
      data: {
        regime: regimeResult.regime,
        regime_vix_level: regimeResult.vix_level,
        regime_vix_pctile: regimeResult.vix_60d_percentile,
        regime_ma_diff: regimeResult.spy_ma_50_minus_200,
      },
    });
    counters.processed_snapshots++;
    lastSnapshotId = row.id;
  }

  // -------------------------------------------------------------------------
  // 2. PerSourceIC sweep — Pitfall 4 fix. WHERE regime='ALL' ORDER BY
  //    computed_at ASC LIMIT batch. Same Yahoo+Polygon fallback delegated.
  // -------------------------------------------------------------------------
  const icRows = await prisma.perSourceIC.findMany({
    where: { regime: 'ALL' },
    orderBy: { computed_at: 'asc' },
    take: BACKFILL_REGIME_BATCH_SIZE,
    select: {
      id: true,
      source_id: true,
      computed_at: true,
    },
  });

  let lastIcId: string | null = checkpoint.ic_id;

  for (const row of icRows) {
    const regimeResult = await classifyRegimeAt({ asOf: row.computed_at });

    if (regimeResult.regime === 'ALL' && regimeResult.vix_level == null) {
      console.log('[cron:backfill-regime] skipped row', {
        table: 'per_source_ic',
        row_id: row.id,
        source_id: row.source_id,
        computed_at: row.computed_at.toISOString(),
        reason: 'dual_provider_null',
      });
      counters.dual_provider_skips++;
      lastIcId = row.id;
      continue;
    }

    await prisma.perSourceIC.update({
      where: { id: row.id },
      data: {
        regime: regimeResult.regime,
      },
    });
    counters.processed_ic_rows++;
    lastIcId = row.id;
  }

  // -------------------------------------------------------------------------
  // 3. Persist checkpoint cursor (best-effort, in-process only on Vercel).
  // -------------------------------------------------------------------------
  writeRegimeBackfillCheckpoint({
    snapshot_id: lastSnapshotId,
    ic_id: lastIcId,
  });

  // -------------------------------------------------------------------------
  // 4. Auto-disable when BOTH sweeps returned zero rows. Operator-confirmed
  //    in Task 3 of the plan (R2 acceptance — operator-confirmed checkpoint).
  // -------------------------------------------------------------------------
  const isCompletePass = snapshotRows.length === 0 && icRows.length === 0;
  if (isCompletePass) {
    setRegimeBackfillDisabled(true);
    console.log('[cron:backfill-regime] complete', {
      status: 'complete',
      duration_ms: Date.now() - startedAt.getTime(),
      ...counters,
    });
    return Response.json({
      status: 'complete',
      duration_ms: Date.now() - startedAt.getTime(),
      ...counters,
      next_checkpoint: {
        snapshot_id: lastSnapshotId,
        ic_id: lastIcId,
      },
    });
  }

  console.log('[cron:backfill-regime] partial', {
    status: 'in_progress',
    duration_ms: Date.now() - startedAt.getTime(),
    ...counters,
    next_checkpoint: { snapshot_id: lastSnapshotId, ic_id: lastIcId },
  });

  return Response.json({
    status: 'in_progress',
    duration_ms: Date.now() - startedAt.getTime(),
    ...counters,
    next_checkpoint: {
      snapshot_id: lastSnapshotId,
      ic_id: lastIcId,
    },
  });
}

// GET handler aliased to POST for Vercel Cron compatibility. Some plan platforms
// use GET; we accept both because Vercel issues GET by default for crons but
// the plan's Task 3 documents manual `curl -X POST` invocations. Both paths
// hit the same logic — the Bearer guard prevents abuse either way.
export const GET = POST;

// Keep Prisma's type usage visible for tooling (avoids "unused import" warnings
// if a future refactor inlines the create/update calls).
void Prisma;
