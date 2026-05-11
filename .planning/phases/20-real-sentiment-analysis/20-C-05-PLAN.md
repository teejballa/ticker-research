---
phase: 20
plan: 20-C-05
wave: C
type: execute
depends_on: [20-Z-01]
forward_refs: [19-A-04]
files_modified:
  - src/lib/sentiment/joint-features.ts
  - src/lib/sentiment/joint-features.test.ts
  - src/lib/sentiment/paired-bootstrap.ts
  - src/lib/sentiment/paired-bootstrap.test.ts
  - src/lib/learning.ts
  - tests/learning.joint-features-key.test.ts
  - scripts/ablate-joint-features.ts
  - tests/ablate-joint-features.integration.test.ts
  - src/app/api/cron/joint-feature-ablation/route.ts
  - tests/cron-joint-feature-ablation.test.ts
  - prisma/schema.prisma
  - HYPERPARAMETERS.md
  - reports/.gitkeep
autonomous: true
shadow_required: true
hard_cleanup_gate: true
requirements: [20-C-05]
must_haves:
  truths:
    - "Four derived features (sentiment×|returns_5d|, sentiment×volume_zscore, Δsentiment_3d, sentiment_dispersion) are pure functions in src/lib/sentiment/joint-features.ts"
    - "Paired-bootstrap on Sharpe difference uses EXACTLY 1000 resamples and block-bootstrap with block size = 7 days"
    - "95% CI computed via percentile method on the 1000 bootstrap differences"
    - "CPCV harness (19-A-04 combinatorialPurgedKFold) is imported and reused — no re-implementation in this plan"
    - "Ablation script produces JSON report committed at reports/joint-features-ablation-{YYYY-MM-DD}.md"
    - "JOINT_FEATURES_MODE flag = 'off' | 'shadow' | 'on'; default 'off'; ablation script writes verdict + decision"
    - "Promotion gate: 95% CI lower-bound > 0 AND 3 consecutive months of CI lower-bound > 0 — both required before shadow→on"
    - "Null-result branch: report explicitly states 'no uplift detected; feature additions retained in code behind off-flag for future evaluation'"
    - "LearnedPattern key extension is backward-compatible — additive only; existing patterns keep semantics; new buckets seeded with uniform priors"
    - "Multiple-testing mitigation: ablation reports ONE Sharpe difference (joint-bundle vs sentiment-alone), not four individual feature tests"
  artifacts:
    - path: "src/lib/sentiment/joint-features.ts"
      provides: "Four derived-feature pure functions"
      exports: ["sentimentMomentumProduct", "sentimentVolumeInteraction", "deltaSentiment3d", "sentimentDispersion"]
    - path: "src/lib/sentiment/paired-bootstrap.ts"
      provides: "Block-bootstrap paired Sharpe-difference CI computation"
      exports: ["pairedBlockBootstrapSharpeDiff", "type PairedBootstrapResult"]
    - path: "scripts/ablate-joint-features.ts"
      provides: "End-to-end ablation runner: CPCV → per-fold Sharpe → paired bootstrap → verdict report"
    - path: "src/app/api/cron/joint-feature-ablation/route.ts"
      provides: "Monthly cron that re-runs ablation and ratchets JOINT_FEATURES_MODE based on 3-month rolling verdict"
    - path: "src/lib/learning.ts"
      provides: "JOINT_FEATURES_MODE feature flag + additive LearnedPattern key extension"
    - path: "reports/joint-features-ablation-{YYYY-MM-DD}.md"
      provides: "Committed per-run ablation report (markdown summary)"
  key_links:
    - from: "scripts/ablate-joint-features.ts"
      to: "src/lib/learning.ts (combinatorialPurgedKFold)"
      via: "import + invocation"
      pattern: "import.*combinatorialPurgedKFold.*from.*learning"
    - from: "src/app/api/cron/joint-feature-ablation/route.ts"
      to: "scripts/ablate-joint-features.ts"
      via: "shared runAblation() function exported by script module"
      pattern: "import.*runAblation"
    - from: "src/lib/sentiment/joint-features.ts"
      to: "src/lib/learning.ts pattern key builder"
      via: "imported and conditionally hashed into key under JOINT_FEATURES_MODE !== 'off'"
      pattern: "JOINT_FEATURES_MODE"
---

# Plan 20-C-05: Sentiment × momentum × volume joint feature ablation

<universal_preamble>

## Autonomous Execution Clause

Land four derived-feature pure functions + paired block-bootstrap primitive + ablation script + monthly cron + integration test → unit tests green → committed reports directory created → commit. Shadow mode is the default landing state (flag = 'off' on merge, ablation cron flips to 'shadow' on first run, and only the 3-month rolling CI lower-bound > 0 verdict can flip 'shadow' → 'on'). No schema migration is shipped on day one — derived features are computed in code; the LearnedPattern key extension is purely additive and backward-compatible (existing patterns retain semantics; new buckets seed with uniform priors).

## Hard Cleanup Gate (Definition of Done)

1. JOINT_FEATURES_MODE = 'off' on merge (shadow flips on first cron)
2. Ablation script runnable end-to-end on fixture data (`npm run ablate-joint-features`)
3. Either: (a) verdict is positive → at least one committed report shows CI lower-bound > 0, OR (b) verdict is null → committed null-result report explicitly states no uplift detected
4. Monthly cron registered in `vercel.json` (additive — does NOT modify existing crons)
5. `npm test` green (unit + integration); paired bootstrap test asserts 1000 resamples literal; block-bootstrap test asserts block_size = 7

## Scope discipline (siblings own these — DO NOT touch in this plan)

