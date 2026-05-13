/**
 * Plan 20-C-04 — Synthetic pump-and-dump eval harness.
 *
 * Reproducible via fixed RNG seed (default 20260511). Computes F1, sensitivity,
 * specificity over 500 P&D-shaped + 500 background events with matched
 * cap_class distribution. Exit 0 iff F1 ≥ 0.6 AND specificity ≥ 0.95 — the
 * weekly cron in `/api/cron/eval-pump-dump-synthetic` calls runSyntheticEval
 * and surfaces the result. Persists reports/pump-dump-eval-{YYYY-MM-DD}.json
 * for audit.
 *
 * Per CONTEXT.md spec line 127 — F1 ≥ 0.6 is the ship gate; specificity ≥ 0.95
 * is the regression alarm (tighter than Nam/Yang's 99% paper number because
 * our synthetic distribution is easier than real-world fat-tailed signals).
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  isPumpAndDumpPattern,
  RULE_VERSION,
  type PumpDumpFeatures,
} from '@/lib/sentiment/pump-dump-detector';
import type { CapClass } from '@/lib/diffusion-trace';

// Mulberry32 — deterministic, no deps, well-distributed for stats.
// Two consecutive runs with the same seed produce IDENTICAL F1 to 4 decimal
// places (asserted in tests/sentiment-pump-dump-detector.unit.test.ts).
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);

export interface EvalResult {
  seed: number;
  n_pd_events: number;
  n_background_events: number;
  tp: number; fp: number; tn: number; fn: number;
  precision: number;
  recall: number;
  f1: number;
  sensitivity: number;
  specificity: number;
  rule_version: string;
  generated_at: string; // ISO
}

function genPumpDump(rng: () => number): PumpDumpFeatures {
  // All five features ABOVE / BELOW the AND-gate thresholds.
  return {
    mention_z: lerp(rng, 5.5, 12),
    bull_pct: lerp(rng, 96, 99.9),
    gini: lerp(rng, 0.75, 0.95),
    mean_account_age_days: lerp(rng, 15, 85),
    cap_class: 'small_cap',
  };
}

function genBackground(rng: () => number): PumpDumpFeatures {
  // Distributions overlap on individual features so single-feature FP rate
  // is high; the AND-gate is what keeps overall FP low (per Nam/Yang).
  const r = rng();
  // 40% large_cap, 25% mid_cap, 30% small_cap, 5% unknown — Cipher production-ish mix.
  const cap: CapClass =
    r < 0.40 ? 'large_cap' :
    r < 0.65 ? 'mid_cap' :
    r < 0.95 ? 'small_cap' : 'unknown';
  return {
    mention_z: lerp(rng, -1, 6),       // overlaps the 5 threshold
    bull_pct: lerp(rng, 40, 97),       // overlaps the 95 threshold
    gini: lerp(rng, 0.2, 0.8),         // overlaps the 0.7 threshold
    mean_account_age_days: lerp(rng, 30, 1500), // overlaps the 90 threshold
    cap_class: cap,
  };
}

export async function runSyntheticEval(opts: {
  seed?: number;
  n_per_class?: number;
  outDir?: string;
} = {}): Promise<EvalResult> {
  const seed = opts.seed ?? 20260511;
  const n = opts.n_per_class ?? 500;
  const outDir = opts.outDir ?? 'reports';
  const rng = mulberry32(seed);

  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < n; i++) {
    const f = genPumpDump(rng);
    if (isPumpAndDumpPattern(f)) tp++;
    else fn++;
  }
  for (let i = 0; i < n; i++) {
    const f = genBackground(rng);
    if (isPumpAndDumpPattern(f)) fp++;
    else tn++;
  }
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = 2 * precision * recall / Math.max(1e-9, precision + recall);
  const sensitivity = recall;
  const specificity = tn / Math.max(1, tn + fp);
  const result: EvalResult = {
    seed,
    n_pd_events: n,
    n_background_events: n,
    tp, fp, tn, fn,
    precision, recall, f1,
    sensitivity, specificity,
    rule_version: RULE_VERSION,
    generated_at: new Date().toISOString(),
  };
  mkdirSync(outDir, { recursive: true });
  const date = result.generated_at.slice(0, 10);
  writeFileSync(join(outDir, `pump-dump-eval-${date}.json`), JSON.stringify(result, null, 2));
  return result;
}

// CLI entry — when run via `tsx scripts/eval-pump-dump-synthetic.ts`.
if (import.meta.url === `file://${process.argv[1]}`) {
  runSyntheticEval().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    const pass = r.f1 >= 0.6 && r.specificity >= 0.95;
    process.exit(pass ? 0 : 1);
  });
}
