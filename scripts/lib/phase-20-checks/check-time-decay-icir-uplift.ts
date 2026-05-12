// scripts/lib/phase-20-checks/check-time-decay-icir-uplift.ts
// Owned by 20-A-03 — this script only consumes the calibration JSON output.
//
// DoD #5 — reads the calibration result file written by 20-A-03
// (`scripts/tune-decay.ts` output, JSON: { baseline_icir, decayed_icir, uplift }).
// Pending if file absent. Fail if uplift < 0.05. Pass if uplift ≥ 0.05.

import type { CheckFn } from './types';

// Threshold per CONTEXT.md DoD #5: "ICIR uplift ≥ 0.05 vs no-decay baseline"
const UPLIFT_MIN = 0.05;
const METRIC_REL_PATH = 'metrics/time-decay-icir.json';

export const checkTimeDecayIcirUplift: CheckFn = async (deps) => {
  const base = {
    name: 'time-decay-icir-uplift',
    dod_label: 'Time decay applied with calibrated λ; backtest ICIR uplift ≥ 0.05 vs no-decay baseline',
    blocker_for: 5,
    branch: 'sentiment',
  } as const;
  try {
    const metricPath = `${deps.metricsDir}/time-decay-icir.json`;
    if (!deps.fs.existsSync(metricPath)) {
      return { ...base, status: 'pending', evidence: `artifact not yet present: ${METRIC_REL_PATH}` };
    }
    const raw = deps.fs.readFileSync(metricPath);
    let parsed: { uplift?: number; baseline_icir?: number; decayed_icir?: number };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch (err) {
      return { ...base, status: 'fail', evidence: `${METRIC_REL_PATH} malformed JSON: ${String(err)}` };
    }
    const uplift = parsed.uplift;
    if (typeof uplift !== 'number' || Number.isNaN(uplift)) {
      return { ...base, status: 'fail', evidence: `${METRIC_REL_PATH} missing/invalid 'uplift' field` };
    }
    if (uplift >= UPLIFT_MIN) {
      return { ...base, status: 'pass', evidence: `uplift=${uplift.toFixed(4)} (need ≥${UPLIFT_MIN})` };
    }
    return { ...base, status: 'fail', evidence: `uplift=${uplift.toFixed(4)} (need ≥${UPLIFT_MIN})` };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