- 19-A-04 owns CPCV harness implementation — this plan IMPORTS it
- 20-C-01 owns per-source rolling ICIR — this plan does NOT compute IC per individual feature
- 20-C-02 owns Brier decomposition — this plan does NOT compute Brier
- 18-02 owns purgedKFold — this plan does NOT re-implement purging

</universal_preamble>

<objective>
Test the hypothesis: do four sentiment-interaction features (sentiment × |5d-return|, sentiment × volume_zscore, Δsentiment_3d, sentiment_dispersion) add marginal predictive Sharpe over sentiment-alone in the Diffusion Engine pattern key, after controlling for 5d momentum?

Methodology: extend the LearnedPattern key (behind a feature flag) with the four joint features; run Combinatorial Purged K-Fold CV (reusing 19-A-04 harness) twice — once on sentiment-alone keys, once on joint-feature keys; produce per-fold Sharpe sequences; compute the difference; bootstrap the difference with block-bootstrap (block size = 7 days, 1000 resamples); compute 95% percentile CI.

Decision rule: if CI lower-bound > 0 (single test, not per-feature), promote shadow → on, but ONLY after 3 consecutive monthly runs all agree. Otherwise: ship a null-result report documenting the experiment and leave the flag at 'off'.

This plan adheres to standards S1 (numerical gate, no hand-picked verdict), S7 (threat model below), S8 (numerical acceptance), and S3 (shadow lifecycle).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@.planning/phases/19-cipher-v2-0-excellence/19-A-04-PLAN.md
@src/lib/learning.ts
@prisma/schema.prisma

<interfaces>

```typescript
// === NEW: src/lib/sentiment/joint-features.ts ===

/** sentiment × abs(returns_5d) — amplifies sentiment when price is moving */
export function sentimentMomentumProduct(
  sentiment: number,         // [-1, +1]
  returns_5d: number         // raw return, e.g., 0.03 for +3%
): number;

/** sentiment × volume_zscore — amplifies sentiment when discussion volume spikes */
export function sentimentVolumeInteraction(
  sentiment: number,         // [-1, +1]
  volume_zscore: number      // robust z-score from 20-A-02 MentionBaseline
): number;

/** First-difference of sentiment over 3-day window — captures sentiment momentum/decay */
export function deltaSentiment3d(
  sentiment_t: number,
  sentiment_t_minus_3: number
): number;

/** Cross-source bull-pct dispersion — reuses 20-A-05 bullPctStd semantics */
export function sentimentDispersion(
  perSourceBullPct: number[]  // length ≥ 2; returns 0 if length < 2
): number;

// === NEW: src/lib/sentiment/paired-bootstrap.ts ===

export interface PairedBootstrapResult {
  observedDelta: number;          // mean(seriesA) - mean(seriesB) on actual data
  bootstrapDeltas: number[];      // length = nResamples (exactly 1000)
  ci95Lower: number;              // 2.5th percentile of bootstrapDeltas
  ci95Upper: number;              // 97.5th percentile
  blockSize: number;              // 7 (documented choice — see threat T-20-C-05-03)
  nResamples: number;             // 1000 (literal)
  pValueTwoSided: number;         // 2 * min(P(delta<=0), P(delta>=0))
}

/**
 * Block-bootstrap paired Sharpe-difference CI.
 * seriesA and seriesB are per-fold (or per-day) Sharpe estimates from CPCV.
 * They MUST be the same length and ordered (paired by fold/day).
 */
export function pairedBlockBootstrapSharpeDiff(args: {
  seriesA: number[];      // joint-feature per-fold Sharpe
  seriesB: number[];      // sentiment-alone per-fold Sharpe (same fold indices)
  nResamples?: number;    // default 1000 — implementer hard-codes literal; arg is for tests
  blockSize?: number;     // default 7 — block-bootstrap to preserve autocorrelation
  seed?: number;          // PRNG seed for deterministic tests
}): PairedBootstrapResult;

// === EXTENDED: src/lib/learning.ts ===

/** Feature flag — controls whether joint features participate in LearnedPattern key */
export type JointFeaturesMode = 'off' | 'shadow' | 'on';

export function getJointFeaturesMode(): JointFeaturesMode;
// reads process.env.JOINT_FEATURES_MODE; defaults to 'off'

/**
 * Build the pattern key. When mode === 'on', joint features are hashed in
 * additively (new bucket dimensions). When mode === 'shadow', BOTH variants
 * are computed and both buckets get the observation (for parallel evaluation).
 * When mode === 'off', behavior is unchanged from current production.
 */
export function buildPatternKey(args: {
  sentimentType: string;
  capClass: string;
  direction: 'bull' | 'bear';
  jointFeatures?: {
    sentimentMomentumProduct: number;
    sentimentVolumeInteraction: number;
    deltaSentiment3d: number;
    sentimentDispersion: number;
  };
  mode?: JointFeaturesMode;   // override for tests
}): { primaryKey: string; shadowKey?: string };

// === NEW: scripts/ablate-joint-features.ts (importable module + CLI entry) ===

export interface AblationConfig {
  asOfDate: Date;
  cpcvN: number;              // default 6
  cpcvK: number;              // default 2
  cpcvEmbargo: number;        // default 5 days
  lookbackDays: number;       // default 365
  blockBootstrapSize: number; // default 7
  nResamples: number;         // default 1000 — assertion in tests
  seed: number;               // default 20260510
}

export interface AblationReport {
  asOfDate: string;
  config: AblationConfig;
  sentimentAloneSharpe: number[];   // per-fold
  jointFeatureSharpe: number[];     // per-fold (paired with above)
  bootstrap: PairedBootstrapResult;
  verdict: 'uplift' | 'null' | 'inconclusive';
  decision: 'promote_to_on' | 'remain_shadow' | 'remain_off';
  rollingMonthsAgreeing: number;    // count of last N months with verdict='uplift'
  monthsNeededForPromotion: 3;
  reportPath: string;               // reports/joint-features-ablation-{date}.md
}

export async function runAblation(config: AblationConfig): Promise<AblationReport>;
```

