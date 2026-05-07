# Cipher v2.0 Excellence Implementation Plan — Phase 19

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Inside each plan, use superpowers:test-driven-development and superpowers:verification-before-completion. Phase-level orchestration runs through `/gsd-plan-phase 19` and `/gsd-execute-phase 19`.

**Phase:** 19 (Cipher v2.0 Excellence)

**Goal:** Aggressively improve Cipher's data, sentiment, and ML pipelines to industry-standard quant-grade quality — additive only, autonomous from build through old-code deletion.

**Architecture:** Single phase (Phase 19) split into four parallel waves: Wave Z (shadow + cutover infra), Wave A (ML hygiene + quant-grade validation, including hierarchical pooling absorbed from original v2.0 P19), Wave B (data layer modernization), Wave C (sentiment + reasoning excellence). Every new path lands behind a feature flag, runs in shadow A/B vs the existing path, auto-cuts over on PASS verdict, and deletes old code in the same commit.

**Tech Stack:** TypeScript / Next.js 16 / Prisma + Neon Postgres / Vercel Functions + Crons / Vercel AI Gateway (Gemini, Anthropic) / Upstash Redis / HuggingFace Inference Endpoints / Vitest / Playwright.

**Reference design doc:** `docs/plans/2026-05-07-cipher-v2-excellence-design.md`.

---

## Universal Preamble — applies to every plan in Phase 19

### Autonomous Execution Clause

> The agent (Claude) executes every plan end-to-end:
> 1. Land new code behind feature flag (default false)
> 2. Flip flag to `shadow` via Vercel CLI/API
> 3. Drive shadow workload (≥200 requests OR 3-7 days)
> 4. Run `npm run shadow-verdict <plan-id>` — verdict file written to `shadow-reports/<plan-id>.json`
> 5. PASS → cutover PR (flag ON, old code DELETED in same commit) → 7-day rollback hatch → final flag-removal PR
> 6. FAIL → file failure report, redesign, re-shadow
>
> User receives status reports at each gate but is NOT in the verdict loop.

### Hard Cleanup Gate (Definition of Done for EVERY plan)

A plan is **NOT complete** until ALL of the following are true:
1. `shadow-reports/<plan-id>.json` exists with `verdict: "PASS"`
2. Cutover PR merged with old code deleted in same commit
3. 7 days elapsed post-cutover with zero entries in `RollbackLog` table
4. Flag-removal PR merged (the feature flag check itself is gone)
5. `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-cleanup

`/gsd-execute-phase` MUST refuse to mark a plan complete until all five conditions hold.

### Composite Phase 19 Done Gate

Phase 19 is not done until `npm run model-card-status` exits zero — asserting:
- Conformal coverage validated
- DSR > threshold, PBO < threshold
- IC monitor live for all 4 signal classes
- Hierarchical pooling live (parent_alpha/parent_beta populated for ≥80% of cells)
- FinSentLLM ensemble live
- Structured citations live (≥90% URL coverage on analyst/news claims)
- Zero references to old code paths in tree (post-cleanup grep)
- Zero feature-flag toggles remaining in `features.ts` from this effort

---

## Plan Inventory

### Wave Z — Shadow + Cutover Infrastructure (prerequisite for all) — 3 days

| ID | Title | Complexity | Detail level in this doc |
|---|---|---|---|
| 19-Z-01 | features.ts flag matrix + env wiring | Small | **Full TDD** |
| 19-Z-02 | ShadowComparison + RollbackLog Prisma schema | Small | Stub |
| 19-Z-03 | shadow-runner + shadow-verdict CLI | Medium | Stub |
| 19-Z-04 | model-card-status script (composite gate) | Medium | Stub |

### Wave A — ML Hygiene + Quant-Grade Validation — 2-3 weeks

| ID | Title | Complexity | Detail level in this doc |
|---|---|---|---|
| 19-A-01 | decayWeights lambda guard + HYPERPARAMETERS Zod schema | Small | **Full TDD** |
| 19-A-02 | Brier OOS split bug fix + look-ahead audit | Small | Stub |
| 19-A-03 | Conformal prediction primitive | Medium | Stub |
| 19-A-04 | DSR + PBO + CPCV primitives | Large | Stub |
| 19-A-05 | Rolling 20d rank-IC monitor + alpha-decay cron | Medium | Stub |
| 19-A-06 | Calibration validation harness + reliability diagram | Medium | Stub |
| 19-A-07 | Hierarchical Bayesian pooling (absorbed from original v2.0 P19) | Large | Stub |

### Wave B — Data Layer Modernization — 2-3 weeks

| ID | Title | Complexity | Detail level in this doc |
|---|---|---|---|
| 19-B-01 | Upstash Redis client + cache-keys + TTL config | Small | **Full TDD** |
| 19-B-02 | Retry + exponential backoff wrapper | Small | Stub |
| 19-B-03 | Tiingo adapter + tests | Medium | Stub |
| 19-B-04 | Twelve Data adapter + tests | Medium | Stub |
| 19-B-05 | Exa 2.0 adapter + Anthropic-search fallback wiring | Medium | Stub |
| 19-B-06 | source-package.ts merge precedence reorder | Medium | Stub |
| 19-B-07 | Vercel Runtime Cache integration | Small | Stub |
| 19-B-08 | Feature flag rollout + dual-write verification | Small | Stub |

### Wave C — Sentiment + Reasoning Excellence — 4-5 weeks

| ID | Title | Complexity | Detail level in this doc |
|---|---|---|---|
| 19-C-01 | HF Inference Endpoint + FinSentLLM client | Medium | **Full TDD** |
| 19-C-02 | Ensemble meta-classifier (FinGPT + Mistral + FinBERT) | Large | Stub |
| 19-C-03 | Reputation-weighted StockTwits aggregation | Small | Stub |
| 19-C-04 | Options term-structure 30/60/90d + IV regime gate | Medium | Stub |
| 19-C-05 | Swaggystocks + ApeWisdom adapters (supplemental) | Medium | Stub |
| 19-C-06 | Quiver adapter (optional flag) | Small | Stub |
| 19-C-07 | Structured citation schema + research-brief edits | Medium | Stub |
| 19-C-08 | CoVe two-pass wrapper + tests | Large | Stub |
| 19-C-09 | Model cascade router + cost telemetry | Medium | Stub |
| 19-C-10 | Cross-class contradiction detector | Medium | Stub |
| 19-C-11 | Arctic Shift one-time historical backfill | Medium | Stub |

**Total: 4 + 7 + 8 + 11 = 30 plans across 4 waves. Wave Z ships first (3 days). Waves A/B/C run in parallel after Z.**

---

# Wave Z — Shadow + Cutover Infrastructure

## Plan 19-Z-01: features.ts flag matrix + env wiring

**Files:**
- Create: `src/lib/features.ts`
- Create: `tests/lib/features.test.ts`
- Create: `.env.example` (modify if exists)

**Step 1: Write the failing test**

```ts
// tests/lib/features.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveFeatures, type FeatureMode } from '../../src/lib/features';

