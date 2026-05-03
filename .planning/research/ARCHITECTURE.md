# Architecture Research — Cipher v2.0 "Learning Engine Excellence"

**Domain:** Bayesian feedback ML layer bolted onto an existing pure-TypeScript Vercel pipeline
**Researched:** 2026-05-03
**Confidence:** HIGH (verified against the live v1.0 codebase: `learning.ts`, `engine-context.ts`, `gemini-analysis.ts`, `prisma/schema.prisma`, all 3 crons, `ticker-watchlist.ts`)

---

## Architectural Stance

v2.0 is **strictly additive**. v1.0 already established the Bayesian beat (scan → outcome → posterior → prompt-injection) and the four signal classes (`diffusion`, `technical`, `institutional`, `insider`). Every new capability slots into that loop as either:

1. A **new pure module** in `src/lib/learning-v2/` exposing pure functions (no DB) — composes with the existing `learning.ts` primitives.
2. A **new pass** inside an existing cron — guarded by a feature flag so v1.0 behaviour is the fallback.
3. A **new cron** — only when scheduling/timing differs from the existing 3 crons.
4. A **new DB column or table** — additive, with `DEFAULT` values so existing rows continue to read correctly.
5. A **new API route or `/insights` tab** — never touches `/research/[ticker]` rendering except where existing `engine_calibration` JSON contract gains optional fields.

**Module boundary rule:** every new capability is a directory `src/lib/learning-v2/<capability>/` containing:

- `index.ts` — the public interface (one or two pure functions)
- `<capability>.ts` — the implementation
- `<capability>.test.ts` — vitest unit tests with no Prisma, no network
- (optionally) `<capability>.io.ts` — the thin DB adapter, tested via `npm run test:integration`

The rule is enforced by colocation — pure math never imports `@/lib/db`, and DB adapters never import `next/server`. This is the same boundary `learning.ts` already respects ("Pure functions — no DB access. All state is passed in.").

---

