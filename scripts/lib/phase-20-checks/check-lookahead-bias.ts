// scripts/lib/phase-20-checks/check-lookahead-bias.ts
// Owned by 20-Z-07 — this script only invokes the vitest spec.
//
// DoD #13 — invokes the 20-Z-07 vitest spec via execSync
// (npx vitest run tests/integration/lookahead-bias.integration.test.ts --run).
// Pass if exit 0. Fail if exit non-zero. Pending if spec file absent.

import type { CheckFn } from './types';

const SPEC_REL_PATH = 'tests/integration/lookahead-bias.integration.test.ts';
const VITEST_CMD =
  'npx vitest run tests/integration/lookahead-bias.integration.test.ts --config vitest.integration.config.ts --reporter=default 2>&1';

export const checkLookaheadBias: CheckFn = async (deps) => {
  const base = {
    name: 'lookahead-bias',
    dod_label: 'Lookahead-bias test green (20-Z-07)',
    blocker_for: 13,
    branch: 'hygiene',
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
