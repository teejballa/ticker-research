#!/usr/bin/env tsx
// scripts/audit-disclaimers.ts
//
// Plan 20-D-05 — CI build-blocking gate.
//
// Iterates available fixtures (tests/golden-tickers/ from 20-D-04 when
// present; falls back to a single inline fixture so this plan is mergeable
// independently of 20-D-04 ordering). For each fixture, invokes vitest to
// render the report under jsdom and audit it; exits non-zero if any
// fixture's audit reports missing RequiredElements.
//
// Implementation note: ResearchReport.tsx is a Next.js `'use client'` tree
// with deep transitive deps (NavBar / next/navigation / Material Symbols).
// The clean way to render it is via vitest's jsdom environment. Rather
// than rebuilding that harness here, this script invokes vitest in CI mode
// for the integration test, which already does the render+audit on the
// canonical fixture. When 20-D-04 lands and ships fixtures, this script
// will discover them and pass them through the same vitest harness.
//
// Exit codes:
//   0 — vitest passes (integration test + any per-fixture iteration green)
//   1 — vitest reports failures
//   2 — script crashed

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function listFixtures(): string[] {
  const dir = resolve(process.cwd(), 'tests/golden-tickers');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .filter((f) => {
      try {
        const raw = readFileSync(resolve(dir, f), 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed && parsed.analysisResult;
      } catch {
        return false;
      }
    });
}

function main(): void {
  const fixtures = listFixtures();
  if (fixtures.length === 0) {
    console.log('[audit-disclaimers] tests/golden-tickers/ has no fixtures matching schema — using fallback (the integration test renders the canonical inline AnalysisResult under jsdom)');
  } else {
    console.log(`[audit-disclaimers] tests/golden-tickers/ has ${fixtures.length} fixture(s): ${fixtures.join(', ')}`);
    // Note: per-fixture iteration is not yet wired through vitest. When 20-D-04
    // formalizes the fixture schema, extend the integration test to read this
    // directory and parameterize. For now, the integration test's canonical
    // fixture is the build-blocking gate.
  }

  // Drive the audit via vitest — same harness as `npm test`, deterministic.
  const result = spawnSync(
    'npx',
    ['vitest', 'run', 'tests/eval/disclaimer-audit.unit.test.ts', 'tests/eval/disclaimer-audit.integration.test.tsx'],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    console.error('[audit-disclaimers] FAILED — see vitest output above');
    process.exit(1);
  }
  console.log('[audit-disclaimers] PASS — render + audit clean');
}

try {
  main();
} catch (err) {
  console.error('[audit-disclaimers] CRASH:', err);
  process.exit(2);
}
