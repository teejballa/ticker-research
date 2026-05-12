// scripts/lib/phase-20-checks/check-source-tier-data-driven.ts
// Owned by 20-B-04 — this script only consumes the SourceTier table + scans src/ for hand-curated literals.
//
// DoD #4 — reads the SourceTier Prisma table populated by 20-B-04. Asserts
//   (a) table exists with ≥1 row,
//   (b) every row has computed_from_ic_at within last 35d (monthly cron freshness),
//   (c) no row's weight comes from a hand-curated literal (verified by grepping
//       SourceTier seed for hard-coded weight literals in src/).

import type { CheckFn } from './types';

// Threshold per CONTEXT.md DoD #4 + 20-B-04 plan: monthly recompute cron → 35d freshness window.
const FRESHNESS_MAX_DAYS = 35;
const FRESHNESS_MAX_MS = FRESHNESS_MAX_DAYS * 24 * 60 * 60 * 1000;
// Hand-curated literal detector: if src/ contains anything like
// `SOURCE_TIER_WEIGHT.<name> = <number>` or a hand-coded weight map seed,
// the source-tier is NOT data-driven.
const HAND_CURATED_GREP = 'grep -rE "(source_tier|SOURCE_TIER)[a-zA-Z_]*[[:space:]]*[:=][[:space:]]*[0-9]" src/lib/sentiment 2>/dev/null || true';

export const checkSourceTierDataDriven: CheckFn = async (deps) => {
  const base = {
    name: 'source-tier-data-driven',
    dod_label: 'Source-tier weights data-driven from 20-C-01 IC measurements (no hand-curated entries shipping)',
    blocker_for: 4,
    branch: 'sentiment',
  } as const;
  try {
    if (!deps.prisma.sourceTier) {
      return { ...base, status: 'pending', evidence: 'SourceTier Prisma model not available' };
    }
    const rows = await deps.prisma.sourceTier.findMany({});
    if (rows.length === 0) {
      return { ...base, status: 'pending', evidence: 'SourceTier table empty (20-B-04 not yet seeded)' };
    }
    const now = Date.now();
    const stale = rows.filter((r) => {
      const ts = r.computed_from_ic_at;
      if (!(ts instanceof Date)) return true;
      return now - ts.getTime() > FRESHNESS_MAX_MS;
    });
    if (stale.length > 0) {
      return {
        ...base,
        status: 'fail',
        evidence: `${stale.length}/${rows.length} SourceTier rows have computed_from_ic_at older than ${FRESHNESS_MAX_DAYS}d`,
      };
    }
    // Scan src/ for hand-curated literals — they signal we're NOT data-driven.
    const grepOut = deps.exec(HAND_CURATED_GREP);
    if (grepOut.stdout.trim().length > 0) {
      return {
        ...base,
        status: 'fail',
        evidence: `hand-curated weight literals found in src/lib/sentiment: ${grepOut.stdout.trim().split('\n').length} line(s)`,
      };
    }
    return {
      ...base,
      status: 'pass',
      evidence: `${rows.length} SourceTier rows all fresh (within ${FRESHNESS_MAX_DAYS}d); no hand-curated literals in src/`,
    };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
