---
phase: 20
plan: 20-D-01
wave: D
type: execute
depends_on: [20-Z-04]
files_modified:
  - src/lib/eval/numeric-grounding.ts
  - src/lib/eval/numeric-grounding.types.ts
  - tests/unit/numeric-grounding.unit.test.ts
  - tests/golden-tickers/_sources/aapl.source.json
  - tests/golden-tickers/_sources/dkng.source.json
  - tests/golden-tickers/_sources/gme.source.json
  - tests/golden-tickers/_sources/sofi.source.json
  - tests/golden-tickers/_sources/spy.source.json
  - tests/golden-tickers/_sources/dwac.source.json
  - tests/golden-tickers/_sources/tsm.source.json
  - tests/golden-tickers/_sources/microcap.source.json
  - tests/golden-tickers/_reports/aapl.report.json
  - tests/golden-tickers/_reports/dkng.report.json
  - tests/golden-tickers/_reports/gme.report.json
  - tests/golden-tickers/_reports/sofi.report.json
  - tests/golden-tickers/_reports/spy.report.json
  - tests/golden-tickers/_reports/dwac.report.json
  - tests/golden-tickers/_reports/tsm.report.json
  - tests/golden-tickers/_reports/microcap.report.json
  - tests/golden-tickers/_meta/recording-manifest.json
  - tests/golden-tickers/RUNBOOK.md
  - tests/integration/numeric-grounding.regression.test.ts
  - tests/integration/numeric-grounding.synthetic-injection.test.ts
  - scripts/check-numeric-grounding.ts
  - scripts/record-frozen-report.ts
  - .github/workflows/numeric-grounding.yml
  - package.json
  - .planning/phases/20-real-sentiment-analysis/MODEL-CARD-numeric-grounding.md
