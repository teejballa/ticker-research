// tests/integration/numeric-grounding.synthetic-injection.test.ts
//
// Plan 20-D-01 Task 7 — Proof-of-realness gate.
//
// For each of 3 representative tickers, clone the frozen report, splice an
// unmatchable number ('$999,999') into executive_summary, and assert the
// matcher rejects it. If this test passes vacuously (matcher returns 0
// failures even with the injection), the matcher is broken.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { numericGroundingCheck } from '@/lib/eval/numeric-grounding';
import type { SourcePackage } from '@/lib/types';

const SOURCES_DIR = path.resolve(__dirname, '..', 'golden-tickers', '_sources');
const REPORTS_DIR = path.resolve(__dirname, '..', 'golden-tickers', '_reports');

const INJECTION_TICKERS = ['aapl', 'gme', 'spy'];

describe('numeric grounding — synthetic-injection proof-of-realness', () => {
  it.each(INJECTION_TICKERS)('injecting $999,999 into %s.executive_summary fails the matcher', (ticker) => {
    const srcRaw = fs.readFileSync(path.join(SOURCES_DIR, `${ticker}.source.json`), 'utf8');
    const repRaw = fs.readFileSync(path.join(REPORTS_DIR, `${ticker}.report.json`), 'utf8');
    const pkg = JSON.parse(srcRaw) as SourcePackage;
    const report = JSON.parse(repRaw);

    // Sanity: the unmodified report passes.
    const baseline = numericGroundingCheck(report, pkg);
    expect(baseline.ungrounded_spans, `baseline ${ticker} should be clean`).toHaveLength(0);

    // Inject $999,999 — a value no plausible SourcePackage leaf carries.
    const injected = {
      ...report,
      executive_summary: `${report.executive_summary} The unmatchable figure is $999,999.`,
    };

    const result = numericGroundingCheck(injected, pkg);

    expect(result.ungrounded_spans.length).toBeGreaterThanOrEqual(1);

    // The failure list contains the injected span.
    const found = result.ungrounded_spans.find(f =>
      f.span.text.includes('999') && f.span.value === 999_999,
    );
    expect(found, `${ticker}: matcher did not surface the $999,999 injection`).toBeDefined();
  });

  it('matcher catches injected unmatchable percentage', () => {
    const srcRaw = fs.readFileSync(path.join(SOURCES_DIR, `aapl.source.json`), 'utf8');
    const repRaw = fs.readFileSync(path.join(REPORTS_DIR, `aapl.report.json`), 'utf8');
    const pkg = JSON.parse(srcRaw) as SourcePackage;
    const report = JSON.parse(repRaw);

    // 99.9% is not in the SourcePackage anywhere.
    const injected = {
      ...report,
      key_risks: `${report.key_risks} Volatility ratio of 99.9% across the cycle.`,
    };

    const result = numericGroundingCheck(injected, pkg);
    const found = result.ungrounded_spans.find(f => f.span.text.includes('99.9'));
    expect(found).toBeDefined();
    expect(found?.span.tier).toBe('percentage');
  });
});
