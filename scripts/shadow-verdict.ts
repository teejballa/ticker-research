#!/usr/bin/env tsx
// scripts/shadow-verdict.ts
//
// Phase 19 / Plan 19-Z-03 — operator-facing verdict gate.
//
// Usage:
//   npm run shadow-verdict <plan-id>
//   e.g. npm run shadow-verdict 19-B-06
//
// Reads ShadowComparison rows scoped to the plan's path_name, computes
// VerdictMetrics (latency percentiles, cost averages, output disagreement,
// quality delta), runs verdict() per D-11/12/13, writes a structured JSON
// verdict to shadow-reports/<plan-id>.json, and exits with:
//
//   0 → PASS  (cutover may proceed; old code path may be deleted)
//   1 → FAIL  (must rollback or fix; do NOT cutover)
//   2 → HOLD  (insufficient evidence; extend shadow window)
//   3 → operator/usage error (bad args, DB unreachable, etc.)
//
// Per-plan disagreement + quality_delta computation lives in STRATEGIES below.
// Default fallback = element-wise JSON deep-equal-rate. Plan 19-A-07 has a
// special audit-JSON strategy because convergence-speed is longitudinal, not
// per-request.

import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

import { verdict, type VerdictMetrics } from '../src/lib/shadow/verdict';

// ─── Plan ID → path_name registry ────────────────────────────────────────────
//
// One entry per `shadow_required: true` plan in Phase 19. Wave Z plans don't
// shadow themselves. Plans not in this map fall through to using the plan ID
// itself as the path_name (handy for ad-hoc smoke tests like `noop-plan`).

const PLAN_TO_PATH: Record<string, string> = {
  // Wave A
  '19-A-07': 'hierarchical-pooling',
  // Wave B
  '19-B-06': 'source-package-merge',
  '19-B-07': 'runtime-cache',
  '19-B-08': 'rollout-driver',
  // Wave C
  '19-C-02': 'finsentllm-ensemble',
  '19-C-03': 'stocktwits-reputation-weighted',
  '19-C-04': 'options-term-structure',
  '19-C-05': 'community-supplemental',
  '19-C-07': 'citations-v2',
  '19-C-08': 'cove-two-pass',
  '19-C-09': 'model-router',
  '19-C-10': 'contradiction-detector',
};

// ─── Strategy types ──────────────────────────────────────────────────────────

type ShadowRow = {
  id: string;
  path_name: string;
  ticker: string | null;
  old_output_json: unknown;
  new_output_json: unknown;
  old_latency_ms: number | null;
  new_latency_ms: number | null;
  old_cost_usd: number | null;
  new_cost_usd: number | null;
  created_at: Date;
};

type StrategyResult = {
  output_disagreement_rate: number;
  quality_delta: number | null;
  quality_measurable: boolean;
};

type Strategy = (rows: ShadowRow[], planId: string) => Promise<StrategyResult> | StrategyResult;

// ─── Per-plan strategies (RESEARCH §"Pitfall 5" output-comparison metrics) ──

/**
 * Field-fill-rate Jaccard for SourcePackage (19-B-06).
 *
 * For each row, compute the symmetric-difference rate between the set of
 * non-null top-level fields in old vs new. Average across rows.
 */
function computeJaccardDisagreement(rows: ShadowRow[]): number {
  if (rows.length === 0) return 0;
  let total = 0;
  for (const row of rows) {
    const oldFields = nonNullKeys(row.old_output_json);
    const newFields = nonNullKeys(row.new_output_json);
    const union = new Set([...oldFields, ...newFields]);
    if (union.size === 0) continue;
    const intersection = new Set([...oldFields].filter((k) => newFields.has(k)));
    // Jaccard distance = 1 - |A∩B| / |A∪B|
    const distance = 1 - intersection.size / union.size;
    total += distance;
  }
  return total / rows.length;
}

function nonNullKeys(obj: unknown): Set<string> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return new Set();
  const out = new Set<string>();
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (v !== null && v !== undefined) out.add(k);
  }
  return out;
}

/**
 * Pearson correlation between two arrays. Returns 0 when undefined (constant
 * series). Used by FinSentLLM ensemble (19-C-02) — disagreement = 1 - r.
 */
function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

/**
 * Decision agreement rate for ordinal/categorical outputs (19-C-09 router):
 * per-row equality on a top-level decision field, averaged.
 * Disagreement = 1 - agreement_rate.
 */
function computeDecisionDisagreement(rows: ShadowRow[], field = 'decision'): number {
  if (rows.length === 0) return 0;
  let agree = 0;
  for (const r of rows) {
    const o = (r.old_output_json as Record<string, unknown> | null)?.[field];
    const n = (r.new_output_json as Record<string, unknown> | null)?.[field];
    if (o === n) agree++;
  }
  return 1 - agree / rows.length;
}

