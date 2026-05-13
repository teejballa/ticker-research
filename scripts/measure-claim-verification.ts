#!/usr/bin/env tsx
/**
 * Plan 20-D-03 — Baseline measurement script.
 *
 * Iterates 8 golden-ticker SourcePackages (forward-ref to 20-D-04 — files at
 * tests/golden-tickers/*.json), runs verifyClaimsBatch on each, and writes
 * per-ticker × per-section verified-rate to reports/per-claim-verification-baseline-{YYYY-MM-DD}.json.
 *
 * Exit codes:
 *   0 — success (baseline written, or detection-only-mode inert run when
 *       HF_DISTILBERT_MNLI_ENDPOINT is UNSET — see below).
 *   4 — NO_GOLDEN_FIXTURES (tests/golden-tickers/ missing OR empty).
 *   5 — NLI_ENDPOINT_DOWN (every signal returned 'null' AND endpoint env was SET).
 *
 * Output JSON schema:
 *   {
 *     run_date: string;                  // ISO 8601
 *     golden_ticker_count: number;       // observed (≤ 8)
 *     verifier_latency_ms_total: number;
 *     per_ticker: { [ticker]: { bullish/bearish/risks: {true,false,null} } };
 *     totals: { true: number; false: number; null: number };
 *   }
 *
 * Usage:
 *   npm run measure-claim-verification
 */

import fs from 'node:fs';
import path from 'node:path';
import { verifyClaimsBatch, type PerClaimVerdict } from '@/lib/eval/per-claim-verifier';
import type { SourcePackage } from '@/lib/types';

interface FixtureFile {
  ticker: string;
  source_package: SourcePackage;
  analysis_result: {
    bullish_signals?: Array<{ signal: string; source_citation?: string }>;
    bearish_signals?: Array<{ signal: string; source_citation?: string }>;
    risks?: Array<{ description: string; source_citation?: string }>;
  };
}

type SectionCounts = { true: number; false: number; null: number };
type PerTickerCounts = { bullish: SectionCounts; bearish: SectionCounts; risks: SectionCounts };
type Totals = SectionCounts;

interface MeasurementResult {
  exit_code: 0 | 4 | 5;
  baseline_path: string | null;
  totals: Totals;
}

interface MeasurementOptions {
  goldenDir?: string;
  outputDir?: string;
  dryRun?: boolean;
}

const ZERO_SECTION = (): SectionCounts => ({ true: 0, false: 0, null: 0 });

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoNow(): string {
  return new Date().toISOString();
}

function bumpSection(s: SectionCounts, v: PerClaimVerdict): void {
  s[v] += 1;
}

function bumpTotals(t: Totals, v: PerClaimVerdict): void {
  t[v] += 1;
}