autonomous: false
requirements: []
shadow_required: false
autonomous_skip_reason: "Task 6 is a checkpoint:human-action because recording the 8 frozen Gemini outputs at temperature=0 with pinned prompt versions requires the operator to (a) ensure GEMINI_API_KEY/AI_GATEWAY_API_KEY are present in .env.local (Claude has no way to write those, they live only in the operator shell) and (b) accept the ~$0.40 of Gemini API spend that the recording cycle consumes. Every other task in this plan is fully autonomous."
shadow_skip_reason: "Test-only artifact (eval harness + fixtures + CI gate). No production code path changes, no user-visible behavior change, no flag, no shadow mode. The grounding function itself runs only in CI and via npm run check-numeric-grounding — never invoked from a request handler, never from a cron job. Per S3 the shadow lifecycle applies to new production code paths; this plan introduces none."
hard_cleanup_gate: true
must_haves:
  truths:
    - "src/lib/eval/numeric-grounding.ts exports extractNumericSpans(text), findClosestSourceValue(span, sourcePackage, tolerance), and numericGroundingCheck(reportText, sourcePackage, toleranceSchedule) — all pure functions, no Prisma, no fs at call time, no env vars"
    - "ToleranceSchedule literal exported from src/lib/eval/numeric-grounding.types.ts with the exact tiers from CONTEXT.md line 137: ratios=0.005, share_counts=0 (exact), revenue=0.001, market_cap=0.001, price_targets=0.01, percentages=0.01 (1 pp absolute), derived=0.02"
    - "extractNumericSpans matches every canonical numeric form in the rendered report — plain integers, decimals, currency-prefixed ($125.50), suffixed-magnitudes (1.2B, 850M, 45K), percentages (5.2%, 0.5%), multipliers (23x, 1.5×), parenthesized negatives ((3.4%)), and Unicode-percent (5％) — backed by ≥20 canonical regex cases in the unit test"
    - "findClosestSourceValue walks every numeric leaf in the SourcePackage tree (market_data, fundamentals, analyst_sentiment, social_sentiment, supplementary_market_data, supplementary_sources[*].market_data, supplementary_sources[*].fundamentals) and returns the closest match within the tolerance for that span's tier, with field path (e.g., 'fundamentals.pe_ratio') and source-of-origin (FieldOrigin) attached"
    - "numericGroundingCheck reads exactly the fields enumerated in CONTEXT.md §20-D-01 (executive_summary + investment_thesis + key_risks + valuation_context + future_projection) plus business_description + financial_analysis + competitive_landscape (added because every section in a Wall-Street-grade report carries numbers per gemini-analysis.ts SYSTEM_PROMPT lines 164-176); failure objects contain {section, span_text, span_position, closest_source_value, closest_source_path, tolerance_used, tier}"
    - "8-fixture golden-ticker corpus committed under tests/golden-tickers/_sources/ — AAPL (large-cap equity), DKNG (mid-cap equity), GME (meme/echo-chamber equity), SOFI (recently-listed equity), SPY (ETF), DWAC (SPAC), TSM (ADR), microcap.source.json (low-coverage micro-cap, rotates monthly per 20-D-04 runbook); every fixture validates against SourcePackage Zod schema (or runtime structural equivalent if no schema exists)"
    - "8 frozen AnalysisResult JSON committed under tests/golden-tickers/_reports/ — recorded from a temperature=0 Gemini run via scripts/record-frozen-report.ts; each report file contains a header object {recorded_at, prompt_versions: Record<PromptId, PromptVersion>, gemini_model_revision, temperature: 0, source_hash} so a prompt-registry version bump (20-Z-04) flags the fixture as stale"
    - "tests/integration/numeric-grounding.regression.test.ts iterates all 8 (source, report) pairs and asserts ungrounded_spans.length === 0 for each; failure output prints span_text + closest_source_value + closest_source_path + tier so the operator can immediately localize the drift"
    - "tests/integration/numeric-grounding.synthetic-injection.test.ts proves the matcher is real (not vacuously passing): for each of 3 fixtures it injects an unmatchable number ('$999,999') into a copy of the frozen report and asserts the test FAILS with that exact span surfaced. Passes only when the injection is detected."
    - "npm run check-numeric-grounding script exits 0 on a clean main with all 8 fixtures; exits non-zero with a structured failure report when any span is ungrounded; documented in package.json scripts"
    - ".github/workflows/numeric-grounding.yml runs check-numeric-grounding + the regression + synthetic-injection vitest suites on every PR touching src/lib/gemini-analysis.ts, src/lib/research-brief.ts, src/lib/prompts/**, src/components/ResearchReport.tsx, tests/golden-tickers/**, or src/lib/eval/**; status is required for merge"
    - "tests/golden-tickers/RUNBOOK.md documents the operator procedure for (a) recording a new frozen report (scripts/record-frozen-report.ts with --temperature=0, --pin-prompt-versions, --commit-fixture), (b) responding to a prompt-registry version bump from 20-Z-04 (re-record affected fixtures), (c) adding a new ticker to the corpus (handed off to 20-D-04 for the security-type-coverage rule), and (d) handling a legitimate failure (when the report value is mathematically derived but no SourcePackage leaf matches — use the // DERIVED escape hatch or expand the SourcePackage)"
    - "tests/golden-tickers/_meta/recording-manifest.json carries the source hash + prompt-version pin + Gemini model revision for each (ticker, report) pair; npm run check-numeric-grounding cross-validates that every report's pinned prompt-versions still resolve via the 20-Z-04 registry, and that the source file's content hash matches the manifest — stale fixtures fail the build with a precise remediation message"
    - "MODEL-CARD-numeric-grounding.md exists per S4 — documents the matcher's intended use, known failure modes (scientific notation outside the canonical regex, locale-formatted numbers, words-as-numbers like 'one billion'), the tolerance schedule rationale, and the 8-ticker corpus boundaries"
    - "No production code path imports src/lib/eval/numeric-grounding.ts (grep verifies); the module is test-only"
  artifacts:
    - path: "src/lib/eval/numeric-grounding.types.ts"
      provides: "ToleranceSchedule literal + NumericSpan, SourceMatch, GroundingResult, GroundingFailure type definitions"
      contains: "export const TOLERANCE_SCHEDULE"
    - path: "src/lib/eval/numeric-grounding.ts"
      provides: "Pure-function matcher: extractNumericSpans, findClosestSourceValue, numericGroundingCheck"
      contains: "export function numericGroundingCheck"
    - path: "tests/unit/numeric-grounding.unit.test.ts"
      provides: "≥20 canonical regex cases + closest-value logic on synthetic SourcePackage + per-tier tolerance assertions"
      contains: "extractNumericSpans"
    - path: "tests/golden-tickers/_sources/aapl.source.json"
      provides: "AAPL frozen SourcePackage fixture (large-cap equity tier)"
      contains: "\"symbol\": \"AAPL\""
    - path: "tests/golden-tickers/_sources/dkng.source.json"
      provides: "DKNG frozen SourcePackage fixture (mid-cap equity tier)"
      contains: "\"symbol\": \"DKNG\""
    - path: "tests/golden-tickers/_sources/gme.source.json"
      provides: "GME frozen SourcePackage fixture (meme / echo-chamber tier — the originating bug)"
      contains: "\"symbol\": \"GME\""
    - path: "tests/golden-tickers/_sources/sofi.source.json"
      provides: "SOFI frozen SourcePackage fixture (recently-listed tier)"
      contains: "\"symbol\": \"SOFI\""
    - path: "tests/golden-tickers/_sources/spy.source.json"
      provides: "SPY frozen SourcePackage fixture (ETF tier — security_type='etf')"
      contains: "\"symbol\": \"SPY\""
    - path: "tests/golden-tickers/_sources/dwac.source.json"
      provides: "DWAC frozen SourcePackage fixture (SPAC tier — security_type='spac')"
      contains: "\"symbol\": \"DWAC\""
    - path: "tests/golden-tickers/_sources/tsm.source.json"
      provides: "TSM frozen SourcePackage fixture (ADR tier — security_type='adr')"
      contains: "\"symbol\": \"TSM\""
    - path: "tests/golden-tickers/_sources/microcap.source.json"
      provides: "Rotating micro-cap fixture (low-coverage tier; rotates monthly per 20-D-04 runbook)"
      contains: "\"security_type\""
    - path: "tests/golden-tickers/_reports/aapl.report.json"
      provides: "Frozen AnalysisResult for AAPL (temperature=0, prompt versions pinned)"
      contains: "executive_summary"
    - path: "tests/golden-tickers/_reports/dkng.report.json"
      provides: "Frozen AnalysisResult for DKNG"
      contains: "executive_summary"
    - path: "tests/golden-tickers/_reports/gme.report.json"
      provides: "Frozen AnalysisResult for GME"
      contains: "executive_summary"
    - path: "tests/golden-tickers/_reports/sofi.report.json"
      provides: "Frozen AnalysisResult for SOFI"
      contains: "executive_summary"
    - path: "tests/golden-tickers/_reports/spy.report.json"
      provides: "Frozen AnalysisResult for SPY"
      contains: "executive_summary"
    - path: "tests/golden-tickers/_reports/dwac.report.json"
      provides: "Frozen AnalysisResult for DWAC"
      contains: "executive_summary"
    - path: "tests/golden-tickers/_reports/tsm.report.json"
      provides: "Frozen AnalysisResult for TSM"
      contains: "executive_summary"
    - path: "tests/golden-tickers/_reports/microcap.report.json"
      provides: "Frozen AnalysisResult for rotating micro-cap"
      contains: "executive_summary"
    - path: "tests/golden-tickers/_meta/recording-manifest.json"
      provides: "Per-fixture manifest: source_hash, prompt_versions, gemini_model_revision, recorded_at, recorded_by"
      contains: "source_hash"
    - path: "tests/golden-tickers/RUNBOOK.md"
      provides: "Operator procedure for recording, re-recording on prompt bumps, ticker rotation, and the // DERIVED escape hatch"
      contains: "scripts/record-frozen-report.ts"
    - path: "tests/integration/numeric-grounding.regression.test.ts"
      provides: "Build-blocking test: every (source, report) pair must have ungrounded_spans.length === 0"
      contains: "numericGroundingCheck"
    - path: "tests/integration/numeric-grounding.synthetic-injection.test.ts"
      provides: "Proof-of-realness test: injecting an unmatchable number FAILS the matcher"
      contains: "synthetic injection"
    - path: "scripts/check-numeric-grounding.ts"
      provides: "CLI runner — exit 0 on clean fixtures, exit non-zero with structured failure on drift"
      contains: "process.exit"
    - path: "scripts/record-frozen-report.ts"
      provides: "Operator-only fixture recorder — calls Gemini with temperature=0, pinned prompt versions via 20-Z-04, writes report + manifest atomically"
      contains: "temperature: 0"
    - path: ".github/workflows/numeric-grounding.yml"
      provides: "CI gate — required check on PRs that touch the report-generation surface"
      contains: "check-numeric-grounding"
    - path: ".planning/phases/20-real-sentiment-analysis/MODEL-CARD-numeric-grounding.md"
      provides: "Model card per S4 — matcher's intended use, known failure modes, tolerance rationale, corpus boundaries"
      contains: "Numeric Grounding"
  key_links:
    - from: "scripts/check-numeric-grounding.ts"
      to: "src/lib/eval/numeric-grounding.ts numericGroundingCheck()"
      via: "imports + iterates tests/golden-tickers/_sources × _reports pairs"
      pattern: "numericGroundingCheck"
    - from: "scripts/record-frozen-report.ts"
      to: "src/lib/prompts/registry.ts getPrompt() (from 20-Z-04)"
      via: "pins prompt versions when recording — manifest captures them"
      pattern: "getPrompt"
    - from: "tests/golden-tickers/_meta/recording-manifest.json prompt_versions[*]"
      to: "src/lib/prompts/registry.ts PromptId union"
      via: "check-numeric-grounding cross-validates every pinned version resolves; stale fixtures (post 20-Z-04 bump) fail loudly"
      pattern: "prompt_versions"
    - from: ".github/workflows/numeric-grounding.yml"
      to: "scripts/check-numeric-grounding.ts + numeric-grounding.regression.test.ts + numeric-grounding.synthetic-injection.test.ts"
      via: "npm run check-numeric-grounding && vitest run tests/integration/numeric-grounding.*.test.ts"
      pattern: "check-numeric-grounding"
    - from: "tests/integration/numeric-grounding.regression.test.ts"
      to: "tests/golden-tickers/_sources/*.source.json + tests/golden-tickers/_reports/*.report.json"
      via: "fs.readdir + JSON.parse per pair"
      pattern: "_sources"
    - from: "20-D-02 (citation-coverage) + 20-D-03 (per-claim CoVe) + 20-D-04 (golden-tickers curation)"
      to: "tests/golden-tickers/_sources/ + _reports/ + RUNBOOK.md"
      via: "downstream plans reuse this corpus + runbook; 20-D-04 owns ticker rotation, this plan owns the numeric-grounding matcher"
      pattern: "tests/golden-tickers"
---

# Plan 20-D-01: Numeric-grounding regression test on the 8-golden-ticker corpus

<universal_preamble>

## Autonomous Execution Clause

This plan is fully autonomous. No live-Neon push, no operator confirmation needed for the matcher code, the unit tests, the CI workflow, or the runbook. The ONE step that requires the operator is recording the 8 frozen Gemini reports (Task 6) — that step uses the real Gemini API at temperature=0 and the operator must run `npm run record-frozen-report -- --ticker <SYM>` per fixture (or `--all`) once the SourcePackages are committed. The plan is structured so every other task is verifiable without that recording step (the regression test runs against committed fixtures), and Task 6 is the gate that flips the CI workflow from `continue-on-error: true` → required.

## Hard Cleanup Gate (Definition of Done)

