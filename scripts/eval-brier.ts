// scripts/eval-brier.ts
//
// Phase 20-C-02: Brier-score evaluation harness.
//
// Joins SentimentObservation (by PIT-INVARIANT `fetched_at` — NEVER the
// upstream-claimed timestamp, per T-20-C-02-05 + 20-Z-01 marker) against forward 7-day
// alpha-vs-SPY computed via PriceOutcome.pct_change at days_after=7
// minus SPY's 7d return (yahoo-finance2). Per classifier_version:
// computes Brier + Murphy 1973 decomposition + CORP-method reliability
// diagram (Dimitriadis-Gneiting-Jordan PNAS 2021). Emits
//   reports/brier-{YYYY-MM-DD}.json  (always — gitignored)
//   reports/brier-{YYYY-MM-DD}.md    (only on ship_gate_failed — committed
//                                     as operator remediation artifact).
//
// Local debug:
//   tsx scripts/eval-brier.ts --cutoff 2026-05-12 --lookback-days 90
//
// Binary outcome encoding (CONTEXT.md §S1 / line 125 verbatim:
// "sentiment-bullish ⇒ beats SPY in 7d"):
//   • Tag classifier (classifier_score ∈ {-1, 0, +1}, e.g. stocktwits-tag-v1)
//     maps to {0.0, 0.5, 1.0}.
//   • Continuous classifier (classifier_score ∈ [-1, +1], e.g. FinBERT or
//     Gemini per-doc) maps p = (score + 1) / 2.
//
// REMEDIATION_RECOMMENDATION decision rule (Murphy 1973 partition):
//   • Reliability term ≥ 0.5 × BS  → REMEDIATE_BY_TEMPERATURE_SCALING
//     (classifier is miscalibrated; 20-B-03 path).
//   • Resolution term < uncertainty / 4  → REMEDIATE_BY_DROPPING_CLASSIFIER
//     (low discriminative skill — no signal).
//   • Otherwise (first run, no prior to compare against)  → ACCEPT_AS_BASELINE.

import * as fs from 'node:fs';
import * as path from 'node:path';

import YahooFinance from 'yahoo-finance2';

import { prisma } from '@/lib/db';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
import {
  brierScore,
  brierDecomposition,
} from '@/lib/stats/brier';
import { corpReliabilityDiagram } from '@/lib/stats/isotonic';

const SHIP_GATE_THRESHOLD = 0.24;
const BASE_RATE_IMBALANCE_WINDOW = 0.1;
const MIN_N_PER_CLASSIFIER = 100;

export interface EvalBrierResult {
  computed_at: string;
  classifier_version: string;
  n: number;
  base_rate: number;
  brier: number;
  reliability: number;
  resolution: number;
  uncertainty: number;
  bs_check: number;
  corp: {
    recalibrated_curve: { x: number[]; y: number[] };
    bin_counts: number[];
  };
  status: 'evaluated' | 'insufficient_data' | 'ship_gate_failed';
  ship_gate: {
    threshold: number;
    met: boolean;
    base_rate_imbalance_acknowledged?: boolean;
    dominant_failure_mode?:
      | 'reliability'
      | 'resolution'
      | 'base_rate_imbalance';
    remediation_recommendation?:
      | 'ACCEPT_AS_BASELINE'
      | 'REMEDIATE_BY_TEMPERATURE_SCALING'
      | 'REMEDIATE_BY_DROPPING_CLASSIFIER';
  };
}

// ─── Predicted P(bullish) mapping ─────────────────────────────────────────

// Tag-shaped classifier versions emit scores in {-1, 0, +1}. Continuous
// versions emit in [-1, +1]. Either way, the mapping yields p ∈ [0, 1].
function predictedPBullish(
  classifier_version: string,
  classifier_score: number,
): number | null {
  if (!Number.isFinite(classifier_score)) return null;
  // Hard-clamp inputs to the expected [-1, 1] domain (defensive — upstream
  // backfills have produced strays).
  const s = Math.max(-1, Math.min(1, classifier_score));
  return (s + 1) / 2;
}

// ─── SPY history loader (yahoo-finance2; mirrors learn/route.ts) ──────────

interface SpyHistory {
  closes: Map<string, number>; // YYYY-MM-DD → close
}

async function fetchSpyHistory(
  daysBack: number = 100,
): Promise<SpyHistory> {
  const period1 = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);
  const period2 = new Date();
  const result = await yf.chart('SPY', {
    period1,
    period2,
    interval: '1d',
  });
  const closes = new Map<string, number>();
  for (const q of result.quotes ?? []) {
    if (q.close == null) continue;
    closes.set(q.date.toISOString().split('T')[0], q.close);
  }
  return { closes };
}

