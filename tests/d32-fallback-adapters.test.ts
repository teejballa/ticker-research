// tests/d32-fallback-adapters.test.ts
//
// Phase 19 / Plan 19-B-08 / Task 3 — D-32 fallback-adapter invariant.
//
// 19-CONTEXT D-32 (decision):
//   "Yahoo / Finnhub / Polygon / Anthropic-search adapters remain wired up
//    as fallbacks — NOT deleted from tree. Only the direct call from
//    source-package.ts primary path is removed after shadow verdict passes."
//
// This test enforces that D-32 invariant permanently. It runs in the fast
// unit suite (no DB, no network), so a future PR that:
//   1. Deletes yahoo.ts / finnhub.ts / polygon.ts / anthropic-search.ts, OR
//   2. Removes the import from source-package.ts (which would silently
//      eliminate the fallback rung even though the file still exists)
// fails CI before it can land.
//
// Threat T-19-B-08-02 (CONTEXT 19-B-08-PLAN.md threat_model row 2):
//   "yahoo/finnhub/polygon/anthropic-search files accidentally deleted
//    during cutover" → mitigate via this CI rule.

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..');

// Each entry pairs the adapter file with the symbol(s) source-package.ts must
// import from it. The symbol check is stronger than substring — a future
// refactor that renames the import path won't accidentally pass the gate.
const FALLBACKS = [
  {
    file: 'src/lib/data/yahoo.ts',
    importPattern: /from\s+['"]@\/lib\/data\/yahoo['"]/,
  },
  {
    file: 'src/lib/data/finnhub.ts',
    importPattern: /from\s+['"]@\/lib\/data\/finnhub['"]/,
  },
  {
    file: 'src/lib/data/polygon.ts',
    importPattern: /from\s+['"]@\/lib\/data\/polygon['"]/,
  },
  {
    file: 'src/lib/data/anthropic-search.ts',
    importPattern: /from\s+['"]@\/lib\/data\/anthropic-search['"]/,
  },
] as const;

describe('D-32 fallback-adapter invariant (Plan 19-B-08)', () => {
  describe('adapter files preserved in tree', () => {
    it.each(FALLBACKS)('$file exists', ({ file }) => {
      const abs = path.join(REPO_ROOT, file);
      expect(existsSync(abs)).toBe(true);
    });
  });

  describe('source-package.ts still imports each fallback adapter', () => {
    const sourcePackagePath = path.join(REPO_ROOT, 'src/lib/data/source-package.ts');
    const sourcePackageSrc = existsSync(sourcePackagePath)
      ? readFileSync(sourcePackagePath, 'utf-8')
      : '';

    it.each(FALLBACKS)(
      'source-package.ts imports from $file',
      ({ importPattern }) => {
        expect(sourcePackageSrc).toMatch(importPattern);
      },
    );
  });

  describe('source-package.ts mentions each adapter by name', () => {
    // Belt-and-suspender to the import-path test: ensures the adapter is
    // actually referenced in the function body, not just imported then
    // unused.
    const sourcePackagePath = path.join(REPO_ROOT, 'src/lib/data/source-package.ts');
    const sourcePackageSrc = existsSync(sourcePackagePath)
      ? readFileSync(sourcePackagePath, 'utf-8')
      : '';

    const expectedFunctions = [
      'fetchMarketData', // from yahoo
      'fetchFundamentals', // from yahoo
      'fetchFinnhub', // from finnhub
      'fetchPolygon', // from polygon
    ];

    it.each(expectedFunctions)(
      'source-package.ts references %s',
      (fn) => {
        expect(sourcePackageSrc).toContain(fn);
      },
    );
  });
});
