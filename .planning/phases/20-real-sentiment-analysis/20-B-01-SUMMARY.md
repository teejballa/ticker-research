---
phase: 20
plan: 20-B-01
subsystem: sentiment-layer
tags: [gemini, per-doc-classifier, aspect-taxonomy, prompt-registry, fpb-eval, model-card, shadow]
dependency_graph:
  requires:
    - 20-Z-01  # SentimentObservation feature store
    - 20-Z-03  # withTelemetry + ProviderCallLog
    - 20-Z-04  # Versioned prompt registry
  provides:
    - per-doc-classifier: classifyDocumentsBatch(docs, opts?) → PerDocSentimentResult[]
    - aspect-taxonomy: ASPECT_TAGS literal + AspectTag type + isAspectTag guard
    - prompt-pin: gemini-per-doc-sentiment@v1 in the 20-Z-04 registry
    - per-doc-sentiment-column: SentimentObservation.aspects String[]
    - per-doc-sentiment-field: AnalysisResult.per_document_sentiment
    - fpb-ece-harness: scripts/eval-fpb-per-doc.ts
  affects:
    - 20-B-03  # temperature scaling refits the confidence field shipped here
    - 20-B-05  # per-aspect aggregator consumes per_document_sentiment + the aspects column
tech-stack:
  added:
    - ai-sdk-output-object (structured Gemini output via Vercel AI Gateway)
  patterns:
    - shadow-lifecycle (default 'shadow' until 4 cutover criteria met)
    - one-retry + aspects:[] fallback (never fabricates outside the taxonomy)
    - prompt-version-pin via 20-Z-04 registry + golden snapshot drift guard
key-files:
  created:
    - src/lib/sentiment/aspects.ts
    - src/lib/sentiment/per-doc-classifier.ts
    - src/lib/sentiment/select-top-docs.ts
    - src/lib/sentiment/__tests__/aspects.unit.test.ts
    - src/lib/sentiment/__tests__/per-doc-classifier.unit.test.ts
    - src/lib/sentiment/__tests__/select-top-docs.unit.test.ts
    - src/lib/prompts/_v1/gemini-per-doc-sentiment.md
    - tests/fixtures/per-doc-classification/ten-doc-fixture.json
    - tests/fixtures/per-doc-classification/off-topic-doc-fixture.json
    - tests/integration/per-doc-classifier.integration.test.ts
    - scripts/eval-fpb-per-doc.ts
    - data/eval/fpb-held-out.csv
    - docs/cards/MODEL-CARD-gemini-per-doc.md
  modified:
    - prisma/schema.prisma                            # +aspects String[] @default([]) on SentimentObservation
    - src/lib/types.ts                                # AspectTag re-export + PerDocSentimentResult + AnalysisResult.per_document_sentiment
    - src/lib/features.ts                             # per_doc_sentiment flag (default 'shadow')
    - src/lib/gemini-analysis.ts                      # AnalysisResultSchema extension + post-process sidecar pickup
    - src/lib/sentiment/observation-store.ts         # +aspects?: string[] additive input field
    - src/lib/data/source-package.ts                  # classifyDocumentsBatch wired post-collectAllData under flag
    - src/lib/prompts/registry.ts                     # PromptId union += 'gemini-per-doc-sentiment'
    - tests/prompts/registry.unit.test.ts            # closure guard + per-doc body assertions
    - tests/prompts/__snapshots__/registry.golden.test.ts.snap  # regenerated
    - HYPERPARAMETERS.md                              # +20-B-01 6-constant section
    - package.json                                    # +eval-fpb-per-doc script
    - .gitignore                                      # !data/eval/*.csv exception (reproducibility)
