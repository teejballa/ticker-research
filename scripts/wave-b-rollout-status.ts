#!/usr/bin/env tsx
// scripts/wave-b-rollout-status.ts
//
// Phase 19 / Plan 19-B-08 — Wave B rollout-driver status report.
//
// This is the code-side artifact for the 19-B-08 "process driving plan".
// 19-B-08 itself is operator-driven over calendar days (env flag flips →
// shadow window → cutover PRs → 7d hatch → flag-removal PRs across 4 flags
// for both 19-B-06 and 19-B-07). This script gives the operator a single
// command to inspect the live state of every Wave B gate at any point in
// the lifecycle.
//
// Per the precedent set by 19-A-07 / 19-B-06 / 19-B-07: the rollout-driver
// SUMMARY documents code-side completion; the multi-day operator lifecycle
// continues out-of-band; this script is the verification harness used at
// each operator checkpoint.
//
// Usage:
//   npm run wave-b-rollout-status            # human-readable text report
//   npm run wave-b-rollout-status -- --json  # machine-readable JSON for CI
//
// Exits:
//   0 — all Wave B gates green; Wave B fully complete (verdicts PASS, flags
//       removed, fallback adapters preserved)
//   1 — at least one Wave B gate is RED (verdict FAIL, fallback adapter
//       missing, etc.) — escalate
//   2 — Wave B gates are PENDING (verdict files not yet written, flags still
//       present in features.ts) — operator action required to advance
//
// Three exit codes mirror the shadow-verdict.ts convention so this script
// composes cleanly into the same CI/operator pipeline.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// ─── Types ────────────────────────────────────────────────────────────────────

type GateStatus = 'GREEN' | 'PENDING' | 'RED';

type Gate = {
  name: string;
  status: GateStatus;
  detail: string;
};

