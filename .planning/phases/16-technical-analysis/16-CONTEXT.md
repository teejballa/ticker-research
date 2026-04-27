# Phase 16 — Technical Analysis as a Learning Signal

## Goal
Make technical analysis a first-class signal class in Cipher's auto-improving research engine. Every indicator we compute serves three purposes simultaneously:
1. Renders in the report's Technical Signals card.
2. Trains a parallel Bayesian prior in the learning engine.
3. Feeds the `engine_calibration` block that both Gemini and the user read.

The engine learns which technical regimes historically produced excess return vs SPY, and surfaces that prior in every future report.

## Why this matters now
Phase 15 shipped a Bayesian diffusion engine that already learns from community-attention diffusion outcomes (Beta-Bernoulli per `(flow_pattern × cap_class)` + a 6-d Bayesian logistic regression). Adding TA as a static "render some indicators" feature would waste the auto-improvement scaffolding. This phase threads TA through the same `scan → outcome → posterior` loop the engine already uses, so technical signals become **learnable** rather than decorative.

## Architectural thesis
**Pre-Phase 16** the engine asks one question per ticker:
> *Given the diffusion shape of community attention, does this ticker beat SPY by >1% over 7d?*

**Post-Phase 16** it asks two complementary questions and combines them:
- **Q1** — Given the **community diffusion regime**, what is P(alpha)?
- **Q2** — Given the **technical regime**, what is P(alpha)?
- **Q3** — Where Q1 and Q2 agree, conviction compounds. Where they disagree, the report flags the conflict explicitly. *(This is genuine alpha-edge content — most platforms only show one or the other.)*

## Scope

### 1. Technical signal class
Daily-bar indicators computed in a new `src/lib/data/technical.ts`:
- RSI(14), MACD(12/26/9) line/signal/histogram, SMA(50), SMA(200)
- ATR(14) for vol-adjustment, 20-day average volume, today's volume ratio
- Derived regime tags: `trend_regime`, `momentum_regime`, `cross_state`
- Final classification into a finite **`TechPattern`** bucket (see below)

**TechPattern (8 buckets):**
`breakout_uptrend`, `overbought_uptrend`, `pullback_in_uptrend`, `consolidation`, `breakdown`, `oversold_downtrend`, `death_cross`, `golden_cross`.

8 buckets is a deliberate trade-off — fine enough to separate "overbought reversal" from "breakout," coarse enough that common cells reach ACTIVE status within ~30–60 days of backfill.

### 2. Snapshot integration
- `SentimentSnapshot` gains `technical_data Json?` column. The `sentiment-scan` cron writes it on every scan, paralleling `community_data`.
- `Report` gains `technical_at_report Json?` column persisted alongside the existing `community_data`.
- One snapshot row = one full sensor reading (community + technical), so the existing outcome → posterior loop trains both signal classes from the same row.

### 3. Multi-horizon outcomes (engine-wide change)
Sentiment effects play out over weeks-to-months. The engine currently records outcomes at 3/7/14 days for reports and 3/7 days for snapshots, but only trains on the 7d slice. Extend to **3, 7, 14, 30, 60, 90 days** for both reports and snapshots.

This is more than a TA change — it materially expands what the entire engine knows about *every* signal it learns.

### 4. Dual-class learning loop
`learn/route.ts` updates **two** Beta cells per outcome (one diffusion, one technical) at every recorded horizon. A single 12-feature Bayesian logistic regression trains on the primary 30d horizon and combines all features.

**Why one logistic, not six?** Reports are multi-week research, not day-trades. 30d is a credible thesis window: long enough for sentiment to play out, short enough that macro noise doesn't swamp the signal. The other horizons surface as transparent Beta-cell evidence in the calibration table — not as separately-trained logistic models.

### 5. Calibration display
The `engine_calibration` block becomes a **horizon table**:

