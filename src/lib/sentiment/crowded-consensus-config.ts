/**
 * Plan 20-A-01 — Crowded-consensus threshold loader.
 *
 * Reads the LATEST CrowdedConsensusCalibration row (ORDER BY computed_at DESC LIMIT 1).
 * Result is cached in-process for 1 hour, so the monthly-cron-recomputed thresholds
 * are picked up within 1h of the cron run AND per-request DB hits are bounded.
 *
 * Per S1 (no hand-picked parameters): thresholds are NEVER hardcoded in this module.
 * Returns null when no calibration row exists — caller (aggregator) interprets null
 * as "cannot compute the flag yet" and surfaces `crowded_consensus: null` to the UI.
 */
import type { CrowdedConsensusThresholds } from '@/lib/sentiment/dispersion';

const TTL_MS = 60 * 60 * 1000; // 1 hour

interface CacheEntry {
  value: CrowdedConsensusThresholds | null;
  fetched_at: number;
}

let cache: CacheEntry | null = null;

export async function loadLatestCrowdedConsensusThresholds(): Promise<
  CrowdedConsensusThresholds | null
> {
  const now = Date.now();
  if (cache && now - cache.fetched_at < TTL_MS) {
    return cache.value;
  }

  // Lazy import — keeps modules loadable in environments without DATABASE_URL
  // (unit tests, CI mock paths). Prisma initializes lazily only when this
  // function actually runs.
  const { prisma } = await import('@/lib/db');

  // Use any to avoid coupling to prisma client generation timing in CI; field
  // names match the schema model 1:1.
  const row = await (prisma as unknown as {
    crowdedConsensusCalibration: {
      findFirst: (args: { orderBy: { computed_at: 'desc' } }) => Promise<{
        H_thresh: number;
        V_thresh: number;
        D_thresh: number;
        model_version: string;
        computed_at: Date;
        brier_skill_score: number;
      } | null>;
    };
  }).crowdedConsensusCalibration.findFirst({
    orderBy: { computed_at: 'desc' },
  });

  const value: CrowdedConsensusThresholds | null = row
    ? {
        H_thresh: row.H_thresh,
        V_thresh: row.V_thresh,
        D_thresh: row.D_thresh,
        model_version: row.model_version,
        computed_at: row.computed_at,
        brier_skill_score: row.brier_skill_score,
      }
    : null;

  cache = { value, fetched_at: now };
  return value;
}

/** Test-only: clears the in-process cache so fixtures can be swapped deterministically. */
export function __resetCacheForTests(): void {
  cache = null;
}