</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| backfill data → CPCV harness | historical sentiment + price observations cross into the evaluation harness; correctness depends on PIT discipline upheld by 20-Z-01 |
| ablation script → LearnedPattern key | the ablation must NOT pollute production priors (it runs in a sandboxed key namespace) |
| monthly cron → JOINT_FEATURES_MODE flag | a single positive month must not flip mode; the 3-consecutive-month rule is the gate |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-C-05-01 | Tampering (statistical) | ablation verdict | mitigate | **Multiple-testing inflation**: we test four features but report ONE Sharpe difference (joint-bundle vs sentiment-alone) — a single test, not four. Each individual feature's marginal IC is NOT separately reported in the verdict. Unit test asserts the script never publishes per-feature p-values. |
| T-20-C-05-02 | Tampering (statistical) | CPCV harness | mitigate | Reuse 19-A-04 `combinatorialPurgedKFold` (golden-master tested to 1e-6 against published references). Explicitly pass `embargo=5` (≥ max forecast horizon of 5d). Integration test asserts the harness is called via import, not re-implemented. |
| T-20-C-05-03 | Tampering (statistical) | paired bootstrap CI | mitigate | **Autocorrelation**: returns are autocorrelated, so iid bootstrap underestimates uncertainty. Use **block-bootstrap with block size = 7 days** (documented choice; 7 days ≈ one trading week, larger than the 5d forecast horizon — Politis & Romano 1994 recommendation for stationary block bootstrap). Block size is a defaulted arg and is explicitly logged in every report. |
| T-20-C-05-04 | Business Logic | flag flipping due to monthly noise | mitigate | Promotion gate requires **3 consecutive months** of CI lower-bound > 0 before `shadow → on`. Cron reads last 3 committed reports under `reports/joint-features-ablation-*.md`; unit test asserts cron refuses to flip after only 1 or 2 positive months. |
| T-20-C-05-05 | Tampering | LearnedPattern key extension corrupts existing priors | mitigate | **Backward-compatible additive key**: existing patterns keep their primaryKey unchanged; joint-feature variants live under a new shadowKey namespace (`{primary}::joint::{hash}`). New buckets seed with uniform priors (α=β=1). Integration test asserts that with `mode='off'`, `buildPatternKey()` returns the byte-identical key it returned pre-plan (golden-master snapshot). |
| T-20-C-05-06 | Information Disclosure | ablation script reads production DB without scoping | mitigate | Script runs read-only against backfill; explicitly uses `SELECT ... FOR SHARE`-style read transactions in Prisma (or simply `prisma.$transaction` with `isolationLevel: 'ReadCommitted'`); writes ONLY go to `reports/` directory, never to LearnedPattern rows. |
| T-20-C-05-07 | DoS | monthly cron run-time exceeds Vercel function timeout | mitigate | CPCV with N=6, k=2, 365d data fits within 60s Vercel function limit; cron uses `runtime = 'nodejs'` with `maxDuration = 300` (Pro tier). Telemetry logs runtime; alert if > 200s for two consecutive runs. |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="20-C-05-01">
  <name>Task 1: Implement four derived-feature pure functions + unit tests</name>
  <files>src/lib/sentiment/joint-features.ts, src/lib/sentiment/joint-features.test.ts</files>
  <read_first>
    - src/lib/sentiment/ (existing pattern; check sibling files for export conventions)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 107 — 20-A-05 bullPctStd semantics that sentimentDispersion reuses)
  </read_first>
  <behavior>
    - Test 1: `sentimentMomentumProduct(0.5, -0.02) === 0.01` (uses abs of return; sign of sentiment preserved)
    - Test 2: `sentimentMomentumProduct(0, 0.10) === 0` (zero sentiment → zero feature regardless of return)
    - Test 3: `sentimentVolumeInteraction(-0.5, 3.0) === -1.5` (negative sentiment × positive z preserves sign)
    - Test 4: `deltaSentiment3d(0.6, 0.2)` returns 0.4
    - Test 5: `deltaSentiment3d(0.2, 0.6)` returns -0.4 (sign-correct)
    - Test 6: `sentimentDispersion([])` returns 0 (empty guard)
    - Test 7: `sentimentDispersion([0.5])` returns 0 (length < 2 guard — single source has no dispersion)
    - Test 8: `sentimentDispersion([0.2, 0.4, 0.6, 0.8])` matches population std formula to 1e-9
    - Test 9: All four functions are pure (no DB import, no Date.now, no Math.random)
  </behavior>
  <action>
    Create `src/lib/sentiment/joint-features.ts` with four exports per the interface block above.

    Implementation notes:
    - `sentimentMomentumProduct`: `return sentiment * Math.abs(returns_5d)`
    - `sentimentVolumeInteraction`: `return sentiment * volume_zscore`
    - `deltaSentiment3d`: `return sentiment_t - sentiment_t_minus_3`
    - `sentimentDispersion`: if `perSourceBullPct.length < 2` return 0. Else compute population standard deviation (NOT sample): `sqrt(mean((x - mean(x))^2))`. This matches 20-A-05's bullPctStd convention per CONTEXT line 107.

    All four functions must be pure — no DB, no side effects, no time references.

    Create `src/lib/sentiment/joint-features.test.ts` with 9 tests above. Use `toBeCloseTo(val, 9)` for floating-point checks.
  </action>
  <acceptance_criteria>
    - File `src/lib/sentiment/joint-features.ts` exists with 4 exports
    - File `src/lib/sentiment/joint-features.test.ts` has ≥9 tests
    - `grep -L "prisma\|@/lib/db\|Date.now\|Math.random" src/lib/sentiment/joint-features.ts` (file MUST appear in the "no DB / no nondeterminism" list)
    - `npx vitest run src/lib/sentiment/joint-features.test.ts` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/sentiment/joint-features.test.ts && grep -c "^export function" src/lib/sentiment/joint-features.ts</automated>
  </verify>
  <done>Four pure feature functions implemented + 9 unit tests green</done>
