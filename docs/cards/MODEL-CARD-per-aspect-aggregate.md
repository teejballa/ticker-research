---
model_name: per-aspect-aggregate
model_version: v1
card_format: mitchell-2019
last_validated: 2026-05-13
retrain_cadence: P30D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/sentiment/per-aspect-aggregate.ts
  - src/lib/sentiment/aspects.ts
  - src/components/PerAspectChips.tsx
  - src/app/api/cron/aspect-kappa-monitor/route.ts
  - scripts/eval-aspect-kappa.ts
  - tests/golden-tickers/_aspect_labels.json
---

# Model Card: Per-Aspect Sentiment Aggregator (per-aspect-aggregate-v1)

**Template:** Mitchell et al. (2019) "Model cards for model reporting." FAT* 2019.
**20-Z-02 conformance:** this card follows the 20-Z-02 template (intended use, training data, evaluation, failure modes, ethical considerations, retrain cadence, cost).

## Model Details

- **Algorithm:** Beta-smoothed weighted-mean bull% grouped by `AspectTag` over the per-document polarity scores emitted by `gemini-per-doc-v1` (see `docs/cards/MODEL-CARD-gemini-per-doc.md`).
- **Implementation:** `src/lib/sentiment/per-aspect-aggregate.ts` — pure functions `aggregateByAspect()` + `betaSmoothedBullPct()`.
- **Feature flag:** `FEATURE_PER_ASPECT_AGGREGATE` (env: `FEATURE_PER_ASPECT_AGGREGATE`, client: `NEXT_PUBLIC_FEATURE_PER_ASPECT_AGGREGATE`); default mode = `'shadow'` per `SHADOW_DEFAULT_FLAGS` in `src/lib/features.ts`.
- **Plan:** 20-B-05 (Phase 20: real sentiment analysis).
- **Date created:** 2026-05-13
- **Owner:** Cipher sentiment-layer
- **License of host code:** project-internal.

## Intended Use

Decomposes a single ticker's per-document sentiment stream into per-aspect bull% chips so the reader can see *which dimension* (earnings vs guidance vs regulatory vs M&A vs macro vs product vs management) is driving the aggregate signal. The chip stack replaces the single global `aggregated_bull_pct` chip on the Sentiment Snapshot card and feeds the per-aspect breakdown into the research-brief prompt.

**Input:** `PerDocResult[]` — `{ doc_id, polarity ∈ [-1,+1], confidence ∈ [0,1], aspects: AspectTag[] }` emitted by `gemini-per-doc-v1`.
**Output:** one `PerAspectResult` per `AspectTag` in `ASPECT_TAXONOMY` — `{ aspect, bull_pct: number | null, n_docs, confidence_mean }`.

**Consumed by:**
- `src/components/PerAspectChips.tsx` — UI chip stack on the Sentiment Snapshot card.
- `src/lib/research-brief.ts` — `renderPerAspectBlock` per-aspect prompt section.

**Inappropriate for:**
- Single-ticker price-target prediction (this is a decomposition, not a forecaster).
- Cross-ticker comparison (aspects are per-ticker-conditional — a 60% bull product chip on AAPL is not directly comparable to a 60% bull product chip on TSM without normalization).
- Aspects outside the fixed 7-element taxonomy — adding an aspect requires a `_v2/` partition.

## Training Data

**N/A — analytic aggregator over the upstream classifier's outputs.** No fine-tuning. The Beta prior strength (α = β = 5) is the post-Phase-19 carry-over (Cookson-style weak symmetric prior equivalent to 10 pseudo-observations). Any change to the prior requires a new `model_version` (v2) and a model-card update (S2 immutability).

## Evaluation

| Metric | Threshold | Source | Owner |
|---|---|---|---|
| Cohen's κ (aspect agreement) | **≥ 0.6** macro-averaged | 50-doc human-labeled fixture at `tests/golden-tickers/_aspect_labels.json` | 20-B-05 — `scripts/eval-aspect-kappa.ts` + `/api/cron/aspect-kappa-monitor` |
| Empty-aspect sentinel | bull_pct == null when n_docs < 3 | Unit test in `src/lib/sentiment/per-aspect-aggregate.test.ts` | 20-B-05 |
| UI '—' rendering (NOT '0%') | `data-bullpct=null` chip text === '—' | RTL test at `src/components/__tests__/PerAspectChips.test.tsx` | 20-B-05 |
| Inter-aspect overlap | A multi-aspect doc contributes to BOTH aspect aggregates | Unit test in `src/lib/sentiment/per-aspect-aggregate.test.ts` | 20-B-05 |

**κ measurement cadence:** monthly via `/api/cron/aspect-kappa-monitor` (`0 8 1 * *` UTC). The cron measures κ and reports the per-aspect + macro values; it does NOT enforce the ship gate. Cutover from `FEATURE_PER_ASPECT_AGGREGATE='shadow'` → `='on'` is an operator action gated on macro κ ≥ 0.6 across 2 consecutive monthly cron runs (S3 cutover criteria — same shape as the other sentiment crons).

