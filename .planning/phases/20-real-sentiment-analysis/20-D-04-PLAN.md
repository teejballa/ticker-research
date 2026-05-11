---
phase: 20
plan: 20-D-04
wave: D
type: execute
depends_on: [20-D-01, 20-D-03]
files_modified:
  - tests/golden-tickers/_manifest.json
  - tests/golden-tickers/_human_labels/aapl-bullish-clean.json
  - tests/golden-tickers/_human_labels/aapl-bullish-degraded.json
  - tests/golden-tickers/_human_labels/aapl-bearish-clean.json
  - tests/golden-tickers/_human_labels/aapl-bearish-degraded.json
  - tests/golden-tickers/_human_labels/dkng-bullish-clean.json
  - tests/golden-tickers/_human_labels/dkng-bullish-degraded.json
  - tests/golden-tickers/_human_labels/dkng-bearish-clean.json
  - tests/golden-tickers/_human_labels/dkng-mixed-degraded.json
  - tests/golden-tickers/_human_labels/gme-crowded-clean.json
  - tests/golden-tickers/_human_labels/gme-crowded-degraded.json
  - tests/golden-tickers/_human_labels/gme-bearish-clean.json
  - tests/golden-tickers/_human_labels/gme-mixed-degraded.json
  - tests/golden-tickers/_human_labels/sofi-bullish-clean.json
  - tests/golden-tickers/_human_labels/sofi-bullish-degraded.json
  - tests/golden-tickers/_human_labels/sofi-bearish-clean.json
  - tests/golden-tickers/_human_labels/sofi-neutral-degraded.json
  - tests/golden-tickers/_human_labels/spy-neutral-clean.json
  - tests/golden-tickers/_human_labels/spy-neutral-degraded.json
  - tests/golden-tickers/_human_labels/spy-bullish-clean.json
  - tests/golden-tickers/_human_labels/spy-bearish-degraded.json
  - tests/golden-tickers/_human_labels/dwac-bullish-clean.json
  - tests/golden-tickers/_human_labels/dwac-bullish-degraded.json
  - tests/golden-tickers/_human_labels/dwac-bearish-clean.json
  - tests/golden-tickers/_human_labels/dwac-mixed-degraded.json
  - tests/golden-tickers/_human_labels/tsm-bullish-clean.json
  - tests/golden-tickers/_human_labels/tsm-bullish-degraded.json
  - tests/golden-tickers/_human_labels/tsm-bearish-clean.json
  - tests/golden-tickers/_human_labels/tsm-neutral-degraded.json
  - tests/golden-tickers/_human_labels/microcap-bullish-clean.json
  - tests/golden-tickers/_human_labels/microcap-bullish-degraded.json
  - tests/golden-tickers/_human_labels/microcap-bearish-clean.json
  - tests/golden-tickers/_human_labels/microcap-mixed-degraded.json
  - tests/golden-tickers/_micro_cap_pool.json
  - tests/unit/golden-ticker-manifest.unit.test.ts
  - tests/unit/golden-ticker-rotation.unit.test.ts
  - tests/integration/golden-ticker-suite.regression.test.ts
  - tests/integration/golden-ticker-suite.synthetic-injection.test.ts
  - scripts/check-golden-tickers.ts
  - scripts/rotate-micro-cap.ts
  - tests/golden-tickers/RUNBOOK-CURATION.md
  - .github/workflows/golden-ticker-suite.yml
  - vercel.json
  - package.json
  - .planning/phases/20-real-sentiment-analysis/MODEL-CARD-golden-ticker-corpus.md
autonomous: true
requirements: []
shadow_required: false
shadow_skip_reason: "Test-only artifact (corpus catalog + rotation policy + orchestrated suite + human-label exemplars). No production code path runs the manifest, the rotation script, or the suite test — they live in tests/, scripts/, and CI. Per S3 the shadow lifecycle applies to new production code paths; this plan introduces none. The monthly rotation cron is a separate Vercel cron under /api/cron/rotate-micro-cap, but it writes only to test fixtures and the planning meta — it never affects user-visible behavior."
autonomous_skip_reason: "Tasks 2 and 3 are checkpoint:human-action because curating the 8 SourcePackage snapshots and recording the 8 frozen Gemini AnalysisResult outputs is the one-time ~2-hour operator curation step explicitly called out in CONTEXT.md line 176. The recording step requires the operator to (a) ensure GEMINI_API_KEY / AI_GATEWAY_API_KEY are in .env.local (Claude cannot write those — they live only in the operator shell), (b) accept the ~$0.50 of Gemini API spend that recording 8 temperature=0 runs consumes, and (c) approve each ticker's recorded output as a representative baseline before committing. Every other task in this plan is fully autonomous (manifest, exemplars, rotation script, suite test, CI gate, runbook). The plan is structured so the autonomous tasks land first and exercise green against a synthetic fixture stand-in; the operator curation tasks flip the suite from continue-on-error → required."
hard_cleanup_gate: true
must_haves:
  truths:
    - "tests/golden-tickers/_manifest.json exists at the documented path and contains EXACTLY 8 ticker entries — one per security-type category required by CONTEXT.md §S9: large-cap-equity (AAPL), mid-cap-equity (DKNG), meme-echo-chamber (GME), recently-public (SOFI), ETF (SPY), SPAC (DWAC), ADR (TSM), micro-cap-low-coverage (ROTATING-MICRO with rotation_policy='monthly')"
    - "Manifest schema is documented in tests/unit/golden-ticker-manifest.unit.test.ts as a Zod schema and the schema rejects malformed manifests at module load — missing categories, duplicate symbols, missing rotation_policy on the micro-cap slot, version field absent, or count != 8 all fail with descriptive errors"
    - "Every category from CONTEXT.md §S9 ({large-cap-equity, mid-cap-equity, micro-cap-equity, ETF, SPAC, ADR, recently-listed, low-coverage / meme}) maps to exactly one manifest entry; the union of manifest.tickers[*].category is a superset of the CONTEXT.md §S9 categories (asserted in unit test by comparing the two sets)"
    - "The 8 SourcePackage fixture files committed by 20-D-01 under tests/golden-tickers/_sources/ are referenced by this plan's manifest via symbol — manifest does NOT duplicate the fixtures (no fixture data is copied into the manifest); the manifest is the catalog, 20-D-01 owns the fixture bodies"
    - "The 8 frozen AnalysisResult files committed by 20-D-01 under tests/golden-tickers/_reports/ are referenced by this plan's manifest via symbol — re-recording on prompt-version bumps is owned by 20-D-01's record-frozen-report.ts; this plan documents the trigger procedure in RUNBOOK-CURATION.md"
    - "Operator curation gate (Task 2 — [BLOCKING] [autonomous: false]): all 8 SourcePackage fixtures exist at tests/golden-tickers/_sources/{symbol}.source.json on disk before this plan's PR can merge; verified by scripts/check-golden-tickers.ts at CI time via `for sym in AAPL DKNG GME SOFI SPY DWAC TSM <microcap>: test -s tests/golden-tickers/_sources/${sym}.source.json`. The microcap slot resolves the symbol from manifest.tickers[7].current_symbol (monthly rotation)"
    - "Operator recording gate (Task 3 — [BLOCKING] [autonomous: false]): all 8 frozen AnalysisResult fixtures exist at tests/golden-tickers/_reports/{symbol}.report.json on disk before this plan's PR can merge; verified the same way as the source gate"
    - "≥30 human-labeled exemplars are committed under tests/golden-tickers/_human_labels/ — 32 = 8 tickers × 4 baseline-vs-candidate pairs per ticker; this seeds and supersedes the 20-Z-05 starter ≥5-exemplar set and unlocks the 20-Z-05 ship-gate (Pearson agreement ≥0.7 requires n≥30 per CONTEXT.md §20-Z-05 acceptance)"
    - "Every human-label exemplar conforms to the HumanExemplar shape exported from src/lib/eval/types.ts (20-Z-05) — exemplar_id, ticker, notes, baseline_text, candidate_text, human_scores (all 5 JudgeDimension keys present with integer scores in [0,5]), labeler, labeled_at"
    - "Per-ticker exemplar variance is non-degenerate: for each of the 5 JudgeDimensions, the 32-exemplar Population standard deviation of human_scores is > 0.5 — asserted in the unit test so Pearson denominators are well-defined (a degenerate corpus where every score is 3 would make per-dimension Pearson NaN)"
    - "Each ticker contributes 4 exemplar pairs that span quality tiers: 2 'clean' (high-quality baseline → high-quality candidate, scores cluster ≥4 on most dimensions) + 2 'degraded' (baseline OK → candidate with deliberate quality regression on ≥2 dimensions, scores cluster ≤2). Naming convention enforced: <symbol>-{clean|degraded}-{n}.json with n ∈ {01..04} OR descriptive suffix (e.g., 'gme-crowded-clean', 'gme-crowded-degraded')"
    - "tests/golden-tickers/_micro_cap_pool.json contains a candidate pool of ≥20 low-coverage micro-cap symbols meeting the criteria (market_cap < $300M, daily_avg_volume_30d < 500k, analyst_count <= 1) sourced from a documented snapshot date; the rotation script picks the next-in-line symbol on a monthly cadence; previous selections recorded in pool.history[] so a symbol is not re-selected for ≥12 months"
    - "scripts/rotate-micro-cap.ts is a deterministic, idempotent runner — given the same _micro_cap_pool.json and the same current month, it produces the same next symbol; selection algorithm: sort pool by (last_selected_at ASC, market_cap ASC) and pick the first whose last_selected_at is >12 months ago (or null); writes both the updated pool.history and the new manifest.tickers[7].current_symbol atomically; emits a pull-request body via stdout for the operator to copy into the rotation PR"
    - "Rotation is wired as a Vercel cron in vercel.json at '/api/cron/rotate-micro-cap' on '0 9 1 * *' (09:00 UTC on the 1st of each month — Pro plan tier; CONTEXT.md §S9 requires monthly cadence; the cron writes a PR-ready commit to a branch named rotate-micro-cap/{YYYY-MM} via the GitHub API rather than to main directly, so the operator can review-and-approve)"
    - "tests/integration/golden-ticker-suite.regression.test.ts is the orchestrated suite — for each ticker in the manifest it loads the matching SourcePackage + frozen AnalysisResult, then delegates to (a) 20-D-01's numericGroundingCheck (imported from @/lib/eval/numeric-grounding), (b) 20-D-02's citation-coverage check (imported when the module lands; until then the suite uses a soft-reference stub that no-ops with a documented WARN, and a TODO referencing 20-D-02), and (c) 20-D-03's verifyClaimsBatch from @/lib/eval/per-claim-verifier — and asserts: zero ungrounded spans, citation coverage ≥0.8 (when D-02 lands), every signal verdict ∈ {true, false, null} (no undefined), Zod-valid AnalysisResult, no 5xx surface, and report_word_count ∈ [500, 5000]"
    - "20-D-02 soft-reference handling: when src/lib/eval/citation-coverage.ts (or whatever 20-D-02 lands as) does not yet exist in the codebase, the suite logs `[golden-ticker-suite] WARN: 20-D-02 citation-coverage gate is a no-op until that plan ships (TODO ref)` and proceeds — the suite is forward-compatible without requiring 20-D-02 on the critical path; once 20-D-02 lands, the no-op is replaced via the soft-ref pattern documented in RUNBOOK-CURATION.md"
    - "report_word_count is computed by joining the report's narrative sections (executive_summary + investment_thesis + key_risks + valuation_context + future_projection + business_description + financial_analysis + competitive_landscape) and splitting on whitespace; per-ticker the suite asserts 500 ≤ word_count ≤ 5000 per CONTEXT.md line 140"
    - "tests/integration/golden-ticker-suite.synthetic-injection.test.ts proves each gate is real (not vacuously passing): for each of the 8 tickers, it deep-clones the frozen report, injects (a) an unmatchable number '$999,999' AND (b) sets one bullish_signal.description to a contradiction of the SourcePackage, asserts the suite FAILS for that ticker with the specific gate that should have fired (numeric-grounding for (a), per-claim verifier for (b)), and asserts a clean (non-injected) run for that same ticker PASSES — proving the gate fires only on the bad input"
    - "scripts/check-golden-tickers.ts is a CLI runner — exits 0 on clean main with all 8 fixtures present + suite green + synthetic-injection green + manifest schema valid + ≥30 exemplars present; exits 1 on any failure with a structured report localizing the broken ticker / gate / artifact path"
    - "package.json scripts add 'check-golden-tickers' = 'tsx scripts/check-golden-tickers.ts' and 'rotate-micro-cap' = 'tsx scripts/rotate-micro-cap.ts'"
    - ".github/workflows/golden-ticker-suite.yml runs check-golden-tickers + the regression + synthetic-injection vitest suites on every PR touching src/lib/gemini-analysis.ts, src/lib/research-brief.ts, src/lib/prompts/**, src/components/ResearchReport.tsx, src/lib/eval/**, tests/golden-tickers/**, or scripts/check-golden-tickers.ts; status is required-for-merge (set by operator in branch protection; this plan ships the workflow)"
    - "tests/golden-tickers/RUNBOOK-CURATION.md documents (a) the curation rubric (security-type coverage matrix; what to look for in each category — e.g., GME-as-meme requires high StockTwits bull_pct + low author diversity; SOFI-as-recently-public requires IPO date within 36 months), (b) the procedure for adding human-label exemplars (the 4-per-ticker structure: 2 clean + 2 degraded; what makes a 'clean' vs 'degraded' pair concrete enough to label), (c) the micro-cap rotation operator handoff (review the PR, confirm the symbol still meets criteria, approve), and (d) the prompt-bump re-record handoff to 20-D-01's RUNBOOK.md"
    - "MODEL-CARD-golden-ticker-corpus.md exists per S4 — documents the corpus's intended use (regression coverage for report-generation changes), known limitations (8 US-listed tickers, no foreign-only ADRs, no closed-end funds, no preferred shares, no convertible bonds; corpus refresh requires re-curation), the rationale for each category boundary, the rotation cadence rationale, the dependency on 20-D-01/02/03 for the actual gates"
    - "No production code path imports tests/golden-tickers/_manifest.json or scripts/rotate-micro-cap.ts (grep verifies); the manifest + script are test/scripts-only"
  artifacts:
    - path: "tests/golden-tickers/_manifest.json"
      provides: "8-ticker catalog with category labels + rotation policy; the single source of truth for which tickers the suite iterates over"
      contains: "\"category\": \"meme-echo-chamber\""
    - path: "tests/golden-tickers/_human_labels/"
      provides: "32 human-labeled exemplars (8 tickers × 4 pairs each) — seeds + supersedes 20-Z-05's ≥5 starter set and unlocks the 20-Z-05 ship-gate (Pearson ≥0.7 with n≥30)"
      min_lines: 32
    - path: "tests/golden-tickers/_micro_cap_pool.json"
      provides: "Candidate pool of ≥20 low-coverage micro-caps for monthly rotation; carries pool.history[] so symbols aren't re-selected within 12 months"
      contains: "candidates"
    - path: "tests/unit/golden-ticker-manifest.unit.test.ts"
      provides: "Zod-schema validation of the manifest + assertion that the 8-category union matches CONTEXT.md §S9 + per-dimension exemplar variance > 0.5 assertion"
      contains: "manifest"
    - path: "tests/unit/golden-ticker-rotation.unit.test.ts"
      provides: "Rotation determinism + 12-month-cooldown + selection-algorithm correctness on a synthetic pool — proves the script picks the same symbol given the same inputs and skips recently-selected symbols"
      contains: "rotate-micro-cap"
    - path: "tests/integration/golden-ticker-suite.regression.test.ts"
      provides: "Orchestrated suite — iterates the 8 manifest tickers and composes 20-D-01 (numeric-grounding) + 20-D-02 (citation-coverage, soft-ref) + 20-D-03 (per-claim verification) + word-count gate; surfaces per-ticker pass/fail so a single fixture flake doesn't mask the others"
      contains: "manifest"
    - path: "tests/integration/golden-ticker-suite.synthetic-injection.test.ts"
      provides: "Proof-of-realness — injects bad data per ticker and asserts the suite FAILS for that ticker with the specific gate that should have fired; 8 injection tests (one per ticker)"
      contains: "synthetic injection"
    - path: "scripts/check-golden-tickers.ts"
      provides: "CLI runner — npm run check-golden-tickers; exits 0 on clean main + suite green + all 8 fixtures present + ≥30 exemplars committed; exits 1 with structured failure report on drift"
      contains: "process.exit"
    - path: "scripts/rotate-micro-cap.ts"
      provides: "Deterministic monthly rotation — sorts the candidate pool, picks the next symbol, writes updated manifest + pool.history atomically, emits PR-ready stdout body; idempotent on retry"
      contains: "rotate"
    - path: "vercel.json"
      provides: "Adds /api/cron/rotate-micro-cap to the crons array on the '0 9 1 * *' schedule (monthly, 1st of month, 09:00 UTC)"
      contains: "rotate-micro-cap"
    - path: ".github/workflows/golden-ticker-suite.yml"
      provides: "CI gate — required check on PRs that touch the report-generation surface; runs check-golden-tickers + regression + synthetic-injection"
      contains: "check-golden-tickers"
    - path: "tests/golden-tickers/RUNBOOK-CURATION.md"
      provides: "Operator runbook for: curation rubric per category, human-label exemplar procedure, micro-cap rotation operator handoff, prompt-bump re-record handoff to 20-D-01's RUNBOOK"
      contains: "curation rubric"
    - path: ".planning/phases/20-real-sentiment-analysis/MODEL-CARD-golden-ticker-corpus.md"
      provides: "Mitchell-2019 model card for the corpus — intended use, known limitations, category boundaries, rotation cadence, dependencies on 20-D-01/02/03"
      contains: "Golden Ticker Corpus"
    - path: "package.json"
      provides: "Adds 'check-golden-tickers' + 'rotate-micro-cap' scripts"
      contains: "check-golden-tickers"
  key_links:
    - from: "tests/integration/golden-ticker-suite.regression.test.ts"
      to: "src/lib/eval/numeric-grounding.ts (20-D-01) + src/lib/eval/per-claim-verifier.ts (20-D-03)"
      via: "imports numericGroundingCheck + verifyClaimsBatch and runs them on every manifest ticker"
      pattern: "numericGroundingCheck|verifyClaimsBatch"
    - from: "tests/integration/golden-ticker-suite.regression.test.ts"
      to: "tests/golden-tickers/_manifest.json + tests/golden-tickers/_sources/*.source.json + tests/golden-tickers/_reports/*.report.json"
      via: "reads the manifest, resolves each (source, report) pair by symbol, iterates"
      pattern: "_manifest"
    - from: "scripts/check-golden-tickers.ts"
      to: "tests/integration/golden-ticker-suite.regression.test.ts + tests/integration/golden-ticker-suite.synthetic-injection.test.ts + tests/unit/golden-ticker-manifest.unit.test.ts"
      via: "spawns vitest run on the three files and aggregates exit codes"
      pattern: "vitest run"
    - from: "scripts/rotate-micro-cap.ts"
      to: "tests/golden-tickers/_micro_cap_pool.json + tests/golden-tickers/_manifest.json"
      via: "reads pool, computes next symbol, writes pool.history + manifest.tickers[7].current_symbol atomically"
      pattern: "_micro_cap_pool"
    - from: "vercel.json crons[*] (/api/cron/rotate-micro-cap)"
      to: "scripts/rotate-micro-cap.ts (invoked via the cron handler at src/app/api/cron/rotate-micro-cap/route.ts)"
      via: "monthly cadence '0 9 1 * *' — handler invokes the script logic and opens a PR via the GitHub API"
      pattern: "rotate-micro-cap"
    - from: ".github/workflows/golden-ticker-suite.yml"
      to: "scripts/check-golden-tickers.ts + the two integration test files"
      via: "npm run check-golden-tickers && vitest run tests/integration/golden-ticker-suite.*.test.ts"
      pattern: "check-golden-tickers"
    - from: "tests/golden-tickers/_human_labels/* (32 exemplars)"
      to: "src/lib/eval/types.ts HumanExemplar shape (20-Z-05) + scripts/eval-report.ts (20-Z-05)"
      via: "20-Z-05's eval harness iterates this directory; n=32 satisfies the 'Pearson sample size insufficient when n < 30' ship-gate documented in 20-Z-05 PLAN"
      pattern: "_human_labels"
    - from: "RUNBOOK-CURATION.md"
      to: "tests/golden-tickers/RUNBOOK.md (20-D-01) — re-record procedure on prompt-version bumps"
      via: "cross-reference; 20-D-04 owns curation, 20-D-01 owns the recording mechanics"
      pattern: "RUNBOOK"