1. **No shadow lifecycle** (S3 N/A — documented in `shadow_skip_reason`). The matcher is a test-only artifact and never enters a request handler or cron.
2. **No production code path imports the matcher** — `grep -rE "from ['\"](.*)numeric-grounding['\"]" src/ --include='*.ts' --include='*.tsx' | grep -v '/eval/'` returns ZERO matches. The grounding module lives under `src/lib/eval/` and is referenced only by `scripts/` and `tests/`.
3. **No feature flag introduced.** The CI workflow's "required" status is the gate; there is no off-switch in production code.
4. `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-commit.
5. `npm run check-numeric-grounding` exits 0 on `main` with all 8 fixtures.
6. **Synthetic-injection proof-of-realness** — `tests/integration/numeric-grounding.synthetic-injection.test.ts` MUST pass. It works by deep-cloning a frozen report, splicing `'$999,999'` into `executive_summary`, and asserting `numericGroundingCheck()` returns at least one failure containing that exact span. If this test passes vacuously (i.e., even without the injection), the matcher is broken — treat as a hard build failure.
7. **Registry coverage gate (cross-plan with 20-Z-04)** — every entry in `tests/golden-tickers/_meta/recording-manifest.json` has its `prompt_versions[*]` resolved via `getPrompt(id, version)` from the 20-Z-04 registry at CI time. A bumped prompt version in 20-Z-04 that doesn't yet have a re-recorded fixture surfaces a precise message: `"Fixture <ticker> was recorded with prompt <id>@v1; current registry latest is v2. Re-record via npm run record-frozen-report -- --ticker <ticker> --pin-prompts latest"`.
8. **Per-fixture content-hash gate** — `scripts/check-numeric-grounding.ts` computes SHA-256 of each `_sources/*.source.json` and compares to manifest. A SourcePackage edit without a matching report re-record fails the build with: `"Fixture source hash mismatch — _sources/<ticker>.source.json was edited but _reports/<ticker>.report.json was not re-recorded."`
9. **CI gate live**: `.github/workflows/numeric-grounding.yml` exists and triggers `paths: ['src/lib/gemini-analysis.ts', 'src/lib/research-brief.ts', 'src/lib/prompts/**', 'src/components/ResearchReport.tsx', 'src/lib/eval/**', 'tests/golden-tickers/**', 'scripts/check-numeric-grounding.ts']`. The job is marked required-for-merge in branch protection (separately by operator; this plan ships the workflow).

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — Tolerance schedule values are CITED from the CONTEXT.md §20-D-01 specification (ratios 0.5%, share counts exact, revenue 0.1%, market cap 0.1%, price targets 1%, percentages 1 pp absolute). The schedule is *the specification*, not a tuned hyperparameter; calibration is not appropriate here because the tolerances express the report's required precision, not a learned threshold. Source: CONTEXT.md line 137. The "derived" tier at 2% comes from the same CONTEXT-level convention applied to arithmetic-derived numbers (a P/E computed from price ÷ EPS rather than read off Finnhub).
- **S5 (pinned model + prompt versions)** — Every frozen report manifest entry pins `prompt_versions: Record<PromptId, PromptVersion>` via 20-Z-04's registry surface. The recording script (Task 6) CANNOT proceed without `--pin-prompts` resolving to a real registry version. This is the regression-test contract that makes 20-Z-04's golden-snapshot story end-to-end.
- **S7 (threat model)** — five plan-level threats `T-20-D-01-{01..05}` below.
- **S8 (numerical acceptance)** — every DONE criterion is a grep-count, JSON-key assertion, vitest exit-code, or scripted exit code. Zero adjectives.
- **S9 (failure-mode coverage)** — this plan IS the numeric-grounding leg of S9. The 8-fixture corpus is the security-type span: {large-cap-equity (AAPL), mid-cap-equity (DKNG), micro-cap-equity (microcap, rotating), meme/echo-chamber-equity (GME), recently-listed-equity (SOFI), ETF (SPY), SPAC (DWAC), ADR (TSM)}. Plan 20-D-04 owns curation + rotation; this plan owns the matcher contract that consumes the corpus.
- **S6 (telemetry)** — N/A. The matcher runs offline in CI, never against the live request path. No latency / cost / error rates to surface.

## Forward + sibling references

- **20-Z-04 (prompt registry)** — REQUIRED dependency. The recording script consumes `getPrompt(id, version)` to pin every Gemini prompt that produces the frozen output. A 20-Z-04 prompt-version bump triggers a re-record cycle for affected fixtures (procedure documented in RUNBOOK.md).
- **20-D-02 (citation-coverage)** — sibling, parallel ship. Reuses the same `tests/golden-tickers/_sources/` + `_reports/` corpus. Its scope is "% of qualitative claims with ≥1 citation" — disjoint from this plan's "every numeric span traces to a SourcePackage value."
- **20-D-03 (per-claim CoVe)** — sibling, parallel ship. Reuses the same corpus. Its scope is the per-claim `verified` flag from the NLI verifier — disjoint here.
- **20-D-04 (golden-tickers curation)** — sibling, parallel ship. Owns the ticker rotation procedure, security-type coverage definition, dimension expansion (sector / geography / age slices in future), and the labelled-judge dataset for 20-Z-05. THIS plan owns the matcher + the initial 8-ticker seed + RUNBOOK. The two RUNBOOKs are merged on the 20-D-04 ship (it supersedes the rotation section here; the matcher section stays).
- **20-Z-05 (eval harness)** — downstream consumer. Its `scripts/eval-report.ts` will run `numericGroundingCheck` as one of its five scoring dimensions when comparing baseline vs candidate prompts.
- **20-Z-06 (composite phase done gate)** — `npm run phase-20-status` treats `npm run check-numeric-grounding` exit code as one of its four gate branches.

</universal_preamble>

<objective>
Build a regression test that asserts every numeric span rendered in the AnalysisResult (executive_summary + investment_thesis + key_risks + valuation_context + future_projection + business_description + financial_analysis + competitive_landscape) traces to a value present in the SourcePackage within a per-tier ε tolerance. The test runs over a frozen corpus of 8 golden tickers spanning {large-cap equity, mid-cap equity, micro-cap equity, meme equity, recently-listed equity, ETF, SPAC, ADR}, each with a SourcePackage fixture and a Gemini-recorded AnalysisResult (temperature=0, prompt versions pinned via 20-Z-04). Failure surfaces the offending span, the closest SourcePackage value, the field path, and the tier — so an operator can localize the drift in seconds.

This plan is the numeric-grounding leg of CONTEXT.md §S9 (failure-mode coverage) and §S8 (numerical acceptance). It is build-blocking via `.github/workflows/numeric-grounding.yml`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-04-PLAN.md
@CLAUDE.md
@src/lib/types.ts
@src/lib/gemini-analysis.ts
@src/lib/research-brief.ts
@src/components/ResearchReport.tsx
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md

<interfaces>
<!-- Key types this plan depends on. Sourced directly from src/lib/types.ts so the
     executor doesn't have to explore the codebase. -->

```typescript
// From src/lib/types.ts — fields the matcher MUST walk in findClosestSourceValue:

export interface MarketDataSection {
  price: number | null;
  volume: number | null;
  market_cap: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  // ... plus FieldOrigin metadata
}

export interface FundamentalsSection {
  pe_ratio: number | null;
  eps: number | null;
  revenue: number | null;
  // ... plus FieldOrigin metadata
}

export interface AnalystSentimentSection {
  // contains: avg_price_target: number | null; price_target_low / _high if present;
  // analyst recommendations counts
  avg_price_target: number | null;
}

export interface SocialSentimentSection {
  // (rolls up to SentimentIntelligenceSection at top level)
  stocktwits_bull_pct: number | null;
  stocktwits_bear_pct: number | null;
  stocktwits_message_count: number | null;
  put_call_ratio: number | null;
}

export interface SourcePackage {
  symbol: string;
  market_data: MarketDataSection;
  fundamentals: FundamentalsSection;
  analyst_sentiment: AnalystSentimentSection;
  // social_sentiment / sentiment_intelligence / news / sec_filings / community / supplementary
  supplementary_market_data: SupplementaryMarketData; // contains supplementary_sources[*]
}

// AnalysisResult sections the matcher MUST scan (from gemini-analysis.ts AnalysisResultSchema):
//   executive_summary: string
//   investment_thesis: string
//   key_risks: string
//   valuation_context: string
//   future_projection: string (optional, default '')
//   business_description: string (optional, default '')
//   financial_analysis: string (optional, default '')
//   competitive_landscape: string (optional, default '')
```

```typescript
// New types this plan introduces — src/lib/eval/numeric-grounding.types.ts

export type ToleranceTier =
  | 'ratio'         // P/E, P/B, profit margin, ROE — 0.5%
  | 'share_count'   // shares outstanding, float — exact (0)
  | 'revenue'       // revenue, gross profit — 0.1%
  | 'market_cap'    // market cap — 0.1%
  | 'price_target'  // analyst price target — 1% (analyst rounding)
  | 'percentage'    // bull%/bear%, growth rate, etc. — 1 percentage point ABSOLUTE
  | 'derived';      // arithmetic-derived value (e.g., price × shares) — 2%

export interface ToleranceSchedule {
  ratio: number;          // 0.005
  share_count: number;    // 0 (exact match required)
  revenue: number;        // 0.001
  market_cap: number;     // 0.001
  price_target: number;   // 0.01
  percentage: number;     // 0.01 (interpreted as absolute pp, not relative)
  derived: number;        // 0.02
}

export const TOLERANCE_SCHEDULE: ToleranceSchedule;

export interface NumericSpan {
  text: string;            // raw matched text, e.g., "$125.50" or "5.2%"
  value: number;           // parsed numeric value (suffix-resolved: "1.2B" → 1_200_000_000)
  position: number;        // index in source string
  context: string;         // ±20 chars surrounding the match
  tier: ToleranceTier;     // inferred from the surface form + context (see Task 1)
  section: 'executive_summary' | 'investment_thesis' | 'key_risks' | 'valuation_context' | 'future_projection' | 'business_description' | 'financial_analysis' | 'competitive_landscape';
}

export interface SourceMatch {
  source_value: number;    // the matched leaf value
  source_path: string;     // e.g., 'fundamentals.pe_ratio'
  field_origin: string | null;  // FieldOrigin from FieldSources metadata, or null if not applicable
  delta: number;           // |span.value - source_value| (absolute for percentages, relative otherwise)
  tier_used: ToleranceTier;
}

export interface GroundingFailure {
  span: NumericSpan;
  closest: SourceMatch | null;
  reason: 'no_match_within_tolerance' | 'no_numeric_leaf_in_source';
}

export interface GroundingResult {
  grounded_count: number;
  ungrounded_spans: GroundingFailure[];
  total_spans: number;
  coverage_pct: number;    // grounded_count / total_spans
}
```
</interfaces>

<rendered_report_audit>
<!-- Where the numbers in the rendered report come from (sourced from src/components/ResearchReport.tsx + research-brief.ts). -->

Numbers in the rendered report originate from TWO places:
1. **AnalysisResult string fields** (executive_summary, investment_thesis, etc.) — Gemini wrote these. Every number here is a CLAIM that must match a SourcePackage value.
2. **AnalysisResult numeric fields** (assessment.buy_pct, sentiment_intelligence_summary.stocktwits_bull_pct, etc.) — these are either echoed-back values (which research-brief.ts injected into the prompt verbatim from SourcePackage, validated post-process) or Gemini-emitted percentages that sum to 100. THIS PLAN scopes ONLY the string-field numeric spans; the echoed numerics are validated by separate guards in gemini-analysis.ts (post-process overwrite block, lines 1273-1296).

Within the string fields, expected numeric forms (sourced from SYSTEM_PROMPT lines 164-176 + research-brief.ts formatters):
- Dollar amounts: `$125.50`, `$1.23B`, `$850M`, `$45K`
- Plain numbers: `125,000`, `1.5`
- Suffixed magnitudes: `1.2B`, `850M`, `45K`
- Percentages: `5.2%`, `0.5%`
- Multipliers / P-ratios: `23x`, `1.5×`, `23x P/E`
- Parenthesized negatives: `(3.4%)`
- Comparative phrases: `up 12.5%`, `down $0.50`

The matcher MUST tier-infer from the surface form:
- `Nx` or `N× P/E` / `P/B` / context-mention-of-ratio → `'ratio'`
- `$NM` / `$NB` near 'cap' / 'capitalization' → `'market_cap'`
- `$NM` / `$NB` near 'revenue' / 'sales' / 'top-line' → `'revenue'`
- `$N.NN` near 'price target' / 'consensus' / 'PT' → `'price_target'`
- `N%` → `'percentage'`
- 'N shares' / 'N float' → `'share_count'`
- Default → `'derived'` (2% tolerance, the loosest)

The tier-inference rules are codified as a `inferTier(span, context)` function in src/lib/eval/numeric-grounding.ts with ≥10 canonical test cases in the unit suite.
</rendered_report_audit>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Operator → fixtures | Operator commits Gemini-recorded JSON; if a fixture is hand-edited, the recording-manifest hash gate catches it. |
| Gemini → frozen report | Recording script runs at temperature=0 with pinned prompts so the output is deterministic; the recording is committed and immutable thereafter. |
| CI → branch protection | The workflow status is operator-flipped to required-for-merge separately; until then, the gate is advisory. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-D-01-01 | Information Disclosure / Coverage gap | extractNumericSpans regex | mitigate | Comprehensive regex test suite with ≥20 canonical examples covering `$N`, `N%`, `Nx`, `N.N×`, `NB/NM/NK`, parenthesized negatives, currency-prefixed, ratio context, locale variants like Unicode percent `5％`. Documented limitations: words-as-numbers ("one billion"), scientific notation `5.2e-3`, locale-formatted EU `1.234,56`. The matcher tags these as known-unsupported in MODEL-CARD-numeric-grounding.md so reviewers know to add canonical test cases when they encounter them in production reports. |
| T-20-D-01-02 | Tampering / False-fail | Arithmetic-derived numbers absent from SourcePackage | mitigate | Three-layer defense: (a) tier `'derived'` carries 2% tolerance to absorb arithmetic noise; (b) `findClosestSourceValue` also probes synthetic products (e.g., price × shares = market_cap) before failing; (c) the RUNBOOK documents an explicit escape hatch — if a legitimate Gemini-derived value falls outside 2%, expand the SourcePackage to carry it as a real leaf rather than weakening the matcher. |
| T-20-D-01-03 | Repudiation / Staleness | Frozen reports go stale when 20-Z-04 bumps a prompt version | mitigate | `recording-manifest.json` pins every `(PromptId, PromptVersion)` used to record each fixture. `check-numeric-grounding.ts` cross-validates against the live 20-Z-04 registry; a mismatched version fails the build with the exact re-record command. RUNBOOK §3 documents the re-record procedure. |
| T-20-D-01-04 | Coverage gap / S9 underfit | 8-ticker corpus too small to surface all failure modes | mitigate | Corpus is expandable. 20-D-04 owns the rotation procedure (monthly micro-cap rotation, sector additions on operator request). Every new ticker added through 20-D-04's runbook automatically picks up this plan's matcher — no code change required. |
| T-20-D-01-05 | False-fail / Calibration | Tolerance too tight on price targets — analyst figures often rounded | accept (rationale documented) | Price-target tier is 1% (the loosest reasonable bound for analyst rounding). If a single ticker fails on price-target only, the RUNBOOK says: bump the tolerance only with a CONTEXT.md amendment + this plan re-revision, not a per-ticker exception. Per-ticker waivers would defeat the build gate. |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="20-D-01-01">
  <name>Task 1: Write failing tests for extractNumericSpans + inferTier</name>
  <files>tests/unit/numeric-grounding.unit.test.ts</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 137 — spec)
    - src/lib/gemini-analysis.ts (SYSTEM_PROMPT lines 160-215 — output format)
    - src/lib/research-brief.ts (formatters lines 16-77 — number forms)
    - src/components/ResearchReport.tsx (lines 40-110 — render-side number forms)
  </read_first>
  <behavior>
    A. extractNumericSpans canonical cases (≥20):
    1. "$125.50" → 1 span, value 125.50, tier inference deferred to inferTier
    2. "$1.23B" → 1 span, value 1_230_000_000
    3. "$850M" → 1 span, value 850_000_000
    4. "$45K" → 1 span, value 45_000
    5. "5.2%" → 1 span, value 5.2
    6. "0.5%" → 1 span, value 0.5
    7. "23x" → 1 span, value 23
    8. "1.5×" → 1 span, value 1.5 (Unicode multiplication sign)
    9. "(3.4%)" → 1 span, value -3.4 (parenthesized negative)
    10. "up 12.5%" → 1 span, value 12.5
    11. "down $0.50" → 1 span, value -0.50 (preceding "down")
    12. "125,000" → 1 span, value 125_000 (comma thousands)
    13. "5％" → 1 span, value 5 (Unicode percent — full-width)
    14. "23x P/E" → 1 span, value 23 with context-string carrying "P/E"
    15. "P/E of 23x" → 1 span, same as 14
    16. "$182.50 price target" → 1 span, value 182.50 with "price target" in context
    17. "consensus PT of $200" → 1 span, value 200, context carries "PT" / "consensus"
    18. "market cap of $2.4T" → 1 span, value 2_400_000_000_000 (trillion suffix)
    19. "Q3 revenue of $89.5B" → 1 span, value 89_500_000_000, context carries "revenue"
    20. "operating margin compressed from 28% to 24%" → 2 spans, values 28 and 24
    21. (unsupported / negative case) "5.2e-3" → 0 spans (documented limitation; matcher MUST NOT crash)
    22. (unsupported / negative case) "one billion" → 0 spans (words-as-numbers; documented)
    23. (locale negative) EU "1.234,56" → matcher MUST gracefully degrade — either 0 spans or 1 with documented behavior; test asserts no crash + documented outcome

    B. inferTier canonical cases (≥10):
    1. value 23, context "P/E ratio of 23x" → tier 'ratio'
    2. value 23, context "trades at 23x earnings" → tier 'ratio'
    3. value 2_400_000_000_000, context "market cap of $2.4T" → tier 'market_cap'
    4. value 89_500_000_000, context "Q3 revenue of $89.5B" → tier 'revenue'
    5. value 182.50, context "price target of $182.50" → tier 'price_target'
    6. value 5.2, context "stock is up 5.2%" → tier 'percentage'
    7. value 16_000_000_000, context "16B shares outstanding" → tier 'share_count'
    8. value 0.5, context "GAAP operating margin of 0.5%" → tier 'percentage' (NOT 'ratio' — % wins)
    9. value 145, context "ROE of 145%" → tier 'percentage' (NOT 'ratio')
    10. value 100, context "$100 in cash" → tier 'derived' (no specific tier signal — default)

    C. tolerance-schedule assertions:
    - TOLERANCE_SCHEDULE.ratio === 0.005
    - TOLERANCE_SCHEDULE.share_count === 0
    - TOLERANCE_SCHEDULE.revenue === 0.001
    - TOLERANCE_SCHEDULE.market_cap === 0.001
    - TOLERANCE_SCHEDULE.price_target === 0.01
    - TOLERANCE_SCHEDULE.percentage === 0.01
    - TOLERANCE_SCHEDULE.derived === 0.02
  </behavior>
  <action>
    Create `tests/unit/numeric-grounding.unit.test.ts` with three describe blocks: 'extractNumericSpans — canonical forms', 'inferTier — context-driven tier inference', and 'TOLERANCE_SCHEDULE — exact tier values'. All tests MUST fail at this point (matcher doesn't exist yet). Use vitest. Import types from `src/lib/eval/numeric-grounding.types.ts` (which will be created in Task 2). Use a stub import pattern that fails compilation until Task 2 ships — proves the test set is real.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/numeric-grounding.unit.test.ts</automated>
  </verify>
  <done>≥30 unit tests defined (20 extractNumericSpans + 10 inferTier + 7 TOLERANCE_SCHEDULE), all currently failing (RED state confirmed in commit message).</done>
</task>

<task type="auto" tdd="true" id="20-D-01-02">
  <name>Task 2: Implement extractNumericSpans + inferTier + types (GREEN)</name>
  <files>src/lib/eval/numeric-grounding.types.ts, src/lib/eval/numeric-grounding.ts</files>
  <read_first>
    - tests/unit/numeric-grounding.unit.test.ts (the spec from Task 1)
    - src/lib/research-brief.ts lines 16-77 (existing formatters — mirror the conventions)
  </read_first>
  <behavior>
    Implement the smallest code that makes Task 1's tests pass. The regex is the load-bearing piece; build it incrementally and run the test file after each addition to keep RED → GREEN local.

    Regex baseline (refine as needed to clear all 20+3 cases):
    ```ts
    const NUMERIC_REGEX = /(\(?-?)\$?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*([TBMK%×x]|％)?(\)?)/gi;
    ```

    `parseValue(match)`:
    - resolve suffix (T=1e12, B=1e9, M=1e6, K=1e3)
    - apply leading `-` or paren-wrap as negative
    - resolve "down N" / "compressed from X to Y" via context window (preceding 30 chars)

    `inferTier(span, context)`:
    - precedence: percentage (`%` or `％` suffix wins everything) > price_target (PT / "price target" / "consensus") > market_cap ("cap" within ±30 chars) > revenue ("revenue" / "sales" / "top-line") > share_count ("shares outstanding" / "float") > ratio (`x` / `×` suffix OR "P/E" / "P/B" within ±30) > derived (default).

    Export TOLERANCE_SCHEDULE as a `const` literal — NOT a runtime mutable. Validate in unit test that it satisfies `Readonly<ToleranceSchedule>`.

    No `any`, no `// @ts-ignore`. The module is pure: no Prisma, no env vars, no fs, no fetch.
  </behavior>
  <action>
    Create `src/lib/eval/numeric-grounding.types.ts` first (the types block from the interfaces section above). Then `src/lib/eval/numeric-grounding.ts` exporting `extractNumericSpans`, `inferTier`, and re-exporting types. Run `npx vitest run tests/unit/numeric-grounding.unit.test.ts` after each function. ALL 30+ tests MUST pass at the end.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/numeric-grounding.unit.test.ts</automated>
  </verify>
  <done>All Task 1 tests green. `npx tsc --noEmit` green. Module is grep-confirmed pure (no Prisma / fs / fetch imports).</done>
</task>

<task type="auto" tdd="true" id="20-D-01-03">
  <name>Task 3: Implement findClosestSourceValue + numericGroundingCheck</name>
  <files>src/lib/eval/numeric-grounding.ts, tests/unit/numeric-grounding.unit.test.ts</files>
  <read_first>
    - src/lib/types.ts (SourcePackage structure — every numeric leaf must be enumerable)
    - src/lib/eval/numeric-grounding.ts (from Task 2)
  </read_first>
  <behavior>
    A. `walkNumericLeaves(pkg: SourcePackage): Array<{path: string; value: number; field_origin: string | null}>`
       - market_data.{price, volume, market_cap, fifty_two_week_high, fifty_two_week_low}
       - fundamentals.{pe_ratio, eps, revenue, [any additional fundamentals fields]}
       - analyst_sentiment.{avg_price_target, [analyst counts]}
       - sentiment_intelligence.{stocktwits_bull_pct, stocktwits_bear_pct, stocktwits_message_count, put_call_ratio, [any additional]}
       - supplementary_market_data.supplementary_sources[*].{market_data, fundamentals}
       - additionally: synthetic products — price × shares_outstanding (if both present) → 'derived:price*shares'; revenue / shares → 'derived:revenue_per_share'
       Skip null leaves. Attach FieldOrigin from `_field_sources` when available.

    B. `findClosestSourceValue(span: NumericSpan, pkg: SourcePackage, tolerance: number): SourceMatch | null`
       - For percentage tier: match if `|span.value - source_value| <= tolerance × 100` (absolute pp comparison — `tolerance` here is 0.01 → 1 pp)
       - For share_count tier: match if `span.value === source_value` (exact)
       - For all other tiers: match if `|span.value - source_value| / |source_value| <= tolerance` (relative)
       - Return the closest match within tolerance; if multiple, prefer the one whose field path semantically aligns with the span's context (heuristic: "P/E" in context + 'fundamentals.pe_ratio' path beats 'market_data.fifty_two_week_high').

    C. `numericGroundingCheck(report: AnalysisResult, pkg: SourcePackage, schedule = TOLERANCE_SCHEDULE): GroundingResult`
       - Concatenates the 8 string sections (executive_summary, investment_thesis, key_risks, valuation_context, future_projection, business_description, financial_analysis, competitive_landscape)
       - For each section: extractNumericSpans → inferTier → findClosestSourceValue with `schedule[span.tier]`
       - Aggregate into GroundingResult: grounded_count, ungrounded_spans, total_spans, coverage_pct

    D. New unit tests in numeric-grounding.unit.test.ts:
       1. findClosestSourceValue on a synthetic SourcePackage (hardcoded {pe_ratio: 23.5}, span value 23.4, tier 'ratio', tolerance 0.005) → matches at field path 'fundamentals.pe_ratio'
       2. ...span value 24.0, tier 'ratio' (delta 0.5/23.5 = 0.021 > 0.005) → NO MATCH
       3. share_count tier — span value 15_999_999, source 16_000_000 → NO MATCH (exact required)
       4. share_count tier — span value 16_000_000, source 16_000_000 → MATCH
       5. percentage tier — span value 65, source 65.5, tolerance 0.01 (= 1 pp) → MATCH (|65 - 65.5| = 0.5 ≤ 1)
       6. percentage tier — span value 65, source 67, tolerance 0.01 → NO MATCH (|65 - 67| = 2 > 1)
       7. derived tier — span value 2_440_000_000_000, source = price × shares = 2_400_000_000_000 (1.67% delta) → MATCH (≤ 2%)
       8. numericGroundingCheck on synthetic {executive_summary: "Apple trades at 23x P/E", investment_thesis: ""} + pkg with pe_ratio: 23 → ungrounded_spans.length === 0
       9. ...same with pkg.pe_ratio = 30 → ungrounded_spans.length === 1, failure object contains span_text="23x" + closest_source_value=30 + tier='ratio'
       10. numericGroundingCheck context-preference: when both `fundamentals.pe_ratio: 23` and `market_data.fifty_two_week_high: 23` exist, span "23x P/E" picks pe_ratio path (heuristic test)
  </behavior>
  <action>
    Extend `src/lib/eval/numeric-grounding.ts` with the three new functions. Add the 10 new unit tests to `tests/unit/numeric-grounding.unit.test.ts`. Run vitest after each function — RED → GREEN locally per function. Final state: ≥40 unit tests, all green.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/numeric-grounding.unit.test.ts</automated>
  </verify>
  <done>40+ unit tests green, `npx tsc --noEmit` green, module remains pure (verified by grep).</done>
</task>

<task type="auto" tdd="false" id="20-D-01-04">
  <name>Task 4: Curate 8 golden-ticker SourcePackage fixtures</name>
  <files>tests/golden-tickers/_sources/aapl.source.json, tests/golden-tickers/_sources/dkng.source.json, tests/golden-tickers/_sources/gme.source.json, tests/golden-tickers/_sources/sofi.source.json, tests/golden-tickers/_sources/spy.source.json, tests/golden-tickers/_sources/dwac.source.json, tests/golden-tickers/_sources/tsm.source.json, tests/golden-tickers/_sources/microcap.source.json</files>
  <read_first>
    - src/lib/types.ts (SourcePackage interface — every required field)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md line 140 (security-type coverage list)
    - tests/fixtures/mock-aapl-report.json (existing AAPL mock — borrow shape, NOT values)
  </read_first>
  <behavior>
    Each fixture is a real, recent SourcePackage captured from the production pipeline. NOT hand-crafted. Procedure:
    1. For each ticker {AAPL, DKNG, GME, SOFI, SPY, DWAC, TSM}, run the production data-collection pipeline locally (`npm run debug:pipeline -- --ticker <SYM>`) at a known wall-clock time and write `/tmp/source-package-<ticker>.json`.
    2. Copy each into `tests/golden-tickers/_sources/<sym>.source.json` (lowercase filename).
    3. The micro-cap fixture: pick a low-coverage micro-cap currently in the rotating watchlist (engine-context table) — operator decision; document the rotation policy as "monthly, picked by 20-D-04 runbook" in tests/golden-tickers/RUNBOOK.md.
    4. Strip any obviously personal / per-user data (timestamps that leak operator identity, watchlist ordering revealing portfolio).
    5. Validate each fixture by importing into a smoke script and rendering through `formatResearchBrief()` — every required field present, no throw.

    Each fixture MUST contain at minimum:
    - market_data.{price, volume, market_cap, fifty_two_week_high, fifty_two_week_low} non-null
    - fundamentals.{pe_ratio, eps, revenue} non-null where the source has them (SPY may have null pe_ratio — that's fine; the matcher handles nulls)
    - At least one analyst_sentiment row with avg_price_target where applicable (SPY: null OK)
    - At least one news item per ticker
    - The security_type field set to the bucket from CONTEXT.md (equity / etf / spac / adr)
  </behavior>
  <action>
    Run `npm run debug:pipeline -- --ticker <SYM>` for each ticker. Copy `/tmp/source-package-<ticker>.json` to `tests/golden-tickers/_sources/<sym>.source.json`. For micro-cap, the operator picks one from the current rotation and commits it as `microcap.source.json` with a comment header indicating which symbol is rotating in.

    Write a one-off validator script `scripts/validate-golden-source.ts` (≤30 LOC) that reads every `_sources/*.source.json` and runs `formatResearchBrief` on each — fails on any malformed fixture. NOT committed to npm scripts (one-off check). Operator runs `npx tsx scripts/validate-golden-source.ts` before commit.
  </action>
  <verify>
    <automated>ls tests/golden-tickers/_sources/ | wc -l | grep -q '8' && npx tsx scripts/validate-golden-source.ts</automated>
  </verify>
  <done>8 fixture files committed; validator script reports zero malformed fixtures.</done>
</task>

<task type="auto" tdd="false" id="20-D-01-05">
  <name>Task 5: Build scripts/record-frozen-report.ts (operator-only fixture recorder)</name>
  <files>scripts/record-frozen-report.ts, tests/golden-tickers/_meta/recording-manifest.json, package.json</files>
  <read_first>
    - src/lib/gemini-analysis.ts runGeminiAnalysis (current call shape)
    - 20-Z-04-PLAN.md (getPrompt + renderPrompt surface)
    - CONTEXT.md §S5 (pinned model + prompt versions)
  </read_first>
  <behavior>
    Recorder CLI:
    ```
    npm run record-frozen-report -- --ticker AAPL --pin-prompts latest [--out tests/golden-tickers/_reports/aapl.report.json]
    npm run record-frozen-report -- --all --pin-prompts latest
    ```

    Behavior:
    1. Reads `tests/golden-tickers/_sources/<ticker>.source.json`.
    2. Resolves `prompt_versions` — `--pin-prompts latest` queries the 20-Z-04 registry for every PromptId's latest version; `--pin-prompts pinned:<id>=<version>,<id>=<version>` for explicit pins.
    3. Calls `runGeminiAnalysis(pkg)` with `temperature: 0` enforced via a recorder-only flag (e.g., `FORCE_TEMPERATURE_ZERO=1`).
       - If `runGeminiAnalysis` doesn't expose temperature directly, the recorder uses a thin wrapper that calls `generateObject` with `temperature: 0` and the exact same prompt assembly path as the live code.
    4. Writes:
       - `tests/golden-tickers/_reports/<ticker>.report.json` — the AnalysisResult, pretty-printed JSON with header object `{__recording: {recorded_at, prompt_versions, gemini_model_revision, temperature: 0, source_hash}}` at the top-level (or split-file: header in manifest, body bare).
       - Updates `tests/golden-tickers/_meta/recording-manifest.json` with the entry for this ticker.
    5. Exits non-zero if:
       - Source fixture missing
       - Registry version unknown
       - Gemini call fails or returns non-AnalysisResult shape
       - Existing report present and `--overwrite` not passed

    Manifest schema (one entry per ticker):
    ```json
    {
      "aapl": {
        "source_hash": "sha256-<hex>",
        "report_hash": "sha256-<hex>",
        "prompt_versions": { "gemini-research-brief-system": "v1", "gemini-research-brief-user": "v1", "gemini-engine-context-block": "v1", "gemini-citations-section": "v1" },
        "gemini_model_revision": "gemini-2.5-pro-preview-...",
        "temperature": 0,
        "recorded_at": "2026-05-11T...",
        "recorded_by": "operator-cli",
        "security_type": "equity"
      },
      ...
    }
    ```

    Recorder is OPERATOR-ONLY — never invoked in CI. The CI workflow consumes the committed `_reports/` + manifest.
  </behavior>
  <action>
    Implement the recorder. Add `record-frozen-report` to package.json scripts: `"record-frozen-report": "npx tsx scripts/record-frozen-report.ts"`. Include `--dry-run` flag that prints the call plan without making the Gemini call (for safe testing).
  </action>
  <verify>
    <automated>npx tsx scripts/record-frozen-report.ts --ticker AAPL --dry-run | grep -q 'prompt_versions'</automated>
  </verify>
  <done>Recorder script committed; `--dry-run` works without an API key; package.json has the new script; manifest file initialized (empty `{}` if no recordings yet).</done>
</task>

<task type="checkpoint:human-action" id="20-D-01-06" gate="blocking">
  <name>Task 6: Operator records the 8 frozen Gemini reports</name>
  <files>tests/golden-tickers/_reports/aapl.report.json, tests/golden-tickers/_reports/dkng.report.json, tests/golden-tickers/_reports/gme.report.json, tests/golden-tickers/_reports/sofi.report.json, tests/golden-tickers/_reports/spy.report.json, tests/golden-tickers/_reports/dwac.report.json, tests/golden-tickers/_reports/tsm.report.json, tests/golden-tickers/_reports/microcap.report.json, tests/golden-tickers/_meta/recording-manifest.json</files>
  <action>Operator runs `npm run record-frozen-report -- --all --pin-prompts latest`. This is the ONLY step that consumes real Gemini API calls (8 × $0.05ish = ~$0.40 total). The plan cannot complete without these fixtures. The recording step is human-gated because (a) GEMINI_API_KEY / AI_GATEWAY_API_KEY live only in the operator's .env.local — Claude cannot inject them, and (b) the operator must accept the ~$0.40 Gemini spend.</action>
  <instructions>
    1. Ensure `.env.local` has a working `GEMINI_API_KEY` / `AI_GATEWAY_API_KEY`.
    2. Ensure 20-Z-04 (prompt registry) has shipped and `npx tsx -e "import('./src/lib/prompts/registry').then(r => console.log(Object.keys(r)))"` lists the expected PromptIds.
    3. Run: `npm run record-frozen-report -- --all --pin-prompts latest`
    4. Inspect the 8 generated `tests/golden-tickers/_reports/*.report.json` files for sanity — each should have a non-empty executive_summary, investment_thesis, key_risks (these are what the matcher scans).
    5. Inspect `tests/golden-tickers/_meta/recording-manifest.json` — 8 entries, each with prompt_versions pinned.
    6. Commit all 8 reports + the manifest.
    7. Type "recorded" to resume.

    If 20-Z-04 hasn't shipped yet, this task BLOCKS until it does — depends_on is set accordingly.
  </instructions>
  <verify>
    <automated>test $(ls tests/golden-tickers/_reports/*.report.json 2>/dev/null | wc -l) -eq 8 \&\& test $(node -e "const m=require('./tests/golden-tickers/_meta/recording-manifest.json');console.log(Object.keys(m).length)") = "8"</automated>
  </verify>
  <done>8 frozen report JSON files committed under tests/golden-tickers/_reports/; recording-manifest.json has 8 entries; every entry carries prompt_versions, gemini_model_revision, temperature: 0, source_hash, recorded_at.</done>
  <resume-signal>Type "recorded" once the 8 reports + manifest are committed</resume-signal>
</task>

<task type="auto" tdd="true" id="20-D-01-07">
  <name>Task 7: Build tests/integration/numeric-grounding.regression.test.ts + .synthetic-injection.test.ts</name>
  <files>tests/integration/numeric-grounding.regression.test.ts, tests/integration/numeric-grounding.synthetic-injection.test.ts</files>
  <read_first>
    - src/lib/eval/numeric-grounding.ts (the matcher)
    - tests/golden-tickers/_sources/ + _reports/ (the corpus, post-Task 6)
    - tests/golden-tickers/_meta/recording-manifest.json
  </read_first>
  <behavior>
    A. regression.test.ts:
    - `describe('numeric grounding — 8-ticker golden corpus')`:
      - `it.each(tickers)('every numeric span in %s traces to SourcePackage', (ticker) => { ... })`
      - For each ticker: load source + report, run `numericGroundingCheck`, assert `result.ungrounded_spans.length === 0`. On failure, the test message prints the failure array verbatim — span text, closest source value, source path, tier.
    - Also: `it('every report manifest pinned prompt_versions resolves via 20-Z-04 registry', () => { ... })`
      - Loads manifest, imports `getPrompt` from `src/lib/prompts/registry`, asserts every `(id, version)` resolves without throwing.

    B. synthetic-injection.test.ts:
    - For each of 3 representative tickers (AAPL, GME, SPY):
      - Clone the frozen report
      - Splice `'$999,999'` into `executive_summary` (a string that CANNOT match any plausible SourcePackage value at any tier)
      - Assert `numericGroundingCheck` returns `ungrounded_spans` containing a failure whose `span.text` matches `'$999,999'` (case-insensitive)
      - Asserts the FAILURE message would propagate to the operator (test passes only when matcher rejects the injection)

    C. Hash-gate test (in regression.test.ts):
    - For each ticker: compute SHA-256 of the `_sources/*.source.json` file, compare to manifest entry `source_hash`. Mismatch → fail with the precise re-record command.
  </behavior>
  <action>
    Implement both files. The synthetic-injection test is the proof-of-realness gate — it MUST be present and MUST pass. Without it, the regression test could vacuously pass on a broken matcher.
  </action>
  <verify>
    <automated>npx vitest run tests/integration/numeric-grounding.regression.test.ts tests/integration/numeric-grounding.synthetic-injection.test.ts</automated>
  </verify>
  <done>Both files green. The regression test catches a manually-introduced bad number when run locally (verified by spliced-edit smoke check).</done>
</task>

<task type="auto" tdd="false" id="20-D-01-08">
  <name>Task 8: Build scripts/check-numeric-grounding.ts + npm script</name>
  <files>scripts/check-numeric-grounding.ts, package.json</files>
  <read_first>
    - src/lib/eval/numeric-grounding.ts
    - tests/golden-tickers/ structure
    - tests/golden-tickers/_meta/recording-manifest.json
  </read_first>
  <behavior>
    CLI runner that:
    1. Walks `tests/golden-tickers/_sources/` × `_reports/` pairs.
    2. For each: runs `numericGroundingCheck` and prints a per-ticker summary line.
    3. Cross-validates `recording-manifest.json`:
       - Every pinned `(promptId, version)` resolves via 20-Z-04 registry; if not, prints the precise re-record command.
       - Every `_sources/<ticker>.source.json` SHA-256 matches the manifest `source_hash`; mismatch prints `"Re-record required: tests/golden-tickers/_sources/<ticker>.source.json was edited but the report was not regenerated. Run: npm run record-frozen-report -- --ticker <ticker> --overwrite --pin-prompts latest"`.
    4. Exit code:
       - 0 if all 8 pairs pass + manifest validates
       - 1 if any pair has ungrounded spans
       - 2 if manifest is stale (source hash mismatch or prompt-version-unknown)
    5. Output is structured (JSON tail) so CI can parse failures.

    Add to package.json:
    ```json
    "check-numeric-grounding": "npx tsx scripts/check-numeric-grounding.ts"
    ```
  </behavior>
  <action>
    Implement the script. Verify it exits 0 on the committed fixtures, exits 1 when you manually inject a bad number into one of the frozen reports, exits 2 when you edit a source file by one byte.
  </action>
  <verify>
    <automated>npm run check-numeric-grounding && echo OK</automated>
  </verify>
  <done>Script committed; exits 0 on `main`; package.json has the new script.</done>
</task>

<task type="auto" tdd="false" id="20-D-01-09">
  <name>Task 9: Wire .github/workflows/numeric-grounding.yml CI gate</name>
  <files>.github/workflows/numeric-grounding.yml</files>
  <read_first>
    - .github/workflows/prompts.yml (from 20-Z-04 — pattern reference)
  </read_first>
  <behavior>
    GitHub Actions workflow that:
    - Triggers on `pull_request` with paths matching the report-generation surface: `src/lib/gemini-analysis.ts`, `src/lib/research-brief.ts`, `src/lib/prompts/**`, `src/components/ResearchReport.tsx`, `src/lib/eval/**`, `tests/golden-tickers/**`, `scripts/check-numeric-grounding.ts`, `scripts/record-frozen-report.ts`.
    - Also triggers on `push` to `main`.
    - Runs:
      ```yaml
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx prisma generate
      - run: npm run check-numeric-grounding
      - run: npx vitest run tests/integration/numeric-grounding.regression.test.ts tests/integration/numeric-grounding.synthetic-injection.test.ts
      - run: npx vitest run tests/unit/numeric-grounding.unit.test.ts
      ```
    - No secrets required (matcher doesn't call Gemini).
    - Job name: `numeric-grounding-regression`.
  </behavior>
  <action>
    Author the workflow YAML. Mark the job intent as "required for merge" in a follow-up branch-protection task (operator UI action, NOT shipped by this plan). The plan ships the workflow + the runbook note that the operator must flip the required-status bit.
  </action>
  <verify>
    <automated>node -e "const yaml = require('js-yaml'); const fs = require('fs'); const doc = yaml.load(fs.readFileSync('.github/workflows/numeric-grounding.yml', 'utf8')); if (!doc.jobs || !doc.jobs['numeric-grounding-regression']) process.exit(1)"</automated>
  </verify>
  <done>Workflow file present, YAML-valid, job name matches; documented branch-protection follow-up in RUNBOOK.md.</done>
</task>

<task type="auto" tdd="false" id="20-D-01-10">
  <name>Task 10: Write RUNBOOK.md + MODEL-CARD-numeric-grounding.md</name>
  <files>tests/golden-tickers/RUNBOOK.md, .planning/phases/20-real-sentiment-analysis/MODEL-CARD-numeric-grounding.md</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md (model-card template per S4)
    - This plan's threat model
  </read_first>
  <behavior>
    RUNBOOK.md sections:
    1. **What this corpus is** — 8 frozen (SourcePackage, AnalysisResult) pairs; the contract that every numeric span in the report traces to a SourcePackage value.
    2. **Adding a new ticker** — owned by 20-D-04 after it ships; for now, the procedure: `npm run debug:pipeline -- --ticker <SYM>` → copy to `_sources/` → `npm run record-frozen-report -- --ticker <SYM> --pin-prompts latest` → commit.
    3. **Responding to a 20-Z-04 prompt-version bump** — re-record affected fixtures: `npm run record-frozen-report -- --all --pin-prompts latest --overwrite`. Then `npm run check-numeric-grounding` until green. Commit. Open PR.
    4. **Handling a legitimate matcher false-fail** — three options in priority order: (a) expand the SourcePackage to carry the missing leaf as a real field (preferred — improves data coverage); (b) bump the `derived` tolerance via a CONTEXT.md amendment + plan revision (rare); (c) add a `// EXEMPT: <reason>` comment in the AnalysisResult string fields that the matcher recognizes (LAST resort — discouraged).
    5. **Branch protection** — operator must flip `numeric-grounding-regression` to "Required" in GitHub branch-protection settings after merge.
    6. **Micro-cap rotation** — monthly; owned by 20-D-04 once it ships.

    MODEL-CARD-numeric-grounding.md per Mitchell 2019 template:
    - **Intended use** — CI gate for the report-generation pipeline; offline only.
    - **Training data / corpus** — 8 tickers × {SourcePackage, AnalysisResult}; security-type bucket coverage per CONTEXT.md §S9.
    - **Evaluation metrics** — exact-match coverage at per-tier tolerance; no probabilistic metric (deterministic matcher).
    - **Out-of-distribution behavior** — unsupported regex forms documented: scientific notation, words-as-numbers, EU-locale numbers. Behavior: silently skipped (NOT counted as ungrounded).
    - **Ethical considerations** — none material; matcher operates only on the AI's emitted text vs the SourcePackage we recorded ourselves. No PII.
    - **Known failure modes** — listed under T-20-D-01-01.
    - **Retrain cadence** — N/A (deterministic); fixture re-record cadence: monthly micro-cap rotation + on every 20-Z-04 prompt-version bump.
  </behavior>
  <action>
    Author both documents. RUNBOOK.md ≤200 lines, MODEL-CARD ≤120 lines.
  </action>
  <verify>
    <automated>test -s tests/golden-tickers/RUNBOOK.md && test -s .planning/phases/20-real-sentiment-analysis/MODEL-CARD-numeric-grounding.md && grep -q 'record-frozen-report' tests/golden-tickers/RUNBOOK.md</automated>
  </verify>
  <done>Both files present, non-empty, referenced by the plan + the workflow comments.</done>
</task>

</tasks>

<verification>

## Per-task verification

Each task's `<verify>` block above runs in CI via the new workflow. The composite verification:

```bash
# 1. Matcher pure-unit suite (Tasks 1-3)
npx vitest run tests/unit/numeric-grounding.unit.test.ts
# Expected: ≥40 tests green.

# 2. Fixture validation (Task 4)
ls tests/golden-tickers/_sources/*.source.json | wc -l
# Expected: 8.

# 3. Recorder (Task 5) — dry-run only in CI
npx tsx scripts/record-frozen-report.ts --ticker AAPL --dry-run | grep -q 'prompt_versions'
# Expected: exit 0 + prompt_versions in output.

# 4. Operator recording (Task 6) — verified by committed fixtures
ls tests/golden-tickers/_reports/*.report.json | wc -l
# Expected: 8.
jq 'keys | length' tests/golden-tickers/_meta/recording-manifest.json
# Expected: 8.

# 5. Regression + synthetic-injection (Task 7)
npx vitest run tests/integration/numeric-grounding.regression.test.ts tests/integration/numeric-grounding.synthetic-injection.test.ts
# Expected: all green.

# 6. CLI gate (Task 8)
npm run check-numeric-grounding && echo OK
# Expected: exit 0 + "OK".

# 7. CI workflow valid (Task 9)
node -e "const yaml=require('js-yaml');yaml.load(require('fs').readFileSync('.github/workflows/numeric-grounding.yml','utf8'))"
# Expected: no throw.

# 8. RUNBOOK + model card (Task 10)
test -s tests/golden-tickers/RUNBOOK.md
test -s .planning/phases/20-real-sentiment-analysis/MODEL-CARD-numeric-grounding.md
```

## Proof-of-realness gate (cannot be skipped)

The synthetic-injection test is the contract that the matcher is real. To verify locally:

```bash
# Inject a bad number, expect failure
sed -i.bak 's/executive_summary": "/executive_summary": "$999,999 — /' tests/golden-tickers/_reports/aapl.report.json
npm run check-numeric-grounding
# Expected: exit 1, output contains '$999,999' and 'aapl'
# Restore:
mv tests/golden-tickers/_reports/aapl.report.json.bak tests/golden-tickers/_reports/aapl.report.json
npm run check-numeric-grounding
# Expected: exit 0
```

## Hash-gate verification

```bash
# Edit a source file by one byte, expect failure
echo " " >> tests/golden-tickers/_sources/aapl.source.json
npm run check-numeric-grounding
# Expected: exit 2, output contains 'Re-record required' + 'aapl'
git checkout tests/golden-tickers/_sources/aapl.source.json
npm run check-numeric-grounding
# Expected: exit 0
```

</verification>

<success_criteria>

Plan 20-D-01 is COMPLETE when ALL of the following are TRUE on `main`:

1. `npx vitest run tests/unit/numeric-grounding.unit.test.ts` — exits 0 with ≥40 tests green.
2. `ls tests/golden-tickers/_sources/*.source.json | wc -l` — outputs `8`.
3. `ls tests/golden-tickers/_reports/*.report.json | wc -l` — outputs `8`.
4. `jq 'keys | length' tests/golden-tickers/_meta/recording-manifest.json` — outputs `8`.
5. `npx vitest run tests/integration/numeric-grounding.regression.test.ts` — exits 0.
6. `npx vitest run tests/integration/numeric-grounding.synthetic-injection.test.ts` — exits 0.
7. `npm run check-numeric-grounding` — exits 0 on clean tree.
8. Bad-number injection causes `npm run check-numeric-grounding` to exit 1 (manual verification per the Proof-of-realness gate above).
9. Source-file edit causes `npm run check-numeric-grounding` to exit 2 (manual verification per the Hash-gate verification above).
10. `.github/workflows/numeric-grounding.yml` is YAML-valid and triggers on the right paths.
11. `tests/golden-tickers/RUNBOOK.md` exists with the four operator procedures.
12. `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-numeric-grounding.md` exists per S4.
13. `grep -rE "from ['\"](.*)numeric-grounding['\"]" src/ --include='*.ts' --include='*.tsx' | grep -v '/eval/'` — outputs nothing (matcher is test-only, never imported by production code).
14. Every entry in `recording-manifest.json` has its `prompt_versions[*]` resolved by 20-Z-04's `getPrompt(id, version)` at CI time.

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-D-01-SUMMARY.md` per the standard summary template — record the corpus tickers, the matcher's tolerance schedule, the per-tier failure-counts surfaced during recording, and any tickers that required a SourcePackage expansion for arithmetic-derived numbers to match.
</output>
