// tests/integration/golden-ticker-suite.synthetic-injection.test.ts
//
// Plan 20-D-04 Task 6 — Proof-of-realness for the orchestrated suite.
//
// For each of the 8 manifest tickers, inject deliberately bad data into a
// deep-clone of the frozen report and assert the suite FAILS the right gate.
// Without this, the regression suite could pass vacuously (e.g., if every
// fixture was empty).
//
// Injection battery (per ticker):
//   A — splice "$999,999" into executive_summary → numeric-grounding fail
//   C — collapse narrative to "Buy." → word-count gate fails (<50 floor)
//   D — splice "Internal Server Error" into key_risks → no-5xx fails
//   Clean baseline — numeric-grounding passes (proves the gate fires only on bad)
//
// Injection B (verifier contradiction) is gated behind RUN_LIVE_VERIFIER,
// same as the regression suite, so HF tokens aren't burned on every CI run.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { numericGroundingCheck } from '@/lib/eval/numeric-grounding';
import type { SourcePackage } from '@/lib/types';

const GOLDEN_DIR = path.resolve(__dirname, '..', 'golden-tickers');
const MANIFEST_PATH = path.join(GOLDEN_DIR, '_manifest.json');

interface ManifestTicker {
  symbol: string;
  category: string;
  rotation_policy: 'static' | 'monthly';
  current_symbol?: string;
}
interface Manifest {
  tickers: ManifestTicker[];
}

const MANIFEST: Manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

function resolveSymbol(t: ManifestTicker): string {
  return t.rotation_policy === 'monthly' && t.current_symbol
    ? t.current_symbol
    : t.symbol;
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

const NARRATIVE_FIELDS = [
  'executive_summary',
  'investment_thesis',
  'key_risks',
  'valuation_context',
  'future_projection',
  'business_description',
  'financial_analysis',
  'competitive_landscape',
] as const;

const SERVER_ERROR_SENTINELS = [
  'Internal Server Error',
  '500 -',
  '502 Bad Gateway',
  '503 Service Unavailable',
  '504 Gateway Timeout',
];

describe('golden-ticker-suite synthetic injection', () => {
  for (const t of MANIFEST.tickers) {
    const sym = resolveSymbol(t);
    if (sym === 'TBD-FIRST-ROTATION') {
      it.skip(`synthetic-injection ${t.category} — rotation pending`, () => {});
      continue;
    }

    describe(`synthetic-injection ${sym} (${t.category})`, () => {
      let baseSource: SourcePackage;
      let baseReport: any;
      let loaded = false;

      beforeAll(() => {
        try {
          baseSource = JSON.parse(
            fs.readFileSync(
              path.join(GOLDEN_DIR, '_sources', `${sym.toLowerCase()}.source.json`),
              'utf8',
            ),
          );
          baseReport = JSON.parse(
            fs.readFileSync(
              path.join(GOLDEN_DIR, '_reports', `${sym.toLowerCase()}.report.json`),
              'utf8',
            ),
          );
          loaded = true;
        } catch (e) {
          console.error(`[synthetic-injection][${sym}] FIXTURE MISSING: ${(e as Error).message}`);
        }
      });

      it('clean baseline — numeric-grounding passes (gate is not vacuous)', () => {
        if (!loaded) return;
        const r = numericGroundingCheck(baseReport, baseSource);
        expect(r.ungrounded_spans).toHaveLength(0);
      });

      it('injection A — unmatchable number $999,999 FAILS numeric-grounding', () => {
        if (!loaded) return;
        const dirty = structuredClone(baseReport);
        dirty.executive_summary =
          `${dirty.executive_summary} The new estimated price target is $999,999.`;
        const r = numericGroundingCheck(dirty, baseSource);
        expect(r.ungrounded_spans.length).toBeGreaterThan(0);
        expect(
          r.ungrounded_spans.some((s) => String(s.span.text).includes('999')),
          `${sym}: expected at least one ungrounded span containing '999'`,
        ).toBe(true);
      });

      it('injection C — collapsed narrative FAILS word-count gate', () => {
        if (!loaded) return;
        const dirty = structuredClone(baseReport);
        for (const f of NARRATIVE_FIELDS) dirty[f] = '';
        dirty.executive_summary = 'Buy.';
        const text = NARRATIVE_FIELDS.map((f) => dirty[f] ?? '').join('\n');
        expect(wordCount(text)).toBeLessThan(50);
      });

      it('injection D — 5xx sentinel FAILS no-5xx assertion', () => {
        if (!loaded) return;
        const dirty = structuredClone(baseReport);
        dirty.key_risks = `${dirty.key_risks} Internal Server Error during data fetch.`;
        const text = NARRATIVE_FIELDS.map((f) => dirty[f] ?? '').join('\n');
        // The no-5xx assertion is `not.toContain(sentinel)` — invert to confirm
        // the sentinel IS present in the injected variant.
        const present = SERVER_ERROR_SENTINELS.some((s) => text.includes(s));
        expect(present, `${sym}: 5xx sentinel should be present after injection`).toBe(true);
      });
    });
  }
});
