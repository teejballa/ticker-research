---
phase: 20
plan: 20-C-04
wave: C
type: execute
depends_on: [20-A-02, 20-A-04]
files_modified:
  - prisma/schema.prisma
  - src/lib/sentiment/pump-dump-detector.ts
  - src/lib/sentiment/aggregator.ts
  - src/lib/types.ts
  - src/lib/features.ts
  - scripts/eval-pump-dump-synthetic.ts
  - src/app/api/cron/eval-pump-dump-synthetic/route.ts
  - vercel.json
  - src/components/ResearchReport.tsx
  - tests/sentiment-pump-dump-detector.unit.test.ts
  - tests/integration/sentiment-pump-dump.integration.test.ts
  - tests/playwright/research-manipulation-banner.spec.ts
  - docs/cards/MODEL-CARD-pump-dump-detector.md
  - HYPERPARAMETERS.md
  - package.json
autonomous: true
requirements: []
shadow_required: true
shadow_skip_reason: ""
hard_cleanup_gate: true
must_haves:
  truths:
    - "isPumpAndDumpPattern(features, thresholds) returns true ONLY when ALL 5 conditions are simultaneously satisfied — mention_z > 5 AND bull_pct > 95 AND gini > 0.7 AND mean_account_age_days < 90 AND cap_class ∈ {small_cap} (Cipher enum covers spec's {micro, small})"
    - "detectManipulation returns { is_warning, matched_rules, rule_version } where matched_rules enumerates which of the 5 sub-conditions individually fired (for telemetry / explainability)"
    - "ManipulationWarning Prisma table persists EVERY detector invocation (not just fires) — { id, ticker, computed_at, mention_z, bull_pct, gini, mean_account_age_days, cap_class, is_warning_fired, matched_rules, rule_version } — insert-only, PIT-invariant via computed_at, 90d retention deferred to Phase 27"
    - "Synthetic eval scripts/eval-pump-dump-synthetic.ts generates 500 P&D-shaped + 500 background events with matched cap_class distribution, runs detector, computes F1 + sensitivity + specificity vs ground-truth labels"
    - "Synthetic eval is REPRODUCIBLE: fixed RNG seed (default 20260511) — two consecutive runs produce IDENTICAL F1 to 4 decimal places; eval exits 0 iff F1 ≥ 0.6 AND specificity ≥ 0.95 — non-zero otherwise (CI gate)"
    - "Weekly cron /api/cron/eval-pump-dump-synthetic re-runs eval; persists results to reports/pump-dump-eval-{YYYY-MM-DD}.json; wall-clock < 2 minutes"
    - "Aggregator consumes existing features (mention_z from 20-A-02 baseline; gini from 20-A-04 computeAuthorConcentration; mean_account_age_days from SentimentObservation.author_features_snapshot from 20-Z-01) — does NOT recompute them"
    - "SentimentIntelligenceSection carries new optional field manipulation_warning?: { is_warning, matched_rules, rule_version } | null (null when FEATURE_PUMP_DUMP_DETECTOR off OR cap_class out of scope OR upstream features null)"
    - "UI banner renders ONLY when manipulation_warning.is_warning === true AND FEATURE_PUMP_DUMP_DETECTOR_UI === 'on' — explicit red bar at TOP of research report with non-advisory framing: 'Possible market manipulation pattern detected (Nam/Yang 2023). This warning does NOT constitute investment advice.' + link to /docs/model-cards/pump-dump-detector"
    - "Banner has explicit dismissal affordance (X button) suppressing for 24h via localStorage key pump_dump_dismissed:{ticker}:{YYYY-MM-DD}; auto-clears after 24h per CONTEXT.md spec line 127"
    - "Banner uses role='alert' + aria-live='polite' (accessibility) AND banner subtree contains ZERO occurrences of substrings ['buy','sell','advise','recommend','should'] (regulatory hygiene — T-20-C-04-01)"
    - "Shadow → on cutover is TWO independent gates: (1) F1 ≥ 0.6 on synthetic eval AND (2) 0 production false-positive fires across ≥30d of FEATURE_PUMP_DUMP_DETECTOR=shadow (operator reviews every is_warning_fired=true row via /insights surveillance table per 20-Z-03)"
    - "Five canonical boundary unit tests verify strict-greater/strict-less semantics: mention_z=5.0 exact → false; bull_pct=95.0 exact → false; gini=0.7 exact → false; mean_account_age_days=90.0 exact → false; cap_class='mid_cap'|'large_cap'|'unknown' → false"
    - "Integration test seeds synthetic P&D-shaped fixture via SentimentObservation rows → aggregator → ManipulationWarning row persisted with all feature snapshot fields populated; rule_version matches RULE_VERSION constant"
    - "Playwright e2e: banner renders + non-advisory text exact-match + dismissal toggles localStorage + role=alert/aria-live=polite + NO banner when is_warning=false"
    - "Model card docs/cards/MODEL-CARD-pump-dump-detector.md cites Nam/Yang 2023 F1=0.67 baseline (sensitivity 85% / specificity 99%) AND our measured F1; documents synthetic-vs-real distribution gap citing CONTEXT.md operator-defer (line 177)"
    - "HYPERPARAMETERS.md Phase 20-C-04 section enumerates the 5 thresholds + RULE_VERSION + 24h banner-suppress + cap_class enum mapping note (small_cap covers spec {micro, small} for Cipher's current 4-class enum)"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "ManipulationWarning model — 11 columns, 2 composite indexes, PIT-invariant, insert-only semantics"
      contains: "model ManipulationWarning"
    - path: "src/lib/sentiment/pump-dump-detector.ts"
      provides: "Pure-math: PUMP_DUMP_THRESHOLDS + RULE_VERSION + isPumpAndDumpPattern + detectManipulation + PumpDumpFeatures + PumpDumpThresholds + DetectorResult"
      contains: "export function isPumpAndDumpPattern"
    - path: "src/lib/sentiment/aggregator.ts"
      provides: "computeManipulationWarning — reads mean_account_age_days from SentimentObservation via fetched_at, consumes mention_z + gini from caller args, invokes detectManipulation, writes ManipulationWarning row, returns block. Gated by FEATURE_PUMP_DUMP_DETECTOR"
      contains: "computeManipulationWarning"
    - path: "src/lib/types.ts"
      provides: "SentimentIntelligenceSection.manipulation_warning?: { is_warning, matched_rules, rule_version } | null"
      contains: "manipulation_warning"
    - path: "src/lib/features.ts"
      provides: "FEATURE_PUMP_DUMP_DETECTOR + FEATURE_PUMP_DUMP_DETECTOR_UI (off|shadow|on)"
      contains: "FEATURE_PUMP_DUMP_DETECTOR"
    - path: "scripts/eval-pump-dump-synthetic.ts"
      provides: "Fixed-seed reproducible eval — 500 P&D + 500 background events, computes F1/sensitivity/specificity, writes reports/pump-dump-eval-{date}.json, exits non-zero when F1 < 0.6 OR specificity < 0.95"
      contains: "F1"
    - path: "src/app/api/cron/eval-pump-dump-synthetic/route.ts"
      provides: "Weekly cron — invokes runSyntheticEval, returns F1 + status; max 120s budget"
      contains: "Bearer ${process.env.CRON_SECRET}"
    - path: "vercel.json"
      provides: "Cron entry { path: /api/cron/eval-pump-dump-synthetic, schedule: 0 9 * * 2 } — Tuesdays 09:00 UTC (staggered against other Phase 20 weekly crons)"
      contains: "eval-pump-dump-synthetic"
    - path: "src/components/ResearchReport.tsx"
      provides: "ManipulationWarningBanner — top-of-report red banner, non-advisory copy, dismissal affordance, 24h localStorage suppress, model-card link, role=alert + aria-live=polite; gated by FEATURE_PUMP_DUMP_DETECTOR_UI"
      contains: "Possible market manipulation pattern detected"
    - path: "tests/sentiment-pump-dump-detector.unit.test.ts"
      provides: "≥14 cases: canonical all-trigger, 5 strict-greater/less boundaries, 3 cap_class out-of-scope, 3 null-input cases, matched_rules content, threshold injection, RULE_VERSION echo"
    - path: "tests/integration/sentiment-pump-dump.integration.test.ts"
      provides: "Live-Neon: synthetic P&D fixture via SentimentObservation seeds → computeManipulationWarning → ManipulationWarning row written + SentimentIntelligenceSection.manipulation_warning populated; ≥3 cases including non-firing telemetry row"
    - path: "tests/playwright/research-manipulation-banner.spec.ts"
      provides: "Banner renders under FEATURE_PUMP_DUMP_DETECTOR_UI=on; exact non-advisory text; role=alert + aria-live=polite; dismissal toggles localStorage; NO banner when is_warning=false; zero forbidden-substring occurrences in banner subtree"
    - path: "docs/cards/MODEL-CARD-pump-dump-detector.md"
      provides: "Mitchell 2019 model card — Nam/Yang 2023 baseline (F1=0.67, sens 85% / spec 99%) + our measured F1 + known failure modes (synthetic-vs-real gap, threshold gameability, self-fulfilling-prophecy risk, coordinated-bot evasion)"
      contains: "Nam"
    - path: "HYPERPARAMETERS.md"
      provides: "Phase 20-C-04 section — 5 thresholds + RULE_VERSION + 24h banner-suppress + cap_class enum mapping note + Nam/Yang citation"
    - path: "package.json"
      provides: "npm script 'eval:pump-dump-synthetic' wiring scripts/eval-pump-dump-synthetic.ts via tsx"
      contains: "eval:pump-dump-synthetic"
  key_links:
    - from: "src/lib/sentiment/aggregator.ts computeManipulationWarning"
      to: "src/lib/sentiment/pump-dump-detector.ts detectManipulation + PUMP_DUMP_THRESHOLDS + RULE_VERSION"
      via: "named import; predicate is pure-math, no DB inside detector module"
      pattern: "from ['\"]\\./pump-dump-detector['\"]"
    - from: "src/lib/sentiment/aggregator.ts computeManipulationWarning args"
      to: "20-A-02 src/lib/sentiment/baseline.ts mentionZScore output"
      via: "caller passes pre-computed mention_z into args; NEVER recomputed here"
      pattern: "args.mention_z|mention_z:"
    - from: "src/lib/sentiment/aggregator.ts computeManipulationWarning args"
      to: "20-A-04 src/lib/sentiment/aggregator.ts computeAuthorConcentration gini output"
      via: "caller passes pre-computed gini into args; NEVER recomputed here"
      pattern: "args.gini|gini:"
    - from: "src/lib/sentiment/aggregator.ts computeManipulationWarning"
      to: "prisma.sentimentObservation findMany — reads author_features_snapshot.account_age_days from 20-Z-01"
      via: "PIT-safe query on fetched_at >= now() - 24h (S2)"
      pattern: "fetched_at"
    - from: "src/lib/sentiment/aggregator.ts computeManipulationWarning"
      to: "prisma.manipulationWarning.create"
      via: "INSERT-only; every detector invocation persists telemetry row (not just fires)"
      pattern: "manipulationWarning\\.create"
    - from: "src/components/ResearchReport.tsx ManipulationWarningBanner"
      to: "sentiment_intelligence.manipulation_warning"
      via: "Top-of-report banner gated by FEATURE_PUMP_DUMP_DETECTOR_UI === 'on' AND manipulation_warning?.is_warning === true"
      pattern: "manipulation_warning"
    - from: "scripts/eval-pump-dump-synthetic.ts"
      to: "src/lib/sentiment/pump-dump-detector.ts isPumpAndDumpPattern"
      via: "Imports predicate directly — eval calls the SAME function the aggregator does (no separate implementation)"
      pattern: "isPumpAndDumpPattern"
    - from: "src/app/api/cron/eval-pump-dump-synthetic/route.ts"
      to: "scripts/eval-pump-dump-synthetic.ts runSyntheticEval"
      via: "Cron route imports + invokes the exported async function"
      pattern: "runSyntheticEval"