function nearestSpyClose(
  history: SpyHistory,
  target: Date,
): number | null {
  for (let offset = 0; offset < 5; offset++) {
    const d = new Date(target.getTime() - offset * 24 * 60 * 60 * 1000);
    const key = d.toISOString().split('T')[0];
    const close = history.closes.get(key);
    if (close != null) return close;
  }
  return null;
}

// ─── Alpha-vs-SPY computation surface (test-overridable) ──────────────────
//
// In production this resolves via fetchSpyHistory + PriceOutcome. In
// integration tests we inject a deterministic stub via setAlphaResolver
// so the integration test does not need yahoo-finance2 or PriceOutcome
// fixtures.
//
// The stub takes (ticker, fetched_at_day) → alpha_7d_pct or null.

export type AlphaResolver = (
  ticker: string,
  fetchedAtDay: string,
) => Promise<number | null> | number | null;

let _alphaResolver: AlphaResolver | null = null;

export function setAlphaResolver(r: AlphaResolver | null): void {
  _alphaResolver = r;
}

async function resolveAlphaProduction(
  ticker: string,
  fetchedAtDay: string,
  spy: SpyHistory,
): Promise<number | null> {
  // PIT-INVARIANT — outcomes joined via recorded_at + days_after, NOT via
  // the upstream-claimed-timestamp (T-20-C-02-05 / 20-Z-07 enforced).
  const horizonMs = 7 * 24 * 60 * 60 * 1000;
  const dayStart = new Date(`${fetchedAtDay}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const outcomes = await prisma.priceOutcome.findMany({
    where: {
      days_after: 7,
      // Outcome recorded_at ≈ fetched_at_day + 7d (±1 day buffer).
      recorded_at: {
        gte: new Date(dayStart.getTime() + horizonMs - 24 * 60 * 60 * 1000),
        lte: new Date(dayEnd.getTime() + horizonMs + 24 * 60 * 60 * 1000),
      },
    },
    select: {
      pct_change: true,
      recorded_at: true,
      report: { select: { ticker: true, analyzed_at: true } },
      snapshot: { select: { ticker: true, scanned_at: true } },
    },
  });
  let outcomePct: number | null = null;
  for (const o of outcomes) {
    const tickerHere = o.report?.ticker ?? o.snapshot?.ticker;
    if (tickerHere !== ticker) continue;
    const originAt =
      o.report?.analyzed_at ??
      o.snapshot?.scanned_at ??
      new Date(o.recorded_at.getTime() - horizonMs);
    const originDay = originAt.toISOString().slice(0, 10);
    if (originDay !== fetchedAtDay) continue;
    outcomePct = o.pct_change;
    break;
  }
  if (outcomePct == null) return null;
  const spyStart = nearestSpyClose(spy, dayStart);
  const spyEnd = nearestSpyClose(
    spy,
    new Date(dayStart.getTime() + horizonMs),
  );
  if (spyStart == null || spyEnd == null) return null;
  const spyPct = ((spyEnd - spyStart) / spyStart) * 100;
  return outcomePct - spyPct;
}

// ─── Decomposition → ship-gate verdict ────────────────────────────────────

function decideShipGate(
  brier: number,
  base_rate: number,
  reliability: number,
  resolution: number,
  uncertainty: number,
): EvalBrierResult['ship_gate'] {
  const base_rate_imbalanced =
    Math.abs(base_rate - 0.5) >= BASE_RATE_IMBALANCE_WINDOW;
  const met = brier <= SHIP_GATE_THRESHOLD && !base_rate_imbalanced;
  let dominant_failure_mode:
    | 'reliability'
    | 'resolution'
    | 'base_rate_imbalance'
    | undefined;
  let remediation_recommendation:
    | 'ACCEPT_AS_BASELINE'
    | 'REMEDIATE_BY_TEMPERATURE_SCALING'
    | 'REMEDIATE_BY_DROPPING_CLASSIFIER'
    | undefined;
  if (!met) {
    if (base_rate_imbalanced) {
      dominant_failure_mode = 'base_rate_imbalance';
      remediation_recommendation = 'ACCEPT_AS_BASELINE';
    } else if (reliability >= 0.5 * brier) {
      dominant_failure_mode = 'reliability';
      remediation_recommendation = 'REMEDIATE_BY_TEMPERATURE_SCALING';
    } else if (resolution < uncertainty / 4) {
      dominant_failure_mode = 'resolution';
      remediation_recommendation = 'REMEDIATE_BY_DROPPING_CLASSIFIER';
    } else {
      dominant_failure_mode = 'reliability';
      remediation_recommendation = 'ACCEPT_AS_BASELINE';
    }
  }
  return {
    threshold: SHIP_GATE_THRESHOLD,
    met,
    base_rate_imbalance_acknowledged: base_rate_imbalanced
      ? false
      : undefined,
    dominant_failure_mode,
    remediation_recommendation,
  };
}

// ─── Top-level entry ──────────────────────────────────────────────────────

export interface RunEvalBrierOpts {
  cutoff?: Date;
  lookbackDays?: number;
  // When set, write JSON+MD to this directory instead of <cwd>/reports.
  outDir?: string;
}

export async function runEvalBrier(
  opts: RunEvalBrierOpts = {},
): Promise<{ results: EvalBrierResult[]; jsonPath: string; mdPath: string | null }> {
  const cutoff = opts.cutoff ?? new Date();
  const lookback = opts.lookbackDays ?? 90;
  const horizonMs = 7 * 24 * 60 * 60 * 1000;
  const lookbackMs = lookback * 24 * 60 * 60 * 1000;
  const windowStart = new Date(cutoff.getTime() - lookbackMs);
  const windowEnd = new Date(cutoff.getTime() - horizonMs);

  // PIT-INVARIANT — fetched_at is the ONLY join key. (Gate 8 requires zero
  // upstream-claimed-timestamp literals in this file.)
  const observations = await prisma.sentimentObservation.findMany({
    where: {
      fetched_at: { gte: windowStart, lte: windowEnd },
    },
    select: {
      ticker: true,
      fetched_at: true,
      classifier_version: true,
      classifier_score: true,
    },
  });

  // Group by classifier_version.
  type Group = {
    predictions: number[];
    outcomes: number[];
  };
  const byClassifier = new Map<string, Group>();
  const obsByClassifierByKey = new Map<
    string,
    Map<string, { ticker: string; day: string; sum: number; count: number }>
  >();

  for (const obs of observations) {
    if (obs.classifier_score == null) continue;
    const p = predictedPBullish(
      obs.classifier_version,
      obs.classifier_score,
    );
    if (p == null) continue;
    const day = obs.fetched_at.toISOString().slice(0, 10);
    const key = `${obs.ticker}__${day}`;
    let perKey = obsByClassifierByKey.get(obs.classifier_version);
    if (!perKey) {
      perKey = new Map();
      obsByClassifierByKey.set(obs.classifier_version, perKey);
    }
    const entry = perKey.get(key) ?? {
      ticker: obs.ticker,
      day,
      sum: 0,
      count: 0,
    };
    entry.sum += p;
    entry.count += 1;
    perKey.set(key, entry);
  }

  // Resolve alpha per (ticker, day) and assemble per-classifier vectors.
  let spy: SpyHistory | null = null;
  if (_alphaResolver == null) {
    spy = await fetchSpyHistory(lookback + 14);
  }

  for (const [classifier_version, perKey] of obsByClassifierByKey) {
    const g: Group = { predictions: [], outcomes: [] };
    for (const e of perKey.values()) {
      let alpha: number | null;
      if (_alphaResolver != null) {
        alpha = await _alphaResolver(e.ticker, e.day);
      } else {
        alpha = await resolveAlphaProduction(e.ticker, e.day, spy!);
      }
      if (alpha == null || !Number.isFinite(alpha)) continue;
      const pMean = e.sum / e.count;
      g.predictions.push(pMean);
      g.outcomes.push(alpha > 0 ? 1 : 0);
    }
    byClassifier.set(classifier_version, g);
  }

  // Per-classifier Brier + decomposition + CORP.
  const computedAt = cutoff.toISOString();
  const results: EvalBrierResult[] = [];
  for (const [classifier_version, g] of byClassifier) {
    if (g.predictions.length < MIN_N_PER_CLASSIFIER) {
      results.push({
        computed_at: computedAt,
        classifier_version,
        n: g.predictions.length,
        base_rate: 0,
        brier: 0,
        reliability: 0,
        resolution: 0,
        uncertainty: 0,
        bs_check: 0,
        corp: { recalibrated_curve: { x: [], y: [] }, bin_counts: [] },
        status: 'insufficient_data',
        ship_gate: { threshold: SHIP_GATE_THRESHOLD, met: false },
      });
      continue;
    }
    const brier = brierScore(g.predictions, g.outcomes);
    const dec = brierDecomposition(g.predictions, g.outcomes, 10);
    const corp = corpReliabilityDiagram(g.predictions, g.outcomes);
    const ship_gate = decideShipGate(
      brier,
      dec.base_rate,
      dec.reliability,
      dec.resolution,
      dec.uncertainty,
    );
    results.push({
      computed_at: computedAt,
      classifier_version,
      n: g.predictions.length,
      base_rate: dec.base_rate,
      brier,
      reliability: dec.reliability,
      resolution: dec.resolution,
      uncertainty: dec.uncertainty,
      bs_check: dec.bs_check,
      corp: {
        recalibrated_curve: corp.recalibrated_curve,
        bin_counts: corp.bin_counts,
      },
      status: ship_gate.met ? 'evaluated' : 'ship_gate_failed',
      ship_gate,
    });
  }

  // Write artifacts.
  const outDir = opts.outDir ?? path.resolve(process.cwd(), 'reports');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const dateStr = cutoff.toISOString().slice(0, 10);
  const jsonPath = path.join(outDir, `brier-${dateStr}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));

  let mdPath: string | null = null;
  const anyFailed = results.some((r) => r.status === 'ship_gate_failed');
  if (anyFailed) {
    mdPath = path.join(outDir, `brier-${dateStr}.md`);
    fs.writeFileSync(mdPath, renderShipGateMarkdown(results, dateStr));
  }

  return { results, jsonPath, mdPath };
}

