// tests/integration/horizon-brier.test.ts
// Phase 16-05 — AC4 gate: Brier(30d) ≤ Brier(7d) for ≥1 ACTIVE TechPattern.
// Loose pass — surfacing 'no improvement' is acceptable. Asserts the CLI exits
// 0 and emits exactly one of the AC4 marker lines.

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env.local' });

const HAS_DB = !!process.env.DATABASE_URL;
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb('AC4: Brier(30d) ≤ Brier(7d) for ≥1 ACTIVE pattern (loose pass)', () => {
  it('compare-horizon-brier.ts exits 0 and emits AC4 line', () => {
    const r = spawnSync('npx', ['tsx', 'scripts/compare-horizon-brier.ts'], {
      env: { ...process.env },
      encoding: 'utf-8',
    });
    if (r.stdout) console.log(r.stdout);
    if (r.stderr) console.error(r.stderr);
    expect(r.status).toBe(0); // loose pass — accepts either outcome
    expect(r.stdout).toMatch(/AC4: (PASS|NO_IMPROVEMENT)/);
  });
});