export async function runMeasurement(opts: MeasurementOptions = {}): Promise<MeasurementResult> {
  const goldenDir = opts.goldenDir ?? path.join(process.cwd(), 'tests/golden-tickers');
  const outputDir = opts.outputDir ?? path.join(process.cwd(), 'reports');
  const dryRun = opts.dryRun ?? false;

  // ── Step 1 — Fixture discovery ─────────────────────────────────────────
  let fixtureFiles: string[] = [];
  try {
    if (fs.existsSync(goldenDir) && fs.statSync(goldenDir).isDirectory()) {
      fixtureFiles = fs
        .readdirSync(goldenDir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => path.join(goldenDir, f));
    }
  } catch {
    fixtureFiles = [];
  }
  if (fixtureFiles.length === 0) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ exit_code: 4, reason: 'NO_GOLDEN_FIXTURES', golden_dir: goldenDir }));
    return { exit_code: 4, baseline_path: null, totals: ZERO_SECTION() };
  }

  // ── Step 2 — Run verifier per fixture ──────────────────────────────────
  const perTicker: Record<string, PerTickerCounts> = {};
  const totals: Totals = ZERO_SECTION();
  const startEpoch = Date.now();

  for (const fpath of fixtureFiles) {
    let fixture: FixtureFile;
    try {
      const raw = fs.readFileSync(fpath, 'utf-8');
      fixture = JSON.parse(raw) as FixtureFile;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[measure-claim-verification] failed to parse ${fpath}: ${(err as Error).message}`);
      continue;
    }
    const ticker = fixture.ticker;
    if (!ticker) continue;

    perTicker[ticker] = { bullish: ZERO_SECTION(), bearish: ZERO_SECTION(), risks: ZERO_SECTION() };
    const bullish = fixture.analysis_result?.bullish_signals ?? [];
    const bearish = fixture.analysis_result?.bearish_signals ?? [];
    const risks = fixture.analysis_result?.risks ?? [];

    const signals = [
      ...bullish.map((s, i) => ({ id: `bullish-${i}`, description: s.signal, supporting_evidence: s.source_citation })),
      ...bearish.map((s, i) => ({ id: `bearish-${i}`, description: s.signal, supporting_evidence: s.source_citation })),
      ...risks.map((r, i) => ({ id: `risks-${i}`, description: r.description, supporting_evidence: r.source_citation })),
    ];
    if (signals.length === 0) continue;

    const verdicts = await verifyClaimsBatch(signals, fixture.source_package);
    for (let i = 0; i < bullish.length; i++) {
      const v = verdicts.get(`bullish-${i}`) ?? 'null';
      bumpSection(perTicker[ticker].bullish, v);
      bumpTotals(totals, v);
    }
    for (let i = 0; i < bearish.length; i++) {
      const v = verdicts.get(`bearish-${i}`) ?? 'null';
      bumpSection(perTicker[ticker].bearish, v);
      bumpTotals(totals, v);
    }
    for (let i = 0; i < risks.length; i++) {
      const v = verdicts.get(`risks-${i}`) ?? 'null';
      bumpSection(perTicker[ticker].risks, v);
      bumpTotals(totals, v);
    }
  }

  const latency_ms_total = Date.now() - startEpoch;

  // ── Step 3 — NLI endpoint health check ─────────────────────────────────
  // Exit code 5 when EVERY signal returned 'null' AND the endpoint env var WAS set
  // (signals the endpoint is provisioned but unreachable). When the env var is
  // UNSET, all-null totals are the documented detection-only-mode behavior —
  // still exit 0 with a baseline file (the all-null distribution IS the
  // canonical "verifier is inert" reference).
  const endpointWasSet = Boolean(process.env.HF_DISTILBERT_MNLI_ENDPOINT);
  const totalSignals = totals.true + totals.false + totals.null;
  if (endpointWasSet && totalSignals > 0 && totals.true === 0 && totals.false === 0) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      exit_code: 5,
      reason: 'NLI_ENDPOINT_DOWN',
      total_signals: totalSignals,
      totals,
    }));
    return { exit_code: 5, baseline_path: null, totals };
  }

  // ── Step 4 — Write baseline JSON ───────────────────────────────────────
  const baselinePath = path.join(outputDir, `per-claim-verification-baseline-${todayIso()}.json`);
  const payload = {
    run_date: isoNow(),
    golden_ticker_count: Object.keys(perTicker).length,
    verifier_latency_ms_total: latency_ms_total,
    per_ticker: perTicker,
    totals,
  };
  if (!dryRun) {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(payload, null, 2));
  }
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ exit_code: 0, baseline_path: baselinePath, totals }));
  return { exit_code: 0, baseline_path: baselinePath, totals };
}

// ── CLI entry point ──────────────────────────────────────────────────────
// Invoked directly via `npm run measure-claim-verification`.
const isDirectInvocation = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('measure-claim-verification.ts');
  } catch {
    return false;
  }
})();

if (isDirectInvocation) {
  runMeasurement().then(
    (r) => {
      process.exit(r.exit_code);
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error('[measure-claim-verification] unexpected error:', (err as Error).message);
      process.exit(1);
    },
  );
}
