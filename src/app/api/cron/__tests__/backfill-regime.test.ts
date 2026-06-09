/**
 * PHASE 22 Wave 0 RED stub — Wave 2 delivers GREEN.
 * Covers: D-10 (one-shot P27-style backfill cron) + D-12 (Yahoo primary + Polygon fallback)
 *         per 22-VALIDATION.md §Wave 0 Gaps.
 *
 * Intentionally imports the Wave 2 cron handler from
 * `src/app/api/cron/backfill-regime/route` — the file does NOT exist yet.
 * Vitest reports "Cannot find module" → RED.
 *
 * Reference implementation contract (22-RESEARCH.md §D):
 *   - Bearer CRON_SECRET guard (mirrors learn/route.ts)
 *   - maxDuration: 800 (Pro tier)
 *   - Sweeps SentimentSnapshot WHERE regime = 'ALL' ORDER BY scanned_at
 *   - Sweeps PerSourceIC WHERE regime = 'ALL' similarly
 *   - For each row: classifyRegimeAt({ asOf: scanned_at }) → write regime + ancillary fields
 *   - Auto-disables after a complete pass via env-var checkpoint
 *   - Re-runnable: NULL classifier results stay NULL (D-12 logged + skipped semantics)
 */

import { describe, it } from 'vitest';
// Intentionally imports the Wave 2 cron handler so the file fails until it lands.
import { GET as backfillRegimeHandler } from '@/app/api/cron/backfill-regime/route';

describe('/api/cron/backfill-regime — Wave 2 contract (D-10 + D-12)', () => {
  it.todo('rejects requests without Bearer CRON_SECRET (Spoofing defense; matches learn/route pattern)');
  it.todo('processes SentimentSnapshot rows WHERE regime = "ALL" in scanned_at ASC order (resumable)');
  it.todo('also processes PerSourceIC rows WHERE regime = "ALL" so source-tier-recompute sees per-regime IC');
  it.todo('writes regime + regime_vix_level + regime_vix_pctile + regime_ma_diff via classifyRegimeAt({asOf: row.scanned_at})');
  it.todo('Yahoo primary failure → Polygon fallback for VIX (^VIX → I:VIX) and SPY (D-12)');
  it.todo('both Yahoo and Polygon NULL → row stays at regime="ALL" with NULL ancillary fields (logged + skipped)');
  it.todo('uses a single batched history fetch instead of per-row Yahoo calls (Pitfall 6)');
  it.todo('auto-disables after a complete pass (BACKFILL_DISABLED env-var checkpoint mirrors P27)');
  it.todo('is idempotent: re-running over already-labeled rows is a no-op');
  it.todo('respects maxDuration: 800s and exits cleanly at the checkpoint when budget is exhausted');
});

void backfillRegimeHandler;
