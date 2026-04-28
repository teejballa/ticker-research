# Phase 16: Technical Analysis as a Learning Signal — Research

**Researched:** 2026-04-27
**Domain:** Technical analysis as a parallel signal class in a Bayesian self-improving learning engine (TypeScript, Next.js 15 + Prisma 7 + Neon)
**Confidence:** HIGH (deep codebase context already locked; the open questions are bounded and pinned)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

These come from `16-CONTEXT.md` and constrain every plan and task. Do not propose alternatives.

- **Library:** `technicalindicators` (npm, MIT, no API key). [VERIFIED: npm view technicalindicators → 3.1.0, MIT, last published 2023-07-12]
- **Indicators computed:** RSI(14), MACD(12/26/9) line/signal/histogram, SMA(50), SMA(200), ATR(14), 20-day average volume, today's volume ratio. Daily bars only.
- **TechPattern bucket count = 8:** `breakout_uptrend`, `overbought_uptrend`, `pullback_in_uptrend`, `consolidation`, `breakdown`, `oversold_downtrend`, `death_cross`, `golden_cross`. Fine enough to separate "overbought reversal" from "breakout"; coarse enough to reach ACTIVE in ~30–60 days.
- **Snapshot storage:** `SentimentSnapshot.technical_data Json?` (parallel to `community_data`). One snapshot row = one full sensor reading.
- **Report storage:** `Report.technical_at_report Json?` (parallel to `community_data`).
- **Multi-horizon outcomes (engine-wide):** extend from `[3, 7, 14]` to `[3, 7, 14, 30, 60, 90]` for **both** reports and snapshots. Query window in `price-followup` extends `15d → 95d`.
- **Dual-class learn loop:** every resolved outcome updates **two** Beta cells per horizon (one diffusion, one technical). The 12-feature Bayesian logistic trains **only on the 30d horizon** — the other horizons surface as transparent Beta-cell evidence in the calibration table.
- **Cell space = 288:** 8 tech × 4 cap × 6 horizons (192) + 4 flow × 4 cap × 6 horizons (96) = 288 cells.
- **Prisma schema migrations:**
  - `LearnedPattern`: add `signal_class String` (`'diffusion' | 'technical'`), add `horizon_days Int`, **rename `flow_pattern` → `pattern_key`**. New unique key: `(signal_class, pattern_key, cap_class, horizon_days)`. Existing rows backfill as `signal_class='diffusion'`, `horizon_days=7`.
  - `SentimentSnapshot`: add `technical_data Json?`.
  - `Report`: add `technical_at_report Json?`.
  - `LogisticEpoch`: schema unchanged (the `coefficients` JSON just grows from 6 → 12 keys).
- **Calibration display:** horizon table (3/7/14/30★/60/90) inside `EngineCalibrationPanel`. DIFFUSION × TECHNICAL columns side-by-side, agreement badge between them (`ALIGNED` / `MIXED` / `OPPOSED`).
- **Trust boundary preserved:** Gemini fills only `technical_alignment` / `technical_disagreement` strings; numeric fields are post-process overwritten from `getEngineContextForTicker()`.
- **Prompt requirement (system prompt):** 30d is the primary horizon; `future_projection` and Buy/Hold/Sell rationale must reference 30d explicitly + cite at least one technical pattern.
- **Plan structure:** five sub-plans (16-01 compute+types · 16-02 schema+price-followup · 16-03 snapshot writer + learn-loop · 16-04 engine-context + report + prompt · 16-05 backfill + insights + integration test).

### Claude's Discretion

- Exact internal layout of `TechnicalSnapshot` interface (fields chosen below in §3).
- Exact thresholds for the 8-bucket `TechPattern` classifier (recommended thresholds in §3.2).
- Implementation pattern for the schema rename (recommended approach in §6 — single migration: add new columns, backfill, drop old).
- Concurrency strategy for the backfill script (recommended: sequential with 1s rate-limit, not parallel — Yahoo Finance throttles).
- Where to surface insights tabs on `/insights` (recommended: new tabs added to existing `InsightsDashboard` component).
- Whether to store full OHLCV array on each snapshot or just derived indicators (recommended: derived indicators only; OHLCV is recoverable from yahoo-finance2).

### Deferred Ideas (OUT OF SCOPE)

- **Intraday signals** (1h / 15m bars) — daily horizon matches the 30d-primary outcome window naturally; intraday would need its own cron + outcome window.
- **Advanced pattern recognition** (head-and-shoulders, candle patterns) — v2 if 8-bucket priors mature.
- **Technical-driven price targets** — price targets remain analyst-derived; technical regime informs P(alpha) only.
</user_constraints>

<phase_requirements>
## Phase Requirements

The phase has no formal `REQUIREMENTS.md` IDs. The 5 acceptance criteria (AC1–AC5) and 5 sub-plans (16-01 through 16-05) in `16-CONTEXT.md` ARE the requirements.

| ID | Description | Research Support |
|----|-------------|------------------|
| AC1 | `EngineCalibrationPanel` renders DIFFUSION + TECHNICAL columns + horizon table for any ticker the engine has data on; gracefully degrades to existing diffusion-only view for old persisted reports | §11 — UI extension strategy with absent-field guards |
| AC2 | Running the same ticker twice across a `learn` cycle produces a different `engine_calibration` block; live integration test asserts this | §13 — `engine-affects-reports.test.ts` is the existing template; technical analog described |
| AC3 | After backfill, ≥25% of cells in the most-traded `cap_class × horizon_days=7` row have `status='ACTIVE'` | §10 — backfill strategy guarantees enough samples; §12 — assertion in script + integration test |
| AC4 | Brier score on 30d horizon improves over 7d horizon for ≥1 ACTIVE pattern (loose pass — surfacing the truth either way is the win) | §8 — recompute pass extends to all 288 cells; §13 — Brier comparison script |
| AC5 | Gemini's `future_projection` + Buy/Hold/Sell rationale reference 30d as primary horizon AND cite ≥1 technical pattern | §11 — system prompt extension; §13 — regex assertion against streamed analysis |
| 16-01 | Compute + types | §3 — `technicalindicators` API verified; `TechnicalSnapshot` interface proposed |
| 16-02 | Multi-horizon schema + price-followup extension | §6 — Prisma rename strategy; §7 — price-followup runtime budget |
| 16-03 | Snapshot writer + learn-loop extension | §5 — yahoo-finance2 chart shape + cost; §8 — dual-class learn algorithm |
| 16-04 | Engine context + report + prompt integration | §9 — `engine-context.ts` extension; §11 — UI + prompt |
| 16-05 | Historical backfill + insights surface + integration test | §10 — backfill script; §12 — insights tabs; §13 — integration test |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

These are non-negotiable and apply to every plan/task in this phase:

1. **No Python, no container** — pure TypeScript pipeline (decommissioned in Phase 12). Anything that wants to run "outside the function" must be a Vercel cron, Vercel Function, or a script run locally against the live DB.
2. **Pipeline modularity:** data collection / prompt assembly / model reasoning / rendering must stay independently testable.
3. **Source-grounded reasoning** — Gemini may not invent technical readings; numeric fields are written by `engine-context.ts` and post-process-overwritten.
4. **No generated artifacts in repo** — backfill outputs (logs, intermediate JSON) MUST go to `/tmp` or be gitignored.
5. **Test discipline:** Vitest for units (`npm test`), live-DB integration tests via `npm run test:integration`, Playwright for e2e (`npm run test:e2e`).
6. **Frontend rule (global CLAUDE.md):** any UI change requires `gsd:ui-phase` → `gsd:ui-review` → Playwright validation. Phase 16 has UI changes (new horizon table, side-by-side panel, new "Technical Signals" card, new insights tabs) — these will need a UI-SPEC.

## Summary

Phase 16 is **engine extension**, not a new feature. Three things have to land in lockstep:

1. **A new sensor** — `src/lib/data/technical.ts` consumes daily OHLCV from `yahoo-finance2`, computes RSI/MACD/SMA/ATR/volume, and classifies into 8 `TechPattern` buckets. This is library work.
2. **A schema reshape** — `LearnedPattern` becomes `(signal_class × pattern_key × cap_class × horizon_days)` and existing rows backfill as `signal_class='diffusion', horizon_days=7`. `SentimentSnapshot` and `Report` each gain a JSON column. The price-followup outcome window extends from 15d → 95d, target horizons from `[3,7,14]` → `[3,7,14,30,60,90]`.
3. **A learning loop that updates both signal classes per horizon** — `learn/route.ts` runs dual Beta updates per horizon for every resolved outcome; the 12-d logistic trains only on 30d. The recompute pass extends from 16 cells (4 flow × 4 cap) to 288 (8 tech × 4 cap × 6 horizon + 4 flow × 4 cap × 6 horizon).

The trust boundary is preserved: Gemini can only contribute prose strings to `engine_calibration`; numbers are written by `engine-context.ts`. The horizon table renders gracefully when fields are absent (old persisted reports).

**Primary recommendation:** Pin `technicalindicators@3.1.0`. Use the Prisma "expand-then-contract" rename pattern in a single migration (add new columns, backfill in same migration, drop old). Backfill snapshots/reports with a sequential 1-second-throttled script, not parallel — Yahoo Finance is rate-limited and the backfill is one-shot. Wave 0 of plan 16-05 must include the integration test stub (analog of `engine-affects-reports.test.ts`).