decisions:
  - "Single batched Gemini call per ticker (not per-doc) — T-20-B-01-02 cost defense at 30 docs/req"
  - "One retry on Zod failure with appendix; final fallback aspects:[] polarity:0 confidence:0 — NEVER fabricates"
  - "FEATURE_PER_DOC_SENTIMENT defaults to 'shadow' even when env var absent (cutover stays operator-gated)"
  - "Community docs read via optional _raw_community_docs sidecar — SourcePackage shape not changed (graceful for callers that don't persist CommunityChatter rows yet)"
  - "Source enum mapping: news→'news', community→'reddit' for SentimentObservation.source (20-Z-01 allowlist constraint)"
metrics:
  duration_seconds: 4500
  completed_date: "2026-05-13"
  task_count: 10
  files_created: 13
  files_modified: 12
  unit_tests_added: 30        # 6 aspects + 14 classifier + 10 select-top-docs
  integration_tests_added: 1
  golden_snapshots_regenerated: 1
---

# Phase 20 Plan B-01: Gemini per-document classification with versioned prompt (cheap path) Summary

**Wave-B baseline shipped: per-doc sentiment + aspect classifier wired under FEATURE_PER_DOC_SENTIMENT='shadow' with the fixed 7-element AspectTag taxonomy + 20-Z-04 prompt-version pin.**

## What shipped

1. **`ASPECT_TAGS` literal** (`src/lib/sentiment/aspects.ts`) — 7-element closed enum `{earnings, guidance, regulatory, M&A, macro, product, management}` with `AspectTag` type derivation + `isAspectTag` runtime guard. Re-exported from `src/lib/types.ts`. 6 unit tests pinning length, order, and guard behavior.

2. **`PerDocSentimentSchema` Zod extension on `AnalysisResultSchema`** — `per_document_sentiment: z.array(...).optional().default([])` with `polarity ∈ [-1,+1]`, `confidence ∈ [0,1]`, `aspects: z.array(z.enum(ASPECT_TAGS)).max(7)`. Matching `AnalysisResult.per_document_sentiment` field on the typed interface.

3. **`gemini-per-doc-sentiment@v1` prompt** registered in the 20-Z-04 registry. Body contains the polarity rubric, confidence rubric, all 7 aspect definitions, an explicit OFF-TOPIC CLAUSE (returns 0/0/[] for non-ticker docs), 6 anchored examples covering every aspect + an off-topic case, and the JSON output schema literal. Golden snapshot regenerated.

4. **`classifyDocumentsBatch(docs, opts?)`** (`src/lib/sentiment/per-doc-classifier.ts`) — single Gemini call per batch via `renderPrompt('gemini-per-doc-sentiment')` wrapped in `withTelemetry('gemini', ...)` per 20-Z-03 S6. One retry on Zod failure; final fallback emits `aspects:[] polarity:0 confidence:0` (never fabricates an aspect outside the taxonomy). 14 unit tests covering input contract, single-call invariant, range rejections, enum rejections, fallback path, off-topic doc, boundary values.

5. **`selectTopDocs(pkg)`** (`src/lib/sentiment/select-top-docs.ts`) — caps at 20 news + 10 community = 30 docs/ticker (T-20-B-01-02 cost defense). Recency-DESC sort for news; upvotes-then-recency for community. Deterministic doc_id derivation (sha256 prefix for news, `source:message_id` for community). MAX_TEXT_CHARS=2000 truncation. 10 unit tests.

6. **Pipeline wiring** (`src/lib/data/source-package.ts`) — `collectAllData` runs the classifier post-assembly under `FEATURE_PER_DOC_SENTIMENT !== 'off'`. Results attached as a `_per_document_sentiment` sidecar on the returned `SourcePackage`; `runGeminiAnalysis` reads the sidecar and overwrites `AnalysisResult.per_document_sentiment` post-generation (LLM hallucinations of this field discarded). Each result becomes a fire-and-forget `SentimentObservation` row with `classifier_version='gemini-per-doc-v1'` + `model_version='gemini-per-doc-v1'` + populated `aspects` column.

7. **`SentimentObservation.aspects` column** — additive `String[] @default([])` on the existing 20-Z-01 model. `insertObservation()` extended with `aspects?: string[]` (additive; pre-20-B-01 callers default to `[]`). 20-Z-01 composite unique + indexes unchanged.