---

# Plan 20-C-04: Pump-and-dump cluster detection (Nam/Yang 2023 baseline)

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for ONE blocking step: the `npx prisma db push` against live Neon to add the `ManipulationWarning` model (Task 3). All other tasks are autonomous. After the push lands, the remaining tasks (detector module, eval harness, aggregator wiring, cron, UI banner, model card, tests, commit) proceed without further prompts.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:

1. **Shadow lifecycle graduated TWO-GATE**:
   - Gate 1: F1 ≥ 0.6 on synthetic eval (`npm run eval:pump-dump-synthetic` exits 0).
   - Gate 2: ≥30d of `FEATURE_PUMP_DUMP_DETECTOR=shadow` in production with 0 false-positive fires (operator reviews every `ManipulationWarning` row where `is_warning_fired=true` via `/insights` surveillance table per 20-Z-03; FP count must be 0 before cutover).
   - Cutover: `FEATURE_PUMP_DUMP_DETECTOR=on`; the UI flag `FEATURE_PUMP_DUMP_DETECTOR_UI=on` flipped in a SEPARATE follow-up commit (CONTEXT.md S3 — separate UI rollout).
2. **No legacy code deleted** — there is no prior P&D detector to remove; this is a new module. Cleanup gate = the shadow→on graduation only.
3. `npm test` (Vitest unit), `npm run test:integration` (live-Neon), `npm run test:e2e` (Playwright), `npm run eval:pump-dump-synthetic` (synthetic eval) all green on `main` post-commit.
4. **Schema Push Gate**: `npx prisma db push` succeeded against the live `DATABASE_URL` AND the integration test writes ≥1 `ManipulationWarning` row.
5. **Model card gate**: `docs/cards/MODEL-CARD-pump-dump-detector.md` exists; `scripts/check-model-cards.ts` (from 20-Z-02 when shipped) exits 0 for the pump-dump artifact.
6. **Synthetic-eval reproducibility gate**: running `npm run eval:pump-dump-synthetic` twice produces identical F1 to 4 decimal places (fixed RNG seed verified).

## Cross-cutting standards adherence (CONTEXT.md §S1, S4, S7, S8, S10)