</task>

<task type="auto" tdd="true" id="20-C-05-02">
  <name>Task 2: Implement paired block-bootstrap primitive + tests (1000 resamples literal, block_size=7)</name>
  <files>src/lib/sentiment/paired-bootstrap.ts, src/lib/sentiment/paired-bootstrap.test.ts</files>
  <read_first>
    - src/lib/learning.ts (for normCDF / seeded PRNG helpers if they exist; 19-A-04 added some)
    - .planning/phases/19-cipher-v2-0-excellence/19-A-04-PLAN.md (CPCV harness signature)
  </read_first>
  <behavior>
    - Test 1: `nResamples` default is exactly 1000 — `expect(result.nResamples).toBe(1000)` after a default-arg call
    - Test 2: `blockSize` default is exactly 7 — `expect(result.blockSize).toBe(7)`
    - Test 3: `bootstrapDeltas.length === 1000` literal
    - Test 4: Synthetic test — when `seriesA = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]` and `seriesB = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]`, `observedDelta === 1.0` and `ci95Lower > 0`
    - Test 5: Synthetic test — when `seriesA === seriesB`, `observedDelta === 0`, `ci95Lower < 0 < ci95Upper` (CI straddles 0)
    - Test 6: Pairing — `seriesA.length !== seriesB.length` throws explicit error
    - Test 7: Determinism — same seed produces byte-identical `bootstrapDeltas` (run twice, assert array equality)
    - Test 8: Block-bootstrap behavior — when sequences are AR(1) with phi=0.8, the CI width is wider than iid-bootstrap CI width on the same data (we DO NOT ship an iid bootstrap, but the test computes both internally and asserts the inequality)
    - Test 9: `ci95Lower` is the 25th sorted bootstrap value (0-indexed 24) and `ci95Upper` is the 975th (0-indexed 974) — percentile method literal
    - Test 10: Two-sided p-value — `pValueTwoSided` in [0, 1]; equals 1.0 when delta = 0 in expectation
  </behavior>
  <action>
    Create `src/lib/sentiment/paired-bootstrap.ts`. Implementation:

    1. **Block resampling**: split `seriesA` and `seriesB` into overlapping blocks of size `blockSize` (Politis-Romano moving-block bootstrap). For each resample, draw `ceil(n / blockSize)` random block start indices with a seeded PRNG and concatenate. Truncate to length n. CRITICAL: same block indices are used for seriesA AND seriesB (paired sampling).

    2. **Sharpe difference**: for each resample, compute `mean(resampledA) - mean(resampledB)`. (Note: we are bootstrapping the per-fold Sharpe estimates directly, so the "mean" here is the mean across folds; per-fold Sharpes themselves came from CPCV in Task 4. This keeps the bootstrap layer simple.)

    3. **Hard-code 1000 as the default literal**: `const nResamples = args.nResamples ?? 1000;` and add a comment `// FIXED LITERAL — see plan 20-C-05 T-20-C-05-04`. Hard-coded literal so a test can assert it.

    4. **Hard-code 7 as the default block size**: `const blockSize = args.blockSize ?? 7;` with comment `// 7-day block — see plan 20-C-05 T-20-C-05-03 (Politis-Romano stationary block bootstrap, block > forecast horizon 5d)`.

    5. **Seeded PRNG**: use a small mulberry32 (8-line) inline. Do not import any external RNG.

    6. **Percentile method**: `bootstrapDeltas.sort((a,b) => a-b); ci95Lower = bootstrapDeltas[24]; ci95Upper = bootstrapDeltas[974];` (0-indexed).

    7. **p-value**: `pValueTwoSided = 2 * Math.min(belowZero / 1000, aboveZero / 1000)` clamped to [0, 1].

    Create `src/lib/sentiment/paired-bootstrap.test.ts` with 10 tests above.
  </action>
  <acceptance_criteria>
    - File `src/lib/sentiment/paired-bootstrap.ts` exists
    - Defaults: `1000` and `7` appear as literals in the source (`grep -q "?? 1000" src/lib/sentiment/paired-bootstrap.ts && grep -q "?? 7" src/lib/sentiment/paired-bootstrap.ts`)
    - File `src/lib/sentiment/paired-bootstrap.test.ts` has ≥10 tests
    - `npx vitest run src/lib/sentiment/paired-bootstrap.test.ts` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run src/lib/sentiment/paired-bootstrap.test.ts && grep -q "?? 1000" src/lib/sentiment/paired-bootstrap.ts && grep -q "?? 7" src/lib/sentiment/paired-bootstrap.ts</automated>
  </verify>
  <done>Paired block-bootstrap primitive landed with 1000 + 7 literals + 10 green tests</done>
</task>