```
HORIZON  POSTERIOR  CI         N    STATUS
7d       0.62       0.51-0.73  47   ACTIVE
14d      0.58       0.46-0.69  43   ACTIVE
30d★     0.61       0.48-0.74  38   ACTIVE   ← primary, drives logistic
60d      0.55       0.40-0.69  31   EXPLORATORY
90d      0.52       0.36-0.68  28   EXPLORATORY
```

Diffusion and technical priors render side-by-side in `EngineCalibrationPanel`. An **Agreement badge** between them ("ALIGNED" / "MIXED" / "OPPOSED") quantifies Q3.

## Data model changes

### Prisma migrations
- `LearnedPattern`:
  - Add `signal_class String` (`'diffusion' | 'technical'`).
  - Add `horizon_days Int`.
  - Rename `flow_pattern` → `pattern_key` (covers both flow patterns and tech patterns).
  - New unique key: `(signal_class, pattern_key, cap_class, horizon_days)`.
  - Existing rows backfill as `signal_class='diffusion'`, `horizon_days=7`.
- `SentimentSnapshot`: add `technical_data Json?`.
- `Report`: add `technical_at_report Json?`.
- `LogisticEpoch`: schema unchanged — `coefficients` is already a JSON column and just grows from 6 to 12 keys.

### Cell-space arithmetic
- 8 tech patterns × 4 cap classes × 6 horizons = **192 technical cells**
- 4 flow patterns × 4 cap classes × 6 horizons = **96 diffusion cells**
- **Total: 288 cells.** Most stay EXPLORATORY for a long time; `patternStatus()` already gates on sample size, so this is safe.

## Cron impact

| Cron | Today | After Phase 16 |
|------|-------|----------------|
| `/api/cron/sentiment-scan` | scrapes community per ticker | additionally fetches 1y daily OHLCV via `yf.chart()`, computes `TechnicalSnapshot`, classifies `TechPattern`, writes `technical_data` on the same snapshot row |
| `/api/cron/price-followup` | 3/7/14 (reports) + 3/7 (snapshots) | **3/7/14/30/60/90 for both.** Query window extends from 15d → 95d. |
| `/api/cron/learn` | trains diffusion-only on 7d outcomes | inner loop iterates **per horizon**: dual Beta cell updates (one diffusion, one technical) at every horizon. **12-d logistic update fires only on 30d outcomes.** Recompute pass extends to all 288 cells. |

## Integration surfaces

### `gemini-analysis.ts`
The `Engine Calibration Context` block in the system prompt gains a parallel **Technical Calibration Context** block + the horizon table. Trust boundary preserved: Gemini fills `technical_alignment` / `technical_disagreement` strings only; numeric fields are post-process overwritten from `getEngineContextForTicker()`. The system prompt explicitly states 30d is the primary horizon.

### `engine-context.ts`
`EngineContext` grows new fields:
```ts
technical_pattern: TechPattern | null;
technical_posterior_mean: number | null;
technical_ci: [number, number] | null;
technical_status: PatternStatus;
horizon_calibrations: Array<{
  horizon_days: number;
  diffusion_posterior: number | null;
  diffusion_ci: [number, number] | null;
  technical_posterior: number | null;
  technical_ci: [number, number] | null;
  sample_size: number;
  status: PatternStatus;
}>;
combined_logistic_score: number | null;        // 12-d model, 30d-trained
agreement: 'aligned' | 'mixed' | 'opposed' | 'unknown';
```

### `AnalysisResult` / `EngineCalibration`
`EngineCalibration` interface gains `technical_*` fields, the `horizon_calibrations` array, and the agreement label. Old persisted reports stay backwards-compatible — UI hides absent fields, never crashes.

### UI
- **`EngineCalibrationPanel`**: side-by-side DIFFUSION × TECHNICAL columns + horizon table beneath + agreement badge between them.
- **`ResearchReport`**: new compact "Technical Signals" card (RSI gauge, MACD direction, MA stack, volume ratio).
- **`/insights`**: new "Technical Pattern Library" tab (mirrors the Pattern Library) and a "Horizon Brier" view (does prediction quality decay with horizon?).