## System Overview — v2.0 Layered View

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER (Next.js App Router)                                 │
│  ┌──────────────────┐  ┌─────────────────┐  ┌────────────────────────┐  │
│  │ /research/[t]    │  │ /insights       │  │ /report/[id]/trail     │  │
│  │ + Calibration    │  │ + perf tab (P26)│  │ ★ NEW (P27)            │  │
│  │ Panel (existing) │  │ + regime banner │  │ public calibration     │  │
│  └────────┬─────────┘  │ ★ NEW (P20)     │  │ trail page             │  │
│           │            └─────────┬───────┘  └────────────┬───────────┘  │
│           │                      │                       │               │
├───────────┼──────────────────────┼───────────────────────┼───────────────┤
│  REASONING & PROMPT LAYER  (src/lib/gemini-analysis.ts)                  │
│           │                      │                       │               │
│  ┌────────▼──────────────────────▼───────────────────────▼───────────┐  │
│  │ runGeminiAnalysis  ←  buildSystemPrompt(engineCtx)                │  │
│  │   ├─ buildEngineContextBlock                                       │  │
│  │   ├─ buildTechnicalContextBlock                                    │  │
│  │   ├─ buildSmartMoneyContextBlock                                   │  │
│  │   ├─ ★ buildCompositeBlock (P22)        ← composite signal prob   │  │
│  │   └─ ★ buildCounterfactualBlock (P23)   ← "if signal absent..."   │  │
│  └────────────────────────────┬────────────────────────────────────┬─┘  │
│                               │                                    │     │
├───────────────────────────────┼────────────────────────────────────┼─────┤
│  ENGINE-CONTEXT LAYER (src/lib/engine-context.ts)                  │     │
│                               │                                    │     │
│  ┌────────────────────────────▼──────────────────────────────────┐ │     │
│  │ getEngineContextForTicker                                      │ │     │
│  │   ├─ resolveBucketCellAt30 (existing 4-class lookup)           │ │     │
│  │   ├─ ★ applyHierarchicalPooling (P19)    ← parent prior pull   │ │     │
│  │   ├─ ★ resolveRegimeKey (P20)            ← +regime to cell key │ │     │
│  │   ├─ ★ composeMultiCellSignal (P22)      ← 4-class → composite │ │     │
│  │   └─ ★ counterfactualDeltas (P23)        ← per-class ablation  │ │     │
│  └────────────────────────────┬──────────────────────────────────┘ │     │
│                               │                                    │     │
├───────────────────────────────┼────────────────────────────────────┼─────┤
│  LEARNING LAYER (src/lib/learning.ts + src/lib/learning-v2/*)      │     │
│                               │                                    │     │
│  ┌─────────────────┐  ┌───────▼───────┐  ┌─────────────────┐      │     │
│  │ updatePosterior │  │ ★ decayedBeta │  │ ★ poolWithParent│      │     │
│  │ (existing)      │  │ Update (P18)  │  │  (P19)          │      │     │
│  └─────────────────┘  └───────────────┘  └─────────────────┘      │     │
│  ┌─────────────────┐  ┌───────────────┐  ┌─────────────────┐      │     │
│  │ updateLogistic  │  │ ★ regime      │  │ ★ liftGate      │      │     │
│  │ (existing)      │  │  Detector(P20)│  │   (P21)         │      │     │
│  └─────────────────┘  └───────────────┘  └─────────────────┘      │     │
│  ┌─────────────────┐  ┌───────────────┐  ┌─────────────────┐      │     │
│  │ adversarialNull │  │ ★ temporalCV  │  │ ★ thompsonPick  │      │     │
│  │ Brier (existing)│  │  (P21)        │  │  (P24)          │      │     │
│  └─────────────────┘  └───────────────┘  └─────────────────┘      │     │
│                                                                    │     │
├──────────────────────────────────────────────────────────────────┬─┴─────┤
│  CRON LAYER (vercel.json + src/app/api/cron/**)                  │       │
│                                                                  │       │
│  ┌─────────────────┐  ┌────────────────┐  ┌────────────────────┐│       │
│  │ sentiment-scan  │  │ price-followup │  │ learn              ││       │
│  │ (every 3d)      │  │ (daily)        │  │ (daily)            ││       │
│  │ ★ uses          │  │ (unchanged in  │  │ ★ decay pass (P18) ││       │
│  │  thompsonPick   │  │  v2.0; reads   │  │ ★ pool pass (P19)  ││       │
│  │  (P24)          │  │  from regime-  │  │ ★ regime tag (P20) ││       │
│  │                 │  │  tagged rows)  │  │ ★ lift gate (P21)  ││       │
│  └─────────────────┘  └────────────────┘  └────────────────────┘│       │
│  ┌─────────────────┐  ┌────────────────┐                        │       │
│  │ ★ regime-detect │  │ ★ backfill     │                        │       │
│  │  (P20, daily)   │  │  (P25, manual  │                        │       │
│  │                 │  │  + nightly     │                        │       │
│  │                 │  │  resume)       │                        │       │
│  └─────────────────┘  └────────────────┘                        │       │
├──────────────────────────────────────────────────────────────────┼───────┤
│  PERSISTENCE LAYER (Prisma → Neon)                               │       │
│                                                                  │       │
│  ┌──────────────────┐  ┌──────────────────┐ ┌────────────────┐ │       │
│  │ LearnedPattern   │  │ ★ MarketRegime   │ │ ★ EnginePerf   │◄┘       │
│  │ + regime col(P20)│  │  (P20)           │ │  Snapshot (P26)│         │
│  │ + parent_key(P19)│  │  daily row       │ │  daily KPIs    │         │
│  │ + ess col (P18)  │  └──────────────────┘ └────────────────┘         │
│  └──────────────────┘  ┌──────────────────┐ ┌────────────────┐         │
│  ┌──────────────────┐  │ ★ BackfillCursor │ │ ★ TrailEvent   │         │
│  │ LearningEvent    │  │  (P25)           │ │  (P27, optional│         │
│  │ + ★ delta.decayed│  │                  │ │  if reusing    │         │
│  │   (P18)          │  │                  │ │  LearningEvent)│         │
│  └──────────────────┘  └──────────────────┘ └────────────────┘         │
│  PriceOutcome, SentimentSnapshot, DiffusionTrace, LogisticEpoch          │
│  (all unchanged in v2.0)                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

`★ NEW` marks v2.0 additions. Everything unmarked is shipped v1.0.

---

## Per-Capability Integration Map

### Phase 18 — Time-Decayed Bayesian Updates

| Aspect | Detail |
|---|---|
| **Integration point** | New module `src/lib/learning-v2/decay/index.ts` exporting `decayedBetaUpdate({ alpha, beta, hit, age_days, half_life_days })`. Called from `upsertCell()` (`learn/route.ts:315-353`) wrapped behind `ENABLE_DECAY=1` flag. The recompute pass `recomputeOneCell()` (`learn/route.ts:388`) replaces its `alpha_30d/beta_30d` rolling window with a continuous time-decayed sum over `LearningEvent.occurred_at`. |
| **Schema impact** | Add to `LearnedPattern`: `effective_sample_size Float? @default(0)` and `decay_half_life_days Int @default(45)` (cell-tunable, default seeded). No table additions. `LearningEvent.delta` JSON gains `decayed_weight: number` field. |
| **Build order** | Foundational. Should ship FIRST after a single combined schema migration. P19 hierarchical pooling needs `effective_sample_size` to weight parent vs cell mixing. P21 lift-gate uses `effective_sample_size` not raw `sample_size` as the threshold gate. |
| **Disruption risk** | LOW if half_life_days defaults to a value (e.g. 45d) that approximates current behaviour for cells <45d old (which is most of them at v2.0 launch). MUST keep raw `alpha`/`beta` columns intact for backward compat — recompute writes both `alpha`/`beta` AND `alpha_decayed`/`beta_decayed`; reads from new fields when flag on. |
| **Backwards compat** | Flag-gated. With flag off, v2.0 = v1.0 behaviour exactly. |
| **New components** | None UI-side initially. EngineCalibrationPanel optionally surfaces `ESS=42 (n_raw=68)` next to sample size when ESS < 0.7 × n_raw (drift-stress signal). |
| **Module interface** | `decayedBetaUpdate(prior: BetaPosterior, observation: { hit: boolean; age_days: number }, half_life_days: number) → BetaPosterior` — pure, vitest-testable. |

### Phase 19 — Hierarchical Priors / Partial Pooling

| Aspect | Detail |
|---|---|
| **Integration point** | New module `src/lib/learning-v2/pooling/index.ts` with `poolWithParent(child, parent, tau)` and `computeParentPrior(siblings)`. Runs as a NEW recompute pass at the end of the `learn` cron — after `recomputePerSignalClassPatternMetrics()` (`learn/route.ts:357`), before `persistLogisticEpoch()`. Pool function shrinks each cell's posterior toward a parent computed across the cell's siblings (same `signal_class × pattern_key`, varying `cap_class × horizon_days`). |
| **Schema impact** | Add to `LearnedPattern`: `pooled_alpha Float?`, `pooled_beta Float?`, `parent_alpha Float?`, `parent_beta Float?`, `pooling_weight Float?` (ranges 0–1, how much shrinkage was applied). All nullable so v1.0 reads still work. |
| **Build order** | After P18 (uses `effective_sample_size` to weight pooling — small-n cells pull harder toward parent). Before P22 (composite signal reads pooled posteriors when available). |
| **Disruption risk** | MEDIUM. The hierarchy DEFINITION (which siblings share a parent) is a design choice. Conservative starting tree: parent = `(signal_class, pattern_key)` aggregating across cap × horizon; grandparent = `(signal_class)` aggregating across all patterns. Document the tree as a constant in `pooling/hierarchy.ts` so it's testable and reviewable. `engine-context.ts` reads `pooled_*` when present, falls back to raw — never breaks. |
| **Backwards compat** | Reads remain on `alpha/beta` until P22 explicitly switches the calibration block to `pooled_alpha/pooled_beta`. |
| **New components** | EngineCalibrationPanel optionally displays "borrowed strength: 18% from parent (n=247)" — small dim text. |
| **Module interface** | `poolWithParent(child: BetaPosterior, parent: BetaPosterior, weight: number) → BetaPosterior`; `computeParentPrior(siblings: BetaPosterior[]) → BetaPosterior` — pure. |

### Phase 20 — Market-Regime Feature

| Aspect | Detail |
|---|---|
| **Integration point** | THREE pieces: (1) New module `src/lib/learning-v2/regime/index.ts` with `classifyRegime({ vix, spyTrend, rateRegime, etc. }) → RegimeKey`. (2) New cron `/api/cron/regime-detect` (daily 06:00 UTC, before price-followup) writing today's regime to a new `MarketRegime` table. (3) `LearnedPattern` composite key gains `regime` column — cells become `(signal_class × pattern_key × cap_class × horizon_days × regime)`. |
| **Schema impact** | NEW TABLE `MarketRegime { date Date @id; regime String; vix Float?; spy_trend Float?; rate_regime String?; computed_at DateTime }`. NEW COLUMN on `LearnedPattern.regime String @default("ALL")`. NEW COLUMN on `SentimentSnapshot.regime_at_scan String?`. Composite unique key changes: `@@unique([signal_class, pattern_key, cap_class, horizon_days, regime])`. **High-impact migration** — touches the table that already has 18+ cells. Strategy: backfill all existing rows with `regime='ALL'`, then on a per-cell basis split into regime-specific cells the next time observations arrive in each regime (lazy split). |
| **Build order** | This is the BIG schema change. Should ship as Phase 1 of v2.0 alongside P18 in a SINGLE combined migration, before P19 pooling — because the parent-prior tree definition needs to know whether `regime` is part of the leaf key or the parent key (recommendation: leaf only; parent pools across regimes). |
| **Disruption risk** | HIGH if not coordinated. The composite key change is a breaking schema migration. Use a TWO-STEP migration: (a) add `regime` column with default `'ALL'`, drop old unique constraint, add new unique constraint that includes `regime`; (b) start writing the real regime label going forward. Existing 18 cells survive as the `regime='ALL'` rows and continue to be readable. |
| **Backwards compat** | `engine-context.ts` lookup falls back to `regime='ALL'` cell when no regime-specific cell exists yet — guaranteed for the first ~30 days of any new regime. |
| **New components** | (a) `/insights` regime banner ("CURRENT REGIME: bull-low-vol"). (b) EngineCalibrationPanel adds "regime: bull-low-vol" badge near the cell key. |
| **Module interface** | `classifyRegime(features: RegimeFeatures) → RegimeKey` (pure); `MarketRegimeRepository.todaysRegime() → RegimeKey` (DB adapter). |

### Phase 21 — Lift-Gated Cell Promotion + Out-of-Sample Temporal CV

| Aspect | Detail |
|---|---|
| **Integration point** | (a) New module `src/lib/learning-v2/cv/index.ts` with `temporalSplit(events, k)` and `crossValidatedBrierLift(cell, events) → { brier_oos, brier_null_oos, lift }`. (b) Replace `patternStatus()` (`learning.ts:223-239`) — or wrap it as `patternStatusV2()` keyed off lift instead of in-sample Brier. New rule: ACTIVE iff `(brier_oos + ε) < brier_null_oos` AND `effective_sample_size ≥ 20`. (c) Recompute cron calls `patternStatusV2` when flag on. |
| **Schema impact** | Add to `LearnedPattern`: `brier_oos Float?`, `brier_null_oos Float?`, `lift_pct Float?`, `cv_folds_used Int?`. All nullable. |
| **Build order** | After P18 (uses ESS in promotion gate). After P19 (CV runs against pooled posteriors). After P20 (CV is per-regime — must respect new key). Before P22 (composite signal weights cells by `lift_pct`, not just status). |
| **Disruption risk** | LOW for cells; MEDIUM for the displayed "ACTIVE" count. Switching the promotion rule will instantaneously demote some currently-ACTIVE cells (today the v1.0 gate is in-sample-Brier-vs-null which is too lax). UX: show both `status_v1` and `status_v2` for the first cycle so users see the demotion explicitly with a "stricter rule applied" tooltip; then drop `status_v1`. |
| **Backwards compat** | Flag-gated. v1.0 callers reading `status` see whichever logic is currently authoritative. |
| **New components** | InsightsDashboard pattern library tabs gain an OOS-Brier-Lift column. |
| **Module interface** | `temporalSplit<T extends { occurred_at: Date }>(events: T[], k: number) → Array<{ train: T[]; test: T[] }>` — pure; `crossValidatedBrierLift(predictions: number[][], outcomes: boolean[][]) → LiftMetrics` — pure. |

### Phase 22 — Composite Signal Synthesis in the Prompt

| Aspect | Detail |
|---|---|
| **Integration point** | (a) New module `src/lib/learning-v2/composite/index.ts` with `composeSignal({ diffusion, technical, institutional, insider, weights }) → { posterior_mean, ci, contributing_classes, agreement }`. Combines per-class posteriors via inverse-variance weighted average (industry standard for combining Bayesian estimates). (b) New helper `buildCompositeBlock(ctx) → string` in `gemini-analysis.ts` appended to `buildSystemPrompt` (`gemini-analysis.ts:645`). (c) New `EngineContext` field `composite_signal: { mean, ci, weights }` populated in `getEngineContextForTicker` after `resolveBucketCellAt30` calls. |
| **Schema impact** | None to LearnedPattern. Optional new column `Report.composite_signal Json?` to persist the snapshot for the trail page (P27). |
| **Build order** | After P19 (uses pooled posteriors when available) and P21 (uses `lift_pct` as the inverse-variance weight). Strict prerequisite for the "headline number" UX promise. |
| **Disruption risk** | LOW. Existing per-class blocks remain in the prompt. The composite block is appended last and the system prompt instructs Gemini to use the composite as the headline. Changes the FEEL of reports without breaking the schema. |
| **Backwards compat** | `engine_calibration` JSON gains optional `composite_signal` field. UI gracefully renders absence. |
| **New components** | Headline badge on `/research/[ticker]` page: "ENGINE COMPOSITE: 64% bullish [56–72]" displayed prominently above current per-class panels. |
| **Module interface** | `composeSignal(per_class: PerClassPosteriors[], weights?: number[]) → CompositeSignal` — pure. |

### Phase 23 — Counterfactual Reasoning in Reports

| Aspect | Detail |
|---|---|
| **Integration point** | (a) New helper `counterfactualDeltas(ctx) → Array<{ class, posterior_with, posterior_without, delta }>` in `engine-context.ts`. For each of the 4 classes, recompute `composeSignal` with that class's weight zeroed and report the delta. (b) New helper `buildCounterfactualBlock(ctx) → string` appended to system prompt (`gemini-analysis.ts:645`). (c) New optional fields on `EngineCalibration` schema in `gemini-analysis.ts:96`: `counterfactuals: Array<{ class, delta, narrative }>` — narrative is LLM-authored. |
| **Schema impact** | None. Counterfactuals are computed at report time from existing per-class posteriors; persisted in `Report.analysis` JSON like other LLM output. |
| **Build order** | Direct dependency on P22 (composite must exist to compute counterfactuals). Otherwise independent. |
| **Disruption risk** | LOW — purely additive prompt block + schema extension. |
| **Backwards compat** | Field is optional in the Zod schema. |
| **New components** | EngineCalibrationPanel sub-section "If we ignored institutional signal: 64% → 58% (-6pp)". |
| **Module interface** | `counterfactualDeltas(ctx: EngineContext) → CounterfactualDelta[]` — pure. |

### Phase 24 — Adaptive Watchlist via Bandit

| Aspect | Detail |
|---|---|
| **Integration point** | (a) New module `src/lib/learning-v2/bandit/index.ts` with `thompsonPickTickers({ candidates, ess_per_cell, cells_to_fill, k })`. (b) Modify `getCurrentWatchlist()` (`ticker-watchlist.ts:134`) to consult bandit when `ENABLE_ADAPTIVE_WATCHLIST=1` — anchors stay fixed, rotation slots get bandit-driven. (c) Modify `sentiment-scan` cron (`sentiment-scan/route.ts:23`) to call bandit-aware watchlist. |
| **Schema impact** | Optional small additions: `LearnedPattern.last_observation_at DateTime?` (already inferable from `LearningEvent` join, but caching it accelerates the bandit). New table `WatchlistDecision { id, scanned_at, ticker, reason, expected_info_gain Float }` for auditability. |
| **Build order** | After P18 (bandit reward function is `effective_sample_size` of underrepresented cells). After P20 (bandit must consider regime — can't recommend tickers for cells in a regime that's already saturated this cycle). Independent of P19, P21, P22, P23. **Parallelizable with P22+P23.** |
| **Disruption risk** | LOW with anchors preserved. The 5 anchor tickers (`AAPL, NVDA, MSFT, SPY, QQQ`) keep scanning unconditionally — only the 14 rotation slots become bandit-driven. Worst case: bandit picks bad tickers, falls back to v1.0 rotation behind flag. |
| **Backwards compat** | Flag-gated. Default off until acceptance criteria met. |
| **New components** | `/insights` "Watchlist Diagnostics" mini-section: which cells the engine is starving for, what tickers it picked today and why. |
| **Module interface** | `thompsonPickTickers(args: { candidates: string[]; cellNeed: Map<CellKey, number>; tickerToCells: (t: string) => CellKey[]; k: number }) → string[]` — pure. |

### Phase 25 — Historical Backfill from Price Data

| Aspect | Detail |
|---|---|
| **Integration point** | (a) New script `scripts/backfill-technical.ts` (NOT a cron — runs as one-shot npm script for the initial 5y backfill). (b) New cron `/api/cron/backfill-resume` (nightly, 02:00 UTC) that resumes any in-progress backfill chunk so a single Vercel function can't time out. (c) New module `src/lib/learning-v2/backfill/index.ts` with `replayHistoricalPriceWindow({ ticker, start, end, technicalSnapshotFn, spyHistory })` returning synthetic `SentimentSnapshot` + `PriceOutcome` rows tagged with `is_backfill=true`. |
| **Schema impact** | Add `SentimentSnapshot.is_backfill Boolean @default(false)` and `PriceOutcome.is_backfill Boolean @default(false)` so the recompute pass can keep them separate from live observations (audit + opt-in toggle to weight backfilled less). New table `BackfillCursor { ticker @id, signal_class, last_processed_date, status }`. |
| **Build order** | Should ship AFTER P18 + P20 + P21 — backfill needs to assign decay weight (P18 — historical observations should have decayed weight from day 1), regime tag (P20 — must look up the regime AT the historical date), and lift gate (P21 — must temporal-CV across the backfilled history). Otherwise we backfill 5y of data into v1.0-shape cells and have to recompute everything. |
| **Disruption risk** | MEDIUM. Volume risk: a 5y backfill across 100 tickers × 4 classes × 6 horizons is potentially ~4M PriceOutcome rows. Strategy: chunk by ticker × month, write idempotently, monitor Neon row count. Keep `is_backfill=true` so a single SQL clause can roll back. |
| **Backwards compat** | Adds `is_backfill` flag — old rows default to `false`, no behaviour change. |
| **New components** | `/insights` backfill status widget: "12% of historical replay complete (45/378 ticker-months)". |
| **Module interface** | `replayHistoricalPriceWindow(args) → { snapshots: Snapshot[]; outcomes: Outcome[] }` — pure given a price history function injected. |

### Phase 26 — Live Engine Performance Dashboard

| Aspect | Detail |
|---|---|
| **Integration point** | (a) New API route `/api/insights/performance` returning daily KPIs (Brier lift over time, % reports using ACTIVE priors, top cells by lift, drift alerts, daily learn-feed summary). (b) New `/insights` tab `<PerformanceTab />` consuming it. (c) New cron addition: `learn` cron writes a daily `EnginePerfSnapshot` row at end of cycle (already computes most of these stats — just needs to persist them). |
| **Schema impact** | NEW TABLE `EnginePerfSnapshot { id, recorded_at @default(now), date Date @unique, brier_lift_avg Float, active_cell_count Int, drift_alert_count Int, reports_with_calibration_pct Float, top_cells Json, daily_summary_text String }`. |
| **Build order** | After P21 (KPIs include lift). Otherwise independent of all v2.0 work — can ship in parallel with P22/P23/P24. **Parallelizable.** |
| **Disruption risk** | NIL. Pure additive surface area. |
| **Backwards compat** | N/A. |
| **New components** | New `/insights` tab with line charts (lift-over-time, ESS distribution, drift heatmap, daily learning feed). |
| **Module interface** | `computeEnginePerfSnapshot(date: Date, repos: { learnedPattern, learningEvent, report }) → EnginePerfSnapshot` — pure given repos. |

### Phase 27 — Public Calibration Trail

| Aspect | Detail |
|---|---|
| **Integration point** | (a) New page `/report/[id]/trail/page.tsx` (Server Component, no auth required since reports are user-scoped but trail can be made public via signed link) rendering: which priors fired at report time, what the engine predicted, what actually happened (price followups), ongoing accuracy stats. (b) Reads from existing `Report.analysis.engine_calibration` snapshot + joins `Report.outcomes` (already exists in schema) + joins `LearningEvent` filtered by `outcome_id IN (...)`. (c) Optionally a new `/api/reports/[id]/trail` JSON endpoint for embedded widget use. |
| **Schema impact** | Minor: add `Report.public_trail_token String? @unique` for shareable signed URLs. Otherwise ZERO schema change — all data already exists. |
| **Build order** | After P22 (composite signal is a primary item in the trail). After P26 (shares perf-snapshot data). LAST PHASE — depends on everything to look impressive. |
| **Disruption risk** | NIL. New page, new route. Existing report rendering untouched. |
| **Backwards compat** | Reports older than P22 simply show "composite signal not available — this report predates v2.0". |
| **New components** | New `/report/[id]/trail` page; optional "View Calibration Trail" button on report page. |
| **Module interface** | `assembleCalibrationTrail(reportId: string, repos) → CalibrationTrail` — pure given repos. |

---

## Recommended Project Structure (v2.0)

```
src/lib/
├── learning.ts                    # v1.0 primitives — UNCHANGED (composes are added next to it)
├── engine-context.ts              # extended in P19, P20, P22, P23
├── gemini-analysis.ts             # extended in P22, P23 (new prompt blocks)
├── data/
│   └── ticker-watchlist.ts        # extended in P24
└── learning-v2/
    ├── decay/                     # P18
    │   ├── index.ts               # decayedBetaUpdate, effectiveSampleSize
    │   ├── decay.test.ts
    │   └── decay.io.ts            # writes alpha_decayed/beta_decayed
    ├── pooling/                   # P19
    │   ├── index.ts               # poolWithParent, computeParentPrior
    │   ├── hierarchy.ts           # the parent-tree definition
    │   ├── pooling.test.ts
    │   └── pooling.io.ts          # recompute pass + writes
    ├── regime/                    # P20
    │   ├── index.ts               # classifyRegime
    │   ├── regime.test.ts
    │   └── repository.ts          # MarketRegime CRUD
    ├── cv/                        # P21
    │   ├── index.ts               # temporalSplit, crossValidatedBrierLift
    │   ├── status.ts              # patternStatusV2
    │   └── cv.test.ts
    ├── composite/                 # P22
    │   ├── index.ts               # composeSignal
    │   └── composite.test.ts
    ├── counterfactual/            # P23
    │   ├── index.ts               # counterfactualDeltas
    │   └── counterfactual.test.ts
    ├── bandit/                    # P24
    │   ├── index.ts               # thompsonPickTickers
    │   └── bandit.test.ts
    ├── backfill/                  # P25
    │   ├── index.ts               # replayHistoricalPriceWindow
    │   ├── chunker.ts
    │   └── backfill.test.ts
    └── perf/                      # P26
        ├── index.ts               # computeEnginePerfSnapshot
        └── perf.test.ts

src/app/
├── api/
│   ├── cron/
│   │   ├── learn/route.ts            # extended P18, P19, P20, P21
│   │   ├── sentiment-scan/route.ts   # extended P24
│   │   ├── price-followup/route.ts   # UNCHANGED (no v2.0 dependencies)
│   │   ├── regime-detect/            # ★ NEW P20
│   │   │   └── route.ts
│   │   └── backfill-resume/          # ★ NEW P25
│   │       └── route.ts
│   └── insights/
│       └── performance/              # ★ NEW P26
│           └── route.ts
├── insights/
│   ├── page.tsx                       # extended P20 (regime banner), P26 (perf tab)
│   └── components/                    # new tabs
└── report/
    └── [id]/
        └── trail/                     # ★ NEW P27
            └── page.tsx
```

### Structure Rationale

- **`learning-v2/<capability>/`:** isolation. Each capability lives in its own directory with index/impl/test/io split, so v2.0 work doesn't sprawl `learning.ts` into a 2000-line file. The `index.ts` barrel is the public interface contract — anything outside the directory only imports from `./index`.
- **`.io.ts` separation:** every capability that touches the DB does so in a single file separate from the math. This keeps `learning-v2/<capability>/index.ts` 100% pure and trivial to vitest-unit-test, while integration tests exercise the `.io.ts` adapter against the live Neon test DB.
- **No new top-level `src/app/learning/` directory:** v2.0 is engine work, not a new UI vertical. Performance dashboard is a `/insights` tab; calibration trail is a sub-route of `/report/[id]`. Discoverable from existing surfaces.

---

## Architectural Patterns

### Pattern 1 — Pure Math + Thin DB Adapter

**What:** Every learning capability has two layers — a pure math module that takes inputs and returns outputs, and a thin adapter that handles Prisma reads/writes. Math module imports nothing except types.

**When:** Always for any new ML primitive. v1.0 already follows this for `learning.ts` ("Pure functions — no DB access. All state is passed in."); v2.0 enforces it as project policy.

**Trade-offs:** Slightly more files; near-100% unit testability without DB; refactors and library swaps are local to the adapter.

**Example:**
```typescript
// learning-v2/decay/index.ts (pure)
export function decayedBetaUpdate(
  prior: BetaPosterior,
  obs: { hit: boolean; age_days: number },
  half_life: number,
): BetaPosterior {
  const w = Math.pow(0.5, obs.age_days / half_life);
  return { alpha: prior.alpha + (obs.hit ? w : 0), beta: prior.beta + (obs.hit ? 0 : w) };
}

// learning-v2/decay/decay.io.ts (adapter)
export async function applyDecayedUpdate(tx, key: CellKey, obs) {
  const cell = await tx.learnedPattern.findUnique({ where: keyToWhere(key) });
  const next = decayedBetaUpdate(cell, obs, cell.decay_half_life_days);
  await tx.learnedPattern.update({ where: keyToWhere(key), data: nextToData(next) });
}
```

### Pattern 2 — Feature-Flagged Behaviour Switch

**What:** Every v2.0 capability ships behind an env var (e.g. `ENABLE_DECAY=1`). When off, the new code path is bypassed and v1.0 behaviour is preserved exactly.

**When:** Any capability that modifies an existing module's behaviour (P18, P19, P20, P21, P22, P24). New surfaces (P26, P27) don't need flags.

**Trade-offs:** A few extra branches in cron routes. Worth it: lets each phase deploy and be observed in production for 1 week before defaulting on. Vercel makes flag flip = single env-var update + redeploy.

**Example:**
```typescript
// learn/route.ts
const decayed = process.env.ENABLE_DECAY === '1';
if (decayed) {
  await applyDecayedUpdate(tx, key, { hit, age_days: ageDays(scanned_at) });
} else {
  await upsertCell(tx, key, hit);
}
```

### Pattern 3 — Additive Schema with Lazy Backfill

**What:** Schema migrations only ADD columns and tables. Existing columns are never dropped; their semantics are never changed. New columns get sensible defaults so old rows read correctly.

**When:** All v2.0 schema work. Especially relevant for P20 (regime in composite key) and P21 (status replacement).

**Trade-offs:** Some redundant columns will accumulate (`status` and `status_v2`, `alpha` and `alpha_decayed`). Cleanup gets a v3.0 phase. Net gain: zero risk of breaking the live engine during incremental rollout.

**Example:** P20 `regime` rollout — add column with `@default("ALL")`, all existing rows become regime='ALL' instantly, new observations write regime='bull-low-vol' going forward, the same `(signal_class, pattern_key, cap_class, horizon_days)` cell exists twice (once per regime). `engine-context.ts` lookup falls back to ALL when no regime-specific row exists.

### Pattern 4 — Cron Pass Composition

**What:** The `learn` cron is structured as a sequence of independent passes (`processNewOutcomes`, `recomputePerCell`, `persistLogisticEpoch`, `cycleSummary`). v2.0 inserts NEW passes (`applyDecayPass`, `applyPoolingPass`, `applyLiftGatePass`) between existing passes rather than mutating any of them.

**When:** Whenever new ML work needs to run on the daily schedule.

**Trade-offs:** Cron functions get longer linearly. Mitigation: each pass is a one-line call into a `learning-v2/*/index.ts` function; the cron route itself stays a thin orchestrator.

**Example:**
```typescript
// learn/route.ts (post-v2.0 cron body)
await processNewOutcomes(history);            // existing
await applyDecayPass({ today: now });          // P18 — NEW
await recomputePerSignalClassPatternMetrics(history);  // existing
await applyPoolingPass();                      // P19 — NEW
await applyLiftGatePass();                     // P21 — NEW (overwrites status)
await persistLogisticEpoch(state, ...);        // existing
await persistEnginePerfSnapshot();             // P26 — NEW
await maybeWriteCycleSummary(stats);           // existing
```

### Pattern 5 — Authoritative Engine + LLM Prose

**What (existing v1.0 contract, preserved in v2.0):** Numeric fields in `engine_calibration` are written by `engine-context.ts` and OVERWRITE whatever the LLM emits. The LLM contributes only labelled prose strings.

**When:** All v2.0 prompt extensions (P22, P23) MUST follow this — composite signal numbers, counterfactual deltas come from `engine-context.ts`; LLM provides only `composite_narrative`, `counterfactual_narrative` strings.

**Trade-offs:** LLM cannot drift the numbers, ever. Cipher's defensible technical claim ("source-grounded reasoning") is preserved as v2.0 expands the prompt surface.

---

## Data Flow — v2.0 Cycle

### Daily Cron Sequence

```
06:00 UTC  /api/cron/regime-detect       (P20)
              ↓ writes today's MarketRegime row
06:00 UTC  /api/cron/price-followup      (UNCHANGED — reads regime via SentimentSnapshot.regime_at_scan)
              ↓ writes new PriceOutcome rows for resolved horizons
07:30 UTC  /api/cron/learn               (extended)
              ├─ processNewOutcomes      → reads regime from snapshot, includes in CellKey
              ├─ applyDecayPass (P18)    → updates effective_sample_size column
              ├─ recomputePerCell        → still computes raw Brier
              ├─ applyPoolingPass (P19)  → writes pooled_alpha, pooled_beta
              ├─ applyLiftGatePass (P21) → overwrites status column
              ├─ persistLogisticEpoch    → unchanged
              ├─ persistEnginePerfSnap   → P26 KPIs
              └─ writeCycleSummary       → unchanged
08:00 UTC  /api/cron/sentiment-scan      (every 3d, extended)
              ├─ thompsonPickTickers     → P24 selects rotation slots
              ├─ for each ticker:
              │     ├─ fetch market data + community + technical + insider + institutional
              │     ├─ stamp regime_at_scan (P20)
              │     └─ write SentimentSnapshot
02:00 UTC  /api/cron/backfill-resume     (P25, nightly chunk)
```

### Report Generation Flow (v2.0)

```
POST /api/research/[ticker]
    → assemble SourcePackage  (UNCHANGED)
POST /api/analysis/[ticker]
    → getEngineContextForTicker(ticker, asOf)
        ├─ resolveRegime(asOf)            → P20 — pin regime for THIS report
        ├─ resolveBucketCellAt30 × 4      → existing 4-class lookup (now regime-aware)
        ├─ applyHierarchicalPooling       → P19 — pull each cell toward parent prior
        ├─ composeMultiCellSignal         → P22 — inverse-variance weighted composite
        ├─ counterfactualDeltas           → P23 — per-class ablation deltas
        └─ readHorizonCalibrations        → existing
    → buildSystemPrompt(ctx)
        = SYSTEM_PROMPT
        + buildEngineContextBlock          (existing)
        + buildTechnicalContextBlock       (existing)
        + buildSmartMoneyContextBlock      (existing)
        + buildCompositeBlock              (P22 — NEW)
        + buildCounterfactualBlock         (P23 — NEW)
    → runGeminiAnalysis
    → POST-PROCESS overwrite numerics      (Pattern 5 — preserved)
    → write Report (with composite_signal snapshot)
    → SSE → /research/[ticker]
        + EngineCalibrationPanel (existing)
        + CompositeBadge (P22)
        + CounterfactualSection (P23)
        + "View Calibration Trail" link  (P27)
```

---

## Suggested Phase Order (v2.0)

```
        Phase 18 ── decay
            │     ↘
        Phase 20 ── regime ──┐
            │     ↘          │
        Phase 19 ── pooling  │
            │     ↘          │
        Phase 21 ── lift-gate (CV) ──┐
            │     ↘                  │
        Phase 22 ── composite ──┐    │
            │                   │    │
            ├──────────────┐    │    │
            │              │    │    │
        Phase 23 ── CF   Phase 24 ── bandit (parallelizable from here)
            │              │    │    │
            │           Phase 26 ── perf dashboard (parallelizable)
            │              │    │    │
            │           Phase 25 ── backfill (uses 18+20+21)
            │              │    │    │
            ╰──────────────┴────┴────┴── Phase 27 ── trail (LAST — needs everything)
```

### Linear-Order Build Recommendation

| Order | Phase | Capability | Why this slot |
|---|---|---|---|
| **1** | **P18** | Time-decayed Bayesian updates | Foundational: provides `effective_sample_size` used by P19, P21, P24. Single-cell math, easy to ship and verify. Visible value: drift defense activates immediately; older observations decay; reports start citing ESS. |
| **2** | **P20** | Market-regime feature | Big schema change — do it EARLY when v2.0 has fewer dependent rows. Adds the regime dimension to the cell key, which P19, P21, P22 all need to respect. Visible value: "current regime" banner ships day one. |
| **3** | **P19** | Hierarchical priors / pooling | Needs P18 (ESS) and P20 (regime in key). Now sparse cells learn faster, which makes EVERY later phase look better. |
| **4** | **P21** | Lift-gated promotion + temporal CV | Needs P18, P19, P20. After this lands, the ACTIVE label MEANS something — primary v1.1 DoD criterion. |
| **5** | **P22** | Composite signal in prompt | First user-visible UX win after the math foundation: every report now has a single headline calibrated probability with credible interval. Requires P19, P21. |
| **6** | **P23** | Counterfactual reasoning | Direct dependency on P22. Cheap incremental win. |
| **7** | **P26** | Live performance dashboard | Independent of P22-P25 (only depends on P21). **Can ship in parallel with P22/P23.** Needed before public-facing P27 to demonstrate the engine is provably better. |
| **8** | **P24** | Adaptive watchlist (bandit) | Independent of P22/P23. **Can ship in parallel with P26.** Needs only P18 + P20. Ships value: cells fill faster, lift improves. |
| **9** | **P25** | Historical backfill | Needs P18 + P20 + P21 ALL settled — backfilling into a still-shifting cell shape is wasted work. Big-bang capability that takes the Brier-lift goal across the line. |
| **10** | **P27** | Public calibration trail | LAST. Needs everything to look polished and impressive. Pure presentation — no math risk. |

### Parallelization Opportunities

- **P22 ‖ P26** — composite signal (engine prompt) and perf dashboard (insights tab) touch different files. Can split between two contributors.
- **P24 ‖ P25 ‖ P27** — once P21 is landed, watchlist work, backfill work, and trail page work touch disjoint files (`ticker-watchlist.ts`, `scripts/backfill-*.ts`, `app/report/[id]/trail/`). Three-way parallel sprint.
- **P18 + P20 schema migration** — combine into ONE Prisma migration to avoid two separate downtime windows. The other schema additions (P19, P21, P26) can each be their own small migration.

### Front-Loaded Schema Migration Plan

To minimize migration risk, batch schema changes into THREE migrations:

| Migration | Adds | Phase |
|---|---|---|
| **v2.0-foundation** | `MarketRegime` table; `LearnedPattern` columns: `regime`, `effective_sample_size`, `decay_half_life_days`; `SentimentSnapshot.regime_at_scan`; new composite unique key; `LearningEvent.delta` JSON gains `decayed_weight` | P18 + P20 |
| **v2.0-pooling-cv** | `LearnedPattern` columns: `pooled_alpha`, `pooled_beta`, `parent_alpha`, `parent_beta`, `pooling_weight`, `brier_oos`, `brier_null_oos`, `lift_pct`, `cv_folds_used` | P19 + P21 |
| **v2.0-coverage** | `EnginePerfSnapshot` table; `WatchlistDecision` table; `BackfillCursor` table; `is_backfill` flags on `SentimentSnapshot` and `PriceOutcome`; `Report.composite_signal`, `Report.public_trail_token` | P22–P27 |

All three migrations are additive only (`ADD COLUMN ... DEFAULT ...` and `CREATE TABLE`). No drops, no `ALTER TYPE`. Safe to run on live Neon while serving traffic.

---

## Disruption-Risk Heatmap

| Phase | Schema | Cron | UI | Prompt | Reports | Overall |
|---|---|---|---|---|---|---|
| P18 decay | LOW (additive cols) | LOW (flag-gated) | NIL | NIL | NIL | **LOW** |
| P19 pooling | LOW (additive cols) | LOW (new pass) | LOW (badge) | NIL | NIL | **LOW** |
| P20 regime | **HIGH** (composite key) | MED (new cron) | MED (banner) | NIL | NIL | **MEDIUM-HIGH** |
| P21 lift-gate | LOW (additive cols) | LOW (replaces status) | MED (demotions visible) | NIL | NIL | **LOW-MED** |
| P22 composite | LOW | NIL | MED (headline badge) | MED (new block) | LOW (new field) | **MEDIUM** |
| P23 counterfactual | NIL | NIL | LOW (subsection) | LOW (new block) | LOW (new field) | **LOW** |
| P24 bandit | LOW (audit table) | LOW (modify scan) | LOW (diagnostics) | NIL | NIL | **LOW** |
| P25 backfill | LOW (flag cols) | MED (new cron + script) | LOW (status widget) | NIL | NIL | **MEDIUM** |
| P26 perf | LOW (1 new table) | LOW (1 new write per cycle) | MED (new tab) | NIL | NIL | **LOW** |
| P27 trail | LOW (1 nullable col) | NIL | MED (new page) | NIL | NIL | **LOW** |

**Highest-risk phase:** P20 because of the composite-key change. Mitigation: TWO-step migration (add column with default, then add new constraint) and a one-week soak in production with `regime='ALL'` for everyone before flipping the regime detector to write real labels.

---

## Anti-Patterns to Avoid

### Anti-Pattern A — Modifying `learning.ts` in place

**What:** Adding decay/pool/CV functions inline in `src/lib/learning.ts`.
**Why bad:** That file is the v1.0 contract. Inline edits balloon it past 1000 lines, mix maturity levels, and make `git blame` useless.
**Instead:** Every v2.0 capability lives in `src/lib/learning-v2/<name>/`. `learning.ts` stays frozen.

### Anti-Pattern B — Hidden coupling via `EngineContext`

**What:** Adding fields to `EngineContext` that are mutually dependent (e.g. `composite_signal` quietly assumes `pooled_alpha` is populated).
**Why bad:** Phase ordering becomes invisible coupling; tests pass with stale fixtures.
**Instead:** Every new `EngineContext` field is computed by an explicitly named composer (`composeMultiCellSignal`, `applyHierarchicalPooling`) called in a fixed order in `getEngineContextForTicker`. Composer dependencies are typed.

### Anti-Pattern C — Swapping primitives behind the same name

**What:** Replacing `patternStatus()` body with v2 logic without renaming.
**Why bad:** Existing tests pin v1 behaviour; downstream readers don't know a semantic shift happened.
**Instead:** Add `patternStatusV2()` next to v1; flag-gate the cron call site; delete v1 only after a deprecation cycle.

### Anti-Pattern D — Letting the LLM author numbers

**What:** Allowing Gemini to fill in `composite_signal.posterior_mean` even "as a backup."
**Why bad:** Breaks Cipher's "source-grounded" defensible claim. v1.0 explicitly overwrites all numerics post-generation (`gemini-analysis.ts:830-848`).
**Instead:** New prompt blocks (P22, P23) follow the v1.0 pattern: numerics overwritten post-generation, LLM contributes only narrative strings.

### Anti-Pattern E — Backfilling before the cell shape is final

**What:** Running P25 backfill before P20 (regime) and P21 (lift-gate) settle.
**Why bad:** 4M backfilled rows into a key shape that's about to change = expensive recompute + risk of corruption.
**Instead:** P25 is the LAST math phase. Once it runs, the cell shape is locked.

---

## Scalability Considerations

| Concern | At v2.0 launch | After 6 mo of P25 backfill | At 1y |
|---|---|---|---|
| `LearnedPattern` row count | ~500 (existing) → ~1,500 (×3 regimes) | ~6,000 with pooled rows | ~10,000 |
| `LearningEvent` rows/day | ~200 | ~500 (with backfill writes) | ~1,000 |
| `PriceOutcome` rows | ~3k | ~4M with backfill | ~5M |
| `learn` cron runtime | ~30s | ~90s (P19 + P21 added) | ~150s |
| Report-time engine context fetch | ~40ms | ~80ms (composite + CF) | ~120ms |
| Vercel function maxDuration | 300s (configured) | 300s (sufficient) | 300s (still sufficient) |

**Bottleneck risk:** P25 backfill's recompute pass scales as O(cells × events). At 4M events × 6,000 cells, the inner `recomputeOneCell` query budget becomes the limit. Mitigation: index `LearningEvent(signal_class, pattern_key, cap_class, horizon_days, regime)`; cap per-cell `take: 500` is already in v1.0.

---

## Sources

- `/Users/tj/Desktop/Cipher/.planning/PROJECT.md` (v1.1 vision)
- `/Users/tj/Desktop/Cipher/.planning/milestones/v1.0-ROADMAP.md` (v1.0 architecture as shipped)
- `/Users/tj/Desktop/Cipher/src/lib/learning.ts` (Bayesian primitives — v1.0 contract preserved)
- `/Users/tj/Desktop/Cipher/src/lib/engine-context.ts` (EngineContext interface — v2.0 extension surface)
- `/Users/tj/Desktop/Cipher/src/lib/gemini-analysis.ts` (prompt assembly + post-process overwrite pattern)
- `/Users/tj/Desktop/Cipher/src/lib/data/ticker-watchlist.ts` (rotation logic — bandit hook point)
- `/Users/tj/Desktop/Cipher/prisma/schema.prisma` (current schema — additive baseline)
- `/Users/tj/Desktop/Cipher/vercel.json` (cron schedule — adds for P20, P25)
- `/Users/tj/Desktop/Cipher/src/app/api/cron/learn/route.ts` (5-pass cron structure — insertion points for P18, P19, P21, P26)
- `/Users/tj/Desktop/Cipher/src/app/api/cron/sentiment-scan/route.ts` (watchlist call site — P24 hook)
- `/Users/tj/Desktop/Cipher/src/app/api/cron/price-followup/route.ts` (unchanged in v2.0 — confirmed no dependency)

**Confidence:** HIGH — every integration point named is traced to a real line in the live v1.0 codebase. Schema deltas are concrete and additive. Phase order respects observed code dependencies (e.g. P19 needs `effective_sample_size` which is a P18 column; P22 reads `pooled_alpha` which is P19; P25 backfills into shape locked by P20+P21).