- **S1 (no hand-picked parameters)** — The 5 thresholds (mention_z=5, bull_pct=95, gini=0.7, age=90d, cap_class set) are cited from CONTEXT.md spec line 127, which itself cites Nam/Yang 2023 F1=0.67 / sensitivity 85% / specificity 99%. RULE_VERSION constant bumps on every threshold change so historical ManipulationWarning rows remain attributable. Quarterly operator-driven threshold review documented in the model card. The cap_class enum mapping (spec says "micro, small" — Cipher's enum has only `small_cap` covering both) is documented explicitly in HYPERPARAMETERS.md so it is a CITED choice, not a silent override.
- **S4 (model card)** — `docs/cards/MODEL-CARD-pump-dump-detector.md` per Mitchell 2019: cites Nam/Yang baseline AND our measured F1 (auto-fed from latest eval); documents synthetic-vs-real gap; documents the operator-deferred NASDAQ surveillance-feed limitation explicitly (CONTEXT.md line 177).
- **S7 (threat model)** — Five plan-level threats T-20-C-04-{01..05} below. Maps to phase catalog T-28-001 (manipulation), T-28-008 (crowded consensus mistaken for thesis), T-28-011 (filter false positives).
- **S8 (numerical acceptance)** — every gate is a numerical command: F1 threshold, exit codes, row counts, grep counts, ε-tolerance assertions. Zero adjectives.
- **S10 (regulatory hygiene)** — Banner uses explicit non-advisory framing ("does NOT constitute investment advice"); banner subtree contains zero `buy/sell/advise/recommend/should` substrings (assertion-tested in Playwright); links to public model card; dismissal affordance prevents forced UX; auto-clears after 24h.

## Forward / backward references

- **Depends on 20-A-02**: Consumes `mention_z` from `src/lib/sentiment/baseline.ts getBaselineForTicker + mentionZScore`. Does NOT recompute. When 20-A-02 returns null baseline (sparse ticker), this detector returns false (no fire).
- **Depends on 20-A-04**: Consumes `gini_coefficient` from `src/lib/sentiment/aggregator.ts computeAuthorConcentration`. Does NOT recompute. When 20-A-04 returns null (n_authors<5), this detector returns false.
- **Soft-references 20-Z-01**: Reads `SentimentObservation.author_features_snapshot.account_age_days` (PII-safe allowlist from 20-Z-01 — `account_age_days` is on the allowlist; raw handle is NOT).
- **Soft-references 20-C-03** (sibling parallel plan in Wave C): 20-C-03 (MinHash bot filter) operates at the message/author level; this plan (20-C-04) operates at the macro/ticker level (24h aggregate). Defense-in-depth per T-20-C-04-05 — NOT duplicates. Wave C plans run in parallel; no cross-imports.

</universal_preamble>

<objective>
Detect coarse-grained pump-and-dump patterns at the 24h-window-per-ticker level by composing existing Phase 20 features (mention_z from 20-A-02, gini from 20-A-04, mean_account_age from 20-Z-01) through a literal 5-condition AND-predicate cited from Nam/Yang 2023. When all 5 conditions fire simultaneously on a small-cap ticker, persist a `ManipulationWarning` row and surface an explicit, non-advisory UI banner at the top of the research report.

Purpose: Address CONTEXT.md catalog threats T-28-001 (manipulation) and T-28-008 (crowded consensus mistaken for thesis). 20-A-01 (dispersion / crowded_consensus) handles the soft warning. 20-C-04 handles the explicit hard warning: a measurable, citable, AND-gated pattern that matches confirmed P&D events at literature-baseline F1. The AND-gate of 5 conditions is what gives Nam/Yang 2023 its 99% specificity — false positives on legitimate news spikes are the primary risk, and the AND-gate is the mitigation.

Output:
- 1 new pure-math detector module (~80 LOC: PUMP_DUMP_THRESHOLDS + RULE_VERSION + isPumpAndDumpPattern + detectManipulation)
- 1 new Prisma model (`ManipulationWarning`) + 2 composite indexes, additive
- 1 aggregator extension (gated by FEATURE_PUMP_DUMP_DETECTOR) that composes existing 20-A-02 / 20-A-04 / 20-Z-01 feature outputs, runs detector, persists telemetry row, surfaces block on SentimentIntelligenceSection
- 1 synthetic eval harness with fixed-seed reproducibility (~250 LOC) — generates labeled P&D + background events, computes F1, exits non-zero when F1 < 0.6 OR specificity < 0.95
- 1 weekly Vercel Cron route invoking the eval; 2-min wall-clock budget
- 1 UI banner component (top-of-report, red, dismissible, 24h localStorage suppress, model-card link, role=alert + aria-live=polite)
- 1 unit test file (≥14 cases: canonical, 5 strict-greater/less boundaries, cap_class enum coverage, null-input cases, matched_rules content, threshold injection, RULE_VERSION echo)
- 1 live-Neon integration test (synthetic fixture → aggregator → ManipulationWarning row → SentimentIntelligenceSection)
- 1 Playwright spec (banner render + exact non-advisory copy + dismissal + accessibility + zero forbidden substrings)
- 1 model card with Nam/Yang baseline + measured F1
- HYPERPARAMETERS.md entries for the 5 thresholds + RULE_VERSION + banner-suppress + cap_class mapping note
- `npm run eval:pump-dump-synthetic` script entry in package.json
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-A-02-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-A-04-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@prisma/schema.prisma
@src/lib/sentiment/aggregator.ts
@src/lib/types.ts
@src/lib/diffusion-trace.ts
@src/lib/db.ts
@src/components/ResearchReport.tsx
@vercel.json
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md

<interfaces>

```typescript
// src/lib/sentiment/pump-dump-detector.ts — NEW (pure math, no Prisma)

import type { CapClass } from '@/lib/diffusion-trace';

/** Rule version — BUMP whenever PUMP_DUMP_THRESHOLDS changes so historical
 *  ManipulationWarning rows remain attributable to the threshold set in force
 *  at write-time. Format: `pdd-v{major}.{minor}`. */
export const RULE_VERSION = 'pdd-v1.0' as const;

/** Thresholds from Nam/Yang 2023 + CONTEXT.md §20-C-04 line 127.
 *  NOT hand-set — these are the literature defaults; quarterly review
 *  is operator-driven per T-20-C-04-02. */
export interface PumpDumpThresholds {
  mention_z_min: number;         // 5
  bull_pct_min: number;          // 95
  gini_min: number;              // 0.7
  account_age_max_days: number;  // 90
  cap_class_set: ReadonlySet<CapClass>; // {'small_cap'} — covers spec's {micro,small} (HYPERPARAMETERS.md)
}

export const PUMP_DUMP_THRESHOLDS: PumpDumpThresholds = {
  mention_z_min: 5,
  bull_pct_min: 95,
  gini_min: 0.7,
  account_age_max_days: 90,
  cap_class_set: new Set<CapClass>(['small_cap']),
};

/** Feature snapshot at detection time. */
export interface PumpDumpFeatures {
  mention_z: number | null;             // from 20-A-02
  bull_pct: number;                     // from existing aggregator (0-100)
  gini: number | null;                  // from 20-A-04
  mean_account_age_days: number | null; // from 20-Z-01 author_features_snapshot
  cap_class: CapClass;                  // from diffusion-trace
}

/**
 * Pure 5-condition AND-gate predicate. Returns false when ANY input is null
 * (insufficient data → no warning, NEVER a default-on fire).
 *
 *   return f.mention_z > t.mention_z_min            // 5
 *       && f.bull_pct > t.bull_pct_min              // 95
 *       && f.gini > t.gini_min                      // 0.7
 *       && f.mean_account_age_days < t.account_age_max_days  // 90
 *       && t.cap_class_set.has(f.cap_class);
 */
export function isPumpAndDumpPattern(
  f: PumpDumpFeatures,
  thresholds?: PumpDumpThresholds,
): boolean;

export interface DetectorResult {
  is_warning: boolean;
  matched_rules: string[];  // subset of: ['account_age','bull_pct','cap_class','gini','mention_z'] (sorted)
  rule_version: string;
}
export function detectManipulation(
  features: PumpDumpFeatures,
  thresholds?: PumpDumpThresholds,
): DetectorResult;
```

```prisma
// prisma/schema.prisma — NEW model

// ─── Phase 20-C-04 — Pump-and-dump cluster detection (Nam/Yang 2023) ───
// Every detector invocation (NOT just fires) persists a telemetry row so
// operators can review FP rate during the 30d shadow gate.
// Insert-only; 90d retention via Phase 27.
model ManipulationWarning {
  id                    String   @id @default(uuid())
  ticker                String
  // PIT-INVARIANT — readers MUST use computed_at to align with the snapshot
  // of upstream features (mention_z, gini) that produced this row.
  computed_at           DateTime @default(now()) @db.Timestamptz
  mention_z             Float?
  bull_pct              Float
  gini                  Float?
  mean_account_age_days Float?
  cap_class             String
  is_warning_fired      Boolean
  matched_rules         String[]
  rule_version          String

  @@index([ticker, computed_at(sort: Desc)], map: "idx_manipwarn_ticker_computed_at")
  @@index([is_warning_fired, computed_at(sort: Desc)], map: "idx_manipwarn_fired_computed_at")
  @@map("manipulation_warnings")
}
```

```typescript
// src/lib/types.ts — extension to SentimentIntelligenceSection

export interface SentimentIntelligenceSection extends SourceSection {
  // ... existing fields unchanged ...
  // ─── Phase 20-C-04 — pump-and-dump detector ───
  manipulation_warning?: {
    is_warning: boolean;
    matched_rules: string[];
    rule_version: string;
  } | null;
}
```

```typescript
// src/lib/features.ts — additions

export const FEATURE_PUMP_DUMP_DETECTOR: 'off' | 'shadow' | 'on' =
  (process.env.FEATURE_PUMP_DUMP_DETECTOR as 'off' | 'shadow' | 'on') ?? 'shadow';
export const FEATURE_PUMP_DUMP_DETECTOR_UI: 'off' | 'shadow' | 'on' =
  (process.env.FEATURE_PUMP_DUMP_DETECTOR_UI as 'off' | 'shadow' | 'on') ?? 'off';
```

```typescript
// src/lib/sentiment/aggregator.ts — addition

export interface ManipulationWarningBlock {
  is_warning: boolean;
  matched_rules: string[];
  rule_version: string;
}
/**
 * Compose existing 20-A-02 mention_z + 20-A-04 gini + 20-Z-01 author age +
 * cap_class into PumpDumpFeatures, run detectManipulation, persist
 * ManipulationWarning row (every invocation — not just fires), return block.
 *
 * Returns null when FEATURE_PUMP_DUMP_DETECTOR === 'off'.
 * Returns { is_warning: false, matched_rules: [], rule_version } when
 * cap_class is not in scope (large/mid/unknown — early exit, NO DB write).
 */
export async function computeManipulationWarning(args: {
  ticker: string;
  cap_class: CapClass;
  bull_pct: number;
  mention_z: number | null;     // from 20-A-02 caller
  gini: number | null;          // from 20-A-04 caller
  now?: Date;
}): Promise<ManipulationWarningBlock | null>;
```

```typescript
// scripts/eval-pump-dump-synthetic.ts — NEW

/**
 * Synthetic eval — reproducible via fixed RNG seed.
 *   - 500 P&D-shaped events: mention_z ∈ U(5.5, 12), bull_pct ∈ U(96, 99.9),
 *     gini ∈ U(0.75, 0.95), mean_account_age ∈ U(15, 85), cap_class='small_cap'.
 *   - 500 background events: distributions overlap on individual features
 *     (so any single feature alone has FP rate >> 0%) but the AND-gate keeps
 *     overall FP low. Cap_class distribution matches Cipher production snapshot.
 *   - Computes F1, sensitivity (TP/(TP+FN)), specificity (TN/(TN+FP)).
 *   - Exit 0 iff F1 ≥ 0.6 AND specificity ≥ 0.95.
 *   - Persists reports/pump-dump-eval-{YYYY-MM-DD}.json.
 */
export interface EvalResult {
  seed: number;
  n_pd_events: number;
  n_background_events: number;
  tp: number; fp: number; tn: number; fn: number;
  precision: number; recall: number; f1: number;
  sensitivity: number; specificity: number;
  rule_version: string;
  generated_at: string; // ISO
}
export async function runSyntheticEval(opts?: {
  seed?: number;          // default 20260511
  n_per_class?: number;   // default 500
  outDir?: string;        // default 'reports'
}): Promise<EvalResult>;
```

```typescript
// src/app/api/cron/eval-pump-dump-synthetic/route.ts — NEW

import { runSyntheticEval } from '@/../scripts/eval-pump-dump-synthetic';
export const runtime = 'nodejs';
export const maxDuration = 120; // 2-min budget
export async function GET(request: Request): Promise<Response>;
// Returns: { f1, sensitivity, specificity, ms_elapsed, status: 'ok' | 'regression' | 'error' }
```

</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Aggregator → ManipulationWarning Prisma write | Every detector invocation persists a telemetry row — concurrent ticker analyses must not corrupt the stream |
| Aggregator → SentimentIntelligenceSection → ResearchReport UI banner | Banner is user-visible at top of report; misleading text or absent disclaimer creates regulatory exposure |
| Synthetic eval → ground truth labels | Synthetic distribution ≠ real-world; F1 on synthetic is a lower-bound proxy — model card MUST document this |
| User → banner dismissal → localStorage | Dismissal state per-(ticker, date) to prevent stale dismissals carrying across regimes |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-C-04-01 | Information disclosure / regulatory | UI banner could be read as personalized investment advice | mitigate | Banner copy FIXED and reviewed: "Possible market manipulation pattern detected (Nam/Yang 2023). This warning does NOT constitute investment advice." NO buy/sell/hold language. Link to model card. Playwright spec asserts exact copy AND asserts ZERO occurrences of substrings ['buy','sell','advise','recommend','should'] in the banner subtree via `page.locator('[data-banner="manipulation-warning"]').innerText()`. Maps to phase catalog T-28-008 + S10 regulatory hygiene. |
| T-20-C-04-02 | Tampering / threshold gameability | Manipulator stops at mention_z=4.9 / bull_pct=94.9 to evade detector | mitigate | Defense in depth: (a) thresholds NOT user-visible — UI renders only binary is_warning, never the raw mention_z value; (b) operator-driven quarterly threshold review documented in model card §8; (c) RULE_VERSION constant captures the threshold set so historical rows remain attributable when thresholds ratchet; (d) 20-A-01 dispersion warning still fires at lower thresholds, providing SOFT warning. The strict AND-gate accepts evasion in exchange for ≤1% FP (Nam/Yang 99% specificity). |
| T-20-C-04-03 | Denial of service / self-fulfilling prophecy | UI banner causes panic-selling (banner becomes the manipulation), or repeated dismissals annoy users | mitigate | Three controls: (1) Explicit "NOT investment advice" framing per T-20-C-04-01. (2) Single X dismissal hides banner for 24h via localStorage `pump_dump_dismissed:{ticker}:{YYYY-MM-DD}`. (3) Auto-clears after 24h per CONTEXT.md spec line 127 — TTL check `(Date.now() - dismissedAt) > 24*3600*1000` AND `manipulation_warning` is re-derived per-render from the latest aggregator output (rolling 24h window). NO opt-in/opt-out persistence beyond 24h. |
| T-20-C-04-04 | Tampering / data-distribution shift | Synthetic eval F1 passes (>=0.6) but real-world distribution differs (fatter Pareto tails, regime shifts) so production fire rate diverges | mitigate | Model card §5 documents the synthetic-vs-real gap EXPLICITLY citing the operator-deferred NASDAQ surveillance feed (CONTEXT.md line 177). Production FP rate is operator-monitored during the 30d shadow gate — cutover requires 0 FPs over 30d. If a real-world fire is judged FP, RULE_VERSION is bumped and thresholds re-cited in HYPERPARAMETERS.md before re-shadow. The shadow→on gate is the answer to this threat. |
| T-20-C-04-05 | Tampering / coordinated bot ring evasion | Coordinated ring spreads posts across many accounts to keep per-account share low (defeating gini), or spreads across days to keep mention_z low | mitigate | Defense-in-depth with 20-C-03 (MinHash near-duplicate detection at message level) — 20-C-03 catches the textual side (cosine-similar messages from different accounts), this plan (20-C-04) catches the macro pattern (volume + concentration + cap class). A ring evading 20-C-04 still trips 20-C-03 via textual reuse; a ring evading 20-C-03 by varying text still trips 20-C-04 via volume + cap class. Both shipping in Wave C is by design. |

</threat_model>

<tasks>

<task type="auto" id="20-C-04-01" tdd="true">
  <name>Task 1: Implement pump-dump-detector.ts pure-math module + canonical/boundary unit tests (RED → GREEN)</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 127 = 20-C-04 spec; lines 9-41 = S1-S10)
    - src/lib/diffusion-trace.ts lines 5-44 (CapClass type + classifyCapClass — Cipher's enum is large_cap/mid_cap/small_cap/unknown; the spec's "{micro, small}" maps to {small_cap})
    - .planning/phases/20-real-sentiment-analysis/20-A-04-PLAN.md Task 1 (Vitest precedent for pure-math TDD)
  </read_first>
  <behavior>
    Vitest cases written FIRST, MUST fail before implementation:

    - **Canonical all-trigger → true**: `{ mention_z: 7, bull_pct: 98, gini: 0.85, mean_account_age_days: 45, cap_class: 'small_cap' }` → `is_warning === true` AND `matched_rules` contains all 5 rule names sorted lexicographically `['account_age','bull_pct','cap_class','gini','mention_z']`
    - **Boundary 1 — mention_z exact 5.0**: mention_z=5.0 (rest canonical) → false; matched_rules excludes 'mention_z', includes other 4
    - **Boundary 2 — bull_pct exact 95.0**: → false; matched_rules excludes 'bull_pct'
    - **Boundary 3 — gini exact 0.7**: → false; matched_rules excludes 'gini'
    - **Boundary 4 — age exact 90.0**: → false; matched_rules excludes 'account_age' (strict-less semantics)
    - **Boundary 5 — cap_class 'mid_cap'**: → false; matched_rules excludes 'cap_class'
    - **Cap_class 'large_cap'**: → false
    - **Cap_class 'unknown'**: → false
    - **Null mention_z**: → false (insufficient data — never default-on)
    - **Null gini**: → false
    - **Null mean_account_age_days**: → false
    - **matched_rules content when partial**: `{ mention_z: 7, bull_pct: 98, gini: 0.5, mean_account_age_days: 200, cap_class: 'small_cap' }` → matched_rules deepEquals `['bull_pct','cap_class','mention_z']` (sorted)
    - **RULE_VERSION echo**: `detectManipulation(canonical).rule_version === RULE_VERSION` and `RULE_VERSION === 'pdd-v1.0'`
    - **Threshold injection**: `isPumpAndDumpPattern({...canonical, mention_z: 4}, { ...PUMP_DUMP_THRESHOLDS, mention_z_min: 3 })` → true (proves injection works)
  </behavior>
  <action>
    1. Create `tests/sentiment-pump-dump-detector.unit.test.ts` with the 14 cases above. Run `npm test -- pump-dump-detector --run` and confirm RED (module does not exist).
    2. Create `src/lib/sentiment/pump-dump-detector.ts`:

       ```typescript
       import type { CapClass } from '@/lib/diffusion-trace';

       export const RULE_VERSION = 'pdd-v1.0' as const;

       export interface PumpDumpThresholds {
         mention_z_min: number;
         bull_pct_min: number;
         gini_min: number;
         account_age_max_days: number;
         cap_class_set: ReadonlySet<CapClass>;
       }

       export const PUMP_DUMP_THRESHOLDS: PumpDumpThresholds = {
         mention_z_min: 5,
         bull_pct_min: 95,
         gini_min: 0.7,
         account_age_max_days: 90,
         cap_class_set: new Set<CapClass>(['small_cap']),
       };

       export interface PumpDumpFeatures {
         mention_z: number | null;
         bull_pct: number;
         gini: number | null;
         mean_account_age_days: number | null;
         cap_class: CapClass;
       }

       export function isPumpAndDumpPattern(
         f: PumpDumpFeatures,
         t: PumpDumpThresholds = PUMP_DUMP_THRESHOLDS,
       ): boolean {
         if (f.mention_z == null || f.gini == null || f.mean_account_age_days == null) return false;
         return f.mention_z > t.mention_z_min
           && f.bull_pct > t.bull_pct_min
           && f.gini > t.gini_min
           && f.mean_account_age_days < t.account_age_max_days
           && t.cap_class_set.has(f.cap_class);
       }

       export interface DetectorResult {
         is_warning: boolean;
         matched_rules: string[];
         rule_version: string;
       }

       export function detectManipulation(
         f: PumpDumpFeatures,
         t: PumpDumpThresholds = PUMP_DUMP_THRESHOLDS,
       ): DetectorResult {
         const matched: string[] = [];
         if (f.mention_z != null && f.mention_z > t.mention_z_min) matched.push('mention_z');
         if (f.bull_pct > t.bull_pct_min) matched.push('bull_pct');
         if (f.gini != null && f.gini > t.gini_min) matched.push('gini');
         if (f.mean_account_age_days != null && f.mean_account_age_days < t.account_age_max_days) matched.push('account_age');
         if (t.cap_class_set.has(f.cap_class)) matched.push('cap_class');
         matched.sort();
         return {
           is_warning: isPumpAndDumpPattern(f, t),
           matched_rules: matched,
           rule_version: RULE_VERSION,
         };
       }
       ```

    3. Run `npm test -- pump-dump-detector --run` and confirm GREEN — all 14 cases pass.
  </action>
  <acceptance_criteria>
    - `tests/sentiment-pump-dump-detector.unit.test.ts` exists; `grep -c "describe" tests/sentiment-pump-dump-detector.unit.test.ts` returns ≥ 1
    - `src/lib/sentiment/pump-dump-detector.ts` exports: `RULE_VERSION`, `PUMP_DUMP_THRESHOLDS`, `PumpDumpThresholds`, `PumpDumpFeatures`, `isPumpAndDumpPattern`, `detectManipulation`, `DetectorResult`
    - `npm test -- pump-dump-detector --run` exits 0 with ≥14 cases passing
    - `grep -c "from '@prisma" src/lib/sentiment/pump-dump-detector.ts` returns 0 (pure math)
    - `grep -c "f.mention_z > t.mention_z_min" src/lib/sentiment/pump-dump-detector.ts` returns ≥ 1 (literal predicate present)
    - `grep -c "RULE_VERSION = 'pdd-v1.0'" src/lib/sentiment/pump-dump-detector.ts` returns 1
  </acceptance_criteria>
  <verify>
    <automated>npm test -- pump-dump-detector --run</automated>
  </verify>
  <done>Pure-math detector exists; 14 canonical/boundary unit tests green; strict-greater/less semantics verified; no Prisma deps</done>
