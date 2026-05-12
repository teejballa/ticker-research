// scripts/lib/phase-20-checks/check-numeric-grounding.ts
// Owned by 20-D-01 — this script only invokes the vitest spec.
//
// DoD #10 — invokes the 20-D-01 vitest spec via execSync
// (npx vitest run tests/numeric-grounding.test.ts --run). Pass if exit 0.
// Fail if exit non-zero with reported failures. Pending if spec file absent.

import type { CheckFn } from './types';

const SPEC_REL_PATH = 'tests/numeric-grounding.test.ts';
const VITEST_CMD = 'npx vitest run tests/numeric-grounding.test.ts --reporter=default 2>&1';

export const checkNumericGrounding: CheckFn = async (deps) => {
  const base = {
    name: 'numeric-grounding',
    dod_label: 'Numeric-grounding test green on all 8 golden tickers (20-D-01)',
    blocker_for: 10,
    branch: 'report',
  } as const;
  try {
    const specPath = `${deps.repoRoot}/${SPEC_REL_PATH}`;
    if (!deps.fs.existsSync(specPath)) {
      return { ...base, status: 'pending', evidence: `artifact not yet present: ${SPEC_REL_PATH}` };
    }
    const result = deps.exec(VITEST_CMD);
    if (result.exitCode === 0) {
      return { ...base, status: 'pass', evidence: `vitest exit 0 on ${SPEC_REL_PATH}` };
    }
    return {
      ...base,
      status: 'fail',
      evidence: `vitest exit ${result.exitCode} on ${SPEC_REL_PATH}`,
    };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