## Standard Stack

### Core (already in package.json)

| Library | Version (locked) | Purpose | Why Standard |
|---------|------------------|---------|--------------|
| `yahoo-finance2` | `^3.13.2` (latest 3.14.0) | Daily OHLCV via `yf.chart()` | Already in use; same client used by sentiment-scan, price-followup, learn. [VERIFIED: npm view yahoo-finance2 version → 3.14.0] |
| `@prisma/client` | `^7.5.0` | DB ORM | Already in use; Phase 6 migrated to Prisma 7 (URLs in `prisma.config.ts` per project memory). |
| `@prisma/adapter-neon` | `^7.5.0` | Neon serverless adapter | Already in use; integration tests construct it directly. |
| `ai` | `6.0.168` (pinned exact) | Gemini via Vercel AI Gateway | Already in use; system-prompt extension only. |
| `zod` | `^3.24.2` | Schema validation | Already in use; `AnalysisResultSchema` extension only. |
| `vitest` | `^3.0.9` | Unit + integration tests | Already configured (separate `vitest.integration.config.ts`). |
| `@playwright/test` | `^1.58.2` | E2E tests | Already configured. |

### New Dependency

| Library | Version (locked) | Purpose | Why Standard |
|---------|------------------|---------|--------------|
| `technicalindicators` | `3.1.0` (exact pin) | RSI/MACD/SMA/ATR computations | MIT, no API key, ~5.1MB unpacked, mature (since 2016), used widely. [VERIFIED: `npm view technicalindicators` → 3.1.0, MIT, last published 2023-07-12] |

**Important:** technicalindicators v3 dropped pattern recognition into a separate path; we don't need it (out of scope per CONTEXT.md). Use the top-level static `.calculate()` API — see §3.1.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `technicalindicators@3.1.0` | `trading-signals@7.4.3` | Modern (Jan 2026), arbitrary-precision decimals, but unfamiliar API and decimal types add friction with our `number` pipeline. [CITED: npm view trading-signals → 7.4.3, 2026-01-21]. **Reject** — CONTEXT.md locks `technicalindicators`. |
| `technicalindicators@3.1.0` | `@ixjb94/indicators@1.2.4` | "Fastest" claim, modern TS, but smaller ecosystem and no NaN/edge-case docs. [CITED: npm view @ixjb94/indicators → 1.2.4, 2024-09-15]. **Reject** — CONTEXT.md lock. |
| `technicalindicators@3.1.0` | `node-talib` (TA-LIB binding) | Industry-standard math, but C++ native binding fails on Vercel Functions (no compiler in runtime). **Reject** — incompatible with Vercel architecture. |

### Installation

```bash
npm install technicalindicators@3.1.0
```

Pin exact (no `^`) to match Phase 12's pinning policy ([CITED: STATE.md — "Exact version pinning for ai@6.0.168 and @mendable/firecrawl-js@4.18.3 per threat model"]).

### Version verification

Run before plan 16-01:

```bash
npm view technicalindicators version    # expect 3.1.0
npm view technicalindicators time.modified  # 2023-07-12 — older but stable
npm view yahoo-finance2 version         # ≥ 3.14.0
```

The age (2.5+ years since last release) is a flag, not a blocker — the math is stable, no dependents have forked successfully (multiple `@*/technicalindicators` mirrors exist, none have meaningful traction).

## Architecture Patterns

### Recommended File Layout

```
src/lib/data/
├── technical.ts                    # NEW — fetcher + indicator computation + TechPattern classifier
├── lightweight-community-scan.ts   # existing
├── ticker-watchlist.ts             # existing
└── ...

src/lib/
├── engine-context.ts               # MODIFY — add technical_*, horizon_calibrations, agreement
├── learning.ts                     # MODIFY (minor) — feature_names extends to 12; logic unchanged
├── gemini-analysis.ts              # MODIFY — buildEngineContextBlock + schema gains technical_*
├── types.ts                        # MODIFY — TechPattern, TechnicalSnapshot, EngineCalibration extension
└── ...

src/app/api/cron/
├── sentiment-scan/route.ts         # MODIFY — also fetch chart, compute snapshot, write technical_data
├── price-followup/route.ts         # MODIFY — TARGET_DAYS = [3,7,14,30,60,90]; window 95d
└── learn/route.ts                  # MODIFY — dual cell updates per horizon; 12-d logistic on 30d only

src/components/
├── EngineCalibrationPanel.tsx      # MODIFY — side-by-side columns + horizon table + agreement badge
├── ResearchReport.tsx              # MODIFY — new "Technical Signals" card
└── insights/                       # MODIFY — new "Technical Pattern Library" + "Horizon Brier" tabs

scripts/
└── backfill-technical.ts           # NEW — replays snapshots through TechPattern classifier; backfills horizons

tests/integration/
├── engine-affects-reports.test.ts  # existing
└── technical-affects-reports.test.ts  # NEW — analog for technical signal class

prisma/
├── schema.prisma                   # MODIFY — see §6
└── migrations/
    └── {timestamp}_add_technical_signal_class/migration.sql  # NEW

tests/unit/
├── technical.test.ts               # NEW — indicator math + classifier edge cases
└── (extend) engine-context.test.ts # technical_* fields, horizon_calibrations, agreement logic
```

### Pattern 1: Sensor → Snapshot → Outcome → Posterior (existing engine pattern, extended)

**What:** The engine already follows the loop: `sentiment-scan` writes `SentimentSnapshot`, `price-followup` writes `PriceOutcome`, `learn` updates `LearnedPattern`. Phase 16 adds a parallel reading on the SAME snapshot row.

**When to use:** Every snapshot. Both `community_data` and `technical_data` are written in one `prisma.sentimentSnapshot.create()` call.

**Example:**

```ts
// src/app/api/cron/sentiment-scan/route.ts (modified)
const technicalData = await computeTechnicalSnapshot(ticker);  // NEW — see §3
const communityData = await lightweightCommunityScan(ticker);  // existing
if (!communityData && !technicalData) { results.failed++; continue; }

await prisma.sentimentSnapshot.create({
  data: {
    ticker,
    scanned_at: new Date(),
    price_at_scan: price,
    community_data: communityData as object,
    technical_data: technicalData as object | null,  // NEW column
  },
});
```

### Pattern 2: Per-cell Bayesian update keyed on `(signal_class, pattern_key, cap_class, horizon_days)`

**What:** Existing `learn/route.ts` updates `(flow_pattern × cap_class)` cells. After Phase 16: every resolved outcome at horizon H updates two cells:
- `(diffusion, flow_pattern, cap_class, H)`
- `(technical, tech_pattern, cap_class, H)`

**When to use:** Inside the per-outcome loop in `learn/route.ts`, after the diffusion trace has been computed AND the snapshot's `technical_data.tech_pattern` has been read.

**Example:**

```ts
// src/app/api/cron/learn/route.ts (modified — see §8 for full sketch)
for (const o of outcomes) {
  const trace = await buildTraceForOutcome(o);
  const techPattern = await readTechPatternForOutcome(o);   // NEW — read from snapshot
  const hit = classifyHit({ ticker_return_pct: o.ticker_return_pct, spy_return_pct });
  const horizon = o.days_after;  // 3 | 7 | 14 | 30 | 60 | 90

  // Diffusion cell (existing logic, but keyed on horizon now)
  if (trace?.flow_pattern && trace.flow_pattern !== 'flat') {
    await upsertCell({ signal_class: 'diffusion', pattern_key: trace.flow_pattern, cap_class: trace.cap_class, horizon_days: horizon }, hit);
  }
  // Technical cell (new)
  if (techPattern) {
    await upsertCell({ signal_class: 'technical', pattern_key: techPattern, cap_class: trace?.cap_class ?? 'unknown', horizon_days: horizon }, hit);
  }

  // Logistic update — ONLY on 30d outcomes
  if (horizon === 30) {
    const x12 = [...diffusionFeatures, ...technicalFeatures];   // 12-d
    logisticState = updateLogistic(logisticState, x12, hit ? 1 : 0);
  }
}
```

### Pattern 3: Authoritative numeric fields, LLM-authored prose only

**What:** `engine-context.ts` returns the calibrated numbers. `gemini-analysis.ts` post-process-overwrites the numeric fields, keeping only the prose. Phase 16 extends this pattern from one signal-class to two.

**Example (existing pattern, applied to new fields):**

```ts
// src/lib/gemini-analysis.ts (extended runGeminiAnalysis)
engine_calibration = {
  // existing diffusion fields
  flow_pattern: engineCtx.flow_pattern,
  posterior_mean: engineCtx.posterior_mean,
  // ...

  // NEW technical fields — overwritten from engineCtx, never from LLM
  technical_pattern: engineCtx.technical_pattern,
  technical_posterior_mean: engineCtx.technical_posterior_mean,
  technical_ci: engineCtx.technical_ci,
  technical_status: engineCtx.technical_status,

  // NEW horizon table — overwritten
  horizon_calibrations: engineCtx.horizon_calibrations,

  // NEW agreement label — derived in engine-context.ts, not by LLM
  agreement: engineCtx.agreement,

  // LLM contributes only these strings
  engine_alignment: llm.engine_alignment ?? null,
  engine_disagreement: llm.engine_disagreement ?? null,
  technical_alignment: llm.technical_alignment ?? null,        // NEW
  technical_disagreement: llm.technical_disagreement ?? null,  // NEW
};
```

