---
phase: 20
plan: 20-D-02
wave: D
type: execute
depends_on: [20-Z-05]
files_modified:
  - src/lib/eval/citation-coverage.types.ts
  - src/lib/eval/citation-coverage.ts
  - src/lib/eval/claim-extraction-regex.ts
  - src/lib/eval/claim-extraction-llm.ts
  - src/lib/eval/claim-merge.ts
  - src/lib/eval/cohens-kappa.ts
  - src/lib/prompts/_v1/eval-claim-extraction-v1.md
  - src/lib/prompts/registry.ts
  - src/lib/prompts/_manifest.ts
  - scripts/eval-citation-coverage.ts
  - scripts/eval-claim-extraction-kappa.ts
  - src/app/api/cron/eval-citation-coverage/route.ts
  - src/app/insights/citation-coverage/page.tsx
  - src/app/insights/citation-coverage/CitationCoveragePanel.tsx
  - vercel.json
  - tests/golden-tickers/_claim_labels.json
  - tests/eval/citation-coverage.unit.test.ts
  - tests/eval/claim-extraction-regex.unit.test.ts
  - tests/eval/claim-merge.unit.test.ts
  - tests/eval/cohens-kappa.unit.test.ts
  - tests/integration/citation-coverage.regression.test.ts
  - tests/integration/citation-coverage.synthetic-injection.test.ts
  - .github/workflows/citation-coverage.yml
  - package.json
  - .planning/phases/20-real-sentiment-analysis/MODEL-CARD-citation-coverage.md
autonomous: true
requirements:
  - S7
  - S8
  - S9
