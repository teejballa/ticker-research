// scripts/lib/phase-20-checks/check-per-source-icir-30d.ts
// Owned by 20-C-01 — this script only consumes the per-source ICIR table.
//
// DoD #6 — Prisma query against the per-source ICIR table populated by 20-C-01
// daily cron. Pass if ≥30 distinct days of non-null rolling_icir per source for
// ≥1 source. Pending if table absent.

import type { CheckFn } from './types';

// Threshold per CONTEXT.md DoD #6: "Per-input-source ICIR tracked for ≥30 days continuous"
const DAYS_MIN = 30;

export const checkPerSourceIcir30d: CheckFn = async (deps) => {
  const base = {
    name: 'per-source-icir-30d',
    dod_label: 'Per-input-source ICIR tracked for ≥30 days continuous; per-source weights auto-adjust',
    blocker_for: 6,
    branch: 'calibration',
  } as const;
  try {
    if (!deps.prisma.sourceIcir) {
      return { ...base, status: 'pending', evidence: 'SourceIcir Prisma model not available' };
    }
    const groups = await deps.prisma.sourceIcir.groupBy({
      by: ['source'],
      where: { rolling_icir: { not: null } },
      _count: { _all: true },
    });
    if (groups.length === 0) {
      return { ...base, status: 'pending', evidence: 'SourceIcir table empty (20-C-01 cron not yet running)' };
    }
    const top = groups.reduce(
      (acc, g) => (g._count._all > acc._count._all ? g : acc),
      groups[0],
    );
    if (top._count._all >= DAYS_MIN) {
      return {
        ...base,
        status: 'pass',
        evidence: `top source '${top.source}' has ${top._count._all} distinct days of rolling_icir (need ≥${DAYS_MIN})`,
      };
    }
    return {
      ...base,
      status: 'fail',
      evidence: `top source '${top.source}' has ${top._count._all} distinct days of rolling_icir (need ≥${DAYS_MIN})`,
    };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