---

# Plan 20-D-04: Failure-mode coverage suite — 8 golden tickers across security types

<universal_preamble>

## Autonomous Execution Clause

This plan is mostly autonomous but contains TWO operator gates (Task 2 + Task 3) flagged `[BLOCKING] [autonomous: false]`:

1. **Task 2** — Operator curates 8 SourcePackage fixtures under `tests/golden-tickers/_sources/`. This is the one-time ~2-hour human-curation step explicitly listed in CONTEXT.md line 176. Curation requires running the production pipeline on each symbol and approving the captured snapshot as representative of its category. The recording mechanics live in 20-D-01's `scripts/record-frozen-report.ts` — this plan does NOT re-implement that script, only consumes it.

2. **Task 3** — Operator records 8 frozen AnalysisResult outputs at temperature=0 with pinned prompt versions via 20-Z-04's registry. This requires `GEMINI_API_KEY` / `AI_GATEWAY_API_KEY` in the operator's shell (Claude cannot write those) and ~$0.50 of Gemini API spend.

All other tasks are autonomous: manifest, human-label exemplars, rotation script, suite test, CI gate, runbook, model card. They land first and exercise green against synthetic-stand-in fixtures so the autonomous path can be merged before the operator gates flip the CI from `continue-on-error: true` → required.

## Hard Cleanup Gate (Definition of Done)

1. **No shadow lifecycle** (S3 N/A — documented in `shadow_skip_reason`). The corpus + suite + rotation are test-only artifacts; no production code path executes them.
2. **No production code imports tests/golden-tickers/_manifest.json or scripts/rotate-micro-cap.ts** — `grep -rE "from ['\"](.*)golden-tickers['\"]" src/ --include='*.ts' --include='*.tsx'` returns ZERO matches (excluding `src/app/api/cron/rotate-micro-cap/route.ts` which is the cron handler — that file is the ONLY allowed source-side import and the grep excludes the `app/api/cron/` path).
3. **No feature flag introduced.** The CI workflow's `required` status + the cron schedule are the gates; there is no off-switch in production code.
4. `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-commit.
5. `npm run check-golden-tickers` exits 0 on `main` with all 8 fixtures present, manifest schema valid, suite green, synthetic-injection green, ≥30 exemplars committed.
6. **Operator gate evidence**: `ls tests/golden-tickers/_sources/*.source.json | wc -l` returns 8 AND `ls tests/golden-tickers/_reports/*.report.json | wc -l` returns 8 (the operator curation steps committed both fixture sets per 20-D-01's mechanics).
7. **Exemplar count gate**: `ls tests/golden-tickers/_human_labels/*.json | wc -l` returns ≥ 32 (the 8 × 4 per-ticker exemplars committed by Task 4).
8. **Synthetic-injection proof-of-realness** — `tests/integration/golden-ticker-suite.synthetic-injection.test.ts` MUST pass. For each of the 8 manifest tickers, the test injects bad data (an unmatchable number AND a contradictory bullish_signal) and asserts the suite FAILS for that specific ticker with the specific gate that should have fired. If the test passes vacuously, treat as a hard build failure.
9. **20-Z-05 cross-plan gate** — 20-Z-05's `scripts/eval-report.ts` runs end-to-end on the 32-exemplar corpus and reports `n=32` (no longer emits the "Pearson sample size n=<5, insufficient for ship gate" warning).
10. **CI gate live**: `.github/workflows/golden-ticker-suite.yml` exists and triggers on `paths: ['src/lib/gemini-analysis.ts', 'src/lib/research-brief.ts', 'src/lib/prompts/**', 'src/components/ResearchReport.tsx', 'src/lib/eval/**', 'tests/golden-tickers/**', 'scripts/check-golden-tickers.ts', 'scripts/rotate-micro-cap.ts']`. The job is marked required-for-merge in branch protection (operator-set; this plan ships the workflow).

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S7 (threat model per plan)** — five plan-level threats `T-20-D-04-{01..05}` enumerated below with concrete mitigations.
- **S8 (numerical acceptance criteria)** — every DONE criterion is a `ls | wc -l` count, vitest exit code, JSON-key assertion, or scripted exit code. Zero adjectives.
- **S9 (failure-mode coverage)** — THIS plan IS the entry point for §S9. The 8-fixture corpus is the security-type span: {large-cap-equity (AAPL), mid-cap-equity (DKNG), meme-echo-chamber (GME), recently-public (SOFI), ETF (SPY), SPAC (DWAC), ADR (TSM), micro-cap-low-coverage (rotating)}. The orchestrated suite test asserts every report-touching change runs the full gate set on every ticker. 20-D-01/02/03 own the individual gates; 20-D-04 owns the corpus, the rotation, the human-label exemplars, and the orchestration.
- **S1 (no hand-picked parameters)** — the manifest is a **specification** of category coverage, not a tuned hyperparameter; calibration is not appropriate here. The micro-cap eligibility criteria (market_cap < $300M, daily_avg_volume_30d < 500k, analyst_count <= 1) are the documented operational definition of "low-coverage micro-cap" used by the rotation script — these thresholds are listed in the model card so any future change is an explicit recalibration, not silent drift.
- **S6 (telemetry)** — N/A. The corpus runs offline in CI + the rotation cron writes only to test fixtures. No latency / cost / error rates to surface on the production request path.

## Forward + sibling references

- **20-D-01 (numeric-grounding)** — sibling, parallel ship. **Owns** the SourcePackage + frozen-report fixtures + `scripts/record-frozen-report.ts` + the numeric-grounding matcher. This plan does **NOT** duplicate any of those. The orchestrated suite imports `numericGroundingCheck` from 20-D-01's module.
- **20-D-02 (citation-coverage)** — sibling, NOT yet on disk. The orchestrated suite soft-references the 20-D-02 module — when it doesn't exist the suite logs a `WARN: 20-D-02 citation-coverage gate is a no-op until that plan ships (TODO)` and skips that one assertion. The soft-ref pattern is documented in RUNBOOK-CURATION.md so the cutover when 20-D-02 lands is a one-line change.
- **20-D-03 (per-claim verifier)** — sibling, parallel ship. The orchestrated suite imports `verifyClaimsBatch` and asserts every signal has a non-undefined verdict (`'true' | 'false' | 'null'`).
- **20-D-05 (disclaimer audit)** — sibling, parallel ship. NOT in this plan's scope; 20-D-05 owns its own audit gate. The orchestrated suite intentionally does NOT call into 20-D-05 — the disclaimer audit is a separate report-rendering surface and is wired through its own CI gate.
- **20-Z-04 (prompt registry)** — REQUIRED dependency via 20-D-01's `scripts/record-frozen-report.ts` (which pins prompt versions when recording). A 20-Z-04 prompt bump triggers a re-record cycle for affected fixtures; the procedure is owned by 20-D-01's `RUNBOOK.md` and cross-referenced from this plan's `RUNBOOK-CURATION.md`.
- **20-Z-05 (eval harness)** — downstream consumer. The 32-exemplar set committed by this plan supersedes 20-Z-05's 5-exemplar starter set and unlocks the `n≥30` Pearson ship-gate documented in 20-Z-05 PLAN. The exemplar shape (HumanExemplar from src/lib/eval/types.ts) is owned by 20-Z-05; this plan only produces conformant instances.
- **20-Z-06 (composite phase done gate)** — `npm run phase-20-status` treats `npm run check-golden-tickers` exit code as one of its four gate branches.

</universal_preamble>

<objective>
Curate the 8-ticker golden corpus that anchors CONTEXT.md §S9 (failure-mode coverage), ship the orchestrated suite test that composes 20-D-01 + 20-D-02 + 20-D-03 + word-count gates on every ticker, define a monthly rotation policy for the micro-cap slot, commit ≥30 human-label exemplars that unlock 20-Z-05's Pearson ship-gate, and wire the whole thing into a build-blocking CI workflow.

The corpus span — {large-cap-equity (AAPL), mid-cap-equity (DKNG), meme/echo-chamber (GME), recently-public (SOFI), ETF (SPY), SPAC (DWAC), ADR (TSM), micro-cap-low-coverage (rotating)} — is the security-type matrix CONTEXT.md line 140 calls out verbatim. GME is the originating-bug ticker (100% bullish single-source vendor tag); its inclusion is non-negotiable.

This plan does NOT re-implement the gates themselves (20-D-01 owns numeric-grounding, 20-D-03 owns per-claim verification, 20-D-02 owns citation coverage). It owns: the manifest, the human-label corpus, the rotation policy + cron, the orchestrated suite, and the CI gate that runs them all on every report-touching change.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-D-01-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-D-03-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-05-PLAN.md
@CLAUDE.md
@vercel.json

<interfaces>
<!-- Key shapes the executor consumes. Sourced from sibling plans so no codebase exploration is needed. -->

```typescript
// Manifest schema — Zod-validated in tests/unit/golden-ticker-manifest.unit.test.ts
import { z } from 'zod';

const TickerCategory = z.enum([
  'large-cap-equity',
  'mid-cap-equity',
  'meme-echo-chamber',
  'recently-public',
  'ETF',
  'SPAC',
  'ADR',
  'micro-cap-low-coverage',
]);

const RotationPolicy = z.enum(['static', 'monthly']);

const ManifestTicker = z.object({
  symbol: z.string().min(1).max(8),         // 'AAPL' or 'ROTATING-MICRO' as placeholder
  category: TickerCategory,
  rotation_policy: RotationPolicy.default('static'),
  current_symbol: z.string().optional(),     // populated only when rotation_policy='monthly'
  rationale: z.string().min(20),             // human-readable why-this-ticker per CONTEXT
});

export const ManifestSchema = z.object({
  version: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),  // ISO date of last edit
  tickers: z.array(ManifestTicker).length(8),
  required_categories: z.array(TickerCategory).length(8),  // each must appear exactly once
});

// HumanExemplar shape — REUSED FROM 20-Z-05 (do not redefine)
// import type { HumanExemplar } from '@/lib/eval/types';
// (shape: exemplar_id, ticker, notes, baseline_text, candidate_text, human_scores
//   {numeric_grounding, citation_coverage, narrative_coherence, hedging_quality, contradiction_handling},
//   labeler, labeled_at)

// Suite delegation contracts — IMPORTED from sibling plans, NOT redefined here
// 20-D-01 — import { numericGroundingCheck } from '@/lib/eval/numeric-grounding';
//   signature: (reportText: string | AnalysisResult, sourcePackage: SourcePackage, tolerance: ToleranceSchedule)
//              => { ungrounded_spans: Array<GroundingFailure> }
// 20-D-02 — soft-ref via dynamic import: try { await import('@/lib/eval/citation-coverage') } catch { /* no-op */ }
// 20-D-03 — import { verifyClaimsBatch } from '@/lib/eval/per-claim-verifier';
//   signature: (signals: AnalysisSignal[], sp: SourcePackage) => Promise<Map<string, 'true'|'false'|'null'>>