8. **`FEATURE_PER_DOC_SENTIMENT` flag** — three-mode (`off | shadow | on`); defaults to `'shadow'` (default even when env var absent — `SHADOW_DEFAULT_FLAGS` set in `features.ts`).

9. **FPB ECE eval harness** (`scripts/eval-fpb-per-doc.ts`) — 10-bin binned ECE per Guo 2017 over `data/eval/fpb-held-out.csv` (111-row held-out subset of the Financial PhraseBank; Malo et al. 2014; Apache-2). Writes `/tmp/fpb-ece-{date}.json`; exits 0 PASS / 1 FAIL on the ≤ 0.15 ship gate.

10. **Mitchell-2019 model card** (`docs/cards/MODEL-CARD-gemini-per-doc.md`) — documents intended use, training-data N/A, evaluation gates, all 5 known failure modes (T-20-B-01-{01..05}), ethical considerations, retrain cadence, cost basis. Cites Malo 2014, Araci 2019, Mitchell 2019, Guo 2017.

11. **HYPERPARAMETERS.md** entry — 6 constants: `ASPECT_TAGS`, `ECE_SHIP_GATE=0.15`, `TOP_NEWS=20`, `TOP_COMMUNITY=10`, `COST_CAP_DOCS_PER_TICKER=30`, `MAX_TEXT_CHARS=2000`. Every value traces to a CONTEXT.md acceptance criterion (S1 — zero hand-picked thresholds).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `data/eval/fpb-held-out.csv` was caught by the `*.csv` gitignore wildcard**
- **Found during:** Task 9 commit
- **Issue:** Generic `*.csv` rule in `.gitignore` blocked the held-out FPB CSV from being committed; the plan requires the CSV to be physically present in the repo (`MODEL-CARD-gemini-per-doc.md` references reproducibility).
- **Fix:** Added `!data/eval/*.csv` unignore exception with a comment citing the plan requirement.
- **Files modified:** `.gitignore`
- **Commit:** `0178c75`

**2. [Rule 2 — Critical correctness] `AnalysisResult` interface missing `per_document_sentiment`**
- **Found during:** Task 9 (typecheck)
- **Issue:** The Zod schema extension on `AnalysisResultSchema` was correctly added, but the typed `AnalysisResult` interface in `src/lib/types.ts` was missing the field — `gemini-analysis.ts:831` failed typecheck (`Object literal may only specify known properties, and 'per_document_sentiment' does not exist in type 'AnalysisResult'`).
- **Fix:** Added optional `per_document_sentiment?: PerDocSentimentResult[]` to the `AnalysisResult` interface.
- **Files modified:** `src/lib/types.ts`
- **Commit:** `0178c75`

**3. [Rule 2 — Critical correctness] `check-model-cards` required a `@model-card:` source annotation + frontmatter**
- **Found during:** Task 10 (gate verification)
- **Issue:** The classifier source file lacked the project-required `@model-card:` annotation pointing back to the card; the card itself lacked the project-required YAML frontmatter (model_name, model_version, card_format, last_validated, retrain_cadence, author, source_files) — both surfaced as `check-model-cards` findings.
- **Fix:** Added the annotation to `per-doc-classifier.ts` and the Mitchell-2019 frontmatter to the model card.
- **Files modified:** `src/lib/sentiment/per-doc-classifier.ts`, `docs/cards/MODEL-CARD-gemini-per-doc.md`
- **Commit:** `05bd4a0`

### Operator-gated work (not blocking this plan's commit)

- **`prisma db push` against live Neon** — schema validates locally and prisma generate produced typed Prisma client. The plan's autonomous-execution clause explicitly defers the live push to the operator. STATUS: pending operator confirmation; the column will exist on production Neon once `npx prisma db push --schema=prisma/schema.prisma` lands. No additional code change required after the push.

