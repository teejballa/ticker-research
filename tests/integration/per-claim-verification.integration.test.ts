// Plan 20-D-03 — Integration test for the per-claim verifier + measurement script.
//
// Four gates:
//   1. Empty golden-tickers directory → exit code 4 (NO_GOLDEN_FIXTURES).
//   2. Synthetic 8-ticker fixture set → exit code 0; baseline JSON written
//      with documented schema.
//   3. Latency gate — 8 synthetic fixtures (~80 signals) verified in < 30s
//      wall-clock.
//   4. Backward-compat gate re-asserted at the integration level: pre-plan
//      AnalysisResult fixture round-trips through the new Zod schema with NO
//      Zod failures.
//
// NOTE: When DATABASE_URL is absent, this test SKIPS (per EFFICIENCY
// DIRECTIVE — Vitest integration suite is live-DB-bound by convention). When
// HF_DISTILBERT_MNLI_ENDPOINT is unset, verifyClaimsBatch returns 'null' for
// every signal (documented detection-only-mode behavior). The script still
// writes a valid baseline file with all-null totals — that IS the canonical
// "verifier is inert" reference, NOT an error.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Stub prisma + heavy transitive deps so the schema-backcompat gate at the
// integration level doesn't require DATABASE_URL.
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { runMeasurement } from '../../scripts/measure-claim-verification';
import { AnalysisResultSchema } from '@/lib/gemini-analysis';
import preFixture from '../fixtures/pre-20-D-03-analysis-result.json';

const MINIMAL_PKG = {
  ticker: 'TST',
  company_name: 'Test',
  exchange: 'NASDAQ',
  security_type: 'common_stock',
  assembled_at: '2026-05-13T00:00:00Z',
  market_data: { price: 100 },
  fundamentals: { pe_ratio: 20 },
  news: { items: [] },
  analyst_sentiment: {},
  sec_filing_summary: {},
  social_sentiment: {},
  collection_errors: [],
  supplementary_market_data: { sources: [] },
  sentiment_intelligence: {},
};

function buildFixture(ticker: string, n: number = 10): unknown {
  const bullish = Array.from({ length: Math.ceil(n / 3) }, (_, i) => ({
    signal: `${ticker} bullish signal ${i}: revenue grew`,
    source_citation: `src-${i}`,
  }));
  const bearish = Array.from({ length: Math.ceil(n / 3) }, (_, i) => ({
    signal: `${ticker} bearish signal ${i}: margin compressed`,
    source_citation: `src-${i}`,
  }));
  const risks = Array.from({ length: Math.floor(n / 3) }, (_, i) => ({
    description: `${ticker} risk ${i}: customer concentration`,
    source_citation: `src-${i}`,
  }));
  return {
    ticker,
    source_package: { ...MINIMAL_PKG, ticker, company_name: ticker },
    analysis_result: { bullish_signals: bullish, bearish_signals: bearish, risks },
  };
}

function setupTmpDirs(): { goldenDir: string; outputDir: string; cleanup: () => void } {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), '20-D-03-it-'));
  const goldenDir = path.join(tmpRoot, 'golden-tickers');
  const outputDir = path.join(tmpRoot, 'reports');
  fs.mkdirSync(goldenDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  return {
    goldenDir,
    outputDir,
    cleanup: () => {
      try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

describe('20-D-03 per-claim verification — measurement script integration', () => {
  let cleanup: (() => void) | undefined;
  afterEach(() => {
    if (cleanup) { cleanup(); cleanup = undefined; }
  });
  beforeEach(() => {
    // The detection-only-mode path is the documented default for this test.
    delete process.env.HF_DISTILBERT_MNLI_ENDPOINT;
  });

  it('Gate 1 — empty golden-tickers directory → exit code 4 (NO_GOLDEN_FIXTURES)', async () => {
    const dirs = setupTmpDirs();
    cleanup = dirs.cleanup;
    // goldenDir created but empty.
    const result = await runMeasurement({ goldenDir: dirs.goldenDir, outputDir: dirs.outputDir });
    expect(result.exit_code).toBe(4);
    expect(result.baseline_path).toBeNull();
  });

  it('Gate 1b — non-existent golden-tickers directory → exit code 4', async () => {
    const result = await runMeasurement({
      goldenDir: path.join(os.tmpdir(), `does-not-exist-${Date.now()}`),
      outputDir: path.join(os.tmpdir(), `out-${Date.now()}`),
    });
    expect(result.exit_code).toBe(4);
  });

  it('Gate 2 — synthetic 8-ticker fixture set → exit code 0; baseline JSON written with documented schema', async () => {
    const dirs = setupTmpDirs();
    cleanup = dirs.cleanup;
    const tickers = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD'];
    for (const t of tickers) {
      fs.writeFileSync(path.join(dirs.goldenDir, `${t}.json`), JSON.stringify(buildFixture(t, 10)));
    }
    const result = await runMeasurement({ goldenDir: dirs.goldenDir, outputDir: dirs.outputDir });
    expect(result.exit_code).toBe(0);
    expect(result.baseline_path).not.toBeNull();
    expect(fs.existsSync(result.baseline_path!)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(result.baseline_path!, 'utf-8'));
    expect(payload.run_date).toBeTypeOf('string');
    expect(payload.golden_ticker_count).toBe(8);
    expect(payload.verifier_latency_ms_total).toBeGreaterThanOrEqual(0);
    expect(payload.per_ticker).toBeDefined();
    expect(Object.keys(payload.per_ticker)).toHaveLength(8);
    // Per-ticker structure check on one ticker
    const aapl = payload.per_ticker['AAPL'];
    expect(aapl.bullish).toEqual(expect.objectContaining({ true: expect.any(Number), false: expect.any(Number), null: expect.any(Number) }));
    expect(aapl.bearish).toEqual(expect.objectContaining({ true: expect.any(Number), false: expect.any(Number), null: expect.any(Number) }));
    expect(aapl.risks).toEqual(expect.objectContaining({ true: expect.any(Number), false: expect.any(Number), null: expect.any(Number) }));
    // Totals
    expect(payload.totals).toEqual(expect.objectContaining({ true: expect.any(Number), false: expect.any(Number), null: expect.any(Number) }));
    // In detection-only mode (HF endpoint unset), every signal should be 'null'.
    expect(payload.totals.true).toBe(0);
    expect(payload.totals.false).toBe(0);
    expect(payload.totals.null).toBeGreaterThan(0);
  });

  it('Gate 3 — latency — 8 fixtures complete in < 30s wall-clock', async () => {
    const dirs = setupTmpDirs();
    cleanup = dirs.cleanup;
    const tickers = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD'];
    for (const t of tickers) {
      fs.writeFileSync(path.join(dirs.goldenDir, `${t}.json`), JSON.stringify(buildFixture(t, 10)));
    }
    const startEpoch = Date.now();
    const result = await runMeasurement({ goldenDir: dirs.goldenDir, outputDir: dirs.outputDir });
    const wallClock = Date.now() - startEpoch;
    expect(result.exit_code).toBe(0);
    expect(wallClock).toBeLessThan(30_000);
  });

  it('Gate 4 — backward compat — pre-plan AnalysisResult JSON round-trips through new Zod schema', () => {
    const r = AnalysisResultSchema.safeParse(preFixture);
    expect(r.success).toBe(true);
    if (r.success) {
      for (const s of r.data.bullish_signals) {
        expect((s as { verified?: unknown }).verified).toBeUndefined();
      }
    }
  });
});
