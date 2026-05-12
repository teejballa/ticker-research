---
phase: 20
plan: 20-Z-06
subsystem: composite-done-gate
tags:
  - phase-status
  - composite-gate
  - read-only-aggregator
  - three-valued-logic
  - dependency-injection
  - threat-model
  - hard-coded-thresholds

# Dependency graph
requires:
  - phase: 20-Z-01
    provides: SentimentObservation Prisma model — DoD #3 inspects it (per-document NLP coverage)
  - phase: 20-Z-02
    provides: check-model-cards script + retroactive cards — DoD #12 invokes the script and parses YAML frontmatter
  - phase: 20-Z-03
    provides: ProviderCallLog Prisma table — DoD #14 inspects distinct-days-of-telemetry
  - phase: 20-Z-04
    provides: versioned prompt registry CI gate convention — mirrored by phase-20-status's hard-coded thresholds (T-20-Z-04-01 precedent)
  - phase: 20-Z-05
    provides: eval-judge harness + npm run eval — DoD #11 + future composition path
provides:
  - "npm run phase-20-status — composite read-only aggregator over 15 Phase-20 DoD sub-checks"
  - "scripts/phase-20-status.ts entrypoint exporting runAllChecks + rollupExitCode + renderMarkdownSummary as pure functions (testable without spawning the script)"
  - "scripts/lib/phase-20-checks/ — 15 per-DoD inspectors (≤80 LOC each, single-purpose, DI surface)"
  - "Three-valued logic {pass | fail | pending} so 'artifact not yet landed' (pending) is distinct from 'artifact present but criterion violated' (fail)"
  - "58 unit tests + 3 e2e integration tests covering rollup policy, registry invariants, markdown invariants, every per-check path, and threat-model edge cases"
  - ".github/workflows/phase-20.yml — informational (non-blocking) CI job emitting GitHub annotations on exit codes 0/1/2"

affects:
  - 20-A-01   # provides DoD #2 artifact (GME crowded_consensus golden)
  - 20-A-03   # provides DoD #5 artifact (metrics/time-decay-icir.json)
  - 20-B-01   # populates per_document_polarity (DoD #3)
  - 20-B-03   # provides DoD #8 artifact (metrics/ece-per-classifier.json)
  - 20-B-04   # provides DoD #4 artifact (SourceTier Prisma table)
  - 20-C-01   # provides DoD #6 artifact (per-source ICIR table)
  - 20-C-02   # provides DoD #7 artifact (metrics/brier-latest.json)
  - 20-C-03   # provides DoD #9 artifact (metrics/bot-filter-fp-rate.json)
  - 20-C-04   # provides DoD #9 artifact (metrics/coordination-f1.json)
  - 20-C-06   # provides DoD #15 artifact (docs/audits/phase-20-fairness.md)
  - 20-D-01   # provides DoD #10 artifact (tests/numeric-grounding.test.ts)
  - 20-D-02   # provides DoD #11 artifact (metrics/citation-coverage-latest.json)
  - 20-Z-07   # provides DoD #13 artifact (tests/integration/lookahead-bias.integration.test.ts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DI-on-CheckDeps composite gate — every sub-check accepts a typed deps object (prisma + fs + exec + paths) so unit tests inject mocks without spawning the script"
    - "Three-valued status enum — pass / fail / pending — encoded at the type level (CheckStatus union) and enforced by the rollup exit-code policy"
    - "Hard-coded threshold constants per file — no process.env reads anywhere in scripts/lib/phase-20-checks/ (T-20-Z-06-05 mitigation mirroring T-19-Z-04-01 precedent)"
    - "Cron-flap mitigation via Set-of-distinct-ISO-dates — telemetry-7d cannot be satisfied by 14 rows on one day (T-20-Z-06-03)"
    - "Header-comment ownership convention — every check-*.ts file starts with `// Owned by 20-X-YY — this script only consumes` (T-20-Z-06-06 scope-creep deterrent)"
    - "DoD #1 explicitly excluded from ALL_CHECKS — it's the script's own rollup exit code, documented in index.ts (T-20-Z-06-04 self-reference mitigation)"

key-files:
  created:
    - scripts/phase-20-status.ts
    - scripts/lib/phase-20-checks/types.ts
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
    - tests/phase-20-status.unit.test.ts
    - tests/integration/phase-20-status.e2e.test.ts
    - .github/workflows/phase-20.yml
  modified:
    - package.json   # +phase-20-status npm script