shadow_required: false
shadow_skip_reason: "Audit-only metric. citation-coverage.ts is a pure-TS evaluator invoked from (a) scripts/eval-citation-coverage.ts (operator + cron), (b) the /insights/citation-coverage page (reads previously-computed cron output), and (c) the CI workflow gate. No production code path imports the evaluator at request-time; grep on src/ for citationCoverage outside src/lib/eval/, scripts/, src/app/api/cron/, and src/app/insights/ returns zero matches. No report content changes — the evaluator OBSERVES rendered AnalysisResult + citations_v2 + ground-truth claim labels; it does not mutate the report. Per S3 the shadow lifecycle applies to new PRODUCTION code paths, this plan introduces none."
hard_cleanup_gate: true
must_haves:
  truths:
    - "src/lib/eval/citation-coverage.ts exports `extractClaimsRegex(text)`, `extractClaimsLLM(text, opts?)`, `mergeClaimSets(regex, llm)`, and `citationCoverage(claims, citations, opts?)` — all pure orchestration over the registered prompt + cosine helpers; zero Prisma, zero fs at call time, zero env-var-side-effects beyond the LLM-judge call which is gated by `RUN_LLM_CLAIM_EXTRACTION=true`"
    - "Claim extraction Algorithm A (regex): sentence-split on `/(?<=[.!?])\\s+(?=[A-Z])/`, then claim-language regex `/\\b(is|are|was|were|will|may|could|reports|announced|disclosed|expects|expected|guidance|projects|projected|forecast|forecasts|estimates|estimated|reported|raised|lowered|cut|increased|decreased)\\b/i` matches a Claim; exclusion regex `/^\\s*(disclaimer|sources|methodology|navigation|table of contents|see also|figure|chart)\\b/i` drops boilerplate before claim detection"
    - "Claim extraction Algorithm B (LLM-judge): calls a `judge`-style Claude Opus 4.7 invocation (same SDK pattern as 20-Z-05's src/lib/eval/judge.ts) using the prompt id `'eval-claim-extraction-v1'` registered in the 20-Z-04 registry; temperature 0, no cache headers, max_tokens 4000, ONE call per (report_id, prompt_version) tuple — never one call per claim; output is STRICT JSON {claims: [{text, section, start_char, end_char, kind: 'qualitative'|'numeric'}]}; numeric-kind claims are dropped from the merge set (numeric grounding is 20-D-01's territory, NOT this plan)"
    - "mergeClaimSets dedupes A∪B by cosine similarity > 0.85 on a deterministic bag-of-words vector (lowercase, strip non-alpha, drop stopwords from the existing data/stopwords.txt or an inlined 50-word default list); cosine is computed by a small pure helper exported alongside (`cosineBagOfWords(a, b): number`); when two claims dedupe, the one with the LOWER start_char wins (positional stability)"
    - "Each Claim carries {text, section: ReportSection, start_char, end_char, source_method: 'regex' | 'llm' | 'merged', kind: 'qualitative'} where ReportSection is the closed union {'executive_summary','investment_thesis','bullish_signals','bearish_signals','key_risks','valuation_context','future_projection','sentiment_intelligence','community_intelligence','engine_calibration','sources_used'} — section attribution is computed by the caller (the eval script) when it splits the rendered report by section header, then the extraction is run per-section so start_char is section-local"
    - "Citation matching uses citations_v2 from 19-C-07 (the existing Citation[] on AnalysisResult per src/lib/sentiment/citation-schema.ts) — a Claim is `supported` when at least ONE of the following holds: (rule A) a Citation's emit anchor (insertion site in the rendered text) falls within ±50 characters of the Claim's [start_char, end_char] span, OR (rule B) keyword cosine overlap between the Claim's bag-of-words vector and the Citation's title/source-label bag-of-words is ≥ 0.5; rules are tried in order, first hit wins; unsupported_claims is the residual set"
    - "Citation anchor data is computed by a single helper `extractCitationAnchors(rendered: string, citations: Citation[]): Array<{citation, anchor_pos: number}>` — anchors are derived from the rendered HTML+text by locating each citation's url or title substring; when neither substring is found in-text, anchor_pos = -1 (the citation can still match a claim via rule B, never rule A)"
    - "`citationCoverage(claims, citations, opts?)` returns `{ coverage_pct: number, per_section: Record<ReportSection, number>, unsupported: Claim[], totals: { total_claims, supported, unsupported, kappa_method_disagreements } }` where coverage_pct = supported / total_claims × 100 (returns 100 when total_claims === 0 and emits a console.warn so the operator sees the empty-set case)"
    - "scripts/eval-citation-coverage.ts iterates the 8 frozen golden-ticker reports under tests/golden-tickers/_reports/ (shared with 20-D-01 and 20-D-04 — same fixture filenames: aapl.report.json, dkng.report.json, gme.report.json, sofi.report.json, spy.report.json, dwac.report.json, tsm.report.json, microcap.report.json), runs claim extraction (regex always; LLM only when RUN_LLM_CLAIM_EXTRACTION=true) + citationCoverage on each, emits both JSON (reports/citation-coverage-{YYYY-MM-DD}.json) AND markdown (reports/citation-coverage-{YYYY-MM-DD}.md) outputs with per-ticker × per-section breakdown; gracefully skips with exit code 4 ('NO_GOLDEN_FIXTURES') when 20-D-01 / 20-D-04 fixtures have not yet landed"
    - "Build-blocking CI gate: `npm run check-citation-coverage` script wraps scripts/eval-citation-coverage.ts with the --ci flag; exits 0 when EVERY golden ticker has coverage_pct ≥ 80 AND every per_section value is ≥ 60 (per-section is intentionally lower because some sections like sources_used have no claims); exits non-zero with a structured failure report listing each ticker × section that fell below threshold; .github/workflows/citation-coverage.yml runs check-citation-coverage on every PR touching src/components/ResearchReport.tsx, src/lib/gemini-analysis.ts, src/lib/research-brief.ts, src/lib/prompts/**, src/lib/eval/citation-coverage.ts, src/lib/sentiment/citation-schema.ts, or tests/golden-tickers/**"
    - "Synthetic-injection test (tests/integration/citation-coverage.synthetic-injection.test.ts) proves the gate is real: takes the AAPL frozen report, injects 3 fabricated unsupported claim sentences ('The company will triple revenue.', 'Management announced a buyback.', 'Insiders disclosed a stake.') into investment_thesis with NO matching citation in citations_v2, runs citationCoverage, and asserts (a) coverage_pct drops below 80 AND (b) the 3 injected claims appear in `unsupported` AND (c) the script exits non-zero in --ci mode"
    - "100-claim labeled set committed at tests/golden-tickers/_claim_labels.json — each entry shape `{label_id, ticker, section, text, is_claim: boolean, labeler, labeled_at}` — sampled from the 8 golden reports (proportional stratification across sections), covering both true-claim and not-a-claim cases (the latter ensures regex+LLM are tested on rejection too); ≥100 entries enforced by integration test"
    - "scripts/eval-claim-extraction-kappa.ts loads the 100-claim labeled set, runs BOTH regex and LLM extraction over the source sentences, scores each method's binary classification (is_claim true/false) against the human labels, computes Cohen's kappa between regex-method and LLM-method predictions (NOT between method and ground truth — kappa measures inter-method agreement per the CONTEXT.md line 138 spec); a SECOND output reports per-method F1 vs ground truth so the operator sees raw accuracy alongside agreement"
    - "Ship-gate kappa ≥ 0.7: `npm run check-claim-extraction-kappa` is wired into the same .github/workflows/citation-coverage.yml job; exits non-zero when kappa < 0.7; LLM-method results are mocked from a committed snapshot file (tests/golden-tickers/_claim_labels.llm_snapshot.json) by default — live LLM is opt-in via RUN_LLM_CLAIM_EXTRACTION=true so CI does not burn tokens"
    - "Cohen's kappa implemented as a pure helper in src/lib/eval/cohens-kappa.ts: `cohensKappa(predA: boolean[], predB: boolean[]): number` — checks length parity, computes p_observed and p_expected from the 2×2 agreement matrix, returns (p_o − p_e) / (1 − p_e); guards: throws when arrays differ in length, returns 1.0 on perfect agreement when p_e === 1 (degenerate case) with a doc comment explaining the convention"
    - "Claim-extraction prompt body lives in src/lib/prompts/_v1/eval-claim-extraction-v1.md per 20-Z-04 convention: frontmatter (id: eval-claim-extraction-v1, version: v1, created_at, deprecated_at: null, variables: [section_text, ticker], description); body asks Claude Opus 4.7 to extract qualitative claims with exact span offsets and section attribution, return STRICT JSON; the registry's _manifest.ts is extended so getPrompt('eval-claim-extraction-v1', 'v1') resolves AND the golden-snapshot test catches drift without a v2 bump"
    - "/insights/citation-coverage page renders per-ticker × per-section coverage tiles reading from the latest reports/citation-coverage-*.json the cron has written; tile color: green ≥ 80, amber 60-80, red < 60; tooltip on click shows the unsupported claims for that section"
    - "Vercel cron /api/cron/eval-citation-coverage scheduled weekly (Sunday 09:00 UTC) in vercel.json — authenticated via the existing CRON_SECRET pattern (Bearer header check at route entry per the project's cron-jobs skill); the cron body invokes the same scripts/eval-citation-coverage.ts logic via a thin shim that returns the JSON output and writes it to reports/citation-coverage-{date}.json; cron failures emit a console.error and return 500 so Vercel surfaces the failure in the dashboard"
    - "Unit tests ≥8 covering: (1) extractClaimsRegex returns ≥3 claims on a canonical bull-thesis sentence string, (2) extractClaimsRegex returns 0 claims on a pure disclaimer paragraph, (3) extractClaimsRegex handles parenthesized + nested-clause sentences without IndexOutOfRange, (4) mergeClaimSets dedupes claims with cosine > 0.85 keeping the earlier start_char, (5) mergeClaimSets preserves disjoint claims, (6) citationCoverage returns 100 on empty-claims input and warns, (7) citationCoverage rule-A anchor match within ±50 chars, (8) citationCoverage rule-B keyword overlap ≥ 0.5 with no anchor available, (9) citationCoverage rule-A wins over rule-B when both fire, (10) cohensKappa on perfect agreement returns 1.0, (11) cohensKappa on independent random returns ≈ 0 (statistical tolerance ±0.1)"
    - "Integration test (tests/integration/citation-coverage.regression.test.ts) iterates all 8 (source, report) pairs from tests/golden-tickers/_reports/ AND tests/golden-tickers/_sources/, runs citationCoverage (regex-only path — no live LLM in CI), and asserts (a) every ticker has coverage_pct ≥ 80, (b) per_section coverage is ≥ 60 in every populated section, (c) the printed failure report on a deliberate ≥80 violation surfaces the exact ticker × section × unsupported_claims so an operator can localize drift in < 30 seconds"
    - "Per-segment expectations documented in MODEL-CARD-citation-coverage.md per S4 — micro-cap and DWAC (SPAC) ARE expected to hover near 80% due to sparse source data; the model card calls out that the 60-per-section floor is what protects those segments from a false-fail while still catching genuine drift in higher-coverage tickers"
    - "No production code path imports src/lib/eval/citation-coverage.ts (grep verifies; only scripts/, src/app/api/cron/eval-citation-coverage/, src/app/insights/citation-coverage/, and tests/ import it); the module is test/cron-only — same boundary as 20-D-01's numeric-grounding evaluator"
  artifacts:
    - path: "src/lib/eval/citation-coverage.types.ts"
      provides: "Closed ReportSection union + Claim, CitationAnchor, CoverageResult type definitions; constants {COVERAGE_OVERALL_MIN: 80, COVERAGE_SECTION_MIN: 60, COSINE_DEDUPE_THRESHOLD: 0.85, KEYWORD_OVERLAP_MIN: 0.5, ANCHOR_WINDOW_CHARS: 50}"
      contains: "ANCHOR_WINDOW_CHARS = 50"
    - path: "src/lib/eval/citation-coverage.ts"
      provides: "Pure-function evaluator: extractClaimsRegex, extractClaimsLLM (delegates to judge-style SDK call gated by RUN_LLM_CLAIM_EXTRACTION), mergeClaimSets, citationCoverage, extractCitationAnchors"
      contains: "export function citationCoverage"
    - path: "src/lib/eval/claim-extraction-regex.ts"
      provides: "Pure regex-based extractor split out for testability — sentenceSplit, claimLanguageMatch, exclusionRegex, extractClaimsRegex"
      contains: "claimLanguageMatch"
    - path: "src/lib/eval/claim-extraction-llm.ts"
      provides: "LLM-method extractor — wraps the @anthropic-ai/sdk client (lazy, same pattern as src/lib/eval/judge.ts in 20-Z-05) and loads the eval-claim-extraction-v1 prompt from the 20-Z-04 registry; temperature 0, no cache headers; throws on malformed JSON; module also exports a _resetClientForTests() for unit tests"
      contains: "eval-claim-extraction-v1"
    - path: "src/lib/eval/claim-merge.ts"
      provides: "Pure mergeClaimSets + cosineBagOfWords + bagOfWords helpers"
      contains: "cosineBagOfWords"
    - path: "src/lib/eval/cohens-kappa.ts"
      provides: "Pure cohensKappa(boolean[], boolean[]) helper used by the kappa script"
      contains: "export function cohensKappa"
    - path: "src/lib/prompts/_v1/eval-claim-extraction-v1.md"
      provides: "v1 of the claim-extraction prompt registered in the 20-Z-04 registry"
      contains: "qualitative"
    - path: "src/lib/prompts/registry.ts"
      provides: "PromptId union extended with 'eval-claim-extraction-v1' entry"
      contains: "eval-claim-extraction-v1"
    - path: "src/lib/prompts/_manifest.ts"
      provides: "Manifest extended so getPrompt('eval-claim-extraction-v1', 'v1') resolves and the golden snapshot picks it up"
      contains: "eval-claim-extraction-v1"
    - path: "scripts/eval-citation-coverage.ts"
      provides: "Operator + cron-runnable; iterates 8 golden tickers, computes coverage, writes reports/citation-coverage-{date}.{json,md}; --ci flag enables build-blocking exit codes"
      contains: "citation-coverage"
    - path: "scripts/eval-claim-extraction-kappa.ts"
      provides: "Loads 100-claim labeled set, runs regex + LLM extraction, computes Cohen's kappa between methods + per-method F1 vs ground truth, exits non-zero when kappa < 0.7"
      contains: "cohensKappa"
    - path: "src/app/api/cron/eval-citation-coverage/route.ts"
      provides: "Weekly Vercel cron handler — Bearer CRON_SECRET auth at entry, delegates to scripts/eval-citation-coverage.ts shim, persists the JSON output"
      contains: "CRON_SECRET"
    - path: "src/app/insights/citation-coverage/page.tsx"
      provides: "Server-rendered /insights/citation-coverage page reading the latest reports/citation-coverage-*.json"
      contains: "Citation Coverage"
    - path: "src/app/insights/citation-coverage/CitationCoveragePanel.tsx"
      provides: "Per-ticker × per-section tile component with green/amber/red color scheme and click-to-expand unsupported claims"
      contains: "per_section"
    - path: "vercel.json"
      provides: "Adds /api/cron/eval-citation-coverage cron entry — schedule '0 9 * * 0' (Sunday 09:00 UTC weekly)"
      contains: "eval-citation-coverage"
    - path: "tests/golden-tickers/_claim_labels.json"
      provides: "100-entry labeled set — each {label_id, ticker, section, text, is_claim: boolean, labeler, labeled_at}"
      min_lines: 100
    - path: "tests/eval/citation-coverage.unit.test.ts"
      provides: "≥8 unit tests covering rule-A, rule-B, dedupe, empty-input, and the section-attribution path"
      contains: "rule-A"
    - path: "tests/eval/claim-extraction-regex.unit.test.ts"
      provides: "≥6 unit tests on canonical sentences (positive + negative + nested-clause)"
      contains: "extractClaimsRegex"
    - path: "tests/eval/claim-merge.unit.test.ts"
      provides: "≥4 unit tests: dedupe at >0.85, no-dedupe at <0.85, earlier-position wins, disjoint claims preserved"
      contains: "mergeClaimSets"
    - path: "tests/eval/cohens-kappa.unit.test.ts"
      provides: "≥4 unit tests: perfect agreement → 1.0, random ≈ 0, length-mismatch throws, all-true / all-false degenerate case"
      contains: "cohensKappa"
    - path: "tests/integration/citation-coverage.regression.test.ts"
      provides: "Iterates 8 golden-ticker (source, report) pairs and asserts coverage_pct ≥ 80 + per_section ≥ 60 (regex-only path)"
      contains: "coverage_pct"
    - path: "tests/integration/citation-coverage.synthetic-injection.test.ts"
      provides: "Proves the gate is real — injects 3 unsupported claims into a copy of the AAPL frozen report, asserts coverage drops below 80 + the injected claims appear in unsupported + --ci exit non-zero"
      contains: "synthetic"
    - path: ".github/workflows/citation-coverage.yml"
      provides: "CI workflow running check-citation-coverage + check-claim-extraction-kappa + unit + regression + synthetic-injection tests on every relevant PR; required for merge"
      contains: "check-citation-coverage"
    - path: "package.json"
      provides: "Adds scripts.check-citation-coverage, scripts.check-claim-extraction-kappa, scripts.eval-citation-coverage (operator), scripts.curate-claim-labels (operator)"
      contains: "check-citation-coverage"
    - path: ".planning/phases/20-real-sentiment-analysis/MODEL-CARD-citation-coverage.md"
      provides: "Mitchell-2019 model card per S4 — intended use, dual-method (regex+LLM) architecture, known failure modes, per-segment expectations (micro-cap, SPAC), kappa ship-gate rationale, 100-label dataset boundaries"
      contains: "Intended use"
  key_links:
    - from: "src/lib/eval/citation-coverage.ts (citationCoverage)"
      to: "src/lib/sentiment/citation-schema.ts (Citation, citations_v2)"
      via: "imports Citation type from 19-C-07; rule-A anchors are derived from the citation url/title via extractCitationAnchors"
      pattern: "from ['\"]@/lib/sentiment/citation-schema['\"]"
    - from: "src/lib/eval/claim-extraction-llm.ts"
      to: "src/lib/prompts/registry.ts (getPrompt('eval-claim-extraction-v1', 'v1'))"
      via: "loads the registered prompt body before each @anthropic-ai/sdk call; pins judge_prompt_version on the output for reproducibility"
      pattern: "getPrompt\\(['\"]eval-claim-extraction-v1['\"]"
    - from: "scripts/eval-citation-coverage.ts"
      to: "tests/golden-tickers/_reports/*.report.json (8 frozen reports from 20-D-01/20-D-04)"
      via: "fs.readdir iteration; per-report citationCoverage call"
      pattern: "_reports"
    - from: "src/app/api/cron/eval-citation-coverage/route.ts"
      to: "scripts/eval-citation-coverage.ts (or a shared lib shim)"
      via: "single shared evaluator entrypoint runEvalCitationCoverage() so cron + CLI behave identically; thin Bearer-auth wrapper at the route boundary"
      pattern: "runEvalCitationCoverage"
    - from: "src/app/insights/citation-coverage/page.tsx"
      to: "reports/citation-coverage-{date}.json (cron output)"
      via: "fs.readdir on reports/, picks the newest matching file, hydrates the panel"
      pattern: "citation-coverage-"
    - from: ".github/workflows/citation-coverage.yml"
      to: "npm run check-citation-coverage AND npm run check-claim-extraction-kappa"
      via: "both jobs are required-for-merge; either failing blocks PR merge"
      pattern: "check-citation-coverage"