</task>

<task type="auto" id="20-C-04-02">
  <name>Task 2: Add ManipulationWarning Prisma model + feature flags</name>
  <read_first>
    - prisma/schema.prisma (bottom of file — append after last existing model, NEVER modify existing)
    - src/lib/features.ts (existing flag pattern from Phase 19 / 20-A-04; if file does not exist yet on this branch, create it with the established pattern)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md Task 1 (PIT-aware additive schema precedent)
  </read_first>
  <action>
    1. Append to `prisma/schema.prisma` AFTER the last existing model:

       ```prisma

       // ─── Phase 20-C-04 — Pump-and-dump cluster detection (Nam/Yang 2023) ───
       // Every detector invocation (NOT just fires) persists a telemetry row so
       // operators can review FP rate during the 30d shadow gate.
       // Insert-only; 90d retention via Phase 27 cleanup.
       model ManipulationWarning {
         id                    String   @id @default(uuid())
         ticker                String
         // PIT-INVARIANT — readers MUST use computed_at to align with the upstream
         // feature snapshot (mention_z, gini) that produced this row.
         computed_at           DateTime @default(now()) @db.Timestamptz
         mention_z             Float?
         bull_pct              Float
         gini                  Float?
         mean_account_age_days Float?
         cap_class             String
         is_warning_fired      Boolean
         matched_rules         String[]
         rule_version          String

         @@index([ticker, computed_at(sort: Desc)], map: "idx_manipwarn_ticker_computed_at")
         @@index([is_warning_fired, computed_at(sort: Desc)], map: "idx_manipwarn_fired_computed_at")
         @@map("manipulation_warnings")
       }
       ```

    2. Append to `src/lib/features.ts` (or create file if absent, matching 20-A-04 pattern):

       ```typescript
       export const FEATURE_PUMP_DUMP_DETECTOR: 'off' | 'shadow' | 'on' =
         (process.env.FEATURE_PUMP_DUMP_DETECTOR as 'off' | 'shadow' | 'on') ?? 'shadow';
       export const FEATURE_PUMP_DUMP_DETECTOR_UI: 'off' | 'shadow' | 'on' =
         (process.env.FEATURE_PUMP_DUMP_DETECTOR_UI as 'off' | 'shadow' | 'on') ?? 'off';
       ```

    3. Run:

       ```bash
       npx prisma format
       npx prisma generate
       ```

       Do NOT push yet — that is Task 3.
  </action>
  <acceptance_criteria>
    - `grep -c "model ManipulationWarning" prisma/schema.prisma` returns 1
    - `grep -c "// PIT-INVARIANT" prisma/schema.prisma` returns ≥ 3 (20-Z-01 + 20-A-04 + this)
    - `grep -c "idx_manipwarn_ticker_computed_at\|idx_manipwarn_fired_computed_at" prisma/schema.prisma` returns 2
    - `grep -c "FEATURE_PUMP_DUMP_DETECTOR" src/lib/features.ts` returns ≥ 2
    - `npx prisma format` exits 0 with no diff after re-run
    - `npx prisma generate` exits 0
    - No existing model modified: `git diff prisma/schema.prisma | grep -E "^-[^-]" | wc -l` returns 0
  </acceptance_criteria>
  <verify>
    <automated>npx prisma format && grep -q "model ManipulationWarning" prisma/schema.prisma && grep -q "idx_manipwarn_ticker_computed_at" prisma/schema.prisma && grep -q "FEATURE_PUMP_DUMP_DETECTOR" src/lib/features.ts</automated>
  </verify>
  <done>ManipulationWarning model + 2 indexes + PIT marker present; flags added; client regenerated; no existing model touched</done>