key-decisions:
  - "Bundled Tasks 1 (RED stubs) and 2 (GREEN real inspection logic) into a single feat commit. The per-check inspection logic is ≤80 LOC of template-shaped code (one fs.existsSync + one parse/query + one comparison); writing stubs first then immediately overwriting them with real logic would have generated wasteful churn. Mirrors Z-04's 'Task 5 bundled into 2 + 3' pattern."
  - "Three-valued logic encoded at the TYPE level (CheckStatus = 'pass' | 'fail' | 'pending') rather than via boolean + side-channel. The compiler enforces exhaustive handling at the rollup, and unit tests can assert against the exact string. The 'pending' state's first-class status is the entire reason this script can land on today's main and exit non-zero without being a regression."
  - "DI surface (CheckDeps) is the unit-test boundary, not the script boundary. The script entrypoint's main() wires execSync + node:fs + the real Prisma client; the checks themselves never reach for any of those directly. Result: every per-check unit test runs in <1ms (no fs touched, no Prisma started) and the e2e integration test is the SOLE caller of the real script."
  - "DoD #16 (flags-graduated) handles vacuous truth: if a PHASE_20_FLAGS entry is ABSENT from features.ts, that's 'graduated + cleanup done' → pass. The 'fail' path fires only when a flag is PRESENT without a `// DEFERRED:` comment. This is the same pattern as 19-Z-04 PHASE_19_FLAGS — graduation is signaled by removal from the manifest."
  - "Column-name correction on check-telemetry-7d.ts (Rule 3 deviation): the plan's CheckDeps shape declared `call_started_at` and `latency_ms`, but the actual 20-Z-03 ProviderCallLog schema uses `started_at` and `duration_ms`. Caught immediately when the script first ran against live Neon — Prisma threw `PrismaClientValidationError: Unknown argument 'call_started_at'`. Fixed inline in types.ts + the check + unit tests. The 'distinct days' invariant (T-20-Z-06-03 mitigation) was unchanged by the fix."
  - "CI workflow is INFORMATIONAL (continue-on-error: true) and emits GitHub annotations on exit codes 0/1/2 — never blocks a PR. Gating happens organically because exit 0 is impossible until every upstream artifact lands. Aligns with the 20-Z-04 prompts.yml precedent (PR-scoped path filter + non-failing diagnostic)."

requirements-completed: []

# Metrics
duration: ~9min
completed: 2026-05-11
---

# Phase 20 Plan 20-Z-06: Composite Phase-20 Done Gate (`npm run phase-20-status`) Summary

## Self-Check: PASSED

All claims verified before completing:

