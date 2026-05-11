---
phase: 20
plan: 20-B-01
wave: B
type: execute
depends_on: ['20-Z-01', '20-Z-04']
files_modified:
  - prisma/schema.prisma
  - src/lib/sentiment/aspects.ts
  - src/lib/sentiment/per-doc-classifier.ts
  - src/lib/sentiment/select-top-docs.ts
  - src/lib/sentiment/__tests__/aspects.unit.test.ts
  - src/lib/sentiment/__tests__/per-doc-classifier.unit.test.ts
  - src/lib/sentiment/__tests__/select-top-docs.unit.test.ts
  - src/lib/gemini-analysis.ts
  - src/lib/types.ts
  - src/lib/data/source-package.ts
  - src/lib/features.ts
  - src/lib/prompts/registry.ts
  - src/lib/prompts/_v1/gemini-per-doc-sentiment.md
  - tests/prompts/registry.unit.test.ts
  - tests/prompts/__snapshots__/registry.golden.test.ts.snap
  - tests/fixtures/per-doc-classification/ten-doc-fixture.json
  - tests/fixtures/per-doc-classification/off-topic-doc-fixture.json
  - tests/integration/per-doc-classifier.integration.test.ts
  - scripts/eval-fpb-per-doc.ts
  - data/eval/fpb-held-out.csv
  - package.json
  - docs/cards/MODEL-CARD-gemini-per-doc.md
  - HYPERPARAMETERS.md
autonomous: true
requirements: []
shadow_required: true
shadow_skip_reason: ""
shadow_cutover_criteria:
  - "Integration test tests/integration/per-doc-classifier.integration.test.ts on the 10-doc fixture exits 0 — every doc classified, every polarity ∈ [-1,+1], every confidence ∈ [0,1], every aspect ∈ ASPECT_TAGS, off-topic doc returns polarity=0 AND confidence=0"
  - "scripts/eval-fpb-per-doc.ts run on data/eval/fpb-held-out.csv reports ECE ≤ 0.15 — measured via the Σᵢ (|Bᵢ|/N)|confᵢ − accᵢ| binned formula in <eval_methodology>; ship-gate ECE ≤ 0.15 (CONTEXT.md line 113 acceptance)"
  - "20-B-05 (downstream consumer) reports Cohen's κ ≥ 0.6 on its 50-doc aspect-labeled set against the classifier output emitted by THIS plan's classifier — measurement is owned by 20-B-05; THIS plan ships the classifier output the 20-B-05 κ harness consumes"
  - "Cost per 30-doc batch on the FPB held-out evaluation ≤ $0.05 (measured via 20-Z-03 ProviderCallLog rollup); documented in MODEL-CARD-gemini-per-doc.md"
hard_cleanup_gate: true
must_haves:
  truths:
    - "src/lib/sentiment/aspects.ts exports the literal const ASPECT_TAGS = ['earnings','guidance','regulatory','M&A','macro','product','management'] as const — EXACTLY 7 entries in this order — and the derived type AspectTag = typeof ASPECT_TAGS[number]"
    - "AnalysisResult Zod schema in src/lib/gemini-analysis.ts contains a literal per_document_sentiment: z.array(PerDocSentimentSchema).optional().default([]) field"
    - "PerDocSentimentSchema = z.object({ doc_id: z.string().min(1), polarity: z.number().min(-1).max(1), confidence: z.number().min(0).max(1), aspects: z.array(z.enum(ASPECT_TAGS)).max(7) })"
    - "src/lib/prompts/_v1/gemini-per-doc-sentiment.md exists with frontmatter id: gemini-per-doc-sentiment, version: v1, variables: ['docs_json'], description set; body contains the rubric, ≥5 anchored examples (≥1 per aspect across all examples), an explicit off-topic clause, and an output JSON schema literal — registered in 20-Z-04's prompt registry"
    - "src/lib/sentiment/per-doc-classifier.ts exports classifyDocumentsBatch(docs, opts?) — single Gemini generateText call per batch via renderPrompt('gemini-per-doc-sentiment', { docs_json: JSON.stringify(docs) }); wrapped in withTelemetry('gemini', ...) from 20-Z-03; Zod-validated response; one retry on enum/range violation; final fallback returns aspects: [] (NEVER fabricates an aspect outside ASPECT_TAGS)"
    - "src/lib/sentiment/select-top-docs.ts exports selectTopDocs(pkg: SourcePackage): { doc_id, text, source }[] returning ≤30 docs per ticker — top 20 news (by recency + relevance score) + top 10 community (by upvotes + recency) — hard-capped to defend cost (T-20-B-01-02)"
    - "Pipeline wiring in src/lib/data/source-package.ts: after SourcePackage assembly + BEFORE the main runGeminiAnalysis call, classifyDocumentsBatch(selectTopDocs(pkg)) runs under FEATURE_PER_DOC_SENTIMENT flag (default 'shadow') and persists each result as a SentimentObservation row via 20-Z-01's insertObservation() with classifier_version='gemini-per-doc-v1', classifier_score=polarity, model_version='gemini-per-doc-v1', and aspects in author_features_snapshot (DEPRECATED) — see schema_check_blocker below for the proper aspects column"
    - "SentimentObservation Prisma model carries an `aspects` String[] (or Json) column — 20-Z-01 did NOT ship this column (confirmed via 20-Z-01-PLAN.md interfaces block lines 167-186), so THIS plan ships an ADDITIVE prisma db push that adds `aspects String[] @default([])` to the SentimentObservation model — see [BLOCKING] Task 1"
    - "FEATURE_PER_DOC_SENTIMENT: 'off' | 'shadow' | 'on' flag added to src/lib/features.ts; default 'shadow'; off branch sets per_document_sentiment: [] and writes 0 SentimentObservation rows"
    - "scripts/eval-fpb-per-doc.ts loads data/eval/fpb-held-out.csv (a held-out subset of the Financial PhraseBank — Malo et al. 2014; Araci 2019 FinBERT baseline), runs classifyDocumentsBatch on every row, computes ECE via 10-bin reliability binning per the binned formula ECE = Σᵢ (|Bᵢ|/N)|confᵢ − accᵢ|, writes /tmp/fpb-ece-{ISO-date}.json, prints PASS/FAIL on the ECE ≤ 0.15 ship gate"
    - "data/eval/fpb-held-out.csv carries a top-of-file comment citing Malo et al. (2014) `Good debt or bad debt: Detecting semantic orientations in economic texts` and the Apache-2 license of the FPB dataset; ≥100 rows held out for the eval"
    - "Unit tests ≥ 6: Zod rejects malformed per_document_sentiment shape (polarity > 1, polarity < -1, confidence > 1, confidence < 0, aspect outside enum, doc_id empty); ASPECT_TAGS exhaustive (typeof check covers all 7); empty input → empty output; off-topic doc fixture → polarity = 0 AND confidence = 0; one-retry fallback returns aspects: [] when Gemini emits an out-of-enum aspect on both attempts"
    - "Integration test tests/integration/per-doc-classifier.integration.test.ts on a 10-doc fixture (`tests/fixtures/per-doc-classification/ten-doc-fixture.json`) asserts: all 10 classified, ranges valid, ≥1 doc tagged per aspect across the set, off-topic doc returns polarity=0+confidence=0; runs against live AI Gateway (skips with note when VERCEL_OIDC_TOKEN absent)"
    - "Model card docs/cards/MODEL-CARD-gemini-per-doc.md committed per 20-Z-02 Mitchell-2019 template: model = google/gemini-3.1-flash-lite via Vercel AI Gateway, prompt = gemini-per-doc-sentiment@v1, training data = N/A (zero-shot prompted classifier), evaluation = FPB held-out subset + 20-B-05 50-doc human aspect set (κ owned by 20-B-05), intended use, out-of-distribution behavior (non-English docs, code snippets, image OCR text), known failure modes (off-topic hallucination → mitigated by rubric clause + integration test), retrain cadence = quarterly prompt review"
    - "HYPERPARAMETERS.md documents: ECE_SHIP_GATE = 0.15 (CONTEXT.md line 113 derived; FPB held-out evaluation); TOP_NEWS = 20, TOP_COMMUNITY = 10, COST_CAP_DOCS_PER_TICKER = 30 (T-20-B-01-02 mitigation); ASPECT_TAGS = the 7-element literal"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "ADDITIVE column on SentimentObservation: aspects String[] @default([]) — backfill defaults empty; 20-Z-01's composite unique on (ticker, message_id, model_version) unchanged"
      contains: "aspects"
    - path: "src/lib/sentiment/aspects.ts"
      provides: "ASPECT_TAGS literal (7 entries) + AspectTag type derivation + isAspectTag(x) type guard"
      contains: "export const ASPECT_TAGS"
    - path: "src/lib/sentiment/per-doc-classifier.ts"
      provides: "classifyDocumentsBatch(docs, opts?) — Gemini per-doc classification call; withTelemetry-wrapped; Zod-validated; one retry; aspects: [] fallback"
      contains: "classifyDocumentsBatch"
    - path: "src/lib/sentiment/select-top-docs.ts"
      provides: "selectTopDocs(pkg) — 20 news + 10 community cap (30 total) selection"
      contains: "selectTopDocs"
    - path: "src/lib/sentiment/__tests__/aspects.unit.test.ts"
      provides: "≥3 unit tests — ASPECT_TAGS length === 7, isAspectTag rejects unknown strings, typeof check"
      contains: "ASPECT_TAGS"
    - path: "src/lib/sentiment/__tests__/per-doc-classifier.unit.test.ts"
      provides: "≥6 unit tests — Zod accept/reject malformed, empty input, retry-fallback, off-topic doc, range bounds"
      contains: "classifyDocumentsBatch"
    - path: "src/lib/sentiment/__tests__/select-top-docs.unit.test.ts"
      provides: "≥4 unit tests — 30-doc cap, news vs community ratio, empty pkg, recency tie-break"
      contains: "selectTopDocs"
    - path: "src/lib/gemini-analysis.ts"
      provides: "AnalysisResultSchema extended with PerDocSentimentSchema + per_document_sentiment field (optional, default [])"
      contains: "per_document_sentiment"
    - path: "src/lib/types.ts"
      provides: "Re-exports AspectTag from sentiment/aspects; declares PerDocSentimentResult type"
      contains: "AspectTag"
    - path: "src/lib/data/source-package.ts"
      provides: "Wires classifyDocumentsBatch into the pipeline under FEATURE_PER_DOC_SENTIMENT; persists rows via 20-Z-01 insertObservation"
      contains: "classifyDocumentsBatch"
    - path: "src/lib/features.ts"
      provides: "FEATURE_PER_DOC_SENTIMENT: 'off' | 'shadow' | 'on' flag; default 'shadow'"
      contains: "FEATURE_PER_DOC_SENTIMENT"
    - path: "src/lib/prompts/registry.ts"
      provides: "Adds 'gemini-per-doc-sentiment' to the PromptId closed union; manifest entry references _v1/gemini-per-doc-sentiment.md"
      contains: "gemini-per-doc-sentiment"
    - path: "src/lib/prompts/_v1/gemini-per-doc-sentiment.md"
      provides: "v1 of the per-doc classification prompt — rubric + ≥5 anchored examples + off-topic clause + output JSON schema"
      contains: "id: gemini-per-doc-sentiment"
    - path: "tests/prompts/registry.unit.test.ts"
      provides: "Adds ≥2 tests proving getPrompt('gemini-per-doc-sentiment') and getPrompt('gemini-per-doc-sentiment','v1') both resolve"
      contains: "gemini-per-doc-sentiment"
    - path: "tests/prompts/__snapshots__/registry.golden.test.ts.snap"
      provides: "New snapshot lines for the gemini-per-doc-sentiment@v1 body (auto-generated by the 20-Z-04 golden test; this plan's commit must include the regenerated snapshot)"
      contains: "gemini-per-doc-sentiment"
    - path: "tests/fixtures/per-doc-classification/ten-doc-fixture.json"
      provides: "10 hand-curated docs spanning all 7 aspects + 1 off-topic doc; each entry { doc_id, text, ticker, source, expected_aspects, expected_polarity_sign }"
      contains: "expected_polarity_sign"
    - path: "tests/fixtures/per-doc-classification/off-topic-doc-fixture.json"
      provides: "Single off-topic doc (e.g., weather report) used by unit + integration tests — assert polarity=0 confidence=0"
      contains: "off-topic"
    - path: "tests/integration/per-doc-classifier.integration.test.ts"
      provides: "Live AI Gateway integration test — 10-doc fixture; skips when VERCEL_OIDC_TOKEN absent; asserts all-classified + range validity + per-aspect coverage + off-topic guard"
      contains: "classifyDocumentsBatch"
    - path: "scripts/eval-fpb-per-doc.ts"
      provides: "FPB ECE eval harness — loads CSV, runs classifier, computes 10-bin ECE, writes /tmp/fpb-ece-{date}.json, prints PASS/FAIL on ECE ≤ 0.15"
      contains: "Expected Calibration Error"
    - path: "data/eval/fpb-held-out.csv"
      provides: "≥100-row held-out Financial PhraseBank subset; CSV header `text,label`; top comment cites Malo 2014 + Apache-2 license"
      contains: "Malo"
    - path: "package.json"
      provides: "Script entry 'eval-fpb-per-doc': 'tsx scripts/eval-fpb-per-doc.ts'"
      contains: "eval-fpb-per-doc"
    - path: "docs/cards/MODEL-CARD-gemini-per-doc.md"
      provides: "Mitchell-2019 model card; cites 20-Z-02 template; references this plan + 20-B-05 κ harness; documents ECE + cost cap + off-topic handling"
      contains: "gemini-per-doc"
    - path: "HYPERPARAMETERS.md"
      provides: "ECE_SHIP_GATE, TOP_NEWS, TOP_COMMUNITY, COST_CAP_DOCS_PER_TICKER, ASPECT_TAGS literal"
      contains: "ECE_SHIP_GATE"
  key_links:
    - from: "src/lib/data/source-package.ts (after SourcePackage assembly)"
      to: "src/lib/sentiment/per-doc-classifier.ts classifyDocumentsBatch()"
      via: "function call under FEATURE_PER_DOC_SENTIMENT flag; results flow into AnalysisResult.per_document_sentiment"
      pattern: "classifyDocumentsBatch\\("
    - from: "src/lib/sentiment/per-doc-classifier.ts"
      to: "src/lib/prompts/registry.ts renderPrompt('gemini-per-doc-sentiment', { docs_json })"
      via: "renderPrompt invocation pinned to gemini-per-doc-sentiment@v1 via 20-Z-04 registry"
      pattern: "renderPrompt\\('gemini-per-doc-sentiment'"
    - from: "src/lib/sentiment/per-doc-classifier.ts"
      to: "src/lib/telemetry/withTelemetry.ts withTelemetry('gemini', ...)"
      via: "wraps the Gemini generateText call per 20-Z-03 S6"
      pattern: "withTelemetry\\('gemini'"
    - from: "src/lib/data/source-package.ts (per-doc result persistence)"
      to: "src/lib/sentiment/observation-store.ts insertObservation()"
      via: "one SentimentObservation row per doc with classifier_version='gemini-per-doc-v1', classifier_score=polarity, aspects=result.aspects"
      pattern: "insertObservation\\("
    - from: "AnalysisResult.per_document_sentiment"
      to: "20-B-05 aggregateByAspect (downstream consumer)"
      via: "20-B-05 reads per_document_sentiment and groups by aspect; THIS plan ships the producer, 20-B-05 ships the consumer"
      pattern: "per_document_sentiment"
    - from: "scripts/eval-fpb-per-doc.ts"
      to: "src/lib/sentiment/per-doc-classifier.ts classifyDocumentsBatch()"
      via: "harness import; runs classifier per FPB row, computes ECE, exits 0 on PASS"
      pattern: "classifyDocumentsBatch"
