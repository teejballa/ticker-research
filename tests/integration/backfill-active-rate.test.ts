// tests/integration/backfill-active-rate.test.ts
// Phase 16-05 — AC3 gate: ≥25% ACTIVE in the most-traded cap_class × horizon=7
// row of the technical signal class. Runs the standalone CLI script as a child
// process and asserts exit 0 + the AC3 marker line.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env.local' });

const HAS_DB = !!process.env.DATABASE_URL;
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb('AC3: ≥25% ACTIVE in most-traded cap_class × horizon=7', () => {
  it('check-active-cell-coverage.ts exits 0 and emits AC3 marker', () => {
    const r = spawnSync('npx', ['tsx', 'scripts/check-active-cell-coverage.ts'], {
      env: { ...process.env },
      encoding: 'utf-8',
    });
    // Surface the script output so a failure is debuggable.
    if (r.stdout) console.log(r.stdout);
    if (r.stderr) console.error(r.stderr);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/AC3: \d+(?:\.\d+)?% ACTIVE/);
  });
});