function renderShipGateMarkdown(
  results: EvalBrierResult[],
  dateStr: string,
): string {
  const failed = results.filter((r) => r.status === 'ship_gate_failed');
  const lines: string[] = [];
  lines.push(`# Brier Ship-Gate Report — ${dateStr}`);
  lines.push('');
  lines.push(
    `Phase 20-C-02 weekly Brier evaluation. Ship gate: Brier ≤ ${SHIP_GATE_THRESHOLD} AND |base_rate − 0.5| < ${BASE_RATE_IMBALANCE_WINDOW}.`,
  );
  lines.push('');
  lines.push(
    `Classifier versions evaluated: ${results.map((r) => r.classifier_version).join(', ')}`,
  );
  lines.push('');
  lines.push(`## Failing classifiers (${failed.length})`);
  for (const r of failed) {
    lines.push('');
    lines.push(`### ${r.classifier_version}`);
    lines.push('');
    lines.push(`- n: ${r.n}`);
    lines.push(`- base_rate: ${r.base_rate.toFixed(4)}`);
    lines.push(`- brier: ${r.brier.toFixed(4)}`);
    lines.push(`- reliability: ${r.reliability.toFixed(4)}`);
    lines.push(`- resolution: ${r.resolution.toFixed(4)}`);
    lines.push(`- uncertainty: ${r.uncertainty.toFixed(4)}`);
    lines.push(
      `- DOMINANT_FAILURE_MODE: ${r.ship_gate.dominant_failure_mode ?? 'unknown'}`,
    );
    lines.push(
      `- REMEDIATION_RECOMMENDATION: ${r.ship_gate.remediation_recommendation ?? 'ACCEPT_AS_BASELINE'}`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

// ─── CLI entry ─────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): RunEvalBrierOpts {
  const opts: RunEvalBrierOpts = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cutoff') {
      opts.cutoff = new Date(argv[++i]);
    } else if (a === '--lookback-days') {
      opts.lookbackDays = Number(argv[++i]);
    } else if (a === '--out-dir') {
      opts.outDir = argv[++i];
    }
  }
  return opts;
}

if (require.main === module) {
  runEvalBrier(parseArgs(process.argv))
    .then(({ results, jsonPath, mdPath }) => {
      console.log(`[eval-brier] wrote ${jsonPath}`);
      if (mdPath) {
        console.log(
          `[eval-brier] SHIP_GATE_FAILED — narrative at ${mdPath}`,
        );
      }
      for (const r of results) {
        console.log(
          `[eval-brier] ${r.classifier_version}: n=${r.n} status=${r.status} brier=${r.brier.toFixed(4)} base_rate=${r.base_rate.toFixed(3)} ship_gate.met=${r.ship_gate.met}`,
        );
      }
      process.exit(0);
    })
    .catch((e) => {
      console.error('[eval-brier] error:', e);
      process.exit(1);
    });
}
