---
phase: 20
plan: 20-Z-06
wave: Z
type: execute
depends_on: []
files_modified:
  - scripts/phase-20-status.ts
  - scripts/lib/phase-20-checks/index.ts
  - scripts/lib/phase-20-checks/check-gme-crowded-consensus.ts
  - scripts/lib/phase-20-checks/check-per-document-nlp-coverage.ts
  - scripts/lib/phase-20-checks/check-source-tier-data-driven.ts
  - scripts/lib/phase-20-checks/check-time-decay-icir-uplift.ts
  - scripts/lib/phase-20-checks/check-per-source-icir-30d.ts
  - scripts/lib/phase-20-checks/check-brier.ts
  - scripts/lib/phase-20-checks/check-ece.ts
  - scripts/lib/phase-20-checks/check-bot-filter-fp-and-coordination-f1.ts
  - scripts/lib/phase-20-checks/check-numeric-grounding.ts
  - scripts/lib/phase-20-checks/check-citation-coverage.ts
  - scripts/lib/phase-20-checks/check-model-cards-fresh.ts
  - scripts/lib/phase-20-checks/check-lookahead-bias.ts
  - scripts/lib/phase-20-checks/check-telemetry-7d.ts
  - scripts/lib/phase-20-checks/check-fairness-audit.ts
  - scripts/lib/phase-20-checks/check-flags-graduated.ts
  - scripts/lib/phase-20-checks/types.ts
  - tests/phase-20-status.unit.test.ts
  - tests/integration/phase-20-status.e2e.test.ts
  - package.json