</task>

<task type="checkpoint:human-action" id="20-C-04-03" gate="blocking">
  <name>Task 3: [BLOCKING] Operator runs `npx prisma db push` against live Neon</name>
  <what-built>
    Task 2 added the `ManipulationWarning` model (additive — no existing model touched). DB push is operator-confirmed per 20-Z-01 / 20-A-04 precedent.
  </what-built>
  <how-to-verify>
    From the repo root with production Neon `DATABASE_URL` exported:

    ```bash
    npx prisma db push
    ```

    Verify the table:

    ```bash
    psql "$DATABASE_URL" -c '\d "manipulation_warnings"'
    ```

    Expected: 11 columns (`id`, `ticker`, `computed_at`, `mention_z`, `bull_pct`, `gini`, `mean_account_age_days`, `cap_class`, `is_warning_fired`, `matched_rules`, `rule_version`); 2 indexes (`idx_manipwarn_ticker_computed_at`, `idx_manipwarn_fired_computed_at`); row count 0.

    Verify 20-A-04 + 20-Z-01 unchanged:

    ```bash
    psql "$DATABASE_URL" -c '\d "author_share_calibrations"' | grep -c "q1_author_share_pct"  # → 1
    psql "$DATABASE_URL" -c '\d "sentiment_observations"' | grep -c "author_features_snapshot"  # → 1
    ```
  </how-to-verify>
  <resume-signal>Reply "pushed" when all three psql checks succeed (manipulation_warnings table exists with correct shape, AuthorShareCalibration + SentimentObservation untouched), or describe the failure.</resume-signal>
</task>

<task type="auto" id="20-C-04-04">
  <name>Task 4: Wire aggregator computeManipulationWarning + extend SentimentIntelligenceSection types</name>
  <read_first>
    - src/lib/sentiment/aggregator.ts (existing exports + computeAuthorConcentration from 20-A-04)
    - src/lib/sentiment/baseline.ts (getBaselineForTicker / mentionZScore from 20-A-02)
    - src/lib/types.ts (current SentimentIntelligenceSection shape)
    - src/lib/db.ts
    - src/lib/diffusion-trace.ts (CapClass + classifyCapClass)
  </read_first>
  <action>
    1. Extend `src/lib/types.ts` `SentimentIntelligenceSection` with the `manipulation_warning?` field per `<interfaces>`. All other fields unchanged. Verify `npx tsc --noEmit` exits 0.

    2. Add `computeManipulationWarning` to `src/lib/sentiment/aggregator.ts`:

       ```typescript
       import { prisma } from '@/lib/db';
       import type { CapClass } from '@/lib/diffusion-trace';
       import {
         detectManipulation,
         PUMP_DUMP_THRESHOLDS,
         RULE_VERSION,
       } from './pump-dump-detector';
       import { FEATURE_PUMP_DUMP_DETECTOR } from '@/lib/features';

       export interface ManipulationWarningBlock {
         is_warning: boolean;
         matched_rules: string[];
         rule_version: string;
       }

       export async function computeManipulationWarning(args: {
         ticker: string;
         cap_class: CapClass;
         bull_pct: number;
         mention_z: number | null;
         gini: number | null;
         now?: Date;
       }): Promise<ManipulationWarningBlock | null> {
         if (FEATURE_PUMP_DUMP_DETECTOR === 'off') return null;

         const now = args.now ?? new Date();

         // Early exit: out-of-scope cap_class — return non-firing block, NO DB write.
         if (!PUMP_DUMP_THRESHOLDS.cap_class_set.has(args.cap_class)) {
           return { is_warning: false, matched_rules: [], rule_version: RULE_VERSION };
         }

         // Read mean_account_age_days from SentimentObservation.author_features_snapshot
         // over the rolling 24h window — PIT-safe via fetched_at (S2).
         const since = new Date(now.getTime() - 24 * 3600 * 1000);
         const obs = await prisma.sentimentObservation.findMany({
           where: { ticker: args.ticker, fetched_at: { gte: since } },
           select: { author_features_snapshot: true },
         });
         const ages: number[] = [];
         for (const o of obs) {
           const snap = o.author_features_snapshot as { account_age_days?: number } | null;
           if (snap && typeof snap.account_age_days === 'number' && Number.isFinite(snap.account_age_days)) {
             ages.push(snap.account_age_days);
           }
         }
         const mean_account_age_days = ages.length > 0
           ? ages.reduce((s, v) => s + v, 0) / ages.length
           : null;

         const features = {
           mention_z: args.mention_z,
           bull_pct: args.bull_pct,
           gini: args.gini,
           mean_account_age_days,
           cap_class: args.cap_class,
         };
         const result = detectManipulation(features);

         // Persist EVERY invocation (not just fires) — FP-rate review during shadow.
         await prisma.manipulationWarning.create({
           data: {
             ticker: args.ticker,
             mention_z: features.mention_z,
             bull_pct: features.bull_pct,
             gini: features.gini,
             mean_account_age_days: features.mean_account_age_days,
             cap_class: features.cap_class,
             is_warning_fired: result.is_warning,
             matched_rules: result.matched_rules,
             rule_version: result.rule_version,
           },
         });

         return result;
       }
       ```

    3. Run `npx tsc --noEmit` and confirm 0 errors.
  </action>
  <acceptance_criteria>
    - `grep -c "manipulation_warning" src/lib/types.ts` returns ≥ 1
    - `grep -c "export async function computeManipulationWarning" src/lib/sentiment/aggregator.ts` returns 1
    - `grep -c "fetched_at" src/lib/sentiment/aggregator.ts` returns ≥ 1 (PIT-safe — S2)
    - `grep -c "published_at" src/lib/sentiment/aggregator.ts` returns 0 (S2 / 20-Z-07)
    - `grep -c "manipulationWarning\.\(update\|delete\|upsert\)" src/lib/sentiment/aggregator.ts` returns 0 (insert-only)
    - `grep -c "FEATURE_PUMP_DUMP_DETECTOR" src/lib/sentiment/aggregator.ts` returns ≥ 1
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -q "computeManipulationWarning" src/lib/sentiment/aggregator.ts && [ "$(grep -c 'manipulationWarning\.\(update\|delete\|upsert\)' src/lib/sentiment/aggregator.ts)" = "0" ] && [ "$(grep -c 'published_at' src/lib/sentiment/aggregator.ts)" = "0" ]</automated>
  </verify>
  <done>Aggregator computes manipulation warning end-to-end; PIT-safe via fetched_at; INSERT-only; tsc clean</done>
</task>