**Starter fixture:** the inaugural `_aspect_labels.json` ships with 10 seed docs covering all 7 aspects plus an off-topic guard. The fixture must be expanded to ≥50 docs before the first ship-gate evaluation — see `docs/runbooks/aspect-label-curation.md`.

## Known Failure Modes

| Failure | Threat ID | Mitigation |
|---|---|---|
| Empty-aspect chip rendered as '0%' instead of '—' (false bear signal) | T-20-B-05-03 | `bull_pct = null` sentinel + RTL contract test forbids '0%' literal |
| 7-chip stack overflows / clips on mobile (320px viewport) | T-20-B-05-04 | `flex flex-wrap` Tailwind classes + RTL DOM-count assertion |
| Multi-aspect doc double-counted in global aggregate | T-20-B-05-02 | Intentional — multi-aspect docs SHOULD contribute to multiple per-aspect aggregates (CONTEXT.md line 113); the *global* aggregate uses `per_document_sentiment` once-per-doc semantics, not aspect-grouped sums |
| Aspect κ < 0.6 ship gate unmet | T-20-B-05-01 | Cutover blocked — flag stays in `'shadow'`; monthly cron continues to measure |
| Stale aspect taxonomy (CONTEXT.md drift) | T-20-B-05-05 | Single source of truth at `src/lib/sentiment/aspects.ts`; any add/remove requires `_v2/` + new `model_version` partition |

**Out-of-distribution behavior:**
- All-empty input (`PerDocResult[] === []`) → all aspects return `bull_pct: null, n_docs: 0`. UI renders `null` (chip stack hidden).
- Single-doc ticker (n_docs = 1 for every aspect) → all chips render '—' (insufficient signal, N_DOCS_MIN = 3).
- All-neutral polarities (every doc polarity == 0) → posterior_mean = α/(α+β) = 0.5 → bull_pct = 50% (Beta prior dominates — correct for "no signal" representation).

## Ethical Considerations

- This aggregator NEVER persists raw document text — it operates on `PerDocResult` records whose upstream `SentimentObservation` rows carry `raw_body_hash` only per 20-Z-01 T-20-Z-01-02.
- The per-aspect bull% is a research signal, not a trade recommendation. The Sentiment Snapshot card explicitly labels it `SMOOTHED · {n} src` to surface the smoothing and sample size.
- Empty-aspect '—' rendering is a deliberate ethical choice: surfacing '0%' would falsely communicate "zero bullishness" when the truth is "zero data" — that's a misleading bear signal users could trade on.

## Retrain / Re-evaluation Cadence

- **κ re-measurement:** monthly via `/api/cron/aspect-kappa-monitor`.
- **Fixture expansion:** quarterly review per `docs/runbooks/aspect-label-curation.md`.
- **Beta prior re-fit:** out of scope for v1; would require new `_v2/` partition.

## Cost

- **Per cron tick:** equal to one `classifyDocumentsBatch` call over the fixture (≤ $0.05 USD per 30-doc batch — same cost basis as `gemini-per-doc-v1`). At 50 fixture docs and the COST_CAP_DOCS_PER_TICKER=30 chunking, the cron is bounded to 2 Gemini calls/month = ≤ $0.10 USD/month.
- **Per analysis call:** zero — aggregation is pure-functions, no model call.

## References

- Cookson, J. A., & Niessner, M. (2020). "Why don't we agree? Evidence from a social network of investors." *Journal of Finance*, 75(1), 173–228. (Beta-prior smoothing rationale.)
- Mitchell, M. et al. (2019). "Model cards for model reporting." *Proceedings of the Conference on Fairness, Accountability, and Transparency (FAT*)*.
- Cohen, J. (1960). "A coefficient of agreement for nominal scales." *Educational and Psychological Measurement*, 20(1), 37–46.
- CONTEXT.md (Phase 20) line 113 — fixed 7-element aspect taxonomy + inter-aspect overlap policy.

## Links

- Plan: `.planning/phases/20-real-sentiment-analysis/20-B-05-PLAN.md`
- Summary: `.planning/phases/20-real-sentiment-analysis/20-B-05-SUMMARY.md`
- Aggregator: `src/lib/sentiment/per-aspect-aggregate.ts`
- Aspect taxonomy: `src/lib/sentiment/aspects.ts`
- UI: `src/components/PerAspectChips.tsx`
- Cron: `src/app/api/cron/aspect-kappa-monitor/route.ts`
- Eval harness: `scripts/eval-aspect-kappa.ts`
- Fixture: `tests/golden-tickers/_aspect_labels.json`
- Runbook: `docs/runbooks/aspect-label-curation.md`
- Hyperparameters: `HYPERPARAMETERS.md` (section "20-B-05: Per-aspect sentiment aggregator")
- Upstream classifier card: `docs/cards/MODEL-CARD-gemini-per-doc.md`
