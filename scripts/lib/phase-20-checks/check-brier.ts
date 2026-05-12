// scripts/lib/phase-20-checks/check-brier.ts
// Owned by 20-C-02 — this script only consumes the Brier metric JSON.
//
// DoD #7 — reads the Brier metric JSON written by 20-C-02 (metrics/brier-latest.json).
// Pass if brier ≤ 0.24. Fail if > 0.24. Pending if file absent.

import type { CheckFn } from './types';

// Threshold per CONTEXT.md DoD #7: "Brier ≤ 0.24 ... (vs 0.25 random)"
const BRIER_MAX = 0.24;
const METRIC_REL_PATH = 'metrics/brier-latest.json';

export const checkBrier: CheckFn = async (deps) => {
  const base = {
    name: 'brier',
    dod_label: 'Brier ≤ 0.24 for the binary sentiment→outperform-SPY-at-7d claim (vs 0.25 random)',
    blocker_for: 7,
    branch: 'calibration',
  } as const;
  try {
    const metricPath = `${deps.metricsDir}/brier-latest.json`;
    if (!deps.fs.existsSync(metricPath)) {
      return { ...base, status: 'pending', evidence: `artifact not yet present: ${METRIC_REL_PATH}` };
    }
    const raw = deps.fs.readFileSync(metricPath);
    let parsed: { brier?: number };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch (err) {
      return { ...base, status: 'fail', evidence: `${METRIC_REL_PATH} malformed JSON: ${String(err)}` };
    }
    const brier = parsed.brier;
    if (typeof brier !== 'number' || Number.isNaN(brier)) {
      return { ...base, status: 'fail', evidence: `${METRIC_REL_PATH} missing/invalid 'brier' field` };
    }
    if (brier <= BRIER_MAX) {
      return { ...base, status: 'pass', evidence: `brier=${brier.toFixed(4)} (need ≤${BRIER_MAX})` };
    }
    return { ...base, status: 'fail', evidence: `brier=${brier.toFixed(4)} (need ≤${BRIER_MAX})` };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