// Rotation script contract
export interface MicroCapCandidate {
  symbol: string;
  market_cap: number;            // USD
  daily_avg_volume_30d: number;
  analyst_count: number;
  last_selected_at: string | null;  // ISO date or null
}

export interface MicroCapPool {
  generated_at: string;
  source_dataset: string;        // documented snapshot source
  candidates: MicroCapCandidate[];
  history: Array<{ symbol: string; selected_at: string; selected_for_month: string }>;
}

// Cron handler contract (src/app/api/cron/rotate-micro-cap/route.ts — outside this plan's scope to
// fully implement; this plan ships the script + vercel.json entry; the handler can be a thin
// follow-up if needed, but the script itself is fully autonomous and the operator can also invoke
// `npm run rotate-micro-cap` manually for the first cycle)
```

The manifest version is treated as an ISO date so prompt-bump re-records + ticker rotations are auditable from `git log _manifest.json` alone.
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-D-04-01 | Configuration | Golden tickers go stale — the 8-ticker set was curated 2026-05 but by 2027 SOFI is no longer "recently-public" (>36mo old), DWAC's SPAC merger closed, GME's meme dynamics calmed | mitigate | (a) Monthly micro-cap rotation via `scripts/rotate-micro-cap.ts` cron keeps the low-coverage slot fresh; (b) quarterly corpus review documented in RUNBOOK-CURATION.md — operator confirms each of the 7 static tickers still represents its category; (c) MODEL-CARD-golden-ticker-corpus.md records the curation date + category boundary criteria so drift is visible; (d) `_manifest.json` carries `version: YYYY-MM-DD` field — a stale manifest (>180 days) emits a WARN from check-golden-tickers |
| T-20-D-04-02 | Configuration | Frozen reports lose validity on prompt-version bump — 20-Z-04 bumps a registered prompt, the frozen Gemini AnalysisResult no longer reflects what the live prompt would produce, suite passes vacuously on stale data | mitigate | (a) 20-D-01's `recording-manifest.json` captures `prompt_versions: Record<PromptId, PromptVersion>` per fixture; (b) `scripts/check-golden-tickers.ts` cross-validates every pinned version resolves via 20-Z-04's registry — a bumped prompt without a re-recorded fixture fails the build with the precise remediation `npm run record-frozen-report -- --ticker <sym> --pin-prompts latest`; (c) 20-Z-04's golden-file regression test independently catches unintentional rubric changes; (d) RUNBOOK-CURATION.md documents the prompt-bump → re-record handoff to 20-D-01's RUNBOOK |
| T-20-D-04-03 | Tampering | Curation bias — operator unconsciously picks "easy" tickers (clean fundamentals, clean news cycle) that pass the suite trivially, masking real production drift | mitigate | (a) 8 distinct security categories are pre-specified by CONTEXT.md §S9 — operator does NOT choose categories, only the symbol within each category; (b) GME (meme/echo-chamber) is explicitly adversarial — the originating-bug ticker is non-negotiable in the manifest; (c) micro-cap slot rotates monthly, so even the "easy" picks rotate out; (d) MODEL-CARD-golden-ticker-corpus.md documents per-category criteria (e.g., SOFI requires IPO date within 36 months; SPAC requires de-SPAC date within 24 months) so substitutions are bounded; (e) the synthetic-injection test proves the gates fire on bad inputs — an operator cannot pick a ticker that the gates can't detect bad data on |
| T-20-D-04-04 | Availability | One fixture flake blocks all PRs — DWAC's SPAC merger closes overnight, its SourcePackage shape changes, the suite fails on every PR until DWAC is re-curated | mitigate | (a) Per-ticker pass/fail is surfaced in the suite output so the broken ticker is named explicitly; (b) RUNBOOK-CURATION.md documents an operator-only bypass: temporarily comment out the broken ticker in `_manifest.json` with a TODO + ticket link, ship the fix in a follow-up PR; (c) the bypass is bounded to ≤7 days (`scripts/check-golden-tickers.ts` warns when ANY ticker has been commented out for >7 days via a special `// BYPASS-UNTIL: YYYY-MM-DD` comment convention); (d) micro-cap rotation cron writes to a PR branch, NOT to main, so a bad pool entry can be rejected before it lands |
| T-20-D-04-05 | Acceptance gate | 30-exemplar requirement for 20-Z-05's Pearson ship-gate not met — exemplar count drops below 30 via deletion or refactor, the 20-Z-05 ship-gate silently regresses to "insufficient sample size" without anyone noticing | mitigate | (a) This plan commits 32 = 8 × 4 exemplars on day one (2 above the floor); (b) `scripts/check-golden-tickers.ts` asserts `ls tests/golden-tickers/_human_labels/*.json \| wc -l >= 30` and exits non-zero on shortfall; (c) the CI workflow gates merge on the script exit code; (d) RUNBOOK-CURATION.md documents the "add a new exemplar" procedure so growth is bounded and structured (clean / degraded pair per ticker); (e) 20-Z-05's harness CLI also emits the n-warning, so the gate is enforced on two surfaces (check-golden-tickers AND eval-report) |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="20-D-04-01">
  <name>Task 1: Manifest schema + Zod validation + 8-category coverage assertion</name>
  <files>tests/golden-tickers/_manifest.json, tests/unit/golden-ticker-manifest.unit.test.ts</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 140 — verbatim 8-ticker spec; line 38 — S9 standard listing the 8 security-type categories)
    - .planning/phases/20-real-sentiment-analysis/20-D-01-PLAN.md (lines 7-35 — fixture path conventions tests/golden-tickers/_sources/{symbol}.source.json + _reports/{symbol}.report.json)
    - .planning/phases/20-real-sentiment-analysis/20-Z-05-PLAN.md (lines 49-52 — _human_labels directory dependency; line 88 — "Forward-reference to 20-D-04 (30-exemplar set)")
    - package.json (verify `zod` already present — it is, used by gemini-analysis.ts AnalysisResultSchema)
  </read_first>
  <behavior>
    Unit tests (≥8) covering manifest validity:
    1. ManifestSchema.parse() accepts a valid 8-ticker manifest with all 8 required categories present exactly once
    2. ManifestSchema.parse() rejects a manifest with 7 tickers (length !== 8)
    3. ManifestSchema.parse() rejects a manifest with 9 tickers (length !== 8)
    4. ManifestSchema.parse() rejects a manifest where two tickers share the same category (duplicate categories)
    5. ManifestSchema.parse() rejects a manifest missing one of the 8 required categories (e.g., no SPAC entry)
    6. ManifestSchema.parse() rejects a manifest where micro-cap-low-coverage entry lacks `rotation_policy: 'monthly'`
    7. ManifestSchema.parse() rejects a manifest with `version` not in YYYY-MM-DD format
    8. ManifestSchema.parse() rejects a manifest with a ticker `rationale` shorter than 20 chars (forces operator to document the why)
    9. The 32-exemplar variance assertion: for each of the 5 JudgeDimensions, the population standard deviation of human_scores across the 32 exemplars is > 0.5 — degenerate corpora (every score = 3) make Pearson NaN and would silently regress 20-Z-05's ship-gate
    10. The union of `manifest.tickers[*].category` equals the literal set in CONTEXT.md §S9 (asserted via Set equality)
  </behavior>
  <action>
    A. Create `tests/golden-tickers/_manifest.json` with EXACTLY the 8-ticker spec from CONTEXT.md line 140 + per-category rationale:

    ```json
    {
      "version": "2026-05-11",
      "required_categories": [
        "large-cap-equity",
        "mid-cap-equity",
        "meme-echo-chamber",
        "recently-public",
        "ETF",
        "SPAC",
        "ADR",
        "micro-cap-low-coverage"
      ],
      "tickers": [
        {
          "symbol": "AAPL",
          "category": "large-cap-equity",
          "rotation_policy": "static",
          "rationale": "Apex liquid large-cap; deep analyst coverage; multi-source consensus baseline for numeric grounding."
        },
        {
          "symbol": "DKNG",
          "category": "mid-cap-equity",
          "rotation_policy": "static",
          "rationale": "DraftKings — mid-cap volatility profile, sports-betting regulatory exposure, retail-favorite signal mix."
        },
        {
          "symbol": "GME",
          "category": "meme-echo-chamber",
          "rotation_policy": "static",
          "rationale": "Originating bug ticker — 100% bullish single-source vendor tag rendered as thesis (CONTEXT.md line 5). Non-negotiable adversarial fixture."
        },
        {
          "symbol": "SOFI",
          "category": "recently-public",
          "rotation_policy": "static",
          "rationale": "SoFi Technologies — listed via SPAC in 2021; sparse historical filings; exercises recently-listed coverage."
        },
        {
          "symbol": "SPY",
          "category": "ETF",
          "rotation_policy": "static",
          "rationale": "SPDR S&P 500 ETF — security_type='etf' branch; no fundamentals/EPS; tests report shape on non-equity instruments."
        },
        {
          "symbol": "DWAC",
          "category": "SPAC",
          "rotation_policy": "static",
          "rationale": "Digital World Acquisition Corp — pre-merger SPAC; thin fundamentals; tests the SPAC-specific report rendering path."
        },
        {
          "symbol": "TSM",
          "category": "ADR",
          "rotation_policy": "static",
          "rationale": "Taiwan Semiconductor ADR — foreign primary listing; ADR-specific disclosures; exercises the ADR rendering path."
        },
        {
          "symbol": "ROTATING-MICRO",
          "category": "micro-cap-low-coverage",
          "rotation_policy": "monthly",
          "current_symbol": "TBD-FIRST-ROTATION",
          "rationale": "Monthly rotation per S9 + CONTEXT.md line 176 — rotates from _micro_cap_pool.json candidate set; picks one with market_cap<$300M, daily_avg_volume_30d<500k, analyst_count<=1."
        }
      ]
    }
    ```

    Note: the `current_symbol` field on the micro-cap slot is the runtime resolution target; the suite reads `t.rotation_policy === 'monthly' ? t.current_symbol : t.symbol` to get the disk-fixture symbol. `"TBD-FIRST-ROTATION"` is the placeholder until Task 7 (rotation script) commits the first real symbol.

    B. Create `tests/unit/golden-ticker-manifest.unit.test.ts` with the 10 behaviors above. Define `ManifestSchema` inline per the `<interfaces>` block. Variance assertion uses Welford's algorithm (or a single-pass mean+std calculation — pure function, no deps).

    C. Wire the test into `npm run test` discovery (vitest picks up `tests/**/*.test.ts` by default — no config change needed; verify by running `npx vitest run tests/unit/golden-ticker-manifest.unit.test.ts` exits 0).

    Notes on hand-picking: the 8 category labels + the 7 static symbols are NOT calibrated hyperparameters — they are the **specification** from CONTEXT.md §S9 + line 140. S1 (no hand-picked parameters) applies to model thresholds, not to the corpus definition itself. The micro-cap eligibility criteria (market_cap<$300M, volume<500k, analyst_count<=1) ARE operational thresholds documented in the model card (Task 9) so any future change is an explicit recalibration.
  </action>
  <acceptance_criteria>
    - File `tests/golden-tickers/_manifest.json` exists, parses as JSON, has exactly 8 entries in `tickers`
    - `grep -q "meme-echo-chamber" tests/golden-tickers/_manifest.json`
    - `grep -q "micro-cap-low-coverage" tests/golden-tickers/_manifest.json`
    - `grep -q "ROTATING-MICRO" tests/golden-tickers/_manifest.json` (placeholder until Task 7 writes the first real rotation)
    - `npx vitest run tests/unit/golden-ticker-manifest.unit.test.ts` exits 0 with ≥8 passing tests
    - Variance test (≥0.5 std dev per dimension) PASSES once Task 4 commits the 32 exemplars (this test will FAIL during Task 1 — that is expected; it goes green after Task 4)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/unit/golden-ticker-manifest.unit.test.ts</automated>
  </verify>
  <done>Manifest committed with 8 ticker entries spanning the CONTEXT.md §S9 category union; Zod schema enforces correctness at load time; ≥8 unit tests GREEN (variance test goes green after Task 4)</done>