---

# Plan 20-D-02: Citation-coverage metric (hybrid regex + LLM-judge, build-blocking ≥80% gate)

<universal_preamble>

## Autonomous Execution Clause

Audit-layer evaluator + build-blocking CI gate + weekly cron + /insights tile. No shadow lifecycle (test/cron-only module, zero production-request paths). Land types → regex extractor → LLM extractor (uses Anthropic SDK pattern from 20-Z-05) → merge + kappa helpers → registered prompt → CLI script → kappa script → CI workflow → cron route → /insights page → labeled set → unit + integration + synthetic-injection tests → model card → commit.

## Hard Cleanup Gate (Definition of Done)

1. (N/A — no shadow)
2. (N/A — no old code deleted; strict additive evaluator + new audit surface)
3. (N/A)
4. (N/A — no FEATURE flag introduced; behavior is RUN_LLM_CLAIM_EXTRACTION env-gated at CLI/test boundary only)
5. `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-commit
6. `npm run check-citation-coverage` exits 0 on the 8 frozen golden-ticker reports from 20-D-01 / 20-D-04
7. `npm run check-claim-extraction-kappa` exits 0 with kappa ≥ 0.7 on the 100-claim labeled set
8. Synthetic injection test confirms the CI gate FAILS when 3 fabricated unsupported claims are injected into the AAPL report
9. `/insights/citation-coverage` renders the per-ticker × per-section tile grid with the most recent cron output (or the in-repo committed baseline when no cron has run yet)
10. The eval-claim-extraction-v1 prompt is registered in the 20-Z-04 registry and the golden-snapshot test catches drift

</universal_preamble>

<objective>
Ship a build-blocking citation-coverage metric. Every qualitative claim in a rendered AnalysisResult must be supported by at least one citations_v2 entry (from 19-C-07). The metric is computed by a hybrid claim extractor — regex catches the easy cases, an LLM-judge (Claude Opus 4.7) catches the rest — and the two methods' agreement is measured by Cohen's kappa on a 100-claim labeled set, with a ship-gate of kappa ≥ 0.7.

The build fails when ANY golden ticker's overall coverage drops below 80%, or when any populated section falls below 60%. A weekly Vercel cron writes the latest per-ticker × per-section breakdown into reports/, surfaced at /insights/citation-coverage.

Why a hybrid extractor: regex is fast, deterministic, and cheap, but misses claims that hide behind sophisticated sentence structures ("Should management deliver on guidance, the shares appear poised to re-rate."). The LLM-judge complements it; their disagreement on the 100-claim labeled set is the kappa ship-gate. Single-method extractors silently miss claims, which silently miss unsupported text, which silently lets the build pass on a hallucination.

This plan is strictly the audit surface — numeric grounding is 20-D-01, per-claim CoVe verification is 20-D-03, golden-ticker curation is 20-D-04. Out of scope here.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-04-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-05-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-D-01-PLAN.md
@src/lib/sentiment/citation-schema.ts
@src/lib/types.ts
@src/lib/gemini-analysis.ts
@src/lib/research-brief.ts
@src/components/ResearchReport.tsx

<interfaces>

```typescript
// src/lib/eval/citation-coverage.types.ts
export const ANCHOR_WINDOW_CHARS = 50;
export const KEYWORD_OVERLAP_MIN = 0.5;
export const COSINE_DEDUPE_THRESHOLD = 0.85;
export const COVERAGE_OVERALL_MIN = 80;
export const COVERAGE_SECTION_MIN = 60;

export type ReportSection =
  | 'executive_summary'
  | 'investment_thesis'
  | 'bullish_signals'
  | 'bearish_signals'
  | 'key_risks'
  | 'valuation_context'
  | 'future_projection'
  | 'sentiment_intelligence'
  | 'community_intelligence'
  | 'engine_calibration'
  | 'sources_used';

export interface Claim {
  text: string;
  section: ReportSection;
  start_char: number;       // section-local offset
  end_char: number;
  source_method: 'regex' | 'llm' | 'merged';
  kind: 'qualitative';      // numeric claims are filtered out — 20-D-01's territory
}

export interface CitationAnchor {
  citation: import('@/lib/sentiment/citation-schema').Citation;
  anchor_pos: number;       // section-local; -1 if substring not located
  section: ReportSection;
}

export interface CoverageResult {
  coverage_pct: number;
  per_section: Record<ReportSection, number>;
  unsupported: Claim[];
  totals: {
    total_claims: number;
    supported: number;
    unsupported: number;
    kappa_method_disagreements: number;
  };
}

// src/lib/eval/citation-coverage.ts
export function extractClaimsRegex(text: string, section: ReportSection): Claim[];
export function extractClaimsLLM(
  text: string,
  section: ReportSection,
  opts?: { promptVersion?: string; maxTokens?: number; baselineId?: string },
): Promise<Claim[]>;
export function mergeClaimSets(regex: Claim[], llm: Claim[]): Claim[];
export function extractCitationAnchors(
  rendered: string,
  citations: ReadonlyArray<import('@/lib/sentiment/citation-schema').Citation>,
  section: ReportSection,
): CitationAnchor[];
export function citationCoverage(
  claims: Claim[],
  anchors: CitationAnchor[],
  opts?: { sectionMin?: number; overallMin?: number },
): CoverageResult;

// src/lib/eval/cohens-kappa.ts
export function cohensKappa(predA: boolean[], predB: boolean[]): number;
```

PROMPT BODY for `eval-claim-extraction-v1` (id = 'eval-claim-extraction-v1', version = 'v1') — registered in 20-Z-04's registry, lives at src/lib/prompts/_v1/eval-claim-extraction-v1.md:

```
You extract QUALITATIVE CLAIMS from one section of an equity research report.
A QUALITATIVE CLAIM is any assertion about the company's future, present
posture, management actions, regulatory standing, or competitive position
that a reader would expect to see supported by a citation.

DO NOT EXTRACT:
- Purely numeric statements ("revenue grew 12%"). Numeric grounding is audited
  separately. If a sentence is ONLY a number with no qualitative framing,
  do not emit it.
- Boilerplate (disclaimers, navigation, "see also", "sources").
- Definitions ("EBITDA is earnings before...").

For each qualitative claim, emit:
{
  "text":        "<verbatim claim sentence — no paraphrase>",
  "section":     "{{section}}",
  "start_char":  <integer — index into the section text where the claim starts>,
  "end_char":    <integer — index where the claim ends, exclusive>,
  "kind":        "qualitative"
}

Return STRICT JSON:
{ "claims": [ ... ] }

Ticker: {{ticker}}
Section: {{section}}
Section text follows. Extract claims with EXACT span offsets into the text below.

=== SECTION TEXT ===
{{section_text}}

OUTPUT: JSON only. No prose before or after.
```

CITATION-MATCHING ALGORITHM (the heart of `citationCoverage`):

For each Claim `c`, iterate citation anchors in the same section:

  Rule A — anchor proximity:
    if any anchor has anchor_pos >= 0 AND
       |anchor.anchor_pos - c.start_char| <= ANCHOR_WINDOW_CHARS
    then c is SUPPORTED. Rule A wins.

  Rule B — keyword overlap (only when Rule A did not fire):
    for each citation in this section:
      let claim_vec    = bagOfWords(c.text)
      let citation_vec = bagOfWords(citation.url + ' ' + (citation.title ?? ''))
      if cosineBagOfWords(claim_vec, citation_vec) >= KEYWORD_OVERLAP_MIN
      then c is SUPPORTED.

If neither rule fires for any citation in the section → c is UNSUPPORTED.

coverage_pct = (claims supported) / (total claims) × 100
per_section[s] = (claims supported in s) / (total claims in s) × 100
              or 100 when total claims in s === 0 (with console.warn)

CI gate (npm run check-citation-coverage --ci):
  fail when ANY ticker has coverage_pct < COVERAGE_OVERALL_MIN (80)
  fail when ANY (ticker, section) with total_claims > 0 has per_section[s] < COVERAGE_SECTION_MIN (60)

```