<task type="auto" id="20-C-04-05">
  <name>Task 5: Implement synthetic eval harness + reproducible RNG + npm script</name>
  <read_first>
    - src/lib/sentiment/pump-dump-detector.ts (Task 1 output)
    - package.json (existing scripts section — match conventions for tsx-based script entries)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 127 — F1 ≥ 0.6 acceptance; line 61 — Nam/Yang spec sensitivity 85% / specificity 99%)
  </read_first>
  <action>
    1. Create `scripts/eval-pump-dump-synthetic.ts`:

       ```typescript
       /**
        * Plan 20-C-04 — Synthetic pump-and-dump eval harness.
        * Reproducible via fixed RNG seed. Computes F1, sensitivity, specificity.
        * Exit 0 iff F1 ≥ 0.6 AND specificity ≥ 0.95.
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
       const pick = <T,>(rng: () => number, arr: readonly T[]) => arr[Math.floor(rng() * arr.length)];

       export interface EvalResult {
         seed: number;
         n_pd_events: number;
         n_background_events: number;
         tp: number; fp: number; tn: number; fn: number;
         precision: number; recall: number; f1: number;
         sensitivity: number; specificity: number;
         rule_version: string;
         generated_at: string;
       }

       function genPumpDump(rng: () => number): PumpDumpFeatures {
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
           if (isPumpAndDumpPattern(f)) tp++; else fn++;
         }
         for (let i = 0; i < n; i++) {
           const f = genBackground(rng);
           if (isPumpAndDumpPattern(f)) fp++; else tn++;
         }
         const precision = tp / Math.max(1, tp + fp);
         const recall = tp / Math.max(1, tp + fn);
         const f1 = 2 * precision * recall / Math.max(1e-9, precision + recall);
         const sensitivity = recall;
         const specificity = tn / Math.max(1, tn + fp);
         const result: EvalResult = {
           seed, n_pd_events: n, n_background_events: n,
           tp, fp, tn, fn,
           precision, recall, f1, sensitivity, specificity,
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
         runSyntheticEval().then(r => {
           console.log(JSON.stringify(r, null, 2));
           const pass = r.f1 >= 0.6 && r.specificity >= 0.95;
           process.exit(pass ? 0 : 1);
         });
       }
       ```

    2. Add npm script to `package.json` (preserve all existing scripts):

       ```json
       "eval:pump-dump-synthetic": "tsx scripts/eval-pump-dump-synthetic.ts"
       ```

    3. Add a Vitest reproducibility test (append to `tests/sentiment-pump-dump-detector.unit.test.ts`):

       ```typescript
       import { runSyntheticEval } from '../scripts/eval-pump-dump-synthetic';
       it('eval is reproducible to 4 decimal places with fixed seed', async () => {
         const a = await runSyntheticEval({ seed: 20260511, n_per_class: 100, outDir: '/tmp/eval-test-a' });
         const b = await runSyntheticEval({ seed: 20260511, n_per_class: 100, outDir: '/tmp/eval-test-b' });
         expect(a.f1.toFixed(4)).toBe(b.f1.toFixed(4));
         expect(a.specificity.toFixed(4)).toBe(b.specificity.toFixed(4));
       });
       it('eval F1 >= 0.6 and specificity >= 0.95 at default n=500', async () => {
         const r = await runSyntheticEval({ outDir: '/tmp/eval-test-default' });
         expect(r.f1).toBeGreaterThanOrEqual(0.6);
         expect(r.specificity).toBeGreaterThanOrEqual(0.95);
       });
       ```

    4. Run `npm run eval:pump-dump-synthetic` and confirm exit 0 + reports/pump-dump-eval-{date}.json created.
  </action>
  <acceptance_criteria>
    - `scripts/eval-pump-dump-synthetic.ts` exists; exports `runSyntheticEval`
    - `grep -c "eval:pump-dump-synthetic" package.json` returns ≥ 1
    - `npm run eval:pump-dump-synthetic` exits 0 (F1 ≥ 0.6 AND specificity ≥ 0.95)
    - `[ -f reports/pump-dump-eval-$(date -u +%Y-%m-%d).json ]` true after run
    - Reproducibility test in `tests/sentiment-pump-dump-detector.unit.test.ts` asserts identical F1 to 4 decimal places across two runs
    - `npm test -- pump-dump-detector --run` exits 0 (reproducibility cases added)
    - `grep -c "mulberry32\|deterministic\|seed" scripts/eval-pump-dump-synthetic.ts` returns ≥ 2 (RNG documented)
  </acceptance_criteria>
  <verify>
    <automated>npm run eval:pump-dump-synthetic && npm test -- pump-dump-detector --run</automated>
  </verify>
  <done>Synthetic eval F1 ≥ 0.6 + specificity ≥ 0.95; reproducible to 4 decimal places; report JSON persisted; npm script wired</done>
</task>

<task type="auto" id="20-C-04-06">
  <name>Task 6: Weekly cron route + vercel.json schedule + live-Neon integration test</name>
  <read_first>
    - src/app/api/cron/sentiment-scan/route.ts (existing cron handler pattern — Bearer CRON_SECRET)
    - vercel.json (existing crons array — preserve all entries)
    - tests/integration/ (existing live-Neon Vitest pattern)
    - src/lib/db.ts (prisma singleton)
  </read_first>
  <behavior>
    Integration test cases (live-Neon) — write FIRST, confirm RED:

    - **Insert telemetry row on every invocation**: call `computeManipulationWarning({ ticker: 'TESTPD_A', cap_class: 'small_cap', bull_pct: 50, mention_z: 2, gini: 0.3 })` (background-like, will NOT fire); assert `ManipulationWarning` row exists with `is_warning_fired === false`, `matched_rules` empty or partial
    - **Fire on synthetic P&D fixture**: seed 60 SentimentObservation rows for ticker `TESTPD_FIRE` with `author_features_snapshot.account_age_days` averaging ~45d, then call `computeManipulationWarning({ ticker: 'TESTPD_FIRE', cap_class: 'small_cap', bull_pct: 98, mention_z: 8, gini: 0.85 })`; assert `is_warning_fired === true`, `matched_rules.length === 5`, `rule_version === 'pdd-v1.0'`, `mean_account_age_days` written within [40, 50]
    - **Early-exit no-DB-write on out-of-scope cap_class**: call with `cap_class: 'large_cap'`; assert returned block has `is_warning: false` AND `ManipulationWarning` row count for ticker is UNCHANGED (no row written)
    - **FEATURE_PUMP_DUMP_DETECTOR='off' returns null + no DB write**: temporarily set env, assert null returned AND row count unchanged
    - **PIT correctness**: assert findMany filters by `fetched_at` (not `published_at`) via Prisma query event hook (same pattern 20-Z-07 will use)
  </behavior>
  <action>
    1. Create `src/app/api/cron/eval-pump-dump-synthetic/route.ts`:

       ```typescript
       import { NextResponse } from 'next/server';
       import { runSyntheticEval } from '@/../scripts/eval-pump-dump-synthetic';

       export const runtime = 'nodejs';
       export const maxDuration = 120;

       export async function GET(request: Request) {
         const authHeader = request.headers.get('authorization');
         if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
           return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
         }
         const t0 = Date.now();
         try {
           const r = await runSyntheticEval();
           const status = r.f1 >= 0.6 && r.specificity >= 0.95 ? 'ok' : 'regression';
           return NextResponse.json({
             f1: r.f1,
             sensitivity: r.sensitivity,
             specificity: r.specificity,
             rule_version: r.rule_version,
             ms_elapsed: Date.now() - t0,
             status,
           });
         } catch (err) {
           const msg = err instanceof Error ? err.message : String(err);
           return NextResponse.json({ status: 'error', error: msg, ms_elapsed: Date.now() - t0 }, { status: 500 });
         }
       }
       ```

    2. Add to `vercel.json` `crons` array (preserve existing entries):

       ```json
       { "path": "/api/cron/eval-pump-dump-synthetic", "schedule": "0 9 * * 2" }
       ```

       Tuesdays 09:00 UTC — staggered against the 20-A-04 Monday cron and 20-A-02 nightly cron.

    3. Create `tests/integration/sentiment-pump-dump.integration.test.ts` with the 5 cases above. Cleanup hook deletes all rows where `ticker LIKE 'TESTPD_%'` in `afterAll`.

    4. Run `npm run test:integration -- sentiment-pump-dump` and confirm RED, then GREEN after Task 4 wiring is in place.
  </action>
  <acceptance_criteria>
    - `src/app/api/cron/eval-pump-dump-synthetic/route.ts` exists; exports `GET`
    - `grep -c "/api/cron/eval-pump-dump-synthetic" vercel.json` returns 1
    - `grep -c "0 9 \\* \\* 2" vercel.json` returns 1
    - `grep -c "Bearer \${process.env.CRON_SECRET}" src/app/api/cron/eval-pump-dump-synthetic/route.ts` returns 1
    - `tests/integration/sentiment-pump-dump.integration.test.ts` exists; ≥5 cases
    - `npm run test:integration -- sentiment-pump-dump --run` exits 0
    - `psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"manipulation_warnings\" WHERE ticker LIKE 'TESTPD_%'"` returns ≥ 2 after integration run (cleanup hook drops it after)
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -q '"path": "/api/cron/eval-pump-dump-synthetic"' vercel.json && npm run test:integration -- sentiment-pump-dump --run</automated>
  </verify>
  <done>Cron route exists; weekly schedule wired; live-Neon integration tests green; PIT-safe via fetched_at; INSERT-only verified end-to-end</done>
</task>