autonomous: true
requirements: []
shadow_required: false
shadow_skip_reason: "Read-only aggregator script — emits a status report and an exit code, never mutates state. No production code path is added or replaced; nothing to graduate. Per S3, when no behavior is being toggled there is no off→shadow→on transition to gate."
hard_cleanup_gate: true
must_haves:
  truths:
    - "`npm run phase-20-status` exists in package.json and is executable via `npx tsx scripts/phase-20-status.ts`"
    - "Script enumerates ALL 16 Definition-of-Done conditions from CONTEXT.md lines 145-163, one check per condition (DoD #1 is the script's own exit code, surfaced as the rollup line, not a sub-check)"
    - "Each of the 15 sub-checks (DoD #2 through #16) returns a `CheckResult` with `{ name, status: 'pass' | 'fail' | 'pending', evidence: string, blocker_for: number, branch: 'sentiment' | 'calibration' | 'report' | 'hygiene' }` — three-valued logic so 'no artifact yet' (pending) is distinct from 'artifact present but criterion violated' (fail)"
    - "Exit code policy: `0` when ALL 15 sub-checks pass; `1` when ≥1 sub-check is `fail`; `2` when ≥1 is `pending` and 0 are `fail` (pre-launch state — script can run today and exit 2 because the underlying artifacts have not landed yet)"
    - "Pretty markdown summary printed to stdout: 4 sections (Sentiment / Calibration / Report / Hygiene), one row per check, ✓/✗/○ glyph + the evidence string, totals at the bottom"
    - "Each sub-check is a separate file under `scripts/lib/phase-20-checks/` so individual checks are unit-testable in isolation and downstream plans can extend a single check without merge conflicts"
    - "Each sub-check delegates to a single inspection — DB query (Prisma), file existence + content parse (fs), or test invocation (execSync of a specific vitest spec). NO LLM calls. NO fuzzy logic. NO env-var gates that could relax thresholds at deploy time (per T-19-Z-04-01 precedent)"
    - "Every sub-check returns 'pending' (NOT 'fail') when its target artifact does not exist yet — so the script's first run on today's main produces exit code 2 with all 15 sub-checks reading 'pending', proving the script CAN exit non-zero per the acceptance criterion"
    - "Each sub-check has a unit test covering all three return paths {pass, fail, pending} via dependency injection (Prisma + fs + exec mocked), totalling ≥45 unit tests across the 15 checks"
    - "End-to-end integration test invokes `npx tsx scripts/phase-20-status.ts` against the current main tree (no mocks) and asserts exit code is `1` or `2` — the script MUST be capable of failing today (CONTEXT.md line 94 acceptance: 'can exit non-zero today')"
    - "Markdown stdout output contains all 16 DoD condition labels verbatim so a grep on the output of `npm run phase-20-status` is a sanity check that no condition was forgotten"
    - "CI integration: wired as a NON-blocking informational job (status reporter, not a merge gate) so visibility is constant from today through Phase 20 ship; gating happens organically because exit 0 is impossible until all upstream plans land"
    - "NO scope creep — this plan implements the AGGREGATOR + the per-check ARTIFACT INSPECTORS. The underlying capabilities (model cards, lookahead test, brier computation, ECE, fairness audit, telemetry, etc.) are produced by their own sub-plans (20-Z-02, 20-Z-07, 20-C-02, 20-B-03, 20-C-06, 20-Z-03 …). Each check here reads the artifacts those plans produce; it does NOT compute them"
  artifacts:
    - path: "scripts/phase-20-status.ts"
      provides: "Composite Phase-20 done gate entrypoint; loads every check, runs them, prints markdown summary, exits with rollup code"
      contains: "runAllChecks"
    - path: "scripts/lib/phase-20-checks/types.ts"
      provides: "Shared CheckResult + CheckDeps types used by every sub-check; defines the {pass | fail | pending} enum and the dependency-injection surface (Prisma + fs + exec + featuresPath + repoRoot)"
      contains: "export type CheckResult"
    - path: "scripts/lib/phase-20-checks/index.ts"
      provides: "Barrel export of all 15 sub-checks in DoD-condition order with their target branch label"
      contains: "export const ALL_CHECKS"
    - path: "scripts/lib/phase-20-checks/check-gme-crowded-consensus.ts"
      provides: "DoD #2 — replays the GME golden snapshot through the sentiment pipeline and asserts crowded_consensus=true on the rendered SentimentIntelligenceSection. Reads from 20-A-01 artifacts (flag exists in features.ts + UI component renders warning text). Returns pending if 20-A-01 has not landed."
      contains: "blocker_for: 2"
    - path: "scripts/lib/phase-20-checks/check-per-document-nlp-coverage.ts"
      provides: "DoD #3 — Prisma query: of last-7d SentimentObservation rows where source ∈ {news, community}, ≥80% have a non-null per_document_polarity field. Pending if SentimentObservation table absent (20-Z-01 not yet landed)."
      contains: "blocker_for: 3"
    - path: "scripts/lib/phase-20-checks/check-source-tier-data-driven.ts"
      provides: "DoD #4 — reads the SourceTier Prisma table populated by 20-B-04. Asserts (a) table exists with ≥1 row, (b) every row has computed_from_ic_at within last 35d (monthly cron freshness), (c) no row's weight comes from a hand-curated literal (verified by grepping SourceTier seed for hard-coded weight literals in src/)."
      contains: "blocker_for: 4"
    - path: "scripts/lib/phase-20-checks/check-time-decay-icir-uplift.ts"
      provides: "DoD #5 — reads the calibration result file written by 20-A-03 (`scripts/tune-decay.ts` output, JSON: `{ baseline_icir, decayed_icir, uplift }`). Pending if file absent. Fail if uplift < 0.05. Pass if uplift ≥ 0.05."
      contains: "blocker_for: 5"
    - path: "scripts/lib/phase-20-checks/check-per-source-icir-30d.ts"
      provides: "DoD #6 — Prisma query against the per-source ICIR table populated by 20-C-01 daily cron. Pass if ≥30 distinct days of non-null rolling_icir per source for ≥1 source. Pending if table absent."
      contains: "blocker_for: 6"
    - path: "scripts/lib/phase-20-checks/check-brier.ts"
      provides: "DoD #7 — reads the Brier metric JSON written by 20-C-02 (`metrics/brier-latest.json`). Pass if brier ≤ 0.24. Fail if > 0.24. Pending if file absent."
      contains: "blocker_for: 7"
    - path: "scripts/lib/phase-20-checks/check-ece.ts"
      provides: "DoD #8 — reads the per-classifier ECE JSON written by 20-B-03 monthly temperature-scaling cron. Pass if every shipped classifier has ECE ≤ 0.05. Fail if any > 0.05. Pending if file absent."
      contains: "blocker_for: 8"
    - path: "scripts/lib/phase-20-checks/check-bot-filter-fp-and-coordination-f1.ts"
      provides: "DoD #9 — reads two metric files: `metrics/bot-filter-fp-rate.json` (from 20-C-03 audit set) and `metrics/coordination-f1.json` (from 20-C-04 synthetic eval). Pass requires fp_rate ≤ 0.05 AND f1 ≥ 0.6. Pending if either file absent."
      contains: "blocker_for: 9"
    - path: "scripts/lib/phase-20-checks/check-numeric-grounding.ts"
      provides: "DoD #10 — invokes the 20-D-01 vitest spec via execSync (`npx vitest run tests/numeric-grounding.test.ts --run --reporter=json`) and parses the JSON for failed assertions. Pass if exit 0. Fail if exit non-zero with reported failures. Pending if spec file absent."
      contains: "blocker_for: 10"
    - path: "scripts/lib/phase-20-checks/check-citation-coverage.ts"
      provides: "DoD #11 — reads the 20-D-02 metric JSON `metrics/citation-coverage-latest.json` (per-golden-ticker coverage ratio). Pass if every golden ticker ≥ 0.80. Fail if any < 0.80. Pending if file absent."
      contains: "blocker_for: 11"
    - path: "scripts/lib/phase-20-checks/check-model-cards-fresh.ts"
      provides: "DoD #12 — invokes the 20-Z-02 model-card script (`npm run check-model-cards` if registered, else direct `npx tsx scripts/check-model-cards.ts`). Parses YAML frontmatter from each card and asserts `last_validated` is non-empty AND within 90d. Pass if script exits 0 AND every card meets freshness. Fail if script exits non-zero. Pending if script not yet present."
      contains: "blocker_for: 12"
    - path: "scripts/lib/phase-20-checks/check-lookahead-bias.ts"
      provides: "DoD #13 — invokes the 20-Z-07 vitest spec via execSync (`npx vitest run tests/integration/lookahead-bias.integration.test.ts --run`). Pass if exit 0. Fail if exit non-zero. Pending if spec file absent."
      contains: "blocker_for: 13"
    - path: "scripts/lib/phase-20-checks/check-telemetry-7d.ts"
      provides: "DoD #14 — Prisma query against the ProviderCallLog table from 20-Z-03. Counts DISTINCT date(call_started_at) over the last 14d filtered to non-null latency_ms; pass requires ≥7 distinct days. Pending if table absent. Mitigates the 'cron flap' threat (T-20-Z-06-03) by requiring distinct days, not row count."
      contains: "blocker_for: 14"
    - path: "scripts/lib/phase-20-checks/check-fairness-audit.ts"
      provides: "DoD #15 — file existence + content parse: asserts the 20-C-06 audit report (`docs/audits/phase-20-fairness.md`) exists, its YAML frontmatter contains a non-empty `segments` array with per-segment Brier+ECE, and at least one model card in `MODEL-CARD-*.md` references a `known_limitations` section."
      contains: "blocker_for: 15"
    - path: "scripts/lib/phase-20-checks/check-flags-graduated.ts"
      provides: "DoD #16 — reads `src/lib/features.ts`, finds Phase-20 flag identifiers (sourced from a static PHASE_20_FLAGS list mirroring the convention from model-card-status.ts PHASE_19_FLAGS at line 96), and asserts each is either ABSENT (graduated + cleanup done) OR present with an explicit `// DEFERRED:` comment with reason. Pass if every flag accounted for. Fail if any flag is in `off` or `shadow` state with no deferred-comment and no removal."
      contains: "blocker_for: 16"
    - path: "tests/phase-20-status.unit.test.ts"
      provides: "≥45 unit tests (3 per check × 15 checks) covering pass / fail / pending paths via injected mocks for Prisma + fs + exec; plus rollup tests asserting exit code policy (all-pass → 0, any-fail → 1, all-pending-no-fail → 2) and stdout format invariants (every DoD label present, branch grouping correct)"
      contains: "describe('phase-20-status check rollup'"
    - path: "tests/integration/phase-20-status.e2e.test.ts"
      provides: "End-to-end test invoking the real script via execSync against current main; asserts exit code is 1 or 2 (NOT 0) and that stdout contains all 16 DoD labels — the literal demonstration of CONTEXT.md line 94 acceptance ('can exit non-zero today')"
      contains: "exit code"
    - path: "package.json"
      provides: "New `phase-20-status` script entry following the `npx tsx scripts/<name>.ts` convention used by model-card-status (line 22) + dsr-pbo-audit (line 24) + alpha-decay-cron-benchmark (line 25)"
      contains: "phase-20-status"
  key_links:
    - from: "scripts/phase-20-status.ts"
      to: "scripts/lib/phase-20-checks/index.ts"
      via: "imports ALL_CHECKS, iterates, runs each with shared CheckDeps"
      pattern: "import.*ALL_CHECKS"
    - from: "scripts/lib/phase-20-checks/check-*.ts"
      to: "Phase-20 sub-plan artifacts (Prisma tables, JSON metric files, vitest specs)"
      via: "read-only inspection through injected deps; pending status when artifact absent"
      pattern: "status: 'pending'"
    - from: "package.json scripts.phase-20-status"
      to: "scripts/phase-20-status.ts"
      via: "npx tsx wrapper, mirroring model-card-status convention"
      pattern: "npx tsx scripts/phase-20-status.ts"
    - from: "tests/integration/phase-20-status.e2e.test.ts"
      to: "scripts/phase-20-status.ts"
      via: "execSync invocation; asserts non-zero exit on today's main"
      pattern: "execSync.*phase-20-status"
