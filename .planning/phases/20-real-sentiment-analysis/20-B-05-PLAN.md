---
phase: 20
plan: 20-B-05
wave: B
type: execute
depends_on: ['20-B-01']
files_modified:
  - src/lib/sentiment/per-aspect-aggregate.ts
  - src/lib/sentiment/__tests__/per-aspect-aggregate.unit.test.ts
  - src/lib/types.ts
  - src/lib/gemini-analysis.ts
  - src/lib/research-brief.ts
  - src/lib/data/source-package.ts
  - src/lib/features.ts
  - src/components/PerAspectChips.tsx
  - src/components/__tests__/PerAspectChips.test.tsx
  - src/components/ResearchReport.tsx
  - scripts/eval-aspect-kappa.ts
  - src/app/api/cron/aspect-kappa-monitor/route.ts
  - tests/golden-tickers/_aspect_labels.json
  - tests/integration/per-aspect-aggregate.integration.test.ts
  - tests/e2e/per-aspect-chips.spec.ts
  - vercel.json
  - package.json
  - HYPERPARAMETERS.md
  - docs/cards/MODEL-CARD-per-aspect-aggregate.md
  - docs/runbooks/aspect-label-curation.md
autonomous: false
requirements: []
shadow_required: true
shadow_skip_reason: ""
shadow_cutover_criteria:
  - "Latest scripts/eval-aspect-kappa.ts run on tests/golden-tickers/_aspect_labels.json (≥50 docs) reports Cohen's kappa ≥ 0.6 (κ ≥ 0.6 — measured, NOT asserted)"
  - "UI snapshot tests in src/components/__tests__/PerAspectChips.test.tsx pass on the four golden tickers AAPL / GME / SPY / TSM with the per-aspect chip stack rendered (PASS on at least one snapshot per ticker)"
  - "Playwright e2e tests/e2e/per-aspect-chips.spec.ts confirms the literal string '0%' is NOT in the rendered chip stack when n_docs < 3 for any aspect (i.e., '—' renders instead) on a fixture with two empty aspects"
  - "research-brief.ts prompt assembly contains the literal phrase 'Per-aspect sentiment' AND lists at least one aspect-tagged percentage on a fixture ticker with ≥1 aspect-tagged doc"
hard_cleanup_gate: true
must_haves:
  truths:
    - "AnalysisResult schema exposes per_aspect_sentiment: Array<{ aspect: AspectTag; bull_pct: number | null; n_docs: number; confidence_mean: number }>"
    - "aggregateByAspect groups per-doc results by AspectTag (overlap allowed — a doc with two aspects contributes to BOTH per CONTEXT.md line 113 'Inter-aspect overlap allowed')"
    - "aggregateByAspect returns one entry per AspectTag in the fixed taxonomy (earnings, guidance, regulatory, M&A, macro, product, management) — aspects with n_docs == 0 still appear with bull_pct: null"
    - "betaSmoothedBullPct uses the same Beta(α + bull_count, β + bear_count) posterior-mean formula from post-Phase-19 with α = β = 5 (Cookson-style weak prior)"
    - "betaSmoothedBullPct returns null when scores.length === 0 OR n_docs < 3 (insufficient signal sentinel — empty aspect renders '—' not '0%')"
    - "research-brief.ts prompt rendering replaces the single global 'X% bullish' line with a per-aspect breakdown when per_document_sentiment is present; falls back to global when no aspect-tagged signal"
    - "PerAspectChips component renders one chip per aspect; renders the literal string '—' (em-dash) when bull_pct is null; tooltip explains aspect"
    - "scripts/eval-aspect-kappa.ts loads ≥50 human-labeled docs from tests/golden-tickers/_aspect_labels.json, runs the 20-B-01 per-doc classifier, computes Cohen's kappa per aspect AND weighted mean across aspects, writes /tmp/aspect-kappa-{date}.json"
    - "Cohen's kappa weighted-mean ≥ 0.6 on the 50-doc set is the SHIP GATE (measured) for cutover from shadow → on"
    - "Monthly cron /api/cron/aspect-kappa-monitor re-runs the κ eval and emits a non-zero exit / 5xx response when κ < 0.6 (alerts so operator can investigate before silent drift accumulates)"
    - "Curation runbook docs/runbooks/aspect-label-curation.md documents how an operator assembles the 50-doc human-labeled set; tests/golden-tickers/_aspect_labels.json carries last_updated ISO date and CI warns if older than 90 days"
    - "Model card docs/cards/MODEL-CARD-per-aspect-aggregate.md committed per 20-Z-02 template (Mitchell 2019 sections); cites Cookson & Engelberg as motivation for separating aspect-level sentiment from global"
    - "FEATURE_PER_ASPECT_AGGREGATE flag (off | shadow | on) added to src/lib/features.ts; default 'shadow'; off branch returns per_aspect_sentiment: []"
  artifacts:
    - path: "src/lib/sentiment/per-aspect-aggregate.ts"
      provides: "aggregateByAspect + betaSmoothedBullPct + ASPECT_TAXONOMY constant export; pure functions, no DB"
      contains: "export function aggregateByAspect"
    - path: "src/lib/sentiment/__tests__/per-aspect-aggregate.unit.test.ts"
      provides: "≥9 unit tests — empty input, single aspect, multi-aspect, overlap, null-fallback, Beta-smoothing canonical, taxonomy completeness"
      contains: "betaSmoothedBullPct"
    - path: "src/lib/types.ts"
      provides: "AspectTag union (re-exported from 20-B-01) + PerAspectSentimentEntry interface + per_aspect_sentiment field on AnalysisResult"
      contains: "per_aspect_sentiment"
    - path: "src/lib/gemini-analysis.ts"
      provides: "AnalysisResultSchema extended with per_aspect_sentiment z.array(...).optional() so Zod accepts shadow-mode runs"
      contains: "per_aspect_sentiment: z.array"
    - path: "src/lib/research-brief.ts"
      provides: "renderPerAspectBlock(perAspect): string helper + insertion into the prompt body BEFORE the 'sentiment_intelligence_summary' instruction"
      contains: "Per-aspect sentiment"
    - path: "src/lib/data/source-package.ts"
      provides: "Wires per_doc_sentiment from 20-B-01 → aggregateByAspect → AnalysisResult.per_aspect_sentiment under the FEATURE_PER_ASPECT_AGGREGATE flag"
      contains: "aggregateByAspect"
    - path: "src/lib/features.ts"
      provides: "FEATURE_PER_ASPECT_AGGREGATE: 'off' | 'shadow' | 'on' flag with shadow default"
      contains: "FEATURE_PER_ASPECT_AGGREGATE"
    - path: "src/components/PerAspectChips.tsx"
      provides: "Per-aspect chip stack component — reuses existing chip CSS pattern from ResearchReport.tsx Sentiment Intelligence card; renders '—' for null bull_pct"
      contains: "PerAspectChips"
    - path: "src/components/__tests__/PerAspectChips.test.tsx"
      provides: "React Testing Library snapshot tests on the four golden tickers (AAPL/GME/SPY/TSM); asserts '—' renders for null aspects"
      contains: "AAPL"
    - path: "src/components/ResearchReport.tsx"
      provides: "Mounts <PerAspectChips/> inside the Sentiment Intelligence card BELOW the existing per-source breakdown row; FALLS BACK to the existing global aggregated_bull_pct chip when per_aspect_sentiment is empty (graceful degradation)"
      contains: "PerAspectChips"
    - path: "scripts/eval-aspect-kappa.ts"
      provides: "Cohen's kappa eval harness — loads tests/golden-tickers/_aspect_labels.json, runs the 20-B-01 classifier on each doc, computes per-aspect κ + weighted-mean κ; writes /tmp/aspect-kappa-{ISO-date}.json + prints PASS/FAIL on κ ≥ 0.6 ship gate"
      contains: "cohenKappa"
    - path: "src/app/api/cron/aspect-kappa-monitor/route.ts"
      provides: "Monthly cron — invokes the eval-aspect-kappa script; returns 5xx + structured error JSON when κ < 0.6 so the operator's logs/alerts catch drift; CRON_SECRET-gated"
      contains: "Bearer ${process.env.CRON_SECRET}"
    - path: "tests/golden-tickers/_aspect_labels.json"
      provides: "Human-labeled 50-doc set: { last_updated: ISO, docs: Array<{ doc_id, raw_text, ticker, source, human_aspects: AspectTag[] }> }"
      contains: "last_updated"
    - path: "tests/integration/per-aspect-aggregate.integration.test.ts"
      provides: "Live end-to-end — fixture SourcePackage with 10 per-doc results across 4 aspects → assembleSourcePackage → AnalysisResult.per_aspect_sentiment shape verified; research-brief.ts prompt grep-asserted to contain aspect breakdown"
      contains: "per_aspect_sentiment"
    - path: "tests/e2e/per-aspect-chips.spec.ts"
      provides: "Playwright e2e on /research/AAPL — asserts chip stack visible; on a fixture with 2 empty aspects asserts '—' visible AND '0%' NOT visible (the empty-aspect must NOT render '0%')"
      contains: "0%"
    - path: "vercel.json"
      provides: "Monthly cron entry { path: '/api/cron/aspect-kappa-monitor', schedule: '0 7 1 * *' }"
      contains: "/api/cron/aspect-kappa-monitor"
    - path: "package.json"
      provides: "Script entry 'eval-aspect-kappa': 'tsx scripts/eval-aspect-kappa.ts'"
      contains: "eval-aspect-kappa"
    - path: "HYPERPARAMETERS.md"
      provides: "Documents Beta-prior α = β = 5 (post-Phase-19 carry-over) + KAPPA_SHIP_GATE = 0.6 + N_DOCS_MIN = 3 (insufficient-signal sentinel)"
      contains: "KAPPA_SHIP_GATE"
    - path: "docs/cards/MODEL-CARD-per-aspect-aggregate.md"
      provides: "Mitchell-2019 model card — references Cookson/Engelberg as the 'per-aspect avoids global-mean averaging-out' motivation; documents 50-doc kappa eval procedure + 6-month re-evaluation cadence"
      contains: "Cookson"
    - path: "docs/runbooks/aspect-label-curation.md"
      provides: "Runbook — how an operator picks 50 diverse docs from production SourcePackages, manually tags aspects, and commits to tests/golden-tickers/_aspect_labels.json with last_updated"
      contains: "last_updated"
  key_links:
    - from: "src/lib/data/source-package.ts (after 20-B-01 per_doc_sentiment populated)"
      to: "src/lib/sentiment/per-aspect-aggregate.ts aggregateByAspect()"
      via: "function call: aggregateByAspect(per_doc_results) under FEATURE_PER_ASPECT_AGGREGATE flag"
      pattern: "aggregateByAspect\\("
    - from: "src/lib/research-brief.ts prompt body"
      to: "AnalysisResult.per_aspect_sentiment"
      via: "renderPerAspectBlock(perAspect) — replaces single global bull% line with per-aspect breakdown when ≥1 entry has bull_pct != null"
      pattern: "Per-aspect sentiment"
    - from: "src/components/ResearchReport.tsx Sentiment Intelligence card"
      to: "src/components/PerAspectChips.tsx"
      via: "<PerAspectChips entries={analysis.per_aspect_sentiment}/> conditional on entries.length > 0"
      pattern: "PerAspectChips"
    - from: "src/app/api/cron/aspect-kappa-monitor/route.ts"
      to: "scripts/eval-aspect-kappa.ts runAspectKappaEval()"
      via: "exported runAspectKappaEval() function — same pattern as 20-A-05 Task 6 cron-imports-script boundary"
      pattern: "runAspectKappaEval"
    - from: "vercel.json crons[]"
      to: "src/app/api/cron/aspect-kappa-monitor/route.ts"
      via: "monthly schedule '0 7 1 * *' (off-peak, distinct from 20-A-05 06:00 entry)"
      pattern: "/api/cron/aspect-kappa-monitor"