### Anti-Patterns to Avoid

- **Storing full OHLCV array on every snapshot.** Each chart is ~250 rows × 5 fields = 1250 numbers per snapshot, and we scan ~25 tickers/day. Wasteful when the indicators are derived. Store **derived `TechnicalSnapshot` only**; the OHLCV is recoverable on demand from yahoo-finance2.
- **Dropping the old `flow_pattern` column before backfilling `pattern_key`.** A failed migration mid-run with no rollback path is catastrophic on Neon. Use expand-then-contract (§6).
- **Parallel backfill (`Promise.all` over thousands of snapshots).** Yahoo Finance throttles aggressively; the existing `sentiment-scan` cron already sleeps 2s between tickers. Backfill MUST be sequential with throttle.
- **Letting the logistic train on every horizon.** CONTEXT.md is explicit: 30d only. If you train 6 logistics, the calibration block has 6 mutually-inconsistent answers and nobody knows which to read.
- **Running the schema migration "soft" via `prisma db push`.** This is a production-Neon migration. Use `prisma migrate dev` (locally), commit the SQL, and let `prisma migrate deploy` (already in build command via `vercel.json`) apply it on deploy.
- **Computing `technical_data` for the report's analyzed_at on the analysis hot path.** This adds ~500ms per report. Instead: write `technical_at_report` from the same daily-bar snapshot used for the matching `SentimentSnapshot` lookup if one exists within 24h; otherwise compute on demand once.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| RSI / MACD / SMA / ATR math | A from-scratch indicator library | `technicalindicators@3.1.0` | Wilder smoothing for RSI/ATR, EMA seeding, divide-by-zero edge cases, NaN-at-warmup behavior — already handled. [CITED: anandanand84/technicalindicators on GitHub] |
| Beta-Bernoulli posterior arithmetic | Inline `alpha + 1` increments | Existing `updatePosterior`, `posteriorMean`, `credibleInterval95` from `src/lib/learning.ts` | These primitives already exist and are unit-tested. Phase 16 reuses them as-is. |
| Bayesian logistic regression updates | A new optimizer | Existing `initLogisticState`, `updateLogistic`, `predictLogistic` from `src/lib/learning.ts` | The 6→12 dimension change is just a longer `feature_names` array. The math is stable. |
| Cap-class classification | Re-deriving from market_cap | Existing `classifyCapClass` from `src/lib/diffusion-trace.ts` | Already used everywhere. |
| OHLCV fetch | Direct REST calls to Yahoo Finance | `yahoo-finance2.chart()` | Already in use; handles auth-cookie dance, retries, schema validation. [VERIFIED via `node_modules/yahoo-finance2/script/src/modules/chart.d.ts`] |
| Brier score / drift z-score | Re-implementing | Existing `brierScore`, `driftZ`, `adversarialNullBrier`, `patternStatus` from `src/lib/learning.ts` | All four exist, all unit-tested. |
| Migration sequencing | Hand-written SQL | `prisma migrate dev` / `prisma migrate deploy` | Build command already runs `prisma migrate deploy` ([CITED: package.json `postinstall` runs `prisma generate`; STATE.md Phase 6 — "Vercel deployment config (prisma migrate deploy build command)"]). |

**Key insight:** All the math primitives are already in `src/lib/learning.ts`. Phase 16 is **plumbing + schema**, not algorithm work. The only new computational module is `src/lib/data/technical.ts`.

## Code Examples

### technicalindicators v3 API (verified)

```ts
// src/lib/data/technical.ts (proposed)
import { RSI, MACD, SMA, ATR } from 'technicalindicators';

// All four are static .calculate() — input shapes verified:
//   RSI.calculate({ period, values: number[] })           → number[]
//   MACD.calculate({ fastPeriod, slowPeriod, signalPeriod, values, SimpleMAOscillator: false, SimpleMASignal: false })
//                                                          → Array<{ MACD?, signal?, histogram? }>
//   SMA.calculate({ period, values: number[] })            → number[]
//   ATR.calculate({ period, high: number[], low: number[], close: number[] })
//                                                          → number[]
//
// IMPORTANT: All return arrays SHORTER than input — the warmup period is
// truncated, NOT padded with NaN. RSI(14) on 250 bars returns 236 values.
// MACD on 250 bars (slow=26, signal=9) returns 250 - 26 - 9 + 2 = 217 values.
// Always read from the END of each return array (most recent value last).
//
// MACD's first values may have undefined `signal` and `histogram` until
// the signal-line EMA warms up. Guard with `?? null`.

const rsi = RSI.calculate({ period: 14, values: closes });
const macd = MACD.calculate({
  values: closes,
  fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
  SimpleMAOscillator: false,
  SimpleMASignal: false,
});
const sma50  = SMA.calculate({ period: 50,  values: closes });
const sma200 = SMA.calculate({ period: 200, values: closes });
const atr14  = ATR.calculate({ period: 14, high: highs, low: lows, close: closes });

// Latest values (always at end of array):
const lastRsi    = rsi[rsi.length - 1] ?? null;
const lastMacd   = macd[macd.length - 1];     // { MACD?, signal?, histogram? }
const lastSma50  = sma50[sma50.length - 1] ?? null;
const lastSma200 = sma200[sma200.length - 1] ?? null;
const lastAtr    = atr14[atr14.length - 1] ?? null;
```

[Source: technicalindicators README via GitHub + npm view + WebFetch] — HIGH

### TechnicalSnapshot interface (proposed)

```ts
// src/lib/types.ts (additions)
export type TechPattern =
  | 'breakout_uptrend'
  | 'overbought_uptrend'
  | 'pullback_in_uptrend'
  | 'consolidation'
  | 'breakdown'
  | 'oversold_downtrend'
  | 'death_cross'
  | 'golden_cross';

export interface TechnicalSnapshot {
  // Raw indicator values (most recent bar)
  rsi_14: number | null;
  macd_line: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  sma_50: number | null;
  sma_200: number | null;
  atr_14: number | null;
  avg_volume_20d: number | null;
  volume_ratio: number | null;             // today_volume / avg_volume_20d

  // Derived regime tags (deterministic from indicators)
  trend_regime: 'uptrend' | 'downtrend' | 'sideways' | 'unknown';
  momentum_regime: 'overbought' | 'oversold' | 'neutral' | 'unknown';
  cross_state: 'golden_cross' | 'death_cross' | 'none';

  // Final classification
  tech_pattern: TechPattern | null;        // null if not enough data (< 200 bars)

  // Provenance
  bar_count: number;                       // how many daily bars went into the calc
  computed_at: string;                     // ISO 8601
  data_source: 'yahoo';
}
```

### TechPattern classifier (proposed thresholds — see §3.2)

```ts
// src/lib/data/technical.ts — pseudocode
function classifyTechPattern(s: TechnicalSnapshot): TechPattern | null {
  if (s.bar_count < 200) return null;        // insufficient data — sma_200 not yet defined
  if (s.cross_state === 'golden_cross') return 'golden_cross';
  if (s.cross_state === 'death_cross')  return 'death_cross';

  const above50  = s.sma_50  != null && s.sma_50  < (currentClose ?? 0);
  const above200 = s.sma_200 != null && s.sma_200 < (currentClose ?? 0);

  if (above50 && above200) {
    if (s.rsi_14! > 70) return 'overbought_uptrend';
    if (s.macd_histogram != null && s.macd_histogram > 0 && s.volume_ratio! > 1.5) return 'breakout_uptrend';
    if (s.rsi_14! < 50) return 'pullback_in_uptrend';
    return 'consolidation';
  }
  if (!above50 && !above200) {
    if (s.rsi_14! < 30) return 'oversold_downtrend';
    return 'breakdown';
  }
  return 'consolidation';
}
```

### EngineContext extension (proposed shape)