---

# Plan 20-B-01: Gemini per-document classification with versioned prompt (cheap path)

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for ONE step only: the `npx prisma db push` that adds the additive `aspects String[] @default([])` column to `SentimentObservation` (20-Z-01 did NOT ship this column — confirmed by reading 20-Z-01-PLAN.md interfaces block lines 167-186). All other tasks are autonomous: prompt registry entry, classifier code, Zod schema extension, top-N selector, pipeline wiring under shadow flag, unit/integration tests, FPB eval harness, model card. After the operator confirms the schema push has landed on live Neon, the remaining tasks proceed without further prompts.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:

1. **Shadow lifecycle graduated** ONLY after the four numerical criteria in `shadow_cutover_criteria` are met (10-doc fixture green + ECE ≤ 0.15 + κ ≥ 0.6 measured by 20-B-05 + cost ≤ $0.05/ticker). Until then `FEATURE_PER_DOC_SENTIMENT='shadow'` (writes rows + populates the optional schema field; does NOT block the main analysis). Once `'on'`, the `'shadow'` branch and the flag itself are deleted in a follow-up commit (S3 — flag-removed phase).
2. **No old code deleted yet** at this plan's commit (the existing global aggregated sentiment path keeps emitting; `per_document_sentiment` is additive on AnalysisResult). Flag-removal cleanup happens in the follow-up commit after cutover.
3. **Feature flag introduced**: `FEATURE_PER_DOC_SENTIMENT: 'off' | 'shadow' | 'on'` in `src/lib/features.ts`. Defaults to `'shadow'`.
4. `npm test` (Vitest unit), `npm run test:integration` (live-Neon + live-AI-Gateway Vitest), `npm run test:e2e` (Playwright) all green on `main` post-commit.
5. **Schema Push Gate**: `npx prisma db push` succeeded against the live `DATABASE_URL` (production Neon) AND `pg_indexes` query confirms 20-Z-01's existing composite unique still exists AND the new `aspects` column is `String[]` (or `Json`) with default `[]`.
6. **Prompt Registry Gate**: `getPrompt('gemini-per-doc-sentiment','v1')` resolves; `tests/prompts/registry.golden.test.ts` exits 0 with the new snapshot committed; `npm run check-prompts` (20-Z-04) exits 0.
7. **ECE Gate**: `npx tsx scripts/eval-fpb-per-doc.ts` exits 0 (ECE ≤ 0.15) on `data/eval/fpb-held-out.csv` OR the failure is documented in `MODEL-CARD-gemini-per-doc.md` as a deferred cutover blocker (in which case the flag STAYS in `'shadow'` and the follow-up cutover happens after 20-B-03 temperature-scaling lands).
8. **Cost Gate**: 20-Z-03 ProviderCallLog rollup for `provider='gemini'` shows mean cost ≤ $0.05 per 30-doc batch over the FPB eval window; documented in the model card.
9. **No scope creep**: This plan does NOT ship FinBERT (20-B-02), temperature scaling (20-B-03), source-tier weighting (20-B-04), per-aspect aggregation UI (20-B-05 — this plan ships only the producer; 20-B-05 ships the consumer + κ ship gate), or Loughran-McDonald fallback (20-B-06). It does NOT modify the global aggregated_bull_pct path.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — TOP_NEWS=20, TOP_COMMUNITY=10, COST_CAP=30 are cost-defense affordances cited in the spec on CONTEXT.md line 113 ("Top-N news + community items"). ECE_SHIP_GATE=0.15 is the literal acceptance criterion on CONTEXT.md line 113. ASPECT_TAGS is the fixed 7-element taxonomy from CONTEXT.md line 113. Zero hand-picked thresholds; every parameter traces to the CONTEXT spec.
- **S2 (PIT discipline)** — SentimentObservation rows persisted by this classifier carry `fetched_at = now()` per 20-Z-01's PIT-INVARIANT marker. The `aspects` column is additive; backfill of historical rows defaults to `[]` and 20-Z-01's composite unique on `(ticker, message_id, model_version)` enforces immutability. Any prompt v2 in the future creates a NEW `model_version='gemini-per-doc-v2'` row; v1 rows never overwrite.
- **S3 (shadow lifecycle)** — `FEATURE_PER_DOC_SENTIMENT` defaults to `'shadow'`. Cutover gated by `shadow_cutover_criteria`. Documented.
- **S4 (model card)** — `docs/cards/MODEL-CARD-gemini-per-doc.md` committed per 20-Z-02 template.
- **S5 (pinned model + prompt versions)** — Gemini model pinned via the existing `google/gemini-3.1-flash-lite` AI Gateway routing; prompt pinned via `gemini-per-doc-sentiment@v1` in the 20-Z-04 registry. Any prompt edit without a `_v2/` directory fails 20-Z-04's `npm run check-prompts` CI gate.
- **S6 (telemetry)** — Every Gemini call wraps `withTelemetry('gemini', ...)` from 20-Z-03; cost per ticker per request surfaces in `/insights/sentiment-health`; cost-budget alerter at 1.5× rolling baseline (20-Z-03 owns the alert wiring).
- **S7 (threat model)** — five plan-level threats `T-20-B-01-{01..05}` covering aspect hallucination, cost runaway, off-topic polarity hallucination, unmet ECE ship gate, and prompt drift.
- **S8 (numerical acceptance)** — every DONE criterion is a grep / test exit / ECE number / row-count / cost-rollup. Zero adjectives.
- **S9 (failure-mode coverage)** — integration test covers the off-topic doc case (a doc that's not about any ticker); unit tests cover empty input + retry fallback. The 10-doc fixture spans all 7 aspects + 1 off-topic doc.
- **S10 (regulatory hygiene)** — per-doc results are an internal feature that never publishes outside the existing auth-gated UI; no public-trail. Model card documents quarterly prompt review cadence.

## Forward references

- **20-B-02** (FinBERT) consumes the same per-doc-result shape for high-volume StockTwits passes. Out of scope here.
- **20-B-03** (temperature scaling) refits a scalar T against the FPB held-out + production-labeled subset and updates the `confidence` field post-classifier. Out of scope here; if THIS plan's raw ECE exceeds 0.15, 20-B-03 brings it down and the cutover is deferred until then.
- **20-B-05** (per-aspect aggregation) consumes `per_document_sentiment` and renders the per-aspect chip stack. Cohen's κ ≥ 0.6 ship gate is OWNED by 20-B-05; THIS plan ships the classifier output the κ harness measures.
- **20-Z-03** (telemetry) owns the cost alerter; THIS plan wires `withTelemetry('gemini', ...)`.

</universal_preamble>

<objective>
Add Gemini per-document sentiment classification as the cheap path of Wave B. Top-N news + community docs per ticker → `{doc_id, polarity ∈ [-1,+1], confidence ∈ [0,1], aspects: AspectTag[]}` for each doc, where AspectTag is the fixed 7-element taxonomy `{earnings, guidance, regulatory, M&A, macro, product, management}` with inter-aspect overlap allowed. Prompt is versioned via the 20-Z-04 registry (`gemini-per-doc-sentiment@v1`). Per-doc results are persisted as `SentimentObservation` rows (20-Z-01) under `classifier_version='gemini-per-doc-v1'` + `model_version='gemini-per-doc-v1'` + new `aspects` column.

Purpose: This is the **per-document NLP** Wave B baseline that downstream plans build on. Without per-doc classification, the system collapses to vendor-tagged `bull_pct` rollups (RavenPack/MarketPsych methodology gap — see CONTEXT.md "Per-document classification" research summary). Aspect tagging breaks the global-mean averaging-out problem that bites tickers where bull-on-product and bear-on-guidance cancel (CONTEXT.md "Aspect-based decomposition (TABFSA)").

Output:
- 1 new prompt registry entry (`gemini-per-doc-sentiment@v1`) — versioned via 20-Z-04
- 1 ASPECT_TAGS literal + AspectTag type — single source of truth consumed by 20-B-05
- 1 classifier function (`classifyDocumentsBatch`) — Gemini-backed, withTelemetry-wrapped, Zod-validated, one-retry fallback
- 1 top-N selector (`selectTopDocs`) — 20 news + 10 community + 30-doc cap
- 1 additive Prisma schema column (`aspects String[]` on SentimentObservation) — operator-gated `prisma db push`
- 1 AnalysisResult schema extension (`per_document_sentiment` array)
- 1 pipeline wiring under `FEATURE_PER_DOC_SENTIMENT='shadow'`
- 1 FPB ECE eval harness (`scripts/eval-fpb-per-doc.ts`) + held-out CSV
- ≥13 unit tests + 1 integration test on a 10-doc fixture
- 1 Mitchell-2019 model card
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-03-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-04-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-B-05-PLAN.md
@CLAUDE.md
@src/lib/gemini-analysis.ts
@src/lib/research-brief.ts
@src/lib/types.ts
@src/lib/features.ts
@prisma/schema.prisma

<interfaces>
<!-- AUTHORITATIVE — copy verbatim. Snapshot tests in Task 1 + the prompt registry lock against these names. -->

```typescript
// src/lib/sentiment/aspects.ts — NEW (single source of truth for AspectTag; 20-B-05 re-imports)

/** Fixed 7-element taxonomy from CONTEXT.md line 113. Order is significant — UI chip rendering
 *  in 20-B-05 iterates this array. Adding an aspect REQUIRES a new prompt version (v2) and
 *  a model card update; deletions are forbidden (would break historical SentimentObservation rows). */
export const ASPECT_TAGS = [
  'earnings',
  'guidance',
  'regulatory',
  'M&A',
  'macro',
  'product',
  'management',
] as const;

export type AspectTag = typeof ASPECT_TAGS[number];

/** Runtime type guard — used by the classifier's one-retry fallback path and by 20-B-05. */
export function isAspectTag(x: unknown): x is AspectTag {
  return typeof x === 'string' && (ASPECT_TAGS as readonly string[]).includes(x);
}
```

```typescript
// src/lib/sentiment/per-doc-classifier.ts — NEW

import type { AspectTag } from './aspects';

export interface PerDocInput {
  doc_id: string;            // stable id — for news, use the news_url hash; for community, the StockTwits/Reddit message_id
  text: string;              // full body text — caller is responsible for truncation (recommend ≤2000 chars per doc)
  source: 'news' | 'community';  // routing for telemetry tagging
}

export interface PerDocSentimentResult {
  doc_id: string;
  polarity: number;          // [-1, +1] — Zod-enforced range
  confidence: number;        // [ 0, +1] — Zod-enforced range
  aspects: AspectTag[];      // ⊆ ASPECT_TAGS; max 7; empty means "no aspect applies / off-topic"
}

export interface ClassifyOpts {
  /** Override default prompt version pin (gemini-per-doc-sentiment@v1). */
  promptVersion?: 'v1' | 'v2';
  /** Inject for tests — defaults to renderPrompt + generateText pipeline. */
  _gemini?: (prompt: string) => Promise<unknown>;
}

/** Single Gemini call per batch; one retry on Zod-enum violation; final fallback returns
 *  results with `aspects: []` (NEVER fabricates an aspect outside ASPECT_TAGS). On total failure
 *  (both attempts) returns `[]` and logs to withTelemetry; caller must handle empty result. */
export async function classifyDocumentsBatch(
  docs: PerDocInput[],
  opts?: ClassifyOpts,
): Promise<PerDocSentimentResult[]>;
```

```typescript
// src/lib/gemini-analysis.ts — EXTENSION (add to AnalysisResultSchema after line 130 verification_claims)

import { ASPECT_TAGS } from '@/lib/sentiment/aspects';

const PerDocSentimentSchema = z.object({
  doc_id: z.string().min(1),
  polarity: z.number().min(-1).max(1),
  confidence: z.number().min(0).max(1),
  aspects: z.array(z.enum(ASPECT_TAGS)).max(7),
});

// Inside AnalysisResultSchema:
per_document_sentiment: z.array(PerDocSentimentSchema).optional().default([]),
```

```typescript
// src/lib/sentiment/select-top-docs.ts — NEW

import type { SourcePackage } from '@/lib/types';
import type { PerDocInput } from './per-doc-classifier';

/** Selects the top N docs per source class for classification.
 *  - Top 20 news (sort: recency DESC, fall back to relevance score if equal-date)
 *  - Top 10 community (sort: upvotes DESC, fall back to recency)
 *  - Hard cap 30 total (defends T-20-B-01-02 cost runaway)
 *  Returns empty array if SourcePackage has no news AND no community items. */
export function selectTopDocs(pkg: SourcePackage): PerDocInput[];
```

```prisma
// prisma/schema.prisma — ADDITIVE modification to existing SentimentObservation model (shipped by 20-Z-01)
// THIS PLAN adds the `aspects` column ONLY. All other columns + composite unique + indexes unchanged.

model SentimentObservation {
  // ... [existing 20-Z-01 columns unchanged: id, ticker, source, message_id, fetched_at, published_at,
  //      raw_body_hash, classifier_version, classifier_score, decay_weight, author_id,
  //      author_features_snapshot, model_version] ...

  aspects                  String[] @default([])   // NEW — 20-B-01: subset of ASPECT_TAGS; empty default for backfill rows

  // ... [@@unique, @@index, @@map unchanged] ...
}
```

```markdown
<!-- src/lib/prompts/_v1/gemini-per-doc-sentiment.md — NEW (registered in 20-Z-04 manifest) -->
--- # (illustrative frontmatter — not real YAML separator)
id: gemini-per-doc-sentiment
version: v1
description: |
  Per-document sentiment + aspect classifier. Input is a JSON array of documents
  (news headlines + community posts). Output is a JSON array of classification
  records, one per input doc, with polarity ∈ [-1,+1], confidence ∈ [0,1], and a
  subset of the fixed 7-element AspectTag taxonomy.
created_at: "2026-05-11T17:00:00Z"
deprecated_at: null
variables: ["docs_json"]
--- # (end of illustrative frontmatter)
[Body: rubric + ≥5 anchored examples (≥1 per aspect) + off-topic clause + output JSON schema literal — see Task 4]
```
</interfaces>

<eval_methodology>
<!-- Expected Calibration Error (ECE) — exact formula and binning convention.
     Cited: Guo et al. 2017 "On Calibration of Modern Neural Networks" (ICML).
     Spec reference: CONTEXT.md S8 + line 113 ("ECE on FPB held-out subset ≤ 0.15"). -->

For N predictions partitioned into M equal-width bins B₁..Bₘ over the confidence axis [0, 1]:

  ECE = Σᵢ (|Bᵢ| / N) · |conf(Bᵢ) − acc(Bᵢ)|

where for bin Bᵢ:
  - conf(Bᵢ) = mean confidence of predictions in Bᵢ
  - acc(Bᵢ)  = fraction of predictions in Bᵢ where sign(polarity) matches the FPB label
               (FPB labels: positive / neutral / negative; we map → polarity sign with
                neutral → "abstain" if confidence < 0.5, else map to the predicted sign)

Default M = 10 bins. Implementation note for `scripts/eval-fpb-per-doc.ts`:

  function ece(records: { confidence: number; correct: boolean }[], bins = 10): number {
    const buckets: { conf_sum: number; correct_count: number; n: number }[] =
      Array.from({ length: bins }, () => ({ conf_sum: 0, correct_count: 0, n: 0 }));
    for (const r of records) {
      const idx = Math.min(bins - 1, Math.floor(r.confidence * bins));
      buckets[idx].n += 1;
      buckets[idx].conf_sum += r.confidence;
      if (r.correct) buckets[idx].correct_count += 1;
    }
    const N = records.length;
    return buckets.reduce((acc, b) => {
      if (b.n === 0) return acc;
      const meanConf = b.conf_sum / b.n;
      const accuracy = b.correct_count / b.n;
      return acc + (b.n / N) * Math.abs(meanConf - accuracy);
    }, 0);
  }

Ship gate: ECE ≤ 0.15 (CONTEXT.md line 113 acceptance). If raw ECE > 0.15, defer cutover
to 20-B-03 (temperature scaling) and document in the model card.
</eval_methodology>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-B-01-01 | Tampering / Information disclosure | Aspect hallucination — Gemini emits an aspect string outside the fixed 7-element ASPECT_TAGS taxonomy, breaking downstream 20-B-05 per-aspect chip rendering and corrupting SentimentObservation.aspects rows. | mitigate | Zod schema uses `z.enum(ASPECT_TAGS)` — any out-of-enum aspect raises ZodError. Classifier catches the error, retries the entire batch ONCE with an explicit "aspects MUST be one of: earnings, guidance, regulatory, M&A, macro, product, management — return [] if no aspect applies" appendix injected into the user message. On second failure, the classifier returns the per-doc record with `aspects: []` rather than a fabricated value. Unit test exercises the retry path with a mock that emits "marketing" then `[]`. **Maps to phase catalog T-28-004** (silent classifier upgrade). |
| T-20-B-01-02 | Denial of service / cost | Cost runaway — a single ticker fetch with 200 news items × 100 community items would push Gemini cost ~6× the budget. | mitigate | `selectTopDocs` hard-caps at 20 news + 10 community = 30 docs/ticker (constants in HYPERPARAMETERS.md). Classifier issues ONE Gemini batch call per ticker (not per doc) — 30 docs in a single prompt vs. 30 separate calls. 20-Z-03 ProviderCallLog records per-call cost; the 1.5× rolling-baseline alerter from 20-Z-03 fires before sustained runaway. **Maps to phase catalog T-28-003** (vendor source rot / cost spike). |
| T-20-B-01-03 | Tampering | Polarity hallucination on off-topic docs — a doc about weather, geopolitics unrelated to the ticker, or pure code snippet receives a non-zero polarity, polluting the per-aspect aggregate downstream. | mitigate | Prompt rubric (gemini-per-doc-sentiment@v1) carries an explicit OFF-TOPIC CLAUSE: "If the document does not mention the ticker, its competitors, its sector, or any of its fundamentals/products/leadership, return `{polarity: 0, confidence: 0, aspects: []}`. Do NOT guess." Integration test asserts `tests/fixtures/per-doc-classification/off-topic-doc-fixture.json` (a single weather report) returns `polarity = 0 AND confidence = 0`. **Maps to phase catalog T-28-001** (manipulation skews sentiment) as a related defense. |
| T-20-B-01-04 | Configuration | ECE > 0.15 ship gate unmet — the raw Gemini classifier may not meet the 0.15 ECE bar on FPB without temperature scaling. | mitigate | T-scaling lives in 20-B-03. If THIS plan's raw ECE exceeds 0.15, the flag STAYS in `'shadow'`, the failure is documented in `MODEL-CARD-gemini-per-doc.md` as a deferred cutover, and the follow-up cutover happens after 20-B-03 lands. Acceptance: documented deferral is a PASS for this plan; ECE measurement is mandatory and the result (PASS or deferred) must be in the SUMMARY. **Maps to phase catalog T-28-002** (calibration discipline). |
| T-20-B-01-05 | Tampering | Prompt drift — engineer edits the rubric body of `_v1/gemini-per-doc-sentiment.md` without bumping to v2, silently changing classifier behavior on existing SentimentObservation rows. | mitigate | 20-Z-04 ships the prompt-version golden snapshot test (`tests/prompts/registry.golden.test.ts`) and the `npm run check-prompts` CI gate. THIS plan adds the new prompt body to the snapshot on first commit; any subsequent body edit without a sibling `_v2/` directory fails the CI gate. Defense-in-depth: `renderPrompt` throws `PromptVarMissingError` on any unfilled `{{...}}` placeholder (20-Z-04 T-20-Z-04-03), preventing silent injection of an empty docs_json. **Maps to phase catalog T-28-004** (silent classifier upgrade). |

</threat_model>

<tasks>

<task type="auto" tdd="false" id="20-B-01-01">
  <name>Task 1: [BLOCKING — operator] Add aspects column to SentimentObservation and prisma db push live Neon</name>
  <files>prisma/schema.prisma</files>
  <action>
    **[BLOCKING] [autonomous: false] — Operator confirmation required for the live db push step.**

    Read 20-Z-01-PLAN.md interfaces block (lines 167-186 of `.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md`) to confirm the SentimentObservation model shipped by 20-Z-01 has columns `(id, ticker, source, message_id, fetched_at, published_at, raw_body_hash, classifier_version, classifier_score, decay_weight, author_id, author_features_snapshot, model_version)` and DOES NOT include an `aspects` column. Confirm via `grep -A 30 "model SentimentObservation" prisma/schema.prisma` that the column is absent.

    Add the additive column to the existing model:

    ```prisma
    model SentimentObservation {
      // ... existing columns from 20-Z-01 ...
      aspects                  String[] @default([])   // 20-B-01: subset of ASPECT_TAGS; empty default for backfill rows
      // ... existing @@unique / @@index / @@map unchanged ...
    }
    ```

    Do NOT modify the composite unique `@@unique([ticker, message_id, model_version])` or any existing index. Do NOT modify any other model.

    Run `npx prisma generate` locally → confirm types update → run `npm test` → confirm no regressions in 20-Z-01 unit tests (`tests/sentiment-observation-store.unit.test.ts`).

    **PAUSE for operator confirmation before `npx prisma db push --schema=prisma/schema.prisma` against live Neon (production `DATABASE_URL`).** This is an additive column with a default — it is non-blocking, but db push against production is operator-gated per CLAUDE.md persistence convention. After push lands, verify in psql:

    ```sql
    \d+ sentiment_observations
    -- aspects column must appear as text[] with default ARRAY[]::text[]
    ```
  </action>
  <verify>
    <automated>npx prisma validate --schema=prisma/schema.prisma && grep -E "^\s*aspects\s+String\[\]" prisma/schema.prisma</automated>
  </verify>
  <done>Schema validates; aspects column committed; operator confirms `prisma db push` landed on live Neon; psql shows `text[] DEFAULT ARRAY[]::text[]` on the `aspects` column.</done>
</task>

<task type="auto" tdd="true" id="20-B-01-02">
  <name>Task 2: ASPECT_TAGS literal + AspectTag type + unit tests (RED → GREEN)</name>
  <files>src/lib/sentiment/aspects.ts, src/lib/sentiment/__tests__/aspects.unit.test.ts</files>
  <behavior>
    - ASPECT_TAGS.length === 7
    - ASPECT_TAGS contains exactly: 'earnings', 'guidance', 'regulatory', 'M&A', 'macro', 'product', 'management' — in that order
    - AspectTag type derives from typeof ASPECT_TAGS[number] (typecheck via `satisfies AspectTag` on each literal)
    - isAspectTag('earnings') === true
    - isAspectTag('marketing') === false
    - isAspectTag(42) === false
    - isAspectTag(null) === false
    - isAspectTag(undefined) === false
  </behavior>
  <action>
    **RED**: Write `src/lib/sentiment/__tests__/aspects.unit.test.ts` with the behaviors above. Import from `@/lib/sentiment/aspects` — module does not exist yet → all tests fail at import.

    **GREEN**: Create `src/lib/sentiment/aspects.ts` with the literal const + type derivation + isAspectTag guard verbatim from `<interfaces>`. Re-export the type from `src/lib/types.ts` so downstream code can import `AspectTag` from the canonical types module:

    ```typescript
    // Add to src/lib/types.ts near the top:
    export type { AspectTag } from './sentiment/aspects';
    export { ASPECT_TAGS, isAspectTag } from './sentiment/aspects';
    ```

    Commit message: `feat(20-B-01): add ASPECT_TAGS literal (7 entries) + AspectTag type guard`
  </action>
  <verify>
    <automated>npx vitest run src/lib/sentiment/__tests__/aspects.unit.test.ts</automated>
  </verify>
  <done>≥3 tests green; ASPECT_TAGS is the single source of truth; 20-B-05 will import from this file when it lands.</done>
</task>

<task type="auto" tdd="false" id="20-B-01-03">
  <name>Task 3: Extend AnalysisResultSchema with per_document_sentiment (Zod) + FEATURE_PER_DOC_SENTIMENT flag</name>
  <files>src/lib/gemini-analysis.ts, src/lib/features.ts, src/lib/types.ts</files>
  <action>
    **Step A**: In `src/lib/gemini-analysis.ts`, after line 130 (`verification_claims: ...`), add the PerDocSentimentSchema definition + field on AnalysisResultSchema verbatim from `<interfaces>`. Import `ASPECT_TAGS` from `@/lib/sentiment/aspects`. Use `z.enum(ASPECT_TAGS)` — Zod accepts a readonly tuple here.

    **Step B**: In `src/lib/features.ts`, add:

    ```typescript
    FEATURE_PER_DOC_SENTIMENT: (process.env.FEATURE_PER_DOC_SENTIMENT as FeatureMode | undefined) ?? 'shadow',
    ```

    Follow the existing FEATURES record convention exactly (see how FEATURE_COVE_TWO_PASS is wired).

    **Step C**: In `src/lib/types.ts`, add the canonical TypeScript shape (separate from Zod for places that don't pull the Zod schema):

    ```typescript
    import type { AspectTag } from './sentiment/aspects';

    export interface PerDocSentimentResult {
      doc_id: string;
      polarity: number;
      confidence: number;
      aspects: AspectTag[];
    }
    ```

    Verify the existing Gemini integration tests (`src/lib/gemini-analysis.test.ts`, `src/lib/__tests__/gemini-analysis.test.ts`, `src/app/api/analysis/__tests__/route.test.ts`) still pass — `per_document_sentiment` is `.optional().default([])` so they should be unaffected.
  </action>
  <verify>
    <automated>npm test -- --run src/lib/__tests__/gemini-analysis.test.ts src/lib/gemini-analysis.test.ts src/app/api/analysis/__tests__/route.test.ts</automated>
  </verify>
  <done>AnalysisResultSchema accepts per_document_sentiment; existing tests green; FEATURE_PER_DOC_SENTIMENT flag wired with default 'shadow'; PerDocSentimentResult exported from types.</done>
</task>

<task type="auto" tdd="false" id="20-B-01-04">
  <name>Task 4: Write gemini-per-doc-sentiment@v1 prompt + register in 20-Z-04 registry</name>
  <files>src/lib/prompts/_v1/gemini-per-doc-sentiment.md, src/lib/prompts/registry.ts, src/lib/prompts/_manifest.ts, tests/prompts/registry.unit.test.ts, tests/prompts/__snapshots__/registry.golden.test.ts.snap</files>
  <action>
    **Step A**: Create `src/lib/prompts/_v1/gemini-per-doc-sentiment.md` with the format from 20-Z-04-PLAN.md `<prompt_file_format>`:

    ```markdown
    --- # (illustrative frontmatter — not real YAML separator)
    id: gemini-per-doc-sentiment
    version: v1
    description: |
      Per-document sentiment + aspect classifier. Input is a JSON array of documents
      (news headlines + community posts). Output is a JSON array of classification
      records, one per input doc, with polarity ∈ [-1,+1], confidence ∈ [0,1], and a
      subset of the fixed 7-element AspectTag taxonomy.
    created_at: "2026-05-11T17:00:00Z"
    deprecated_at: null
    variables: ["docs_json"]
    --- # (end of illustrative frontmatter)
    You are a senior equity research analyst classifying financial documents for sentiment and topical aspect.

    For EACH document in the input array, return one classification record with EXACTLY these fields:
      - doc_id (string, echoed from input)
      - polarity (number in [-1, +1]; -1 strongly bearish, 0 neutral/off-topic, +1 strongly bullish)
      - confidence (number in [0, 1]; 0 means "I have no signal", 1 means "explicit, unambiguous")
      - aspects (array of strings, subset of: earnings, guidance, regulatory, M&A, macro, product, management; inter-aspect overlap allowed; empty when no aspect applies)

    RUBRIC

    polarity:
      - +0.8 to +1.0: explicit positive surprise (beat, raise, approval, settlement won, partnership announced)
      - +0.3 to +0.7: directional positive (in-line beat, mild guidance lift, analyst upgrade)
      - −0.2 to +0.2: neutral / mixed / informational
      - −0.3 to −0.7: directional negative (miss, downgrade, lawsuit filed, guidance cut)
      - −0.8 to −1.0: explicit negative shock (fraud, going-concern, criminal charge, dividend cut)

    confidence:
      - 0.0-0.3: ambiguous phrasing, single weak signal, ticker mention only
      - 0.4-0.7: clear directional language with named facts
      - 0.8-1.0: unambiguous outcome with quoted numbers / official source

    aspects (CHOOSE ONLY FROM THIS FIXED LIST — DO NOT INVENT NEW ASPECTS):
      - earnings: quarterly/annual results, EPS, revenue prints
      - guidance: forward-looking management forecasts, outlook revisions
      - regulatory: FDA / SEC / FTC / DOJ / international regulators, approvals, fines, investigations
      - M&A: acquisitions, mergers, divestitures, spin-offs, LBO rumors
      - macro: interest rates, currency, geopolitical, sector-wide news, commodities
      - product: launches, recalls, customer wins, technology releases
      - management: C-suite changes, board actions, insider conduct, comp issues

    OFF-TOPIC CLAUSE (CRITICAL):
    If a document does NOT mention the ticker, its named competitors, its sector, or any of its fundamentals/products/leadership, return EXACTLY:
      { "doc_id": "<id>", "polarity": 0, "confidence": 0, "aspects": [] }
    Do NOT guess. Do NOT extrapolate. An off-topic doc is a 0/0/empty result.

    ANCHORED EXAMPLES (≥5; ≥1 per aspect across the set)

    Example 1 (earnings, +):
      input:  "AAPL reports Q4 EPS $2.18 vs. $2.10 consensus; revenue $94.9B vs. $94.5B expected. iPhone revenue +6% YoY."
      output: { "doc_id": "ex1", "polarity": 0.8, "confidence": 0.95, "aspects": ["earnings"] }

    Example 2 (guidance + product, −):
      input:  "TSLA cuts FY guidance citing softer demand in China; delays Cybertruck high-volume ramp to H2."
      output: { "doc_id": "ex2", "polarity": -0.6, "confidence": 0.85, "aspects": ["guidance", "product"] }

    Example 3 (regulatory, −):
      input:  "FDA issues complete response letter to BIIB on lecanemab follow-on indication; requires additional Phase 3."
      output: { "doc_id": "ex3", "polarity": -0.7, "confidence": 0.9, "aspects": ["regulatory"] }

    Example 4 (M&A, +):
      input:  "Microsoft to acquire Activision Blizzard for $68.7B, all-cash; expected close FY2024."
      output: { "doc_id": "ex4", "polarity": 0.7, "confidence": 0.95, "aspects": ["M&A"] }

    Example 5 (macro + management, mixed):
      input:  "Fed signals two more 25bp hikes; bank CEOs warn of CRE write-downs into 2026."
      output: { "doc_id": "ex5", "polarity": -0.4, "confidence": 0.7, "aspects": ["macro", "management"] }

    Example 6 (off-topic, 0/0):
      input:  "Severe storms expected across the Midwest this weekend; flash flood warnings in effect."
      output: { "doc_id": "ex6", "polarity": 0, "confidence": 0, "aspects": [] }

    OUTPUT JSON SCHEMA (return EXACTLY this shape; no prose, no preamble):

    {
      "per_document_sentiment": [
        { "doc_id": "string", "polarity": number, "confidence": number, "aspects": ["earnings" | "guidance" | "regulatory" | "M&A" | "macro" | "product" | "management"] }
      ]
    }

    INPUT DOCUMENTS:

    {{docs_json}}
    ```

    **Step B**: Add `'gemini-per-doc-sentiment'` to the PromptId closed union in `src/lib/prompts/registry.ts`. Add a new manifest entry in `src/lib/prompts/_manifest.ts` that imports the new `.md` file and parses its frontmatter. Follow the manifest pattern established by 20-Z-04 exactly (do NOT improvise — 20-Z-04 owns the loader contract).

    **Step C**: Add ≥2 unit tests to `tests/prompts/registry.unit.test.ts`:
    - `getPrompt('gemini-per-doc-sentiment')` returns RegisteredPrompt with version 'v1', non-empty template, deprecated_at: null
    - `getPrompt('gemini-per-doc-sentiment', 'v1')` resolves; the template includes the literal string "OFF-TOPIC CLAUSE"
    - Update the `listPrompts() returns ≥N entries` test bound from N to N+1 (account for the new prompt)
    - Update the "every PromptId in the union appears at least once in listPrompts() (closure guard)" test to remain green

    **Step D**: Run `npx vitest run tests/prompts/registry.golden.test.ts -u` to regenerate the snapshot file with the new prompt body included. Commit the updated `.snap` file. Subsequent body edits without a `_v2/` directory will fail the golden test (T-20-B-01-05 mitigation).
  </action>
  <verify>
    <automated>npx vitest run tests/prompts/registry.unit.test.ts tests/prompts/registry.golden.test.ts && npm run check-prompts</automated>
  </verify>
  <done>Prompt v1 in registry; snapshot committed; ≥2 new tests green; `npm run check-prompts` exits 0; rubric body contains all 7 aspect names + the literal "OFF-TOPIC CLAUSE" + ≥5 anchored examples + JSON output schema.</done>
</task>

<task type="auto" tdd="true" id="20-B-01-05">
  <name>Task 5: Implement classifyDocumentsBatch + unit tests (RED → GREEN)</name>
  <files>src/lib/sentiment/per-doc-classifier.ts, src/lib/sentiment/__tests__/per-doc-classifier.unit.test.ts</files>
  <behavior>
    - classifyDocumentsBatch([]) → resolves to []
    - classifyDocumentsBatch([doc]) → single PerDocSentimentResult with valid ranges
    - Zod rejects { polarity: 1.5 } → caught; one retry; if retry succeeds, returns valid result; if retry also fails, returns the doc record with aspects: [] (no fabrication)
    - Zod rejects { polarity: -1.5 } → same retry path
    - Zod rejects { confidence: 1.5 } → same retry path
    - Zod rejects { confidence: -0.1 } → same retry path
    - Zod rejects { aspects: ['marketing'] } → one retry; on second failure, result returned with aspects: []
    - Zod rejects { doc_id: '' } → throws on first attempt (input contract violation); caller-side bug, NOT retried
    - Mock that returns valid response on first try → no retry, no fallback
    - Off-topic doc fixture (`tests/fixtures/per-doc-classification/off-topic-doc-fixture.json`) → polarity = 0 AND confidence = 0 AND aspects = []
    - withTelemetry('gemini', ...) wrapping verified via spy — single call per batch (not per doc)
  </behavior>
  <action>
    **RED**: Write `src/lib/sentiment/__tests__/per-doc-classifier.unit.test.ts` with all behaviors above. Use a `_gemini` mock injection (from `ClassifyOpts._gemini`) to deterministic-test the retry / fallback logic without hitting the AI Gateway. Tests fail at import — module does not exist.

    **GREEN**: Create `src/lib/sentiment/per-doc-classifier.ts`:

    ```typescript
    import { generateText, Output } from 'ai';
    import { z } from 'zod';
    import { renderPrompt } from '@/lib/prompts/render';
    import { withTelemetry } from '@/lib/telemetry/withTelemetry';
    import { ASPECT_TAGS, type AspectTag } from './aspects';

    export interface PerDocInput { doc_id: string; text: string; source: 'news' | 'community'; }
    export interface PerDocSentimentResult { doc_id: string; polarity: number; confidence: number; aspects: AspectTag[]; }
    export interface ClassifyOpts { promptVersion?: 'v1' | 'v2'; _gemini?: (prompt: string) => Promise<unknown>; }

    const PerDocSchema = z.object({
      doc_id: z.string().min(1),
      polarity: z.number().min(-1).max(1),
      confidence: z.number().min(0).max(1),
      aspects: z.array(z.enum(ASPECT_TAGS)).max(7),
    });
    const ResponseSchema = z.object({ per_document_sentiment: z.array(PerDocSchema) });

    export async function classifyDocumentsBatch(
      docs: PerDocInput[],
      opts: ClassifyOpts = {},
    ): Promise<PerDocSentimentResult[]> {
      if (docs.length === 0) return [];
      // Reject empty doc_ids at the input boundary (caller-side bug).
      for (const d of docs) if (!d.doc_id) throw new Error('PerDocInput.doc_id must be non-empty');

      const prompt = renderPrompt(
        'gemini-per-doc-sentiment',
        { docs_json: JSON.stringify(docs.map(d => ({ doc_id: d.doc_id, text: d.text }))) },
        opts.promptVersion ?? 'v1',
      );

      return withTelemetry('gemini', async () => {
        const callGemini = opts._gemini ?? (async (p: string) => {
          // AI SDK v6: generateText + Output.object({ schema }) — structured-output pattern (NOT the deprecated v4 object-generation API).
          // Matches src/lib/gemini-analysis.ts:1140 pattern. Model pinned per S5.
          const { experimental_output } = await generateText({
            model: 'google/gemini-3.1-flash-lite',
            output: Output.object({ schema: ResponseSchema }),
            prompt: p,
          });
          return experimental_output;
        });

        // Attempt 1
        try {
          const raw = await callGemini(prompt);
          const parsed = ResponseSchema.parse(raw);
          return parsed.per_document_sentiment;
        } catch (err) {
          // Attempt 2 — append a strict aspects-only reminder to the prompt
          try {
            const retryPrompt = prompt + '\n\nRETRY: aspects MUST be one of: earnings, guidance, regulatory, M&A, macro, product, management. Return [] if no aspect applies. polarity ∈ [-1,+1]. confidence ∈ [0,1].';
            const raw2 = await callGemini(retryPrompt);
            const parsed2 = ResponseSchema.parse(raw2);
            return parsed2.per_document_sentiment;
          } catch (_err2) {
            // Final fallback: return per-doc records with aspects: [], polarity: 0, confidence: 0
            return docs.map(d => ({ doc_id: d.doc_id, polarity: 0, confidence: 0, aspects: [] as AspectTag[] }));
          }
        }
      }, { docs_count: docs.length });
    }
    ```

    Run vitest. Iterate until all ≥10 unit tests green.

    Commit message: `feat(20-B-01): implement classifyDocumentsBatch with one-retry + aspects:[] fallback`
  </action>
  <verify>
    <automated>npx vitest run src/lib/sentiment/__tests__/per-doc-classifier.unit.test.ts</automated>
  </verify>
  <done>≥10 unit tests green; retry path exercised; aspects: [] fallback verified; withTelemetry('gemini', ...) wrapping confirmed via spy.</done>
</task>

<task type="auto" tdd="true" id="20-B-01-06">
  <name>Task 6: selectTopDocs (20 news + 10 community + 30 cap) + unit tests (RED → GREEN)</name>
  <files>src/lib/sentiment/select-top-docs.ts, src/lib/sentiment/__tests__/select-top-docs.unit.test.ts</files>
  <behavior>
    - selectTopDocs(emptyPkg) → []
    - selectTopDocs(pkg with 50 news + 20 community) → exactly 30 docs (20 news + 10 community)
    - selectTopDocs(pkg with 5 news + 5 community) → exactly 10 docs (5 + 5)
    - News sorted by recency DESC; community sorted by upvotes DESC (recency tie-break)
    - Each returned doc has { doc_id, text, source: 'news' | 'community' }
    - doc_id for news = sha256(news.url) prefix (16 hex chars); doc_id for community = `${source_name}:${message_id}`
    - news.summary OR news.title is used as text (truncated to 2000 chars)
  </behavior>
  <action>
    **RED**: Write `src/lib/sentiment/__tests__/select-top-docs.unit.test.ts` with fixtures that simulate SourcePackage shape. Mock SourcePackage with synthetic news + community items. Tests fail at import.

    **GREEN**: Create `src/lib/sentiment/select-top-docs.ts`:

    ```typescript
    import { createHash } from 'crypto';
    import type { SourcePackage } from '@/lib/types';
    import type { PerDocInput } from './per-doc-classifier';

    const TOP_NEWS = 20;
    const TOP_COMMUNITY = 10;
    const MAX_TEXT_CHARS = 2000;

    export function selectTopDocs(pkg: SourcePackage): PerDocInput[] {
      const newsItems = (pkg.news_sources?.items ?? [])
        .filter(n => n.url && (n.title || n.summary))
        .sort((a, b) => {
          const da = a.published_at ? Date.parse(a.published_at) : 0;
          const db = b.published_at ? Date.parse(b.published_at) : 0;
          return db - da;
        })
        .slice(0, TOP_NEWS)
        .map<PerDocInput>(n => ({
          doc_id: createHash('sha256').update(n.url ?? '').digest('hex').slice(0, 16),
          text: (n.summary ?? n.title ?? '').slice(0, MAX_TEXT_CHARS),
          source: 'news',
        }));

      const communityItems = (pkg.community_intelligence?.messages ?? [])
        .filter(m => m.message_id && m.body)
        .sort((a, b) => {
          const ua = a.upvotes ?? 0;
          const ub = b.upvotes ?? 0;
          if (ua !== ub) return ub - ua;
          const da = a.fetched_at ? Date.parse(a.fetched_at) : 0;
          const db = b.fetched_at ? Date.parse(b.fetched_at) : 0;
          return db - da;
        })
        .slice(0, TOP_COMMUNITY)
        .map<PerDocInput>(m => ({
          doc_id: `${m.source ?? 'community'}:${m.message_id}`,
          text: m.body.slice(0, MAX_TEXT_CHARS),
          source: 'community',
        }));

      return [...newsItems, ...communityItems];
    }
    ```

    NOTE: The exact SourcePackage shape (especially `news_sources.items` and `community_intelligence.messages`) must be confirmed against the live `src/lib/types.ts` — adjust property paths to match. If `published_at`, `upvotes`, or `fetched_at` are not yet on the SourcePackage shape, fall back gracefully (the filters + null-coalescing above handle that).
  </action>
  <verify>
    <automated>npx vitest run src/lib/sentiment/__tests__/select-top-docs.unit.test.ts</automated>
  </verify>
  <done>≥4 tests green; hard cap at 30 docs enforced; news/community split respected (20/10); doc_id derivation deterministic.</done>
</task>

<task type="auto" tdd="false" id="20-B-01-07">
  <name>Task 7: Wire pipeline — classify under FEATURE_PER_DOC_SENTIMENT='shadow' and persist as SentimentObservation rows</name>
  <files>src/lib/data/source-package.ts, src/lib/gemini-analysis.ts</files>
  <action>
    Locate the SourcePackage assembly call site in `src/lib/data/source-package.ts` (typically the end of `assembleSourcePackage` or wherever the package is returned to the analysis layer). Insert the per-doc classification step under the feature flag:

    ```typescript
    import { FEATURES } from '@/lib/features';
    import { classifyDocumentsBatch } from '@/lib/sentiment/per-doc-classifier';
    import { selectTopDocs } from '@/lib/sentiment/select-top-docs';
    import { insertObservation } from '@/lib/sentiment/observation-store'; // 20-Z-01

    // After SourcePackage is assembled, BEFORE runGeminiAnalysis is called:
    let perDocResults: PerDocSentimentResult[] = [];
    if (FEATURES.FEATURE_PER_DOC_SENTIMENT !== 'off') {
      const docs = selectTopDocs(pkg);
      perDocResults = await classifyDocumentsBatch(docs);

      // Persist each result as a SentimentObservation row (20-Z-01).
      // model_version + classifier_version are BOTH 'gemini-per-doc-v1' (the prompt version pin).
      // aspects column added by Task 1 receives the result.aspects directly.
      await Promise.allSettled(perDocResults.map(r => {
        const docInput = docs.find(d => d.doc_id === r.doc_id);
        if (!docInput) return Promise.resolve();
        return insertObservation({
          ticker: pkg.ticker,
          source: docInput.source === 'news' ? 'news' : 'stocktwits',  // narrow to 20-Z-01 source enum
          message_id: r.doc_id,
          raw_body: docInput.text,
          classifier_version: 'gemini-per-doc-v1',
          classifier_score: r.polarity,
          model_version: 'gemini-per-doc-v1',
          decay_weight: null,  // 20-A-03 populates later via NEW model_version row
          author_id: 'unknown',  // per-doc classifier doesn't carry author info — community path can be enriched in 20-B-04
          author_features_snapshot: { account_age_days: null, follower_count: null, is_verified: null, message_count_30d: null },
          // aspects added by Task 1 column — add to insertObservation input contract if 20-Z-01's DAO requires it:
        } as Parameters<typeof insertObservation>[0] & { aspects: typeof r.aspects });
      }));
    }
    ```

    **Note**: If 20-Z-01's `insertObservation()` signature does not yet accept `aspects` (it was shipped before this column existed), this plan must also extend the DAO. Read `src/lib/sentiment/observation-store.ts` and add `aspects?: AspectTag[]` to `SentimentObservationInput` + write it to the new column. Keep the change additive — existing call sites that don't pass `aspects` default to `[]`.

    Pass `perDocResults` into `runGeminiAnalysis(pkg, perDocResults)` so the main analysis call can include them in the AnalysisResult payload (the Zod schema accepts the field per Task 3).

    **In `src/lib/gemini-analysis.ts`**: Accept the optional second argument; if `FEATURES.FEATURE_PER_DOC_SENTIMENT === 'on'`, write `result.per_document_sentiment = perDocResults` post-generation (overwrites any LLM hallucination). If flag is `'shadow'`, write the field BUT do NOT alter downstream behavior — the 20-B-05 consumer reads it; nothing else in this plan does.

    Add ONE Vitest case in `src/lib/__tests__/gemini-analysis.test.ts` (or create a new file) that asserts:
    - With flag='off', AnalysisResult.per_document_sentiment === [] (or undefined)
    - With flag='shadow' or 'on', AnalysisResult.per_document_sentiment is an array

    Run full test suite. Existing tests must stay green (additive change, default flag is 'shadow', off branch is no-op).
  </action>
  <verify>
    <automated>npm test -- --run src/lib/data src/lib/gemini-analysis src/lib/__tests__</automated>
  </verify>
  <done>Pipeline wires per-doc classifier under FEATURE_PER_DOC_SENTIMENT; results persisted as SentimentObservation rows with `aspects`; AnalysisResult.per_document_sentiment populated under shadow + on; existing tests green.</done>
</task>

<task type="auto" tdd="false" id="20-B-01-08">
  <name>Task 8: 10-doc fixture + live integration test against AI Gateway</name>
  <files>tests/fixtures/per-doc-classification/ten-doc-fixture.json, tests/fixtures/per-doc-classification/off-topic-doc-fixture.json, tests/integration/per-doc-classifier.integration.test.ts</files>
  <action>
    **Step A**: Curate `tests/fixtures/per-doc-classification/ten-doc-fixture.json` — 10 hand-written docs spanning all 7 aspects + 1 off-topic doc + 2 multi-aspect docs:

    ```json
    [
      { "doc_id": "fx-01", "text": "AAPL Q4 EPS $2.18 beats $2.10 consensus; iPhone revenue +6% YoY.", "source": "news", "expected_aspects": ["earnings"], "expected_polarity_sign": 1 },
      { "doc_id": "fx-02", "text": "TSLA cuts FY guidance; Cybertruck ramp delayed to H2.", "source": "news", "expected_aspects": ["guidance", "product"], "expected_polarity_sign": -1 },
      { "doc_id": "fx-03", "text": "FDA issues CRL to BIIB on lecanemab follow-on indication.", "source": "news", "expected_aspects": ["regulatory"], "expected_polarity_sign": -1 },
      { "doc_id": "fx-04", "text": "MSFT to acquire Activision Blizzard for $68.7B all-cash.", "source": "news", "expected_aspects": ["M&A"], "expected_polarity_sign": 1 },
      { "doc_id": "fx-05", "text": "Fed signals two more 25bp hikes; CRE pressure across regional banks.", "source": "news", "expected_aspects": ["macro"], "expected_polarity_sign": -1 },
      { "doc_id": "fx-06", "text": "NVDA launches new H300 inference chip; preorders sold out.", "source": "news", "expected_aspects": ["product"], "expected_polarity_sign": 1 },
      { "doc_id": "fx-07", "text": "OXY CEO Vicki Hollub to step down at year end; CFO to interim.", "source": "news", "expected_aspects": ["management"], "expected_polarity_sign": 0 },
      { "doc_id": "fx-08", "text": "GME short interest down 12%; users posting diamond hands on r/wallstreetbets.", "source": "community", "expected_aspects": [], "expected_polarity_sign": 1 },
      { "doc_id": "fx-09", "text": "Severe thunderstorms expected across the Midwest this weekend.", "source": "news", "expected_aspects": [], "expected_polarity_sign": 0 },
      { "doc_id": "fx-10", "text": "META beats EPS but issues weak Q3 ad guidance; ARPU softer in EU.", "source": "news", "expected_aspects": ["earnings", "guidance"], "expected_polarity_sign": 0 }
    ]
    ```

    `tests/fixtures/per-doc-classification/off-topic-doc-fixture.json`:
    ```json
    { "doc_id": "off-01", "text": "Severe thunderstorms expected across the Midwest this weekend; flash flood warnings in effect.", "source": "news" }
    ```

    **Step B**: Write `tests/integration/per-doc-classifier.integration.test.ts`:

    ```typescript
    import { describe, it, expect } from 'vitest';
    import { readFileSync } from 'fs';
    import { join } from 'path';
    import { classifyDocumentsBatch } from '@/lib/sentiment/per-doc-classifier';
    import { ASPECT_TAGS } from '@/lib/sentiment/aspects';

    const skipIfNoAuth = !process.env.VERCEL_OIDC_TOKEN && !process.env.AI_GATEWAY_API_KEY;

    describe.skipIf(skipIfNoAuth)('per-doc-classifier integration', () => {
      it('classifies the 10-doc fixture; all ranges valid; ≥1 doc per aspect across set; off-topic returns 0/0', async () => {
        const fixture = JSON.parse(readFileSync(join(__dirname, '../fixtures/per-doc-classification/ten-doc-fixture.json'), 'utf8'));
        const inputs = fixture.map((f: any) => ({ doc_id: f.doc_id, text: f.text, source: f.source }));

        const results = await classifyDocumentsBatch(inputs);

        expect(results.length).toBe(10);
        for (const r of results) {
          expect(r.polarity).toBeGreaterThanOrEqual(-1);
          expect(r.polarity).toBeLessThanOrEqual(1);
          expect(r.confidence).toBeGreaterThanOrEqual(0);
          expect(r.confidence).toBeLessThanOrEqual(1);
          for (const a of r.aspects) expect(ASPECT_TAGS).toContain(a);
        }

        // Off-topic guard
        const offTopic = results.find(r => r.doc_id === 'fx-09');
        expect(offTopic?.polarity).toBe(0);
        expect(offTopic?.confidence).toBe(0);
        expect(offTopic?.aspects).toEqual([]);

        // ≥1 doc tagged per aspect across the set (excluding off-topic)
        const seen = new Set<string>();
        for (const r of results) for (const a of r.aspects) seen.add(a);
        for (const a of ASPECT_TAGS) expect(seen.has(a)).toBe(true);
      }, 60_000);
    });
    ```

    The 60-second timeout accommodates AI Gateway cold-start. The test skips locally when no auth is present; CI on Vercel provides VERCEL_OIDC_TOKEN.
  </action>
  <verify>
    <automated>npm run test:integration -- --run tests/integration/per-doc-classifier.integration.test.ts</automated>
  </verify>
  <done>10-doc fixture exists; integration test exits 0 on CI/live AI Gateway; off-topic guard validated; all 7 aspects covered by ≥1 doc.</done>
</task>

<task type="auto" tdd="false" id="20-B-01-09">
  <name>Task 9: FPB ECE eval harness + held-out CSV</name>
  <files>scripts/eval-fpb-per-doc.ts, data/eval/fpb-held-out.csv, package.json</files>
  <action>
    **Step A**: Curate `data/eval/fpb-held-out.csv`. Header comment + columns:

    ```csv
    # Financial PhraseBank held-out subset for ECE eval — 20-B-01
    # Source: Malo, Sinha, Korhonen, Wallenius, Takala. 2014.
    #   "Good debt or bad debt: Detecting semantic orientations in economic texts."
    #   Journal of the Association for Information Science and Technology, 65(4).
    # License: Apache-2.0 (full FPB corpus available at https://huggingface.co/datasets/financial_phrasebank)
    # Held-out split: ≥100 rows, stratified across positive / neutral / negative,
    # using the sentences_50agree subset (>=50% annotator agreement).
    text,label
    "Operating profit rose 3.0 % to EUR 12.3 mn from EUR 11.9 mn",positive
    "The international electronic industry company Elcoteq has laid off tens of employees",negative
    "Glaston signed a contract for the delivery of a 350-tonne press to a Russian customer",neutral
    ...
    ```

    The full ≥100-row CSV must be physically present in the repo (operator may auto-generate by sampling `sentences_50agree.txt` from the HuggingFace mirror).

    **Step B**: Write `scripts/eval-fpb-per-doc.ts`:

    ```typescript
    #!/usr/bin/env tsx
    import { readFileSync, writeFileSync } from 'fs';
    import { join } from 'path';
    import { parse } from 'csv-parse/sync';
    import { classifyDocumentsBatch } from '../src/lib/sentiment/per-doc-classifier';

    function ece(records: { confidence: number; correct: boolean }[], bins = 10): number {
      const buckets = Array.from({ length: bins }, () => ({ conf_sum: 0, correct_count: 0, n: 0 }));
      for (const r of records) {
        const idx = Math.min(bins - 1, Math.floor(r.confidence * bins));
        buckets[idx].n += 1;
        buckets[idx].conf_sum += r.confidence;
        if (r.correct) buckets[idx].correct_count += 1;
      }
      const N = records.length;
      return buckets.reduce((acc, b) => {
        if (b.n === 0) return acc;
        const meanConf = b.conf_sum / b.n;
        const accuracy = b.correct_count / b.n;
        return acc + (b.n / N) * Math.abs(meanConf - accuracy);
      }, 0);
    }

    async function main() {
      const csvPath = join(process.cwd(), 'data/eval/fpb-held-out.csv');
      const rows = parse(readFileSync(csvPath, 'utf8'), { columns: true, skip_empty_lines: true, comment: '#' }) as Array<{ text: string; label: string }>;

      const docs = rows.map((r, i) => ({ doc_id: `fpb-${i}`, text: r.text, source: 'news' as const }));
      const BATCH = 30;  // cost cap
      const results: { confidence: number; correct: boolean }[] = [];

      for (let i = 0; i < docs.length; i += BATCH) {
        const batch = docs.slice(i, i + BATCH);
        const out = await classifyDocumentsBatch(batch);
        for (let j = 0; j < batch.length; j++) {
          const label = rows[i + j].label;
          const pred = out[j];
          if (!pred) continue;
          const predSign = pred.polarity > 0.2 ? 'positive' : pred.polarity < -0.2 ? 'negative' : 'neutral';
          const correct = predSign === label;
          results.push({ confidence: pred.confidence, correct });
        }
      }

      const e = ece(results, 10);
      const passed = e <= 0.15;
      const out = { date: new Date().toISOString(), n: results.length, ece: e, ship_gate: 0.15, passed };
      writeFileSync(`/tmp/fpb-ece-${out.date}.json`, JSON.stringify(out, null, 2));
      console.log(JSON.stringify(out, null, 2));
      console.log(passed ? 'PASS ECE ≤ 0.15' : 'FAIL ECE > 0.15 — defer cutover to 20-B-03');
      process.exit(passed ? 0 : 1);
    }

    main().catch(e => { console.error(e); process.exit(2); });
    ```

    **Step C**: Add `"eval-fpb-per-doc": "tsx scripts/eval-fpb-per-doc.ts"` to `package.json` scripts.
  </action>
  <verify>
    <automated>npx tsx scripts/eval-fpb-per-doc.ts; ls /tmp/fpb-ece-*.json | tail -1</automated>
  </verify>
  <done>Held-out CSV exists with ≥100 rows + Malo citation; eval script runs end-to-end on live AI Gateway; emits /tmp/fpb-ece-{date}.json with ECE number; exits 0 on PASS or 1 with deferred-cutover note for the model card.</done>
</task>

<task type="auto" tdd="false" id="20-B-01-10">
  <name>Task 10: Model card + HYPERPARAMETERS update</name>
  <files>docs/cards/MODEL-CARD-gemini-per-doc.md, HYPERPARAMETERS.md</files>
  <action>
    **Step A**: Create `docs/cards/MODEL-CARD-gemini-per-doc.md` following the 20-Z-02 Mitchell-2019 template:

    ```markdown
    # Model Card: Gemini Per-Document Sentiment Classifier (gemini-per-doc-v1)

    ## Model Details
    - **Model**: google/gemini-3.1-flash-lite via Vercel AI Gateway
    - **Prompt pin**: gemini-per-doc-sentiment@v1 (registered in 20-Z-04 prompt registry)
    - **Plan**: 20-B-01 (Phase 20)
    - **Date**: 2026-05-11
    - **Owner**: Cipher sentiment-layer

    ## Intended Use
    Per-document polarity + aspect classification for news + community items, top-N (30 cap) per ticker.
    Output: { doc_id, polarity ∈ [-1,+1], confidence ∈ [0,1], aspects ⊆ ASPECT_TAGS }.
    Consumed by 20-B-05 (per-aspect chip stack) and the Diffusion Engine via SentimentObservation rows.

    ## Training Data
    N/A — zero-shot prompted classifier. No fine-tuning. Rubric + ≥5 anchored examples baked into prompt v1.

    ## Evaluation
    - **Calibration**: ECE ≤ 0.15 ship gate on Financial PhraseBank held-out subset (Malo et al. 2014; Apache-2). Measured via `scripts/eval-fpb-per-doc.ts` 10-bin ECE formula.
    - **Aspect κ**: Cohen's kappa ≥ 0.6 on a 50-doc human-labeled set — measurement OWNED by 20-B-05; THIS classifier provides the predictions.
    - **Integration**: 10-doc fixture in `tests/fixtures/per-doc-classification/`, all 7 aspects covered, off-topic guard validated.

    ## Known Failure Modes
    - **Off-topic hallucination** (T-20-B-01-03): mitigated via OFF-TOPIC CLAUSE in rubric + integration-test assertion.
    - **Aspect enum drift** (T-20-B-01-01): mitigated via Zod enum rejection + one retry + `aspects: []` fallback.
    - **Non-English docs**: out-of-distribution; behavior undocumented; future plan may extend rubric.
    - **Code snippets / OCR-from-image text**: treated as off-topic by default; manual review for novel cases.

    ## Out-of-Distribution Behavior
    - Multi-ticker docs (e.g., ETF holdings): classifier returns the dominant signal; per-ticker decomposition is a future enhancement.
    - Sarcasm / negation: Gemini handles "not bullish" reasonably; spot-check failure mode periodically.

    ## Ethical Considerations
    - Persisted SentimentObservation rows contain `raw_body_hash` only (per 20-Z-01 T-20-Z-01-02); no PII.
    - This is an internal research feature; never published outside auth-gated UI per S10 + Phase-29 gate.

    ## Retrain / Re-evaluation Cadence
    - **Prompt review**: quarterly. Any body edit triggers a v2 directory + golden snapshot diff.
    - **ECE re-fit**: monthly via 20-B-03 temperature scaling cron when that plan lands.
    - **κ re-eval**: per 20-B-05 monthly cron `/api/cron/aspect-kappa-monitor`.

    ## Cost
    - **Per 30-doc batch**: ≤ $0.05 (T-20-B-01-02 cost cap). Monitored via 20-Z-03 ProviderCallLog.
    - **Per ticker per cron tick**: ≤ $0.05.

    ## References
    - Malo, Sinha, Korhonen, Wallenius, Takala (2014). "Good debt or bad debt: Detecting semantic orientations in economic texts." JASIST 65(4).
    - Araci (2019). "FinBERT: Financial sentiment analysis with pre-trained language models." arXiv:1908.10063.
    - Mitchell et al. (2019). "Model cards for model reporting." FAT* 2019.
    - Guo et al. (2017). "On calibration of modern neural networks." ICML.
    ```

    **Step B**: Append to `HYPERPARAMETERS.md`:

    ```markdown
    ## 20-B-01: Gemini per-document sentiment classifier

    | Constant | Value | Source / rationale |
    |---|---|---|
    | ASPECT_TAGS | ['earnings','guidance','regulatory','M&A','macro','product','management'] | CONTEXT.md line 113 — fixed 7-element taxonomy; closed enum (20-B-01) |
    | ECE_SHIP_GATE | 0.15 | CONTEXT.md line 113 acceptance — FPB held-out subset; binned 10-bucket ECE |
    | TOP_NEWS | 20 | Per-ticker top news cap (T-20-B-01-02 cost defense) |
    | TOP_COMMUNITY | 10 | Per-ticker top community cap (T-20-B-01-02 cost defense) |
    | COST_CAP_DOCS_PER_TICKER | 30 | TOP_NEWS + TOP_COMMUNITY = 30 hard cap; cited in 20-Z-03 cost alerter baseline |
    | MAX_TEXT_CHARS | 2000 | Per-doc text truncation to bound prompt size |
    ```

    Run `npm test` final time; ensure all green.
  </action>
  <verify>
    <automated>test -f docs/cards/MODEL-CARD-gemini-per-doc.md && grep -q "ECE_SHIP_GATE" HYPERPARAMETERS.md && npm test</automated>
  </verify>
  <done>Model card committed referencing 20-Z-02; HYPERPARAMETERS.md documents all 6 constants; full test suite green.</done>
</task>

</tasks>

<verification>
  Numerical checks for completion (all MUST pass before flag flips from 'shadow' → 'on'):

  1. **Schema gate**: `grep -E "^\s*aspects\s+String\[\]" prisma/schema.prisma` returns 1 match (the additive column on SentimentObservation).
  2. **Prompt registry gate**: `npx vitest run tests/prompts/registry.unit.test.ts tests/prompts/registry.golden.test.ts` exits 0; `npm run check-prompts` exits 0; `ls src/lib/prompts/_v1/gemini-per-doc-sentiment.md` succeeds.
  3. **Zod gate**: `npm test -- --run src/lib/__tests__/gemini-analysis.test.ts` green; Zod rejects malformed per_document_sentiment (out-of-range polarity, out-of-enum aspect, empty doc_id).
  4. **Unit gate**: ≥13 unit tests across 3 files (aspects ≥3, classifier ≥6, select-top-docs ≥4) all green.
  5. **Integration gate**: `npm run test:integration -- --run tests/integration/per-doc-classifier.integration.test.ts` exits 0 on the 10-doc fixture; all 7 aspects covered by ≥1 doc; off-topic doc returns polarity=0 + confidence=0.
  6. **ECE gate**: `npx tsx scripts/eval-fpb-per-doc.ts` exits 0 with ECE ≤ 0.15 on `data/eval/fpb-held-out.csv` OR documented deferred cutover to 20-B-03 in the model card.
  7. **Cost gate**: 20-Z-03 ProviderCallLog rollup confirms mean cost ≤ $0.05 per 30-doc batch over the FPB eval window.
  8. **Model card gate**: `docs/cards/MODEL-CARD-gemini-per-doc.md` exists with all Mitchell-2019 sections + Malo 2014 citation.
  9. **No scope creep gate**: `grep -lE "(FinBERT|finbert|loughran|temperature.scaling|source.tier)" src/lib/sentiment/per-doc-classifier.ts src/lib/sentiment/aspects.ts src/lib/sentiment/select-top-docs.ts` returns 0 files.
</verification>

<success_criteria>
- ASPECT_TAGS exported as a 7-element `as const` literal; AspectTag type derived; isAspectTag guard implemented.
- AnalysisResultSchema accepts `per_document_sentiment: z.array(PerDocSentimentSchema).optional().default([])`.
- `gemini-per-doc-sentiment@v1` registered in the 20-Z-04 prompt registry with rubric + ≥5 anchored examples + off-topic clause + JSON output schema.
- `classifyDocumentsBatch` wraps a single Gemini batch call with `withTelemetry('gemini', ...)`; one retry on Zod-enum violation; `aspects: []` fallback on second failure.
- `selectTopDocs` caps at 20 news + 10 community = 30 docs/ticker.
- Pipeline persists each per-doc result as a SentimentObservation row with `classifier_version='gemini-per-doc-v1'`, `model_version='gemini-per-doc-v1'`, and the new `aspects` column populated.
- 10-doc fixture integration test green; off-topic guard validated; all 7 aspects exercised.
- FPB held-out ECE ≤ 0.15 OR deferred to 20-B-03 with documented note in the model card.
- Mean cost ≤ $0.05 per 30-doc batch confirmed in 20-Z-03 telemetry.
- Mitchell-2019 model card committed; HYPERPARAMETERS.md updated.
- FEATURE_PER_DOC_SENTIMENT defaults to `'shadow'`; cutover to `'on'` is operator-gated by the four numerical criteria in frontmatter `shadow_cutover_criteria`.
</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-B-01-SUMMARY.md` per the standard summary template — include the measured ECE value, the cost-per-batch number, the number of SentimentObservation rows written during the first cron cycle post-merge, and the cutover decision (graduated to 'on' OR deferred to 20-B-03 with reason).
</output>