describe('features', () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it('defaults all flags to false when env unset', () => {
    delete process.env.FEATURE_CONFORMAL;
    expect(resolveFeatures().conformal_intervals_enabled).toBe(false);
  });

  it('parses "true" as enabled', () => {
    process.env.FEATURE_CONFORMAL = 'true';
    expect(resolveFeatures().conformal_intervals_enabled).toBe(true);
  });

  it('parses "shadow" as shadow mode', () => {
    process.env.FEATURE_CONFORMAL = 'shadow';
    expect(resolveFeatures().conformal_intervals_mode).toBe('shadow');
  });

  it('rejects unknown values with descriptive error', () => {
    process.env.FEATURE_CONFORMAL = 'invalid';
    expect(() => resolveFeatures()).toThrow(/FEATURE_CONFORMAL/);
  });

  it('exposes all 15 Phase 19 flags', () => {
    const f = resolveFeatures();
    const expected = [
      'conformal_intervals', 'cpcv', 'ic_decay_monitor', 'hierarchical_pooling',
      'data_cache', 'tiingo_primary', 'twelvedata_primary', 'exa_primary',
      'finsentllm_ensemble', 'community_supplemental', 'cove_two_pass',
      'model_router', 'contradiction_detector', 'options_term_structure',
      'reputation_weighted_stocktwits',
    ];
    for (const flag of expected) {
      expect(f).toHaveProperty(`${flag}_enabled`);
      expect(f).toHaveProperty(`${flag}_mode`);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/features.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/features'"

**Step 3: Write minimal implementation**

```ts
// src/lib/features.ts
export type FeatureMode = 'off' | 'shadow' | 'on';

const FLAG_NAMES = [
  'conformal_intervals',
  'cpcv',
  'ic_decay_monitor',
  'hierarchical_pooling',
  'data_cache',
  'tiingo_primary',
  'twelvedata_primary',
  'exa_primary',
  'finsentllm_ensemble',
  'community_supplemental',
  'cove_two_pass',
  'model_router',
  'contradiction_detector',
  'options_term_structure',
  'reputation_weighted_stocktwits',
] as const;

type FlagName = typeof FLAG_NAMES[number];

type Features = {
  [K in FlagName as `${K}_enabled`]: boolean;
} & {
  [K in FlagName as `${K}_mode`]: FeatureMode;
};

function parseMode(envValue: string | undefined, varName: string): FeatureMode {
  if (envValue == null || envValue === '' || envValue === 'false') return 'off';
  if (envValue === 'true') return 'on';
  if (envValue === 'shadow') return 'shadow';
  throw new Error(`${varName} must be one of: false, shadow, true (got: ${envValue})`);
}

export function resolveFeatures(): Features {
  const out = {} as Features;
  for (const name of FLAG_NAMES) {
    const envVar = `FEATURE_${name.toUpperCase()}`;
    const mode = parseMode(process.env[envVar], envVar);
    (out as Record<string, unknown>)[`${name}_mode`] = mode;
    (out as Record<string, unknown>)[`${name}_enabled`] = mode === 'on';
  }
  return out;
}

export const FEATURES = resolveFeatures();
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/features.test.ts`
Expected: PASS — 5 tests

**Step 5: Add env vars to .env.example**

Append to `.env.example`:

```
# Phase 19 — feature flags (off | shadow | true)
FEATURE_CONFORMAL=off
FEATURE_CPCV=off
FEATURE_IC_DECAY_MONITOR=off
FEATURE_HIERARCHICAL_POOLING=off
FEATURE_DATA_CACHE=off
FEATURE_TIINGO_PRIMARY=off
FEATURE_TWELVEDATA_PRIMARY=off
FEATURE_EXA_PRIMARY=off
FEATURE_FINSENTLLM_ENSEMBLE=off
FEATURE_COMMUNITY_SUPPLEMENTAL=off
FEATURE_COVE_TWO_PASS=off
FEATURE_MODEL_ROUTER=off
FEATURE_CONTRADICTION_DETECTOR=off
FEATURE_OPTIONS_TERM_STRUCTURE=off
FEATURE_REPUTATION_WEIGHTED_STOCKTWITS=off
```

**Step 6: Commit**

```bash
git add src/lib/features.ts tests/lib/features.test.ts .env.example
git commit -m "feat(19-z-01): feature flag matrix for Phase 19

Three-mode flag (off | shadow | on) with descriptive parse errors.
Defaults all 15 flags to off — every new path opt-in until verified.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Done gate (19-Z-01 has no shadow phase — it IS the infra):** plan complete when tests green and committed.

---

## Plan 19-Z-02: ShadowComparison + RollbackLog Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `tests/integration/shadow-comparison.live.test.ts`

**Tasks:**
1. Add `ShadowComparison` and `RollbackLog` models to `schema.prisma` per design §6
2. `npx prisma generate && npx prisma db push` against local Neon
3. Write integration test asserting both tables accept inserts + indexes used in expected query plans
4. Commit

**Done gate:** tests pass; Prisma client regenerated; migration sql captured in `prisma/migrations/`.

---

## Plan 19-Z-03: shadow-runner + shadow-verdict CLI

**Files:**
- Create: `src/lib/shadow/shadow-runner.ts` — `runWithShadow<T>(name, oldFn, newFn, mode)`
- Create: `src/lib/shadow/verdict.ts` — pure functions computing PASS/FAIL/HOLD
- Create: `scripts/shadow-verdict.ts` — CLI reading ShadowComparison rows, writing `shadow-reports/<plan-id>.json`
- Create: `tests/lib/shadow/shadow-runner.test.ts`
- Create: `tests/lib/shadow/verdict.test.ts`

**Acceptance:**
- `runWithShadow` returns old result, runs new in setImmediate background, never throws on new-path errors
- `verdict()` handles latency_p50, latency_p95, cost_delta, output_disagreement_rate, quality_delta
- PASS rule: new ≥ old on quality AND (latency OR cost) AND disagreement < 5%
- FAIL rule: new < old on quality OR p95 ≥ 2× old OR cost > 1.5× old
- HOLD rule: quality unmeasurable (e.g., outcomes not yet resolved) AND row count < 200
- CLI exits 0/1/2 for PASS/FAIL/HOLD respectively

**Done gate:** all unit tests green; one E2E shadow rehearsal against a no-op path produces a valid PASS verdict file.

---

## Plan 19-Z-04: model-card-status script (composite gate)

**Files:**
- Create: `scripts/model-card-status.ts`
- Create: `tests/scripts/model-card-status.test.ts`
- Modify: `package.json` (add `"model-card-status": "tsx scripts/model-card-status.ts"`)
- Modify: `.github/workflows/<existing>.yml` (add as required check) — IF CI exists

**Acceptance:**
- Script asserts each composite-DoD condition (§11 of design)
- Exits 0 only when ALL conditions met
- Exits non-zero with a punch list of unmet conditions
- Conditions check live DB (LearnedPattern.rolling_ic_20d populated, DSR/PBO not null, parent_alpha/beta populated, etc.) + grep tree (no old-path references) + git log (flag-removal PRs merged)

**Done gate:** mocked-DB unit tests pass; manual run against current state shows clear unmet-conditions list (expected — nothing built yet).

---

# Wave A — ML Hygiene + Quant-Grade Validation

## Plan 19-A-01: decayWeights lambda guard + HYPERPARAMETERS Zod schema

**Files:**
- Modify: `src/lib/learning.ts:360-371` (decayWeights) and `:519-548` (HYPERPARAMETERS)
- Create: `tests/learning.unit.bugs.test.ts`

**Why first:** smallest contained fix in Phase 18 hot-path. Adding it first hardens the guard before any new code depends on the primitive.

**Step 1: Write the failing test**

```ts
// tests/learning.unit.bugs.test.ts
import { describe, it, expect } from 'vitest';
import { decayWeights, HYPERPARAMETERS, validateHyperparameters } from '../src/lib/learning';

describe('decayWeights — Phase 19 guard (Plan 19-A-01)', () => {
  const obs = [{ hit: true, recorded_at: new Date('2026-04-01') }];

  it('rejects lambdaDays = 0 with descriptive error', () => {
    expect(() => decayWeights(obs, 0)).toThrow(/lambdaDays must be > 0/);
  });

  it('rejects negative lambdaDays', () => {
    expect(() => decayWeights(obs, -10)).toThrow(/lambdaDays must be > 0/);
  });

  it('rejects NaN lambdaDays', () => {
    expect(() => decayWeights(obs, Number.NaN)).toThrow(/lambdaDays must be > 0/);
  });

  it('accepts lambdaDays = 0.001 (smallest positive)', () => {
    const w = decayWeights(obs, 0.001);
    expect(w[0]).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(w[0])).toBe(true);
  });
});

describe('HYPERPARAMETERS — Zod schema (Plan 19-A-01)', () => {
  it('validates current bootstrap config', () => {
    expect(() => validateHyperparameters(HYPERPARAMETERS)).not.toThrow();
  });

  it('rejects lambda_days = 0', () => {
    const bad = { ...HYPERPARAMETERS, diffusion: { ...HYPERPARAMETERS.diffusion, lambda_days: 0 } };
    expect(() => validateHyperparameters(bad)).toThrow(/lambda_days/);
  });

  it('rejects negative ph_lambda', () => {
    const bad = { ...HYPERPARAMETERS, diffusion: { ...HYPERPARAMETERS.diffusion, ph_lambda: -1 } };
    expect(() => validateHyperparameters(bad)).toThrow(/ph_lambda/);
  });

  it('rejects unknown signal class', () => {
    const bad = { ...HYPERPARAMETERS, bogus: { ...HYPERPARAMETERS.diffusion } };
    expect(() => validateHyperparameters(bad as never)).toThrow(/signal class/);
  });
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run tests/learning.unit.bugs.test.ts`
Expected: FAIL — `validateHyperparameters` not exported, `decayWeights` accepts 0 silently.

**Step 3: Implement guard + Zod schema**

Modify `src/lib/learning.ts`:

```ts
// At top of file, add:
import { z } from 'zod';

// Replace decayWeights at line 360 with:
export function decayWeights(
  obs: WeightedObservation[],
  lambdaDays: number,
  now: Date = new Date(),
): number[] {
  if (!Number.isFinite(lambdaDays) || lambdaDays <= 0) {
    throw new Error(
      `decayWeights: lambdaDays must be > 0 and finite (got: ${lambdaDays}). ` +
      `If you need decay disabled, omit the call rather than passing 0.`
    );
  }
  const t0 = now.getTime();
  const dayMs = 86_400_000;
  return obs.map(o => {
    const dtDays = Math.max(0, (t0 - o.recorded_at.getTime()) / dayMs);
    return Math.exp(-dtDays / lambdaDays);
  });
}

// After HYPERPARAMETERS const, add:
const ClassHyperparametersSchema = z.object({
  lambda_days: z.number().positive().finite(),
  ph_delta: z.number().positive().finite(),
  ph_lambda: z.number().positive().finite(),
  tuned_at: z.string().min(1),
  cv_brier_oos: z.number().nullable(),
});

const HyperparametersSchema = z.object({
  diffusion: ClassHyperparametersSchema,
  technical: ClassHyperparametersSchema,
  insider: ClassHyperparametersSchema,
  institutional: ClassHyperparametersSchema,
}).strict();

export function validateHyperparameters(input: unknown): asserts input is typeof HYPERPARAMETERS {
  const result = HyperparametersSchema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    if (first && first.code === 'unrecognized_keys') {
      throw new Error(`HYPERPARAMETERS: unknown signal class — ${first.keys?.join(', ')}`);
    }
    throw new Error(`HYPERPARAMETERS validation failed: ${result.error.issues.map(i => i.path.join('.') + ': ' + i.message).join('; ')}`);
  }
}

// At very bottom of file:
validateHyperparameters(HYPERPARAMETERS);
```

**Step 4: Run tests to verify pass**

Run: `npx vitest run tests/learning.unit.bugs.test.ts`
Expected: PASS — 8 tests

Run: `npx vitest run` (full suite)
Expected: all green; specifically `tests/learning.hyperparameters.test.ts` (Plan 18-10 sanity test) still green.

**Step 5: Commit**

```bash
git add src/lib/learning.ts tests/learning.unit.bugs.test.ts
git commit -m "fix(19-a-01): guard decayWeights against lambda<=0 + Zod-validate HYPERPARAMETERS

decayWeights threw exp(-Δt/0) = Infinity on misconfig (silent ESS corruption).
Now throws descriptive error. HYPERPARAMETERS validated at module load via Zod —
typos in signal class name or out-of-range params caught at startup, not at use.

Plan 18-10 hyperparameter sanity test still green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Done gate (Plan 19-A-01 — pure-function fix, no shadow needed):** tests green + committed. No flag, no cutover, no rollback hatch — additive guard on existing pure function, defensible by failing-fast contract.

---

## Plan 19-A-02: Brier OOS split bug fix + look-ahead audit (stub)

**Files:**
- Modify: `src/app/api/cron/learn/route.ts:519-522` (Brier split logic)
- Modify: `src/app/api/cron/learn/route.ts:227-232` (buildTraceForOutcome embargo)
- Create: `tests/cron-learn.unit.bugs.test.ts`

**Tasks:**
1. Write failing test for `n=14` case (current `max(1, n-14)` gives 0-row OOS)
2. Replace with time-based 80/20 split honoring chronological order
3. Write failing test asserting `buildTraceForOutcome` rejects snapshots within `prediction_horizon` of outcome
4. Implement embargo enforcement
5. Run full integration suite — must stay green
6. Commit

**Done gate:** tests pass; no shadow needed (pure-function fix).

---

## Plan 19-A-03: Conformal prediction primitive (stub)

**Files:**
- Modify: `src/lib/learning.ts` — add `conformalInterval(predictions, outcomes, alpha)` export
- Create: `tests/learning.conformal.test.ts`

**Tasks:**
1. Implement Vovk-Romano split-conformal: nonconformity scores from calibration set, quantile lookup
2. Coverage validation test on synthetic data — empirical coverage within ±2% of nominal 1-α
3. Edge cases: n<10 calibration → return widest possible interval with warning
4. Wire into `engine-context.ts` to surface `conformal_low/high` (additive — Bayesian CI stays alongside)
5. Commit

**Done gate:** coverage validated at α=0.05 over 10k synthetic trials; integration test confirms surfacing in EngineCalibrationPanel without UI regression.

---

## Plan 19-A-04: DSR + PBO + CPCV primitives (stub)

**Files:**
- Modify: `src/lib/learning.ts` — add `deflatedSharpeRatio(returns, trials, skew, kurt)`, `probBacktestOverfitting(in_sample, oos_sample)`, `combinatorialPurgedKFold({ n, k, embargo })`
- Create: `tests/learning.dsr-pbo.test.ts`
- Create: `tests/learning.cpcv.test.ts`

**Tasks:**
1. Implement DSR per Bailey-Lopez de Prado (2014) — golden-master test against published example
2. Implement PBO per Bailey-Borwein-Lopez de Prado-Zhu (2014) — golden-master test
3. Implement CPCV per Lopez de Prado (2018, ch. 7) — fold count + embargo math validated against published table
4. **Critical:** v2.0 P21 (Lift-Gated Cell Promotion) imports these — coordinate with P21 plan
5. Commit

**Done gate:** golden-master numerical match to published examples (≤1e-6 absolute tolerance).

---

## Plan 19-A-05: Rolling 20d rank-IC monitor + alpha-decay cron (stub)

**Files:**
- Create: `src/lib/reasoning/alpha-decay-monitor.ts`
- Create: `src/app/api/cron/alpha-decay-watch/route.ts`
- Modify: `vercel.json` (new cron entry — daily)
- Create: `tests/lib/reasoning/alpha-decay-monitor.test.ts`
- Create: `tests/integration/alpha-decay-watch.live.test.ts`

**Tasks:**
1. Compute Spearman rank correlation between predicted probability and forward return rank
2. Window: last 20 trading days (use `PriceOutcome.outcome_at` timestamps)
3. Per-class IC: diffusion / technical / insider / institutional
4. Cron route persists `LearnedPattern.rolling_ic_20d`
5. Set `ic_decay_flag = true` when `rolling_ic_20d < 0.02` for 5 consecutive days
6. No shadow — additive metric column, no replacement
7. Commit

**Done gate:** integration test shows IC computed correctly on seeded outcomes; flag fires on synthetic decay scenario.

---

## Plan 19-A-06: Calibration validation harness + reliability diagram (stub)

**Files:**
- Create: `scripts/calibration-report.ts`
- Modify: `package.json` (add `"calibration-report": "tsx scripts/calibration-report.ts"`)
- Create: `tests/scripts/calibration-report.test.ts`

**Tasks:**
1. Read `LearnedPattern.last_brier_in/out` + raw outcomes, compute reliability diagram (10 quantile bins)
2. Hosmer-Lemeshow chi-square test for calibration goodness-of-fit
3. Output JSON + markdown report → `calibration-reports/<date>.md`
4. Run quarterly via cron OR manual — first run is manual to establish baseline
5. Commit

**Done gate:** synthetic test cases produce expected reliability curves; baseline report committed to `calibration-reports/`.

---

## Plan 19-A-07: Hierarchical Bayesian pooling — empirical Bayes priors (stub)

**Files:**
- Modify: `src/lib/learning.ts` — add `hierarchicalPooledPosterior({ cell_obs, group_alpha, group_beta, shrinkage })` export
- Modify: `src/app/api/cron/learn/route.ts` — wire pooled posterior into `recomputeOneCell`
- Modify: `prisma/schema.prisma` — add `parent_alpha`, `parent_beta`, `shrinkage_strength` columns to LearnedPattern (already in design §6 schema block)
- Create: `tests/learning.hierarchical.test.ts`
- Create: `tests/integration/hierarchical-pooling.live.test.ts`

**Source:** Absorbed from original v2.0 Phase 19 (Hierarchical Priors / Partial Pooling). Acceptance criterion preserved: hierarchical pooling demonstrably accelerates sparse-cell learning vs no-pool control.

**Tasks:**
1. Implement empirical Bayes parent estimation: pool α/β across cells in same `(signal_class, cap_class)` group; estimate group hyperprior via marginal likelihood maximization (EM or Newton step)
2. Per-cell shrinkage: `α_pooled = (n_local × α_local + λ × α_group) / (n_local + λ)`; same for β
3. λ (shrinkage_strength) is itself learned per group via EB; bounded [0.5, 50]
4. Falls back to flat prior when group n<5 (cold-start safety)
5. **Shadow A/B:** with-pooling vs flat-prior — verdict on **convergence speed** (number of outcomes for cell to leave EXPLORATORY) AND **OOS Brier** AND **calibration**
6. Wire into `engine-context.ts` so pooled posterior is what Gemini sees (existing flat-prior surface kept as fallback for `FEATURE_HIERARCHICAL_POOLING=off`)
7. Cutover + cleanup per universal preamble
8. Commit

**Done gate:** Wave A standard + the original v2.0 P19 acceptance: ≥30% faster convergence on cells with n<10 vs no-pool control, demonstrated via Plan 19-A-04 CPCV + Plan 19-A-06 calibration harness.

---

# Wave B — Data Layer Modernization

## Plan 19-B-01: Upstash Redis client + cache-keys + TTL config

**Files:**
- Create: `src/lib/data/cache/upstash.ts`
- Create: `src/lib/data/cache/cache-keys.ts`
- Create: `tests/lib/data/cache/upstash.test.ts`
- Modify: `package.json` (add `@upstash/redis`)
- Modify: `.env.example` — add `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

**Why first in Wave B:** every adapter (Tiingo, Twelve Data, Exa) depends on this cache layer.

**Step 1: Write the failing test**

```ts
// tests/lib/data/cache/upstash.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cached, invalidate, type CacheKey } from '../../../../src/lib/data/cache/upstash';
import { CACHE_KEYS } from '../../../../src/lib/data/cache/cache-keys';

describe('upstash cache wrapper', () => {
  beforeEach(() => vi.useFakeTimers());

  it('returns fetched value on miss + populates cache', async () => {
    const fetcher = vi.fn().mockResolvedValue({ price: 150 });
    const result = await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 300 });
    expect(result).toEqual({ price: 150 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns cached value on hit + skips fetcher', async () => {
    const fetcher = vi.fn().mockResolvedValue({ price: 150 });
    await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 300 });
    const second = await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 300 });
    expect(second).toEqual({ price: 150 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('refetches after TTL', async () => {
    const fetcher = vi.fn().mockResolvedValue({ price: 150 });
    await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 1 });
    vi.advanceTimersByTime(2000);
    await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 1 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('falls through to fetcher on Redis outage (graceful degrade)', async () => {
    process.env.UPSTASH_REDIS_REST_URL = 'http://127.0.0.1:1';
    const fetcher = vi.fn().mockResolvedValue({ price: 150 });
    const result = await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 300 });
    expect(result).toEqual({ price: 150 });
    expect(fetcher).toHaveBeenCalled();
  });

  it('invalidate evicts key', async () => {
    const fetcher = vi.fn().mockResolvedValue({ price: 150 });
    await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 300 });
    await invalidate(CACHE_KEYS.quote('AAPL'));
    await cached(CACHE_KEYS.quote('AAPL'), fetcher, { ttlSeconds: 300 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run tests/lib/data/cache/upstash.test.ts`
Expected: FAIL — modules don't exist.

**Step 3: Implement cache layer**

```ts
// src/lib/data/cache/cache-keys.ts
export type CacheKey = string;

export const CACHE_KEYS = {
  quote:        (ticker: string) => `quote:${ticker.toUpperCase()}`,
  fundamentals: (ticker: string) => `fund:${ticker.toUpperCase()}`,
  options:      (ticker: string) => `opts:${ticker.toUpperCase()}`,
  community:    (ticker: string) => `comm:${ticker.toUpperCase()}`,
  news:         (ticker: string) => `news:${ticker.toUpperCase()}`,
  source_pkg:   (ticker: string) => `pkg:${ticker.toUpperCase()}`,
} as const;

export const TTL_SECONDS = {
  quote: 300,
  fundamentals: 86_400,
  options: 900,
  community: 600,
  news: 1_800,
  source_pkg: 600,
} as const;
```

```ts
// src/lib/data/cache/upstash.ts
import { Redis } from '@upstash/redis';

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redisClient = new Redis({ url, token });
  return redisClient;
}

export interface CacheOptions {
  ttlSeconds: number;
  bypass?: boolean;
}

export async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: CacheOptions,
): Promise<T> {
  if (opts.bypass) return fetcher();
  const r = getRedis();
  if (!r) return fetcher();
  try {
    const hit = await r.get<T>(key);
    if (hit !== null && hit !== undefined) return hit;
  } catch {
    return fetcher();
  }
  const value = await fetcher();
  try {
    await r.set(key, value, { ex: opts.ttlSeconds });
  } catch {
    // ignore set failures — value already produced
  }
  return value;
}

export async function invalidate(key: string): Promise<void> {
  const r = getRedis();
  if (!r) return;
  try { await r.del(key); } catch { /* swallow */ }
}
```

**Step 4: Install dependency + run tests**

Run: `npm install @upstash/redis`
Run: `npx vitest run tests/lib/data/cache/upstash.test.ts`
Expected: PASS — 5 tests

**Step 5: Commit**

```bash
git add src/lib/data/cache/ tests/lib/data/cache/ package.json package-lock.json .env.example
git commit -m "feat(19-b-01): Upstash Redis cache layer with graceful degrade

cached(key, fetcher, opts) wraps any fetcher with TTL caching.
Redis outage falls through to fetcher — no hard dependency.
Centralized cache-keys + TTL config in cache-keys.ts.

Foundation for Wave B adapters (Tiingo, Twelve Data, Exa).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Done gate (Plan 19-B-01):** tests green; manual smoke test against real Upstash sandbox confirms cache hit/miss; committed. No shadow needed — wrapper is opt-in (callers must invoke `cached()`); existing fetchers untouched.

---

## Plans 19-B-02 through 19-B-08 (stubs)

### 19-B-02: Retry + exponential backoff wrapper
- Create: `src/lib/data/retry.ts` — `withRetry(fn, { maxAttempts, baseDelayMs })`
- Tests: backoff timing, max attempts, retries only on retryable errors (5xx, network, not 4xx)
- Commit

### 19-B-03: Tiingo adapter
- Create: `src/lib/data/adapters/tiingo.ts` — `fetchTiingoQuote`, `fetchTiingoFundamentals`
- Wraps fetch with `cached()` + `withRetry()`
- Mocked HTTP tests + 1 live integration test (skipped by default, runs with `RUN_LIVE_INTEGRATION=true`)
- Commit

### 19-B-04: Twelve Data adapter
- Create: `src/lib/data/adapters/twelve-data.ts` — `fetchTwelveDataFundamentals`
- Same pattern as Tiingo
- Commit

### 19-B-05: Exa 2.0 adapter
- Create: `src/lib/data/adapters/exa-search.ts` — `fetchExaNews`, `fetchExaAnalystSentiment`
- Replaces hot-path Anthropic-search calls when `FEATURE_EXA_PRIMARY` enabled
- `anthropic-search.ts` unchanged — kept as fallback
- Commit

### 19-B-06: source-package.ts merge precedence reorder
- Modify: `src/lib/data/source-package.ts` + `src/lib/data/merge.ts`
- New ladder when flags on: tiingo → twelvedata → yahoo → finnhub → polygon
- Old ladder when flags off (no behavior change for current users)
- **Shadow A/B starts here** — `runWithShadow('source-package', oldFn, newFn, mode)`
- Verdict: SourcePackage Jaccard similarity ≥ 95% AND latency ≤ old AND no field nulls introduced
- Commit landing code; flip flag to shadow in next deploy
- After 3-7 days: run `npm run shadow-verdict 19-b-06` → if PASS → cutover PR with old merge ladder code DELETED
- 7-day rollback hatch
- Final flag-removal PR
- Commit

### 19-B-07: Vercel Runtime Cache integration
- Modify: `src/app/api/research/[ticker]/route.ts` — wrap SourcePackage assembly with Runtime Cache 10min idempotency
- Reference: Next.js cache components (`use cache` directive) for App Router 16
- Commit

### 19-B-08: Feature flag rollout + dual-write verification
- Run shadow rollout for 19-B-06, 19-B-07 in production (1% traffic gate)
- Capture verdict, cutover, cleanup per universal preamble
- This plan is 100% process — no new code, just driving the cutover

**Wave B done gate:** all 8 plans satisfy Hard Cleanup Gate; Yahoo/Finnhub/Polygon/Anthropic-search code paths still in tree as fallbacks (NOT deleted — they're the safety net), but their direct call from `source-package.ts` primary path is removed.

---

# Wave C — Sentiment + Reasoning Excellence

## Plan 19-C-01: HF Inference Endpoint + FinSentLLM client

**Files:**
- Create: `src/lib/sentiment/finsentllm.ts`
- Create: `tests/lib/sentiment/finsentllm.test.ts`
- Modify: `package.json` (add `@huggingface/inference`)
- Modify: `.env.example` — add `HF_INFERENCE_TOKEN`, `HF_FINGPT_ENDPOINT`, `HF_MISTRAL_FIN_ENDPOINT`, `HF_FINBERT_ENDPOINT`

**Why first in Wave C:** the ensemble (19-C-02) and CoVe (19-C-08) both depend on this client being ready.

**Step 1: Write the failing test**

```ts
// tests/lib/sentiment/finsentllm.test.ts
import { describe, it, expect, vi } from 'vitest';
import { classifyFinGPT, classifyMistralFin, classifyFinBERT, type SentimentScore } from '../../../src/lib/sentiment/finsentllm';

vi.mock('@huggingface/inference', () => ({
  HfInference: vi.fn(() => ({
    textClassification: vi.fn(async ({ inputs }) => [
      { label: 'positive', score: 0.85 },
      { label: 'negative', score: 0.10 },
      { label: 'neutral', score: 0.05 },
    ]),
  })),
}));

describe('finsentllm clients', () => {
  it('classifyFinGPT returns score in [-1,1] with confidence in [0,1]', async () => {
    const r = await classifyFinGPT('AAPL beats earnings, revenue up 12%');
    expect(r.score).toBeGreaterThanOrEqual(-1);
    expect(r.score).toBeLessThanOrEqual(1);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
    expect(r.model).toBe('fingpt-v3');
  });

  it('classifyMistralFin returns same shape', async () => {
    const r = await classifyMistralFin('AAPL down 3%, analysts cautious');
    expect(r).toHaveProperty('score');
    expect(r).toHaveProperty('confidence');
    expect(r.model).toBe('mistral-fin-7b');
  });

  it('classifyFinBERT returns same shape', async () => {
    const r = await classifyFinBERT('AAPL stable, no major moves');
    expect(r).toHaveProperty('score');
    expect(r.model).toBe('finbert');
  });

  it('returns null sentinel on API error (does not throw)', async () => {
    vi.doMock('@huggingface/inference', () => ({
      HfInference: vi.fn(() => ({
        textClassification: vi.fn(async () => { throw new Error('rate limited'); }),
      })),
    }));
    const mod = await import('../../../src/lib/sentiment/finsentllm');
    const r = await mod.classifyFinGPT('test');
    expect(r).toEqual({ score: null, confidence: null, model: 'fingpt-v3', error: 'rate limited' });
  });
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run tests/lib/sentiment/finsentllm.test.ts`
Expected: FAIL — module missing.

**Step 3: Implement clients**

```ts
// src/lib/sentiment/finsentllm.ts
import { HfInference } from '@huggingface/inference';

export interface SentimentScore {
  score: number | null;
  confidence: number | null;
  model: 'fingpt-v3' | 'mistral-fin-7b' | 'finbert';
  error?: string;
}

function getClient(): HfInference {
  const token = process.env.HF_INFERENCE_TOKEN;
  if (!token) throw new Error('HF_INFERENCE_TOKEN not set');
  return new HfInference(token);
}

function reduceLabels(out: Array<{ label: string; score: number }>): { score: number; confidence: number } {
  let pos = 0, neg = 0, max = 0;
  for (const r of out) {
    const l = r.label.toLowerCase();
    if (l.startsWith('pos')) pos = r.score;
    else if (l.startsWith('neg')) neg = r.score;
    if (r.score > max) max = r.score;
  }
  return { score: pos - neg, confidence: max };
}

async function classifyVia(model: SentimentScore['model'], endpointEnv: string, text: string): Promise<SentimentScore> {
  try {
    const endpoint = process.env[endpointEnv];
    if (!endpoint) throw new Error(`${endpointEnv} not set`);
    const client = getClient();
    const out = await client.textClassification({ model: endpoint, inputs: text });
    const arr = Array.isArray(out) ? out : [out];
    const { score, confidence } = reduceLabels(arr as Array<{ label: string; score: number }>);
    return { score, confidence, model };
  } catch (err) {
    return { score: null, confidence: null, model, error: err instanceof Error ? err.message : String(err) };
  }
}

export const classifyFinGPT     = (text: string) => classifyVia('fingpt-v3',     'HF_FINGPT_ENDPOINT', text);
export const classifyMistralFin = (text: string) => classifyVia('mistral-fin-7b','HF_MISTRAL_FIN_ENDPOINT', text);
export const classifyFinBERT    = (text: string) => classifyVia('finbert',       'HF_FINBERT_ENDPOINT', text);
```

**Step 4: Install + run tests**

Run: `npm install @huggingface/inference`
Run: `npx vitest run tests/lib/sentiment/finsentllm.test.ts`
Expected: PASS — 4 tests

**Step 5: Commit**

```bash
git add src/lib/sentiment/finsentllm.ts tests/lib/sentiment/ package.json package-lock.json .env.example
git commit -m "feat(19-c-01): FinSentLLM clients (FinGPT v3 + Mistral-Fin 7B + FinBERT)

Three independent HuggingFace Inference Endpoint clients, each returning
a uniform SentimentScore. Errors return null sentinels (do not throw).
Foundation for Plan 19-C-02 (ensemble meta-classifier) and 19-C-08 (CoVe verifier).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**Done gate (Plan 19-C-01):** tests green; smoke test against staging HF endpoints returns sane scores for known bullish + bearish snippets; committed. No shadow needed — primitive client only, not yet wired into hot path.

---

## Plans 19-C-02 through 19-C-11 (stubs)

### 19-C-02: Ensemble meta-classifier (FinGPT + Mistral + FinBERT)
- Create: `src/lib/sentiment/ensemble.ts` — `ensembleSentiment(text)` returns `{ score, confidence, model_agreement, per_model: SentimentScore[] }`
- Strategy: weighted average of non-null scores, weight = confidence; agreement = 1 - std(scores)
- Edge: if 2+ models null, fall back to single available; if all null, return null sentinel
- Commit

### 19-C-03: Reputation-weighted StockTwits aggregation
- Modify: `src/lib/data/stocktwits.ts` — add reputation weighting mode behind `FEATURE_REPUTATION_WEIGHTED_STOCKTWITS`
- Score = Σ(message_sentiment × user_reputation) / Σ(user_reputation)
- Reputation derived from follower count + post history (cached per user 24h)
- **Shadow A/B**: weighted vs naive — verdict on Brier of resolved tickers
- Cutover + cleanup per universal preamble
- Commit

### 19-C-04: Options term-structure 30/60/90d + IV regime gate
- Modify: `src/lib/data/options-sentiment.ts` — fetch chains for 30/60/90d expiries, OI-weighted P/C, compare realized vs implied vol
- New IV regime classifier: high-IV regime flips put/call interpretation
- **Shadow A/B**: term-structure vs nearest-expiry-only on resolved tickers
- Cutover + cleanup
- Commit

### 19-C-05: Swaggystocks + ApeWisdom adapters (supplemental)
- Create: `src/lib/data/adapters/swaggystocks.ts`, `src/lib/data/adapters/apewisdom.ts`
- Both supplemental; merged into `community_aggregated` JSONB column on SentimentSnapshot
- Firecrawl remains primary (per user direction 2026-05-07)
- **Shadow A/B**: with-supplemental vs Firecrawl-only — verdict on signal strength + report quality
- Cutover + cleanup
- Commit

### 19-C-06: Quiver adapter (optional flag)
- Create: `src/lib/data/adapters/quiver.ts` — insider trades + congressional trades
- Optional flag — only activates if `QUIVER_API_KEY` set
- Merged into `community_aggregated`
- No shadow — purely additive new column population
- Commit

### 19-C-07: Structured citation schema + research-brief edits
- Create: `src/lib/sentiment/citation-schema.ts` — Zod schema for `{ source, url, confidence, date_retrieved }`
- Modify: `src/lib/research-brief.ts` — assembles structured citations in prompt
- Modify: `src/lib/gemini-analysis.ts` — replace `source_citation: string` with `citations_v2: Citation[]` in `AnalysisResultSchema`
- **Shadow A/B**: structured vs string citations — verdict on URL coverage rate + factual accuracy spot-check
- Cutover + cleanup
- Commit

### 19-C-08: CoVe two-pass wrapper + tests
- Create: `src/lib/reasoning/cove.ts`
- Pass 1: Gemini emits AnalysisResult + 3 verification claims
- Pass 2: NLI check (via FinBERT classifier or distilbert-mnli) on each claim vs SourcePackage
- Contradictions flagged in `source_warnings` field (existing field, additive use)
- **Shadow A/B**: with-CoVe vs without — verdict on hallucination rate (manual sample) + cost delta
- Cutover + cleanup
- Commit

### 19-C-09: Model cascade router + cost telemetry
- Create: `src/lib/reasoning/router.ts` — `routeModel({ ticker, controversy, ic_decay_flag })` returns `'haiku' | 'gemini-flash' | 'gemini-pro'`
- Decision tree in design §4 step 6c
- Cost telemetry written to LearningEvent table for `/insights` dashboard consumption
- **Shadow A/B**: router vs current monolithic Gemini Flash — verdict on cost per report + quality (Brier on resolved)
- Cutover + cleanup
- Commit

### 19-C-10: Cross-class contradiction detector
- Create: `src/lib/sentiment/contradiction-detector.ts`
- NLI on pairs of class posteriors (technical bullish AND insider distribution = contradiction flag)
- Severity threshold → flagged in EngineCalibrationPanel
- **Shadow A/B** in detection mode (don't gate output, just log) — verdict on false-positive rate
- Cutover + cleanup
- Commit

### 19-C-11: Arctic Shift one-time historical backfill
- Create: `scripts/arctic-shift-backfill.ts`
- One-shot script — pulls 5y of Reddit chatter for v1.0 ticker universe from Arctic Shift
- Populates `CommunityChatter` historical rows for FinSentLLM training data
- Scoring run produces baseline corpus for downstream ensemble training (19-C-02)
- No shadow — one-time historical ingest
- Commit

**Wave C done gate:** all 11 plans satisfy Hard Cleanup Gate; Firecrawl remains primary community ingestion; structured citations live; FinSentLLM ensemble live; CoVe + router live for high-stakes tickers.

---

## Cross-wave verification

After all four waves complete:

1. Run `npm run model-card-status` — expect exit 0 with green report
2. Verify zero `FEATURE_*` references in `features.ts` from this effort (grep)
3. Verify zero references to deleted code paths in tree (grep against pre-cutover patterns documented per plan)
4. Verify all crons running and logging IC + DSR/PBO + ensemble scores + hierarchical posteriors
5. Run full test suite: `npm test && npm run test:integration && npm run test:e2e`
6. Manual smoke: produce one research report end-to-end, verify EngineCalibrationPanel shows conformal CI + ESS + IC monitor + WatchBadge as appropriate

When all six pass → mark Phase 19 as **DONE** in `.planning/ROADMAP.md` and tag the commit.

---

## Reference

- Design doc: `docs/plans/2026-05-07-cipher-v2-excellence-design.md`
- Existing v2.0 ROADMAP: `.planning/ROADMAP.md`
- Phase 18 (just shipped): `.planning/phases/18-time-decayed-bayesian-updates-ess/`
- Hyperparameter sanity test (must not regress): `tests/learning.hyperparameters.test.ts`

---

## Implementation handoff

This master plan covers 4 + 7 + 8 + 11 = **30 plans total** across Phase 19. The first plan of each wave is given in full TDD detail. The remaining 26 plans are stubs with file paths, tasks, and Done gates.

For per-plan TDD expansion, run Cipher's GSD planning pipeline:

```bash
# Single command — handles all 30 plans across the 4 waves
/gsd-plan-phase 19
```

This invocation spawns `gsd-phase-researcher` + `gsd-planner` + `gsd-plan-checker` subagents to expand each stub into a full GSD-format `19-<wave>-<id>-PLAN.md` under `.planning/phases/19-cipher-v2-excellence/`.

Then for execution:

```bash
/gsd-execute-phase 19
```

Each spawned executor agent runs `superpowers:executing-plans`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion` internally, while the GSD pipeline handles wave-based parallelization, intel files, and per-plan code review.