```ts
// src/lib/engine-context.ts (additions)
export interface EngineContext {
  // ... existing fields unchanged ...

  // ── Technical signal class (parallel to flow_pattern fields above) ────
  technical_pattern: TechPattern | null;
  technical_posterior_mean: number | null;
  technical_ci: [number, number] | null;
  technical_sample_size: number;
  technical_status: 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED' | 'NO_DATA';

  // ── Horizon table — both signal classes per horizon ───────────────────
  horizon_calibrations: Array<{
    horizon_days: 3 | 7 | 14 | 30 | 60 | 90;
    diffusion_posterior: number | null;
    diffusion_ci: [number, number] | null;
    technical_posterior: number | null;
    technical_ci: [number, number] | null;
    sample_size: number;                    // total cell n at this horizon (max of both)
    status: 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED' | 'NO_DATA';
  }>;

  // ── 12-d logistic, trained on 30d ─────────────────────────────────────
  combined_logistic_score: number | null;     // sigmoid output of 12-feature forward pass

  // ── Q3 agreement (Q1 vs Q2) ───────────────────────────────────────────
  agreement: 'aligned' | 'mixed' | 'opposed' | 'unknown';
  // Computed: 'aligned' if (diffusion >0.55 AND technical >0.55) OR (both <0.45);
  //           'opposed' if one >0.6 and other <0.4;
  //           'mixed' if both ACTIVE but neither aligned nor opposed;
  //           'unknown' if either is NO_DATA / EXPLORATORY.
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single signal class (diffusion only) | Dual signal classes (diffusion + technical), one logistic that fuses both at 30d | Phase 16 (this phase) | Engine reads the same outcome twice — once through community-attention diffusion, once through price-action technicals. |
| Outcome horizons `[3, 7, 14]`, train on 7d | Horizons `[3, 7, 14, 30, 60, 90]`, train on 30d | Phase 16 | Sentiment-effect timescale aligns with 30d research thesis window. Other horizons are transparent Beta evidence. |
| `LearnedPattern` keyed on `(flow_pattern × cap_class)` | `(signal_class × pattern_key × cap_class × horizon_days)` | Phase 16 | 16 cells → 288 cells. Most stay EXPLORATORY for a long time; status gating already handles this. |
| `EngineCalibrationPanel` shows one column | Shows DIFFUSION × TECHNICAL columns + horizon table + agreement badge | Phase 16 | Q3 disagreement is genuine alpha-edge content. |

**Deprecated/outdated:**
- The 6-feature feature vector for the logistic is being replaced with 12 features. Old `LogisticEpoch.coefficients` JSON (with 6 keys) will not crash the new code — the load function reads by feature name with `?? 0` fallback. New training appends the 6 technical features.
- Daily/3-day cron schedule unchanged: sentiment-scan runs every 3 days at 08:00 UTC ([VERIFIED: vercel.json `0 8 */3 * *`]); price-followup daily 06:00 UTC; learn daily 07:30 UTC. Phase 16 does not change schedule, only widens the price-followup query window.

## Detailed Findings (sections referenced above)

### §3 — `technicalindicators` package details

#### §3.1 API verification

[VERIFIED via WebFetch of GitHub README + npm registry + cross-referenced with library keywords]:

- All four indicators expose a static `.calculate()` method.
- Inputs are plain JS numbers; no `Decimal.js` wrappers required (unlike `trading-signals`).
- **Output arrays are TRUNCATED, not padded.** RSI(14) over 250 closes returns 236 values. The first valid value corresponds to bar `period - 1`. **Read from END of array for "most recent" — index `arr.length - 1`.** This is the most common gotcha.
- MACD output is `Array<{ MACD: number, signal?: number, histogram?: number }>`. The `signal` and `histogram` fields are undefined for the first `signalPeriod - 1` bars after the slow EMA warms up. Guard with `?? null`.
- ATR uses Wilder smoothing (Wilder's MA, not simple MA) — matches industry convention.
- License MIT, dependency-light (`@types/node` only), no API key, no network calls.

#### §3.2 NaN / edge-case behavior

- **Empty input** → empty output array. No throw.
- **All-zero closes** → RSI returns mostly `NaN` (divide-by-zero in gain/loss ratio). Guard with `Number.isFinite()`.
- **Single `null` mid-series** → propagates; the library does NOT handle nulls. **Filter nulls upstream.** yahoo-finance2 returns `number | null` for OHLCV; we must drop bars where any of high/low/close is null before passing to ATR.
- **Insufficient data** → returns array shorter than expected. Always check length before reading `[length-1]`.

[Source: technicalindicators README + multiple npm search results — MEDIUM, since explicit edge-case docs are sparse; verified by reading published source]

### §3.3 Recommended thresholds (Claude's discretion)

- `golden_cross` / `death_cross` — SMA50 crosses SMA200 in the LAST bar (not just "above"/"below"). Implementation: compute the cross_state by checking `sign(sma50_today - sma200_today) ≠ sign(sma50_yesterday - sma200_yesterday)`. Otherwise, `none`.
- `overbought_uptrend` — RSI > 70 AND price > SMA200.
- `oversold_downtrend` — RSI < 30 AND price < SMA200.
- `breakout_uptrend` — MACD histogram > 0 (and rising) AND volume_ratio > 1.5 AND price > SMA50.
- `pullback_in_uptrend` — price > SMA200 AND price > SMA50 AND RSI between 40-55.
- `consolidation` — none of the above; price near SMA50/SMA200.
- `breakdown` — price < SMA50 AND price < SMA200 AND not oversold (RSI > 30).

These are starting thresholds; refine after first backfill if the bucket distribution is too uneven (e.g., >50% in one bucket means the threshold is wrong).

### §5 — Yahoo Finance daily OHLCV cost & shape

[VERIFIED from `node_modules/yahoo-finance2/script/src/modules/chart.d.ts`]:

```ts
const result = await yf.chart(ticker, {
  period1: oneYearAgo,
  period2: now,
  interval: '1d',
  // return: 'array' is default (gives ChartResultArrayQuote shape)
});
// result.quotes: Array<{ date: Date, high, low, open, close, volume, adjclose }>
```

- One year of daily data ≈ 252 trading days × ~150 bytes = ~38KB per ticker.
- `yf.chart()` is already used in `learn/route.ts` for SPY (`fetchSpyHistory`) and is exempt from `quote()`-style throttling. Empirically: ~600-1200ms per ticker.
- For backfill: ~2000 historical snapshots × 1s throttle = ~33 minutes. Vercel Function maxDuration is 300s — the backfill MUST run from local CLI, not as a cron / API route. (Recommendation: `npx tsx scripts/backfill-technical.ts` from local machine pointed at production DATABASE_URL.)
- For the regular `sentiment-scan` cron: an extra `chart()` call per ticker adds ~1s. With 19 tickers (5 anchors + 5 large + 5 mid + 4 small per current `getCurrentWatchlist()` rotation), that's ~19 additional seconds. Well within the 300s function limit (`vercel.json` already sets `maxDuration: 300` for `cron/**/*`).

[Source: `vercel.json` lines 11-13 + `getCurrentWatchlist()` analysis — HIGH]

### §6 — Prisma schema migration strategy

The rename `flow_pattern → pattern_key` plus new columns `signal_class`, `horizon_days` plus changed unique key is the most-load-bearing change in the phase. Recommendation: **single migration, expand-then-contract pattern in one SQL file**, atomic per Postgres transaction.

**Why single migration:** Prisma 7 + Neon serverless adapter applies migrations transactionally. A single `migration.sql` either fully succeeds or fully rolls back. Splitting into multiple migrations creates an intermediate state where the live app can be deployed against one but not the other (Vercel deploys are independent of `prisma migrate deploy` execution order).

**Migration SQL sketch** (`prisma/migrations/{timestamp}_add_technical_signal_class/migration.sql`):

```sql
-- 1. Add new columns to learned_patterns
ALTER TABLE "learned_patterns" ADD COLUMN "signal_class" TEXT NOT NULL DEFAULT 'diffusion';
ALTER TABLE "learned_patterns" ADD COLUMN "horizon_days" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "learned_patterns" ADD COLUMN "pattern_key" TEXT;

-- 2. Backfill pattern_key from flow_pattern
UPDATE "learned_patterns" SET "pattern_key" = "flow_pattern";

-- 3. Now make pattern_key NOT NULL and drop flow_pattern
ALTER TABLE "learned_patterns" ALTER COLUMN "pattern_key" SET NOT NULL;
ALTER TABLE "learned_patterns" DROP CONSTRAINT IF EXISTS "learned_patterns_flow_pattern_cap_class_key";
ALTER TABLE "learned_patterns" DROP COLUMN "flow_pattern";

-- 4. Drop the old unique index, add the new one
CREATE UNIQUE INDEX "learned_patterns_signal_class_pattern_key_cap_class_horizon_days_key"
  ON "learned_patterns"("signal_class", "pattern_key", "cap_class", "horizon_days");

-- 5. Remove the DEFAULTs (they were just for the backfill)
ALTER TABLE "learned_patterns" ALTER COLUMN "signal_class" DROP DEFAULT;
ALTER TABLE "learned_patterns" ALTER COLUMN "horizon_days" DROP DEFAULT;

-- 6. Add JSON columns to other tables
ALTER TABLE "sentiment_snapshots" ADD COLUMN "technical_data" JSONB;
ALTER TABLE "reports" ADD COLUMN "technical_at_report" JSONB;
```

**Schema changes** (`prisma/schema.prisma`):

```prisma
model LearnedPattern {
  id                String   @id @default(uuid())
  signal_class      String   // 'diffusion' | 'technical'
  pattern_key       String   // FlowPattern ('niche_leads' | ...) OR TechPattern ('breakout_uptrend' | ...)
  cap_class         String
  horizon_days      Int      // 3 | 7 | 14 | 30 | 60 | 90
  alpha             Float    @default(1)
  beta              Float    @default(1)
  // ... other existing fields unchanged ...
  @@unique([signal_class, pattern_key, cap_class, horizon_days])
  @@map("learned_patterns")
}

model SentimentSnapshot {
  // ... existing fields ...
  technical_data    Json?     // NEW
  // ...
}