</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-D-02-01 | Tampering | Regex misses sophisticated claims (passive voice, modal-verb chains, nested clauses) — leading to false-high coverage scores | mitigate | LLM-judge (Claude Opus 4.7 via the eval-claim-extraction-v1 prompt) complements regex; merge dedupes at cosine > 0.85 so neither method's blind-spots dominate; ship-gate kappa ≥ 0.7 between regex-predictions and LLM-predictions on a 100-claim human-labeled set proves the two methods agree often enough to trust the union but disagree on the right cases — a kappa < 0.7 trips the build and forces the operator to inspect why the methods diverged |
| T-20-D-02-02 | Cost runaway | LLM-judge token spend explodes during dev iteration or accidental cron mis-schedule | mitigate | EXACTLY ONE Anthropic call per (report_id, prompt_version) tuple — never one call per claim. Temperature 0 for determinism. The CLI is the only invocation site; cron schedule is weekly (0 9 * * 0) so the rolling cost is small and bounded. RUN_LLM_CLAIM_EXTRACTION=true env gate keeps CI from burning tokens (CI uses the committed snapshot at tests/golden-tickers/_claim_labels.llm_snapshot.json). Cost telemetry forward-references 20-Z-03 ProviderCallLog wrapper (this plan emits cost-per-call to stdout for now; a TODO is filed) |
| T-20-D-02-03 | Tampering | Citation matcher too loose — Rule B (cosine ≥ 0.5) marks a fabricated unsupported claim as covered because of common stopwords / generic vocabulary | mitigate | (a) Rules are applied in order — Rule A (±50 char anchor) wins first because anchor proximity is the strong evidence; Rule B is the fallback. (b) cosineBagOfWords drops stopwords and lowercases before scoring so "the company will" does not match every citation generically. (c) Synthetic-injection integration test injects 3 fabricated unsupported claims with vocabulary that has NO overlap with any committed citation and asserts they appear in `unsupported` AND the CI gate fails — a regression in the matcher's strictness would fail this test. (d) Per-section minimum (60%) catches sections where Rule B passes vacuously |
| T-20-D-02-04 | Acceptance gate | 80% overall coverage gate is unrealistic for micro-cap or SPAC tickers because the underlying SourcePackage simply has fewer citations to begin with | mitigate | (a) The 80% gate is on QUALITATIVE claims, not total sentences — micro-cap reports tend to have fewer qualitative claims AND fewer citations in lockstep, so the ratio is preserved. (b) Per-section minimum (60%) is the safety valve — sections that depend on sparse data are evaluated separately from the executive_summary / investment_thesis which always have rich sources. (c) Model card (MODEL-CARD-citation-coverage.md) documents per-segment expectations explicitly; the rotating-micro-cap fixture from 20-D-04's runbook is the safety net for ongoing detection of regression on this segment |
| T-20-D-02-05 | Tampering | Stale citations (URL no longer resolves, page content drifted) silently pass Rule B because keyword overlap is computed on the citation's title/url substring stored at fetch time, not against the live page | mitigate | This plan does NOT re-verify URL liveness — that responsibility lives in 19-C-07's existing citations_v2 verification path (CoVe Pass-2 NLI verifier at src/lib/sentiment/nli-verifier.ts), extended per-claim in 20-D-03. citation-coverage's contract is "does the report make claims it cites?" not "are those citations still live?" The Phase 19 infrastructure handles liveness; this plan layers on top |
| T-20-D-02-06 | Configuration | The eval-claim-extraction-v1 prompt drifts unintentionally and silently breaks the merge step (LLM produces different output structure) | mitigate | Prompt is registered in the 20-Z-04 registry with golden-snapshot regression. Any non-whitespace edit to src/lib/prompts/_v1/eval-claim-extraction-v1.md without a corresponding _v2/ directory trips check-prompts in CI. extractClaimsLLM throws on malformed JSON or missing `claims` field — the script logs and skips that report rather than vacuously passing |
| T-20-D-02-07 | Acceptance gate | Pearson / kappa sample size insufficient at first run because the 100-claim labeled set is not yet curated | accept | Plan ships the 100-claim labeled set in the same commit as the evaluator (truth #14). Integration test enforces the ≥100 floor. Forward-reference: 20-D-04 expands the corpus and the rotating-micro-cap fixture introduces new sample candidates monthly |

</threat_model>

<tasks>

<task type="auto" tdd="true" id="20-D-02-01">
  <name>Task 1: Types + cohensKappa + claim-merge helpers (TDD)</name>
  <read_first>
    - src/lib/sentiment/citation-schema.ts (Citation type — imported by citation-coverage.types.ts)
    - src/lib/types.ts (AnalysisResult — confirm citations_v2 shape lines 446-451 + bullish_signals/bearish_signals/risks structure)
    - .planning/phases/20-real-sentiment-analysis/20-Z-05-PLAN.md (lines 380-395 — Anthropic client lazy-init pattern; reuse the _resetClientForTests convention)
    - .planning/phases/20-real-sentiment-analysis/20-D-01-PLAN.md (lines 60-75 — tolerance-schedule literal pattern; mirror the const-export style for COVERAGE_OVERALL_MIN, COVERAGE_SECTION_MIN, ANCHOR_WINDOW_CHARS, KEYWORD_OVERLAP_MIN, COSINE_DEDUPE_THRESHOLD)
  </read_first>
  <behavior>
    Unit tests (≥10) covering:
    1. cohensKappa([true,true,false,false], [true,true,false,false]) === 1.0 (perfect agreement)
    2. cohensKappa returns ≈ 0 (within ±0.1) on independent random boolean[100] vs boolean[100] (seeded RNG for determinism)
    3. cohensKappa throws when arrays differ in length
    4. cohensKappa on all-true vs all-true returns 1.0 with a documented degenerate-case note (p_e === 1)
    5. cohensKappa on perfect-disagreement ([t,t,f,f] vs [f,f,t,t]) returns ≈ −1.0 (within ±0.05)
    6. bagOfWords lowercases, strips punctuation, drops stopwords (article + auxiliary set)
    7. cosineBagOfWords returns 1.0 on identical inputs and 0.0 on disjoint inputs
    8. mergeClaimSets dedupes claims with cosine > 0.85 keeping the lower start_char
    9. mergeClaimSets preserves disjoint claims (cosine < 0.85 → both retained, source_method correctly stamped)
    10. mergeClaimSets stable-sorts output by (section, start_char) so downstream iteration is deterministic
    11. Types compile: ReportSection union has exactly 11 members; constants match the values from CONTEXT.md line 138 spec
  </behavior>
  <action>
    A. Create `src/lib/eval/citation-coverage.types.ts` exporting the types + constants EXACTLY as declared in the `<interfaces>` block above. The five constants (ANCHOR_WINDOW_CHARS=50, KEYWORD_OVERLAP_MIN=0.5, COSINE_DEDUPE_THRESHOLD=0.85, COVERAGE_OVERALL_MIN=80, COVERAGE_SECTION_MIN=60) are `as const` literal exports.

    B. Create `src/lib/eval/cohens-kappa.ts` — pure function `cohensKappa(predA: boolean[], predB: boolean[]): number`:

    ```typescript
    // src/lib/eval/cohens-kappa.ts
    // Pure Cohen's kappa for inter-method agreement between two binary
    // classifications. Used by scripts/eval-claim-extraction-kappa.ts to
    // measure regex-vs-LLM agreement on the 100-claim labeled set.
    //
    // Degenerate case: when both predictors agree on every label (p_e === 1),
    // returns 1.0 by convention (the methods are perfectly consistent even
    // though kappa is mathematically undefined; we document this rather than
    // returning NaN which would crash the ship-gate check).

    export function cohensKappa(predA: boolean[], predB: boolean[]): number {
      if (predA.length !== predB.length) {
        throw new Error(
          `cohensKappa: length mismatch (predA=${predA.length}, predB=${predB.length})`,
        );
      }
      if (predA.length === 0) return 1.0;

      const n = predA.length;
      let a_true = 0, b_true = 0, agree = 0;
      for (let i = 0; i < n; i++) {
        if (predA[i]) a_true++;
        if (predB[i]) b_true++;
        if (predA[i] === predB[i]) agree++;
      }
      const p_o = agree / n;
      const p_a_true = a_true / n;
      const p_b_true = b_true / n;
      const p_e = p_a_true * p_b_true + (1 - p_a_true) * (1 - p_b_true);
      if (p_e === 1) return 1.0; // degenerate — documented above
      return (p_o - p_e) / (1 - p_e);
    }
    ```

    C. Create `src/lib/eval/claim-merge.ts` with `bagOfWords(text)`, `cosineBagOfWords(a, b)`, and `mergeClaimSets(regex, llm)`. Stopword list is inline (no external dep):

    ```typescript
    const STOPWORDS = new Set([
      'a','an','the','and','or','but','if','of','to','in','on','for','at','by',
      'with','from','as','is','are','was','were','be','been','being','has','have',
      'had','do','does','did','will','would','should','could','can','may','might',
      'this','that','these','those','it','its','they','them','their','there','here',
    ]);

    export function bagOfWords(text: string): Map<string, number> {
      const m = new Map<string, number>();
      for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
        if (!raw || STOPWORDS.has(raw)) continue;
        m.set(raw, (m.get(raw) ?? 0) + 1);
      }
      return m;
    }

    export function cosineBagOfWords(a: Map<string, number>, b: Map<string, number>): number {
      if (a.size === 0 || b.size === 0) return 0;
      let dot = 0, na = 0, nb = 0;
      for (const [k, va] of a) {
        na += va * va;
        const vb = b.get(k);
        if (vb !== undefined) dot += va * vb;
      }
      for (const vb of b.values()) nb += vb * vb;
      const denom = Math.sqrt(na) * Math.sqrt(nb);
      return denom === 0 ? 0 : dot / denom;
    }

    export function mergeClaimSets(regex: Claim[], llm: Claim[]): Claim[] {
      // ... implementation: tag every claim with bagOfWords, dedupe across sets
      // by cosine > 0.85, keep the lower start_char, stamp source_method.
      // Stable-sort by (section, start_char) for deterministic test output.
    }
    ```

    D. Write tests at `tests/eval/cohens-kappa.unit.test.ts` and `tests/eval/claim-merge.unit.test.ts` per the 11 behaviors above. Use a seeded RNG (e.g., import a small mulberry32 inline) for the "≈ 0 on independent random" assertion so the test is deterministic.
  </action>
  <acceptance_criteria>
    - `src/lib/eval/citation-coverage.types.ts` exists with the 5 constants exported `as const`
    - `grep -q "ANCHOR_WINDOW_CHARS = 50" src/lib/eval/citation-coverage.types.ts`
    - `grep -q "COVERAGE_OVERALL_MIN = 80" src/lib/eval/citation-coverage.types.ts`
    - `grep -q "COVERAGE_SECTION_MIN = 60" src/lib/eval/citation-coverage.types.ts`
    - `src/lib/eval/cohens-kappa.ts` + `src/lib/eval/claim-merge.ts` exist
    - `npx vitest run tests/eval/cohens-kappa.unit.test.ts tests/eval/claim-merge.unit.test.ts` exits 0 with ≥10 passing tests
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/eval/cohens-kappa.unit.test.ts tests/eval/claim-merge.unit.test.ts</automated>
  </verify>
  <done>Types + constants + cohensKappa + bagOfWords + cosineBagOfWords + mergeClaimSets landed; ≥10 unit tests GREEN</done>
</task>

<task type="auto" tdd="true" id="20-D-02-02">
  <name>Task 2: Regex claim extractor (TDD)</name>
  <read_first>
    - src/lib/eval/citation-coverage.types.ts (Claim, ReportSection — from Task 1)
    - src/components/ResearchReport.tsx (look for the section headers — these define ReportSection in practice)
    - src/lib/types.ts (AnalysisResult shape — the fields that become rendered sections)
  </read_first>
  <behavior>
    Unit tests (≥6) covering:
    1. extractClaimsRegex returns ≥3 claims on a canonical bull-thesis paragraph: "The company will accelerate. Management announced a buyback. Insiders disclosed a stake." — three claims, three exact span offsets
    2. extractClaimsRegex returns 0 claims on a pure disclaimer paragraph
    3. extractClaimsRegex returns 0 claims on a pure navigation paragraph ("Table of contents. See also.")
    4. extractClaimsRegex handles parenthesized + nested clauses ("Although guidance was lowered, the company expects margin expansion.") without IndexOutOfRange — emits the "company expects" clause as one claim with correct offsets
    5. extractClaimsRegex emits start_char / end_char that index into the input text exactly (slice round-trip equals the claim's `text`)
    6. extractClaimsRegex section attribution: every claim has the ReportSection passed by the caller — the extractor does not invent section labels
    7. extractClaimsRegex source_method === 'regex' on every output
    8. extractClaimsRegex on a sentence with NO claim-language verb returns []
  </behavior>
  <action>
    A. Create `src/lib/eval/claim-extraction-regex.ts`:

    ```typescript
    import type { Claim, ReportSection } from './citation-coverage.types';

    const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z])/g;

    const CLAIM_LANGUAGE = /\b(is|are|was|were|will|may|could|reports|announced|disclosed|expects|expected|guidance|projects|projected|forecast|forecasts|estimates|estimated|reported|raised|lowered|cut|increased|decreased)\b/i;

    const EXCLUSION = /^\s*(disclaimer|sources|methodology|navigation|table of contents|see also|figure|chart|data as of)\b/i;

    export function extractClaimsRegex(text: string, section: ReportSection): Claim[] {
      const out: Claim[] = [];
      // Split by sentence boundary; preserve offsets via a cursor walk so
      // start_char / end_char are accurate (regex split loses positions).
      let cursor = 0;
      const sentences = text.split(SENTENCE_SPLIT);
      for (const s of sentences) {
        const idx = text.indexOf(s, cursor);
        if (idx === -1) continue;
        cursor = idx + s.length;
        if (EXCLUSION.test(s)) continue;
        if (!CLAIM_LANGUAGE.test(s)) continue;
        out.push({
          text: s.trim(),
          section,
          start_char: idx,
          end_char: idx + s.length,
          source_method: 'regex',
          kind: 'qualitative',
        });
      }
      return out;
    }
    ```

    B. Tests at `tests/eval/claim-extraction-regex.unit.test.ts` — cover the 8 behaviors above. Slice round-trip assertion: `expect(input.slice(c.start_char, c.end_char).trim()).toBe(c.text)`.
  </action>
  <acceptance_criteria>
    - `src/lib/eval/claim-extraction-regex.ts` exists
    - `grep -q "CLAIM_LANGUAGE" src/lib/eval/claim-extraction-regex.ts`
    - `grep -q "EXCLUSION" src/lib/eval/claim-extraction-regex.ts`
    - `npx vitest run tests/eval/claim-extraction-regex.unit.test.ts` exits 0 with ≥6 passing tests
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/eval/claim-extraction-regex.unit.test.ts</automated>
  </verify>
  <done>Regex extractor + ≥6 unit tests GREEN; slice-round-trip assertion proves offset accuracy</done>
</task>

<task type="auto" tdd="true" id="20-D-02-03">
  <name>Task 3: LLM-judge claim extractor + prompt registration (TDD)</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-04-PLAN.md (lines 36-46 — registry contract; the _manifest.ts pattern from line 56-58 of 20-D-05-PLAN.md)
    - .planning/phases/20-real-sentiment-analysis/20-Z-05-PLAN.md (lines 285-355 — registerPrompt + Anthropic client pattern; reuse the lazy-init + _resetClientForTests convention; this task ADDS 'eval-claim-extraction-v1' to the same registry seeded in 20-Z-05)
    - src/lib/eval/citation-coverage.types.ts (Claim, ReportSection from Task 1)
  </read_first>
  <behavior>
    Unit tests (≥6) covering:
    1. extractClaimsLLM returns the claims array parsed from the mocked Anthropic response
    2. extractClaimsLLM pins `temperature: 0` in the underlying SDK call (mock spy)
    3. extractClaimsLLM pins `model: 'claude-opus-4-7'` (mock spy on the call argument)
    4. extractClaimsLLM does NOT pass any cache_control field (JSON.stringify(call_arg).includes('cache') === false)
    5. extractClaimsLLM throws a descriptive error on malformed JSON
    6. extractClaimsLLM throws when an emitted claim has start_char > end_char
    7. extractClaimsLLM stamps source_method === 'llm' on every output
    8. extractClaimsLLM loads the registered prompt body for 'eval-claim-extraction-v1' v1 (verifies registry roundtrip)
  </behavior>
  <action>
    A. Create `src/lib/prompts/_v1/eval-claim-extraction-v1.md` with frontmatter + the body shown in `<interfaces>` above. Register the prompt in `src/lib/prompts/registry.ts` (extend the PromptId union per the 20-Z-04 convention) and in `src/lib/prompts/_manifest.ts` so getPrompt resolves it.

    B. Create `src/lib/eval/claim-extraction-llm.ts` — mirror the SDK pattern from 20-Z-05 src/lib/eval/judge.ts (lazy client + _resetClientForTests + temperature 0 + no cache headers):

    ```typescript
    // src/lib/eval/claim-extraction-llm.ts
    import Anthropic from '@anthropic-ai/sdk';
    import { renderPrompt } from '@/lib/prompts/render';
    import type { Claim, ReportSection } from './citation-coverage.types';

    const MODEL = 'claude-opus-4-7' as const;
    let _client: Anthropic | null = null;
    function getClient(): Anthropic {
      if (!_client) _client = new Anthropic();
      return _client;
    }
    export function _resetClientForTests(): void { _client = null; }

    export async function extractClaimsLLM(
      text: string,
      section: ReportSection,
      opts?: { promptVersion?: string; maxTokens?: number; ticker?: string },
    ): Promise<Claim[]> {
      const body = renderPrompt('eval-claim-extraction-v1', {
        section,
        ticker: opts?.ticker ?? '<unknown>',
        section_text: text,
      }, opts?.promptVersion ?? 'v1');

      const response = await getClient().messages.create({
        model: MODEL,
        max_tokens: opts?.maxTokens ?? 4000,
        temperature: 0,
        messages: [{ role: 'user', content: body }],
        // NO cache_control anywhere — eval calls must not be cached at the gateway
      });

      const txt = response.content.find(b => b.type === 'text');
      if (!txt || txt.type !== 'text') {
        throw new Error(`extractClaimsLLM: no text content (stop_reason=${response.stop_reason})`);
      }
      const cleaned = txt.text.trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      let parsed: unknown;
      try { parsed = JSON.parse(cleaned); }
      catch (e) { throw new Error(`extractClaimsLLM: invalid JSON: ${(e as Error).message}; got ${cleaned.slice(0,200)}`); }

      const claimsRaw = (parsed as { claims?: unknown }).claims;
      if (!Array.isArray(claimsRaw)) {
        throw new Error(`extractClaimsLLM: response missing 'claims' array`);
      }
      const out: Claim[] = [];
      for (const r of claimsRaw) {
        if (typeof r !== 'object' || r === null) {
          throw new Error(`extractClaimsLLM: claim entry not an object: ${JSON.stringify(r)}`);
        }
        const { text: claimText, start_char, end_char } = r as Record<string, unknown>;
        if (typeof claimText !== 'string' || typeof start_char !== 'number' || typeof end_char !== 'number') {
          throw new Error(`extractClaimsLLM: missing required claim fields`);
        }
        if (start_char > end_char) {
          throw new Error(`extractClaimsLLM: start_char > end_char for "${claimText.slice(0,80)}"`);
        }
        out.push({
          text: claimText,
          section,
          start_char,
          end_char,
          source_method: 'llm',
          kind: 'qualitative',
        });
      }
      return out;
    }
    ```

    C. Write tests at `tests/eval/claim-extraction-llm.unit.test.ts` using the same vi.mock('@anthropic-ai/sdk') pattern from 20-Z-05 Task 1. Cover the 8 behaviors. Assert absence of `cache_control` by stringifying the call arg.
  </action>
  <acceptance_criteria>
    - `src/lib/prompts/_v1/eval-claim-extraction-v1.md` exists with frontmatter id=eval-claim-extraction-v1, version=v1
    - `grep -q "eval-claim-extraction-v1" src/lib/prompts/registry.ts`
    - `grep -q "eval-claim-extraction-v1" src/lib/prompts/_manifest.ts`
    - `grep -q "claude-opus-4-7" src/lib/eval/claim-extraction-llm.ts`
    - `grep -q "temperature: 0" src/lib/eval/claim-extraction-llm.ts`
    - `npx vitest run tests/eval/claim-extraction-llm.unit.test.ts` passes with ≥6 tests
    - 20-Z-04 golden snapshot test does not fail (the new prompt is registered in the snapshot file by Task 3)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/eval/claim-extraction-llm.unit.test.ts tests/prompts/registry.golden.test.ts</automated>
  </verify>
  <done>LLM extractor + registered prompt + ≥6 unit tests GREEN; the 20-Z-04 golden-snapshot test resolves the new entry</done>
</task>

<task type="auto" tdd="true" id="20-D-02-04">
  <name>Task 4: citationCoverage core — rule-A + rule-B + per-section totals (TDD)</name>
  <read_first>
    - src/lib/eval/citation-coverage.types.ts (CoverageResult, CitationAnchor, ANCHOR_WINDOW_CHARS, KEYWORD_OVERLAP_MIN — from Task 1)
    - src/lib/sentiment/citation-schema.ts (Citation shape)
    - src/lib/eval/claim-merge.ts (bagOfWords, cosineBagOfWords from Task 1)
  </read_first>
  <behavior>
    Unit tests (≥8) covering:
    1. citationCoverage on empty claims returns coverage_pct === 100 AND console.warn fires (vitest spy on console.warn)
    2. Rule A: claim at start_char=100 + anchor at anchor_pos=130 (Δ=30 ≤ 50) → supported, source rule recorded as 'anchor'
    3. Rule A boundary: anchor at anchor_pos=150 (Δ=50 exactly) → supported (≤ inclusive)
    4. Rule A miss: anchor at anchor_pos=151 (Δ=51) → falls through to Rule B
    5. Rule B: claim "Apple announced new chip" + citation "https://example.com/apple-chip-news" → cosineBagOfWords ≥ 0.5 → supported
    6. Rule B miss: claim "company will triple revenue" + citation "https://example.com/random-disclaimer" with disjoint vocabulary → unsupported
    7. Rule A wins over Rule B when both fire: assert the recorded supporting_rule is 'anchor', not 'keyword'
    8. citationCoverage groups anchors and claims by section before matching — claim in investment_thesis is never matched against an anchor in sources_used
    9. per_section[s] === 100 when total_claims_in_s === 0 (with warn)
    10. coverage_pct = supported / total_claims × 100 to 2-decimal precision
    11. totals.kappa_method_disagreements: counter incremented when a claim survived merging but only ONE source_method tagged it (regex XOR llm) — surfaces the disagreement rate for downstream monitoring
  </behavior>
  <action>
    A. Implement `src/lib/eval/citation-coverage.ts`:

    ```typescript
    import type {
      Claim, ReportSection, CitationAnchor, CoverageResult,
    } from './citation-coverage.types';
    import {
      ANCHOR_WINDOW_CHARS, KEYWORD_OVERLAP_MIN,
      COVERAGE_OVERALL_MIN, COVERAGE_SECTION_MIN,
    } from './citation-coverage.types';
    import type { Citation } from '@/lib/sentiment/citation-schema';
    import { bagOfWords, cosineBagOfWords } from './claim-merge';

    export { extractClaimsRegex } from './claim-extraction-regex';
    export { extractClaimsLLM } from './claim-extraction-llm';
    export { mergeClaimSets } from './claim-merge';

    export function extractCitationAnchors(
      rendered: string,
      citations: ReadonlyArray<Citation>,
      section: ReportSection,
    ): CitationAnchor[] {
      const out: CitationAnchor[] = [];
      for (const c of citations) {
        // Anchor strategy: try url substring first, then date_retrieved as
        // a coarse anchor (rendered reports often show "Source: ... 2026-05-10").
        let pos = c.url ? rendered.indexOf(c.url) : -1;
        if (pos === -1 && c.url) {
          // Try the bare domain for cases where the rendered text shortens
          // the URL ('apple.com' rather than 'https://apple.com/path').
          const m = c.url.match(/^https?:\/\/([^/]+)/);
          if (m) pos = rendered.indexOf(m[1]);
        }
        out.push({ citation: c, anchor_pos: pos, section });
      }
      return out;
    }

    export function citationCoverage(
      claims: Claim[],
      anchors: CitationAnchor[],
      opts?: { sectionMin?: number; overallMin?: number },
    ): CoverageResult {
      const sectionMin = opts?.sectionMin ?? COVERAGE_SECTION_MIN;
      const overallMin = opts?.overallMin ?? COVERAGE_OVERALL_MIN;

      if (claims.length === 0) {
        console.warn('citationCoverage: empty claims input — returning 100');
        return {
          coverage_pct: 100,
          per_section: {} as Record<ReportSection, number>,
          unsupported: [],
          totals: { total_claims: 0, supported: 0, unsupported: 0, kappa_method_disagreements: 0 },
        };
      }

      const anchorsBySection = new Map<ReportSection, CitationAnchor[]>();
      for (const a of anchors) {
        const arr = anchorsBySection.get(a.section) ?? [];
        arr.push(a);
        anchorsBySection.set(a.section, arr);
      }

      const claimsBySection = new Map<ReportSection, Claim[]>();
      for (const c of claims) {
        const arr = claimsBySection.get(c.section) ?? [];
        arr.push(c);
        claimsBySection.set(c.section, arr);
      }

      const per_section: Partial<Record<ReportSection, number>> = {};
      const unsupported: Claim[] = [];
      let totalSupported = 0;
      let kappaDisagreements = 0;

      for (const [section, secClaims] of claimsBySection) {
        const secAnchors = anchorsBySection.get(section) ?? [];
        let supported = 0;
        for (const c of secClaims) {
          let ok = false;
          // Rule A — anchor proximity
          for (const a of secAnchors) {
            if (a.anchor_pos >= 0 && Math.abs(a.anchor_pos - c.start_char) <= ANCHOR_WINDOW_CHARS) {
              ok = true; break;
            }
          }
          // Rule B — keyword overlap
          if (!ok) {
            const claimVec = bagOfWords(c.text);
            for (const a of secAnchors) {
              const citVec = bagOfWords((a.citation.url ?? '') + ' ' + ((a.citation as { title?: string }).title ?? ''));
              if (cosineBagOfWords(claimVec, citVec) >= KEYWORD_OVERLAP_MIN) {
                ok = true; break;
              }
            }
          }
          if (ok) supported++;
          else unsupported.push(c);
          if (c.source_method !== 'merged') kappaDisagreements++;
        }
        per_section[section] = (supported / secClaims.length) * 100;
        totalSupported += supported;
      }

      const coverage_pct = Math.round(((totalSupported / claims.length) * 100) * 100) / 100;
      return {
        coverage_pct,
        per_section: per_section as Record<ReportSection, number>,
        unsupported,
        totals: {
          total_claims: claims.length,
          supported: totalSupported,
          unsupported: claims.length - totalSupported,
          kappa_method_disagreements: kappaDisagreements,
        },
      };
    }
    ```

    B. Tests at `tests/eval/citation-coverage.unit.test.ts` cover the 11 behaviors. Build synthetic Citation objects via `CitationSchema.parse({...})` to ensure the test inputs are real Citations (catches drift if citation-schema.ts evolves).
  </action>
  <acceptance_criteria>
    - `src/lib/eval/citation-coverage.ts` exists and exports citationCoverage + extractCitationAnchors + re-exports extractClaimsRegex / extractClaimsLLM / mergeClaimSets
    - `grep -q "ANCHOR_WINDOW_CHARS" src/lib/eval/citation-coverage.ts`
    - `grep -q "KEYWORD_OVERLAP_MIN" src/lib/eval/citation-coverage.ts`
    - `npx vitest run tests/eval/citation-coverage.unit.test.ts` exits 0 with ≥8 passing tests (target 11)
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/eval/citation-coverage.unit.test.ts</automated>
  </verify>
  <done>citationCoverage + extractCitationAnchors landed; ≥8 unit tests GREEN proving rule-A, rule-B, dedupe, per-section, and warn-on-empty paths</done>
</task>

<task type="auto" id="20-D-02-05">
  <name>Task 5: 100-claim labeled set + LLM snapshot</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-D-01-PLAN.md (lines 69-100 — golden-ticker fixture layout; this task piggy-backs on the 20-D-01 _reports/ directory)
    - tests/golden-tickers/_human_labels/ (5 starter exemplars from 20-Z-05 — same labeler/labeled_at convention reused)
  </read_first>
  <action>
    A. Create `tests/golden-tickers/_claim_labels.json` — a JSON array of ≥100 entries sampled from the 8 golden reports (stratify proportionally across sections — executive_summary, investment_thesis, bullish_signals, bearish_signals, key_risks, valuation_context, future_projection, sentiment_intelligence, community_intelligence, engine_calibration). Each entry:

    ```json
    {
      "label_id": "aapl-investment_thesis-014",
      "ticker": "AAPL",
      "section": "investment_thesis",
      "text": "The company will benefit from a multi-year iPhone refresh cycle.",
      "is_claim": true,
      "labeler": "tj",
      "labeled_at": "2026-05-11T10:30:00Z"
    }
    ```

    Sampling distribution target: ~70 true-claim + ~30 not-a-claim entries (boilerplate, definitions, navigation) so both regex and LLM are tested on rejection too. Vary ticker representation: AAPL ×15, DKNG ×15, GME ×15, SOFI ×10, SPY ×10, DWAC ×10, TSM ×10, microcap ×15.

    B. Create `tests/golden-tickers/_claim_labels.llm_snapshot.json` — committed LLM output for each of the 100 source sentences when run through extractClaimsLLM. Format: array of `{label_id, llm_emitted_claim: boolean, llm_text?, llm_start_char?, llm_end_char?}`. Generated by the operator via the kappa script's `--snapshot` mode (Task 7).

    C. Add an integration test `tests/integration/claim-labels-roundtrip.unit.test.ts` that enforces:
    - File parses as JSON array
    - Length ≥ 100
    - Every entry has the 7 required fields
    - is_claim distribution is in [55, 75] true and [25, 45] false (so kappa is non-degenerate)
    - Every section in the closed ReportSection union has ≥ 5 entries (stratification floor)
  </action>
  <acceptance_criteria>
    - `tests/golden-tickers/_claim_labels.json` exists with ≥100 entries
    - `node -e "const j=JSON.parse(require('fs').readFileSync('tests/golden-tickers/_claim_labels.json','utf8')); if(j.length<100)process.exit(1)"` exits 0
    - `tests/golden-tickers/_claim_labels.llm_snapshot.json` exists (empty array on first commit — populated by Task 7 operator run)
    - `npx vitest run tests/integration/claim-labels-roundtrip.unit.test.ts` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx vitest run tests/integration/claim-labels-roundtrip.unit.test.ts</automated>
  </verify>
  <done>100-claim labeled set committed + LLM snapshot scaffold + roundtrip integrity test GREEN</done>
</task>

<task type="auto" id="20-D-02-06">
  <name>Task 6: scripts/eval-citation-coverage.ts CLI + per-ticker reports + CI gate</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-D-01-PLAN.md (lines 50-60 — eval-script pattern for the 8-ticker iteration)
    - src/lib/eval/citation-coverage.ts (entrypoint from Task 4)
    - tests/golden-tickers/_reports/ (8 frozen reports from 20-D-01)
  </read_first>
  <action>
    A. Create `scripts/eval-citation-coverage.ts`:

    ```typescript
    // scripts/eval-citation-coverage.ts
    // Operator + cron-runnable evaluator. Iterates 8 frozen golden-ticker
    // (source, report) pairs from 20-D-01 / 20-D-04, computes citation
    // coverage, emits JSON + markdown to reports/. --ci flag enables
    // build-blocking exit codes.
    import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
    import { join } from 'node:path';
    import {
      extractClaimsRegex, extractClaimsLLM, mergeClaimSets,
      extractCitationAnchors, citationCoverage,
    } from '@/lib/eval/citation-coverage';
    import { COVERAGE_OVERALL_MIN, COVERAGE_SECTION_MIN } from '@/lib/eval/citation-coverage.types';

    const REPORTS_DIR = 'tests/golden-tickers/_reports';
    const OUT_DIR = 'reports';

    type CliArgs = { ci: boolean; useLLM: boolean; outDir: string };

    function parseArgs(argv: string[]): CliArgs {
      return {
        ci: argv.includes('--ci'),
        useLLM: process.env.RUN_LLM_CLAIM_EXTRACTION === 'true',
        outDir: OUT_DIR,
      };
    }

    export async function runEvalCitationCoverage(args: CliArgs) {
      if (!existsSync(REPORTS_DIR)) {
        console.error(`Missing ${REPORTS_DIR} — 20-D-01 / 20-D-04 fixtures not landed`);
        return { exitCode: 4, perTicker: {} };
      }
      const files = readdirSync(REPORTS_DIR).filter(f => f.endsWith('.report.json'));
      const perTicker: Record<string, ReturnType<typeof citationCoverage>> = {};
      let anyFail = false;

      for (const f of files) {
        const report = JSON.parse(readFileSync(join(REPORTS_DIR, f), 'utf8'));
        const ticker = (report.symbol ?? f.replace('.report.json','')).toUpperCase();
        const claims: import('@/lib/eval/citation-coverage.types').Claim[] = [];
        const anchors: import('@/lib/eval/citation-coverage.types').CitationAnchor[] = [];

        // Split report into sections — each AnalysisResult field maps to a ReportSection
        const sections: Array<[import('@/lib/eval/citation-coverage.types').ReportSection, string]> = [
          ['executive_summary', report.executive_summary ?? ''],
          ['investment_thesis', report.investment_thesis ?? ''],
          ['key_risks', report.key_risks ?? ''],
          ['valuation_context', report.valuation_context ?? ''],
          ['future_projection', report.future_projection ?? ''],
          ['sentiment_intelligence', report.sentiment_analysis?.reasoning ?? ''],
          ['community_intelligence', report.community_analysis ?? ''],
        ];
        // bullish_signals / bearish_signals are arrays of {description}
        for (const sig of (report.bullish_signals ?? [])) {
          const t = typeof sig === 'string' ? sig : (sig.description ?? '');
          sections.push(['bullish_signals', t]);
        }
        for (const sig of (report.bearish_signals ?? [])) {
          const t = typeof sig === 'string' ? sig : (sig.description ?? '');
          sections.push(['bearish_signals', t]);
        }

        for (const [section, text] of sections) {
          if (!text) continue;
          const reg = extractClaimsRegex(text, section);
          const llm = args.useLLM
            ? await extractClaimsLLM(text, section, { ticker })
            : [];
          const merged = mergeClaimSets(reg, llm);
          claims.push(...merged);
          const ancs = extractCitationAnchors(text, report.citations_v2 ?? [], section);
          anchors.push(...ancs);
        }

        const result = citationCoverage(claims, anchors);
        perTicker[ticker] = result;

        if (result.coverage_pct < COVERAGE_OVERALL_MIN) anyFail = true;
        for (const [section, pct] of Object.entries(result.per_section)) {
          if (pct < COVERAGE_SECTION_MIN && result.totals.total_claims > 0) anyFail = true;
        }
      }

      // Write JSON + markdown
      if (!existsSync(args.outDir)) mkdirSync(args.outDir, { recursive: true });
      const date = new Date().toISOString().slice(0, 10);
      writeFileSync(join(args.outDir, `citation-coverage-${date}.json`),
        JSON.stringify({ run_date: date, per_ticker: perTicker, thresholds: { COVERAGE_OVERALL_MIN, COVERAGE_SECTION_MIN } }, null, 2));
      // ... write the markdown summary too ...

      return { exitCode: args.ci && anyFail ? 1 : 0, perTicker };
    }

    if (require.main === module) {
      runEvalCitationCoverage(parseArgs(process.argv.slice(2)))
        .then(({ exitCode }) => process.exit(exitCode))
        .catch(e => { console.error(e); process.exit(2); });
    }
    ```

    B. Update `package.json` scripts:
    - `"check-citation-coverage": "tsx scripts/eval-citation-coverage.ts --ci"`
    - `"eval-citation-coverage": "tsx scripts/eval-citation-coverage.ts"`

    C. Create `.github/workflows/citation-coverage.yml` that runs `npm run check-citation-coverage` + `npm run check-claim-extraction-kappa` + the regression + synthetic-injection vitest suites on every PR touching the trigger paths listed in the truths above. Required for merge.

    D. Create `tests/integration/citation-coverage.regression.test.ts` and `tests/integration/citation-coverage.synthetic-injection.test.ts` per the truths above.
  </action>
  <acceptance_criteria>
    - `scripts/eval-citation-coverage.ts` exists and is executable via `npx tsx`
    - `package.json` contains both `check-citation-coverage` and `eval-citation-coverage` scripts
    - `.github/workflows/citation-coverage.yml` exists with the trigger paths above
    - `npm run check-citation-coverage` exits 0 on the 8-frozen-report corpus (regex-only path)
    - `npx vitest run tests/integration/citation-coverage.regression.test.ts` exits 0
    - `npx vitest run tests/integration/citation-coverage.synthetic-injection.test.ts` exits 0 — and the script exits non-zero when 3 unsupported claims are injected (proven by the synthetic-injection test running the CLI in a child process or by re-running the export with the injection applied in-process)
  </acceptance_criteria>
  <verify>
    <automated>npm run check-citation-coverage && npx vitest run tests/integration/citation-coverage.regression.test.ts tests/integration/citation-coverage.synthetic-injection.test.ts</automated>
  </verify>
  <done>CLI script + CI workflow + regression + synthetic-injection tests GREEN; build-blocking gate proven by the injection test</done>
</task>

<task type="auto" id="20-D-02-07">
  <name>Task 7: scripts/eval-claim-extraction-kappa.ts — Cohen's kappa ship-gate</name>
  <read_first>
    - tests/golden-tickers/_claim_labels.json (100-claim set from Task 5)
    - src/lib/eval/cohens-kappa.ts (Task 1)
    - src/lib/eval/claim-extraction-regex.ts (Task 2)
    - src/lib/eval/claim-extraction-llm.ts (Task 3)
  </read_first>
  <action>
    A. Create `scripts/eval-claim-extraction-kappa.ts`:

    ```typescript
    // scripts/eval-claim-extraction-kappa.ts
    // Loads the 100-claim labeled set, runs BOTH regex + LLM extraction over
    // each source sentence, scores each method's binary classification
    // (is_claim true/false), computes Cohen's kappa between regex-method
    // and LLM-method predictions, and exits non-zero when kappa < 0.7.
    //
    // LLM-method defaults to using the committed snapshot at
    // tests/golden-tickers/_claim_labels.llm_snapshot.json so CI does not
    // burn tokens. Operators run with RUN_LLM_CLAIM_EXTRACTION=true to
    // refresh the snapshot (--snapshot flag writes the new snapshot file).

    import { readFileSync, writeFileSync } from 'node:fs';
    import { extractClaimsRegex } from '@/lib/eval/claim-extraction-regex';
    import { extractClaimsLLM } from '@/lib/eval/claim-extraction-llm';
    import { cohensKappa } from '@/lib/eval/cohens-kappa';

    const KAPPA_SHIP_GATE = 0.7;

    type Label = {
      label_id: string; ticker: string;
      section: import('@/lib/eval/citation-coverage.types').ReportSection;
      text: string; is_claim: boolean;
      labeler: string; labeled_at: string;
    };

    async function main() {
      const ci = process.argv.includes('--ci');
      const snapshot = process.argv.includes('--snapshot');
      const useLLM = process.env.RUN_LLM_CLAIM_EXTRACTION === 'true';

      const labels: Label[] = JSON.parse(readFileSync('tests/golden-tickers/_claim_labels.json','utf8'));
      const regexPred: boolean[] = [];
      const llmPred: boolean[] = [];
      const truth: boolean[] = [];

      const llmSnap: Record<string, boolean> = useLLM
        ? {}
        : JSON.parse(readFileSync('tests/golden-tickers/_claim_labels.llm_snapshot.json','utf8'));

      for (const l of labels) {
        const reg = extractClaimsRegex(l.text, l.section);
        regexPred.push(reg.length > 0);
        let llmIsClaim = false;
        if (useLLM) {
          const llmOut = await extractClaimsLLM(l.text, l.section, { ticker: l.ticker });
          llmIsClaim = llmOut.length > 0;
          llmSnap[l.label_id] = llmIsClaim;
        } else {
          llmIsClaim = llmSnap[l.label_id] ?? false;
        }
        llmPred.push(llmIsClaim);
        truth.push(l.is_claim);
      }

      const kappa = cohensKappa(regexPred, llmPred);
      const f1Regex = computeF1(regexPred, truth);
      const f1LLM = computeF1(llmPred, truth);

      console.log(`Cohen's kappa (regex vs LLM): ${kappa.toFixed(3)}`);
      console.log(`F1 regex vs truth: ${f1Regex.toFixed(3)}`);
      console.log(`F1 LLM vs truth: ${f1LLM.toFixed(3)}`);
      console.log(`Sample size: ${labels.length}`);

      if (snapshot && useLLM) {
        writeFileSync('tests/golden-tickers/_claim_labels.llm_snapshot.json',
          JSON.stringify(llmSnap, null, 2));
        console.log('Snapshot refreshed');
      }

      if (ci && kappa < KAPPA_SHIP_GATE) {
        console.error(`SHIP GATE FAIL: kappa=${kappa.toFixed(3)} < ${KAPPA_SHIP_GATE}`);
        process.exit(1);
      }
    }

    function computeF1(pred: boolean[], truth: boolean[]): number {
      let tp=0,fp=0,fn=0;
      for (let i=0;i<pred.length;i++) {
        if (pred[i] && truth[i]) tp++;
        else if (pred[i] && !truth[i]) fp++;
        else if (!pred[i] && truth[i]) fn++;
      }
      if (tp === 0) return 0;
      const prec = tp/(tp+fp); const rec = tp/(tp+fn);
      return 2*prec*rec/(prec+rec);
    }

    main().catch(e => { console.error(e); process.exit(2); });
    ```

    B. Add `package.json` scripts:
    - `"check-claim-extraction-kappa": "tsx scripts/eval-claim-extraction-kappa.ts --ci"`
    - `"refresh-llm-claim-snapshot": "RUN_LLM_CLAIM_EXTRACTION=true tsx scripts/eval-claim-extraction-kappa.ts --snapshot"`

    C. Operator runs `npm run refresh-llm-claim-snapshot` ONCE to populate `tests/golden-tickers/_claim_labels.llm_snapshot.json` so the committed snapshot is non-empty. Snapshot regenerates only when intentionally refreshed.

    D. Extend `.github/workflows/citation-coverage.yml` to run `npm run check-claim-extraction-kappa` (required for merge).
  </action>
  <acceptance_criteria>
    - `scripts/eval-claim-extraction-kappa.ts` exists
    - `package.json` contains `check-claim-extraction-kappa` + `refresh-llm-claim-snapshot` scripts
    - With a populated snapshot, `npm run check-claim-extraction-kappa` exits 0 (kappa ≥ 0.7) AND prints kappa, F1-regex, F1-LLM to stdout
    - Workflow `.github/workflows/citation-coverage.yml` runs both check scripts as required-for-merge
  </acceptance_criteria>
  <verify>
    <automated>npm run check-claim-extraction-kappa</automated>
  </verify>
  <done>Kappa script + ship-gate exit-code wiring + snapshot mechanism committed; CI job blocks merge on kappa &lt; 0.7</done>
</task>

<task type="auto" id="20-D-02-08">
  <name>Task 8: Weekly Vercel cron + /insights/citation-coverage page</name>
  <read_first>
    - vercel.json (existing crons — extend the crons array, do not replace)
    - src/lib/db.ts (database access pattern if persisting beyond fs)
    - src/app/insights/page.tsx (existing /insights layout — match the page-shell convention)
    - src/app/insights/components/PatternsTable.tsx (existing panel pattern to mirror)
  </read_first>
  <action>
    A. Create `src/app/api/cron/eval-citation-coverage/route.ts`:

    ```typescript
    // src/app/api/cron/eval-citation-coverage/route.ts
    import { NextResponse } from 'next/server';
    import { runEvalCitationCoverage } from '@/scripts/eval-citation-coverage';

    export const dynamic = 'force-dynamic';
    export const maxDuration = 300;

    export async function GET(request: Request) {
      const authHeader = request.headers.get('authorization');
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
      }
      try {
        const { perTicker } = await runEvalCitationCoverage({
          ci: false, useLLM: process.env.RUN_LLM_CLAIM_EXTRACTION === 'true', outDir: 'reports',
        });
        return NextResponse.json({ ok: true, tickers: Object.keys(perTicker) });
      } catch (e) {
        console.error('[cron:eval-citation-coverage] failed', e);
        return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
      }
    }
    ```

    B. Update `vercel.json` to add:
    ```json
    {
      "path": "/api/cron/eval-citation-coverage",
      "schedule": "0 9 * * 0"
    }
    ```
    appended to the existing `crons` array (do not replace).

    C. Create `src/app/insights/citation-coverage/page.tsx` — server-rendered, reads the newest `reports/citation-coverage-*.json` via fs.readdir + sort by mtime, hydrates the panel.

    D. Create `src/app/insights/citation-coverage/CitationCoveragePanel.tsx` — per-ticker × per-section tile grid. Color rules:
    - green (#16a34a-ish) when pct ≥ 80
    - amber when 60 ≤ pct < 80
    - red when pct < 60
    Tile click opens a side panel listing the unsupported claims for that (ticker, section).

    E. Playwright smoke test at `tests/e2e/citation-coverage-insights.spec.ts` (per the project's Playwright-required global instruction) — visits `/insights/citation-coverage`, takes a screenshot, asserts that the 8 ticker rows render and the legend strip is visible.
  </action>
  <acceptance_criteria>
    - `src/app/api/cron/eval-citation-coverage/route.ts` exists with Bearer CRON_SECRET check
    - `vercel.json` contains a cron entry for `/api/cron/eval-citation-coverage` with schedule `0 9 * * 0`
    - `src/app/insights/citation-coverage/page.tsx` + `CitationCoveragePanel.tsx` exist
    - `npx playwright test tests/e2e/citation-coverage-insights.spec.ts` exits 0 with screenshot artifact saved
    - Visiting `http://localhost:3000/insights/citation-coverage` (during `npm run dev`) renders the tile grid against the committed `reports/citation-coverage-*.json` baseline
  </acceptance_criteria>
  <verify>
    <automated>npx playwright test tests/e2e/citation-coverage-insights.spec.ts</automated>
  </verify>
  <done>Cron + page + tile component + Playwright smoke test GREEN; /insights/citation-coverage renders the per-ticker × per-section breakdown from the latest report</done>