<task type="auto" id="20-C-04-07">
  <name>Task 7: UI banner + Playwright accessibility/non-advisory test + model card + HYPERPARAMETERS</name>
  <read_first>
    - src/components/ResearchReport.tsx (existing top-of-report area; SentimentIntelligenceCard for placement context)
    - src/lib/types.ts (extended SentimentIntelligenceSection from Task 4)
    - tests/playwright/ (existing patterns)
    - HYPERPARAMETERS.md (existing format from 20-A-04)
    - .planning/phases/20-real-sentiment-analysis/20-A-04-PLAN.md Task 7 (model card stub format)
  </read_first>
  <action>
    1. At the TOP of `ResearchReport` render (just inside the outermost wrapper, before any other content), insert the banner:

       ```tsx
       {process.env.NEXT_PUBLIC_FEATURE_PUMP_DUMP_DETECTOR_UI === 'on' &&
        sentiment_intelligence?.manipulation_warning?.is_warning === true &&
        !isDismissed(ticker) && (
         <div
           role="alert"
           aria-live="polite"
           data-banner="manipulation-warning"
           className="w-full bg-red-700 text-white px-4 py-3 flex items-center gap-3 border-b-2 border-red-900"
         >
           <span className="text-xl" aria-hidden="true">⚠</span>
           <div className="flex-1 text-sm">
             Possible market manipulation pattern detected (Nam/Yang 2023).
             This warning does NOT constitute investment advice.
             {' '}
             <a
               href="/docs/model-cards/pump-dump-detector"
               className="underline hover:no-underline"
             >
               Methodology
             </a>
             .
           </div>
           <button
             type="button"
             aria-label="Dismiss manipulation warning for 24 hours"
             onClick={() => dismissBanner(ticker)}
             className="text-white hover:bg-red-800 rounded px-2 py-1"
           >
             ×
           </button>
         </div>
       )}
       ```

       And add the helper functions at module scope (or in a small `src/components/manipulation-banner-dismiss.ts` helper):

       ```typescript
       function dismissKey(ticker: string): string {
         const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
         return `pump_dump_dismissed:${ticker}:${today}`;
       }
       export function isDismissed(ticker: string): boolean {
         if (typeof window === 'undefined') return false;
         const raw = window.localStorage.getItem(dismissKey(ticker));
         if (!raw) return false;
         const dismissedAt = parseInt(raw, 10);
         if (!Number.isFinite(dismissedAt)) return false;
         return (Date.now() - dismissedAt) <= 24 * 3600 * 1000;
       }
       export function dismissBanner(ticker: string): void {
         if (typeof window === 'undefined') return;
         window.localStorage.setItem(dismissKey(ticker), String(Date.now()));
       }
       ```

       FORBIDDEN words in the banner subtree (Playwright will assert): `buy`, `sell`, `advise`, `recommend`, `should`. Banner copy is EXACTLY: "Possible market manipulation pattern detected (Nam/Yang 2023). This warning does NOT constitute investment advice."

    2. Create `tests/playwright/research-manipulation-banner.spec.ts`:

       - Mock the report fixture with `sentiment_intelligence.manipulation_warning: { is_warning: true, matched_rules: [...5...], rule_version: 'pdd-v1.0' }`.
       - Set `NEXT_PUBLIC_FEATURE_PUMP_DUMP_DETECTOR_UI=on` via playwright.config env override.
       - Visit `/research/SMALLCAP_TEST`, wait for the banner.
       - Assert: `await expect(page.locator('[data-banner="manipulation-warning"]')).toBeVisible()`
       - Assert role + aria: `await expect(page.locator('[data-banner="manipulation-warning"]')).toHaveAttribute('role', 'alert')`; `toHaveAttribute('aria-live', 'polite')`
       - Assert exact copy via `getByText` containing the full sentence "This warning does NOT constitute investment advice"
       - Assert methodology link exists with href `/docs/model-cards/pump-dump-detector`
       - **Regulatory hygiene assertion**: `const innerText = await page.locator('[data-banner="manipulation-warning"]').innerText(); for (const forbidden of ['buy','sell','advise','recommend','should']) { expect(innerText.toLowerCase()).not.toContain(forbidden); }`
       - **Dismissal toggles localStorage**: click the X button; assert `await page.evaluate(() => localStorage.getItem('pump_dump_dismissed:SMALLCAP_TEST:' + new Date().toISOString().slice(0,10)))` is non-null; reload page; assert banner is NOT visible
       - **No banner when is_warning=false**: re-mock with `is_warning: false`; assert `page.locator('[data-banner="manipulation-warning"]')` count is 0

    3. Create `docs/cards/MODEL-CARD-pump-dump-detector.md` (Mitchell 2019 §1-8 stub per 20-Z-02):

       ```markdown
       # Model Card — Pump-and-Dump Cluster Detector (Phase 20-C-04)

       **Status**: shadow → on (target)
       **Owner**: Phase 20 Wave C
       **Last updated**: <date of cutover>
       **Rule version**: pdd-v1.0
       **Card schema**: pending 20-Z-02 template — section list per Mitchell 2019.

       ## 1. Model details
       Pure-rule AND-gate over five features computed by upstream Phase 20 plans
       (20-A-02 mention_z, 20-A-04 gini, 20-Z-01 author age, diffusion-trace
       cap_class, existing aggregator bull_pct). NO ML — deterministic predicate.
       Implemented in `src/lib/sentiment/pump-dump-detector.ts`.

       ## 2. Intended use
       Surface an explicit, non-advisory UI warning when a small-cap ticker
       exhibits the Nam/Yang 2023 pump-and-dump pattern signature. NOT a
       buy/sell signal. NOT personalized investment advice. Auxiliary to
       20-A-01 dispersion warning (which fires at lower thresholds as a soft
       hint; this plan fires the hard banner).

       ## 3. Calibration data
       Thresholds cited directly from Nam/Yang 2023 (https://arxiv.org/pdf/2301.11403)
       which reports F1=0.67, sensitivity 85%, specificity 99% on confirmed
       pump-and-dump events. Our synthetic eval reproducibility: F1 ≥ 0.6 with
       fixed RNG seed 20260511 over 500 + 500 events (see
       `reports/pump-dump-eval-{date}.json`). NASDAQ surveillance-alert
       ground truth deferred per CONTEXT.md line 177.

       ## 4. Performance / acceptance criteria
       - Synthetic F1 ≥ 0.6 (gates the cron + CI).
       - Synthetic specificity ≥ 0.95.
       - Production cutover: ≥30d FEATURE_PUMP_DUMP_DETECTOR=shadow AND 0
         operator-judged false-positive fires.
       - Reproducibility: identical F1 to 4 decimal places across runs.

       ## 5. Known failure modes
       - **Synthetic-vs-real distribution gap**: synthetic eval generates
         IID features; real-world has temporal autocorrelation and fatter
         tails. Documented; mitigated via shadow-gate FP review.
       - **Threshold gameability**: a manipulator stopping at mention_z=4.9
         evades the predicate. The strict AND-gate trades evasion for ≤1% FP.
         20-A-01 dispersion warning still fires at lower thresholds.
       - **Banner self-fulfilling-prophecy risk**: dismissal affordance + 24h
         auto-clear + explicit non-advisory framing mitigate; documented under
         T-20-C-04-03.
       - **Coordinated bot ring evasion**: defense-in-depth with 20-C-03
         MinHash; documented under T-20-C-04-05.

       ## 6. Ethical considerations
       - The banner is a WARNING, not advice. Copy is fixed and reviewed.
       - Dismissal is per-user via localStorage; no server-side tracking.
       - Threshold values are not user-visible — preserves detector integrity
         and prevents threshold-gaming by external actors.

       ## 7. Retrain cadence
       Thresholds: operator-driven quarterly review. RULE_VERSION bumps on
       every threshold change; historical ManipulationWarning rows preserved
       for replay attribution. Synthetic eval: weekly via
       `/api/cron/eval-pump-dump-synthetic` (Tuesdays 09:00 UTC).

       ## 8. References
       - Nam, S. & Yang, J. (2023). "Detecting Pump-and-Dump Schemes from
         Stock Discussion Posts." https://arxiv.org/pdf/2301.11403
       - Cresci et al. (2019). StockTwits coordinated bot study.
       - CONTEXT.md §20-C-04 (line 127) + operator-defer note (line 177).
       - 20-Z-02 model card schema (pending — full conformance on landing).
       ```

    4. Append to `HYPERPARAMETERS.md`:

       ```markdown
       ## Phase 20-C-04 — Pump-and-dump detector

       | Param | Value | Source / rationale |
       |-------|-------|---------------------|
       | `PUMP_DUMP_THRESHOLDS.mention_z_min` | `5` | Nam/Yang 2023 + CONTEXT.md line 127. Strict-greater (mention_z > 5 fires; =5 does not). |
       | `PUMP_DUMP_THRESHOLDS.bull_pct_min` | `95` | Nam/Yang 2023 + CONTEXT.md line 127. Strict-greater. |
       | `PUMP_DUMP_THRESHOLDS.gini_min` | `0.7` | Nam/Yang 2023 + CONTEXT.md line 127. Strict-greater. Consumes 20-A-04 output. |
       | `PUMP_DUMP_THRESHOLDS.account_age_max_days` | `90` | Nam/Yang 2023 + CONTEXT.md line 127. Strict-less. |
       | `PUMP_DUMP_THRESHOLDS.cap_class_set` | `{'small_cap'}` | Spec line 127 says `cap_class ∈ {micro, small}`. Cipher's `CapClass` enum (src/lib/diffusion-trace.ts:5) is `large_cap \| mid_cap \| small_cap \| unknown` — `small_cap` covers BOTH micro and small per `classifyCapClass()` thresholds (< $2B = small_cap). NOT a hand-pick — enum-mapping documented. |
       | `RULE_VERSION` | `'pdd-v1.0'` | BUMP on every threshold change. Historical ManipulationWarning rows remain attributable. |
       | banner-suppress duration | `24h` | CONTEXT.md spec line 127 "persists for 24h then auto-clears". |
       | synthetic eval RNG seed | `20260511` | Date-derived for reproducibility; eval F1 must be identical to 4 decimal places across runs. |
       | synthetic eval F1 ship-gate | `≥ 0.6` | CONTEXT.md acceptance line 127. |
       | synthetic eval specificity gate | `≥ 0.95` | Tighter than Nam/Yang's 0.99 paper number — our synthetic distribution is easier; gate is a regression alarm, not a model card. |
       | production shadow→on FP gate | `0 fires over 30d` | T-20-C-04-04 mitigation. Operator-judged via /insights surveillance per 20-Z-03. |
       ```

    5. Run `npm run test:e2e -- research-manipulation-banner` and confirm GREEN.
  </action>
  <acceptance_criteria>
    - `tests/playwright/research-manipulation-banner.spec.ts` exists; `npm run test:e2e -- research-manipulation-banner` exits 0
    - `grep -c "Possible market manipulation pattern detected" src/components/ResearchReport.tsx` returns 1
    - `grep -c "FEATURE_PUMP_DUMP_DETECTOR_UI" src/components/ResearchReport.tsx` returns ≥ 1
    - `grep -c "role=\"alert\"\|aria-live=\"polite\"" src/components/ResearchReport.tsx` returns ≥ 2
    - `grep -c "data-banner=\"manipulation-warning\"" src/components/ResearchReport.tsx` returns 1
    - Banner subtree contains 0 occurrences of any forbidden substring (asserted in Playwright)
    - `[ -f docs/cards/MODEL-CARD-pump-dump-detector.md ]` true; `grep -c "^## " docs/cards/MODEL-CARD-pump-dump-detector.md` returns ≥ 8
    - `grep -c "Nam" docs/cards/MODEL-CARD-pump-dump-detector.md` returns ≥ 2 (paper citation + reference list)
    - `grep -c "Phase 20-C-04 — Pump-and-dump detector" HYPERPARAMETERS.md` returns 1
    - `grep -c "PUMP_DUMP_THRESHOLDS\|RULE_VERSION" HYPERPARAMETERS.md` returns ≥ 2
  </acceptance_criteria>
  <verify>
    <automated>npm run test:e2e -- research-manipulation-banner && [ -f docs/cards/MODEL-CARD-pump-dump-detector.md ] && grep -q "Phase 20-C-04 — Pump-and-dump detector" HYPERPARAMETERS.md</automated>
  </verify>
  <done>Banner renders + accessibility correct + non-advisory copy + dismissal works + zero forbidden substrings + model card + HYPERPARAMETERS entries committed; Nam/Yang cited</done>