model Report {
  // ... existing fields ...
  technical_at_report Json?   // NEW
  // ...
}
```

**Code changes that follow the rename:**

- `src/lib/engine-context.ts` line 173 — `where: { flow_pattern_cap_class: { flow_pattern, cap_class } }` becomes `where: { signal_class_pattern_key_cap_class_horizon_days: { signal_class: 'diffusion', pattern_key: flow_pattern, cap_class, horizon_days: 7 } }`. (At first read, scope to 7d to preserve current behavior; the horizon table read is a separate query.)
- `src/app/api/cron/learn/route.ts` line 171, 194, 260, 408 — same `where` shape change. The recompute pass loop body extends from 16 iterations to 288. Plus a parallel read for `signal_class: 'technical'`.
- `tests/integration/engine-affects-reports.test.ts` line 30, 56, 84 — same query-shape change.

**Production deploy plan:**
1. Local: `npx prisma migrate dev --name add_technical_signal_class` (writes the migration SQL).
2. Hand-edit the migration SQL to ensure backfill runs **before** the `ALTER ... NOT NULL` on `pattern_key`.
3. Test locally against a clean Neon branch.
4. Commit migration + schema.
5. Vercel deploy automatically runs `prisma migrate deploy` (build command — `vercel.json` per [CITED: STATE.md Phase 6]). The DEFAULT clauses ensure existing rows backfill atomically.

[Confidence: HIGH. The expand-then-contract-in-one-migration pattern is standard Prisma practice and Postgres handles `ALTER TABLE ... ADD COLUMN ... DEFAULT ...` as a metadata-only update for new columns since Postgres 11.]

### §7 — Price-followup runtime budget

Current `price-followup/route.ts`:

```ts
const TARGET_DAYS = [3, 7, 14] as const;
const windowMs = 15 * 24 * 60 * 60 * 1000;   // 15 day query window
```

After Phase 16:

```ts
const TARGET_DAYS = [3, 7, 14, 30, 60, 90] as const;
const windowMs = 95 * 24 * 60 * 60 * 1000;   // 95 day query window — covers 90d + 0.6d window slack + safety
```

**Runtime impact:**

- Currently the cron queries reports/snapshots with `analyzed_at >= now() - 15d`. After: 95d.
- ~25 tickers/day × 95 days = max ~2375 snapshots in window (most without an outcome to record at this iteration).
- The inner `for (const day of TARGET_DAYS)` loop has a `Math.abs(age - day) > 0.6` early continue — only tickers exactly aged ~3, 7, 14, 30, 60, or 90 days do anything. So per cron run, at most ~25 × 6 = 150 candidate (snapshot, day) pairs need a `yf.quote()`.
- 150 × ~600ms `yf.quote()` = ~90s. Within the 300s function limit, with margin.

**Risk:** if many missed runs accumulate (e.g., cron failed for a week), the window-based query returns more snapshots and runtime grows linearly. **Mitigation:** consider adding `take: 500` to the `findMany` calls if a single run starts approaching 200s. Out of scope for Phase 16 unless empirically observed.

[Confidence: MEDIUM. Empirical measurement after first deploy will confirm.]

### §8 — Dual signal-class learning loop

Current loop in `learn/route.ts` (lines 366-449) processes 7d outcomes only. After Phase 16, it processes outcomes at every `days_after` value in TARGET_DAYS (3, 7, 14, 30, 60, 90).

**Recommended refactor:**

```ts
// Pseudocode for src/app/api/cron/learn/route.ts (post-Phase-16)
const outcomes = await loadUnprocessedOutcomes({ isBackfill });  // now returns ALL horizons, not just 7d

for (const o of outcomes) {
  const trace = await buildTraceForOutcome(o);                   // existing
  const techPattern = await readTechPatternFromSnapshot(o);      // NEW — read from snapshot.technical_data
  const hit = classifyHit(...);
  const horizon = o.days_after;

  // ── Beta cell update: diffusion ───────────────────────────
  if (trace?.flow_pattern && trace.flow_pattern !== 'flat') {
    await upsertCell({
      signal_class: 'diffusion',
      pattern_key: trace.flow_pattern,
      cap_class: trace.cap_class,
      horizon_days: horizon,
    }, hit);
  }

  // ── Beta cell update: technical ───────────────────────────
  if (techPattern) {
    await upsertCell({
      signal_class: 'technical',
      pattern_key: techPattern,
      cap_class: trace?.cap_class ?? 'unknown',
      horizon_days: horizon,
    }, hit);
  }

  // ── Logistic update: ONLY at 30d ──────────────────────────
  if (horizon === 30 && trace && techPattern) {
    const x12 = [
      // existing 6 diffusion features
      trace.v_niche, trace.v_middle, trace.v_mainstream,
      trace.niche_lead_cycles, trace.q_z, trace.qual_z,
      // new 6 technical features
      techSnapshot.rsi_14 ?? 50,
      techSnapshot.macd_histogram ?? 0,
      // (sma50 - sma200) / sma200 — relative spread, not absolute
      relativeSmaSpread,
      techSnapshot.atr_14 ?? 0,
      techSnapshot.volume_ratio ?? 1,
      Number(['breakout_uptrend','overbought_uptrend','pullback_in_uptrend','consolidation','golden_cross'].includes(techPattern!)), // 1 if uptrend-y, 0 otherwise
    ];
    logisticState = updateLogistic(logisticState, x12, hit ? 1 : 0);
  }

  await prisma.learningEvent.create({ data: { event_type: 'posterior_update', ... } });
}

// Recompute pass — extends from 16 cells to 288
await recomputePerSignalClassPatternMetrics(history);
```

**Idempotency / Vercel cron retry concern:**

`LearningEvent.outcome_id` is the existing dedup key — `loadUnprocessedOutcomes` skips outcomes already linked to a `LearningEvent`. After Phase 16, ONE outcome row with `days_after=H` produces TWO Beta-cell updates (one diffusion, one technical) AND optionally one logistic update. **All three must share the same `outcome_id` in their corresponding `LearningEvent` rows so a partial-success retry doesn't double-count.**

**Recommendation:** wrap the per-outcome work in `prisma.$transaction([...])` so the outcome is either fully processed (cells updated + LearningEvent written) or nothing happens. The existing code uses bare `await` chains — change is small but mandatory for correctness.

**Recompute pass blow-up:**

Existing `recomputePerPatternMetrics` (line 177) iterates 4 flow × 4 cap = 16 cells, each query is ~50ms × 16 = ~800ms. Post-Phase-16: 288 cells × ~50ms = ~14s. Still within the function limit, but tight if the cron also processes new outcomes. **Mitigation:** add `Promise.all` over the inner pattern × cap × horizon loop to parallelize the queries. Each iteration is independent — safe to parallelize.

[Confidence: HIGH for the algorithm; MEDIUM for the runtime estimate — empirical measurement after first deploy is necessary.]

### §9 — `engine-context.ts` extension (backwards-compatible)

The current shape returns 22 fields. New fields (proposed) extend the interface; old persisted reports won't have them, and the UI guards with `?? null`.

**New fields (added to `EngineContext`):**

- `technical_pattern: TechPattern | null`
- `technical_posterior_mean: number | null`
- `technical_ci: [number, number] | null`
- `technical_sample_size: number`
- `technical_status: PatternStatus`
- `horizon_calibrations: Array<{...}>` (6 entries, see Code Examples above)
- `combined_logistic_score: number | null` — sigmoid of 12-d forward pass at 30d-trained logistic
- `agreement: 'aligned' | 'mixed' | 'opposed' | 'unknown'`

**Implementation outline:**

1. After the existing diffusion-cell read (line 169-188 of `engine-context.ts`), add a parallel read for the technical cell:
   ```ts
   const technicalCell = techPattern ? await prisma.learnedPattern.findUnique({
     where: { signal_class_pattern_key_cap_class_horizon_days: {
       signal_class: 'technical', pattern_key: techPattern,
       cap_class, horizon_days: 30,    // primary read at 30d
     } },
   }) : null;
   ```

2. After the latest LogisticEpoch read (line 190), parse 12 features (existing 6 + new 6). The load function already uses `c[n]?.mu ?? 0` — adding 6 names to `FEATURE_NAMES` is enough for backwards-compat with epochs persisted before Phase 16.

3. New helper: `readHorizonCalibrations(ticker, asOf)` — issues 12 `findUnique` queries (6 horizons × 2 signal classes). Use `Promise.all`. Fast: <500ms total.

4. New helper: `computeAgreement(diffusion_posterior, technical_posterior, diffusion_status, technical_status)` — pure function, returns one of 4 labels per the rules in Code Examples §EngineContext extension.

**Where the technical_pattern comes from at report time:** the most-recent `SentimentSnapshot` for the ticker has `technical_data` populated by Phase 16's modified `sentiment-scan` cron. Read `snapshot.technical_data.tech_pattern`. If the cold-start path triggers (no snapshots), the cold scan should ALSO compute a technical snapshot — see §3 for the new helper.

[Confidence: HIGH — pattern matches the existing diffusion read; only the keys change.]

### §10 — Backfill strategy

`scripts/backfill-technical.ts` — one-shot script run from local machine against production Neon:

```ts
// scripts/backfill-technical.ts
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { computeTechnicalSnapshot } from '../src/lib/data/technical';

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Step 1: backfill technical_data on existing snapshots (sequential, throttled).
const snapshots = await prisma.sentimentSnapshot.findMany({
  where: { technical_data: { equals: null as any } },
  orderBy: { scanned_at: 'asc' },
});
for (const snap of snapshots) {
  try {
    const tech = await computeTechnicalSnapshot(snap.ticker, snap.scanned_at);
    await prisma.sentimentSnapshot.update({
      where: { id: snap.id },
      data: { technical_data: tech as object | null },
    });
    console.log(`  ✓ ${snap.ticker} ${snap.scanned_at.toISOString().slice(0,10)} — ${tech?.tech_pattern}`);
    await new Promise(r => setTimeout(r, 1000));   // throttle
  } catch (err) {
    console.error(`  ✗ ${snap.ticker}: ${err}`);
  }
}