<task type="auto" tdd="true" id="20-C-05-03">
  <name>Task 3: Extend learning.ts with JOINT_FEATURES_MODE flag + additive pattern-key (backward-compat snapshot test)</name>
  <files>src/lib/learning.ts, tests/learning.joint-features-key.test.ts, tests/fixtures/pattern-key-pre-20-C-05.json, HYPERPARAMETERS.md</files>
  <read_first>
    - src/lib/learning.ts (existing pattern key builder — locate buildPatternKey or equivalent)
    - src/lib/sentiment/joint-features.ts (just landed in Task 1)
  </read_first>
  <behavior>
    - Test 1: `getJointFeaturesMode()` returns 'off' when env var is undefined
    - Test 2: `getJointFeaturesMode()` returns the env value when set to 'off', 'shadow', or 'on'
    - Test 3: `getJointFeaturesMode()` throws on invalid value (e.g., 'enabled', 'true')
    - Test 4: **Backward-compat golden master**: with `mode='off'`, `buildPatternKey({sentimentType:'news', capClass:'large', direction:'bull'})` returns the SAME string it returns from the CURRENT production code path. Snapshot the pre-plan output via a fixture file `tests/fixtures/pattern-key-pre-20-C-05.json` (committed in this task).
    - Test 5: With `mode='off'`, `shadowKey` is `undefined`
    - Test 6: With `mode='shadow'`, BOTH `primaryKey` and `shadowKey` are returned; primaryKey is byte-identical to mode='off' output; shadowKey contains a hash of the joint features
    - Test 7: With `mode='on'`, `primaryKey` includes the joint-feature hash (this is the cutover state — only set after 3-month gate)
    - Test 8: Joint-feature hash is deterministic across runs (same inputs → same hash)
  </behavior>
  <action>
    Edit `src/lib/learning.ts`:

    1. Locate the existing pattern-key construction (search for the `(sentiment_type × cap_class × direction)` tuple builder per CLAUDE.md system architecture).
    2. Add exports `getJointFeaturesMode()` and `JointFeaturesMode` type per the interface block.
    3. Extend the pattern-key builder to accept an optional `jointFeatures` argument and a `mode` override (default reads env). Return `{primaryKey, shadowKey?}`.
    4. **Bucketing the joint features**: each of the four continuous features is quantized into a coarse bucket BEFORE hashing into the key (otherwise the key cardinality explodes). Use 5 buckets each via fixed quantile breakpoints from the trailing 90d distribution — for the FIRST commit, use literature-default breakpoints (sentimentMomentumProduct: {-∞, -0.05, -0.01, 0.01, 0.05, +∞}; sentimentVolumeInteraction: {-∞, -2, -0.5, 0.5, 2, +∞}; deltaSentiment3d: {-∞, -0.3, -0.1, 0.1, 0.3, +∞}; sentimentDispersion: {0, 0.1, 0.2, 0.3, 0.4, +∞}). Document this in `HYPERPARAMETERS.md` and note that these will be calibrated empirically in a follow-up (out of scope for this plan).
    5. Hash buckets via a small stable hash (Bun or Node `crypto.createHash('sha1').update(...).digest('hex').slice(0,12)` — short hex for log readability).
    6. **New-bucket prior seeding**: when an observation falls into a joint-feature bucket that has never been seen, the calling code (cron/learn or wherever LearnedPattern rows are created) creates the row with α=1, β=1 (uniform). This is achieved by an additive code path — existing patterns are unchanged because their joint-feature bucket is the same (empty / `mode='off'`).
    7. Create the snapshot fixture in Task pre-step: before implementing the extension, run the CURRENT (pre-edit) `buildPatternKey()` for a fixed canonical input, capture the output string, write to `tests/fixtures/pattern-key-pre-20-C-05.json`. Then commit the fixture in this task. Test 4 reads from this fixture.
    8. Add to `HYPERPARAMETERS.md`: section "Joint-feature quantile breakpoints (20-C-05)" documenting the 4 break arrays with a "calibration: pending; see 20-C-05 roadmap" note.

    Create `tests/learning.joint-features-key.test.ts` with 8 tests above.
  </action>
  <acceptance_criteria>
    - File `src/lib/learning.ts` exports `getJointFeaturesMode` and `JointFeaturesMode`
    - File `tests/fixtures/pattern-key-pre-20-C-05.json` committed with the pre-edit golden output
    - `npx vitest run tests/learning.joint-features-key.test.ts` exits 0
    - `HYPERPARAMETERS.md` contains section "Joint-feature quantile breakpoints (20-C-05)"
    - Default flag is 'off': `grep -q "JOINT_FEATURES_MODE.*?? 'off'\|JOINT_FEATURES_MODE.*|| 'off'" src/lib/learning.ts`
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/learning.joint-features-key.test.ts && test -f tests/fixtures/pattern-key-pre-20-C-05.json && grep -q "Joint-feature quantile breakpoints" HYPERPARAMETERS.md</automated>
  </verify>
  <done>Flag + additive key extension + backward-compat snapshot all green; old patterns untouched</done>
</task>