</task>

<task type="auto" id="20-D-02-09">
  <name>Task 9: MODEL-CARD-citation-coverage.md + final integration sweep</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (S4 model-card requirement; S8/S9 numerical / failure-mode acceptance)
    - .planning/phases/20-real-sentiment-analysis/20-D-01-PLAN.md (MODEL-CARD-numeric-grounding.md as a template for tone + structure)
  </read_first>
  <action>
    A. Create `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-citation-coverage.md` per Mitchell 2019 covering:
    - **Intended use**: build-blocking audit of report claim → citation linkage on the 8 golden tickers + weekly /insights tile.
    - **Architecture**: hybrid regex + LLM-judge claim extraction; merge dedupes at cosine > 0.85; rule-A (±50 char anchor) + rule-B (≥0.5 keyword cosine) for claim → citation matching.
    - **Training data / labeled set**: 100-claim labeled set at tests/golden-tickers/_claim_labels.json — stratified across 8 tickers + 11 sections; ~70 true-claim / ~30 not-a-claim distribution.
    - **Evaluation metrics**: coverage_pct (overall ship-gate ≥80%), per_section (ship-gate ≥60% per populated section), Cohen's kappa regex-vs-LLM (ship-gate ≥0.7), per-method F1 vs ground truth (informational).
    - **Known failure modes**: (a) regex misses passive-voice claims — LLM-judge complements; (b) Rule B cosine match can over-credit common-vocabulary sentences — mitigation: stopword drop + rule ordering; (c) micro-cap and SPAC segments expected to hover at 80% due to sparse SourcePackage citations.
    - **Per-segment expectations**: AAPL/SPY/TSM target ≥90%; DKNG/SOFI target ≥85%; GME/DWAC/microcap target ≥80%.
    - **Retrain cadence**: labeled set expansion in 20-D-04 (golden-ticker curation) + monthly rotating-micro-cap entries.
    - **Out of scope**: numeric grounding (20-D-01), per-claim NLI verification (20-D-03), URL liveness (handled by 19-C-07 / 20-D-03 NLI verifier).

    B. Run `npm run check-prompts` to ensure the eval-claim-extraction-v1 entry is captured in the 20-Z-04 golden snapshot. Update the snapshot file once if needed.

    C. Run the full validation suite locally:
    ```bash
    npm test
    npm run test:integration
    npm run check-citation-coverage
    npm run check-claim-extraction-kappa
    npm run check-prompts
    npm run test:e2e -- tests/e2e/citation-coverage-insights.spec.ts
    ```
    All must exit 0. Any non-zero exit blocks the plan from being marked done.

    D. Forward-reference 20-Z-03 in a stdout TODO in scripts/eval-citation-coverage.ts: "// TODO 20-Z-03: emit cost-per-call + latency to ProviderCallLog once telemetry wrapper lands."
  </action>
  <acceptance_criteria>
    - `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-citation-coverage.md` exists with the Mitchell-2019 sections above
    - All checks above exit 0 locally
    - 20-Z-04 prompt-registry golden snapshot includes the eval-claim-extraction-v1 entry
    - TODO comment for 20-Z-03 telemetry forward-reference present in scripts/eval-citation-coverage.ts
  </acceptance_criteria>
  <verify>
    <automated>npm test && npm run test:integration && npm run check-citation-coverage && npm run check-claim-extraction-kappa && npm run check-prompts</automated>
  </verify>
  <done>Model card committed; full integration sweep GREEN; 20-Z-03 telemetry forward-reference filed; plan ready for merge</done>