/**
 * URL coverage delta for citations (19-C-07): old URLs ⊂ new URLs ?
 * Disagreement = fraction of old URLs missing from new.
 */
function computeUrlCoverageDisagreement(rows: ShadowRow[]): number {
  if (rows.length === 0) return 0;
  let total = 0;
  for (const r of rows) {
    const oldUrls = extractUrls(r.old_output_json);
    const newUrls = extractUrls(r.new_output_json);
    if (oldUrls.size === 0) continue;
    const missing = [...oldUrls].filter((u) => !newUrls.has(u)).length;
    total += missing / oldUrls.size;
  }
  return total / rows.length;
}

function extractUrls(obj: unknown, acc: Set<string> = new Set()): Set<string> {
  if (typeof obj === 'string' && /^https?:\/\//.test(obj)) acc.add(obj);
  else if (Array.isArray(obj)) obj.forEach((v) => extractUrls(v, acc));
  else if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj as Record<string, unknown>)) extractUrls(v, acc);
  }
  return acc;
}

/**
 * Default strategy: deep-equal-rate over JSON outputs.
 */
function defaultStrategy(rows: ShadowRow[]): StrategyResult {
  if (rows.length === 0) {
    return { output_disagreement_rate: 0, quality_delta: null, quality_measurable: false };
  }
  let disagreements = 0;
  for (const r of rows) {
    if (JSON.stringify(r.old_output_json) !== JSON.stringify(r.new_output_json)) {
      disagreements++;
    }
  }
  return {
    output_disagreement_rate: disagreements / rows.length,
    quality_delta: null,
    quality_measurable: false,
  };
}

const STRATEGIES: Record<string, Strategy> = {
  // 19-B-06: SourcePackage merge ladder reorder.
  // Field-fill-rate Jaccard (RESEARCH "Pitfall 5" row 1).
  'source-package-merge': (rows) => ({
    output_disagreement_rate: computeJaccardDisagreement(rows),
    quality_delta: null,
    quality_measurable: false,
  }),

  // 19-C-02: FinSentLLM ensemble vs single FinBERT.
  // Disagreement = 1 - Pearson on per-row score field.
  'finsentllm-ensemble': (rows) => {
    const oldScores: number[] = [];
    const newScores: number[] = [];
    for (const r of rows) {
      const o = (r.old_output_json as Record<string, unknown> | null)?.score;
      const n = (r.new_output_json as Record<string, unknown> | null)?.score;
      if (typeof o === 'number' && typeof n === 'number') {
        oldScores.push(o);
        newScores.push(n);
      }
    }
    const r = pearson(oldScores, newScores);
    return {
      output_disagreement_rate: Math.max(0, 1 - r),
      quality_delta: null,
      quality_measurable: false,
    };
  },

  // 19-C-03: reputation-weighted StockTwits.
  'stocktwits-reputation-weighted': defaultStrategy,

  // 19-C-04: options term-structure weighting.
  'options-term-structure': defaultStrategy,

  // 19-C-05: community supplemental aggregator.
  'community-supplemental': defaultStrategy,

  // 19-C-07: structured citations vs free-text source_citation.
  // URL coverage rate (RESEARCH "Pitfall 5" row 3).
  'citations-v2': (rows) => ({
    output_disagreement_rate: computeUrlCoverageDisagreement(rows),
    quality_delta: null,
    quality_measurable: false,
  }),

  // 19-C-08: Chain-of-Verification two-pass.
  // Field-by-field equality (default strategy is good enough for this round).
  'cove-two-pass': defaultStrategy,

  // 19-C-09: model cascade router.
  // Decision agreement rate.
  'model-router': (rows) => ({
    output_disagreement_rate: computeDecisionDisagreement(rows, 'decision'),
    quality_delta: null,
    quality_measurable: false,
  }),

  // 19-C-10: cross-class contradiction detector.
  'contradiction-detector': defaultStrategy,

  // 19-A-07: hierarchical pooling.
  // SPECIAL: convergence-speed is LONGITUDINAL, not per-request. The
  // ShadowComparison rows track per-cron-run latency_delta only. The actual
  // quality_delta (speedup) is computed by scripts/hierarchical-pooling-audit.ts
  // and persisted to shadow-reports/19-A-07-audit.json. Read its `speedup`
  // field as quality_delta. This bridges per-request shadow with longitudinal
  // audit metrics (RESEARCH "Pitfall 3" / "Pitfall 5" row 6).
  'hierarchical-pooling': async (_rows, planId) => {
    const auditPath = `shadow-reports/${planId}-audit.json`;
    if (!existsSync(auditPath)) {
      return {
        output_disagreement_rate: 0,
        quality_delta: null,
        quality_measurable: false,
      };
    }
    const audit = JSON.parse(readFileSync(auditPath, 'utf-8')) as { speedup?: number };
    return {
      // Pooling is additive — per-request output unchanged.
      output_disagreement_rate: 0,
      quality_delta: typeof audit.speedup === 'number' ? audit.speedup : null,
      quality_measurable: typeof audit.speedup === 'number',
    };
  },

  // 19-B-07: Vercel runtime cache for SourcePackage.
  'runtime-cache': defaultStrategy,

  // 19-B-08: rollout driver / dual-write verification.
  'rollout-driver': defaultStrategy,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL not set (load .env.local first)');
  }
  const adapter = new PrismaNeon({ connectionString });
  return new PrismaClient({ adapter });
}

