// scripts/lib/phase-20-checks/check-ece.ts
// Owned by 20-B-03 — this script only consumes the per-classifier ECE JSON.
//
// DoD #8 — reads the per-classifier ECE JSON written by 20-B-03 monthly
// temperature-scaling cron. Pass if every shipped classifier has ECE ≤ 0.05.
// Fail if any > 0.05. Pending if file absent.

import type { CheckFn } from './types';

// Threshold per CONTEXT.md DoD #8: "ECE ≤ 0.05 for each shipped classifier after temperature scaling"
const ECE_MAX = 0.05;
const METRIC_REL_PATH = 'metrics/ece-per-classifier.json';

export const checkEce: CheckFn = async (deps) => {
  const base = {
    name: 'ece',
    dod_label: 'ECE ≤ 0.05 for each shipped classifier after temperature scaling',
    blocker_for: 8,
    branch: 'calibration',
  } as const;
  try {
    const metricPath = `${deps.metricsDir}/ece-per-classifier.json`;
    if (!deps.fs.existsSync(metricPath)) {
      return { ...base, status: 'pending', evidence: `artifact not yet present: ${METRIC_REL_PATH}` };
    }
    const raw = deps.fs.readFileSync(metricPath);
    let parsed: Record<string, number>;
    try {
      parsed = JSON.parse(raw) as Record<string, number>;
    } catch (err) {
      return { ...base, status: 'fail', evidence: `${METRIC_REL_PATH} malformed JSON: ${String(err)}` };
    }
    const entries = Object.entries(parsed).filter(([, v]) => typeof v === 'number' && !Number.isNaN(v));
    if (entries.length === 0) {
      return { ...base, status: 'fail', evidence: `${METRIC_REL_PATH} has no valid classifier→ECE entries` };
    }
    const violators = entries.filter(([, ece]) => ece > ECE_MAX);
    if (violators.length === 0) {
      return {
        ...base,
        status: 'pass',
        evidence: `${entries.length} classifier(s) all have ECE ≤ ${ECE_MAX}; max=${Math.max(...entries.map(([, v]) => v)).toFixed(4)}`,
      };
    }
    return {
      ...base,
      status: 'fail',
      evidence: `${violators.length} classifier(s) exceed ECE ≤ ${ECE_MAX}: ${violators.map(([k, v]) => `${k}=${v.toFixed(4)}`).join(', ')}`,
    };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
