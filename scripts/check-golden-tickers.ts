#!/usr/bin/env tsx
// scripts/check-golden-tickers.ts
//
// Plan 20-D-04 Task 8 — Orchestrated CLI gate for the golden-ticker suite.
//
// Exit codes:
//   0 — all checks green
//   1 — one or more checks failed (structured FAIL summary at end)
//
// Composes:
//   1. Fixture presence — 8 sources + 8 reports on disk
//   2. Exemplar count — ≥30 human-label exemplars
//   3. Manifest age — emits WARN at >180 days, FAIL never (operator-driven)
//   4. Vitest pass — manifest unit + rotation unit + suite regression
//      + synthetic-injection
//   5. Cross-plan — 20-D-01 check-numeric-grounding gate

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

const checks: Check[] = [];
function add(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail });
}

const GOLDEN = path.join(process.cwd(), 'tests/golden-tickers');
const MANIFEST_PATH = path.join(GOLDEN, '_manifest.json');

// 0. Manifest exists + parses
let manifest: any = null;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  add('manifest loads', true, `version ${manifest.version}`);
} catch (e) {
  add('manifest loads', false, (e as Error).message);
}

// 1. Fixture presence
let sourceCount = 0;
let reportCount = 0;
try {
  sourceCount = fs
    .readdirSync(path.join(GOLDEN, '_sources'))
    .filter((f) => f.endsWith('.source.json')).length;
  reportCount = fs
    .readdirSync(path.join(GOLDEN, '_reports'))
    .filter((f) => f.endsWith('.report.json')).length;
} catch (e) {
  // tolerate missing dirs
}
add('SourcePackage fixtures (>=8)', sourceCount >= 8, `${sourceCount} files`);
add('AnalysisResult fixtures (>=8)', reportCount >= 8, `${reportCount} files`);

// 2. Exemplar count
let exemplarCount = 0;
try {
  exemplarCount = fs
    .readdirSync(path.join(GOLDEN, '_human_labels'))
    .filter((f) => f.endsWith('.json')).length;
} catch {
  /* missing dir */
}
add('Human-label exemplars (>=30)', exemplarCount >= 30, `${exemplarCount} files`);

// 3. Manifest age (WARN-only past 180d; still tracked as OK if file fresh)
if (manifest?.version) {
  const v = new Date(manifest.version);
  if (!Number.isNaN(v.getTime())) {
    const ageDays = (Date.now() - v.getTime()) / (1000 * 60 * 60 * 24);
    add(
      'Manifest age (<=180d)',
      ageDays <= 180,
      `${Math.round(ageDays)}d since ${manifest.version}`,
    );
  }
}

// 4. Vitest suites (unit + integration)
const unitTests = [
  'tests/unit/golden-ticker-manifest.unit.test.ts',
  'tests/unit/golden-ticker-rotation.unit.test.ts',
];
const integrationTests = [
  'tests/integration/golden-ticker-suite.regression.test.ts',
  'tests/integration/golden-ticker-suite.synthetic-injection.test.ts',
];

for (const t of unitTests) {
  const result = spawnSync('npx', ['vitest', 'run', t], { stdio: 'inherit' });
  add(`vitest unit ${path.basename(t)}`, result.status === 0, `exit=${result.status}`);
}
for (const t of integrationTests) {
  const result = spawnSync(
    'npx',
    ['vitest', 'run', '--config', 'vitest.integration.config.ts', t],
    { stdio: 'inherit' },
  );
  add(`vitest integration ${path.basename(t)}`, result.status === 0, `exit=${result.status}`);
}

// 5. Cross-plan numeric-grounding CLI (20-D-01)
const cng = spawnSync('npm', ['run', 'check-numeric-grounding'], { stdio: 'inherit' });
add('check-numeric-grounding (20-D-01)', cng.status === 0, `exit=${cng.status}`);

// Summary
console.log('\n=== check-golden-tickers summary ===');
let exit = 0;
for (const c of checks) {
  const tag = c.ok ? '  OK ' : 'FAIL ';
  console.log(`${tag} ${c.name} — ${c.detail}`);
  if (!c.ok) exit = 1;
}
if (exit !== 0) {
  console.error('\n[check-golden-tickers] one or more checks failed — see lines marked FAIL.');
} else {
  console.log('\n[check-golden-tickers] all gates green.');
}
process.exit(exit);