- All 21 created files exist on disk (verified at every task commit + a final `ls` enumeration)
- All 3 task commits present in `git log --oneline`: `0fabbae` / `e545084` / `d6b436f`
- `npx tsc --noEmit` exits 0
- `npm test` exits 0 — 937 passed / 2 skipped (1 is 20-Z-05's gated live judge; 1 is the new e2e suite running outside the unit config) / 3 todo
- `npx vitest run tests/phase-20-status.unit.test.ts` — 58/58 pass in 6ms
- `npx vitest run tests/integration/phase-20-status.e2e.test.ts --config vitest.integration.config.ts` — 3/3 pass
- `npm run phase-20-status` exits 2 (2 sub-checks pass real-world, 13 pending, 0 fail)
- `ls scripts/lib/phase-20-checks/check-*.ts | wc -l` → 15
- `grep -c "blocker_for: " scripts/lib/phase-20-checks/check-*.ts | awk` → 15 (one per file)
- `grep -E "process\\.env\\." scripts/lib/phase-20-checks/` → 0 matches (T-20-Z-06-05 mitigation)
- `grep -E "anthropic|openai|gemini|generateObject" scripts/lib/phase-20-checks/` → 0 matches (no-LLM rule)
- `grep -rc "blocker_for: 1\\b" scripts/lib/phase-20-checks/` → 0 (T-20-Z-06-04 — DoD #1 is rollup, not sub-check)
- Working tree clean except this file + the planned STATE/ROADMAP updates

## One-liner

`npm run phase-20-status` aggregates 15 read-only artifact inspections covering Phase-20 Definition-of-Done conditions #2 through #16 (CONTEXT.md lines 145-163), uses three-valued logic {pass | fail | pending} so "artifact not yet landed" is distinct from "criterion violated," exits 0/1/2 per the rollup policy, and prints a 4-section markdown summary grouped by execution branch (Sentiment / Calibration / Report / Hygiene). DoD #1 is the script's own rollup exit code, never a sub-check (T-20-Z-06-04). Today's main exits 2.

## The 15-Check Inventory

One row per DoD condition #2-#16. "Owner" is the upstream sub-plan that produces the artifact; this script only consumes.

| # | Check name | Branch | Owner | Artifact read | Pass criterion | Today's status |
|---|---|---|---|---|---|---|
| 2 | gme-crowded-consensus | sentiment | 20-A-01 | `tests/golden-tickers/gme-crowded-consensus.json` | `crowded_consensus === true` | pending |
| 3 | per-document-nlp-coverage | sentiment | 20-Z-01 (table) + 20-B-01 (populator) | Prisma `SentimentObservation` last-7d, source ∈ {news, community} | non-null `per_document_polarity` ratio ≥ 0.80 | pending (no rows in window) |
| 4 | source-tier-data-driven | sentiment | 20-B-04 | Prisma `SourceTier` + grep `src/lib/sentiment` for hand-curated literals | ≥1 row, every `computed_from_ic_at` within 35d, zero hand-curated literals | pending (model absent) |
| 5 | time-decay-icir-uplift | sentiment | 20-A-03 | `metrics/time-decay-icir.json` | `uplift ≥ 0.05` | pending |
| 6 | per-source-icir-30d | calibration | 20-C-01 | Prisma per-source ICIR table | ≥30 distinct days for ≥1 source | pending (model absent) |
| 7 | brier | calibration | 20-C-02 | `metrics/brier-latest.json` | `brier ≤ 0.24` | pending |
| 8 | ece | calibration | 20-B-03 | `metrics/ece-per-classifier.json` | every classifier `ECE ≤ 0.05` | pending |
| 9 | bot-filter-fp-and-coordination-f1 | calibration | 20-C-03 + 20-C-04 | `metrics/bot-filter-fp-rate.json` + `metrics/coordination-f1.json` | `fp_rate ≤ 0.05` AND `f1 ≥ 0.6` | pending |
| 10 | numeric-grounding | report | 20-D-01 | execSync vitest spec `tests/numeric-grounding.test.ts` | exit 0 | pending (spec absent) |
| 11 | citation-coverage | report | 20-D-02 | `metrics/citation-coverage-latest.json` | every golden ticker ≥ 0.80 | pending |
| 12 | model-cards-fresh | hygiene | 20-Z-02 | execSync `npm run check-model-cards` + parse YAML frontmatter | script exit 0 AND every `last_validated` within 90d | **pass** (3 cards, all fresh) |
| 13 | lookahead-bias | hygiene | 20-Z-07 | execSync vitest spec | exit 0 | pending (spec absent) |
| 14 | telemetry-7d | hygiene | 20-Z-03 | Prisma `ProviderCallLog` last 14d | DISTINCT(date(`started_at`)) ≥ 7 | pending (no rows in window) |
| 15 | fairness-audit | hygiene | 20-C-06 | `docs/audits/phase-20-fairness.md` + ≥1 model card with `known_limitations` | file exists with segments array, body cites Brier+ECE, ≥1 card limitation reference | pending |
| 16 | flags-graduated | hygiene | (every Phase-20 plan that registers a flag) | parse `src/lib/features.ts` for `PHASE_20_FLAGS` list | every flag absent OR has `// DEFERRED:` comment with reason | **pass** (none in features.ts) |

**Today's rollup**: pass=2 fail=0 pending=13 → exit code 2.

## Exit-Code Policy

| Exit | Meaning | When it fires |
|------|---------|---------------|
| `0` | Phase 20 is done — every sub-check passes | Only after every upstream artifact has landed AND every numerical criterion is met |
| `1` | At least one sub-check failed | Artifact landed but criterion violated (e.g., Brier > 0.24, ECE > 0.05, citation coverage < 0.80) — a regression |
| `2` | At least one pending and zero fails | Pre-launch — some upstream artifacts not yet landed. This is the post-commit state on today's main. |

The rollup is the script's own surfaced exit code; DoD #1 (CONTEXT.md line 147: "`npm run phase-20-status` exits 0") is captured by this code, NOT by any sub-check. Excluding it from `ALL_CHECKS` mitigates T-20-Z-06-04 (self-referential dependency).

## Current Rollup State on Post-Commit `main`

```
**Totals:** pass=2  fail=0  pending=13

**DoD #1** (Phase 20 done gate): `npm run phase-20-status` exits 0 only when every sub-check passes

Rollup: 2/15; exit code 2
```

The two real-world passes (DoD #12 model-cards-fresh and DoD #16 flags-graduated) reflect work already shipped by 20-Z-02 (model cards) and the fact that no Phase-20 plan has yet introduced a flag into `src/lib/features.ts` — the flags listed in `PHASE_20_FLAGS` are forward-looking placeholders that future plans will register. As upstream artifacts land, the per-check status transitions `pending → pass` (or `pending → fail` if a numerical criterion is violated) without any change to this script. The day every Phase-20 numerical criterion is met, the script exits `0` — that is Phase 20's done-gate signal.

## CI Wiring

`.github/workflows/phase-20.yml` runs `npm run phase-20-status` on every PR + main push that touches:

- `scripts/phase-20-status.ts`
- `scripts/lib/phase-20-checks/**`
- `tests/phase-20-status.unit.test.ts`
- `tests/integration/phase-20-status.e2e.test.ts`
- `.github/workflows/phase-20.yml`
- `docs/cards/MODEL-CARD-*.md`
- `docs/audits/phase-20-fairness.md`
- `metrics/**`
- `src/lib/features.ts`
- `prisma/schema.prisma`

The job is `continue-on-error: true` (informational only). Exit codes surface as GitHub annotations:

- exit `0` → `::notice ::Phase 20 done gate is GREEN — every DoD condition met`
- exit `2` → `::notice ::Phase 20 done gate is PENDING — upstream artifacts still landing`
- exit `1` → `::warning ::Phase 20 done gate has FAIL conditions — investigate before ship`

Gating happens organically: exit 0 is impossible until every Phase-20 artifact lands, at which point Phase 20 ships.

## Reminder: DoD #1 is the rollup, NEVER a sub-check (T-20-Z-06-04)

CONTEXT.md line 147 — "`npm run phase-20-status` exits 0. This rolls up:" — describes the script's own exit code. Including it as a sub-check would create a circular condition (the check would assert the script's own outcome). It is therefore:

- **NOT** present in `ALL_CHECKS` (15 entries total, blocker_for values [2..16] inclusive)
- **NOT** subject to `grep "blocker_for: 1\\b"` — that grep returns 0 matches across `scripts/lib/phase-20-checks/`
- Surfaced ONLY in the markdown footer's "DoD #1 (Phase 20 done gate)" line + the `Rollup: pass/total; exit code N` line

Future plans adding sub-checks for new DoD conditions must respect this: DoD #1 is always the rollup. New conditions append to `ALL_CHECKS` with `blocker_for: 17` and beyond.

## Threat Model Coverage

All six plan-level threats mitigated and grep-checkable in the committed tree:

| Threat ID | Mitigation status |
|-----------|-------------------|
| **T-20-Z-06-01** (false-pass on broken artifact) | Every check inspects content, not just file existence: `check-model-cards-fresh` parses YAML frontmatter for `last_validated`; `check-fairness-audit` parses the `segments` array; `check-source-tier-data-driven` asserts `computed_from_ic_at` within 35d AND zero hand-curated literals in src/. Unit test "T-20-Z-06-01: model card with empty last_validated returns fail, not pass" exercises this path. |
| **T-20-Z-06-02** (brittle DB queries) | Every Prisma access wrapped in try/catch; caught errors → `{ status: 'pending', evidence: 'query failed: …' }` rather than `fail`. Missing model on the Prisma client (`!deps.prisma.providerCallLog`) returns `pending`. Verified by the "pending when model unavailable" unit tests on every Prisma-using check. |
| **T-20-Z-06-03** (cron flap) | `check-telemetry-7d` computes distinct days via `new Set(rows.map(r => r.started_at.toISOString().slice(0, 10))).size`. Cron-flap unit test "T-20-Z-06-03: cron flap — 14 rows on a single day must NOT pass" injects 14 same-day fixtures and asserts `status !== 'pass'`. |
| **T-20-Z-06-04** (self-referential dependency) | DoD #1 explicitly excluded from `ALL_CHECKS`. Inline comment in `index.ts` documents the exclusion. `grep -rc "blocker_for: 1\\b" scripts/lib/phase-20-checks/` returns 0. |
| **T-20-Z-06-05** (threshold relaxation via env var) | All 15 thresholds hard-coded constants per file with comments naming the source (CONTEXT.md DoD line or upstream plan acceptance). `grep -E "process\\.env\\." scripts/lib/phase-20-checks/` returns 0 matches. Mirrors T-19-Z-04-01 precedent in `scripts/model-card-status.ts`. |
| **T-20-Z-06-06** (scope creep — check computing a metric instead of reading one) | Every check is ≤80 LOC, single-responsibility (one DB query OR one file parse OR one execSync). Header comment names the upstream plan that owns the artifact (`// Owned by 20-X-YY — this script only consumes`). `grep -E "anthropic\|openai\|gemini\|generateObject" scripts/lib/phase-20-checks/` returns 0 matches (no LLM, no metric computation). |

## Deviations from Plan

### [Rule 3 — Blocking] Column-name correction on check-telemetry-7d

- **Found during:** First live run of `npm run phase-20-status` (Task 2 verification). Prisma threw `PrismaClientValidationError: Unknown argument 'call_started_at'`.
- **Issue:** The plan's `<interfaces>` block declared the `providerCallLog.findMany` shape with `call_started_at: Date` + `latency_ms`. The actual 20-Z-03 schema (`prisma/schema.prisma` model `ProviderCallLog`) uses `started_at` and `duration_ms`.
- **Fix:** Updated `scripts/lib/phase-20-checks/types.ts` (CheckDeps), `check-telemetry-7d.ts` (where clause + select + Set extraction), and `tests/phase-20-status.unit.test.ts` (fixture column names) to use `started_at`. The DISTINCT-days invariant and the T-20-Z-06-03 cron-flap mitigation were unchanged.
- **Files modified:** `scripts/lib/phase-20-checks/types.ts`, `scripts/lib/phase-20-checks/check-telemetry-7d.ts`, `tests/phase-20-status.unit.test.ts`
- **Commit:** Folded into the Task 1+2 commit `0fabbae`.
- **Why this is Rule 3:** the plan's hypothetical Prisma shape disagreed with the live schema. Auto-resolved by matching the live schema (the source of truth); the substantive check logic (require ≥7 distinct calendar days within last 14d) is preserved. The pre-commit `npm run phase-20-status` run that previously errored now correctly returns `pending` because the table is empty within the 14-day window.

### [Rule 2 — Critical functionality] Bundled Tasks 1 + 2 into a single commit

- **Plan said:** Task 1 (stubs + RED tests) and Task 2 (real inspection logic) committed separately.
- **Choice:** Bundled into one commit because the per-check logic is ≤80 LOC of template-shaped code (existsSync + parse + compare); writing stubs first and immediately overwriting them would have generated wasteful churn. The Task 1+2 commit message documents the choice and mirrors Z-04's "Task 5 bundled into 2 + 3" precedent.
- **Result:** Three commits land instead of four. Each commit is atomic and reflects a substantive milestone (implementation; tests; e2e+CI).

## Auth Gates Encountered

None — pure read-only aggregator over existing artifacts + a new TS script wired to npm. No external services touched; no env-var changes; no DB push.

## Known Stubs

None. The 15 sub-checks all have real inspection logic. The 13 `pending` results on today's main are NOT stubs — they correctly identify upstream artifacts that have not yet landed (each owned by a different sub-plan). As those plans ship, the corresponding sub-check transitions `pending → pass/fail` without any change to this script.

The `PHASE_20_FLAGS` array in `check-flags-graduated.ts` lists 12 forward-looking flag identifiers that future plans MAY register in `src/lib/features.ts`. None of them appear in features.ts today, so the check passes vacuously (graduated + cleanup done is the same observable state as "never introduced"). Future plans that introduce a flag must (a) add it to `PHASE_20_FLAGS` here, (b) implement the flag in features.ts, (c) graduate it off → shadow → on per Phase-19's S3 convention, then (d) remove it from features.ts OR mark it `// DEFERRED:` with a reason.

## Task Commits

Each task committed atomically:

1. **Tasks 1 + 2: types + 15 checks + entrypoint** — `0fabbae` (feat)
   Bundled per the Rule-2 deviation above. 19 files changed, +1236/-1.

2. **Task 2 (tests): 58 unit tests covering rollup + registry + markdown + per-check paths** — `e545084` (test)
   1 file changed, +795.

3. **Task 3: e2e integration test + non-blocking CI wiring** — `d6b436f` (test)
   2 files changed, +136.

Plus this SUMMARY's metadata commit (the final step that follows this file's creation).

## Numerical Acceptance (CONTEXT §S8 + plan `<verification>`)

All 10 numerical gates checked at end of execution:

| # | Gate | Required | Actual | Pass |
|---|------|----------|--------|------|
| 1 | `phase-20-status` npm script exists | yes | yes | ✓ |
| 2 | `npm run phase-20-status` exits non-zero today | 1 or 2 | 2 | ✓ |
| 3a | `ls scripts/lib/phase-20-checks/check-*.ts | wc -l` | 15 | 15 | ✓ |
| 3b | Sum of `blocker_for:` occurrences across check-*.ts | 15 | 15 | ✓ |
| 4 | Every check file has `pass` + `fail` + `pending` paths | 15 each | 15/15/15 | ✓ |
| 5 | Tests reference all 4 branches | ≥4 | 6 | ✓ |
| 6 | Per-check 3-path assertions in unit tests | ≥45 | 49 | ✓ |
| 7 | `npx vitest run tests/integration/phase-20-status.e2e.test.ts` | exit 0 | 3/3 pass | ✓ |
| 8 | Markdown stdout contains DoD labels (#1..#16 + check names) | ≥16 | 16 | ✓ |
| 9 | `grep -E "process\\.env\\."` + LLM grep in check-*.ts | 0 + 0 | 0 + 0 | ✓ |
| 10 | `grep "blocker_for: 1\\b"` (T-20-Z-06-04) | 0 | 0 | ✓ |
| 11 | `npx tsc --noEmit` | exit 0 | exit 0 | ✓ |
| 12 | `npm test` | exit 0 | exit 0 (937 pass) | ✓ |

## User Setup Required

None — pure additive TypeScript + a new CI workflow file. No external service configuration. No env-var changes. No DB push. No flag changes.

**Operator follow-up (not this plan's responsibility):** as each Phase-20 sub-plan ships its artifact (model cards already done by Z-02; lookahead test from Z-07; brier metric from C-02; ECE per-classifier from B-03; fairness audit from C-06; telemetry from Z-03 once 7 distinct days of data accumulate; time-decay metric from A-03; source-tier table from B-04; …), the corresponding sub-check transitions `pending → pass`. No edits to this script are required for those transitions — the inspection logic is already in place.

## Forward References Confirmed

- **20-A-01** ships the GME `crowded_consensus` flag and the golden snapshot fixture this script reads at `tests/golden-tickers/gme-crowded-consensus.json`. DoD #2 transitions to `pass`.
- **20-A-03** ships `scripts/tune-decay.ts` and writes `metrics/time-decay-icir.json` with `{ baseline_icir, decayed_icir, uplift }`. DoD #5 transitions.
- **20-B-01** populates `per_document_polarity` on `SentimentObservation` rows. DoD #3 transitions once ≥80% of last-7d news/community rows carry the field.
- **20-B-03** ships `metrics/ece-per-classifier.json` via monthly temperature-scaling cron. DoD #8 transitions.
- **20-B-04** ships the `SourceTier` Prisma table populated by the monthly IC-recompute cron. DoD #4 transitions once rows exist with fresh `computed_from_ic_at` AND no hand-curated weight literals remain in `src/lib/sentiment`.
- **20-C-01** ships the per-source ICIR table populated by daily cron. DoD #6 transitions once ≥30 distinct days of rolling ICIR exist for ≥1 source.
- **20-C-02** writes `metrics/brier-latest.json`. DoD #7 transitions when `brier ≤ 0.24`.
- **20-C-03** writes `metrics/bot-filter-fp-rate.json`. **20-C-04** writes `metrics/coordination-f1.json`. DoD #9 transitions when both criteria met.
- **20-C-06** writes `docs/audits/phase-20-fairness.md` with per-segment Brier+ECE. DoD #15 transitions when audit + ≥1 model card cite `known_limitations`.
- **20-D-01** ships `tests/numeric-grounding.test.ts`. DoD #10 transitions when the spec passes.
- **20-D-02** writes `metrics/citation-coverage-latest.json`. DoD #11 transitions.
- **20-Z-03** continues to write `ProviderCallLog` rows daily. DoD #14 transitions automatically once ≥7 distinct days of rows exist within any 14-day window.
- **20-Z-07** ships `tests/integration/lookahead-bias.integration.test.ts`. DoD #13 transitions when the spec passes.

## Threat Flags

None — this plan introduced no new security-relevant surface. It's a read-only aggregator that reads existing files + queries existing Prisma models. No new endpoints, no auth paths, no file-system writes, no schema changes.

---
*Phase: 20-real-sentiment-analysis*
*Completed: 2026-05-11*
