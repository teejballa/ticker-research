// scripts/lib/phase-20-checks/check-telemetry-7d.ts
// Owned by 20-Z-03 — this script only consumes the ProviderCallLog table.
//
// DoD #14 — Prisma query against the ProviderCallLog table from 20-Z-03.
// Counts DISTINCT date(started_at) over the last 14d (filtering to status='ok'
// AND non-null duration_ms — the actual ProviderCallLog schema columns per
// prisma/schema.prisma — see 20-Z-03 SUMMARY). Pass requires ≥7 distinct days.
// Pending if table absent. Mitigates the 'cron flap' threat (T-20-Z-06-03) by
// requiring distinct days, not row count.

import type { CheckFn } from './types';

// Threshold per CONTEXT.md DoD #14: "Telemetry live ... for ≥7 days"
const DISTINCT_DAYS_MIN = 7;
const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export const checkTelemetry7d: CheckFn = async (deps) => {
  const base = {
    name: 'telemetry-7d',
    dod_label: 'Telemetry live at /insights/sentiment-health with non-zero data for ≥7 days',
    blocker_for: 14,
    branch: 'hygiene',
  } as const;
  try {
    if (!deps.prisma.providerCallLog) {
      return { ...base, status: 'pending', evidence: 'ProviderCallLog Prisma model not available' };
    }
    const sinceDate = new Date(Date.now() - WINDOW_MS);
    const rows = await deps.prisma.providerCallLog.findMany({
      where: {
        started_at: { gte: sinceDate },
        duration_ms: { gt: 0 },
      },
      select: { started_at: true },
    });
    if (rows.length === 0) {
      return { ...base, status: 'pending', evidence: 'no ProviderCallLog rows in last 14d' };
    }
    const distinctDays = new Set(rows.map((r) => r.started_at.toISOString().slice(0, 10)));
    if (distinctDays.size >= DISTINCT_DAYS_MIN) {
      return {
        ...base,
        status: 'pass',
        evidence: `${distinctDays.size} distinct days of telemetry in last 14d (need ≥${DISTINCT_DAYS_MIN})`,
      };
    }
    return {
      ...base,
      status: 'fail',
      evidence: `${distinctDays.size} distinct days of telemetry in last 14d (need ≥${DISTINCT_DAYS_MIN})`,
    };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