---

# Plan 20-B-05: Per-aspect headline numbers — chip stack + Cohen's kappa ship gate + research-brief prompt aspect breakdown

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for ONE step: the 50-doc human-labeled curation of `tests/golden-tickers/_aspect_labels.json` (Task 8 — operator follows the curation runbook in Task 9 to physically read 50 production docs and tag aspects; the 50-doc set CANNOT be auto-generated without losing the human-label property that Cohen's kappa requires). All other tasks are autonomous: pure functions, schema extension, prompt rendering, UI component, eval harness, cron route, snapshot tests, integration test, model card. After the operator commits the curated label set, the κ ship gate runs autonomously and the shadow → on cutover is itself operator-gated by the four numerical criteria in `shadow_cutover_criteria` above.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. **Shadow lifecycle graduated**: `FEATURE_PER_ASPECT_AGGREGATE` flag flipped from `'shadow'` → `'on'` ONLY after the four numerical criteria in `shadow_cutover_criteria` are met. Once `'on'`, the `'shadow'` branch and the flag itself are deleted in a follow-up commit (S3 — flag-removed phase).
2. **No old code deleted yet** at this plan's commit (the existing global `aggregated_bull_pct` chip path keeps emitting; new field is additive on AnalysisResult). Flag-removal cleanup happens in the follow-up commit after cutover.
3. **Feature flag introduced**: `FEATURE_PER_ASPECT_AGGREGATE: 'off' | 'shadow' | 'on'` in `src/lib/features.ts`. Defaults to `'shadow'`.
4. `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-commit.
5. **κ Ship Gate**: `npm run eval-aspect-kappa` reports Cohen's weighted-mean κ ≥ 0.6 on `tests/golden-tickers/_aspect_labels.json` (≥50 docs). κ is **measured by the script and printed PASS/FAIL** — it is NOT asserted in the plan or hard-coded.
6. **UI snapshot gate**: `npm test -- PerAspectChips.test.tsx` passes on the four golden tickers AAPL / GME / SPY / TSM with chip-stack snapshot OR explicit `'—'` for empty-aspect tickers (e.g. SPY likely has zero earnings docs).
7. **Empty-aspect rendering gate**: `npm run test:e2e -- per-aspect-chips.spec.ts` asserts no `'0%'` literal is in the chip stack when `n_docs < 3`; `'—'` is rendered instead. Visible Playwright screenshot stored at `tests/e2e/screenshots/per-aspect-chips.png`.
8. **Model card committed**: `docs/cards/MODEL-CARD-per-aspect-aggregate.md` exists, references Cookson/Engelberg as the per-aspect motivation, documents the 50-doc κ eval procedure, and has 6-month re-evaluation cadence. Recognized by `scripts/check-model-cards.ts` (20-Z-02).
9. **Curation runbook committed**: `docs/runbooks/aspect-label-curation.md` documents the 50-doc labeling workflow; `tests/golden-tickers/_aspect_labels.json` carries `last_updated` ISO date.
10. **CI staleness warn**: `tests/integration/per-aspect-aggregate.integration.test.ts` includes a check that `_aspect_labels.json.last_updated` is within 90 days; warning (NOT failure) when stale, so the operator gets nudged to recurate.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — The Beta prior `α = β = 5` is the post-Phase-19 carry-over (literature default — Cookson/Engelberg-style weak symmetric prior). The κ ≥ 0.6 ship gate value is the published Landis & Koch (1977) "substantial agreement" threshold cited in the inter-rater reliability literature; recorded in HYPERPARAMETERS.md alongside the citation. `N_DOCS_MIN = 3` is the minimum-signal threshold matching the existing `sentiment_source_count >= 2` Cookson-style minimum from 20-A-05; documented in HYPERPARAMETERS.md.
- **S3 (shadow lifecycle)** — `FEATURE_PER_ASPECT_AGGREGATE` flag (off|shadow|on); cutover gated on the four numerical criteria in `shadow_cutover_criteria`. Existing global chip remains until cutover; per-aspect chips render IN ADDITION to (not instead of) the global chip during shadow.
- **S4 (model card per artifact)** — `docs/cards/MODEL-CARD-per-aspect-aggregate.md` per 20-Z-02 template covers: training data (50-doc human-labeled set + production SourcePackages), evaluation metric (Cohen's weighted-mean κ on the 50-doc set), intended use (per-aspect chip stack + research-brief prompt aspect breakdown), out-of-distribution (single-aspect tickers / aspects with n < 3 docs render '—'), known failure modes (50-doc set drift; aspect tag inconsistency across runs), retrain cadence (monthly κ monitor + 6-month full curation refresh).
- **S7 (threat model)** — five plan-level threats T-20-B-05-{01..05} below.
- **S8 (numerical acceptance)** — every DONE criterion in `<verification>` is a grep / κ value / snapshot diff / Playwright assertion / Zod field check. Zero adjectives.

</universal_preamble>

<objective>
Replace the single global `aggregated_bull_pct` chip on the Sentiment Intelligence card with a per-aspect chip stack (Earnings 75% · Guidance 50% · Regulatory 30% · M&A —) so the report surfaces sentiment by event type rather than averaging-out opposite signals (CONTEXT.md line 56-57 — TABFSA / aspect-based decomposition; Cookson/Engelberg motivation: "sentence-level polarity averages out opposite signals — bullish-on-product + bearish-on-guidance → neutral, which is wrong"). Compute per-aspect bull% via the same Beta-smoothed weighted-mean formula from post-Phase-19 (α = β = 5), grouped by 20-B-01's AspectTag taxonomy (overlap allowed — a doc tagged with both 'earnings' and 'guidance' contributes to BOTH per CONTEXT.md line 113 "Inter-aspect overlap allowed"). Surface aspects in the research-brief.ts prompt so Gemini can reason aspect-by-aspect. Empty-aspect handling: render the em-dash `'—'` instead of `'0%'` (the latter would falsely imply zero bullishness rather than zero data). Ship gate is **measured** Cohen's kappa ≥ 0.6 between the Gemini classifier's aspect tags and a 50-doc human-labeled set — measured by `scripts/eval-aspect-kappa.ts`, NOT asserted.

Purpose: Per CONTEXT.md line 113, 20-B-01 gives every document a `{polarity, confidence, aspects: AspectTag[]}` block. Aggregating those polarities into a single `aggregated_bull_pct` averages out the directional signal: a positive earnings beat coexisting with a negative guidance cut → ~50% global bullishness (signal lost). Per-aspect aggregation preserves the directional split. Inter-aspect overlap is INTENTIONAL: a doc with two aspects is two contributions, one per aspect — this is documented in T-20-B-05-02 below so reviewers don't read it as double-counting.

Output:
- 1 new pure-functions module (`src/lib/sentiment/per-aspect-aggregate.ts`, ~80 LOC)
- 1 nullable field on `AnalysisResult.per_aspect_sentiment` + Zod schema extension
- 1 prompt-rendering helper in `research-brief.ts`
- 1 React component (`src/components/PerAspectChips.tsx`) + RTL snapshot tests on 4 golden tickers
- 1 eval harness (`scripts/eval-aspect-kappa.ts`) + 1 cron route (`/api/cron/aspect-kappa-monitor`)
- 1 50-doc human-labeled set (`tests/golden-tickers/_aspect_labels.json`) + curation runbook
- 4 test files (unit, integration, e2e Playwright, RTL snapshots)
- 1 model card per 20-Z-02
- 1 cron entry in `vercel.json`
- 1 feature flag in `src/lib/features.ts`
- 1 HYPERPARAMETERS.md entry

</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-B-01-PLAN.md
@CLAUDE.md
@src/lib/types.ts
@src/lib/gemini-analysis.ts
@src/lib/research-brief.ts
@src/lib/sentiment/aggregator.ts
@src/lib/data/source-package.ts
@src/lib/features.ts
@src/components/ResearchReport.tsx
@vercel.json
@.planning/phases/20-real-sentiment-analysis/20-A-05-PLAN.md

<interfaces>

```typescript
// src/lib/sentiment/per-aspect-aggregate.ts — NEW (~80 LOC, pure functions)

import type { AspectTag } from '@/lib/types'; // re-exported from 20-B-01

/**
 * Fixed aspect taxonomy from 20-B-01 (CONTEXT.md line 113).
 * NEVER expand without updating the 50-doc curation set + κ eval.
 */
export const ASPECT_TAXONOMY: readonly AspectTag[] = [
  'earnings', 'guidance', 'regulatory', 'M&A', 'macro', 'product', 'management',
] as const;

/**
 * Per-doc result from 20-B-01's Gemini per-document classification pass.
 * polarity ∈ [-1, +1] (negative = bearish, positive = bullish, 0 = neutral).
 * confidence ∈ [0, 1].
 * aspects can carry multiple tags — overlap is INTENTIONAL per T-20-B-05-02.
 */
export interface PerDocResult {
  doc_id: string;
  polarity: number;      // ∈ [-1, +1]
  confidence: number;    // ∈ [0, 1] — used as the weight in the Beta smoothing
  aspects: AspectTag[];  // 20-B-01's per-doc aspect classification
}

/**
 * Per-aspect aggregate output, one entry per AspectTag in ASPECT_TAXONOMY.
 * bull_pct == null when n_docs < N_DOCS_MIN (insufficient signal sentinel —
 * UI renders '—' instead of '0%' per T-20-B-05-03).
 */
export interface PerAspectResult {
  aspect: AspectTag;
  bull_pct: number | null;  // ∈ [0, 100] when non-null; null = insufficient signal
  n_docs: number;            // count of docs that carry this aspect tag
  confidence_mean: number;   // mean confidence of contributing docs (0 when n_docs == 0)
}

/** N_DOCS_MIN = 3 — fewer than 3 docs ⇒ insufficient signal ⇒ bull_pct = null. */
export const N_DOCS_MIN: number; // = 3

/** Beta prior strength α = β = 5 — post-Phase-19 carry-over (Cookson-style weak symmetric prior). */
export const BETA_ALPHA: number; // = 5
export const BETA_BETA: number;  // = 5

/**
 * Beta-smoothed weighted bull% — same formula as post-Phase-19 multi-source aggregator.
 *
 *   For each score: bull_count_contribution = weight * max(0, polarity)
 *                   bear_count_contribution = weight * max(0, -polarity)
 *   posterior_mean = (α + Σ bull) / (α + β + Σ bull + Σ bear)
 *   bull_pct       = posterior_mean * 100
 *
 * Returns null when scores.length === 0 (caller should also gate on N_DOCS_MIN).
 *
 * @param scores per-doc polarity + weight (weight = confidence from 20-B-01)
 * @param alpha  Beta prior bull-side pseudocount (default BETA_ALPHA = 5)
 * @param beta   Beta prior bear-side pseudocount (default BETA_BETA = 5)
 */
export function betaSmoothedBullPct(
  scores: { polarity: number; weight: number }[],
  alpha?: number,
  beta?: number,
): number | null;

/**
 * Group per-doc results by AspectTag (overlap allowed) and compute per-aspect
 * Beta-smoothed bull%. Returns one entry per AspectTag in ASPECT_TAXONOMY,
 * even when n_docs == 0 (entry has bull_pct: null, n_docs: 0).
 *
 * Inter-aspect overlap is INTENTIONAL per CONTEXT.md line 113 — a doc with two
 * aspects contributes to BOTH per-aspect aggregates. This is NOT double-counting;
 * it is the correct representation of multi-aspect docs (T-20-B-05-02 mitigation).
 */
export function aggregateByAspect(perDocResults: PerDocResult[]): PerAspectResult[];
```

```typescript
// src/lib/types.ts — ADDITIVE on AnalysisResult

// Re-export AspectTag from 20-B-01 (the union literal lives in 20-B-01's PLAN; for this
// plan we assume it is `'earnings' | 'guidance' | 'regulatory' | 'M&A' | 'macro' | 'product' | 'management'`).
export type AspectTag =
  | 'earnings' | 'guidance' | 'regulatory' | 'M&A'
  | 'macro' | 'product' | 'management';

export interface PerAspectSentimentEntry {
  aspect: AspectTag;
  bull_pct: number | null;  // null ⇒ insufficient signal (n_docs < 3)
  n_docs: number;
  confidence_mean: number;
}

// Append to existing AnalysisResult interface:
//   per_aspect_sentiment?: PerAspectSentimentEntry[];
// Optional/nullable for back-compat with reports persisted before this field landed.
```

```typescript
// src/lib/gemini-analysis.ts — Zod schema delta on AnalysisResultSchema

// Append to AnalysisResultSchema z.object({ ... }):
per_aspect_sentiment: z.array(z.object({
  aspect: z.enum(['earnings', 'guidance', 'regulatory', 'M&A', 'macro', 'product', 'management']),
  bull_pct: z.number().min(0).max(100).nullable(),
  n_docs: z.number().int().nonnegative(),
  confidence_mean: z.number().min(0).max(1),
})).optional(),
```

```typescript
// src/lib/research-brief.ts — NEW helper + insertion site

/**
 * Render the per-aspect breakdown block for the Gemini prompt.
 * Replaces the existing single global bull% line when per_aspect is non-empty
 * AND ≥1 entry has bull_pct != null. Falls back to the existing global line
 * (current research-brief code) when per_aspect is empty or all-null.
 *
 * Output format example:
 *   Per-aspect sentiment:
 *     Earnings: 75% bullish (n=12)
 *     Guidance: 50% (n=4)
 *     Regulatory: insufficient data
 *     M&A: insufficient data
 *
 * (Aspects with bull_pct == null render the literal "insufficient data".)
 */
export function renderPerAspectBlock(perAspect: PerAspectSentimentEntry[]): string;
```

```tsx
// src/components/PerAspectChips.tsx — NEW (~50 LOC)

import type { PerAspectSentimentEntry } from '@/lib/types';

export interface PerAspectChipsProps {
  entries: PerAspectSentimentEntry[];
}

/**
 * Stack of per-aspect bull% chips. Renders one chip per aspect.
 * Empty aspect (bull_pct == null OR n_docs < 3) renders '—' (em-dash) — NOT '0%'.
 * Tooltip on each chip explains the aspect (e.g. "Earnings: sentiment from earnings-related documents").
 *
 * Reuses the existing chip CSS from ResearchReport.tsx Sentiment Intelligence card
 * (the small uppercase-tracked pill at lines 658-687) — same Tailwind classes,
 * different color per aspect for visual scanability.
 */
export function PerAspectChips({ entries }: PerAspectChipsProps): JSX.Element;
```

```typescript
// scripts/eval-aspect-kappa.ts — NEW

/**
 * Cohen's kappa for inter-rater agreement between human-labeled aspects and
 * the 20-B-01 classifier's aspects, on the 50-doc human-labeled set.
 *
 * Per-aspect κ:
 *   For each AspectTag a in ASPECT_TAXONOMY:
 *     For each doc d in the labeled set:
 *       human(d, a)     = a ∈ d.human_aspects ? 1 : 0
 *       classifier(d, a) = a ∈ classifier(d).aspects ? 1 : 0
 *     κ_a = cohenKappa(human_vector, classifier_vector)
 *   weighted_mean_κ = Σ_a (n_human_positive_a * κ_a) / Σ_a n_human_positive_a
 *
 * Cohen's kappa formula (Cohen 1960; cited per scikit-learn cohen_kappa_score
 * semantics — symmetric, unweighted):
 *   κ = (p_o - p_e) / (1 - p_e)
 *   where p_o = observed agreement rate, p_e = expected agreement by chance
 *
 * Output: writes /tmp/aspect-kappa-{ISO-date}.json with per-aspect κ + weighted-mean κ +
 * confusion matrices + n_docs. Prints PASS to stdout if weighted-mean κ ≥ 0.6, else FAIL.
 *
 * Exported for cron import:
 */
export async function runAspectKappaEval(): Promise<{
  weighted_mean_kappa: number;
  per_aspect_kappa: Record<AspectTag, number>;
  n_docs: number;
  passed: boolean; // weighted_mean_kappa >= 0.6
}>;

/** Pure helper, exported for unit testing. */
export function cohenKappa(rater1: (0|1)[], rater2: (0|1)[]): number;
```

```json
// tests/golden-tickers/_aspect_labels.json — NEW (curated by operator per Task 9 runbook)

{
  "last_updated": "2026-05-XX",
  "n_docs": 50,
  "docs": [
    {
      "doc_id": "AAPL-2026-Q1-earnings-001",
      "ticker": "AAPL",
      "source": "news",
      "raw_text": "Apple reported Q1 EPS of $2.40, beating consensus...",
      "human_aspects": ["earnings", "guidance"]
    }
    // ... 49 more docs spanning all 7 AspectTag values
  ]
}
```

```typescript
// src/app/api/cron/aspect-kappa-monitor/route.ts — NEW

import { runAspectKappaEval } from '@/../scripts/eval-aspect-kappa';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const result = await runAspectKappaEval();
  if (!result.passed) {
    return Response.json(
      { ok: false, alert: `aspect-κ regression: ${result.weighted_mean_kappa.toFixed(3)} < 0.6`, ...result },
      { status: 500 }, // 5xx triggers Vercel cron alerting
    );
  }
  return Response.json({ ok: true, ...result });
}
```

</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| 20-B-01 classifier → per-aspect aggregator | Per-doc `aspects: AspectTag[]` come from a versioned Gemini prompt; drift in the classifier (different aspects assigned to same doc across runs) silently lowers κ |
| Operator curated labels → eval harness | The 50-doc human-labeled set is the ground truth for κ; if the curation drifts (operator stops updating, label distribution skews) the κ measurement loses meaning |
| Per-aspect entries → Gemini prompt | `renderPerAspectBlock` injects aspect bull% into the prompt; Gemini may misinterpret '—' or "insufficient data" as a bearish signal |
| Per-aspect entries → UI chips | Empty aspect rendering as '0%' would falsely communicate zero bullishness rather than zero data |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-B-05-01 | (T) Tampering / drift | Aspect tag inconsistency across runs (low κ over time) — Gemini prompt drift, model upgrades, or temperature noise can silently shift aspect classification | mitigate | (a) 20-Z-04 prompt registry pins the 20-B-01 prompt at a versioned ID; any prompt change forces a version bump + κ re-measurement. (b) Monthly cron `/api/cron/aspect-kappa-monitor` re-runs the κ eval; returns 5xx + alert when weighted-mean κ < 0.6 so the operator catches drift before it ships. (c) Re-curation cadence in MODEL-CARD: 6-month full refresh of the 50-doc set. |
| T-20-B-05-02 | (R) Repudiation / misinterpretation | Reviewer reads the inter-aspect overlap (a doc tagged 'earnings'+'guidance' contributing to BOTH aggregates) as double-counting and files a "duplicate-counting bug" | mitigate | This is INTENTIONAL per CONTEXT.md line 113 ("Inter-aspect overlap allowed") — a multi-aspect doc legitimately carries information about multiple aspects and should contribute to each. (a) Inline JSDoc on `aggregateByAspect` documents this explicitly with the CONTEXT.md citation. (b) Unit test case `'doc with two aspects contributes to both'` is named exactly that so the test output makes the intent obvious. (c) MODEL-CARD-per-aspect-aggregate.md "Caveats" section explains the design choice + cites CONTEXT.md line 113. |
| T-20-B-05-03 | (I) Information disclosure / misleading UI | Empty-aspect rendering as '0%' would falsely communicate "zero bullishness" rather than "zero data" — a user could mistake a no-data aspect for a strong bear signal | mitigate | (a) `betaSmoothedBullPct` returns `null` (NOT 0) when `scores.length === 0` OR the caller's `n_docs < N_DOCS_MIN`. (b) `aggregateByAspect` emits `bull_pct: null` for under-threshold aspects. (c) `PerAspectChips` renders the literal `'—'` (em-dash) when `bull_pct == null`. (d) Playwright e2e asserts NO `'0%'` literal is present in the chip stack when `n_docs < 3` for any aspect. (e) Research-brief prompt renders `"insufficient data"` (not `"0% bullish"`) for null aspects. |
| T-20-B-05-04 | (D) Denial of UX / overflow | Per-aspect chip stack overflows on small screens — 7 chips × ~80px wide = 560px > 320px mobile width. Aspects clipped or stacked unreadably | mitigate | (a) Tailwind responsive layout: `flex flex-wrap gap-2` so chips wrap to multiple rows on narrow viewports — never clipped, always rendered. (b) RTL snapshot test in `PerAspectChips.test.tsx` includes a 320px-viewport case asserting all 7 chips are present in the DOM. (c) Playwright e2e takes a screenshot at mobile-width and the screenshot is Read-back-verified for the chip stack visibly wrapping rather than overflowing. |
| T-20-B-05-05 | (T) Tampering — curation set drift | Operator stops updating the 50-doc set; production sentiment distribution shifts (e.g. new sectors come online); κ measurement on the stale set no longer represents production accuracy | mitigate | (a) `tests/golden-tickers/_aspect_labels.json` carries a `last_updated` ISO date in its top-level object. (b) `tests/integration/per-aspect-aggregate.integration.test.ts` includes a check: if `last_updated` > 90 days old, console.warn (not fail — warning so the operator gets nudged without blocking deploys; failure would block hot-fixes). (c) MODEL-CARD-per-aspect-aggregate.md "Retrain Cadence" section mandates 6-month full refresh of the curation set. (d) Curation runbook `docs/runbooks/aspect-label-curation.md` documents the workflow so a new operator can recurate. |

</threat_model>

<tasks>

<task type="auto" id="20-B-05-01" tdd="true">
  <name>Task 1: Create src/lib/sentiment/per-aspect-aggregate.ts pure-functions module + unit tests</name>
  <files>src/lib/sentiment/per-aspect-aggregate.ts, src/lib/sentiment/__tests__/per-aspect-aggregate.unit.test.ts</files>
  <read_first>
    - src/lib/sentiment/aggregator.ts (the existing post-Phase-19 Beta-smoothed weighted-mean — formula reuse precedent)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 113 — "Inter-aspect overlap allowed"; line 117 — verbatim 20-B-05 spec)
    - .planning/phases/20-real-sentiment-analysis/20-B-01-PLAN.md (AspectTag enum + PerDocResult shape — 20-B-01 is the upstream producer of per_doc_sentiment)
    - .planning/phases/20-real-sentiment-analysis/20-A-05-PLAN.md (Task 1 — TDD precedent for sentiment pure-functions module)
  </read_first>
  <behavior>
    Write `src/lib/sentiment/__tests__/per-aspect-aggregate.unit.test.ts` FIRST (RED). ≥9 cases:
    - `betaSmoothedBullPct([])` → null (empty input sentinel)
    - `betaSmoothedBullPct([{polarity:1,weight:1},{polarity:1,weight:1},{polarity:1,weight:1},{polarity:1,weight:1},{polarity:1,weight:1},{polarity:1,weight:1},{polarity:1,weight:1},{polarity:1,weight:1},{polarity:1,weight:1},{polarity:1,weight:1}])` → ≈ 60.0 (with α=β=5: (5+10)/(5+5+10+0)=0.75 → 75? Verify: 10 unit-weight bull, α=5,β=5 → (5+10)/(10+10+0) = 15/20 = 0.75 → 75%. Re-state: assert `betaSmoothedBullPct([10x bull]) ≈ 75` ± 0.5. For 100 unit-weight bull → (5+100)/(10+100) = 0.9545 → ≈ 95.5%, asymptotically approaches 100% as n→∞. So canonical "mostly bull" assertion: 100 docs all bull → ≥ 90.)
    - `betaSmoothedBullPct([{polarity:-1,weight:1} × 100])` → ≤ 10 (asymptotic bear, mirror of bull)
    - `betaSmoothedBullPct([{polarity:1,weight:1} × 5, {polarity:-1,weight:1} × 5])` → ≈ 50.0 (balanced; (5+5)/(10+5+5)=0.5 → 50%)
    - `betaSmoothedBullPct([{polarity:0,weight:1}])` → ≈ 50.0 (neutral; (5+0)/(10+0+0) = 0.5 → 50%)
    - `aggregateByAspect([])` → ASPECT_TAXONOMY.length entries, each {bull_pct: null, n_docs: 0, confidence_mean: 0} (empty input → all-null output, taxonomy completeness)
    - `aggregateByAspect([{doc_id:'d1', polarity:1, confidence:0.9, aspects:['earnings','guidance']}])` → earnings entry has n_docs=1, bull_pct=null (n < N_DOCS_MIN=3), confidence_mean=0.9; guidance entry ALSO has n_docs=1 (overlap); regulatory has n_docs=0 — name this test "doc with two aspects contributes to both" per T-20-B-05-02
    - `aggregateByAspect([{doc_id, polarity:1, confidence:1, aspects:['earnings']} × 5])` → earnings entry has n_docs=5, bull_pct ∈ [70, 80] (Beta-smoothed), guidance entry has n_docs=0, bull_pct=null
    - `aggregateByAspect` returns entries in fixed ASPECT_TAXONOMY order (assert `result.map(r => r.aspect)` deep-equals `[...ASPECT_TAXONOMY]`)
    - `ASPECT_TAXONOMY` deep-equals `['earnings', 'guidance', 'regulatory', 'M&A', 'macro', 'product', 'management']` (taxonomy locked)
    - `N_DOCS_MIN === 3 && BETA_ALPHA === 5 && BETA_BETA === 5`
    Run: tests fail (no implementation yet).
  </behavior>
  <action>
    1. Create `src/lib/sentiment/__tests__/per-aspect-aggregate.unit.test.ts` with ≥9 cases above. Run RED.
    2. Implement `src/lib/sentiment/per-aspect-aggregate.ts` with the exact signatures from `<interfaces>`. Use the Beta(α + Σ bull_weight, β + Σ bear_weight) posterior-mean formula. For each per-doc score: `bull_contrib = weight * Math.max(0, polarity)`, `bear_contrib = weight * Math.max(0, -polarity)`. (`polarity == 0` contributes neither — pure neutral.) Posterior mean = (α + Σ bull) / (α + β + Σ bull + Σ bear). Multiply by 100 for bull_pct. Clamp to [0, 100] to defend against floating-point drift.
    3. `aggregateByAspect`: iterate `ASPECT_TAXONOMY`; for each aspect collect all per_doc_results that include it (overlap allowed); compute `betaSmoothedBullPct` only when `aspect_results.length >= N_DOCS_MIN`, else `bull_pct = null`. Always emit one entry per aspect.
    4. Re-run unit test; confirm GREEN.
    5. Commit: `feat(20-B-05): per-aspect-aggregate pure-functions module + Beta-smoothing + N_DOCS_MIN sentinel`.

    DO NOT wire into source-package or research-brief yet — those are Tasks 4 + 5.
  </action>
  <verify>
    <automated>npm test -- per-aspect-aggregate.unit.test.ts</automated>
  </verify>
  <done>
    ≥9 unit tests pass; `aggregateByAspect` + `betaSmoothedBullPct` + `ASPECT_TAXONOMY` + `N_DOCS_MIN` + `BETA_ALPHA` + `BETA_BETA` exported; bull_pct is null when n_docs < 3; inter-aspect overlap test green and named explicitly per T-20-B-05-02.
  </done>
</task>

<task type="auto" id="20-B-05-02">
  <name>Task 2: Add FEATURE_PER_ASPECT_AGGREGATE flag + extend AnalysisResult schema (Zod + TS interface)</name>
  <files>src/lib/features.ts, src/lib/types.ts, src/lib/gemini-analysis.ts</files>
  <read_first>
    - src/lib/features.ts (existing FEATURES flag pattern — flag literal pattern and 'shadow' default convention from 19-A-07 / 20-A-05)
    - src/lib/types.ts (lines 393-469 — AnalysisResult interface; lines 421-439 — sentiment_intelligence sub-shape for context)
    - src/lib/gemini-analysis.ts (lines 64-156 — AnalysisResultSchema z.object; the optional/append pattern at lines 121-130 for citations_v2 / verification_claims is the precedent)
  </read_first>
  <action>
    1. Append to `src/lib/features.ts`:
       ```ts
       FEATURE_PER_ASPECT_AGGREGATE: (process.env.FEATURE_PER_ASPECT_AGGREGATE ?? 'shadow') as 'off' | 'shadow' | 'on',
       ```
       (Same flag-resolution pattern as `FEATURE_AGREEMENT_SIGNAL` from 20-A-05.)
    2. Append to `src/lib/types.ts` (after line 392, before AnalysisResult interface):
       ```ts
       export type AspectTag =
         | 'earnings' | 'guidance' | 'regulatory' | 'M&A'
         | 'macro' | 'product' | 'management';

       export interface PerAspectSentimentEntry {
         aspect: AspectTag;
         bull_pct: number | null;
         n_docs: number;
         confidence_mean: number;
       }
       ```
       Then append `per_aspect_sentiment?: PerAspectSentimentEntry[];` to the existing AnalysisResult interface (BEFORE `engine_calibration` at line 464 — keep the new field grouped with other Wave-20 additions).
    3. Append to `AnalysisResultSchema` in `src/lib/gemini-analysis.ts` (before the closing `})` at line 156):
       ```ts
       per_aspect_sentiment: z.array(z.object({
         aspect: z.enum(['earnings', 'guidance', 'regulatory', 'M&A', 'macro', 'product', 'management']),
         bull_pct: z.number().min(0).max(100).nullable(),
         n_docs: z.number().int().nonnegative(),
         confidence_mean: z.number().min(0).max(1),
       })).optional(),
       ```
    4. tsc clean: `npx tsc --noEmit`.
    5. Commit: `feat(20-B-05): add FEATURE_PER_ASPECT_AGGREGATE flag + extend AnalysisResult schema (TS + Zod)`.

    DO NOT modify any existing schema field. Pure additive.
  </action>
  <verify>
    <automated>grep -q "FEATURE_PER_ASPECT_AGGREGATE" src/lib/features.ts && grep -q "per_aspect_sentiment" src/lib/types.ts && grep -q "per_aspect_sentiment: z.array" src/lib/gemini-analysis.ts && npx tsc --noEmit</automated>
  </verify>
  <done>
    Feature flag + AspectTag + PerAspectSentimentEntry + AnalysisResult.per_aspect_sentiment + Zod schema entry all present and tsc-clean; no existing fields modified.
  </done>
</task>

<task type="auto" id="20-B-05-03">
  <name>Task 3: Add renderPerAspectBlock helper to research-brief.ts + insertion into prompt body</name>
  <files>src/lib/research-brief.ts</files>
  <read_first>
    - src/lib/research-brief.ts (entire file — find the existing global bull% rendering block; the per-aspect block goes BEFORE the existing sentiment-summary block)
    - src/lib/gemini-analysis.ts (lines 198, 211 — the prompt instructions that REFERENCE sentiment_intelligence_summary; per-aspect rendering must precede this so Gemini sees aspect breakdown when reasoning)
    - src/lib/sentiment/per-aspect-aggregate.ts (Task 1 exports — ASPECT_TAXONOMY + PerAspectResult shape)
    - src/lib/types.ts (Task 2 — PerAspectSentimentEntry)
  </read_first>
  <action>
    1. In `src/lib/research-brief.ts`, add the helper:
       ```ts
       export function renderPerAspectBlock(perAspect: PerAspectSentimentEntry[]): string {
         if (!perAspect || perAspect.length === 0) return '';
         const hasAnySignal = perAspect.some(p => p.bull_pct !== null);
         if (!hasAnySignal) return '';
         const lines = perAspect.map(p => {
           if (p.bull_pct === null) return `  ${p.aspect}: insufficient data`;
           return `  ${p.aspect}: ${p.bull_pct.toFixed(0)}% bullish (n=${p.n_docs})`;
         });
         return `Per-aspect sentiment:\n${lines.join('\n')}\n\n`;
       }
       ```
    2. Find the existing global bull%/sentiment rendering block in `research-brief.ts` (grep for `bull_pct` or `aggregated_bull_pct` or the SENTIMENT INTELLIGENCE label — whichever marks the section that currently emits the global one-line summary). INSERT `renderPerAspectBlock(analysisInput.per_aspect_sentiment ?? [])` BEFORE that existing line so per-aspect breakdown precedes the global summary in the prompt body.
    3. **Falls-back to global** behavior: when `renderPerAspectBlock` returns `''` (empty per_aspect OR all-null), the existing global rendering remains the only source — no replacement, just an additional block when present. This is the "Falls back to global when no aspect-tagged signal" requirement from CONTEXT.md line 117.
    4. Add a small unit test asserting the helper output: `renderPerAspectBlock([{aspect:'earnings',bull_pct:75,n_docs:12,confidence_mean:0.85},{aspect:'guidance',bull_pct:null,n_docs:1,confidence_mean:0.7}])` contains both the literal `'Per-aspect sentiment:'` and `'earnings: 75% bullish (n=12)'` and `'guidance: insufficient data'`.
    5. Commit: `feat(20-B-05): renderPerAspectBlock helper + insert per-aspect breakdown into research-brief prompt`.

    DO NOT remove the existing global rendering — per-aspect is ADDITIVE in shadow mode (S3); the global line stays as fallback.
  </action>
  <verify>
    <automated>grep -q "Per-aspect sentiment" src/lib/research-brief.ts && grep -q "renderPerAspectBlock" src/lib/research-brief.ts && npm test -- research-brief 2>&1 | grep -qE "(pass|✓)"</automated>
  </verify>
  <done>
    `renderPerAspectBlock` exported; called from prompt assembly BEFORE the global sentiment line; falls back to empty string when per_aspect is empty or all-null (existing global rendering then handles it); unit test asserts literal "Per-aspect sentiment" + "% bullish" + "insufficient data" appear in helper output.
  </done>
</task>

<task type="auto" id="20-B-05-04">
  <name>Task 4: Wire 20-B-01 per_doc_sentiment → aggregateByAspect → AnalysisResult.per_aspect_sentiment in source-package</name>
  <files>src/lib/data/source-package.ts, src/lib/gemini-analysis.ts, src/lib/types.ts</files>
  <read_first>
    - src/lib/data/source-package.ts (entire file — find where 20-B-01's per_document_sentiment is populated; this task hangs the per-aspect aggregation AFTER that population)
    - src/lib/features.ts (Task 2 — FEATURE_PER_ASPECT_AGGREGATE flag)
    - src/lib/sentiment/per-aspect-aggregate.ts (Task 1 — aggregateByAspect)
    - src/lib/gemini-analysis.ts (lines 1297-1311 — the post-LLM mapping where pkg fields propagate into the AnalysisResult; analogous wiring point for per_aspect_sentiment)
  </read_first>
  <action>
    1. In `src/lib/data/source-package.ts`, AFTER the 20-B-01 population of `per_document_sentiment` on the SourcePackage, add:
       ```ts
       import { aggregateByAspect } from '@/lib/sentiment/per-aspect-aggregate';
       import { FEATURES } from '@/lib/features';

       // Per-aspect aggregation (20-B-05)
       const perAspectMode = FEATURES.FEATURE_PER_ASPECT_AGGREGATE;
       if (perAspectMode === 'off') {
         pkg.per_aspect_sentiment = []; // off branch — empty array, downstream renders existing global only
       } else {
         // shadow + on: compute and surface
         const perDocResults = pkg.per_document_sentiment ?? [];
         pkg.per_aspect_sentiment = aggregateByAspect(perDocResults);
       }
       ```
       (If `pkg.per_document_sentiment` is not yet on the SourcePackage type at the time 20-B-01 has not landed yet, add the optional `per_aspect_sentiment?: PerAspectSentimentEntry[]` field to the SourcePackage interface in `src/lib/types.ts` so the assignment typechecks. The READ from `pkg.per_document_sentiment` should default to `[]` so this code is robust to 20-B-01 not yet shipping.)
    2. In `src/lib/gemini-analysis.ts` (after the existing post-LLM mapping that assembles the final AnalysisResult, around line 1311), add:
       ```ts
       per_aspect_sentiment: pkg.per_aspect_sentiment ?? [],
       ```
       so the AnalysisResult carries the per-aspect array assembled in source-package (the LLM does NOT author this field — it's authoritative numerics from the aggregator, mirroring the engine_calibration post-process pattern at lines 132-155).
    3. tsc clean: `npx tsc --noEmit`.
    4. Commit: `feat(20-B-05): wire per_doc_sentiment → aggregateByAspect → AnalysisResult.per_aspect_sentiment under FEATURE_PER_ASPECT_AGGREGATE flag`.
  </action>
  <verify>
    <automated>grep -q "aggregateByAspect" src/lib/data/source-package.ts && grep -q "per_aspect_sentiment: pkg.per_aspect_sentiment" src/lib/gemini-analysis.ts && npx tsc --noEmit</automated>
  </verify>
  <done>
    source-package.ts computes per_aspect_sentiment under flag (off → []; shadow/on → aggregateByAspect(per_doc)); gemini-analysis.ts post-process attaches it to AnalysisResult; LLM does not author this field (post-process pattern matches engine_calibration); tsc clean.
  </done>
</task>

<task type="auto" id="20-B-05-05">
  <name>Task 5: Build PerAspectChips React component + RTL snapshot tests on 4 golden tickers</name>
  <files>src/components/PerAspectChips.tsx, src/components/__tests__/PerAspectChips.test.tsx, src/components/ResearchReport.tsx</files>
  <read_first>
    - src/components/ResearchReport.tsx (find the Sentiment Intelligence card and the existing chip pattern — the small uppercase-tracked pills used for bull/bear/trending; reuse the Tailwind class shape so the new chips look consistent)
    - src/lib/types.ts (Task 2 — PerAspectSentimentEntry, AspectTag)
    - src/lib/sentiment/per-aspect-aggregate.ts (Task 1 — ASPECT_TAXONOMY)
    - tests/golden-tickers/ (existing structure — snapshot fixtures from 20-D-04 if present; this plan adds AAPL/GME/SPY/TSM fixtures keyed for per-aspect)
  </read_first>
  <action>
    1. Create `src/components/PerAspectChips.tsx`:
       ```tsx
       'use client';
       import type { PerAspectSentimentEntry } from '@/lib/types';

       const ASPECT_TOOLTIPS: Record<string, string> = {
         earnings:    'Sentiment from earnings-related documents',
         guidance:    'Sentiment from forward-guidance documents',
         regulatory:  'Sentiment from regulatory / SEC-filing documents',
         'M&A':       'Sentiment from M&A / acquisition documents',
         macro:       'Sentiment from macro / market-environment documents',
         product:     'Sentiment from product / launch documents',
         management:  'Sentiment from management / governance documents',
       };

       export function PerAspectChips({ entries }: { entries: PerAspectSentimentEntry[] }) {
         if (!entries || entries.length === 0) return null;
         return (
           <div className="flex flex-wrap gap-2 mt-2" data-testid="per-aspect-chips">
             {entries.map(e => {
               const display = e.bull_pct == null ? '—' : `${Math.round(e.bull_pct)}%`;
               return (
                 <span
                   key={e.aspect}
                   className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700"
                   title={ASPECT_TOOLTIPS[e.aspect] ?? e.aspect}
                   data-aspect={e.aspect}
                   data-bullpct={e.bull_pct ?? 'null'}
                 >
                   {e.aspect}: {display}
                 </span>
               );
             })}
           </div>
         );
       }
       ```
       (CRITICAL: `display = e.bull_pct == null ? '—' : ...` — NEVER render `'0%'` as the empty-aspect placeholder per T-20-B-05-03. The em-dash is the sentinel.)
    2. Mount `<PerAspectChips entries={analysis.per_aspect_sentiment ?? []}/>` in `src/components/ResearchReport.tsx` inside the Sentiment Intelligence card BELOW the existing per-source breakdown row. Conditional: only render when `analysis.per_aspect_sentiment && analysis.per_aspect_sentiment.length > 0`. The existing global `aggregated_bull_pct` chip stays — per-aspect is additive in shadow mode (S3).
    3. Create `src/components/__tests__/PerAspectChips.test.tsx` with React Testing Library:
       - **AAPL fixture** — large-cap, expect chips for earnings + guidance with non-null bull_pct (most analyst coverage); regulatory likely '—'. Snapshot: `expect(container.firstChild).toMatchSnapshot('aapl-per-aspect')`.
       - **GME fixture** — meme/echo-chamber, expect chips with mixed bull_pct AND at least one '—' aspect. Assert `screen.queryByText('0%')` is null (T-20-B-05-03).
       - **SPY fixture** — ETF, expect MOST aspects to render '—' (low single-stock coverage). Assert chip stack contains ≥3 '—' literals.
       - **TSM fixture** — ADR, expect earnings + product chips with non-null bull_pct.
       - **Empty entries** — `<PerAspectChips entries={[]}/>` returns null; component does NOT render.
       - **Mobile-width assertion** — render with viewport=320px (RTL `act` + window.innerWidth mock); assert all 7 chips remain in the DOM via `screen.getAllByTestId('per-aspect-chips').length` (T-20-B-05-04 — wrap, do not clip).
    4. Commit: `feat(20-B-05): PerAspectChips component + RTL snapshot tests on 4 golden tickers (AAPL/GME/SPY/TSM)`.
  </action>
  <verify>
    <automated>test -f src/components/PerAspectChips.tsx && grep -q "PerAspectChips" src/components/ResearchReport.tsx && npm test -- PerAspectChips.test.tsx</automated>
  </verify>
  <done>
    PerAspectChips renders one chip per aspect; '—' (em-dash) for null bull_pct; tooltip per aspect; RTL snapshot tests pass on 4 golden tickers; explicit assertion that '0%' literal is NOT rendered when bull_pct is null; mobile-width test confirms all 7 chips remain in DOM.
  </done>
</task>

<task type="checkpoint:human-action" id="20-B-05-06" gate="blocking">
  <name>Task 6: [BLOCKING] Operator curates 50-doc human-labeled aspect set per Task 9 runbook</name>
  <files>tests/golden-tickers/_aspect_labels.json</files>
  <what-built>
    Tasks 1-5 deliver the per-aspect aggregation pipeline + UI; Task 7 will run Cohen's kappa against a HUMAN-LABELED 50-doc set. The label set CANNOT be auto-generated without losing the inter-rater-agreement property κ depends on. The operator must follow the curation runbook (Task 9 — already drafted as part of this plan; see `docs/runbooks/aspect-label-curation.md`) to pick 50 diverse production documents and tag aspects by hand.
  </what-built>
  <action>
    OPERATOR-ONLY task — Claude cannot author human labels (doing so would defeat Cohen's kappa's inter-rater-agreement semantics).

    Operator workflow (follow `docs/runbooks/aspect-label-curation.md` from Task 9; if Task 9 has not yet committed, commit it first so the runbook is on disk):
    1. Pull 50 diverse SourcePackage documents from production: spread across all 7 AspectTag values (≥5 docs per aspect minimum), spread across cap classes (large/mid/small/micro), spread across sources (news/sec_filing/social/community).
    2. For each doc, manually read the raw text and tag the applicable aspects (multi-aspect allowed — most earnings releases also touch guidance).
    3. Assemble the JSON file `tests/golden-tickers/_aspect_labels.json` per the schema in this plan's `<interfaces>` block. Include `last_updated` ISO date.
    4. Verify the file passes a quick sanity check (also the `<verify>` block below):
       ```bash
       node -e "const d = require('./tests/golden-tickers/_aspect_labels.json'); console.assert(d.docs.length >= 50); console.assert(d.last_updated);"
       ```
    5. Commit: `chore(20-B-05): curate 50-doc human-labeled aspect set for Cohen's kappa eval`.
  </action>
  <how-to-verify>
    Same steps as `<action>` above. After commit, verify file presence + shape:
    ```bash
    test -f tests/golden-tickers/_aspect_labels.json &&     node -e "const d = require('./tests/golden-tickers/_aspect_labels.json'); process.exit(d.docs.length >= 50 && d.last_updated ? 0 : 1)"
    ```
  </how-to-verify>
  <verify>
    <automated>node -e "const d = require('./tests/golden-tickers/_aspect_labels.json'); process.exit(d.docs.length >= 50 && d.last_updated ? 0 : 1)"</automated>
  </verify>
  <done>
    `tests/golden-tickers/_aspect_labels.json` committed with ≥50 docs spanning all 7 AspectTag values (≥5 per aspect minimum) AND `last_updated` ISO date present; sanity check above exits 0.
  </done>
  <resume-signal>Type "curated" once `tests/golden-tickers/_aspect_labels.json` exists with ≥50 docs spanning all 7 aspects AND the file is committed; or describe blocker (e.g. "need access to production SourcePackages").</resume-signal>