</task>

</tasks>

<verification>

## Numerical acceptance — every gate is a command + expected exit/value

| # | Gate | Command | Expected |
|---|------|---------|----------|
| 1 | Detector predicate correctness | `npm test -- pump-dump-detector --run` | exit 0; ≥14 cases pass; all 5 boundary cases verify strict-greater/less |
| 2 | Pure math — no Prisma in detector | `grep -c "from '@prisma" src/lib/sentiment/pump-dump-detector.ts` | 0 |
| 3 | Literal 5-condition predicate | `grep -c "f.mention_z > t.mention_z_min" src/lib/sentiment/pump-dump-detector.ts` | ≥ 1 |
| 4 | RULE_VERSION present | `grep -c "RULE_VERSION = 'pdd-v1.0'" src/lib/sentiment/pump-dump-detector.ts` | 1 |
| 5 | Schema model present | `grep -c "model ManipulationWarning" prisma/schema.prisma` | 1 |
| 6 | DB push landed | `psql "$DATABASE_URL" -c "\\d manipulation_warnings" \| grep -c is_warning_fired` | 1 |
| 7 | Cron schedule wired | `grep -c "eval-pump-dump-synthetic" vercel.json` | 1 |
| 8 | INSERT-only enforced | `grep -c "manipulationWarning\.\(update\|delete\|upsert\)" src/ scripts/` | 0 |
| 9 | Type field present | `grep -c "manipulation_warning" src/lib/types.ts` | ≥ 1 |
| 10 | PIT-safe (S2) | `grep -c "published_at" src/lib/sentiment/aggregator.ts` | 0 |
| 11 | Aggregator integration | `npm run test:integration -- sentiment-pump-dump --run` | exit 0; ≥ 5 cases pass |
| 12 | Manipulation row written | `psql ... 'SELECT COUNT(*) FROM "manipulation_warnings" WHERE ticker LIKE 'TESTPD_%''` | ≥ 2 |
| 13 | Synthetic eval F1 gate | `npm run eval:pump-dump-synthetic` | exit 0; F1 ≥ 0.6; specificity ≥ 0.95 |
| 14 | Eval reproducibility | (same seed twice → identical F1 to 4 dp; asserted in Vitest test) | exit 0 |
| 15 | UI gated | `grep -c "FEATURE_PUMP_DUMP_DETECTOR_UI" src/components/ResearchReport.tsx` | ≥ 1 |
| 16 | Accessibility | `grep -c "role=\"alert\"\|aria-live=\"polite\"" src/components/ResearchReport.tsx` | ≥ 2 |
| 17 | Non-advisory copy exact | `grep -c "This warning does NOT constitute investment advice" src/components/ResearchReport.tsx` | 1 |
| 18 | Forbidden substrings | (Playwright asserts banner innerText contains 0 of: buy, sell, advise, recommend, should) | exit 0 |
| 19 | Playwright e2e | `npm run test:e2e -- research-manipulation-banner` | exit 0 |
| 20 | Model card present | `[ -f docs/cards/MODEL-CARD-pump-dump-detector.md ]` | true |
| 21 | Nam/Yang cited | `grep -c "Nam" docs/cards/MODEL-CARD-pump-dump-detector.md HYPERPARAMETERS.md` | ≥ 2 |
| 22 | Hyperparameters documented | `grep -c "Phase 20-C-04 — Pump-and-dump detector" HYPERPARAMETERS.md` | 1 |
| 23 | Cron wall-clock budget | route maxDuration = 120; synthetic eval at n=500 completes well under 2s on warm CPU | empirical < 2s |

## Shadow → on graduation gate (POST-MERGE, two-stage)

After ≥30 days of `FEATURE_PUMP_DUMP_DETECTOR=shadow` writes:

```bash
# Gate 1 — synthetic eval still green
npm run eval:pump-dump-synthetic   # exit 0

# Gate 2 — production false-positive count
psql "$DATABASE_URL" -c "
  SELECT COUNT(*) FROM manipulation_warnings
  WHERE is_warning_fired = true
    AND computed_at > NOW() - INTERVAL '30 days';
"
# Operator reviews each fire via /insights surveillance table (20-Z-03).
# Cutover requires: every fire is operator-judged a true positive (FP count = 0).
```

If both gates pass: `vercel env add FEATURE_PUMP_DUMP_DETECTOR on production` + redeploy.
UI flag (`FEATURE_PUMP_DUMP_DETECTOR_UI`) flipped in a SEPARATE follow-up commit per S3.

</verification>

<success_criteria>

This plan is DONE when ALL of the following are numerically true:

1. **Tasks 1-7 complete**, all `<verify>` automated commands exit 0.
2. **All 23 numerical gates** in the verification table above pass.
3. **`ManipulationWarning` table** exists in production Neon with 11 columns + 2 indexes; ≥2 rows inserted from the integration test (cleaned up by afterAll).
4. **`manipulation_warning`** field present on `SentimentIntelligenceSection` and computed end-to-end by the aggregator (gated by `FEATURE_PUMP_DUMP_DETECTOR`); PIT-safe via `fetched_at`.
5. **Synthetic eval** F1 ≥ 0.6 AND specificity ≥ 0.95 at default seed/size; reproducible to 4 decimal places.
6. **Weekly cron** `/api/cron/eval-pump-dump-synthetic` runs Tuesdays 09:00 UTC; wall-clock budget 2 minutes.
7. **UI banner** renders top-of-report with exact non-advisory copy under `FEATURE_PUMP_DUMP_DETECTOR_UI=on`; Playwright asserts role=alert + aria-live=polite + zero forbidden substrings.
8. **Banner dismissal** persists to localStorage with key `pump_dump_dismissed:{ticker}:{date}`; auto-clears after 24h.
9. **Model card** `docs/cards/MODEL-CARD-pump-dump-detector.md` committed with all 8 Mitchell sections + Nam/Yang 2023 citation + measured F1 + synthetic-vs-real gap documented.
10. **HYPERPARAMETERS.md** documents the 5 thresholds + RULE_VERSION + 24h banner-suppress + cap_class enum mapping note + Nam/Yang citation.
11. **Cleanup gate** (post-merge, deferred): two-stage shadow→on requires F1 ≥ 0.6 AND 0 production FPs over 30d.

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-C-04-SUMMARY.md` per the standard summary template, recording:
- Final synthetic eval F1 + sensitivity + specificity at default seed 20260511 + n=500
- Number of `ManipulationWarning` rows after first cron run + first production day
- Shadow→on cutover date for `FEATURE_PUMP_DUMP_DETECTOR` (or note pending if still in shadow)
- Any deviations from the canonical Nam/Yang baseline F1=0.67 on our synthetic eval (expected — synthetic is harder; document the delta)
- Pointer to the model card + first measured production FP count at 30d (placeholder if not yet measured)
- Pointer to the latest `reports/pump-dump-eval-{date}.json`
</output>
</content>
</invoke>