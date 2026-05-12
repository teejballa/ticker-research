// scripts/lib/phase-20-checks/check-bot-filter-fp-and-coordination-f1.ts
// Owned by 20-C-03 (bot filter) + 20-C-04 (coordination detector) — this script only consumes.
//
// DoD #9 — reads two metric files: metrics/bot-filter-fp-rate.json (from 20-C-03
// audit set) and metrics/coordination-f1.json (from 20-C-04 synthetic eval).
// Pass requires fp_rate ≤ 0.05 AND f1 ≥ 0.6. Pending if either file absent.

import type { CheckFn } from './types';

// Thresholds per CONTEXT.md DoD #9: "Bot-filter false-positive ≤ 5%" + "coordinated-posting detector F1 ≥ 0.6"
const FP_MAX = 0.05;
const F1_MIN = 0.6;
const FP_REL_PATH = 'metrics/bot-filter-fp-rate.json';
const F1_REL_PATH = 'metrics/coordination-f1.json';

export const checkBotFilterFpAndCoordinationF1: CheckFn = async (deps) => {
  const base = {
    name: 'bot-filter-fp-and-coordination-f1',
    dod_label: 'Bot-filter false-positive ≤ 5% on labeled audit set; coordinated-posting detector F1 ≥ 0.6 on synthetic eval',
    blocker_for: 9,
    branch: 'calibration',
  } as const;
  try {
    const fpPath = `${deps.metricsDir}/bot-filter-fp-rate.json`;
    const f1Path = `${deps.metricsDir}/coordination-f1.json`;
    if (!deps.fs.existsSync(fpPath)) {
      return { ...base, status: 'pending', evidence: `artifact not yet present: ${FP_REL_PATH}` };
    }
    if (!deps.fs.existsSync(f1Path)) {
      return { ...base, status: 'pending', evidence: `artifact not yet present: ${F1_REL_PATH}` };
    }
    let fpRate: number;
    let f1: number;
    try {
      const fpRaw = JSON.parse(deps.fs.readFileSync(fpPath)) as { fp_rate?: number };
      const f1Raw = JSON.parse(deps.fs.readFileSync(f1Path)) as { f1?: number };
      fpRate = typeof fpRaw.fp_rate === 'number' ? fpRaw.fp_rate : NaN;
      f1 = typeof f1Raw.f1 === 'number' ? f1Raw.f1 : NaN;
    } catch (err) {
      return { ...base, status: 'fail', evidence: `metric JSON malformed: ${String(err)}` };
    }
    if (Number.isNaN(fpRate) || Number.isNaN(f1)) {
      return {
        ...base,
        status: 'fail',
        evidence: `metric files missing required fields (fp_rate=${fpRate}, f1=${f1})`,
      };
    }
    const fpOk = fpRate <= FP_MAX;
    const f1Ok = f1 >= F1_MIN;
    if (fpOk && f1Ok) {
      return {
        ...base,
        status: 'pass',
        evidence: `fp_rate=${fpRate.toFixed(4)} (≤${FP_MAX}); f1=${f1.toFixed(4)} (≥${F1_MIN})`,
      };
    }
    return {
      ...base,
      status: 'fail',
      evidence: `fp_rate=${fpRate.toFixed(4)} (need ≤${FP_MAX}); f1=${f1.toFixed(4)} (need ≥${F1_MIN})`,
    };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