</task>

<task type="auto" id="20-B-05-07">
  <name>Task 7: Build scripts/eval-aspect-kappa.ts + monthly cron /api/cron/aspect-kappa-monitor</name>
  <files>scripts/eval-aspect-kappa.ts, src/app/api/cron/aspect-kappa-monitor/route.ts, vercel.json, package.json, tests/cohen-kappa.unit.test.ts</files>
  <read_first>
    - tests/golden-tickers/_aspect_labels.json (Task 6 — committed by operator before this task runs; this script reads it)
    - src/lib/sentiment/per-aspect-aggregate.ts (Task 1 — ASPECT_TAXONOMY)
    - 20-B-01 PLAN (the per-doc Gemini classifier — eval harness invokes it on each labeled doc)
    - .planning/phases/20-real-sentiment-analysis/20-A-05-PLAN.md (Task 6 — cron-imports-script boundary precedent)
    - https://scikit-learn.org/stable/modules/generated/sklearn.metrics.cohen_kappa_score.html (verbatim Cohen 1960 unweighted κ semantics — replicate in TS)
  </read_first>
  <action>
    1. Create `scripts/eval-aspect-kappa.ts`:
       ```ts
       import fs from 'node:fs';
       import path from 'node:path';
       import { ASPECT_TAXONOMY } from '@/lib/sentiment/per-aspect-aggregate';
       import { classifyPerDoc } from '@/lib/sentiment/per-document-classifier'; // 20-B-01's exported per-doc classifier
       import type { AspectTag } from '@/lib/types';

       /** Cohen's kappa for 0/1 vectors — Cohen 1960; sklearn cohen_kappa_score semantics (unweighted, symmetric). */
       export function cohenKappa(r1: (0|1)[], r2: (0|1)[]): number {
         if (r1.length !== r2.length) throw new Error('cohenKappa: vector length mismatch');
         const n = r1.length;
         if (n === 0) return 0;
         let agree = 0, p1 = 0, p2 = 0;
         for (let i = 0; i < n; i++) {
           if (r1[i] === r2[i]) agree++;
           if (r1[i] === 1) p1++;
           if (r2[i] === 1) p2++;
         }
         const p_o = agree / n;
         const p1_pos = p1 / n, p2_pos = p2 / n;
         const p_e = p1_pos * p2_pos + (1 - p1_pos) * (1 - p2_pos);
         if (p_e === 1) return 1; // perfect agreement, both raters always assign same class
         return (p_o - p_e) / (1 - p_e);
       }

       export async function runAspectKappaEval(): Promise<{
         weighted_mean_kappa: number;
         per_aspect_kappa: Record<AspectTag, number>;
         n_docs: number;
         passed: boolean;
       }> {
         const labels = JSON.parse(fs.readFileSync(
           path.join(process.cwd(), 'tests/golden-tickers/_aspect_labels.json'),
           'utf8',
         ));
         const docs = labels.docs as Array<{ doc_id: string; raw_text: string; ticker: string; source: string; human_aspects: AspectTag[] }>;
         // Run 20-B-01 classifier on each doc
         const classifications = await Promise.all(docs.map(d => classifyPerDoc(d)));
         const per_aspect_kappa: Partial<Record<AspectTag, number>> = {};
         let weightedNumer = 0, weightedDenom = 0;
         for (const aspect of ASPECT_TAXONOMY) {
           const human  = docs.map(d => (d.human_aspects.includes(aspect) ? 1 : 0) as 0|1);
           const machine = classifications.map(c => (c.aspects.includes(aspect) ? 1 : 0) as 0|1);
           const k = cohenKappa(human, machine);
           per_aspect_kappa[aspect] = k;
           const positives = human.reduce((s, v) => s + v, 0);
           weightedNumer += positives * k;
           weightedDenom += positives;
         }
         const weighted_mean_kappa = weightedDenom > 0 ? weightedNumer / weightedDenom : 0;
         const passed = weighted_mean_kappa >= 0.6;
         const out = { weighted_mean_kappa, per_aspect_kappa: per_aspect_kappa as Record<AspectTag, number>, n_docs: docs.length, passed };
         const date = new Date().toISOString().slice(0, 10);
         fs.writeFileSync(`/tmp/aspect-kappa-${date}.json`, JSON.stringify(out, null, 2));
         console.log(passed ? `PASS — weighted κ = ${weighted_mean_kappa.toFixed(3)}` : `FAIL — weighted κ = ${weighted_mean_kappa.toFixed(3)} < 0.6`);
         return out;
       }

       if (require.main === module) {
         runAspectKappaEval().then(r => process.exit(r.passed ? 0 : 1));
       }
       ```
    2. Add `package.json` script: `"eval-aspect-kappa": "tsx scripts/eval-aspect-kappa.ts"`.
    3. Create `src/app/api/cron/aspect-kappa-monitor/route.ts` per the `<interfaces>` block (CRON_SECRET-gated; returns 5xx + alert JSON when κ < 0.6 — the 5xx triggers Vercel's cron failure alerting).
    4. Append to `vercel.json` `crons[]`:
       ```json
       { "path": "/api/cron/aspect-kappa-monitor", "schedule": "0 7 1 * *" }
       ```
       (07:00 UTC on the 1st of every month — distinct from 20-A-05's 06:00 entry.)
    5. Add ≥3 unit tests for `cohenKappa` in `tests/cohen-kappa.unit.test.ts`:
       - Perfect agreement: `cohenKappa([1,1,0,0],[1,1,0,0])` → 1.0
       - Total disagreement (vectors are inverses on balanced classes): `cohenKappa([1,1,0,0],[0,0,1,1])` → -1.0
       - Chance agreement (raters independent): vectors of length 100 with random class assignments seeded — assert κ ≈ 0 (within ± 0.1)
       - Edge: empty vectors → 0
       - Edge: both raters all 1s → 1 (perfect agreement, p_e == 1 branch handled)
    6. Commit: `feat(20-B-05): Cohen's kappa eval harness + monthly aspect-kappa-monitor cron + unit tests`.
  </action>
  <verify>
    <automated>npm run eval-aspect-kappa 2>&1 | grep -qE "(PASS|FAIL).*κ" && grep -q "/api/cron/aspect-kappa-monitor" vercel.json && npm test -- cohen-kappa.unit.test.ts</automated>
  </verify>
  <done>
    eval-aspect-kappa script writes /tmp/aspect-kappa-{date}.json + prints PASS/FAIL on the κ ≥ 0.6 ship gate; cron route returns 5xx when κ regresses; vercel.json contains the monthly entry; cohenKappa unit tests pass on canonical vectors.
  </done>
</task>

<task type="auto" id="20-B-05-08">
  <name>Task 8: Live integration test + Playwright e2e for empty-aspect '—' rendering + curation-staleness check</name>
  <files>tests/integration/per-aspect-aggregate.integration.test.ts, tests/e2e/per-aspect-chips.spec.ts, tests/e2e/screenshots/per-aspect-chips.png</files>
  <read_first>
    - tests/integration/sentiment-observation.integration.test.ts (live-Neon test pattern — though this plan's integration test is fixture-driven, no DB writes required)
    - src/components/PerAspectChips.tsx (Task 5 — data-testid + data-bullpct attributes for Playwright targeting)
    - tests/e2e/ (existing Playwright config; per CLAUDE.md global instructions: install Playwright if not present and write e2e tests for every feature; this fixture-seeds /research/AAPL with fixture data)
    - tests/golden-tickers/_aspect_labels.json (Task 6 — for the staleness check)
  </read_first>
  <action>
    1. Create `tests/integration/per-aspect-aggregate.integration.test.ts`:
       - **Test A (end-to-end aggregation)**: Build a fixture SourcePackage with 10 per-doc results across 4 aspects (e.g. 4 earnings docs all-bull, 3 guidance docs split 2 bull / 1 bear, 2 regulatory docs both bear, 1 macro doc neutral). Assemble through the production source-package code path. Assert `pkg.per_aspect_sentiment` contains 7 entries (full ASPECT_TAXONOMY); earnings.bull_pct > 70; guidance.bull_pct ∈ [40, 60] (Beta-smoothed mixed); regulatory.bull_pct === null (n=2 < N_DOCS_MIN=3); M&A/product/management bull_pct === null (n=0).
       - **Test B (research-brief prompt grep)**: Build the prompt for the same fixture; grep-assert it contains the literal `'Per-aspect sentiment:'` AND `'earnings: '` AND `'% bullish'` AND `'insufficient data'` (for the regulatory + M&A/product/management aspects).
       - **Test C (off-flag short-circuit)**: With `FEATURE_PER_ASPECT_AGGREGATE='off'`, assemble the same SourcePackage; assert `pkg.per_aspect_sentiment` is `[]` (empty array, not null — keep type signature consistent).
       - **Test D (curation staleness warn)**: Read `tests/golden-tickers/_aspect_labels.json.last_updated`; if Date.now() - parsed > 90 days, `console.warn` (DO NOT fail) — this is a nudge, not a block, per T-20-B-05-05.
    2. Create `tests/e2e/per-aspect-chips.spec.ts` (Playwright):
       - Navigate to `/research/AAPL` (use a test fixture seeder if available; otherwise hit production with a known ticker that has rich coverage).
       - Wait for the chip stack: `await page.waitForSelector('[data-testid="per-aspect-chips"]', { timeout: 10000 })`.
       - **Assert no '0%' literal**: `const text = await page.locator('[data-testid="per-aspect-chips"]').innerText(); expect(text).not.toContain('0%');` — this enforces T-20-B-05-03 ("empty-aspect renders '—' not '0%'").
       - **Assert '—' present** when at least one aspect is null on the AAPL fixture.
       - Take a screenshot `tests/e2e/screenshots/per-aspect-chips.png`.
       - Read the screenshot back with the Read tool to visually confirm: chips are visible, em-dash renders correctly, no overflow/clip.
    3. Commit: `test(20-B-05): integration test for per-aspect end-to-end + Playwright e2e for empty-aspect '—' rendering`.
  </action>
  <verify>
    <automated>npm run test:integration -- per-aspect-aggregate.integration && npm run test:e2e -- per-aspect-chips.spec.ts</automated>
  </verify>
  <done>
    Integration test asserts: full taxonomy emitted (7 entries), earnings/guidance/regulatory bull_pct values match Beta-smoothed expectations, empty aspects null, off-flag short-circuit, prompt grep contains aspect breakdown; Playwright asserts no '0%' literal in chip stack, '—' present, screenshot read-back-confirmed for visual correctness; staleness warn fires when applicable.
  </done>
</task>

<task type="auto" id="20-B-05-09">
  <name>Task 9: Write MODEL-CARD-per-aspect-aggregate.md + curation runbook + HYPERPARAMETERS.md entry</name>
  <files>docs/cards/MODEL-CARD-per-aspect-aggregate.md, docs/runbooks/aspect-label-curation.md, HYPERPARAMETERS.md</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 22-23 — S4 model card requirements; line 113 — "Inter-aspect overlap allowed" — cite directly in caveats)
    - .planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md (model card template — if not yet committed, follow Mitchell 2019 sections directly)
    - .planning/phases/20-real-sentiment-analysis/20-A-05-PLAN.md (Task 10 — model card precedent)
    - HYPERPARAMETERS.md (existing format — append, do not replace)
  </read_first>
  <action>
    1. Create `docs/cards/MODEL-CARD-per-aspect-aggregate.md` with Mitchell 2019 sections:
       - **Model Details**: name = `per-aspect-aggregate-v1`; type = composite signal (deterministic Beta-smoothed weighted mean over per-doc aspect tags); owner = Cipher Phase 20-B-05; depends on 20-B-01 per-doc classifier.
       - **Intended Use**: Surface per-aspect bull% chips on Sentiment Intelligence card AND inject per-aspect breakdown into research-brief prompt. NOT a directional aggregate signal — it disaggregates the existing global signal so the report can reason aspect-by-aspect (motivated by Cookson & Engelberg's "Echo Chambers" + the TABFSA literature; CONTEXT.md line 56-57).
       - **Factors**: input is an array of `PerDocResult { doc_id, polarity ∈ [-1,+1], confidence ∈ [0,1], aspects: AspectTag[] }` from 20-B-01.
       - **Metrics**: Cohen's weighted-mean κ ≥ 0.6 on the 50-doc human-labeled set; per-aspect κ also reported.
       - **Evaluation Data**: 50-doc human-labeled set in `tests/golden-tickers/_aspect_labels.json` curated per `docs/runbooks/aspect-label-curation.md`; spans all 7 AspectTag values (≥5 docs per aspect minimum) and all cap classes.
       - **Training Data**: same as evaluation (no gradient training — calibration is the human label set).
       - **Quantitative Analyses**: latest `/tmp/aspect-kappa-{date}.json` weighted κ + per-aspect κ.
       - **Ethical Considerations**: empty-aspect rendering — '0%' would falsely communicate zero bullishness rather than zero data; mitigated via '—' em-dash sentinel + Playwright assertion (T-20-B-05-03).
       - **Caveats and Recommendations**:
         - Inter-aspect overlap is INTENTIONAL per CONTEXT.md line 113 — a doc with two aspects contributes to BOTH per-aspect aggregates. This is NOT double-counting; it is the correct representation of multi-aspect docs (T-20-B-05-02).
         - 50-doc set drift: monthly κ monitor + 6-month full re-curation cadence.
         - N_DOCS_MIN = 3 — aspects with fewer than 3 contributing docs render '—'.
       - **References**: Cohen, J. (1960). "A Coefficient of Agreement for Nominal Scales." Educational and Psychological Measurement. Landis, J. R. & Koch, G. G. (1977). "The Measurement of Observer Agreement for Categorical Data." Biometrics — source for κ ≥ 0.6 = "substantial agreement" threshold. Cookson, A. & Engelberg, J. (2024). "Echo Chambers." UCSD Rady — motivation for aspect disaggregation. CONTEXT.md line 56-57 (TABFSA aspect-based decomposition).
    2. Create `docs/runbooks/aspect-label-curation.md`:
       - **Goal**: Assemble a human-labeled 50-doc set for Cohen's kappa evaluation of the 20-B-01 per-doc aspect classifier.
       - **Workflow**:
         1. Pull 50 diverse SourcePackages from production via `psql "$DATABASE_URL" -c "..."` or read from `~/.cipher/source-packages/` (local mode).
         2. For each, pick ONE representative document (news article, SEC filing excerpt, community post). Record `doc_id`, `ticker`, `source`, `raw_text`.
         3. Read the doc and tag applicable aspects from `ASPECT_TAXONOMY` — multi-aspect allowed; e.g. an earnings release that includes forward guidance gets both 'earnings' and 'guidance'.
         4. Coverage requirement: ≥5 docs per aspect minimum (else κ for under-represented aspects is unreliable). Spread across cap classes (large/mid/small/micro) and sources (news/sec_filing/social/community).
         5. Save to `tests/golden-tickers/_aspect_labels.json` per the schema in 20-B-05 PLAN's `<interfaces>` block. Set `last_updated` to today's ISO date.
         6. Run `npm run eval-aspect-kappa` — confirm output prints PASS or FAIL with weighted κ value.
       - **Re-curation cadence**: full refresh every 6 months OR whenever the production sentiment distribution shifts materially (new sectors come online, classifier retrained, etc.).
       - **Drift detection**: monthly `/api/cron/aspect-kappa-monitor` cron alerts when κ < 0.6 — this is the operator's signal to either retrain the 20-B-01 classifier OR re-curate the label set.
    3. Append to `HYPERPARAMETERS.md`:
       ```markdown
       ### Per-aspect aggregation (Plan 20-B-05)
       - `BETA_ALPHA = 5`, `BETA_BETA = 5` — symmetric weak Beta prior, post-Phase-19 carry-over (Cookson-style; equivalent to "5 prior bull observations + 5 prior bear observations" of evidence before any data).
       - `N_DOCS_MIN = 3` — minimum number of contributing docs per aspect for a non-null bull_pct; under-threshold aspects render '—' (em-dash) rather than '0%' to avoid the false "zero bullishness" reading (T-20-B-05-03).
       - `KAPPA_SHIP_GATE = 0.6` — Cohen's weighted-mean κ ship gate per Landis & Koch (1977) "substantial agreement" threshold; measured by `scripts/eval-aspect-kappa.ts` against the 50-doc human-labeled set in `tests/golden-tickers/_aspect_labels.json`.
       - Re-evaluation cadence: monthly cron (`/api/cron/aspect-kappa-monitor`) + 6-month full curation refresh per MODEL-CARD-per-aspect-aggregate.md.
       ```
    4. Verify the model card passes `scripts/check-model-cards.ts` (from 20-Z-02). If 20-Z-02 has not yet shipped, leave a TODO comment in the model card referencing 20-Z-02 and confirm path matches the convention `docs/cards/MODEL-CARD-{component}.md`.
    5. Commit: `docs(20-B-05): MODEL-CARD-per-aspect-aggregate + curation runbook + HYPERPARAMETERS entry per S1 + S4`.
  </action>
  <verify>
    <automated>test -f docs/cards/MODEL-CARD-per-aspect-aggregate.md && test -f docs/runbooks/aspect-label-curation.md && grep -q "Cookson" docs/cards/MODEL-CARD-per-aspect-aggregate.md && grep -q "KAPPA_SHIP_GATE" HYPERPARAMETERS.md</automated>
  </verify>
  <done>
    Model card committed with all Mitchell-2019 sections + Cookson/Landis-Koch/Cohen citations + intentional-overlap caveat + 6-month re-curation cadence; runbook documents 50-doc curation workflow; HYPERPARAMETERS.md documents BETA_ALPHA/BETA_BETA/N_DOCS_MIN/KAPPA_SHIP_GATE; check-model-cards recognizes the new card (or TODO recorded).
  </done>
</task>

<task type="auto" id="20-B-05-10">
  <name>Task 10: Full test suite green + dev-server browser verification + final commit</name>
  <files>(no new files — full-suite verification + SUMMARY)</files>
  <read_first>
    - All test files committed in this plan (Tasks 1, 5, 7, 8 — verify zero regression across the suite)
    - vercel-plugin agent-browser-verify skill (per system reminder — verify dev server with agent-browser before considering UI work complete)
  </read_first>
  <action>
    1. Run the full test suite end-to-end:
       ```bash
       npm test                              # all unit tests
       npm run test:integration              # all integration tests
       npm run test:e2e                      # all Playwright e2e
       npx tsc --noEmit                      # type check
       npm run build                         # production build
       ```
       All must exit 0.
    2. Per CLAUDE.md global instructions + the agent-browser-verify Vercel skill: spin up the dev server and verify the chip stack renders end-to-end:
       ```bash
       npm run dev &
       sleep 8
       agent-browser open http://localhost:3000/research/AAPL
       agent-browser wait --load networkidle
       agent-browser screenshot --annotate /tmp/aapl-per-aspect-verify.png
       agent-browser eval 'document.querySelector("[data-testid=\"per-aspect-chips\"]") ? "PRESENT" : "MISSING"'
       agent-browser eval 'document.querySelector("[data-testid=\"per-aspect-chips\"]").innerText'
       agent-browser close
       kill %1
       ```
       Read back the screenshot to visually confirm chip stack is present, '—' renders for empty aspects, no '0%' literal, no overflow.
    3. If all green, write the SUMMARY: `.planning/phases/20-real-sentiment-analysis/20-B-05-SUMMARY.md` (per `<output>` below).
    4. Final commit (if not already committed in earlier tasks): `chore(20-B-05): full test suite green + browser-verified PerAspectChips render`.
  </action>
  <verify>
    <automated>npm test && npm run test:integration && npm run test:e2e && npx tsc --noEmit && npm run build</automated>
  </verify>
  <done>
    Full unit + integration + e2e + tsc + build green; agent-browser verification confirms chip stack visible on /research/AAPL with '—' for empty aspects and no '0%' literal; SUMMARY written.
  </done>
</task>

</tasks>

<verification>

## Numerical acceptance criteria (S8 — zero adjectives)

| # | Check | Pass condition |
|---|-------|----------------|
| 1 | Unit tests pass | `npm test -- per-aspect-aggregate.unit.test.ts cohen-kappa.unit.test.ts` exits 0 with ≥12 cases passing (≥9 aggregator + ≥3 cohenKappa edge cases) |
| 2 | Cohen's kappa MEASURED (NOT asserted) | `npm run eval-aspect-kappa` runs to completion; writes `/tmp/aspect-kappa-{date}.json`; prints `PASS — weighted κ = X.XXX` (X.XXX ≥ 0.6) — the value comes from the script, NOT from a hard-coded assertion |
| 3 | Per-aspect taxonomy locked | `grep -q "earnings.*guidance.*regulatory.*M&A.*macro.*product.*management" src/lib/sentiment/per-aspect-aggregate.ts` returns 0 |
| 4 | AnalysisResult schema extended | `grep -q "per_aspect_sentiment" src/lib/types.ts && grep -q "per_aspect_sentiment: z.array" src/lib/gemini-analysis.ts` returns 0 |
| 5 | research-brief.ts prompt contains aspect breakdown | `grep -q "Per-aspect sentiment" src/lib/research-brief.ts && grep -q "renderPerAspectBlock" src/lib/research-brief.ts` returns 0 |
| 6 | UI snapshot tests pass on 4 golden tickers | `npm test -- PerAspectChips.test.tsx` exits 0 with snapshots for AAPL/GME/SPY/TSM |
| 7 | Empty-aspect renders '—' (NOT '0%') in unit + e2e | `npm test -- PerAspectChips.test.tsx` includes assertion `screen.queryByText('0%') === null` AND `npm run test:e2e -- per-aspect-chips.spec.ts` includes `expect(text).not.toContain('0%')` |
| 8 | Inter-aspect overlap test green and explicitly named | `grep -q "doc with two aspects contributes to both" src/lib/sentiment/__tests__/per-aspect-aggregate.unit.test.ts` returns 0 |
| 9 | Curation set ≥50 docs, last_updated present | `node -e "const d = require('./tests/golden-tickers/_aspect_labels.json'); process.exit(d.docs.length >= 50 && d.last_updated ? 0 : 1)"` exits 0 |
| 10 | Curation runbook + model card committed | `test -f docs/runbooks/aspect-label-curation.md && test -f docs/cards/MODEL-CARD-per-aspect-aggregate.md` returns 0 |
| 11 | Cookson citation present | `grep -q "Cookson" docs/cards/MODEL-CARD-per-aspect-aggregate.md` returns 0 |
| 12 | HYPERPARAMETERS documents constants | `grep -q "BETA_ALPHA = 5" HYPERPARAMETERS.md && grep -q "N_DOCS_MIN = 3" HYPERPARAMETERS.md && grep -q "KAPPA_SHIP_GATE = 0.6" HYPERPARAMETERS.md` returns 0 |
| 13 | Cron entry present | `grep -q "/api/cron/aspect-kappa-monitor" vercel.json && grep -q "0 7 1 \* \*" vercel.json` returns 0 |
| 14 | Feature flag added | `grep -q "FEATURE_PER_ASPECT_AGGREGATE" src/lib/features.ts` returns 0 |
| 15 | Integration test green | `npm run test:integration -- per-aspect-aggregate.integration` exits 0 |
| 16 | Playwright e2e green + screenshot exists | `npm run test:e2e -- per-aspect-chips.spec.ts` exits 0 AND `test -f tests/e2e/screenshots/per-aspect-chips.png` returns 0 |
| 17 | Beta-smoothing formula matches Phase-19 carry-over | `grep -q "Beta" src/lib/sentiment/per-aspect-aggregate.ts && grep -q "alpha" src/lib/sentiment/per-aspect-aggregate.ts && grep -q "beta" src/lib/sentiment/per-aspect-aggregate.ts` returns 0 |
| 18 | tsc clean | `npx tsc --noEmit` exits 0 |
| 19 | Build succeeds | `npm run build` exits 0 |
| 20 | Inter-aspect overlap documented as intentional in model card | `grep -q "Inter-aspect overlap" docs/cards/MODEL-CARD-per-aspect-aggregate.md && grep -qE "(intentional|INTENTIONAL)" docs/cards/MODEL-CARD-per-aspect-aggregate.md` returns 0 |

## Shadow → on cutover (S3)

Operator flips `FEATURE_PER_ASPECT_AGGREGATE` from `'shadow'` to `'on'` ONLY when ALL FOUR criteria hold:
1. `npm run eval-aspect-kappa` reports weighted-mean κ ≥ 0.6 (the script PRINTS PASS — NOT asserted in code)
2. `npm test -- PerAspectChips.test.tsx` snapshot tests green on AAPL / GME / SPY / TSM
3. `npm run test:e2e -- per-aspect-chips.spec.ts` confirms no `'0%'` literal renders when n_docs < 3 — `'—'` renders instead
4. `grep -q "Per-aspect sentiment" $(curl -s http://localhost:3000/api/test/render-prompt?ticker=AAPL)` confirms the prompt body contains the aspect breakdown for a fixture ticker with ≥1 aspect-tagged doc

After cutover, the `'off'` and `'shadow'` branches and the flag itself are deleted in a follow-up commit per S3 — no dead code left behind.

</verification>

<success_criteria>

Plan is DONE when:

1. All 10 tasks committed (`git log --oneline | grep "20-B-05"` shows ≥10 entries)
2. All 20 numerical checks in `<verification>` pass
3. 50-doc human-labeled set committed at `tests/golden-tickers/_aspect_labels.json` with `last_updated` ISO date (Task 6 operator gate complete)
4. `npm test`, `npm run test:integration`, `npm run test:e2e`, `npx tsc --noEmit`, `npm run build` all green on `main` post-commit (Hard Cleanup Gate item 4)
5. `MODEL-CARD-per-aspect-aggregate.md` committed with Cookson/Landis-Koch/Cohen citations + intentional-overlap caveat + 6-month re-curation cadence
6. `FEATURE_PER_ASPECT_AGGREGATE` flag exists at `'shadow'` default; cutover-to-`'on'` is a separate operator action gated on the four numerical criteria above
7. agent-browser verification confirmed: chip stack visible on `/research/AAPL` with `'—'` for empty aspects and NO `'0%'` literal anywhere in the chip stack
8. Phase 20 standards adherence demonstrated: S1 (BETA_ALPHA=5 cited as Phase-19 carry-over; KAPPA_SHIP_GATE=0.6 cited from Landis & Koch 1977; calibration step is the 50-doc human eval), S3 (shadow flag + 4 cutover criteria), S4 (model card), S7 (5 threats), S8 (numerical acceptance — 20 checks, zero adjectives)

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-B-05-SUMMARY.md` recording:

- Final measured Cohen's weighted-mean κ from the most recent `/tmp/aspect-kappa-{date}.json` (PASS or FAIL on the ≥ 0.6 ship gate)
- Per-aspect κ table: { earnings, guidance, regulatory, M&A, macro, product, management } with each value
- 50-doc set composition: count per aspect (verify ≥5 per aspect minimum) + count per cap class + count per source
- Snapshot test results on the 4 golden tickers (AAPL/GME/SPY/TSM): which aspects render bull_pct, which render '—'
- Cutover-to-`'on'` date OR a flag noting still in shadow with the gating-criteria delta
- Pattern observed in the prompt body: count of fixture tickers where the per-aspect block fired vs fell back to global
- Any deviations from the 20 verification numerical checks (zero deviations expected)
- Reference to MODEL-CARD-per-aspect-aggregate.md for the 6-month re-evaluation calendar
- Reference to docs/runbooks/aspect-label-curation.md for the next operator who needs to recurate
</output>