<task type="auto" id="20-C-05-04">
  <name>Task 4: Implement scripts/ablate-joint-features.ts — CPCV per fold → paired bootstrap → verdict report</name>
  <files>scripts/ablate-joint-features.ts, package.json</files>
  <read_first>
    - src/lib/learning.ts (combinatorialPurgedKFold export from 19-A-04)
    - src/lib/sentiment/paired-bootstrap.ts (Task 2)
    - src/lib/sentiment/joint-features.ts (Task 1)
    - scripts/dsr-pbo-audit.ts (19-A-04 audit pattern — DB-read + write-to-config style)
  </read_first>
  <action>
    Create `scripts/ablate-joint-features.ts` exporting `runAblation(config: AblationConfig): Promise<AblationReport>` per interface block.

    Steps inside `runAblation`:

    1. **Load backfill data** (read-only DB transaction, IsolationLevel.ReadCommitted): pull `SentimentObservation` rows (from 20-Z-01) joined with forward-looking 5d/7d alpha-vs-SPY for the trailing `lookbackDays` window (default 365). Use `fetched_at` for PIT discipline (per 20-Z-07 lookahead test).

    2. **Construct two CPCV experiments** using `combinatorialPurgedKFold` from 19-A-04:
       - Experiment A — joint features: `buildPatternKey(..., mode='on')` (locally overridden via the `mode` arg — does NOT read env). Per-fold, fit a simple weighted-mean-by-bucket "model" (the same bucket→ev_alpha lookup that production uses) on train folds; score on test folds; compute fold Sharpe = mean(predicted_alpha × realized_alpha) / std(...).
       - Experiment B — sentiment-alone: `buildPatternKey(..., mode='off')` baseline. Same fold splits.
       - **Critical**: the two experiments use IDENTICAL fold indices (the same `combinatorialPurgedKFold(n=cpcvN, k=cpcvK, embargo=cpcvEmbargo, totalSamples=...)` call); only the bucketing differs. This makes the per-fold Sharpe arrays paired.

    3. **Call `pairedBlockBootstrapSharpeDiff`** with `seriesA = joint-feature Sharpe[]`, `seriesB = sentiment-alone Sharpe[]`, default `nResamples=1000`, default `blockSize=7`, seed from config.

    4. **Verdict logic**:
       - `verdict='uplift'` ⟺ `bootstrap.ci95Lower > 0`
       - `verdict='null'` ⟺ `bootstrap.ci95Upper < 0` (joint is worse; record explicitly)
       - `verdict='inconclusive'` ⟺ otherwise (CI straddles 0)

    5. **Decision logic (3-consecutive-month rule)**:
       - Read previous reports under `reports/joint-features-ablation-*.md` (parse frontmatter `verdict` field).
       - Count `rollingMonthsAgreeing` = number of consecutive most-recent monthly reports with `verdict='uplift'`, including THIS run.
       - `decision='promote_to_on'` ⟺ `rollingMonthsAgreeing >= 3 AND current verdict='uplift'`
       - `decision='remain_shadow'` ⟺ `verdict='uplift' AND rollingMonthsAgreeing < 3` OR `verdict='inconclusive'`
       - `decision='remain_off'` ⟺ `verdict='null'`
       - **The script itself does NOT mutate the JOINT_FEATURES_MODE env var**. It only emits the decision; flag mutation is a Vercel-side ops step (or a follow-up automation that reads the latest report — out of scope for this plan).

    6. **Write report** at `reports/joint-features-ablation-{YYYY-MM-DD}.md`:
       - Markdown with YAML frontmatter containing `verdict`, `decision`, `rollingMonthsAgreeing`, `observedDelta`, `ci95Lower`, `ci95Upper`, `blockSize=7`, `nResamples=1000`, `pValueTwoSided`, `config`.
       - Body has a one-paragraph narrative: "On {asOfDate}, joint-feature bundle showed {verdict}: observed Sharpe difference {observedDelta} with 95% CI [{lower}, {upper}]. Decision: {decision}." If `verdict='null'`, body explicitly states: "No uplift detected; joint features remain behind off-flag for future evaluation. This is a published null result per Phase 20 standard S1 (no hand-picked verdict)."

    7. **Multiple-testing assertion** (inside the script): assert at runtime that ONLY one Sharpe difference is reported (not four individual feature p-values). The report MUST NOT contain per-feature CI bounds.

    8. **CLI entry**: bottom of file, `if (require.main === module) { runAblation(defaultConfig).then(...) }`. Default config date = today (UTC midnight).

    9. Add to `package.json`:
       - `"ablate-joint-features": "tsx scripts/ablate-joint-features.ts"`

    Hint for implementer: re-use the `runAblation` core so the cron route (Task 5) imports and invokes it directly.
  </action>
  <acceptance_criteria>
    - File `scripts/ablate-joint-features.ts` exists with `runAblation` export
    - File reads `combinatorialPurgedKFold` from `src/lib/learning.ts` (assert via grep)
    - File reads `pairedBlockBootstrapSharpeDiff` from `src/lib/sentiment/paired-bootstrap.ts`
    - Default config has `nResamples=1000`, `blockSize=7`, `cpcvN=6`, `cpcvK=2`, `cpcvEmbargo=5`
    - `npm run ablate-joint-features` invokable (smoke-runnable; full execution may require DB seed — integration test in Task 6 handles fixture-based path)
    - `grep -q "ablate-joint-features" package.json`
  </acceptance_criteria>
  <verify>
    <automated>test -f scripts/ablate-joint-features.ts && grep -q "combinatorialPurgedKFold" scripts/ablate-joint-features.ts && grep -q "pairedBlockBootstrapSharpeDiff" scripts/ablate-joint-features.ts && grep -q "ablate-joint-features" package.json</automated>
  </verify>
  <done>Ablation script implemented; reuses 19-A-04 CPCV harness; emits markdown + frontmatter report</done>
</task>