### Prompt-side integration
The Buy/Hold/Sell rationale and `future_projection` get explicit horizon language: "over the next 30 days the engine prior is X"; "by 90 days, base-rate evidence weakens to Y." Enforced via system-prompt requirements, not just suggestion.

## Plan breakdown

1. **16-01 — Compute + types.** `npm install technicalindicators`. `src/lib/data/technical.ts` (RSI / MACD / SMA50 / SMA200 / ATR / volume + `TechPattern` classifier). `TechnicalSnapshot` interface. Unit tests for indicator math + pattern classification edge cases. No DB writes yet.

2. **16-02 — Multi-horizon schema + price-followup extension.** Prisma migration: add `signal_class` + `horizon_days` + rename `flow_pattern` → `pattern_key` on `LearnedPattern`; add `technical_data` JSON column on `SentimentSnapshot`; add `technical_at_report` JSON column on `Report`. Extend `price-followup/route.ts` `TARGET_DAYS` to `[3, 7, 14, 30, 60, 90]`. Backfill existing `LearnedPattern` rows.

3. **16-03 — Snapshot writer + learn-loop extension.** `sentiment-scan` cron computes `TechnicalSnapshot` per ticker and writes it on every snapshot. `learn/route.ts` runs dual signal-class Beta updates per horizon, trains the 12-d logistic on 30d outcomes only, recomputes Brier/drift across all 288 cells. Extend `LearningEvent.delta` for tech_pattern.

4. **16-04 — Engine context + report + prompt integration.** Extend `engine-context.ts` to return technical fields + `horizon_calibrations`. Update `gemini-analysis.ts` system prompt with technical calibration block. Extend `EngineCalibration` interface (backwards-compatible). Update `EngineCalibrationPanel.tsx` for side-by-side display. Add "Technical Signals" indicator card to `ResearchReport`.

5. **16-05 — Historical backfill + insights surface + integration test.** One-shot script (`scripts/backfill-technical.ts`) replays existing snapshots through the new `TechPattern` classifier; refetches OHLCV for snapshots that don't have it cached. Backfill new horizons (30/60/90) for snapshots/reports already past those thresholds. New "Technical Pattern Library" + "Horizon Brier" tabs on `/insights`. Live-DB integration test (analog of `engine-affects-reports`) proves a technical-signal cycle at horizon X changes the calibration block at horizon X.

## Dependencies
- `npm install technicalindicators` (MIT, no API).
- Yahoo Finance `chart()` — already used in scan/follow-up crons; no new external dependency.
- Vercel cron schedule unchanged (3 existing crons stay; price-followup just queries a wider window).

## Out of scope
- **Intraday signals** (1h / 15m bars). Daily horizon matches the 30d-primary outcome window naturally; intraday would need its own cron + outcome window.
- **Advanced pattern recognition** (head-and-shoulders, candle patterns). v2 if the 8-bucket priors mature.
- **Technical-driven price targets.** Price targets remain analyst-derived; technical regime informs P(alpha) only.

## Acceptance criteria
1. `EngineCalibrationPanel` renders DIFFUSION + TECHNICAL columns + horizon table for any ticker the engine has data on; gracefully degrades to the existing diffusion-only view for old persisted reports.
2. Running the same ticker twice across a `learn` cycle produces a different `engine_calibration` block (technical priors moved). Live integration test asserts this.
3. After backfill, at least 25% of cells in the most-traded `cap_class` × `horizon_days=7` row have `status='ACTIVE'` (sanity check that we have enough data to learn from).
4. Brier score on the 30d horizon improves over the 7d horizon for at least one ACTIVE pattern, demonstrating the multi-horizon thesis. (If not, the calibration table still surfaces the truth — that's also a win.)
5. Gemini's `future_projection` and Buy/Hold/Sell rationale explicitly reference 30d as the primary horizon and cite at least one technical pattern.