</task>

</tasks>

<verification>

Phase-level numerical verification — each must hold on `main` post-commit:

1. `npm run check-citation-coverage` exits 0 on the 8 frozen golden-ticker reports (regex-only path; LLM-augmented path opt-in via RUN_LLM_CLAIM_EXTRACTION=true)
2. Every per-ticker `coverage_pct` is ≥ 80 (S8 numerical gate)
3. Every populated `per_section[s]` is ≥ 60 (S9 failure-mode coverage)
4. `npm run check-claim-extraction-kappa` exits 0 with kappa ≥ 0.7 between regex and LLM predictions on the 100-claim labeled set
5. Synthetic-injection test FAILS the build when 3 unsupported claims are injected into the AAPL report (proves the gate is real, not vacuously passing)
6. ≥10 unit tests in `tests/eval/cohens-kappa.unit.test.ts` + `tests/eval/claim-merge.unit.test.ts` all green
7. ≥6 unit tests in `tests/eval/claim-extraction-regex.unit.test.ts` all green
8. ≥6 unit tests in `tests/eval/claim-extraction-llm.unit.test.ts` all green (Anthropic SDK mocked)
9. ≥8 unit tests in `tests/eval/citation-coverage.unit.test.ts` all green (rule-A, rule-B, dedupe, per-section, warn-on-empty)
10. `tests/integration/citation-coverage.regression.test.ts` + `tests/integration/citation-coverage.synthetic-injection.test.ts` both green
11. `tests/golden-tickers/_claim_labels.json` parses with ≥100 entries; stratification roundtrip test green
12. eval-claim-extraction-v1 prompt registered at `src/lib/prompts/_v1/eval-claim-extraction-v1.md`; 20-Z-04 golden-snapshot test passes (drift catches v1 edit without v2 bump)
13. Weekly cron `/api/cron/eval-citation-coverage` registered in vercel.json with schedule `0 9 * * 0`
14. `/insights/citation-coverage` page renders the per-ticker × per-section tile grid; Playwright e2e screenshot saved
15. MODEL-CARD-citation-coverage.md committed under .planning/phases/20-real-sentiment-analysis/ per S4
16. .github/workflows/citation-coverage.yml is required-for-merge in the CI status checks