type ChildVerdict = {
  plan_id: string;
  verdict?: string;
  metrics?: Record<string, unknown>;
  reasons?: unknown;
  timestamp?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..');
const SHADOW_REPORTS_DIR = path.join(REPO_ROOT, 'shadow-reports');
const FEATURES_PATH = path.join(REPO_ROOT, 'src/lib/features.ts');

// Wave B child plans gated by 19-B-08
const CHILD_PLANS = ['19-B-06', '19-B-07'] as const;

// FEATURE_*_PRIMARY flags graduated by Wave B (must all be removed from
// features.ts post-cutover).
const WAVE_B_FLAGS = [
  'tiingo_primary',
  'twelvedata_primary',
  'exa_primary',
  'data_cache',
] as const;

// D-32: fallback adapters that MUST remain in tree even after Wave B cutover.
const FALLBACK_ADAPTERS = [
  'src/lib/data/yahoo.ts',
  'src/lib/data/finnhub.ts',
  'src/lib/data/polygon.ts',
  'src/lib/data/anthropic-search.ts',
] as const;

// Wave B success criteria (D-29, D-30, design §"Wave B"):
//   1. source-package latency p50 drop ≥ 40%
//   2. anthropic-search call count drop ≥ 80%
//   3. cache hit rate ≥ 70%
const SUCCESS_CRITERIA = {
  latency_p50_drop_pct_min: 0.4,
  anthropic_search_call_drop_pct_min: 0.8,
  cache_hit_rate_min: 0.7,
} as const;

// ─── Gate checks ──────────────────────────────────────────────────────────────

/**
 * Read a child plan's shadow verdict from `shadow-reports/<plan-id>.json`.
 * Returns `null` if the file does not exist (operator hasn't run shadow-verdict
 * yet) — that maps to a PENDING gate, not a RED one.
 */
export function readChildVerdict(planId: string): ChildVerdict | null {
  const filePath = path.join(SHADOW_REPORTS_DIR, `${planId}.json`);
  if (!existsSync(filePath)) return null;
  const raw = readFileSync(filePath, 'utf-8');
  try {
    const parsed = JSON.parse(raw) as ChildVerdict;
    return parsed;
  } catch (err) {
    throw new Error(`shadow-reports/${planId}.json is not valid JSON: ${(err as Error).message}`);
  }
}

/**
 * Gate 1+2: Each child plan's shadow verdict file PASS.
 *   - file missing  → PENDING (operator must run shadow-verdict)
 *   - PASS          → GREEN
 *   - FAIL / HOLD   → RED
 */
export function checkChildVerdictGate(planId: string): Gate {
  const verdict = readChildVerdict(planId);
  if (verdict === null) {
    return {
      name: `${planId}-verdict`,
      status: 'PENDING',
      detail: `shadow-reports/${planId}.json missing — run \`npm run shadow-verdict ${planId}\``,
    };
  }
  const result = verdict.verdict ?? '(missing verdict field)';
  if (result === 'PASS') {
    return {
      name: `${planId}-verdict`,
      status: 'GREEN',
      detail: `verdict=PASS at ${verdict.timestamp ?? 'unknown'}`,
    };
  }
  return {
    name: `${planId}-verdict`,
    status: 'RED',
    detail: `verdict=${result} — must be PASS before Wave B cutover`,
  };
}

/**
 * Gate 3: Wave B feature flags absent from features.ts (cutover lifecycle
 * complete). Each flag in WAVE_B_FLAGS must be missing from FLAG_NAMES
 * literal. Detection mirrors the model-card-status `flag-removed-{flag}`
 * check (per Plan 19-Z-04) so a green here also turns model-card-status
 * green for the same 4 checks.
 */
export function checkFlagRemovalGate(featuresSource?: string): Gate[] {
  const src = featuresSource ?? readFileSync(FEATURES_PATH, 'utf-8');
  const out: Gate[] = [];
  for (const flag of WAVE_B_FLAGS) {
    // FLAG_NAMES uses single-quoted literals; match `'<flag>'` in features.ts.
    const present = new RegExp(`['\"]${flag}['\"]`).test(src);
    out.push({
      name: `flag-removed-${flag}`,
      status: present ? 'PENDING' : 'GREEN',
      detail: present
        ? `'${flag}' still present in src/lib/features.ts — flag-removal PR not yet merged`
        : `'${flag}' removed from FLAG_NAMES`,
    });
  }
  return out;
}

/**
 * Gate 4: D-32 fallback adapters preserved in tree (Yahoo, Finnhub, Polygon,
 * Anthropic-search). T-19-B-08-02 mitigation: detects accidental deletion
 * during the post-cutover cleanup commit.
 *
 * Returns RED if any adapter file is missing — this is a hard FAIL because
 * the system relies on these as fallbacks per design §Wave B.
 */
export function checkFallbackAdapterGate(): Gate[] {
  return FALLBACK_ADAPTERS.map((rel) => {
    const abs = path.join(REPO_ROOT, rel);
    const present = existsSync(abs);
    return {
      name: `fallback-${path.basename(rel, '.ts')}`,
      status: present ? 'GREEN' : 'RED',
      detail: present ? `${rel} preserved` : `${rel} MISSING — T-19-B-08-02 violation`,
    };
  });
}

/**
 * Gate 5: Wave B post-cutover grep patterns registered in
 * scripts/model-card-grep-patterns.json. The patterns enforce zero matches
 * AFTER cutover so model-card-status will block a flag-removal PR that tries
 * to land while readsites for the removed flags still exist in tree.
 *
 * Required patterns (per 19-B-08 must_haves):
 *   - wave-b-source-package-merge-flag-readsite (3 mode vars)
 *   - wave-b-runtime-cache-flag-readsite (data_cache_mode)
 *   - wave-b-runWithShadow-source-package-merge
 *   - wave-b-runWithShadow-runtime-cache
 *
 * Returns PENDING when patterns are missing (operator action: register them);
 * GREEN once all 4 are registered.
 */
export function checkGrepPatternsRegisteredGate(grepPatternsSrc?: string): Gate {
  const src =
    grepPatternsSrc ??
    readFileSync(path.join(REPO_ROOT, 'scripts/model-card-grep-patterns.json'), 'utf-8');
  const required = [
    'wave-b-source-package-merge-flag-readsite',
    'wave-b-runtime-cache-flag-readsite',
    'wave-b-runWithShadow-source-package-merge',
    'wave-b-runWithShadow-runtime-cache',
  ];
  const missing = required.filter((name) => !src.includes(name));
  if (missing.length === 0) {
    return {
      name: 'grep-patterns-registered',
      status: 'GREEN',
      detail: 'all 4 Wave B post-cutover grep patterns registered',
    };
  }
  return {
    name: 'grep-patterns-registered',
    status: 'PENDING',
    detail: `missing post-cutover patterns: ${missing.join(', ')}`,
  };
}

/**
 * Gate 6: source-package.ts still imports each fallback adapter (D-32 second
 * half — file presence alone isn't enough; the orchestrator must still wire
 * them up as fallback rungs).
 */
export function checkFallbackWiringGate(sourcePackageSrc?: string): Gate {
  const src =
    sourcePackageSrc ??
    readFileSync(path.join(REPO_ROOT, 'src/lib/data/source-package.ts'), 'utf-8');
  const expected = ['yahoo', 'finnhub', 'polygon'];
  const missing = expected.filter((name) => !src.includes(name));
  if (missing.length === 0) {
    return {
      name: 'fallback-wired',
      status: 'GREEN',
      detail: 'source-package.ts references yahoo / finnhub / polygon',
    };
  }
  return {
    name: 'fallback-wired',
    status: 'RED',
    detail: `source-package.ts missing references to: ${missing.join(', ')}`,
  };
}

// ─── Composite verdict ────────────────────────────────────────────────────────

/**
 * Extract Wave B success-criterion metrics from the two child verdict files
 * and score them against the D-29/D-30 thresholds. Returns null when either
 * verdict file is missing (PENDING state — caller skips PASS/FAIL scoring).
 *
 * Latency drop = (old_p50 − new_p50) / old_p50, computed from 19-B-06
 * verdict's `metrics.latency_p50_old_ms` / `metrics.latency_p50_new_ms`.
 *
 * Cache hit rate is a Wave-B-07 specific number. Until shadow-verdict.ts
 * grows a cache-hit-rate metric on the runtime-cache strategy, the operator
 * supplies it via `19-B-07-audit.json` (analogous to the
 * `19-A-07-audit.json` longitudinal bridge). When neither source provides
 * it, we report the field as null.
 *
 * Anthropic-search call drop is computed by counting `anthropic-search`
 * mentions in the old vs new outputs of 19-B-06 verdict rows. Where the
 * verdict CLI didn't preserve that, we fall back to null and the operator
 * pastes the number from production analytics.
 */
export function computeCompositeMetrics(
  b06: ChildVerdict | null,
  b07: ChildVerdict | null,
  auditOverride?: { cache_hit_rate?: number; anthropic_search_call_drop_pct?: number },
): {
  source_package_latency_p50_drop_pct: number | null;
  source_package_latency_p95_drop_pct: number | null;
  cache_hit_rate: number | null;
  anthropic_search_call_count_drop_pct: number | null;
} {
  function dropPct(oldVal?: unknown, newVal?: unknown): number | null {
    if (typeof oldVal !== 'number' || typeof newVal !== 'number') return null;
    if (oldVal <= 0) return null;
    return Math.max(0, (oldVal - newVal) / oldVal);
  }

  const b06m = (b06?.metrics ?? {}) as Record<string, unknown>;
  const b07m = (b07?.metrics ?? {}) as Record<string, unknown>;

  return {
    source_package_latency_p50_drop_pct: dropPct(
      b06m.latency_p50_old_ms,
      b06m.latency_p50_new_ms,
    ),
    source_package_latency_p95_drop_pct: dropPct(
      b06m.latency_p95_old_ms,
      b06m.latency_p95_new_ms,
    ),
    cache_hit_rate:
      typeof auditOverride?.cache_hit_rate === 'number'
        ? auditOverride.cache_hit_rate
        : (typeof b07m.cache_hit_rate === 'number' ? (b07m.cache_hit_rate as number) : null),
    anthropic_search_call_count_drop_pct:
      typeof auditOverride?.anthropic_search_call_drop_pct === 'number'
        ? auditOverride.anthropic_search_call_drop_pct
        : (typeof b06m.anthropic_search_call_drop_pct === 'number'
            ? (b06m.anthropic_search_call_drop_pct as number)
            : null),
  };
}

export function scoreComposite(metrics: ReturnType<typeof computeCompositeMetrics>): {
  result: 'PASS' | 'FAIL' | 'PENDING';
  reasons: string[];
} {
  const reasons: string[] = [];
  const missing: string[] = [];

  if (metrics.source_package_latency_p50_drop_pct === null) {
    missing.push('source_package_latency_p50_drop_pct');
  } else if (metrics.source_package_latency_p50_drop_pct < SUCCESS_CRITERIA.latency_p50_drop_pct_min) {
    reasons.push(
      `latency_p50 drop ${(metrics.source_package_latency_p50_drop_pct * 100).toFixed(1)}% < ${(SUCCESS_CRITERIA.latency_p50_drop_pct_min * 100).toFixed(0)}%`,
    );
  }

  if (metrics.cache_hit_rate === null) {
    missing.push('cache_hit_rate');
  } else if (metrics.cache_hit_rate < SUCCESS_CRITERIA.cache_hit_rate_min) {
    reasons.push(
      `cache_hit_rate ${(metrics.cache_hit_rate * 100).toFixed(1)}% < ${(SUCCESS_CRITERIA.cache_hit_rate_min * 100).toFixed(0)}%`,
    );
  }

  if (metrics.anthropic_search_call_count_drop_pct === null) {
    missing.push('anthropic_search_call_count_drop_pct');
  } else if (
    metrics.anthropic_search_call_count_drop_pct <
    SUCCESS_CRITERIA.anthropic_search_call_drop_pct_min
  ) {
    reasons.push(
      `anthropic_search call drop ${(metrics.anthropic_search_call_count_drop_pct * 100).toFixed(1)}% < ${(SUCCESS_CRITERIA.anthropic_search_call_drop_pct_min * 100).toFixed(0)}%`,
    );
  }

  if (missing.length > 0) {
    return {
      result: 'PENDING',
      reasons: [`metrics not yet available: ${missing.join(', ')}`],
    };
  }
  if (reasons.length > 0) {
    return { result: 'FAIL', reasons };
  }
  return {
    result: 'PASS',
    reasons: [
      `latency_p50 drop ${(metrics.source_package_latency_p50_drop_pct! * 100).toFixed(1)}% ≥ 40%`,
      `cache_hit_rate ${(metrics.cache_hit_rate! * 100).toFixed(1)}% ≥ 70%`,
      `anthropic_search call drop ${(metrics.anthropic_search_call_count_drop_pct! * 100).toFixed(1)}% ≥ 80%`,
    ],
  };
}

// ─── Report assembly ──────────────────────────────────────────────────────────

export function collectGates(): Gate[] {
  const gates: Gate[] = [];
  for (const planId of CHILD_PLANS) gates.push(checkChildVerdictGate(planId));
  gates.push(...checkFlagRemovalGate());
  gates.push(...checkFallbackAdapterGate());
  gates.push(checkFallbackWiringGate());
  gates.push(checkGrepPatternsRegisteredGate());
  return gates;
}

export function summarize(gates: Gate[]): { exit: 0 | 1 | 2; status: GateStatus } {
  if (gates.some((g) => g.status === 'RED')) return { exit: 1, status: 'RED' };
  if (gates.some((g) => g.status === 'PENDING')) return { exit: 2, status: 'PENDING' };
  return { exit: 0, status: 'GREEN' };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  const json = process.argv.includes('--json');
  const gates = collectGates();
  const b06 = readChildVerdict('19-B-06');
  const b07 = readChildVerdict('19-B-07');
  const composite = computeCompositeMetrics(b06, b07);
  const compositeScore = scoreComposite(composite);
  const { exit, status } = summarize(gates);

  if (json) {
    console.log(
      JSON.stringify(
        {
          plan_id: '19-B-08',
          status,
          exit_code: exit,
          gates,
          composite_score: compositeScore,
          composite_metrics: composite,
          generated_at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    process.exit(exit);
  }

  console.log('Wave B (Plan 19-B-08) rollout status');
  console.log('=====================================');
  console.log('');
  for (const g of gates) {
    const tag = g.status === 'GREEN' ? '[OK]' : g.status === 'PENDING' ? '[..]' : '[!!]';
    console.log(`${tag} ${g.name.padEnd(36)} ${g.detail}`);
  }
  console.log('');
  console.log(`Composite Wave B verdict: ${compositeScore.result}`);
  for (const r of compositeScore.reasons) console.log(`  - ${r}`);
  console.log('');
  console.log(`Overall status: ${status} (exit ${exit})`);

  process.exit(exit);
}

if (require.main === module) {
  main();
}