## Shadow lifecycle

- **Current mode**: `'shadow'` (default). Classifier runs on every `collectAllData` call, persists `SentimentObservation` rows, and populates `AnalysisResult.per_document_sentiment` — but no downstream consumer is activated yet. 20-B-05 (per-aspect aggregator) is the first consumer.
- **Cutover criteria** (`'shadow' → 'on'`, all 4 required per frontmatter):
  1. Integration test on 10-doc fixture exits 0 (every doc classified, ranges valid, all 7 aspects covered ≥1×, off-topic returns 0/0/[])
  2. `scripts/eval-fpb-per-doc.ts` reports ECE ≤ 0.15 on `data/eval/fpb-held-out.csv` (or deferred to 20-B-03 temperature scaling with documented note — currently the deferred branch is open until first live run measures actual ECE)
  3. 20-B-05 Cohen's κ ≥ 0.6 on its 50-doc human-aspect set (OWNED by 20-B-05)
  4. Mean cost ≤ $0.05 per 30-doc batch in 20-Z-03 `ProviderCallLog` rollup
- **Flag-removal** happens in a follow-up commit AFTER cutover, deleting the `'shadow'` branch and the flag itself.

## Verification gates (all green at commit time)

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit -p .` | 0 errors |
| Vitest (full suite) | `npm test` | 1259 passed / 2 skipped / 3 todo |
| Prompt registry | `npx vitest run tests/prompts/registry.*` | 14 + 12 + 84 total green |
| Prompt drift CI | `npm run check-prompts` | green |
| Model cards | `npm run check-model-cards` | OK (0 findings) |
| Sentiment immutability | `npm run check-immutability` | OK |
| Telemetry coverage | `npm run check-telemetry-coverage` | OK — 11/11 modules wrap withTelemetry |
| Lookahead bias | `npm run check-lookahead` | 0 violations across 166 files |
| New unit tests | 6 aspects + 14 classifier + 10 selector | 30 / 30 green |

## Open items (NOT blocking this plan)

- Operator-gated `npx prisma db push` to land the additive `aspects` column on live Neon. Schema is committed; client is regenerated.
- First live FPB ECE measurement (the harness exists and is fully wired — requires VERCEL_OIDC_TOKEN to hit AI Gateway). If raw ECE > 0.15, cutover defers to 20-B-03 (temperature scaling) and the flag stays in `'shadow'`.
- 20-B-05 κ harness on the 50-doc human-aspect set (owned by 20-B-05).

## Self-Check: PASSED

- File existence:
  - FOUND: src/lib/sentiment/aspects.ts
  - FOUND: src/lib/sentiment/per-doc-classifier.ts
  - FOUND: src/lib/sentiment/select-top-docs.ts
  - FOUND: src/lib/prompts/_v1/gemini-per-doc-sentiment.md
  - FOUND: tests/fixtures/per-doc-classification/ten-doc-fixture.json
  - FOUND: tests/fixtures/per-doc-classification/off-topic-doc-fixture.json
  - FOUND: tests/integration/per-doc-classifier.integration.test.ts
  - FOUND: scripts/eval-fpb-per-doc.ts
  - FOUND: data/eval/fpb-held-out.csv
  - FOUND: docs/cards/MODEL-CARD-gemini-per-doc.md
- Commits:
  - FOUND c603429 — additive aspects column
  - FOUND 90b2d82 — ASPECT_TAGS + AspectTag
  - FOUND 7255f2d — Zod schema extension + flag
  - FOUND fe3ca8e — prompt + golden snapshot
  - FOUND 0247d85 — classifyDocumentsBatch
  - FOUND 51548a4 — selectTopDocs
  - FOUND 8fea528 — pipeline wiring
  - FOUND 60040f5 — 10-doc fixture + integration test
  - FOUND 0178c75 — FPB ECE harness + CSV
  - FOUND 05bd4a0 — model card + HYPERPARAMETERS

All success criteria met. Plan complete.
