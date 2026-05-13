# Model Card: Source-Tier Weighting (Plan 20-B-04)

Format: Mitchell 2019 (Model Cards for Model Reporting). References 20-Z-02 template.

## Model Details

- **Name**: source-tier-weighting
- **Version**: v1 (initial — capped softmax of per-source 90d IC)
- **Type**: Bounded weighting (NOT a probability distribution)
- **Owner**: Phase 20 sentiment layer
- **Date**: 2026-05-13
- **Code**: `src/lib/sentiment/source-tier.ts` + `src/lib/sentiment/source-tier-hyperparameters.ts`
- **Schema**: `prisma/schema.prisma` `model SourceTier` (append-only history, composite index `(source_id, computed_at DESC)`)
- **Cron**: `/api/cron/source-tier-recompute` at `'0 7 1 * *'` UTC (1st of month, 07:00 — 1h after 20-A-03 tune-decay)

## Intended Use

Replace any hand-curated source-authority table (the previous-architecture sketch Reuters/Bloomberg ≫ blog ≫ social) with a data-driven monthly recompute. Per-source weight = `softmaxWithCaps(mean_IC_per_source, [0.5, 5.0])` so that no source is fully suppressed and no source is fully dominant.

The institutional baseline for this approach is RavenPack + MarketPsych: both weight by source authority but BOTH calibrate continuously against realized returns. Capping the softmax at `[0.5, 5.0]` is a deliberate robustness choice — pure softmax can collapse to one source dominating; pure equal-weighting throws away signal; capped softmax is the bounded compromise.

## Training Data

- **Source**: Per-source rolling-90d Spearman IC against forward 7d alpha-vs-SPY — PRODUCED BY 20-C-01.
- **Window**: 90 days (rolling).
- **Min sample for inclusion**: 30 days of measured IC; below this threshold the source defaults to `weight = 1.0` (cold start) and is persisted with `mean_ic_90d = null` for audit.
- **Provenance**: 20-C-01 owns the IC computation. This plan reads `(source_id, mean_ic_90d, n_observations)` only.

## Evaluation Metrics

- **Cutover gate (shadow → on)**: paired-bootstrap on validation Sharpe of tier-weighted vs unweighted aggregate, 95% CI lower-bound > 0 (1000 resamples). Implementation lands as a follow-up once ≥30d of SourceTier history exists.
- **Acceptance**: ≥30d of SourceTier history per source AND CI lower-bound > 0.
- **Per-segment fairness**: delegated to Phase 20-C-06 audit (cap_class × sector stratification).
- **Bounds invariant** (integration-test enforced): every persisted `SourceTier.weight` value is in `[cap_min, cap_max]` (default `[0.5, 5.0]`).

## Out-of-Distribution Behavior

- **New source (n_observations < 30 OR mean_ic_90d == null)**: weight = 1.0 verbatim; persisted with `is_cold_start: true`. UI does not render the 'wt:' label (avoids visual noise on cold-start sources).
- **All sources cold-start**: softmax bucket is empty; every source gets 1.0; aggregator behavior is identical to baseline.
- **PerSourceIC table missing or empty (20-C-01 not yet shipped)**: `getWeightForSource` returns 1.0; recompute exits 0 with diagnostic. Cross-wave decoupling pact (T-20-B-04-03).

## Known Failure Modes

1. **Single-source dominance at cap=5.0** (T-20-B-04-01). On a small-source-set ticker, one source at 5.0 vs three at 0.5 still gets ~77% of total weight (5/(5+1.5)). Mitigation: monthly review via Phase 20-Z-03 telemetry alerts; if any ticker shows >70% concentration on one source for ≥7 days, operator tightens `cap_max` via the Zod-validated hyperparameters config. Maps to phase catalog T-28-001 (manipulation defense).
2. **Cold-start gaming** (T-20-B-04-02). A new noisy source with small sample receives default 1.0 weight before tier calibration kicks in. Mitigation: 30-day `n_observations` gate + 0.5 floor after measurement. Documented in OOD behavior. UI 'wt:' label exposes cold-start status visibly so report consumers can discount cold-start sources by eye.
3. **IC contamination upstream** (T-20-B-04-05, accept — deferred to 20-C-01 + 20-Z-07). If 20-C-01's IC is computed on lookahead-biased data, weights are inflated. Mitigation: 20-Z-07 lookahead-bias regression test (PIT discipline at the SQL/ORM layer); this plan documents the contract verbatim so 20-C-01 implements to the same join semantics.
4. **Hand-curated weight injection** (T-20-B-04-04). Someone adds a `SOURCE_WEIGHT_OVERRIDE_STOCKTWITS=2.5` env var to "fix" a perceived problem. Mitigation: NO env-var override path exists in this plan's code; `getWeightForSource` reads SourceTier rows only. CI grep guard at `.github/workflows/no-hand-curated-tier-weights.yml` fails the workflow if any commit introduces `SOURCE_WEIGHT_OVERRIDE` / `HARD_CODED_TIER` / `HAND_CURATED_TIER` tokens.

## Retrain Cadence

- **Recompute**: monthly cron at `'0 7 1 * *'` UTC.
- **Hyperparameter review**: monthly via this model card + HYPERPARAMETERS.md PR review.
- **Full re-eval**: quarterly with operator-supervised bootstrap-cutover run.

## Ethical Considerations

- Source weights are computed from market signal only (IC vs forward alpha-vs-SPY). No demographic, geographic, or content-based signals enter the weighting.
- No source is permanently suppressed (`cap_min = 0.5` floor preserves audit signal even for low-IC sources).
- No source can be hand-promoted (S1: data-driven only; CI guard enforces).

## Caveats and Limitations

- Plan ships at `SOURCE_TIER_MODE=off` until 20-C-01 has accumulated ≥30d of IC history and the cutover gate criterion passes paired-bootstrap.
- The recompute script's `bootstrap_report` block is a STUB; full implementation lands as a follow-up.
- Cap bounds `[0.5, 5.0]` are CONFIGURABLE in `SOURCE_TIER_HYPERPARAMETERS`. Operator changes are reviewable in PRs but DO move the bounded-weighting interpretation; not a knob to be turned lightly.

## Cross-references

- **Spec**: `.planning/phases/20-real-sentiment-analysis/CONTEXT.md` §20-B-04
- **Producer**: Plan 20-C-01 (per-source rolling-90d IC) — `MODEL-CARD-per-source-ic.md` in same dir
- **Lookahead-bias regression**: Plan 20-Z-07 (deferred) — catches PIT violations upstream
- **Manipulation defense**: phase catalog T-28-001 — cap=5.0 ceiling is this plan's contribution
- **Hard Cleanup Gate**: this plan's `<universal_preamble>` criteria 1-7
- **Hyperparameters**: `HYPERPARAMETERS.md` §Phase 20-B-04
- **CI guard**: `.github/workflows/no-hand-curated-tier-weights.yml`