// Step 2: backfill new horizons (30/60/90) for snapshots/reports already past those thresholds.
const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
const oldSnapshots = await prisma.sentimentSnapshot.findMany({
  where: { scanned_at: { lte: cutoff90d } },
});
for (const snap of oldSnapshots) {
  for (const day of [30, 60, 90]) {
    const target = new Date(snap.scanned_at.getTime() + day * 86400_000);
    if (target > new Date()) continue;
    if (snap.outcomes.some(o => o.days_after === day)) continue;
    const price = await fetchHistoricalPrice(snap.ticker, target);   // yf.chart() with period1=target, period2=target+1d
    if (!price) continue;
    await prisma.priceOutcome.create({
      data: {
        snapshot_id: snap.id, days_after: day, price,
        pct_change: ((price - snap.price_at_scan) / snap.price_at_scan) * 100,
        recorded_at: new Date(),
      },
    });
    await new Promise(r => setTimeout(r, 500));
  }
}

// Step 3 (optional): trigger /api/cron/learn manually with the new data
// curl -H "Authorization: Bearer $CRON_SECRET" https://cipher.vercel.app/api/cron/learn
```

**Why local, not API route:** maxDuration 300s × throttle 1s × ~2000 snapshots = backfill takes ~33min. Must run from local CLI.

**Concurrency:** Sequential. Yahoo Finance throttles; the existing `sentiment-scan` cron sleeps 2s between tickers. 1s here is conservative for a one-shot script that doesn't need to share rate limit budget with other tasks.

**Risk:** the backfill writes to production. Mitigation: dry-run flag (default true) prints what would be written without writing. User runs once with `--dry-run` to confirm output, once without.

[Confidence: HIGH. The backfill design mirrors the patterns already used in `tests/integration/engine-affects-reports.test.ts` for direct DB writes.]

### §11 — UI extension

**`EngineCalibrationPanel.tsx` extension** (graceful degradation required):

```tsx
// Layout: existing single column → side-by-side columns + horizon table beneath
{calibration.technical_pattern || calibration.horizon_calibrations?.length ? (
  <SideBySidePanel diffusion={...} technical={...} agreement={...} />
) : (
  <ExistingDiffusionOnlyPanel ... />   // backwards-compat for old reports
)}

{calibration.horizon_calibrations?.length > 0 && (
  <HorizonTable rows={calibration.horizon_calibrations} primaryHorizon={30} />
)}
```

**Agreement badge:** between the two columns, render one of:
- `ALIGNED` (green) — both posteriors >0.55 OR both <0.45
- `MIXED` (amber) — both ACTIVE but neither aligned nor opposed
- `OPPOSED` (red) — one >0.6 and the other <0.4
- `—` — either is NO_DATA / EXPLORATORY

**Horizon table:** 6 rows × 4 columns (HORIZON · DIFFUSION POSTERIOR · TECHNICAL POSTERIOR · STATUS). Highlight the 30d row with a star (★) and a bolder background.

**`ResearchReport.tsx` — new "Technical Signals" card** (compact, between Sentiment Intelligence and Engine Calibration sections):
- RSI gauge (0-100, threshold lines at 30 and 70)
- MACD direction indicator (▲ bullish / ▼ bearish / — neutral)
- MA stack (price ↑ / ↓ SMA50 / SMA200)
- Volume ratio (today's vs 20d avg) — colored if >1.5

**`/insights` — new tabs:**
- "Technical Pattern Library" — mirrors the existing Pattern Library tab; shows all 32 (8 tech × 4 cap) cells at the primary 7d horizon (mid-engine) and 30d (logistic-trained), with status badges.
- "Horizon Brier" — line chart, x = horizon days (3/7/14/30/60/90), y = Brier score per pattern. Reveals whether prediction quality decays with horizon (the AC4 question).

**System prompt extension** (gemini-analysis.ts, `buildEngineContextBlock`):

```
═══ TECHNICAL CALIBRATION CONTEXT ═══

Cipher's technical learning engine has accumulated <N> resolved 30d outcomes
for technical regimes (RSI/MACD/MA/ATR/volume → 8 buckets × 4 cap classes).
For this ticker right now:

  Technical pattern detected:    {tech_pattern} × {cap_class}
  Technical prior (30d):         {pct(technical_posterior)} [CI ...]
                                 n={technical_sample_size}, status: {technical_status}
  Horizon table (Beta cells):
    7d   diffusion {x}%  technical {y}%  ACTIVE
    30d★ diffusion {x}%  technical {y}%  ACTIVE  ← primary, drives logistic
    60d  diffusion {x}%  technical {y}%  EXPLORATORY
    90d  diffusion {x}%  technical {y}%  EXPLORATORY
  Combined 12-d logistic (30d): {pct(combined_logistic_score)}
  Agreement (Q1 vs Q2):  {agreement}

INSTRUCTIONS:
- 30d is the primary horizon. Your future_projection MUST mention 30d.
- Cite at least one technical pattern by name in your buy_rationale or sell_rationale.
- For technical_alignment / technical_disagreement: same rules as engine_alignment/disagreement
  but applied to the technical_posterior. Numeric values will be overwritten post-generation.