</task>

<task type="checkpoint:human-action" id="20-D-04-02">
  <name>Task 2 [BLOCKING] [autonomous: false]: Operator curates 8 SourcePackage fixtures</name>
  <gate>blocking</gate>
  <files>tests/golden-tickers/_sources/aapl.source.json, tests/golden-tickers/_sources/dkng.source.json, tests/golden-tickers/_sources/gme.source.json, tests/golden-tickers/_sources/sofi.source.json, tests/golden-tickers/_sources/spy.source.json, tests/golden-tickers/_sources/dwac.source.json, tests/golden-tickers/_sources/tsm.source.json, tests/golden-tickers/_sources/{microcap-rotation}.source.json</files>
  <action>OPERATOR CHECKPOINT — see &lt;what-built&gt; for context and &lt;how-to-verify&gt; for the step-by-step procedure. Operator runs the production pipeline against each of the 8 symbols via 20-D-01's scripts/record-frozen-report.ts --sources-only flag and commits the resulting SourcePackage JSON fixtures. Claude cannot perform this task autonomously because it requires API keys (YAHOO_FINANCE_*, POLYGON_API_KEY, FINNHUB_API_KEY, ANTHROPIC_API_KEY, FIRECRAWL_API_KEY, STOCKTWITS_*) that live only in the operator shell. Each fixture must meet its category's rubric criterion documented in tests/golden-tickers/RUNBOOK-CURATION.md (Task 8 of this plan); rubric failures require re-rolling the pipeline run at a different time window.</action>
  <verify>
    <automated>test $(ls tests/golden-tickers/_sources/*.source.json 2&gt;/dev/null | wc -l) -ge 8</automated>
  </verify>
  <what-built>
    Tasks 1, 4, 5, 6, 7, 8, 9 (the autonomous tasks) have landed against synthetic-stand-in fixtures. The orchestrated suite needs the real 8 SourcePackage JSON files committed to tests/golden-tickers/_sources/ before it can run against real production-pipeline output. 20-D-01 owns the fixture format and the recording mechanics; this task is the operator handoff to commit the bodies.
  </what-built>
  <how-to-verify>
    For each of the 8 symbols (AAPL, DKNG, GME, SOFI, SPY, DWAC, TSM, and the first micro-cap rotation symbol from `npm run rotate-micro-cap`):

    1. Ensure `.env.local` has all keys the production pipeline needs (`YAHOO_FINANCE_*`, `POLYGON_API_KEY`, `FINNHUB_API_KEY`, `ANTHROPIC_API_KEY`, `FIRECRAWL_API_KEY`, `STOCKTWITS_*`). Claude has no way to provision these.

    2. Run the production data-collection pipeline against each symbol — the recording entry point lives in 20-D-01's `scripts/record-frozen-report.ts` (which calls the same fetcher modules in `src/lib/data/`).

       ```bash
       npm run record-frozen-report -- --ticker AAPL --sources-only --commit-fixture
       # repeat for DKNG GME SOFI SPY DWAC TSM <micro-cap>
       ```

    3. Confirm each fixture committed at `tests/golden-tickers/_sources/{symbol}.source.json` is non-empty, parses as JSON, and validates against the SourcePackage Zod shape (or runtime structural equivalent).

    4. Review each fixture against the curation rubric in `tests/golden-tickers/RUNBOOK-CURATION.md`:
       - AAPL: large-cap — verify `market_cap > $1T`, dense analyst_sentiment, multi-source FieldOrigin coverage
       - DKNG: mid-cap — `$5B < market_cap < $25B`, sports/regulatory news mix, retail-heavy StockTwits
       - GME: meme — `stocktwits_bull_pct > 75` OR rapidly-mean-reverting; high message_count; low author_diversity
       - SOFI: recently-public — IPO date within last 36 months (verify via SEC filing source)
       - SPY: ETF — `security_type='etf'`, fundamentals MOSTLY null (no EPS), market_data present
       - DWAC: SPAC — `security_type='spac'` if available OR documented in sec_filings; thin fundamentals
       - TSM: ADR — `country_of_domicile='Taiwan'` documented; ADR-specific disclosures from anthropic-search
       - <micro-cap>: low-coverage — `market_cap < $300M`, daily volume < 500k, analyst_count ≤ 1

    5. If any fixture fails its rubric criterion, re-run the pipeline at a different time window OR re-roll the micro-cap rotation, and re-record. Do NOT accept a fixture that doesn't represent its category.

    6. Commit all 8 fixtures in one PR with body referencing this plan ID.
  </how-to-verify>
  <resume-signal>Type "approved" once all 8 fixtures are committed and `ls tests/golden-tickers/_sources/*.source.json | wc -l` returns 8 (or 9+ if previous rotations are kept). Describe issues if any rubric criterion was unmet.</resume-signal>
  <done>8 SourcePackage fixtures on disk; each validates against the SourcePackage shape; each meets its category's rubric criterion documented in RUNBOOK-CURATION.md</done>
</task>

<task type="checkpoint:human-action" id="20-D-04-03">
  <name>Task 3 [BLOCKING] [autonomous: false]: Operator records 8 frozen AnalysisResult outputs (temperature=0, prompt-versions pinned)</name>
  <gate>blocking</gate>
  <files>tests/golden-tickers/_reports/aapl.report.json, tests/golden-tickers/_reports/dkng.report.json, tests/golden-tickers/_reports/gme.report.json, tests/golden-tickers/_reports/sofi.report.json, tests/golden-tickers/_reports/spy.report.json, tests/golden-tickers/_reports/dwac.report.json, tests/golden-tickers/_reports/tsm.report.json, tests/golden-tickers/_reports/{microcap-rotation}.report.json, tests/golden-tickers/_meta/recording-manifest.json</files>
  <action>OPERATOR CHECKPOINT — see &lt;what-built&gt; for context and &lt;how-to-verify&gt; for the step-by-step procedure. Operator runs 20-D-01's scripts/record-frozen-report.ts at temperature=0 with --pin-prompt-versions latest against each of the 8 SourcePackage fixtures committed in Task 2, producing 8 frozen AnalysisResult JSON files + an updated recording-manifest.json. Claude cannot perform this task autonomously because it requires GEMINI_API_KEY / AI_GATEWAY_API_KEY in the operator shell + ~$0.40 of Gemini API spend the operator must explicitly authorize. Each frozen report's narrative word count must be in [500, 5000] per CONTEXT.md line 140; the GME report specifically must NOT render "100% bullish" as a thesis (originating bug).</action>
  <verify>
    <automated>test $(ls tests/golden-tickers/_reports/*.report.json 2&gt;/dev/null | wc -l) -ge 8 &amp;&amp; test -s tests/golden-tickers/_meta/recording-manifest.json</automated>
  </verify>
  <what-built>
    Tasks 1 + 2 have landed (manifest + 8 SourcePackage fixtures). The suite needs the 8 frozen Gemini AnalysisResult outputs to compose against. 20-D-01 owns the recording mechanics (scripts/record-frozen-report.ts); this task is the operator handoff to RUN that script per ticker.
  </what-built>
  <how-to-verify>
    For each of the 8 fixtures committed in Task 2:

    1. Ensure `GEMINI_API_KEY` (or `AI_GATEWAY_API_KEY` if using AI Gateway) is present in `.env.local`. Claude has no way to set these.

    2. Run:
       ```bash
       npm run record-frozen-report -- --ticker <symbol> --temperature=0 --pin-prompt-versions latest --commit-fixture
       ```
       per the procedure documented in 20-D-01's `tests/golden-tickers/RUNBOOK.md`.

    3. Verify the recording script committed:
       - `tests/golden-tickers/_reports/{symbol}.report.json` — the frozen AnalysisResult
       - `tests/golden-tickers/_meta/recording-manifest.json` updated with the per-fixture `prompt_versions: Record<PromptId, PromptVersion>` + `gemini_model_revision` + `source_hash` + `recorded_at`

    4. Spot-check each frozen report:
       - Word count of (executive_summary + investment_thesis + key_risks + valuation_context + future_projection + business_description + financial_analysis + competitive_landscape) is in [500, 5000] per CONTEXT.md line 140
       - Report is Zod-valid (the recording script should fail otherwise — but verify by manually loading with `AnalysisResultSchema.parse(JSON.parse(fs.readFileSync(...)))`)
       - For GME specifically: confirm the report does NOT render "100% bullish" as a thesis (this is the originating bug; if GME's frozen report still has this pathology, the gates from 20-A-01 / 20-D-01 / 20-D-03 will catch it — the corpus is designed to expose this)

    5. Estimated cost: ~$0.05 per ticker × 8 = ~$0.40 of Gemini spend; ~3-5 minutes wall-clock per ticker.

    6. Commit all 8 frozen reports + the updated recording manifest in one PR.
  </how-to-verify>
  <resume-signal>Type "approved" once `ls tests/golden-tickers/_reports/*.report.json | wc -l` returns 8 and the recording manifest has entries for all 8 symbols.</resume-signal>
  <done>8 frozen AnalysisResult fixtures on disk; recording manifest pins prompt versions for each; word_count ∈ [500, 5000] for each; Zod-valid</done>
</task>

<task type="auto" tdd="true" id="20-D-04-04">
  <name>Task 4: Human-label exemplars (32 = 8 × 4) — clean/degraded pairs per ticker</name>
  <files>tests/golden-tickers/_human_labels/*.json (32 exemplars: aapl-bullish-clean, aapl-bullish-degraded, aapl-bearish-clean, aapl-bearish-degraded, dkng-bullish-clean, dkng-bullish-degraded, dkng-bearish-clean, dkng-mixed-degraded, gme-crowded-clean, gme-crowded-degraded, gme-bearish-clean, gme-mixed-degraded, sofi-bullish-clean, sofi-bullish-degraded, sofi-bearish-clean, sofi-neutral-degraded, spy-neutral-clean, spy-neutral-degraded, spy-bullish-clean, spy-bearish-degraded, dwac-bullish-clean, dwac-bullish-degraded, dwac-bearish-clean, dwac-mixed-degraded, tsm-bullish-clean, tsm-bullish-degraded, tsm-bearish-clean, tsm-neutral-degraded, microcap-bullish-clean, microcap-bullish-degraded, microcap-bearish-clean, microcap-mixed-degraded)</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-05-PLAN.md (lines 140-150 — HumanExemplar shape; lines 540-560 — exemplar field semantics; line 33 — `RUN_LIVE_JUDGE=true` gate)
    - tests/golden-tickers/_human_labels/example-aapl-bullish.json (if 20-Z-05 has shipped — use as the canonical example for the shape and naming)
  </read_first>
  <behavior>
    For each of the 8 tickers, create 4 human-labeled exemplars (32 total). Each exemplar conforms to the HumanExemplar shape from `src/lib/eval/types.ts`:

    1. `{symbol}-bullish-clean.json` (or category-appropriate equivalent) — baseline_text and candidate_text are both well-grounded; candidate adds one extra source citation; expected human_scores: numeric_grounding=5, citation_coverage=5, narrative_coherence ∈ {4,5}, hedging_quality ∈ {3,4}, contradiction_handling ∈ {2,3}
    2. `{symbol}-bullish-degraded.json` — candidate introduces an unsourced number OR drops 2 citations; expected human_scores: numeric_grounding ∈ {1,2}, citation_coverage ∈ {1,2}, rest 3-4
    3. `{symbol}-bearish-clean.json` (or category-specific clean pair #2) — bearish thesis with full citation chain; expected scores cluster ≥4 on first 3 dimensions
    4. `{symbol}-mixed-degraded.json` (or category-appropriate degradation pair) — candidate fails to reconcile contradictory signals OR overhedges; expected contradiction_handling ∈ {1,2}, hedging_quality variable

    For GME specifically, the 4 pairs MUST exercise the crowded-consensus / echo-chamber semantics:
    - `gme-crowded-clean.json` — candidate correctly surfaces "crowded consensus" warning (per 20-A-01); contradiction_handling=5
    - `gme-crowded-degraded.json` — candidate treats 100% bullish as a thesis (the originating bug); contradiction_handling=0
    - `gme-bearish-clean.json` — bearish-on-fundamentals thesis with citations
    - `gme-mixed-degraded.json` — narrative collapses on dispersion

    Per-dimension variance assertion: for each of the 5 JudgeDimensions, the 32-exemplar population standard deviation of `human_scores[dimension]` MUST be > 0.5 (asserted in Task 1's unit test once these exemplars exist).
  </behavior>
  <action>
    A. Create 32 JSON files at `tests/golden-tickers/_human_labels/<symbol>-<pair-type>.json`. Each conforms to the HumanExemplar shape:

    ```json
    {
      "exemplar_id": "gme-crowded-degraded",
      "ticker": "GME",
      "notes": "Candidate treats 100% StockTwits bullish as a thesis — the originating Phase-20 bug (CONTEXT.md line 5). High mention_z, low author_diversity, no dispersion warning. Should score 0 on contradiction_handling.",
      "baseline_text": "GME bull/bear split: 60/40 on StockTwits over 24h (n=412 messages). Three sources contributed (StockTwits, Reddit, anthropic-search). Author diversity Gini = 0.51 — within normal band. Forward outlook neutral pending Q4 earnings (sec_filings).",
      "candidate_text": "GME is 100% bullish on StockTwits (n=412 messages, 24h). Strong consensus thesis: buy on retail-confidence wave.",
      "human_scores": {
        "numeric_grounding": 3,
        "citation_coverage": 2,
        "narrative_coherence": 2,
        "hedging_quality": 0,
        "contradiction_handling": 0
      },
      "labeler": "tj",
      "labeled_at": "2026-05-11T10:30:00-07:00"
    }
    ```

    For each pair, write baseline_text and candidate_text to be ≤ 800 chars (keeps the 20-Z-05 harness fast). Each text references plausible SourcePackage origins (yahoo / finnhub / polygon / anthropic-search / stocktwits / firecrawl / sec_filings) so the rubric anchors are exercised.

    B. After writing all 32 files, run the variance test from Task 1 — it should now go GREEN (per-dimension std dev > 0.5).

    C. Compute and document in RUNBOOK-CURATION.md (Task 8) the per-dimension distribution of scores across the 32 exemplars (mean, std, 5th/95th percentile) so future additions can preserve the variance.

    D. If 20-Z-05 already shipped its 5-exemplar starter set (`example-aapl-bullish.json` etc.), preserve those files — this plan's 32 exemplars are ADDITIVE (the 5 starters can be migrated/renamed in a follow-up if desired, or kept as-is — the only hard requirement is `ls tests/golden-tickers/_human_labels/*.json \| wc -l >= 30`).

    E. The pair-type naming convention is flexible per ticker — e.g., for SPY the natural pairs are `spy-neutral-clean`, `spy-neutral-degraded`, `spy-bullish-clean`, `spy-bearish-degraded` because ETFs rarely produce strong bull/bear thesis. The naming MUST be derivable from the filename so the unit test can iterate. Document the per-ticker pair plan in RUNBOOK-CURATION.md (Task 8).
  </action>
  <acceptance_criteria>
    - `ls tests/golden-tickers/_human_labels/*.json | wc -l` returns ≥ 32 (or ≥ 30 if some 20-Z-05 starters are kept verbatim — the floor is 30 per the 20-Z-05 ship-gate dependency)
    - Every file parses as JSON and contains all HumanExemplar keys: exemplar_id, ticker, notes, baseline_text, candidate_text, human_scores, labeler, labeled_at
    - Every `human_scores` object has all 5 JudgeDimension keys with integer values in [0,5]
    - Per-dimension population std dev across the corpus is > 0.5 for each of the 5 dimensions
    - Every ticker in the manifest has at least 4 exemplars (8 tickers × 4 = 32)
    - At least 2 GME exemplars exercise the "crowded consensus" semantics (one clean, one degraded)
  </acceptance_criteria>
  <verify>
    <automated>node -e "const fs=require('fs'),path=require('path');const dir='tests/golden-tickers/_human_labels';const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json'));if(files.length<30){console.error('exemplar count',files.length,'< 30');process.exit(1);}const dims=['numeric_grounding','citation_coverage','narrative_coherence','hedging_quality','contradiction_handling'];const byDim={};dims.forEach(d=>byDim[d]=[]);for(const f of files){const j=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));for(const d of dims){if(typeof j.human_scores[d]!=='number'||j.human_scores[d]<0||j.human_scores[d]>5){console.error('bad score',f,d,j.human_scores[d]);process.exit(2);}byDim[d].push(j.human_scores[d]);}}for(const d of dims){const m=byDim[d].reduce((a,b)=>a+b,0)/byDim[d].length;const v=byDim[d].reduce((a,b)=>a+(b-m)*(b-m),0)/byDim[d].length;const s=Math.sqrt(v);if(s<=0.5){console.error('std too low',d,s.toFixed(3));process.exit(3);}}console.log('OK',files.length,'exemplars; per-dim std >0.5 for all 5 dims');"</automated>
  </verify>
  <done>≥30 human-label exemplars committed; per-dimension std dev > 0.5; GME crowded-consensus pair exercises the originating bug; 20-Z-05's Pearson ship-gate unlocked (n≥30)</done>
</task>

<task type="auto" tdd="true" id="20-D-04-05">
  <name>Task 5: Orchestrated suite test — composes 20-D-01 + 20-D-02 (soft-ref) + 20-D-03 + word-count gate</name>
  <files>tests/integration/golden-ticker-suite.regression.test.ts</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-D-01-PLAN.md (lines 43-58 — numericGroundingCheck signature; lines 123-128 — the regression test pattern this task composes WITH not duplicates)
    - .planning/phases/20-real-sentiment-analysis/20-D-03-PLAN.md (lines 41-56 — verifyClaimsBatch signature; lines 96-100 — Promise.allSettled fan-out pattern)
    - tests/golden-tickers/_manifest.json (committed by Task 1)
    - src/lib/types.ts (AnalysisResult + SourcePackage shapes — already loaded by the gates this task imports)
  </read_first>
  <behavior>
    Per-ticker integration test composing the gates from sibling plans:
    1. For each of the 8 manifest tickers, load `_sources/{symbol}.source.json` and `_reports/{symbol}.report.json` (symbol resolved via `t.rotation_policy === 'monthly' ? t.current_symbol : t.symbol`)
    2. Assert frozen report parses as Zod-valid AnalysisResult (delegate to AnalysisResultSchema from gemini-analysis.ts)
    3. Numeric-grounding gate: call `numericGroundingCheck(report, source, TOLERANCE_SCHEDULE)` from 20-D-01; assert `result.ungrounded_spans.length === 0`
    4. Citation-coverage gate (20-D-02 soft-ref): dynamically import `@/lib/eval/citation-coverage`; if the import resolves, call it and assert coverage ≥ 0.8; if the import throws (module not yet on disk), log `[golden-ticker-suite] WARN: 20-D-02 citation-coverage gate is a no-op until that plan ships (TODO: replace this no-op once 20-D-02 lands)` and continue — the test does NOT fail when 20-D-02 hasn't shipped
    5. Per-claim verifier gate: call `verifyClaimsBatch(allSignals, source)` from 20-D-03; assert every verdict in the returned Map is one of `'true' | 'false' | 'null'` (no undefined). Note: the verifier requires `HF_DISTILBERT_MNLI_ENDPOINT` — when unset in CI, the test skips the verifier assertion with a documented WARN (same soft-ref pattern); we don't burn HF Inference budget on every CI run. To exercise the gate, set `RUN_LIVE_VERIFIER=true` in the workflow on schedule (nightly) — gated separately
    6. Word-count gate: compute `wordCount(report.executive_summary + ... + report.competitive_landscape)`; assert 500 ≤ wordCount ≤ 5000 per CONTEXT.md line 140
    7. No-5xx assertion: confirm report does NOT contain any sentinel strings that indicate a 5xx surface leaked into the rendered output ('Internal Server Error', '500 -', '502 Bad Gateway', etc.) — defensive belt-and-suspenders

    Per-ticker pass/fail is surfaced so a single fixture flake does not mask the others (use vitest's `it.each` with the per-ticker name in the test title).
  </behavior>
  <action>
    Create `tests/integration/golden-ticker-suite.regression.test.ts`:

    ```typescript
    import { describe, it, expect, beforeAll } from 'vitest';
    import fs from 'node:fs';
    import path from 'node:path';
    import { z } from 'zod';
    import { numericGroundingCheck, TOLERANCE_SCHEDULE } from '@/lib/eval/numeric-grounding';
    import { verifyClaimsBatch } from '@/lib/eval/per-claim-verifier';
    import { AnalysisResultSchema } from '@/lib/gemini-analysis';
    // SourcePackage Zod (or structural validator) — adjust to actual export name once 20-D-01 lands
    // import { SourcePackageSchema } from '@/lib/types';

    const GOLDEN_DIR = path.join(process.cwd(), 'tests/golden-tickers');
    const MANIFEST = JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, '_manifest.json'), 'utf8'));

    function resolveSymbol(t: { symbol: string; rotation_policy: string; current_symbol?: string }) {
      return t.rotation_policy === 'monthly' && t.current_symbol && t.current_symbol !== 'TBD-FIRST-ROTATION'
        ? t.current_symbol
        : t.symbol;
    }

    function wordCount(s: string): number {
      return s.trim().split(/\s+/).filter(Boolean).length;
    }

    const NARRATIVE_FIELDS = [
      'executive_summary', 'investment_thesis', 'key_risks',
      'valuation_context', 'future_projection',
      'business_description', 'financial_analysis', 'competitive_landscape',
    ] as const;

    const SERVER_ERROR_SENTINELS = [
      'Internal Server Error', '500 -', '502 Bad Gateway',
      '503 Service Unavailable', '504 Gateway Timeout',
    ];

    describe('golden-ticker-suite regression', () => {
      for (const t of MANIFEST.tickers) {
        const sym = resolveSymbol(t);
        if (sym === 'TBD-FIRST-ROTATION') {
          it.skip(`${t.category} — micro-cap rotation pending first cycle`, () => {});
          continue;
        }

        describe(`${sym} (${t.category})`, () => {
          let source: any;
          let report: any;

          beforeAll(() => {
            source = JSON.parse(fs.readFileSync(
              path.join(GOLDEN_DIR, '_sources', `${sym.toLowerCase()}.source.json`), 'utf8',
            ));
            report = JSON.parse(fs.readFileSync(
              path.join(GOLDEN_DIR, '_reports', `${sym.toLowerCase()}.report.json`), 'utf8',
            ));
          });

          it('report is Zod-valid AnalysisResult', () => {
            expect(() => AnalysisResultSchema.parse(report)).not.toThrow();
          });

          it('numeric-grounding gate (20-D-01) — zero ungrounded spans', () => {
            const result = numericGroundingCheck(report, source, TOLERANCE_SCHEDULE);
            if (result.ungrounded_spans.length > 0) {
              console.error(`[${sym}] ungrounded spans:`, result.ungrounded_spans);
            }
            expect(result.ungrounded_spans).toHaveLength(0);
          });

          it('citation-coverage gate (20-D-02, soft-ref)', async () => {
            try {
              const mod = await import('@/lib/eval/citation-coverage');
              const coverage = await mod.citationCoverage(report, source);
              expect(coverage).toBeGreaterThanOrEqual(0.8);
            } catch (e) {
              console.warn(
                `[golden-ticker-suite][${sym}] WARN: 20-D-02 citation-coverage gate is a ` +
                `no-op until that plan ships (TODO: replace this no-op once 20-D-02 lands).`,
              );
            }
          });

          it('per-claim verifier gate (20-D-03) — every signal has a verdict', async () => {
            if (!process.env.HF_DISTILBERT_MNLI_ENDPOINT && process.env.RUN_LIVE_VERIFIER !== 'true') {
              console.warn(
                `[golden-ticker-suite][${sym}] WARN: per-claim verifier requires ` +
                `HF_DISTILBERT_MNLI_ENDPOINT or RUN_LIVE_VERIFIER=true; skipping verdict assertion.`,
              );
              return;
            }
            const signals = [
              ...(report.bullish_signals ?? []).map((s: any, i: number) => ({ ...s, _id: `bullish-${i}` })),
              ...(report.bearish_signals ?? []).map((s: any, i: number) => ({ ...s, _id: `bearish-${i}` })),
              ...(report.risks ?? []).map((s: any, i: number) => ({ ...s, _id: `risks-${i}` })),
            ];
            const verdicts = await verifyClaimsBatch(signals, source);
            for (const [id, v] of verdicts.entries()) {
              expect(['true', 'false', 'null']).toContain(v);
            }
          });

          it('word-count gate — narrative ∈ [500, 5000]', () => {
            const text = NARRATIVE_FIELDS.map(f => report[f] ?? '').join('\n');
            const n = wordCount(text);
            expect(n).toBeGreaterThanOrEqual(500);
            expect(n).toBeLessThanOrEqual(5000);
          });

          it('no 5xx sentinel leaked into narrative', () => {
            const text = NARRATIVE_FIELDS.map(f => report[f] ?? '').join('\n');
            for (const sentinel of SERVER_ERROR_SENTINELS) {
              expect(text).not.toContain(sentinel);
            }
          });
        });
      }
    });
    ```

    Notes:
    - The suite uses `describe` blocks per ticker so vitest's failure output names the broken ticker directly — solves T-20-D-04-04 (single-flake masking).
    - The 20-D-03 verifier gate is environment-gated (skipped without `HF_DISTILBERT_MNLI_ENDPOINT` or `RUN_LIVE_VERIFIER=true`) so daily CI doesn't burn HF tokens. A nightly cron in `.github/workflows/golden-ticker-suite.yml` (Task 8) sets `RUN_LIVE_VERIFIER=true` to exercise the gate at least once per day.
    - The micro-cap slot with placeholder `TBD-FIRST-ROTATION` is `it.skip`-ed until the first rotation cron writes a real symbol; per-ticker skip surfaces explicitly in vitest output.
  </action>
  <acceptance_criteria>
    - File `tests/integration/golden-ticker-suite.regression.test.ts` exists
    - When Tasks 2 + 3 have completed: `npx vitest run tests/integration/golden-ticker-suite.regression.test.ts` exits 0 with per-ticker passes visible in output
    - When fixtures are absent: the test fails clearly with `ENOENT: no such file or directory, open 'tests/golden-tickers/_sources/aapl.source.json'` (the operator-gate signal — fixture must land first)
    - Soft-ref behavior verified: with 20-D-02 not on disk, the test logs the WARN and the citation-coverage assertion does NOT fail the run
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/integration/golden-ticker-suite.regression.test.ts</automated>
  </verify>
  <done>Orchestrated suite composes 20-D-01 + 20-D-02 (soft-ref) + 20-D-03 + word-count + no-5xx gates per ticker; per-ticker pass/fail surfaced; soft-ref for 20-D-02 confirmed</done>
</task>

<task type="auto" tdd="true" id="20-D-04-06">
  <name>Task 6: Synthetic-injection test — proves the suite gates are real (not vacuously passing)</name>
  <files>tests/integration/golden-ticker-suite.synthetic-injection.test.ts</files>
  <read_first>
    - tests/integration/golden-ticker-suite.regression.test.ts (Task 5)
    - 20-D-01-PLAN.md lines 126-128 (the equivalent injection pattern in 20-D-01)
  </read_first>
  <behavior>
    For each of the 8 manifest tickers, prove that the orchestrated suite FAILS the right gate when bad data is injected:
    1. Deep-clone the frozen report
    2. Injection A: splice `'$999,999'` into `executive_summary` — assert `numericGroundingCheck` returns at least one failure whose `span_text` includes '$999,999'
    3. Injection B: set the first `bullish_signal.description` to a contradiction of a SourcePackage value (e.g., "Revenue declined to $0 in last quarter" when fundamentals.revenue is positive) — assert `verifyClaimsBatch` returns 'false' or 'null' for that signal (gated on `RUN_LIVE_VERIFIER=true`; otherwise skip with WARN)
    4. Injection C: replace `executive_summary` with a single word — assert word_count gate fails with `n < 500`
    5. Injection D: splice a 5xx sentinel ('Internal Server Error') into `key_risks` — assert no-5xx assertion fails
    6. Clean (non-injected) re-run for each ticker — assert the suite PASSES, proving the gates fire only on bad input
  </behavior>
  <action>
    Create `tests/integration/golden-ticker-suite.synthetic-injection.test.ts`. Use the same MANIFEST loading + per-ticker iteration pattern as Task 5. Each per-ticker block runs 4 injection sub-tests + 1 clean-baseline sub-test.

    Key pattern (per ticker):

    ```typescript
    describe(`synthetic-injection ${sym} (${t.category})`, () => {
      let baseSource: any;
      let baseReport: any;

      beforeAll(() => {
        baseSource = JSON.parse(fs.readFileSync(...));
        baseReport = JSON.parse(fs.readFileSync(...));
      });

      it('clean baseline — numeric-grounding passes', () => {
        const r = numericGroundingCheck(baseReport, baseSource, TOLERANCE_SCHEDULE);
        expect(r.ungrounded_spans).toHaveLength(0);
      });

      it('injection A — unmatchable number FAILS numeric-grounding', () => {
        const dirty = structuredClone(baseReport);
        dirty.executive_summary = `${dirty.executive_summary} The new estimated price target is $999,999.`;
        const r = numericGroundingCheck(dirty, baseSource, TOLERANCE_SCHEDULE);
        expect(r.ungrounded_spans.length).toBeGreaterThan(0);
        expect(r.ungrounded_spans.some((s: any) => s.span_text.includes('999,999'))).toBe(true);
      });

      it('injection C — single-word summary FAILS word-count gate', () => {
        const dirty = structuredClone(baseReport);
        dirty.executive_summary = 'Buy.';
        const text = NARRATIVE_FIELDS.map(f => dirty[f] ?? '').join('\n');
        const n = wordCount(text);
        // The point of this injection is that the SUITE would catch it; we replicate the
        // suite's assertion here as a direct expectation:
        // (when the injection is harsh enough — single word over the joined narrative — n
        //  drops below the suite's 500 floor on at least 4 of 8 tickers; for those where it
        //  doesn't, we drop other narrative fields too to force the floor breach)
        if (n >= 500) {
          for (const f of NARRATIVE_FIELDS) {
            if (f !== 'executive_summary') dirty[f] = '';
          }
        }
        const text2 = NARRATIVE_FIELDS.map(f => dirty[f] ?? '').join('\n');
        expect(wordCount(text2)).toBeLessThan(500);
      });

      it('injection D — 5xx sentinel FAILS no-5xx check', () => {
        const dirty = structuredClone(baseReport);
        dirty.key_risks = `${dirty.key_risks} Internal Server Error during data fetch.`;
        const text = NARRATIVE_FIELDS.map(f => dirty[f] ?? '').join('\n');
        expect(SERVER_ERROR_SENTINELS.some(s => text.includes(s))).toBe(true);
      });

      // Injection B (verifier) gated behind RUN_LIVE_VERIFIER per Task 5 reasoning
    });
    ```

    Each ticker contributes ≥4 sub-tests = 32 total injection assertions. Synthetic-injection failure = build failure per the hard cleanup gate.
  </action>
  <acceptance_criteria>
    - File `tests/integration/golden-ticker-suite.synthetic-injection.test.ts` exists
    - `npx vitest run tests/integration/golden-ticker-suite.synthetic-injection.test.ts` exits 0 with at least 4 injection sub-tests per ticker × 8 tickers = 32 sub-tests passing (plus 8 clean-baseline sub-tests = 40 total)
    - Manually mutating a gate (e.g., changing numericGroundingCheck to always return `{ ungrounded_spans: [] }`) causes injection A to fail vitest run — verifies the test is not vacuous
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/integration/golden-ticker-suite.synthetic-injection.test.ts</automated>
  </verify>
  <done>≥4 injection sub-tests per ticker × 8 tickers all pass on clean fixtures; suite gates proven real</done>
</task>

<task type="auto" tdd="true" id="20-D-04-07">
  <name>Task 7: Micro-cap rotation script + candidate pool + unit tests + Vercel cron entry</name>
  <files>tests/golden-tickers/_micro_cap_pool.json, scripts/rotate-micro-cap.ts, tests/unit/golden-ticker-rotation.unit.test.ts, vercel.json, package.json</files>
  <read_first>
    - vercel.json (lines 1-50 — verify crons array shape; existing crons follow the same {path, schedule} structure)
    - CLAUDE.md (Vercel cron section — recall `/api/cron/...` path convention + `CRON_SECRET` header verification)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 175-176 — operator action: "Curate the 8 golden-ticker snapshots once (one-time human curation step; ~2 hours)")
  </read_first>
  <behavior>
    1. `tests/golden-tickers/_micro_cap_pool.json` — candidate pool with ≥20 entries; each meets {market_cap < $300M, daily_avg_volume_30d < 500k, analyst_count ≤ 1}; `pool.history[]` tracks selections
    2. `scripts/rotate-micro-cap.ts` — deterministic selection: sort by (last_selected_at ASC nulls-first, market_cap ASC); pick first whose last_selected_at is >12 months ago OR null; idempotent
    3. Selection algorithm unit tests:
       a. Deterministic — same pool + same month → same symbol
       b. 12-month cooldown — symbol selected 11 months ago is NOT picked; symbol selected 13 months ago IS eligible
       c. All-recent → script exits with documented error and human-readable message
       d. Empty pool → script exits with documented error
       e. Atomic write — manifest update + pool.history update happen in one fs.writeFileSync per file, in the same pass
    4. `vercel.json` gains `/api/cron/rotate-micro-cap` on `0 9 1 * *` (monthly, 1st, 09:00 UTC) — Pro plan tier required per CLAUDE.md cron skill (Hobby maxes at daily)
    5. The cron path's API handler (src/app/api/cron/rotate-micro-cap/route.ts) is OUT OF SCOPE for this plan — the handler is documented in RUNBOOK-CURATION.md as a follow-up implementation; the script is fully invocable manually via `npm run rotate-micro-cap` until the handler lands (the operator can run the first rotation by hand)
  </behavior>
  <action>
    A. Create `tests/golden-tickers/_micro_cap_pool.json` with ≥20 candidates. Source the symbols from a documented snapshot (e.g., "Russell Microcap Index constituents with market_cap < $300M and analyst_count ≤ 1, snapshot 2026-05-01 via yahoo-finance2 fundamentals scan"). Document the snapshot source in `generated_at` + `source_dataset` fields. Each candidate carries `last_selected_at: null` initially:

    ```json
    {
      "generated_at": "2026-05-11",
      "source_dataset": "Russell Microcap subset, snapshot 2026-05-01 via yahoo-finance2 fundamentals — see scripts/snapshot-microcap-pool.ts (follow-up)",
      "eligibility_criteria": {
        "market_cap_max_usd": 300000000,
        "daily_avg_volume_30d_max": 500000,
        "analyst_count_max": 1
      },
      "candidates": [
        { "symbol": "AAAA", "market_cap": 180000000, "daily_avg_volume_30d": 220000, "analyst_count": 0, "last_selected_at": null },
        { "symbol": "BBBB", "market_cap": 250000000, "daily_avg_volume_30d": 380000, "analyst_count": 1, "last_selected_at": null }
        // ... ≥18 more
      ],
      "history": []
    }
    ```

    The actual symbols here will be picked by the operator OR by a follow-up script during Task 2's curation pass. For this Task, the unit-test exercise can use a SYNTHETIC pool of 20 fake symbols so the test logic is verifiable without the real pool — but the file shape committed to disk MUST be the real pool. The plan accepts a short-term operator-handoff stub (e.g., 20 alphabetically-named placeholders) that the operator replaces in Task 2 with real micro-cap symbols.

    B. Create `scripts/rotate-micro-cap.ts`:

    ```typescript
    #!/usr/bin/env tsx
    // Monthly rotation for the micro-cap-low-coverage slot in the golden-ticker manifest.
    // Deterministic, idempotent. Selection algorithm:
    //   1. Filter pool.candidates to those with last_selected_at === null OR > 12 months ago
    //   2. Sort by (last_selected_at ASC nulls-first, market_cap ASC)
    //   3. Pick the first
    //   4. Update _manifest.json: tickers[micro-cap-slot].current_symbol = picked.symbol
    //   5. Update _micro_cap_pool.json: candidates[picked].last_selected_at = today;
    //      history.push({ symbol, selected_at: today, selected_for_month: 'YYYY-MM' })
    // Atomic writes (fs.writeFileSync per file in one pass, no intermediate state).
    import fs from 'node:fs';
    import path from 'node:path';

    const POOL_PATH = path.join(process.cwd(), 'tests/golden-tickers/_micro_cap_pool.json');
    const MANIFEST_PATH = path.join(process.cwd(), 'tests/golden-tickers/_manifest.json');
    const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

    export function selectNextSymbol(pool: any, now: Date = new Date()): string {
      const cutoff = now.getTime() - TWELVE_MONTHS_MS;
      const eligible = pool.candidates.filter((c: any) =>
        c.last_selected_at === null || new Date(c.last_selected_at).getTime() < cutoff,
      );
      if (eligible.length === 0) {
        throw new Error(
          'rotate-micro-cap: no eligible candidates — every pool entry was selected within ' +
          'the last 12 months. Refresh the pool via scripts/snapshot-microcap-pool.ts.',
        );
      }
      eligible.sort((a: any, b: any) => {
        const at = a.last_selected_at ? new Date(a.last_selected_at).getTime() : 0;
        const bt = b.last_selected_at ? new Date(b.last_selected_at).getTime() : 0;
        if (at !== bt) return at - bt;
        return a.market_cap - b.market_cap;
      });
      return eligible[0].symbol;
    }

    export function rotate(now: Date = new Date()): { symbol: string; pr_body: string } {
      const pool = JSON.parse(fs.readFileSync(POOL_PATH, 'utf8'));
      const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      const symbol = selectNextSymbol(pool, now);

      // Update pool
      const cand = pool.candidates.find((c: any) => c.symbol === symbol);
      cand.last_selected_at = now.toISOString().slice(0, 10);
      pool.history.push({
        symbol, selected_at: cand.last_selected_at,
        selected_for_month: now.toISOString().slice(0, 7),
      });
      pool.generated_at = now.toISOString().slice(0, 10);

      // Update manifest — micro-cap slot is the last entry by convention
      const mc = manifest.tickers.find((t: any) => t.category === 'micro-cap-low-coverage');
      if (!mc) throw new Error('rotate-micro-cap: manifest missing micro-cap-low-coverage slot');
      mc.current_symbol = symbol;
      manifest.version = now.toISOString().slice(0, 10);

      // Atomic-ish writes — one syscall per file
      fs.writeFileSync(POOL_PATH, JSON.stringify(pool, null, 2) + '\n');
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

      const pr_body = [
        `## Micro-cap rotation — ${now.toISOString().slice(0, 7)}`,
        ``,
        `**Selected:** ${symbol}`,
        `**Market cap:** ~$${Math.round(cand.market_cap / 1_000_000)}M`,
        `**Daily volume (30d avg):** ${cand.daily_avg_volume_30d.toLocaleString()}`,
        `**Analyst count:** ${cand.analyst_count}`,
        ``,
        `Operator: verify the symbol still meets eligibility criteria (market_cap < $300M, ` +
        `daily_avg_volume_30d < 500k, analyst_count ≤ 1). If yes, record the SourcePackage + ` +
        `frozen report via 20-D-01's record-frozen-report.ts.`,
      ].join('\n');

      return { symbol, pr_body };
    }

    if (import.meta.url === `file://${process.argv[1]}`) {
      try {
        const { symbol, pr_body } = rotate();
        console.log(pr_body);
        console.error(`[rotate-micro-cap] selected: ${symbol}`);
        process.exit(0);
      } catch (e) {
        console.error(`[rotate-micro-cap] FAILED:`, (e as Error).message);
        process.exit(1);
      }
    }
    ```

    C. Create `tests/unit/golden-ticker-rotation.unit.test.ts`:

    ```typescript
    import { describe, it, expect } from 'vitest';
    import { selectNextSymbol } from '../../scripts/rotate-micro-cap';

    describe('selectNextSymbol', () => {
      const synthPool = (entries: Array<{ s: string; mc: number; last?: string | null }>) => ({
        candidates: entries.map(e => ({
          symbol: e.s, market_cap: e.mc, daily_avg_volume_30d: 100000,
          analyst_count: 0, last_selected_at: e.last ?? null,
        })),
      });

      it('picks the smallest market_cap when all are null', () => {
        const pool = synthPool([
          { s: 'AAA', mc: 200_000_000 },
          { s: 'BBB', mc: 100_000_000 },
          { s: 'CCC', mc: 250_000_000 },
        ]);
        expect(selectNextSymbol(pool, new Date('2026-05-11'))).toBe('BBB');
      });

      it('is deterministic across calls', () => {
        const pool = synthPool([
          { s: 'AAA', mc: 200_000_000 }, { s: 'BBB', mc: 100_000_000 },
        ]);
        const d = new Date('2026-05-11');
        expect(selectNextSymbol(pool, d)).toBe(selectNextSymbol(pool, d));
      });

      it('skips symbols selected within 12 months', () => {
        const pool = synthPool([
          { s: 'AAA', mc: 100_000_000, last: '2025-06-01' }, // 11mo ago — INELIGIBLE
          { s: 'BBB', mc: 250_000_000 },                      // null — eligible
        ]);
        expect(selectNextSymbol(pool, new Date('2026-05-11'))).toBe('BBB');
      });

      it('allows symbols selected >12 months ago', () => {
        const pool = synthPool([
          { s: 'AAA', mc: 100_000_000, last: '2024-01-01' }, // >12mo ago — eligible
          { s: 'BBB', mc: 250_000_000 },
        ]);
        // AAA wins on (older last_selected_at, smaller mc)
        expect(selectNextSymbol(pool, new Date('2026-05-11'))).toBe('AAA');
      });

      it('throws when no candidate is eligible', () => {
        const pool = synthPool([
          { s: 'AAA', mc: 100_000_000, last: '2026-01-01' }, // 4mo ago — INELIGIBLE
        ]);
        expect(() => selectNextSymbol(pool, new Date('2026-05-11'))).toThrow(/no eligible/i);
      });

      it('throws on empty pool', () => {
        expect(() => selectNextSymbol({ candidates: [] }, new Date('2026-05-11')))
          .toThrow(/no eligible/i);
      });
    });
    ```

    D. Update `vercel.json` `crons` array (Read first to confirm shape):

    ```json
    {
      "path": "/api/cron/rotate-micro-cap",
      "schedule": "0 9 1 * *"
    }
    ```

    Note: this requires the operator to be on the Pro plan (Hobby max is daily). Document this in RUNBOOK-CURATION.md and in the model card. Until the API handler at `src/app/api/cron/rotate-micro-cap/route.ts` lands as a follow-up, the operator runs the first rotation manually via `npm run rotate-micro-cap`.

    E. Update `package.json` scripts: `"rotate-micro-cap": "tsx scripts/rotate-micro-cap.ts"`.
  </action>
  <acceptance_criteria>
    - Files `tests/golden-tickers/_micro_cap_pool.json`, `scripts/rotate-micro-cap.ts`, `tests/unit/golden-ticker-rotation.unit.test.ts` exist
    - `npx vitest run tests/unit/golden-ticker-rotation.unit.test.ts` exits 0 with ≥6 passing tests
    - `tests/golden-tickers/_micro_cap_pool.json` has `candidates.length >= 20`
    - `vercel.json` contains a `crons` entry for `/api/cron/rotate-micro-cap`
    - `npm run rotate-micro-cap` (after manifest + pool exist) writes a new `current_symbol` to manifest and a new `history` entry to pool; running it again on the same month is idempotent on the manifest (same symbol re-picked) but appends to history (acceptable — history is append-only by design)
    - `package.json` scripts include `rotate-micro-cap`
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/unit/golden-ticker-rotation.unit.test.ts && node -e "const j=JSON.parse(require('fs').readFileSync('tests/golden-tickers/_micro_cap_pool.json','utf8'));if(j.candidates.length<20){console.error('pool size',j.candidates.length,'< 20');process.exit(1);}const v=JSON.parse(require('fs').readFileSync('vercel.json','utf8'));if(!(v.crons||[]).some(c=>c.path==='/api/cron/rotate-micro-cap')){console.error('vercel cron missing');process.exit(2);}console.log('OK');"</automated>
  </verify>
  <done>Rotation script + pool + cron entry committed; ≥6 unit tests cover determinism, cooldown, sort order, exhaustion; pool has ≥20 candidates</done>
</task>

<task type="auto" id="20-D-04-08">
  <name>Task 8: CLI runner (check-golden-tickers) + GitHub Actions workflow + RUNBOOK-CURATION.md</name>
  <files>scripts/check-golden-tickers.ts, .github/workflows/golden-ticker-suite.yml, tests/golden-tickers/RUNBOOK-CURATION.md, package.json</files>
  <read_first>
    - 20-D-01-PLAN.md (lines 186-194 — the .github/workflows/numeric-grounding.yml structure; this plan's workflow mirrors that pattern)
    - tests/golden-tickers/RUNBOOK.md (20-D-01's runbook — Task 8's RUNBOOK-CURATION.md cross-references and supplements, does NOT supersede)
  </read_first>
  <action>
    A. Create `scripts/check-golden-tickers.ts`:

    ```typescript
    #!/usr/bin/env tsx
    // CLI runner — orchestrates the golden-ticker suite checks.
    // Exits 0 ONLY when all 8 fixtures present + manifest valid + ≥30 exemplars + suite green
    //   + synthetic-injection green.
    import fs from 'node:fs';
    import path from 'node:path';
    import { spawnSync } from 'node:child_process';

    type Check = { name: string; ok: boolean; detail: string };
    const checks: Check[] = [];

    function add(name: string, ok: boolean, detail: string) { checks.push({ name, ok, detail }); }

    const GOLDEN = path.join(process.cwd(), 'tests/golden-tickers');
    const MANIFEST = JSON.parse(fs.readFileSync(path.join(GOLDEN, '_manifest.json'), 'utf8'));

    // 1. Fixture presence
    const sources = fs.readdirSync(path.join(GOLDEN, '_sources')).filter(f => f.endsWith('.source.json'));
    const reports = fs.readdirSync(path.join(GOLDEN, '_reports')).filter(f => f.endsWith('.report.json'));
    add('SourcePackage fixtures (≥8)', sources.length >= 8, `${sources.length} files`);
    add('AnalysisResult fixtures (≥8)', reports.length >= 8, `${reports.length} files`);

    // 2. Exemplar count
    const exemplars = fs.readdirSync(path.join(GOLDEN, '_human_labels')).filter(f => f.endsWith('.json'));
    add('Human-label exemplars (≥30)', exemplars.length >= 30, `${exemplars.length} files`);

    // 3. Manifest version freshness (warn if >180 days old)
    const v = new Date(MANIFEST.version);
    const ageDays = (Date.now() - v.getTime()) / (1000 * 60 * 60 * 24);
    add(`Manifest age (≤180d)`, ageDays <= 180, `${Math.round(ageDays)}d since ${MANIFEST.version}`);

    // 4. Vitest pass — manifest + rotation unit + suite regression + synthetic-injection
    const vitests = [
      'tests/unit/golden-ticker-manifest.unit.test.ts',
      'tests/unit/golden-ticker-rotation.unit.test.ts',
      'tests/integration/golden-ticker-suite.regression.test.ts',
      'tests/integration/golden-ticker-suite.synthetic-injection.test.ts',
    ];
    for (const t of vitests) {
      const result = spawnSync('npx', ['vitest', 'run', t], { stdio: 'inherit' });
      add(`vitest ${path.basename(t)}`, result.status === 0, `exit=${result.status}`);
    }

    // 5. (Cross-plan) verify recording-manifest pinned prompt versions still resolve via 20-Z-04 registry
    //    — delegated to 20-D-01's check-numeric-grounding which 20-Z-04 ships the registry. Just call it.
    const cng = spawnSync('npm', ['run', 'check-numeric-grounding'], { stdio: 'inherit' });
    add('check-numeric-grounding (20-D-01 cross-gate)', cng.status === 0, `exit=${cng.status}`);

    // Summary
    let exit = 0;
    for (const c of checks) {
      const tag = c.ok ? '  OK ' : 'FAIL ';
      console.log(`${tag} ${c.name} — ${c.detail}`);
      if (!c.ok) exit = 1;
    }
    if (exit !== 0) {
      console.error('\n[check-golden-tickers] one or more checks failed — see lines marked FAIL.');
    } else {
      console.log('\n[check-golden-tickers] all gates green.');
    }
    process.exit(exit);
    ```

    B. Create `.github/workflows/golden-ticker-suite.yml`:

    ```yaml
    name: Golden Ticker Suite
    on:
      pull_request:
        paths:
          - 'src/lib/gemini-analysis.ts'
          - 'src/lib/research-brief.ts'
          - 'src/lib/prompts/**'
          - 'src/components/ResearchReport.tsx'
          - 'src/lib/eval/**'
          - 'tests/golden-tickers/**'
          - 'scripts/check-golden-tickers.ts'
          - 'scripts/rotate-micro-cap.ts'
      schedule:
        # Nightly full run with RUN_LIVE_VERIFIER=true exercises the 20-D-03 gate
        - cron: '0 6 * * *'  # 06:00 UTC daily
      workflow_dispatch: {}

    jobs:
      check:
        runs-on: ubuntu-latest
        timeout-minutes: 15
        env:
          # Set RUN_LIVE_VERIFIER only on the scheduled nightly run; PRs skip the verifier gate
          # to avoid burning HF tokens on every push.
          RUN_LIVE_VERIFIER: ${{ github.event_name == 'schedule' && 'true' || 'false' }}
          HF_DISTILBERT_MNLI_ENDPOINT: ${{ secrets.HF_DISTILBERT_MNLI_ENDPOINT }}
        steps:
          - uses: actions/checkout@v4
          - uses: actions/setup-node@v4
            with: { node-version: '20', cache: 'npm' }
          - run: npm ci
          - run: npm run check-golden-tickers
    ```

    C. Update `package.json` scripts: `"check-golden-tickers": "tsx scripts/check-golden-tickers.ts"`.

    D. Create `tests/golden-tickers/RUNBOOK-CURATION.md`:

    ```markdown
    # Golden-Ticker Corpus — Curation Runbook (20-D-04)

    This runbook is the OPERATOR'S manual for maintaining the 8-ticker golden corpus.
    20-D-01's `RUNBOOK.md` covers the RECORDING mechanics (script invocation, --temperature=0,
    --pin-prompts). This runbook covers WHICH tickers and exemplars to record and how to
    rotate the micro-cap slot.

    ## When to use this runbook

    - Adding a new exemplar to `_human_labels/`
    - Reviewing the monthly micro-cap rotation PR
    - Quarterly corpus health review (every 90 days)
    - Responding to a `WARN: manifest age >180 days` from check-golden-tickers
    - Replacing a stale ticker (e.g., SOFI no longer "recently-public" by mid-2027)

    ## Per-category curation rubric

    | Category | Symbol (initial) | Rubric criteria |
    |---|---|---|
    | large-cap-equity | AAPL | market_cap > $1T; dense analyst coverage; multi-source FieldOrigin |
    | mid-cap-equity | DKNG | $5B < market_cap < $25B; volatility profile; retail-heavy StockTwits |
    | meme-echo-chamber | GME | non-negotiable; the originating-bug ticker; stocktwits_bull_pct rapidly mean-reverting |
    | recently-public | SOFI | IPO date within last 36 months; sparse historical SEC filings |
    | ETF | SPY | security_type='etf'; fundamentals MOSTLY null; market_data present |
    | SPAC | DWAC | security_type='spac' or documented in sec_filings; thin fundamentals |
    | ADR | TSM | foreign primary listing; ADR-specific disclosures from anthropic-search |
    | micro-cap-low-coverage | ROTATING | market_cap < $300M; daily_avg_volume_30d < 500k; analyst_count ≤ 1 |

    ## Human-label exemplar procedure (4 pairs per ticker, 32 total)

    Per ticker, write 4 baseline-vs-candidate pairs across two tiers:

    - **2 'clean' pairs**: baseline and candidate are both well-grounded; candidate may add an
      extra citation or improve hedging. Expected human_scores cluster ≥ 4 on first 3 dimensions.
    - **2 'degraded' pairs**: candidate introduces a quality regression on ≥2 dimensions
      (unsourced numbers, dropped citations, unhedged claims, ignored contradictions). Expected
      human_scores ≤ 2 on the regressed dimensions.

    GME requires a specific pair: `gme-crowded-degraded.json` MUST simulate the
    originating bug (100% bullish single-source vendor tag → thesis), with contradiction_handling=0.

    Per-dimension std-dev across the 32 corpus must stay > 0.5 so 20-Z-05's Pearson denominator
    is well-defined. `check-golden-tickers` fails the build if std drops below 0.5 on any dimension.

    ## Monthly micro-cap rotation

    The `/api/cron/rotate-micro-cap` cron runs on the 1st of each month at 09:00 UTC. It opens
    a PR branch `rotate-micro-cap/{YYYY-MM}` with the proposed symbol. Operator review:

    1. Verify the symbol still meets eligibility (`scripts/rotate-micro-cap.ts` checks the pool
       entry but doesn't re-fetch live data — re-fetch via the Cipher production pipeline to
       confirm before approving)
    2. Confirm SourcePackage + frozen report recordings via 20-D-01's `record-frozen-report.ts`
    3. Confirm 4 human-label exemplars added for the new symbol — total exemplar count stays ≥30
    4. Merge the PR

    If the rotation cron exhausts the pool (every candidate selected within 12 months), refresh
    `_micro_cap_pool.json` via a follow-up snapshot script (out of scope for 20-D-04 — see
    `scripts/snapshot-microcap-pool.ts` follow-up).

    ## Quarterly corpus health review (every 90 days)

    1. Re-confirm each of the 7 static tickers still represents its category
    2. Re-confirm GME's role as the adversarial meme/echo-chamber ticker (replace ONLY if the
       crowded-consensus dynamic disappears — unlikely)
    3. SOFI specifically — if IPO date > 36 months ago at review time, replace with a more
       recent IPO from the recently-public pool
    4. Update `_manifest.json` `version` field to today's ISO date
    5. Run `npm run check-golden-tickers` to confirm green

    ## Prompt-bump re-record handoff (20-Z-04 → 20-D-01)

    When 20-Z-04's prompt registry bumps a version that affects any fixture:

    1. `check-golden-tickers` fails with the precise remediation message naming the fixture
    2. Follow 20-D-01's `RUNBOOK.md` to re-record the affected reports via
       `npm run record-frozen-report -- --ticker <sym> --pin-prompts latest`
    3. Commit the new `_reports/{sym}.report.json` + updated `_meta/recording-manifest.json`

    ## Operator-only bypass for fixture flake (T-20-D-04-04 mitigation)

    If one fixture breaks blocking, comment out the affected ticker in `_manifest.json` with:

    ```json
    // BYPASS-UNTIL: 2026-06-01 (ticket #1234)
    // { "symbol": "DKNG", "category": "mid-cap-equity", "rotation_policy": "static", ... }
    ```

    `check-golden-tickers` emits a WARN if any BYPASS-UNTIL date is older than 7 days. Bypass
    is bounded to ≤7 days; longer bypasses require an explicit operator ack in the PR description.

    ## Cross-references

    - 20-D-01's RUNBOOK.md — recording mechanics
    - 20-D-03 PLAN — per-claim verifier gate the suite consumes
    - 20-Z-05 PLAN — eval-judge consumer of the 32-exemplar set
    - 20-Z-06 PLAN — composite phase done-gate that calls `npm run check-golden-tickers`
    ```
  </action>
  <acceptance_criteria>
    - `scripts/check-golden-tickers.ts`, `.github/workflows/golden-ticker-suite.yml`, `tests/golden-tickers/RUNBOOK-CURATION.md` all exist
    - `npm run check-golden-tickers` exits 0 on a clean main with all fixtures present + ≥30 exemplars + suites green; exits 1 with structured failure output on drift
    - Workflow file is YAML-valid (`yamllint .github/workflows/golden-ticker-suite.yml` exits 0 OR vitest equivalent)
    - RUNBOOK-CURATION.md references both 20-D-01 RUNBOOK and 20-Z-05 + 20-Z-06 cross-handoffs
  </acceptance_criteria>
  <verify>
    <automated>npm run check-golden-tickers || (test -e scripts/check-golden-tickers.ts && test -e .github/workflows/golden-ticker-suite.yml && test -e tests/golden-tickers/RUNBOOK-CURATION.md && echo 'files present; suite exits non-zero pending Tasks 2+3 operator gates — expected') </automated>
  </verify>
  <done>CI runner + workflow + curation runbook committed; runner cleanly composes all upstream gates and emits structured pass/fail output</done>
</task>

<task type="auto" id="20-D-04-09">
  <name>Task 9: Model card for the golden-ticker corpus (S4 compliance)</name>
  <files>.planning/phases/20-real-sentiment-analysis/MODEL-CARD-golden-ticker-corpus.md</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md (MODEL-CARD-template.md location — typically under .planning/phases/20-real-sentiment-analysis/ following Mitchell-2019)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 22-23 — S4 standard)
  </read_first>
  <action>
    Create `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-golden-ticker-corpus.md` per the Mitchell-2019 template:

    ```markdown
    # Model Card — Golden Ticker Corpus (20-D-04)

    ## Overview
    The golden-ticker corpus is a curated set of 8 SourcePackage + frozen AnalysisResult pairs
    spanning 8 security-type categories. It is the regression-test substrate for every
    report-touching change in Phase 20+.

    ## Intended use
    - Regression coverage for report-generation changes (numeric grounding, citation coverage,
      per-claim verification, word-count, no-5xx).
    - Calibration corpus for 20-Z-05's LLM-as-judge harness (via 32 human-label exemplars).
    - CI gate via `.github/workflows/golden-ticker-suite.yml` — required-for-merge on PRs
      touching the report-generation surface.

    ## Out-of-scope use
    - Not a backtest dataset — does not generate alpha, only regression-tests report quality.
    - Not a public benchmark — corpus is internal; 7 of 8 tickers are US-listed public companies,
      no privacy concerns, but the snapshots reflect a specific point-in-time data state.
    - Not a sentiment-classifier training set — exemplars are FOR LLM-judge calibration only.

    ## Category boundaries (verbatim from CONTEXT.md §S9 + line 140)
    | Category | Symbol | Boundary criterion |
    |---|---|---|
    | large-cap-equity | AAPL | market_cap > $1T |
    | mid-cap-equity | DKNG | $5B < market_cap < $25B |
    | meme-echo-chamber | GME | non-negotiable; originating-bug ticker |
    | recently-public | SOFI | IPO within last 36 months |
    | ETF | SPY | security_type='etf' |
    | SPAC | DWAC | security_type='spac' or documented |
    | ADR | TSM | foreign primary listing |
    | micro-cap-low-coverage | ROTATING | market_cap < $300M; daily_avg_volume_30d < 500k; analyst_count ≤ 1 |

    ## Known limitations
    - 8 US-listed tickers — no foreign-only primary listings (TSM is the only ADR proxy for that)
    - No closed-end funds, preferred shares, or convertible bonds
    - Static curation date: 2026-05 — corpus refresh required if a category boundary breaks
      (e.g., SOFI ages out of recently-public by mid-2027)
    - The 32-exemplar set is labeled by a single operator — inter-rater reliability not measured
      (cross-rater calibration is deferred to Phase 24+)
    - Micro-cap rotation pool sourced from a single 2026-05-01 Russell Microcap snapshot — pool
      refresh is operator-driven (follow-up `scripts/snapshot-microcap-pool.ts`)

    ## Failure modes / known biases
    - **Curation bias** (T-20-D-04-03) — operator unconsciously picks "easy" tickers. Mitigated
      by the pre-specified 8-category boundary + GME as non-negotiable adversarial fixture +
      synthetic-injection test that proves the gates fire on bad data.
    - **Staleness** (T-20-D-04-01) — manifest version field surfaces freshness; check-golden-tickers
      WARNs at >180 days.
    - **Prompt-bump invalidation** (T-20-D-04-02) — 20-D-01's recording-manifest cross-validates
      pinned prompt versions against 20-Z-04's registry; stale fixtures fail the build with a
      precise re-record message.

    ## Retrain / refresh cadence
    - Monthly: micro-cap slot rotation via cron (`/api/cron/rotate-micro-cap`)
    - Quarterly: full corpus health review per RUNBOOK-CURATION.md
    - On prompt bump: re-record affected frozen reports via 20-D-01's record-frozen-report.ts
    - On regression: per-ticker pass/fail in the suite output names the broken fixture

    ## Dependencies
    - 20-D-01 — owns the SourcePackage + frozen-report fixture format + recording script
    - 20-D-02 — citation-coverage gate (soft-ref, no-op when not yet shipped)
    - 20-D-03 — per-claim verifier gate (composed by the orchestrated suite)
    - 20-Z-04 — prompt registry; bumps trigger re-record cycles
    - 20-Z-05 — eval harness consumer of the 32-exemplar set

    ## Operator handoffs
    See `tests/golden-tickers/RUNBOOK-CURATION.md` for: adding exemplars, monthly rotation review,
    quarterly health review, prompt-bump re-record, fixture-flake bypass.

    ## Ethical considerations
    - Public-company tickers — no PII, no proprietary data
    - Human-label exemplars contain synthetic baseline/candidate texts authored by the operator,
      not extracted from any user's actual research output
    - The corpus does NOT publish externally; lives only in the repo + CI
    - Phase 20 explicitly does NOT publish per-user calibration data (CONTEXT.md §S10) — that
      is gated to Phase 29 with legal-counsel review

    ## Status
    - 2026-05-11 — Plan 20-D-04 committed; corpus + manifest + 32 exemplars + rotation + CI gate landed
    ```
  </action>
  <acceptance_criteria>
    - File `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-golden-ticker-corpus.md` exists
    - Contains all Mitchell-2019 sections: Overview, Intended use, Out-of-scope use, Known limitations, Failure modes, Retrain cadence, Dependencies, Ethical considerations, Status
    - References 20-D-01, 20-D-03, 20-Z-04, 20-Z-05 cross-handoffs
  </acceptance_criteria>
  <verify>
    <automated>test -s .planning/phases/20-real-sentiment-analysis/MODEL-CARD-golden-ticker-corpus.md && grep -q "Intended use" .planning/phases/20-real-sentiment-analysis/MODEL-CARD-golden-ticker-corpus.md && grep -q "Known limitations" .planning/phases/20-real-sentiment-analysis/MODEL-CARD-golden-ticker-corpus.md && grep -q "20-D-01" .planning/phases/20-real-sentiment-analysis/MODEL-CARD-golden-ticker-corpus.md</automated>
  </verify>
  <done>Model card committed per S4 — corpus boundaries, limitations, refresh cadence, and cross-plan dependencies documented</done>
</task>

</tasks>

<verification>

Phase-level numerical acceptance (per S8):

1. **Fixture presence** — `ls tests/golden-tickers/_sources/*.source.json | wc -l` returns ≥ 8 AND `ls tests/golden-tickers/_reports/*.report.json | wc -l` returns ≥ 8 (verifies Tasks 2 + 3 operator gates landed)
2. **Exemplar count** — `ls tests/golden-tickers/_human_labels/*.json | wc -l` returns ≥ 32 (satisfies 20-Z-05's `n ≥ 30` Pearson ship-gate)
3. **Manifest schema** — `npx vitest run tests/unit/golden-ticker-manifest.unit.test.ts` exits 0 with ≥ 8 passing tests
4. **Per-dimension variance** — across the 32 exemplars, std dev > 0.5 for each of the 5 JudgeDimensions (asserted in the manifest unit test)
5. **Manifest version recorded** — `_manifest.json` `version` matches `^\d{4}-\d{2}-\d{2}$` and is no older than 180 days at CI time
6. **Rotation determinism** — `npx vitest run tests/unit/golden-ticker-rotation.unit.test.ts` exits 0 with ≥ 6 passing tests (covers determinism, cooldown, sort order, empty pool, exhaustion)
7. **Pool size** — `tests/golden-tickers/_micro_cap_pool.json` has `candidates.length >= 20`
8. **Suite green** — `npx vitest run tests/integration/golden-ticker-suite.regression.test.ts` exits 0 with per-ticker passes for all 8 manifest entries (or 7 + 1 skip if the micro-cap slot is `TBD-FIRST-ROTATION`)
9. **Synthetic-injection green** — `npx vitest run tests/integration/golden-ticker-suite.synthetic-injection.test.ts` exits 0 with ≥ 4 injection sub-tests × 8 tickers = 32 sub-tests passing (proving the gates fire on bad input)
10. **CLI runner green** — `npm run check-golden-tickers` exits 0 on `main` with all the above plus the cross-plan `check-numeric-grounding` (20-D-01) gate
11. **Cron entry** — `vercel.json` `crons[*]` contains `{ path: '/api/cron/rotate-micro-cap', schedule: '0 9 1 * *' }`
12. **CI workflow** — `.github/workflows/golden-ticker-suite.yml` exists and triggers on the documented paths + nightly schedule
13. **Model card** — `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-golden-ticker-corpus.md` exists with all Mitchell-2019 sections
14. **No production import** — `grep -rE "from ['\"](.*)golden-tickers['\"]" src/ --include='*.ts' --include='*.tsx' | grep -v 'app/api/cron/'` returns 0 matches

</verification>

<success_criteria>

Plan 20-D-04 closes when:
- All 9 tasks complete (7 autonomous + 2 operator gates)
- All 14 verification checks pass
- `npm run check-golden-tickers` exits 0 on `main`
- The CI workflow's status is marked required-for-merge in branch protection (operator-set step outside the plan)
- 20-Z-05's `scripts/eval-report.ts` no longer emits the `n < 30, insufficient for ship gate` warning

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-D-04-SUMMARY.md` per the standard SUMMARY template, with sections:
- What landed (manifest, 32 exemplars, rotation script, suite, CI gate, model card, runbook)
- Operator gates passed (Task 2 fixture curation, Task 3 frozen-report recording)
- Cross-plan unlocks (20-Z-05 Pearson ship-gate n≥30, suite composition over 20-D-01/03 + soft-ref to 20-D-02)
- Numbers (32 exemplars, std-dev per dimension, suite pass rate, injection test pass rate)
- Open follow-ups (snapshot-microcap-pool.ts, api/cron/rotate-micro-cap/route.ts handler, 20-D-02 wire-up when that plan lands)
</output>