<task type="auto" id="20-C-05-05">
  <name>Task 5: Monthly cron /api/cron/joint-feature-ablation + tests + vercel.json registration</name>
  <files>src/app/api/cron/joint-feature-ablation/route.ts, tests/cron-joint-feature-ablation.test.ts, vercel.json</files>
  <read_first>
    - vercel.json (existing crons — additive only; do not modify existing entries)
    - src/app/api/cron/sentiment-scan/route.ts or similar (existing cron pattern for Cipher)
    - scripts/ablate-joint-features.ts (Task 4)
  </read_first>
  <behavior>
    - Test 1: Cron route file exists at `src/app/api/cron/joint-feature-ablation/route.ts`
    - Test 2: Route requires `Authorization: Bearer ${CRON_SECRET}` header — unauth returns 401 (per skill:cron-jobs guidance)
    - Test 3: Route imports `runAblation` from `scripts/ablate-joint-features` and invokes it
    - Test 4: Route refuses to promote shadow→on after only 1 positive month — promotion gate test using a stubbed `runAblation` that returns `verdict='uplift', rollingMonthsAgreeing=1`. Route response body must contain `decision='remain_shadow'`.
    - Test 5: Route ALLOWS promotion after 3 positive months — stubbed `runAblation` returns `rollingMonthsAgreeing=3`. Response body contains `decision='promote_to_on'`.
    - Test 6: Route writes telemetry — runtime_ms is in response body; alert flag if > 200000ms (200s threshold for two-consecutive-run alarming per T-20-C-05-07; full alarming is downstream).
    - Test 7: `vercel.json` `crons` array contains exactly one new entry with `path='/api/cron/joint-feature-ablation'` and `schedule='0 6 1 * *'` (1st of each month at 06:00 UTC). Existing crons unchanged.
  </behavior>
  <action>
    1. Create `src/app/api/cron/joint-feature-ablation/route.ts`:
       ```typescript
       export const runtime = 'nodejs';
       export const maxDuration = 300;

       export async function GET(request: Request) {
         const auth = request.headers.get('authorization');
         if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
           return new Response('Unauthorized', { status: 401 });
         }
         const t0 = Date.now();
         const report = await runAblation(defaultConfig);
         const runtimeMs = Date.now() - t0;
         return Response.json({
           ok: true,
           verdict: report.verdict,
           decision: report.decision,
           rollingMonthsAgreeing: report.rollingMonthsAgreeing,
           reportPath: report.reportPath,
           runtimeMs,
         });
       }
       ```

    2. Add to `vercel.json` `crons` array (preserve existing entries):
       ```json
       { "path": "/api/cron/joint-feature-ablation", "schedule": "0 6 1 * *" }
       ```

    3. Create `tests/cron-joint-feature-ablation.test.ts` with 7 tests above. Mock `runAblation` via vitest `vi.mock` for the gate-logic tests.
  </action>
  <acceptance_criteria>
    - File `src/app/api/cron/joint-feature-ablation/route.ts` exists
    - Cron entry in `vercel.json` (assert via JSON parse + count)
    - Auth check present (`grep -q "CRON_SECRET" src/app/api/cron/joint-feature-ablation/route.ts`)
    - `npx vitest run tests/cron-joint-feature-ablation.test.ts` exits 0
    - Existing cron paths in vercel.json unchanged (snapshot test or pre-edit count)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/cron-joint-feature-ablation.test.ts && node -e "const v = require('./vercel.json'); const found = v.crons.filter(c => c.path === '/api/cron/joint-feature-ablation'); if (found.length !== 1 || found[0].schedule !== '0 6 1 * *') process.exit(1);"</automated>
  </verify>
  <done>Monthly cron live behind CRON_SECRET; 3-month promotion gate enforced in test; vercel.json additively patched</done>
</task>