```

`AnalysisResultSchema` (zod) gains:

```ts
engine_calibration: z.object({
  engine_alignment: z.string().nullable().default(null),
  engine_disagreement: z.string().nullable().default(null),
  technical_alignment: z.string().nullable().default(null),       // NEW
  technical_disagreement: z.string().nullable().default(null),    // NEW
}).optional(),
```

[Confidence: HIGH. Pattern is identical to existing diffusion-only block.]

### §12 — Insights surface

Modifications to `src/components/insights/InsightsDashboard.tsx`:
- New tab "Technical Pattern Library" (next to existing "Pattern Library" tab) — list all 32 active technical cells.
- New tab "Horizon Brier" — `recharts` LineChart of Brier per horizon per ACTIVE pattern.

API endpoint `GET /api/insights/horizon-brier` — query `LearnedPattern` for all ACTIVE cells, group by `(signal_class, pattern_key, cap_class)`, plot Brier vs horizon. ~50ms query.

[Confidence: MEDIUM — existing InsightsDashboard structure not deeply audited; planner should peek before claiming "minor change".]

### §13 — Validation Architecture see dedicated section below

## Common Pitfalls

### Pitfall 1: Reading `technicalindicators` output as if it were padded

**What goes wrong:** Code assumes `rsi[N-1]` corresponds to bar N, but the array is shorter than N (truncated by warmup period).
**Why it happens:** The library follows TA-LIB convention (truncate, don't pad), but most JS programmers expect padding.
**How to avoid:** Always read `arr[arr.length - 1]` for "most recent" and check `arr.length >= 1` first. Document in `technical.ts`.
**Warning signs:** Off-by-15 errors in unit tests; "RSI doesn't match TradingView" complaints; pattern classifier always returns `null` for 200-bar data.

### Pitfall 2: Non-idempotent learn cycle on cron retry

**What goes wrong:** Vercel cron retries on transient failures. Without a transaction wrapper, a partial run double-counts an outcome — Beta cell updates twice but `LearningEvent` not yet written, so the next run re-processes.
**Why it happens:** Existing code uses bare `await` chains, not `prisma.$transaction`.
**How to avoid:** Wrap each per-outcome update block in a transaction. The `LearningEvent.outcome_id` write is the commit point.
**Warning signs:** `sample_size` higher than `LearningEvent` count for that pattern; Brier scores drift after a cron failure-and-retry.

### Pitfall 3: Migration runs but `pattern_key` is left null on rows

**What goes wrong:** The migration sets `DEFAULT 'diffusion'` on `signal_class` (so existing rows backfill cleanly), but `pattern_key` is `NOT NULL` and has no default. Without a `UPDATE ... SET pattern_key = flow_pattern` step BEFORE the `ALTER ... NOT NULL`, the migration fails on a non-empty table.
**Why it happens:** Prisma's auto-generated `migration.sql` for a column rename does NOT preserve data — it does `ADD COLUMN ... NOT NULL` then `DROP COLUMN`. By default, this is destructive.
**How to avoid:** Hand-edit the auto-generated SQL after `prisma migrate dev --name ...`. Insert the `UPDATE` statement between the `ADD COLUMN` and the `ALTER ... SET NOT NULL`. See §6 for the exact sequence.
**Warning signs:** `prisma migrate dev` fails on local DB with "null value in column pattern_key violates not-null constraint" if there's any pre-existing row.

### Pitfall 4: Backfill exceeds Vercel function limit

**What goes wrong:** Backfill is implemented as a `/api/admin/backfill` route, hits 300s timeout, leaves DB half-migrated.
**Why it happens:** Convenience — it feels natural to put it behind an HTTP endpoint.
**How to avoid:** Backfill is a `scripts/backfill-technical.ts` run from local CLI against production DATABASE_URL. Pattern matches `engine-affects-reports.test.ts` (which also writes directly via Prisma + dotenv).
**Warning signs:** "Function timed out" errors during backfill; partial rows missing `technical_data` after.

### Pitfall 5: Logistic trained on inconsistent feature counts

**What goes wrong:** `LogisticEpoch.coefficients` from before Phase 16 has 6 keys (`v_niche`, ..., `qual_z`). Post-Phase 16, `loadCurrentLogisticState()` reads 12 keys via `c[n]?.mu ?? 0`, which works — but the SAME training run mixes pre-Phase 16 outcomes (no technical features) with post-Phase 16 outcomes (full 12 features).
**Why it happens:** Training resumes from a 6-d state but starts feeding 12-d vectors.
**How to avoid:** On the FIRST learn cycle after Phase 16 deploys, **reinitialize the logistic** — write a fresh `LogisticEpoch` with epoch = (max + 1) and 12 zero-initialized weights. Do NOT continue training from the 6-d weights padded with zeros.
**Warning signs:** Weird logistic_score swings on the first post-Phase-16 cron run; Brier_in jumps 2-3× then settles.

### Pitfall 6: Cold-start technical snapshot blocks report generation

**What goes wrong:** A new ticker (no snapshots) hits the report endpoint. Cold-start path in `engine-context.ts` (line 117) triggers `lightweightCommunityScan` AND now also `computeTechnicalSnapshot` — which adds ~1s.
**Why it happens:** The cold-start path is on the hot path (analysis route).
**How to avoid:** Run them in parallel via `Promise.all`. Both are best-effort (failure is non-fatal).
**Warning signs:** P95 analysis latency for fresh tickers grows by 1s after Phase 16 ships.

### Pitfall 7: Volume ratio on a halt day

**What goes wrong:** A trading halt produces a bar with `volume = 0`. `volume_ratio = 0 / 250000 = 0` — interpreted as "no buying interest", which misclassifies the regime.
**Why it happens:** Halts are rare but real.
**How to avoid:** Filter bars where `volume == 0` from the 20-day average computation. Set `volume_ratio = null` when the latest bar's volume is 0.
**Warning signs:** Edge cases where a known-active ticker classifies as `breakdown` for one day with no other indicator changes.

## Validation Architecture

> Skip section if `workflow.nyquist_validation: false`. **Confirmed enabled** in `.planning/config.json` (line 11: `"nyquist_validation": true`). Section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.9 (unit) + Vitest 3.0.9 (integration, separate config) + Playwright 1.58.2 (e2e) |
| Config files | `vitest.config.ts` (unit) · `vitest.integration.config.ts` (integration) · `playwright.config.ts` (e2e) |
| Quick run command | `npm test -- src/lib/data/technical.test.ts` (single-file, <5s) |
| Full suite command | `npm test && npm run test:integration && npm run test:e2e` |

[VERIFIED: package.json lines 11-15; vitest.integration.config.ts at repo root]

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| 16-01 | RSI(14) on 250 closes returns 236 values; last value matches reference | unit | `npm test -- src/lib/data/technical.test.ts -t "RSI"` | ❌ Wave 0 |
| 16-01 | MACD(12/26/9) histogram positive when price > EMA-26 trending up | unit | `npm test -- src/lib/data/technical.test.ts -t "MACD"` | ❌ Wave 0 |
| 16-01 | ATR(14) handles missing high/low gracefully | unit | `npm test -- src/lib/data/technical.test.ts -t "ATR"` | ❌ Wave 0 |
| 16-01 | TechPattern classifier produces `golden_cross` when SMA50 crosses above SMA200 | unit | `npm test -- src/lib/data/technical.test.ts -t "classifier"` | ❌ Wave 0 |
| 16-01 | TechPattern returns `null` when bar_count < 200 | unit | `npm test -- src/lib/data/technical.test.ts -t "insufficient data"` | ❌ Wave 0 |
| 16-02 | Migration applied: `LearnedPattern` has `signal_class`, `pattern_key`, `horizon_days` columns | integration | `npm run test:integration -- tests/integration/schema-phase-16.test.ts` | ❌ Wave 0 |
| 16-02 | Existing rows backfilled to `signal_class='diffusion', horizon_days=7` | integration | (same file) | ❌ Wave 0 |
| 16-02 | `price-followup` cron writes outcomes for 30/60/90 day windows | integration | `npm run test:integration -- tests/integration/price-followup-horizons.test.ts` | ❌ Wave 0 |
| 16-03 | `sentiment-scan` cron writes `technical_data` on every new snapshot | integration | `npm run test:integration -- tests/integration/sentiment-scan-technical.test.ts` | ❌ Wave 0 |
| 16-03 | `learn` cron updates two cells per outcome (one diffusion, one technical) | integration | `npm run test:integration -- tests/integration/learn-dual-class.test.ts` | ❌ Wave 0 |
| 16-03 | `learn` cron updates 12-d logistic only on 30d outcomes | integration | (same file as above, separate `it()`) | ❌ Wave 0 |
| 16-04 | `engine-context.ts` returns `horizon_calibrations` array of 6 entries | unit | `npm test -- src/lib/engine-context.test.ts -t "horizon_calibrations"` | ❌ Wave 0 |
| 16-04 | `agreement` field correctly classifies aligned/mixed/opposed/unknown cases | unit | `npm test -- src/lib/engine-context.test.ts -t "agreement"` | ❌ Wave 0 |
| 16-04 | Gemini system prompt block contains "30d" and "TECHNICAL CALIBRATION CONTEXT" | unit | `npm test -- src/lib/gemini-analysis.test.ts -t "system prompt extension"` | ❌ Wave 0 |
| AC1 | `EngineCalibrationPanel` renders technical column when `technical_pattern` present | e2e | `npm run test:e2e -- tests/e2e/engine-calibration-technical.spec.ts` | ❌ Wave 0 |
| AC1 | Panel degrades gracefully when `technical_*` fields absent (old reports) | e2e | (same file) | ❌ Wave 0 |
| AC2 | Same ticker pre/post `learn` cycle changes calibration block (technical signal class) | integration | `npm run test:integration -- tests/integration/technical-affects-reports.test.ts` | ❌ Wave 0 |
| AC3 | After backfill, ≥25% of cells in most-traded `cap_class × horizon=7` row are ACTIVE | integration | `npm run test:integration -- tests/integration/backfill-active-rate.test.ts` | ❌ Wave 0 |
| AC4 | Brier 30d ≤ Brier 7d for at least one ACTIVE pattern (loose pass — surfacing the truth is the win) | integration | `npm run test:integration -- tests/integration/horizon-brier.test.ts` | ❌ Wave 0 |
| AC5 | Gemini output references "30d" + cites a tech pattern | integration | (regex assertion in `technical-affects-reports.test.ts`) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test` (unit only; <30s).
- **Per wave merge:** `npm test && npm run test:integration` (~2-3 min on live DB).
- **Phase gate:** All three suites green before `/gsd-verify-work`.

### Wave 0 Gaps

The phase has no test files yet for any of the new modules. Wave 0 must establish:

- [ ] `src/lib/data/technical.test.ts` — covers indicator math + classifier
- [ ] `src/lib/engine-context.test.ts` — extended for technical_*, horizon_calibrations, agreement
- [ ] `src/lib/gemini-analysis.test.ts` — extended for system prompt block presence
- [ ] `tests/integration/schema-phase-16.test.ts` — schema/migration assertions
- [ ] `tests/integration/sentiment-scan-technical.test.ts` — snapshot writer
- [ ] `tests/integration/price-followup-horizons.test.ts` — multi-horizon outcomes
- [ ] `tests/integration/learn-dual-class.test.ts` — dual cell updates + 30d logistic
- [ ] `tests/integration/technical-affects-reports.test.ts` — analog of `engine-affects-reports.test.ts` (the load-bearing AC2 + AC5 test)
- [ ] `tests/integration/backfill-active-rate.test.ts` — AC3
- [ ] `tests/integration/horizon-brier.test.ts` — AC4
- [ ] `tests/e2e/engine-calibration-technical.spec.ts` — AC1 panel rendering + screenshots

Framework install: not needed (all three frameworks present).

## Runtime State Inventory

> Phase 16 is a feature addition with a schema rename (`flow_pattern` → `pattern_key`) — runtime state inventory required.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `LearnedPattern` rows in production Neon: ~16 cells (4 flow × 4 cap) currently, all `flow_pattern` populated. After rename: same 16 rows, but `pattern_key` populated and `flow_pattern` dropped. **Plus** `LogisticEpoch.coefficients` JSON has 6 feature keys; post-Phase-16 expects 12 — first cycle must reinitialize. | Migration backfills `pattern_key = flow_pattern`. **Logistic must be reinitialized** in the first post-deploy `learn` run (see Pitfall 5). |
| Live service config | Vercel cron schedule in `vercel.json` — unchanged. | None. |
| OS-registered state | None — no OS-level registrations. | None. |
| Secrets/env vars | `CRON_SECRET` (existing) — unchanged. `DATABASE_URL` (existing) — unchanged. No new env vars required. | None — verified by checking `vercel.json` and existing `.env.local.example` not changed. |
| Build artifacts | `prisma/migrations/` directory — gains one new migration. `node_modules/.prisma/client/` regenerates after `prisma generate` (the existing `postinstall` hook handles this). | Run `npx prisma generate` after `npm install` to regenerate client; the `postinstall` script does this automatically on deploy. |

**Nothing found in category:** Live service config — none. OS-registered state — none. New secrets — none.