async function main() {
  const planId = process.argv[2];
  if (!planId || planId === '--help' || planId === '-h') {
    console.error('Usage: npm run shadow-verdict <plan-id>');
    console.error('  e.g. npm run shadow-verdict 19-B-06');
    console.error('');
    console.error('Exits 0 (PASS) / 1 (FAIL) / 2 (HOLD) / 3 (operator error).');
    console.error('Writes shadow-reports/<plan-id>.json with full verdict + metrics.');
    // --help is operator-friendly; exit 0 on explicit help, 3 on missing arg.
    process.exit(planId === '--help' || planId === '-h' ? 0 : 3);
  }

  const pathName = PLAN_TO_PATH[planId] ?? planId;

  const prisma = createPrisma();

  let rows: ShadowRow[] = [];
  try {
    const queried = await prisma.shadowComparison.findMany({
      where: { path_name: pathName },
      orderBy: { created_at: 'desc' },
      take: 5000,
    });
    rows = queried as unknown as ShadowRow[];
  } catch (err) {
    console.error(`[shadow-verdict] DB query failed for path_name=${pathName}:`, err);
    await prisma.$disconnect();
    process.exit(3);
  }

  // Compute aggregates from rows.
  const oldLatencies = rows
    .map((r) => r.old_latency_ms)
    .filter((v): v is number => typeof v === 'number');
  const newLatencies = rows
    .map((r) => r.new_latency_ms)
    .filter((v): v is number => typeof v === 'number');

  const latencyOldP50 = percentile(oldLatencies, 0.5);
  const latencyOldP95 = percentile(oldLatencies, 0.95);
  const latencyNewP50 = percentile(newLatencies, 0.5);
  const latencyNewP95 = percentile(newLatencies, 0.95);

  const oldCosts = rows
    .map((r) => r.old_cost_usd)
    .filter((v): v is number => typeof v === 'number');
  const newCosts = rows
    .map((r) => r.new_cost_usd)
    .filter((v): v is number => typeof v === 'number');
  const costOldAvg = average(oldCosts);
  const costNewAvg = average(newCosts);

  const strategy = STRATEGIES[pathName] ?? defaultStrategy;
  const strategyResult = await strategy(rows, planId);

  const metrics: VerdictMetrics = {
    n_rows: rows.length,
    latency_p50_old_ms: latencyOldP50,
    latency_p95_old_ms: latencyOldP95,
    latency_p50_new_ms: latencyNewP50,
    latency_p95_new_ms: latencyNewP95,
    cost_old_baseline_usd_per_request: costOldAvg,
    cost_new_usd_per_request: costNewAvg,
    output_disagreement_rate: strategyResult.output_disagreement_rate,
    quality_delta: strategyResult.quality_delta,
    quality_measurable: strategyResult.quality_measurable,
  };

  const v = verdict(metrics);

  mkdirSync('shadow-reports', { recursive: true });
  const out = {
    plan_id: planId,
    path_name: pathName,
    verdict: v.result,
    reasons: v.reasons,
    metrics,
    timestamp: new Date().toISOString(),
  };
  const reportPath = `shadow-reports/${planId}.json`;
  writeFileSync(reportPath, JSON.stringify(out, null, 2));

  console.log(`Plan:     ${planId}`);
  console.log(`Path:     ${pathName}`);
  console.log(`N rows:   ${rows.length}`);
  console.log(`Verdict:  ${v.result}`);
  for (const r of v.reasons) console.log(`  - ${r}`);
  console.log(`Report:   ${reportPath}`);

  await prisma.$disconnect();

  // Exit code contract: 0=PASS, 1=FAIL, 2=HOLD, 3=operator error.
  process.exit(v.result === 'PASS' ? 0 : v.result === 'FAIL' ? 1 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});