<task type="auto" id="20-C-05-06">
  <name>Task 6: End-to-end integration test on 90d fixture (deterministic seed)</name>
  <files>tests/ablate-joint-features.integration.test.ts</files>
  <read_first>
    - tests/ (existing integration test patterns; .integration.test.ts naming convention)
    - src/lib/sentiment/joint-features.ts, paired-bootstrap.ts (Tasks 1-2)
    - scripts/ablate-joint-features.ts (Task 4)
  </read_first>
  <action>
    Create `tests/ablate-joint-features.integration.test.ts`. Construct a synthetic 90-day fixture:
    - 200 tickers × 90 days of (sentiment, returns_5d, volume_zscore, dispersion, realized_7d_alpha) rows.
    - Two scenarios:
      - **Scenario A (designed uplift)**: realized_alpha is correlated with `sentimentMomentumProduct` (correlation ρ=0.15). Expected: with sufficient sample, `verdict='uplift'` and `ci95Lower > 0`.
      - **Scenario B (null)**: realized_alpha is iid Gaussian, uncorrelated with any feature. Expected: `verdict='null' or 'inconclusive'`; `ci95Lower <= 0`.

    Tests:
    - Test 1: With Scenario A fixture + fixed seed=20260510, `runAblation` returns `verdict='uplift'` AND `bootstrap.ci95Lower > 0`
    - Test 2: With Scenario B fixture + same seed, `verdict !== 'uplift'`
    - Test 3: Determinism — running Scenario A twice with same seed produces byte-identical `bootstrap.bootstrapDeltas`
    - Test 4: `bootstrap.nResamples === 1000` and `bootstrap.blockSize === 7` (literal assertions surface in the report)
    - Test 5: Report file gets written to `reports/joint-features-ablation-{date}.md` and contains YAML frontmatter with all required fields (`verdict`, `decision`, `ci95Lower`, `ci95Upper`, `blockSize`, `nResamples`)
    - Test 6: Multiple-testing guard — `report` body does NOT contain per-feature p-values (regex check: no `sentimentMomentumProduct.*p ?= ?\d` etc.)
    - Test 7: Report content for null case includes the literal string "No uplift detected" and "null result"

    To avoid hitting the DB, the integration test injects fixture data via a `dataSourceOverride` arg on `runAblation` (add this arg to the AblationConfig — it's a Map<string, ...> or an inline array; default undefined means "use DB").

    Tests use `tmpdir()` for the reports output directory to avoid polluting the real `reports/` folder during CI; the test asserts report content from the tmpdir path.
  </action>
  <acceptance_criteria>
    - File `tests/ablate-joint-features.integration.test.ts` exists with ≥7 tests
    - All tests deterministic (same-seed runs are byte-identical)
    - `npx vitest run tests/ablate-joint-features.integration.test.ts` exits 0
    - Scenario A actually produces uplift verdict (validates the script's verdict logic end-to-end)
    - Scenario B does NOT produce uplift verdict (validates the null-result branch is exercised in test)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/ablate-joint-features.integration.test.ts</automated>
  </verify>
  <done>Deterministic end-to-end ablation test green; uplift + null branches both exercised; multiple-testing guard verified</done>
</task>

<task type="auto" id="20-C-05-07">
  <name>Task 7: Commit reports directory placeholder + first run + final commit</name>
  <files>reports/.gitkeep</files>
  <action>
    1. Create `reports/.gitkeep` if not already present (so the directory exists in git).
    2. Optionally run `npm run ablate-joint-features` against the synthetic fixture path to produce the FIRST committed report (`reports/joint-features-ablation-2026-05-11.md`). If DB seed is unavailable in dev, skip this step — the integration test (Task 6) already validates report generation; the first real cron run on the 1st of next month produces the first production report.
    3. Run full test suite: `npm test`.
    4. Commit:
       ```
       feat(20-c-05): joint feature ablation — paired block-bootstrap CI gate

       Adds four derived features (sentiment × |returns_5d|, sentiment × volume_zscore,
       Δsentiment_3d, sentiment_dispersion) to the Diffusion Engine pattern key behind
       JOINT_FEATURES_MODE flag (default 'off').

       Ablation methodology:
       - Reuses 19-A-04 CPCV harness (combinatorialPurgedKFold) — no re-implementation
       - Paired block-bootstrap on Sharpe difference, 1000 resamples (literal), block size = 7 days
       - 95% CI via percentile method; cutover gate = CI lower-bound > 0
       - 3-consecutive-months-agreeing required before shadow → on
       - Monthly cron at /api/cron/joint-feature-ablation (1st of each month, 06:00 UTC)

       Multiple-testing controlled by reporting ONE joint-vs-alone Sharpe difference,
       not per-feature p-values (T-20-C-05-01).

       Null-result branch: when CI lower-bound ≤ 0, ablation report is committed with
       "no uplift detected" verdict; flag remains 'off'; experiment documented per
       Phase 20 standard S1.

       Backward-compatible: with mode='off' (default), pattern keys are byte-identical
       to pre-plan output (snapshot-tested via tests/fixtures/pattern-key-pre-20-C-05.json).

       Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
       ```
  </action>
  <acceptance_criteria>
    - `reports/.gitkeep` exists
    - `npm test` exits 0 (all units + integration green)
    - JOINT_FEATURES_MODE defaults to 'off' on merge (no env var set in `.env.example` for production)
    - Commit message contains "20-c-05" and references "1000 resamples" + "block size = 7"
    - Vercel.json cron entry added without modifying existing entries
  </acceptance_criteria>
  <verify>
    <automated>npm test && test -f reports/.gitkeep && git log -1 --pretty=%s | grep -q "20-c-05"</automated>
  </verify>
  <done>Full suite green; reports directory committed; flag at 'off'; ablation cron registered</done>
</task>

</tasks>

<verification>
- [ ] All 4 derived features are pure functions (no DB / no time / no random) — Task 1
- [ ] Paired bootstrap defaults `nResamples=1000` and `blockSize=7` are literal in source — Task 2 grep
- [ ] CPCV harness from 19-A-04 imported, not re-implemented — Task 4 grep
- [ ] Pattern-key backward compatibility verified via golden-master snapshot — Task 3 (test 4)
- [ ] Promotion gate requires 3 consecutive months of CI lower-bound > 0 — Task 5 (test 4-5)
- [ ] Null-result branch produces explicit "no uplift detected" report — Task 6 (test 7)
- [ ] Multiple-testing controlled: one Sharpe difference reported, not four — Task 6 (test 6)
- [ ] Block size = 7 documented per T-20-C-05-03 (Politis-Romano stationary block bootstrap)
- [ ] Monthly cron registered in vercel.json with Bearer CRON_SECRET auth — Task 5
- [ ] LearnedPattern existing rows untouched when mode='off' (default) — Task 3
- [ ] `npm test` green
- [ ] `npm run ablate-joint-features` invokable
</verification>

<success_criteria>
1. Hypothesis testable: ablation script produces a single, numeric verdict (CI lower-bound > 0?) — no subjective interpretation.
2. Paired block-bootstrap with 1000 resamples (literal) and 7-day blocks (literal) — autocorrelation-aware.
3. Cutover requires 3 consecutive monthly runs agreeing — robust against single-month noise.
4. Null result is a first-class outcome: explicitly published report, flag stays 'off', code retained for future evaluation. No hand-waving.
5. CPCV harness from 19-A-04 is reused (single-source-of-truth) — this plan does not re-implement purging.
6. Backward compatibility guaranteed via golden-master snapshot of pattern-key output.
7. Multiple-testing inflation mitigated: one joint-bundle vs sentiment-alone test, not four per-feature tests.
</success_criteria>

<output>
Create `.planning/phases/20-real-sentiment-analysis/20-C-05-SUMMARY.md` documenting:
- Final ablation script + cron path
- First committed report verdict (if Task 7 step 2 executed) OR "first production report due on 1st of next month"
- Confirmation that pattern-key backward-compatibility snapshot is committed
- Confirmation that JOINT_FEATURES_MODE = 'off' is the merge state
- Sample report frontmatter showing required fields (verdict, decision, ci95Lower, ci95Upper, blockSize=7, nResamples=1000)
</output>
