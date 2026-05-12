// scripts/lib/phase-20-checks/check-citation-coverage.ts
// Owned by 20-D-02 — this script only consumes the citation-coverage JSON.
//
// DoD #11 — reads the 20-D-02 metric JSON metrics/citation-coverage-latest.json
// (per-golden-ticker coverage ratio). Pass if every golden ticker ≥ 0.80.
// Fail if any < 0.80. Pending if file absent.

import type { CheckFn } from './types';

// Threshold per CONTEXT.md DoD #11: "Citation-coverage ≥ 80% per report on all 8 golden tickers"
const COVERAGE_MIN = 0.80;
const METRIC_REL_PATH = 'metrics/citation-coverage-latest.json';

export const checkCitationCoverage: CheckFn = async (deps) => {
  const base = {
    name: 'citation-coverage',
    dod_label: 'Citation-coverage ≥ 80% per report on all 8 golden tickers (20-D-02)',
    blocker_for: 11,
    branch: 'report',
  } as const;
  try {
    const metricPath = `${deps.metricsDir}/citation-coverage-latest.json`;
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
      return { ...base, status: 'fail', evidence: `${METRIC_REL_PATH} has no valid ticker→coverage entries` };
    }
    const violators = entries.filter(([, cov]) => cov < COVERAGE_MIN);
    if (violators.length === 0) {
      const min = Math.min(...entries.map(([, v]) => v));
      return {
        ...base,
        status: 'pass',
        evidence: `${entries.length} ticker(s) all have coverage ≥ ${COVERAGE_MIN}; min=${min.toFixed(3)}`,
      };
    }
    return {
      ...base,
      status: 'fail',
      evidence: `${violators.length} ticker(s) below coverage ${COVERAGE_MIN}: ${violators.map(([k, v]) => `${k}=${v.toFixed(3)}`).join(', ')}`,
    };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