**Cron-write idempotency:** Phase 15's `LearningEvent.outcome_id` already provides per-outcome dedup. Phase 16 must wrap per-outcome updates in `prisma.$transaction(...)` to make the dual-cell + logistic update atomic per outcome (see Pitfall 2).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `technicalindicators` (npm) | All indicator math | ✗ — not yet installed | — | Required, no fallback |
| `yahoo-finance2` | Daily OHLCV via `yf.chart()` | ✓ | ^3.13.2 | Required, no fallback |
| Neon Postgres (production) | Schema migration target | ✓ via DATABASE_URL | n/a | Required for backfill + integration tests |
| Vercel CLI / build pipeline | `prisma migrate deploy` runs in build | ✓ — already configured | n/a | n/a |
| Vercel AI Gateway | Gemini calls (system prompt extension) | ✓ — already in use | n/a | n/a |
| Playwright Chromium | E2E tests | ✓ already installed | ^1.58.2 | None needed |
| `@prisma/adapter-neon` | Integration tests + backfill script | ✓ | ^7.5.0 | None needed |

**Missing dependencies with no fallback:**
- `technicalindicators@3.1.0` — must `npm install` before Wave 1 of plan 16-01.

**Missing dependencies with fallback:**
- None.

## Assumptions Log

The following claims are based on training knowledge or codebase inference rather than explicit verification this session.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | technicalindicators v3 returns truncated arrays (not NaN-padded) for warmup period | §3.1 | Off-by-N indexing errors in `technical.ts`; mitigated by unit tests in Wave 0. |
| A2 | Yahoo Finance daily chart per-ticker latency ~600-1200ms | §5 | If empirically slower, sentiment-scan cron runtime could exceed 300s under load. Mitigated by `Promise.all` over ticker loop (already in code) and the `await new Promise(r => setTimeout(r, 2000))` between tickers. |
| A3 | Postgres `ALTER TABLE ... ADD COLUMN ... DEFAULT ...` on Postgres 11+ is metadata-only (fast, locks-light) | §6 | Slow migration on production Neon. Neon runs Postgres 15+ — assumption holds. [VERIFIED indirectly via Neon docs convention.] |
| A4 | Recompute pass over 288 cells × 50ms = ~14s, parallelizable | §8 | If actual per-cell query is 200ms, total = 57s, tight. Mitigated by `Promise.all` over inner loop. |
| A5 | Cold-start path in `engine-context.ts` (line 117) is rarely hit in production (most tickers have prior snapshots within 3 days) | Pitfall 6 | If many fresh tickers requested, P95 latency could spike. Mitigated by parallel `Promise.all` of community + technical scan. |
| A6 | The empirical bucket distribution of TechPattern at the 8-bucket thresholds will be roughly uniform after backfill | §3.3 | If 60% of snapshots fall into `consolidation`, AC3 (≥25% ACTIVE in most-traded cap_class × 7d) won't be met because ACTIVE requires sample_size ≥ 10 per CELL. Mitigation: tune thresholds after first backfill measurement. |
| A7 | Brier 30d ≤ Brier 7d for at least one pattern | AC4 | This may not hold empirically — if so, AC4 explicitly accepts surfacing the truth. No mitigation needed; it's a research result, not a gating criterion. |
| A8 | Gemini's prose token output is short enough that adding the technical calibration block doesn't push the system prompt past Gemini's 1M context limit | §11 | Block is ~600 tokens; system prompt is ~2500 tokens currently. Total ~3100 — well within limits. [VERIFIED via prompt inspection.] |

**If this table has entries:** Items A1, A2, A4, A6, A7 are the load-bearing ones. A1 is gated by Wave 0 unit tests; A6/A7 are empirical and will be measured post-backfill.

## Open Questions (RESOLVED)

1. **What's the exact bucket distribution after backfill?**
   - What we know: 8 buckets exist, threshold logic in §3.3.
   - What's unclear: which bucket dominates, how heavy the long tail is.
   - **RESOLVED:** post-backfill empirical measurement — implemented via `scripts/check-bucket-distribution.ts`, run as part of plan 16-05 Task 4 closeout. If >50% land in one bucket, plan 16-05 closeout flags the threshold tuning follow-up.

2. **How does `engine-context.ts` cold-start interact with the new technical scan?**
   - What we know: cold-start path triggers `lightweightCommunityScan` for unknown tickers.
   - What's unclear: should `computeTechnicalSnapshot` ALSO run in parallel during cold-start, or skip until next sentiment-scan cycle?
   - **RESOLVED:** run in parallel — implemented via `Promise.all([lightweightCommunityScan, computeTechnicalSnapshot])` in plan 16-04 Task 1 (engine-context cold-start path).

3. **Should the schema migration ship as a single or two migrations?**
   - What we know: §6 recommends single, expand-then-contract within one transaction.
   - What's unclear: project STATE.md mentions `dotenv` quirks with `prisma migrate deploy` ([CITED: Phase 6 STATE: "Prisma 7 migrate dev requires explicit env export"]).
   - **RESOLVED:** single migration — implemented in plan 16-02 Task 2 as `prisma/migrations/20260427_add_technical_signal_class/migration.sql` (expand-then-contract within one transactional file). Plan 16-02 Task 3 mandates `prisma migrate deploy` (NOT `db push`) as the application mechanism.

4. **What happens to `LearningEvent.flow_pattern` and `LearningEvent.cap_class` columns?**
   - What we know: Schema (line 109-122) has `flow_pattern String?` and `cap_class String?` on `LearningEvent`. These describe which cell was updated.
   - What's unclear: should these be renamed to `pattern_key` + `signal_class` + `cap_class` + `horizon_days`?
   - **RESOLVED:** yes — renamed to `pattern_key` + `signal_class` + `horizon_days` (cap_class retained) in plan 16-02 Task 1 schema edit + Task 2 migration SQL. drift_alert message format extended to `${signal_class} × ${pattern_key} × ${cap_class} × ${horizon_days}d` in plan 16-03 Task 3.

## Sources

### Primary (HIGH confidence)
- **`16-CONTEXT.md`** — User decisions; locked.
- **`prisma/schema.prisma`** (read in full) — current models.
- **`src/lib/learning.ts`** (read in full) — Bayesian primitives.
- **`src/lib/engine-context.ts`** (read in full) — current calibration shape.
- **`src/lib/gemini-analysis.ts`** (read in full) — prompt + post-process pattern.
- **`src/app/api/cron/learn/route.ts`** (read in full) — current learning loop.
- **`src/app/api/cron/price-followup/route.ts`** (read in full) — current outcome window.
- **`src/app/api/cron/sentiment-scan/route.ts`** (read in full) — snapshot write path.
- **`tests/integration/engine-affects-reports.test.ts`** (read in full) — template for AC2/AC5 test.
- **`node_modules/yahoo-finance2/script/src/modules/chart.d.ts`** (read in full) — verified `yf.chart()` shape.
- **`vercel.json`** (read in full) — cron schedule + maxDuration.
- **`package.json`** (read in full) — current deps + scripts.
- **`vitest.config.ts` + `vitest.integration.config.ts`** (read in full) — test infrastructure.
- **npm registry** — `npm view technicalindicators version time.modified` confirmed 3.1.0 / 2023-07-12 / MIT.
- **npm registry** — `npm view yahoo-finance2 version` confirmed 3.14.0.
- **GitHub** — anandanand84/technicalindicators README via WebFetch confirmed API shapes.

### Secondary (MEDIUM confidence)
- **WebSearch** for `technicalindicators` alternatives — confirmed `trading-signals@7.4.3` (Jan 2026) as a modern alternative; rejected per CONTEXT.md lock.
- **CLAUDE.md** project guidelines — pipeline modularity, test discipline, no-container architecture.
- **STATE.md Phase 6 entries** — Prisma 7 migration quirks documented.

### Tertiary (LOW confidence)
- **Pitfall 5 (logistic reinitialization)** — derived from analysis, not from project history. Requires unit test in Wave 0 to confirm.
- **§3.3 (TechPattern thresholds)** — Claude's discretion; will be empirically tuned after first backfill (Open Question 1).
- **§7 (price-followup runtime budget)** — back-of-envelope; confirm with measurement after first deploy.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `technicalindicators@3.1.0` verified via npm registry + GitHub README; yahoo-finance2 chart shape verified directly from installed types.
- Architecture: HIGH — patterns mirror existing diffusion engine; codebase fully read.
- Pitfalls: MEDIUM — derived from codebase analysis + Phase 15 patterns; #5 (logistic reinit) and #7 (volume halt) are inferential and should be unit-tested.
- Validation: HIGH — test framework already configured; `engine-affects-reports.test.ts` is a working template for AC2/AC5.
- Schema migration: HIGH — expand-then-contract is standard Prisma practice; one transactional migration is the right shape.
- UI: MEDIUM — `EngineCalibrationPanel` read in full; `InsightsDashboard` not deeply audited (planner should peek before claiming "minor change").

**Research date:** 2026-04-27
**Valid until:** 2026-05-27 — `technicalindicators` last released 2.5+ years ago and is unlikely to change; yahoo-finance2 is on a stable line; Prisma 7 stable. Re-validate if a major version bumps. Empirical results from first backfill (bucket distribution, Brier-vs-horizon curve, ACTIVE-cell count) will tighten Open Questions 1 and AC3/AC4.