</verification>

<success_criteria>

Plan 20-D-02 is complete when:
- [ ] All 9 tasks DONE with their `<verify>` automated commands green
- [ ] Coverage ≥ 80% on every golden ticker; per-section ≥ 60% on every populated section
- [ ] Kappa ≥ 0.7 between regex-method and LLM-method on the 100-claim labeled set
- [ ] Synthetic-injection test proves the CI gate fails on fabricated unsupported claims
- [ ] eval-claim-extraction-v1 prompt registered in 20-Z-04; golden-snapshot passes
- [ ] /insights/citation-coverage renders the tile grid + click-to-expand unsupported claims
- [ ] Weekly Vercel cron scheduled (`0 9 * * 0`) with CRON_SECRET auth
- [ ] MODEL-CARD-citation-coverage.md per S4 committed
- [ ] No production code path imports src/lib/eval/citation-coverage.ts (grep verifies)
- [ ] Forward-reference TODO for 20-Z-03 telemetry filed in scripts/eval-citation-coverage.ts

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-D-02-SUMMARY.md` capturing:
- The committed coverage_pct + per_section numbers for each of the 8 golden tickers
- The achieved Cohen's kappa value on the 100-claim labeled set
- Per-method F1 (regex vs ground truth, LLM vs ground truth)
- Any per-segment limitation that the model card documented
- Forward dependencies (20-Z-03 telemetry; 20-D-04 expanded golden set)
</output>