---

# Plan 20-Z-06: Composite Phase-20 done gate (`npm run phase-20-status`)

<universal_preamble>

## Autonomous Execution Clause

This plan is fully autonomous. The script is a read-only aggregator over artifacts produced by other Phase-20 plans; nothing it does mutates production state, and it can land before any of the upstream artifacts exist (per the acceptance criterion: "can exit non-zero today"). All three tasks proceed without operator confirmation.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:

1. **No shadow lifecycle to graduate** (S3 N/A — read-only aggregator; nothing toggled)
2. **No old code deleted** (additive only — new script + new check directory + new tests)
3. **No feature flag introduced** (script reads features.ts; never writes it)
4. `npm test` (Vitest unit) and `npm run test:integration` (live-Neon Vitest) all green on `main` post-commit. `npm run test:e2e` not exercised by this plan.
5. **Exit-code-non-zero acceptance**: `npm run phase-20-status` invoked on the post-commit `main` tree exits `1` or `2` (NOT `0`). Verified by the integration test in Task 3.
6. **Coverage acceptance**: every one of the 16 DoD conditions from CONTEXT.md lines 145-163 is enumerated in `scripts/lib/phase-20-checks/index.ts` (DoD #1 is the rollup line, not a sub-check; DoD #2 through #16 are sub-checks → 15 sub-check entries in `ALL_CHECKS`).
7. **Three-valued logic acceptance**: every sub-check has a unit test exercising each of the three return paths {pass, fail, pending}; total ≥45 unit tests across the 15 checks plus the rollup tests.
8. **No-LLM-no-fuzzy acceptance**: `grep -E "anthropic|openai|gemini|generateObject" scripts/lib/phase-20-checks/` returns zero matches. `grep -E "process\\.env\\." scripts/lib/phase-20-checks/` returns zero matches outside dependency-injection bootstrap (thresholds are HARD-CODED constants per T-19-Z-04-01 precedent — the gate cannot be relaxed at deploy time).

</universal_preamble>

<objective>
Implement the composite Phase-20 done gate (`npm run phase-20-status`) as the analog of the existing `npm run model-card-status` (Phase 19's `scripts/model-card-status.ts`). The script aggregates 15 read-only artifact inspections covering DoD #2 through #16 of Phase 20 (CONTEXT.md lines 145-163; DoD #1 is the script's own rollup), exits 0 only when every check passes, and is capable of running TODAY against current main and exiting non-zero (status `2 = pending` for all checks, since none of the upstream artifacts have landed yet). This is the central visibility surface for "is Phase 20 done?" — a single command, a single exit code, a single markdown summary grouped into the four execution branches (Sentiment / Calibration / Report / Hygiene).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@scripts/model-card-status.ts
@scripts/lib/

<interfaces>
```typescript
// scripts/lib/phase-20-checks/types.ts — shared types for every check.

/**
 * Three-valued result. The 'pending' state is mandatory: it distinguishes
 * "the upstream artifact has not landed yet" (pending) from "the artifact
 * landed but the criterion is violated" (fail). The script returns exit
 * code 1 only when at least one check is `fail`, and exit 2 when no checks
 * fail but at least one is pending — this is the post-commit state on day 1.
 */
export type CheckStatus = 'pass' | 'fail' | 'pending';

export type CheckBranch = 'sentiment' | 'calibration' | 'report' | 'hygiene';

export type CheckResult = {
  /** Stable identifier (kebab-case) used in stdout and in test assertions. */
  name: string;
  /** Verbatim DoD label from CONTEXT.md (lines 145-163), printed in stdout. */
  dod_label: string;
  /** DoD condition number (2-16); 1 is the rollup itself, not a sub-check. */
  blocker_for: number;
  /** Branch grouping for stdout sectioning. */
  branch: CheckBranch;
  /** Result. */
  status: CheckStatus;
  /** Human-readable evidence string (number, file path, query result, …). */
  evidence: string;
};

/**
 * Dependency-injection surface so every sub-check is unit-testable
 * without spawning Prisma/Neon/the real fs/the real shell. The script
 * entrypoint wires real implementations; tests pass mocks.
 */
export type CheckDeps = {
  prisma: {
    sentimentObservation?: {
      count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
    };
    sourceTier?: {
      findMany: (args?: { where?: Record<string, unknown> }) => Promise<Array<Record<string, unknown>>>;
    };
    providerCallLog?: {
      findMany: (args?: { where?: Record<string, unknown>; select?: Record<string, boolean> }) => Promise<Array<{ call_started_at: Date }>>;
    };
    sourceIcir?: {
      groupBy: (args: Record<string, unknown>) => Promise<Array<{ source: string; _count: { _all: number } }>>;
    };
    // Add per-check-needed shapes here as upstream plans land.
  };
  fs: {
    readFileSync: (path: string) => string;
    existsSync: (path: string) => boolean;
  };
  exec: (cmd: string) => { exitCode: number; stdout: string; stderr: string };
  featuresPath: string;       // src/lib/features.ts
  modelCardsGlob: string;     // MODEL-CARD-*.md under repoRoot
  metricsDir: string;         // metrics/ for JSON outputs from upstream plans
  repoRoot: string;
};

export type CheckFn = (deps: CheckDeps) => Promise<CheckResult>;
```

```typescript
// scripts/lib/phase-20-checks/index.ts — the canonical 15-check registry.

import type { CheckFn } from './types';
// (15 imports, one per check file)

/** Order matches CONTEXT.md DoD numbering (#2 first, #16 last). */
export const ALL_CHECKS: CheckFn[] = [
  checkGmeCrowdedConsensus,            // DoD #2  — sentiment branch
  checkPerDocumentNlpCoverage,         // DoD #3  — sentiment
  checkSourceTierDataDriven,           // DoD #4  — sentiment
  checkTimeDecayIcirUplift,            // DoD #5  — sentiment
  checkPerSourceIcir30d,               // DoD #6  — calibration
  checkBrier,                          // DoD #7  — calibration
  checkEce,                            // DoD #8  — calibration
  checkBotFilterFpAndCoordinationF1,   // DoD #9  — calibration
  checkNumericGrounding,               // DoD #10 — report
  checkCitationCoverage,               // DoD #11 — report
  checkModelCardsFresh,                // DoD #12 — hygiene
  checkLookaheadBias,                  // DoD #13 — hygiene
  checkTelemetry7d,                    // DoD #14 — hygiene
  checkFairnessAudit,                  // DoD #15 — hygiene
  checkFlagsGraduated,                 // DoD #16 — hygiene
];
```

```typescript
// scripts/phase-20-status.ts — entrypoint contract.

export async function runAllChecks(deps: CheckDeps): Promise<CheckResult[]>;

/**
 * Rollup exit code:
 *   0  → every CheckResult.status === 'pass'                  (Phase 20 done)
 *   1  → at least one CheckResult.status === 'fail'           (regression)
 *   2  → ≥1 'pending' AND 0 'fail'                            (pre-launch — today's main)
 */
export function rollupExitCode(results: CheckResult[]): 0 | 1 | 2;

/** Stdout: 4 sections (Sentiment / Calibration / Report / Hygiene), totals row, exit-code line. */
export function renderMarkdownSummary(results: CheckResult[]): string;
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-Z-06-01 | Tampering | False-pass — a check returns 'pass' when the underlying artifact is broken (e.g., model card exists as an empty file) | mitigate | Every check inspects content, not just file existence. `check-model-cards-fresh.ts` parses YAML frontmatter and asserts `last_validated` non-empty + within 90d. `check-fairness-audit.ts` parses the audit's `segments` array. `check-source-tier-data-driven.ts` asserts every row has `computed_from_ic_at` within 35d AND no hand-curated literal in src/. Unit tests cover an "artifact exists but is malformed" path that must return `fail`, not `pass`. |
| T-20-Z-06-02 | Configuration | Brittle DB queries — schema changes from upstream plans (20-Z-01, 20-Z-03, 20-C-01, 20-B-04) break the script with a thrown error rather than a clean `pending` | mitigate | Every Prisma access is wrapped in try/catch. Caught errors return `{ status: 'pending', evidence: 'query failed: …' }` rather than `fail` — a missing table is a "not yet landed" condition, not a regression. Queries use the Prisma client (typed shapes), not raw SQL where possible. The script's own typecheck (`tsc --noEmit`) runs against the live `prisma generate` output, so schema drift surfaces at build time. |
| T-20-Z-06-03 | Tampering | Cron flap — telemetry-7d check passes intermittently because a single backfill batch produces 7 rows on a single day | mitigate | `check-telemetry-7d.ts` requires ≥7 DISTINCT calendar days (UTC) of non-null `latency_ms` rows over the last 14d window, computed via `new Set(rows.map(r => r.call_started_at.toISOString().slice(0, 10))).size >= 7`. Bursty backfill on one day cannot satisfy this. Unit test injects a 14-row fixture all on one day and asserts `fail`/`pending`, never `pass`. |
| T-20-Z-06-04 | Configuration | Self-referential dependency — DoD #1 is "`npm run phase-20-status` exits 0," which would create a circular check if implemented as a sub-check | mitigate | DoD #1 is explicitly excluded from `ALL_CHECKS`. It's the script's own rollup exit code, surfaced in the stdout footer (`Rollup: <pass-count>/<total>; exit code <0|1|2>`). The 15 sub-checks cover DoD #2 through #16 only. Inline comment in `index.ts` documents this exclusion. |
| T-20-Z-06-05 | Tampering | Threshold relaxation — an operator under pressure tries to lower a threshold (e.g., Brier ≤ 0.30 instead of ≤ 0.24) via env var to ship | mitigate | All 15 thresholds are HARD-CODED constants in their respective check files (Brier ≤ 0.24, ECE ≤ 0.05, FP rate ≤ 0.05, F1 ≥ 0.6, citation coverage ≥ 0.80, ICIR uplift ≥ 0.05, telemetry ≥7 days, model card freshness ≤ 90d). The `<universal_preamble>` cleanup gate enforces a `grep -E "process\\.env\\." scripts/lib/phase-20-checks/` returning zero matches. Mirrors T-19-Z-04-01 precedent in `scripts/model-card-status.ts`. |
| T-20-Z-06-06 | Tampering | Scope creep — a check accidentally COMPUTES a metric (e.g., runs Brier scoring inline) instead of READING the metric file produced by the upstream plan | mitigate | Every check is ≤80 LOC, single-responsibility (one DB query OR one file parse OR one execSync). Code review checklist (in the universal preamble): "this check reads an artifact, it does not produce one." Cross-reference comment at the top of each check naming the upstream plan that owns the artifact (`// Owned by 20-C-02 — this script only consumes`). |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="20-Z-06-01">
  <name>Task 1: Define types + per-check stubs + ALL_CHECKS registry (RED)</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (lines 145-163 — verbatim DoD #2 through #16, copy these as `dod_label` strings; line 94 — the 20-Z-06 acceptance row)
    - scripts/model-card-status.ts (lines 33-71 — RunChecksDeps + Check shape; lines 96-111 — PHASE_19_FLAGS pattern; lines 121-360 — runChecks structure; lines 403-471 — main() bootstrap)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (the SentimentObservation table being checked by DoD #3)
  </read_first>
  <behavior>
    Unit tests in `tests/phase-20-status.unit.test.ts` (RED — no implementation yet):

    **Rollup tests (3):**
    - `rollupExitCode([all-pass × 15])` returns `0`
    - `rollupExitCode([1 fail, 14 pass])` returns `1`
    - `rollupExitCode([1 pending, 14 pass, 0 fail])` returns `2`

    **ALL_CHECKS registry tests (4):**
    - `ALL_CHECKS.length === 15`
    - `ALL_CHECKS.map(c => c.name)` is a unique set (no dup names)
    - `ALL_CHECKS.map(c => c.blocker_for).sort((a,b)=>a-b)` deep-equals `[2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]`
    - For each result of `await Promise.all(ALL_CHECKS.map(c => c({...allMocksPending}))))`: `result.status === 'pending'` AND `result.dod_label` matches the verbatim CONTEXT.md text for that condition number

    **renderMarkdownSummary invariants (3):**
    - Output contains all 4 branch headings: `## Sentiment`, `## Calibration`, `## Report`, `## Hygiene`
    - Output contains every `dod_label` from `ALL_CHECKS` verbatim
    - Output contains a final line matching `/^Rollup: \d+\/15; exit code [012]$/m`

    **Per-check stub tests (15 × 3 = 45):** each check, when given mocks that return (a) artifact-absent → `pending`, (b) artifact-present-but-violation → `fail`, (c) artifact-present-and-met → `pass`. For Task 1 these tests can assert against the stub's three-valued return; Task 2 fills in the real inspection logic. Tests use injected mocks ONLY — no real DB, no real fs, no real exec.
  </behavior>
  <action>
    1. **Create `scripts/lib/phase-20-checks/types.ts`** — exact contents from the `<interfaces>` block above (CheckStatus, CheckBranch, CheckResult, CheckDeps, CheckFn).

    2. **Create 15 stub files under `scripts/lib/phase-20-checks/`**, one per DoD condition #2-#16. Each stub:
       - Has a header comment naming the upstream plan that owns the artifact: `// Owned by 20-A-01 — this script only consumes the rendered crowded_consensus flag.`
       - Exports a `CheckFn` returning `{ name, dod_label, blocker_for, branch, status: 'pending', evidence: 'stub' }`
       - File-naming convention matches the `files_modified` list verbatim (kebab-case, `check-` prefix).

    3. **Create `scripts/lib/phase-20-checks/index.ts`** with the `ALL_CHECKS` array per the `<interfaces>` block — 15 entries in DoD-order #2 through #16. Add an inline comment documenting that DoD #1 is the rollup exit code, NOT a sub-check (mitigation T-20-Z-06-04).

    4. **Create `scripts/phase-20-status.ts`** entrypoint exporting `runAllChecks`, `rollupExitCode`, `renderMarkdownSummary` per the `<interfaces>` block. The `main()` bootstrap mirrors `scripts/model-card-status.ts` lines 403-471 (lazy import of node:child_process / fs / dotenv / Prisma; build CheckDeps; call runAllChecks; print markdown; exit with rollupExitCode).

    5. **Create `tests/phase-20-status.unit.test.ts`** with the test bodies described in `<behavior>` (3 rollup + 4 registry + 3 markdown + 45 per-check stub paths). All 45 stub-path tests can pass against the stubs because every stub returns 'pending' — but tests for `fail` and `pass` paths are written NOW with the expected `evidence` strings, then will turn from RED→GREEN one-by-one as Task 2 fills in real logic.

    6. **Add `package.json` script entry** at line ~31 (after `wave-b-rollout-status`):
       ```json
       "phase-20-status": "npx tsx scripts/phase-20-status.ts",
       ```
       Mirrors the convention of `model-card-status` (line 22) and `dsr-pbo-audit` (line 24).
  </action>
  <acceptance_criteria>
    - `npx vitest run tests/phase-20-status.unit.test.ts` runs ≥52 tests; rollup + registry + markdown tests are GREEN; the 45 per-check tests are RED for {pass, fail} paths and GREEN for {pending} path
    - `grep -c "ALL_CHECKS\\[" tests/phase-20-status.unit.test.ts` returns ≥1 (registry iteration test exists)
    - `ls scripts/lib/phase-20-checks/check-*.ts | wc -l` returns 15
    - `grep -c "blocker_for" scripts/lib/phase-20-checks/check-*.ts` returns 15 (one per file)
    - `grep -E "process\\.env\\." scripts/lib/phase-20-checks/check-*.ts` returns 0 matches (per T-20-Z-06-05)
    - `npm run phase-20-status` exits 2 (all 15 checks return 'pending', 0 fail) — proves "can exit non-zero today"
  </acceptance_criteria>
  <automated>npx vitest run tests/phase-20-status.unit.test.ts 2>&1 | grep -qE "(passed|failed)" && npm run phase-20-status; test $? -eq 2</automated>
  <done>15 stubs + types + registry + entrypoint + 52 RED-or-GREEN unit tests committed; `npm run phase-20-status` exits 2; ALL_CHECKS covers DoD #2-#16 inclusive</done>
</task>

<task type="auto" tdd="true" id="20-Z-06-02">
  <name>Task 2: Implement real inspection logic for all 15 checks (GREEN)</name>
  <read_first>
    - scripts/model-card-status.ts (lines 121-360 — read patterns to follow: try/catch around every Prisma call, vacuous-true handling for empty data, sumRgCountOutput helper for grep results)
    - scripts/lib/phase-20-checks/types.ts (Task 1's CheckDeps surface — extend per-check Prisma shapes here as needed)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (lines 88-141 — every Wave Z/A/B/C/D plan's "Acceptance" column tells you what artifact each check should read)
  </read_first>
  <behavior>
    For each of the 15 check files, replace the Task-1 stub with the real inspection logic per the artifact-mapping in `must_haves.artifacts`. Each implementation:

    - Wraps every Prisma access in try/catch; caught errors → `{ status: 'pending', evidence: 'query failed: …' }` per T-20-Z-06-02
    - Wraps every fs access with `existsSync` first; missing file → `{ status: 'pending', evidence: 'artifact not yet present: <path>' }`
    - Wraps every execSync with try/catch; non-zero exit when artifact absent → `pending`; non-zero exit when artifact present → `fail`
    - Threshold constants are HARD-CODED at the top of each file with a comment naming the source (CONTEXT.md DoD line, peer-reviewed cite, or upstream PLAN.md acceptance) per T-20-Z-06-05
    - Returns `dod_label` matching the verbatim CONTEXT.md condition text

    The 45 per-check unit tests written in Task 1 turn GREEN one check at a time. Add per-check edge-case tests where the artifact mapping needs them:
    - `check-telemetry-7d.ts`: cron-flap test — 14 rows on a single day → `fail`/`pending`, never `pass` (T-20-Z-06-03)
    - `check-model-cards-fresh.ts`: empty-file test — model card exists but YAML frontmatter empty → `fail`, not `pass` (T-20-Z-06-01)
    - `check-source-tier-data-driven.ts`: hand-curated-literal test — SourceTier table present but src/ contains a hard-coded weight literal → `fail` (per CONTEXT.md line 116, "no hand-curated entries shipping")
  </behavior>
  <action>
    Implement all 15 check files. For each, use this template:

    ```typescript
    // scripts/lib/phase-20-checks/check-<name>.ts
    // Owned by 20-<X-Y> — this script only consumes the artifact, never produces it.
    import type { CheckFn } from './types';

    // Threshold per CONTEXT.md DoD #<N> (line <line>): "<verbatim text>"
    const THRESHOLD = <literal>;

    export const check<Name>: CheckFn = async (deps) => {
      const base = {
        name: '<kebab-name>',
        dod_label: '<verbatim CONTEXT.md text>',
        blocker_for: <2..16>,
        branch: '<sentiment|calibration|report|hygiene>',
      } as const;
      try {
        // 1. Check artifact presence (existsSync, table presence, etc.).
        //    If absent → return { ...base, status: 'pending', evidence: '…' }.
        // 2. Read + parse the artifact (no LLM, no fuzzy logic).
        // 3. Compare against THRESHOLD.
        //    - met     → { ...base, status: 'pass',    evidence: '…' }
        //    - violated→ { ...base, status: 'fail',    evidence: '…' }
      } catch (err) {
        return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
      }
    };
    ```

    Per-check artifact mapping (verbatim from `must_haves.artifacts` so executors can implement directly without re-reading CONTEXT.md):

    | Check | DoD # | Branch | Artifact read | Pass criterion |
    |---|---|---|---|---|
    | check-gme-crowded-consensus | 2 | sentiment | replays GME golden snapshot, inspects rendered crowded_consensus flag | flag === true |
    | check-per-document-nlp-coverage | 3 | sentiment | Prisma `SentimentObservation` last-7d, source ∈ {news, community} | non-null per_document_polarity ratio ≥ 0.80 |
    | check-source-tier-data-driven | 4 | sentiment | Prisma `SourceTier` + grep src/ for hard-coded weight literals | ≥1 row, every row computed_from_ic_at within 35d, zero hand-curated literals |
    | check-time-decay-icir-uplift | 5 | sentiment | `metrics/time-decay-icir.json` from 20-A-03 | uplift ≥ 0.05 |
    | check-per-source-icir-30d | 6 | calibration | Prisma per-source ICIR table from 20-C-01 | ≥30 distinct days for ≥1 source |
    | check-brier | 7 | calibration | `metrics/brier-latest.json` from 20-C-02 | brier ≤ 0.24 |
    | check-ece | 8 | calibration | `metrics/ece-per-classifier.json` from 20-B-03 | every classifier ECE ≤ 0.05 |
    | check-bot-filter-fp-and-coordination-f1 | 9 | calibration | `metrics/bot-filter-fp-rate.json` + `metrics/coordination-f1.json` | fp ≤ 0.05 AND f1 ≥ 0.6 |
    | check-numeric-grounding | 10 | report | execSync vitest spec from 20-D-01 | exit 0 |
    | check-citation-coverage | 11 | report | `metrics/citation-coverage-latest.json` from 20-D-02 | every golden ticker ≥ 0.80 |
    | check-model-cards-fresh | 12 | hygiene | execSync 20-Z-02 model-card script + parse YAML frontmatter | script exit 0 AND every card last_validated within 90d |
    | check-lookahead-bias | 13 | hygiene | execSync vitest spec from 20-Z-07 | exit 0 |
    | check-telemetry-7d | 14 | hygiene | Prisma `ProviderCallLog` last 14d | DISTINCT(date(call_started_at)) ≥ 7 |
    | check-fairness-audit | 15 | hygiene | `docs/audits/phase-20-fairness.md` + ≥1 model card with known_limitations | file exists, segments array non-empty, ≥1 known_limitation reference |
    | check-flags-graduated | 16 | hygiene | parse src/lib/features.ts for PHASE_20_FLAGS list | every flag absent OR has `// DEFERRED:` comment with reason |

    Add per-check edge-case tests as listed in `<behavior>`.
  </action>
  <acceptance_criteria>
    - All 45 per-check unit tests are GREEN: `npx vitest run tests/phase-20-status.unit.test.ts` exits 0 with ≥52 passing
    - `grep -c "status: 'pending'" scripts/lib/phase-20-checks/check-*.ts` returns ≥15 (every file has a pending path)
    - `grep -c "status: 'fail'" scripts/lib/phase-20-checks/check-*.ts` returns ≥15 (every file has a fail path)
    - `grep -c "status: 'pass'" scripts/lib/phase-20-checks/check-*.ts` returns ≥15 (every file has a pass path)
    - `grep -E "anthropic|openai|gemini|generateObject" scripts/lib/phase-20-checks/` returns 0 matches (per `<universal_preamble>` cleanup gate point 8)
    - `grep -E "process\\.env\\." scripts/lib/phase-20-checks/` returns 0 matches (T-20-Z-06-05)
    - `npm run phase-20-status` still exits 2 on today's main (artifacts not yet present); markdown stdout contains all 4 branch headings and all 16 DoD labels
  </acceptance_criteria>
  <automated>npx vitest run tests/phase-20-status.unit.test.ts && npm run phase-20-status; test $? -eq 2</automated>
  <done>All 15 checks have real inspection logic; 45+ unit tests GREEN; cron-flap + empty-card + hand-curated-literal edge cases covered; no LLM/no env-var threshold paths</done>
</task>

<task type="auto" id="20-Z-06-03">
  <name>Task 3: End-to-end integration test + CI wiring + commit</name>
  <read_first>
    - vitest.integration.config.ts (the integration-test runner config)
    - .github/workflows/ if present, else CONTEXT.md S6/S8 (CI wiring conventions)
    - package.json (verify the new `phase-20-status` script is callable via `npm run`)
  </read_first>
  <action>
    1. **Create `tests/integration/phase-20-status.e2e.test.ts`**:
       ```typescript
       import { execSync } from 'node:child_process';
       import { describe, it, expect } from 'vitest';

       describe('phase-20-status (end-to-end on current main)', () => {
         it('exits 1 or 2 (non-zero) — Phase 20 is NOT yet done', () => {
           let exitCode = 0;
           let stdout = '';
           try {
             stdout = execSync('npm run phase-20-status --silent', { encoding: 'utf8' });
           } catch (err) {
             const e = err as { status?: number; stdout?: Buffer | string };
             exitCode = typeof e.status === 'number' ? e.status : -1;
             stdout = String(e.stdout ?? '');
           }
           expect(exitCode === 1 || exitCode === 2).toBe(true);
         });

         it('stdout enumerates all 16 DoD condition labels verbatim', () => {
           // Run, capture stdout, assert each verbatim CONTEXT.md DoD label
           // (#1 in the rollup line; #2-#16 in the per-check lines) appears.
           // …
         });

         it('stdout contains all 4 branch headings', () => {
           // Sentiment, Calibration, Report, Hygiene.
         });
       });
       ```
       Ensures CONTEXT.md line 94 acceptance ("can exit non-zero today") is mechanically verified on every CI run.

    2. **Wire as a NON-blocking informational CI job**. If `.github/workflows/ci.yml` exists, add a job:
       ```yaml
       phase-20-status:
         name: Phase 20 Done Gate (informational)
         runs-on: ubuntu-latest
         continue-on-error: true   # informational only — exit non-zero is expected until Phase 20 ships
         steps:
           - uses: actions/checkout@v4
           - uses: actions/setup-node@v4
             with: { node-version: '20' }
           - run: npm ci
           - run: npm run phase-20-status || echo "expected non-zero until Phase 20 ships"
       ```
       If no GitHub Actions workflow exists, document the wiring as a TODO comment at the top of `scripts/phase-20-status.ts` (`// CI wiring: run `npm run phase-20-status` as continue-on-error informational job`).

    3. **Run the full suites**:
       - `npx vitest run` — must exit 0
       - `npx vitest run --config vitest.integration.config.ts` — must exit 0 (skip if no DATABASE_URL — note explicitly in commit body)

    4. **Commit**:
       ```
       feat(20-z-06): composite phase-20 done gate (npm run phase-20-status)

       15 read-only checks aggregating Phase 20 DoD #2 through #16 (CONTEXT.md
       lines 145-163). Three-valued logic {pass | fail | pending} so
       "artifact not yet landed" (pending) is distinct from "artifact present
       but criterion violated" (fail). Exit codes: 0 = all pass, 1 = any fail,
       2 = ≥1 pending and 0 fail.

       Today's main exits 2 — every upstream artifact (model cards, lookahead
       test, brier metric, ECE, fairness audit, telemetry, etc.) is owned by
       its own sub-plan and has not landed yet. This script is the visibility
       surface that turns from exit 2 → exit 0 as those plans land.

       Wired to CI as a NON-blocking informational job — gating happens
       organically because exit 0 is impossible until every Phase 20 artifact
       is in place.

       Mirrors the 19-Z-04 model-card-status pattern. Thresholds hard-coded
       (no env var relaxation, per T-19-Z-04-01 / T-20-Z-06-05).

       Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
       ```
  </action>
  <acceptance_criteria>
    - `npx vitest run tests/integration/phase-20-status.e2e.test.ts` exits 0 (the test asserting non-zero exit of `npm run phase-20-status` is itself a passing assertion)
    - `npm run phase-20-status` invoked manually exits 1 or 2, NEVER 0 (since no Phase-20 artifacts have landed)
    - `npx vitest run` exits 0 (no regression)
    - `git log -1 --pretty=%s` matches `/^feat\(20-z-06\):/`
    - The commit touches all files in `files_modified` and no others
  </acceptance_criteria>
  <automated>npx vitest run tests/integration/phase-20-status.e2e.test.ts && npx vitest run && git log -1 --pretty=%s | grep -q "20-z-06"</automated>
  <done>End-to-end test green; CI wiring committed (or TODO documented); `npm run phase-20-status` exits non-zero on today's main and reports all 16 DoD conditions; commit landed</done>
</task>

</tasks>

<verification>

Numerical acceptance (per S8):

1. **Script exists + callable**: `npm run phase-20-status` is a valid npm script (`grep -q "phase-20-status" package.json` passes)
2. **Exits non-zero today** (the headline acceptance from CONTEXT.md line 94): `npm run phase-20-status; test $? -eq 1 -o $? -eq 2`
3. **All 16 DoD conditions enumerated**: `ls scripts/lib/phase-20-checks/check-*.ts | wc -l` returns 15 (DoD #1 is the rollup, not a sub-check); `grep -c "blocker_for: " scripts/lib/phase-20-checks/check-*.ts | awk -F: '{s+=$2} END {print s}'` returns 15
4. **Three-valued logic on every check**: `grep -lE "status: 'pass'" scripts/lib/phase-20-checks/check-*.ts | wc -l` ≥15; same for `fail` and `pending`
5. **Test coverage on all 4 gate branches**: `grep -c "Sentiment\\|Calibration\\|Report\\|Hygiene" tests/phase-20-status.unit.test.ts` ≥4 (one assertion per branch grouping)
6. **Per-check unit tests cover {pass, fail, pending}**: `grep -c "expect.*status.*'pass'\\|expect.*status.*'fail'\\|expect.*status.*'pending'" tests/phase-20-status.unit.test.ts` ≥45
7. **End-to-end exit code**: `npx vitest run tests/integration/phase-20-status.e2e.test.ts` exits 0 (the test asserting non-zero exit is itself green)
8. **Markdown stdout contains all 16 DoD labels**: `npm run phase-20-status 2>&1 | grep -cE "(crowded_consensus|Per-document NLP|Source-tier|Time decay|ICIR|Brier|ECE|Bot-filter|Numeric-grounding|Citation-coverage|Model cards|Lookahead-bias|Telemetry|Fairness|flags graduated|phase-20-status)"` returns ≥16
9. **No threshold relaxation paths**: `grep -E "process\\.env\\." scripts/lib/phase-20-checks/` returns zero matches; `grep -E "anthropic|openai|gemini|generateObject" scripts/lib/phase-20-checks/` returns zero matches (no LLM, no env-var-driven thresholds)
10. **Self-referential dependency excluded**: `grep -c "blocker_for: 1\\b" scripts/lib/phase-20-checks/` returns 0 (DoD #1 is the rollup, never a sub-check; T-20-Z-06-04)
11. **`npm test`** exits 0 (no regression)
12. **`npm run test:integration`** exits 0 when `DATABASE_URL` is set (no regression)

</verification>

<success_criteria>

This plan ships when:

- `npm run phase-20-status` is callable from any working directory in the repo and prints a 4-section markdown summary plus a rollup exit code
- The script's first run on today's main exits `2` (all 15 sub-checks return `pending`) — this is the literal demonstration of CONTEXT.md line 94 acceptance ("can exit non-zero today")
- As each Phase-20 sub-plan lands its artifact (model cards from 20-Z-02, lookahead test from 20-Z-07, brier metric from 20-C-02, ECE per-classifier from 20-B-03, fairness audit from 20-C-06, telemetry from 20-Z-03, time-decay metric from 20-A-03, source-tier table from 20-B-04, …), the corresponding sub-check transitions `pending → pass` (or `pending → fail` if the criterion isn't met), without any change to this script
- The day every Phase-20 artifact is in place AND every numerical criterion is met, the script exits `0` — and that is Phase 20's done-gate signal

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-Z-06-SUMMARY.md` documenting:
- The 15-check inventory (one row per DoD condition, with the artifact each reads + the upstream plan that owns it)
- The exit-code policy table {0, 1, 2}
- The current rollup state on the post-commit main (expected: exit 2, all 15 pending)
- The CI wiring (informational job, non-blocking)
- A reminder that DoD #1 is the rollup itself, never a sub-check (per T-20-Z-06-04)
</output>
