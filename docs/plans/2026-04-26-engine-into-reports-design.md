# Engine-Into-Reports Integration — Design & Implementation Plan

**Date:** 2026-04-26
**Status:** Approved · Ready for execution in fresh session
**Predecessor:** `2026-04-26-diffusion-learning-engine-design.md` (the engine itself, already shipped)

---

## 0 · Read this first

This plan is **self-contained**. A fresh Claude session reading just this doc plus the linked codebase paths can execute it end-to-end without asking the user any questions. Every decision is locked. Every edge case has a chosen handling. Code-level snippets are included for the non-obvious bits.

The mission is one sentence:

> Make every report on `/research/[ticker]` quote — and visibly defer to — the Cipher learning engine's evolving Bayesian beliefs about which sentiment-diffusion patterns predict price, so that **the same ticker analyzed today and 60 days from now produces materially different, measurably better, calibrated reports**.

Today the engine learns silently in the background and surfaces its beliefs only on `/insights`. After this work, the **report itself** carries those beliefs. That is the difference between "I built a sentiment dashboard" and "I built a self-supervised model whose individual predictions visibly improve as evidence accumulates."

---

## 1 · The North Star: what success looks like

A college admissions reader pulls up a report on, say, AMD. They see:

```
ENGINE CALIBRATION                                        Cycle 47

Pattern detected:    niche_leads × large_cap          [ACTIVE]
Engine prior:        71% [CI 51–86%]   n = 23
Logistic score:      0.68 [CI 0.49–0.83] for AMD's current features
Adversarial null:    real Brier 0.18 < null 0.25      p < 0.01
Concept drift:       NORMAL  (z = 0.4)

Engine alignment:    "Gemini's qualitative read of bullish institutional
                      accumulation aligns with the engine's high-
                      confidence niche_leads prior — confidence: HIGH."
```

Then the report continues with the qualitative analysis — but anchored to that prior.

Two months later the same AMD report shows posterior **74%, n=31, drift z=-0.7**. It changed because the engine learned more. The reader can _see_ the engine learning by comparing two reports across time.

**That visibility — the calibrated prior next to the qualitative read — is the deliverable.**

---

## 2 · Current state (verified before writing this plan)

What's already in production at `https://ciphersearch.app`:

- **Engine state on Neon**: 4 tables — `diffusion_traces`, `learned_patterns`, `learning_events`, `logistic_epochs`
- **Learning loop**: `/api/cron/learn` runs daily 07:30 UTC, processes new `PriceOutcome` rows, updates Beta posteriors + Bayesian-logistic coefficients, writes events. Already idempotent via `LearningEvent.outcome_id`. Backfill on first run.
- **Insights surface**: `/insights` reads `LearnedPattern`, `DiffusionTrace`, `LearningEvent`, `LogisticEpoch` and renders Pattern Library, Live Diffusion Map, Engine Memory, Concept Drift, Null Check, Market State.
- **Library code**: `src/lib/diffusion-trace.ts`, `src/lib/learning.ts` — pure functions, 38 unit tests passing, fully exported and reusable.
- **Reports already feed the engine**: `Report.price_at_report` is captured at generation time, the `price-followup` cron creates `PriceOutcome` rows for reports at 3/7/14d, and `loadUnprocessedOutcomes` in the learn cron picks up `report` outcomes automatically. **The feedback half of the loop is closed.**

What's **missing** (this plan):
- The report-generation pipeline (`runGeminiAnalysis` in `src/lib/gemini-analysis.ts`) doesn't read any engine state. The Gemini prompt is the same on cycle 1 as on cycle 100.
- `AnalysisResult` has no `engine_calibration` field.
- `ResearchReport.tsx` has no panel showing the engine's prior next to the qualitative analysis.

This plan closes that gap.

---

## 3 · Architecture

### 3.1 The data flow at report generation time

```
POST /api/analysis/[ticker]
   │
   ├─► load SourcePackage from temp file (existing)
   ├─► scrapeCommunitySentiment(ticker)   (existing)
   ├─► extractCommunityHighlights         (existing)
   │
   ├─► *** NEW *** getEngineContextForTicker(ticker, scanned_at)
   │      │
   │      ├─ pull last 4 SentimentSnapshot rows for ticker
   │      ├─ if < 4: fall back to whatever exists (≥ 2 needed for trace)
   │      ├─ if 0: trigger an ad-hoc lightweightCommunityScan + use that
   │      ├─ compute DiffusionTrace via existing computeDiffusionTrace()
   │      ├─ classify cap_class via market cap from yahoo
   │      ├─ look up LearnedPattern[flow_pattern, cap_class]
   │      ├─ pull latest LogisticEpoch
   │      ├─ run logistic forward pass → score with credible interval
   │      └─ return EngineContext object
   │
   ├─► runGeminiAnalysis(ticker, pkg, scrapeData, engineCtx)
   │      │
   │      ├─ build SYSTEM_PROMPT + ENGINE_CONTEXT_BLOCK (NEW)
   │      ├─ generateText with extended AnalysisResultSchema
   │      ├─ post-process: overwrite numeric calibration fields with the
   │      │   actual engineCtx values (don't trust LLM to copy numbers)
   │      └─ return AnalysisResult with engine_calibration populated
   │
   ├─► writeReportToDb (existing) — engine_calibration goes into
   │      Report.analysis Json column automatically (no migration)
   │
   └─► SSE stream → /research/[ticker]
          │
          └─► ResearchReport renders ExecSummary → *** NEW *** EngineCalibrationPanel → Thesis → ...
```

### 3.2 No schema migration

`Report.analysis` is already `Json`. `engine_calibration` becomes a new key inside that blob. Older rows simply won't have the key — UI handles absence gracefully.

### 3.3 No new tables

All engine state already exists.

### 3.4 No new cron

The learning cycle is unchanged. We're only making **reads** at report-generation time.

### 3.5 Backwards compatibility guarantee

- Reports generated before this work have `analysis.engine_calibration === undefined`. The new UI panel renders nothing in that case.
- The Zod `AnalysisResultSchema` adds `engine_calibration` as `.optional()`. Old persisted blobs continue to validate.
- The Gemini prompt change is additive — every previous prompt instruction stays.

---

## 4 · The `EngineContext` interface (the contract)

All other components read from this single typed object.

```ts
// src/lib/engine-context.ts

import type { FlowPattern, CapClass } from './diffusion-trace';

export interface EngineContext {
  // ── Trace classification at this moment ─────────────────────────
  flow_pattern: FlowPattern | null;        // null when < 2 snapshots
  cap_class: CapClass;                      // 'unknown' if market cap missing
  niche_lead_cycles: number;
  v_niche: number;
  v_middle: number;
  v_mainstream: number;
  q_z: number;
  qual_z: number;
  trace_window_size: number;                // 1–4

  // ── From LearnedPattern[flow_pattern × cap_class] ───────────────
  posterior_mean: number | null;            // null if NO_DATA
  ci_low: number | null;
  ci_high: number | null;
  posterior_30d_mean: number | null;        // for drift narration
  sample_size: number;
  hits: number;
  status: 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED' | 'NO_DATA';
  brier_in_sample: number | null;
  brier_out_sample: number | null;
  brier_null: number | null;
  drift_z: number;

  // ── From latest LogisticEpoch ───────────────────────────────────
  logistic_score: number | null;
  logistic_ci_low: number | null;
  logistic_ci_high: number | null;
  feature_contributions: Array<{ feature: string; mu: number; contribution: number }>;
  logistic_brier_in: number | null;
  logistic_sample_size: number;

  // ── Engine meta ─────────────────────────────────────────────────
  cycle_count: number;                      // total learning cycles run = LogisticEpoch.epoch
  engine_first_run_at: Date | null;
  last_event_at: Date | null;

  // ── Prediction registration ─────────────────────────────────────
  predicted_at: Date;                       // = scanned_at passed in
  prediction_id_seed: string;               // deterministic hash (ticker + scanned_at iso) — used for traceability

  // ── Per-community alphas (Phase 2 — see § 9) ────────────────────
  community_alphas: Array<{
    community_name: string;
    posterior_mean: number;
    sample_size: number;
  }>;
}
```

This shape is the spine. Every downstream component reads exactly these fields. The `engine_calibration` key inside `AnalysisResult` is a structurally identical subset.

---

## 5 · Files to add

### 5.1 `src/lib/engine-context.ts` (~180 LOC)

Single primary export `getEngineContextForTicker(ticker: string, asOf: Date): Promise<EngineContext>`. Read-only Prisma access. Calls into `computeDiffusionTrace` and `predictLogistic` from existing libs — no new math.

**Implementation sketch (NOT verbatim — adapt to actual schema):**

```ts
import { prisma } from '@/lib/db';
import { computeDiffusionTrace, classifyCapClass, type FlowPattern, type CapClass, type SnapshotInput } from './diffusion-trace';
import { predictLogistic, logisticCoefCI, type LogisticState, initLogisticState } from './learning';
import { lightweightCommunityScan } from './data/lightweight-community-scan';

const FEATURE_NAMES = ['v_niche', 'v_middle', 'v_mainstream', 'niche_lead_cycles', 'q_z', 'qual_z'];

export async function getEngineContextForTicker(ticker: string, asOf: Date): Promise<EngineContext> {
  const upperTicker = ticker.toUpperCase();

  // ── 1. Pull last 4 snapshots ─────────────────────────────────────
  let snaps = await prisma.sentimentSnapshot.findMany({
    where: { ticker: upperTicker, scanned_at: { lte: asOf } },
    orderBy: { scanned_at: 'desc' },
    take: 4,
  });

  // ── 2. Cold-start: ticker not in watchlist, no snapshots exist ──
  // Trigger a one-shot lightweightCommunityScan (existing function),
  // persist as a SentimentSnapshot row so future reports benefit, and
  // use it as our single data point. flow_pattern can't be classified
  // with 1 snapshot — status = 'NO_DATA'.
  if (snaps.length === 0) {
    const live = await lightweightCommunityScan(upperTicker);
    if (live) {
      const created = await prisma.sentimentSnapshot.create({
        data: { ticker: upperTicker, scanned_at: asOf, price_at_scan: 0, community_data: live as object },
      });
      snaps = [created];
    }
  }

  // ── 3. Historical context for z-scoring ─────────────────────────
  const tickerHistory = await prisma.sentimentSnapshot.findMany({
    where: { ticker: upperTicker },
    select: { community_data: true },
    take: 50,
    orderBy: { scanned_at: 'desc' },
  });
  const histQuantity: number[] = [];
  const histQuality: number[] = [];
  for (const s of tickerHistory) {
    const cd = s.community_data as { quantity?: number; quality?: number } | null;
    if (cd?.quantity != null) histQuantity.push(cd.quantity);
    if (cd?.quality != null) histQuality.push(cd.quality);
  }

  // ── 4. Compute trace ─────────────────────────────────────────────
  const inputs: SnapshotInput[] = snaps.map(s => ({
    scanned_at: s.scanned_at,
    community_data: (s.community_data ?? {}) as SnapshotInput['community_data'],
  }));
  const trace = inputs.length >= 2 ? computeDiffusionTrace(inputs, histQuantity, histQuality) : null;

  const flow_pattern = trace?.flow_pattern ?? null;
  const cap_class = trace?.cap_class
    ?? classifyCapClass((snaps[0]?.community_data as { market_cap?: number | null } | null)?.market_cap ?? null);

  // ── 5. Look up LearnedPattern (when we have a non-flat pattern) ──
  let cell: Awaited<ReturnType<typeof prisma.learnedPattern.findUnique>> = null;
  if (flow_pattern && flow_pattern !== 'flat') {
    cell = await prisma.learnedPattern.findUnique({
      where: { flow_pattern_cap_class: { flow_pattern, cap_class } },
    });
  }

  // ── 6. Latest LogisticEpoch + forward pass ──────────────────────
  const lastEpoch = await prisma.logisticEpoch.findFirst({ orderBy: { epoch: 'desc' } });
  let logistic_score: number | null = null;
  let logistic_ci_low: number | null = null;
  let logistic_ci_high: number | null = null;
  const feature_contributions: EngineContext['feature_contributions'] = [];

  if (lastEpoch && trace) {
    const c = lastEpoch.coefficients as Record<string, { mu: number; sigma: number }>;
    const x = [trace.v_niche, trace.v_middle, trace.v_mainstream, trace.niche_lead_cycles, trace.q_z, trace.qual_z];
    const state: LogisticState = {
      intercept: lastEpoch.intercept,
      intercept_var: ((c['_intercept']?.sigma) ?? 1) ** 2,
      weights: FEATURE_NAMES.map(n => c[n]?.mu ?? 0),
      weight_vars: FEATURE_NAMES.map(n => (c[n]?.sigma ?? 1) ** 2),
      feature_names: FEATURE_NAMES,
    };
    logistic_score = predictLogistic(state, x);
    // CI via propagated variance: var(z) = var(intercept) + Σ var(w_i) * x_i^2
    const varZ = state.intercept_var + state.weights.reduce((acc, _, i) => acc + state.weight_vars[i] * x[i] * x[i], 0);
    const sd = Math.sqrt(varZ);
    const z = state.intercept + state.weights.reduce((acc, w, i) => acc + w * x[i], 0);
    const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));
    logistic_ci_low = sigmoid(z - 1.96 * sd);
    logistic_ci_high = sigmoid(z + 1.96 * sd);

    for (let i = 0; i < FEATURE_NAMES.length; i++) {
      feature_contributions.push({
        feature: FEATURE_NAMES[i],
        mu: state.weights[i],
        contribution: state.weights[i] * x[i],
      });
    }
  }

  // ── 7. Engine meta ──────────────────────────────────────────────
  const firstEvent = await prisma.learningEvent.findFirst({ orderBy: { occurred_at: 'asc' } });
  const lastEvent = await prisma.learningEvent.findFirst({ orderBy: { occurred_at: 'desc' } });

  // ── 8. Per-community alphas (Phase 2 stub — see § 9) ────────────
  const community_alphas: EngineContext['community_alphas'] = [];

  // ── 9. Status logic ─────────────────────────────────────────────
  const status: EngineContext['status'] =
    !cell ? 'NO_DATA'
    : (cell.status as 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED');

  // ── 10. Build return ────────────────────────────────────────────
  return {
    flow_pattern,
    cap_class,
    niche_lead_cycles: trace?.niche_lead_cycles ?? 0,
    v_niche: trace?.v_niche ?? 0,
    v_middle: trace?.v_middle ?? 0,
    v_mainstream: trace?.v_mainstream ?? 0,
    q_z: trace?.q_z ?? 0,
    qual_z: trace?.qual_z ?? 0,
    trace_window_size: snaps.length,

    posterior_mean: cell ? cell.alpha / (cell.alpha + cell.beta) : null,
    ci_low: cell ? credibleIntervalLow(cell.alpha, cell.beta) : null,
    ci_high: cell ? credibleIntervalHigh(cell.alpha, cell.beta) : null,
    posterior_30d_mean: cell ? cell.alpha_30d / (cell.alpha_30d + cell.beta_30d) : null,
    sample_size: cell?.sample_size ?? 0,
    hits: cell?.hits ?? 0,
    status,
    brier_in_sample: cell?.brier_in_sample ?? null,
    brier_out_sample: cell?.brier_out_sample ?? null,
    brier_null: cell?.brier_null ?? null,
    drift_z: cell?.drift_z ?? 0,

    logistic_score,
    logistic_ci_low,
    logistic_ci_high,
    feature_contributions,
    logistic_brier_in: lastEpoch?.brier_in ?? null,
    logistic_sample_size: lastEpoch?.sample_size ?? 0,

    cycle_count: lastEpoch?.epoch ?? 0,
    engine_first_run_at: firstEvent?.occurred_at ?? null,
    last_event_at: lastEvent?.occurred_at ?? null,

    predicted_at: asOf,
    prediction_id_seed: `${upperTicker}-${asOf.toISOString()}`,

    community_alphas,
  };
}
```

`credibleIntervalLow`/`High` are extracted from existing `credibleInterval95` in `src/lib/learning.ts` — pull them out to small helpers.

### 5.2 `src/lib/__tests__/engine-context.test.ts` (~150 LOC)

Mock Prisma with `vi.mock('@/lib/db', () => ({ prisma: { ... } }))`. Verify:

- Returns `status: 'NO_DATA'` when no learned cell exists
- Returns the right posterior + CI when a cell exists
- Computes logistic score correctly given a known LogisticEpoch
- Falls back gracefully when 0 snapshots (cold start)
- Cold-start triggers `lightweightCommunityScan` (mock that too)
- Computes `flow_pattern: null` and `trace_window_size: 1` with one snapshot
- Returns `cap_class: 'unknown'` when market cap missing

### 5.3 `src/components/EngineCalibrationPanel.tsx` (~200 LOC)

A self-contained presentational component. Props: `{ calibration: EngineCalibration }`. Renders nothing if `calibration.status === undefined`.

Visual structure:

```
┌────────────────────────────────────────────────────────────────────┐
│ ENGINE CALIBRATION                                  CYCLE 47 · 2d ago│
├────────────────────────────────────────────────────────────────────┤
│ Pattern detected:    NICHE LEADS × LARGE CAP            [ ACTIVE ] │
│                                                                    │
│ Engine prior          Logistic score        Adversarial null       │
│ ┌──────────────┐      ┌──────────────┐      ┌──────────────────┐   │
│ │ 71%          │      │ 0.68         │      │ p < 0.01         │   │
│ │ [51 ── 86%]  │      │ [0.49 ─ 0.83]│      │ real 0.18 / null │   │
│ │ n=23         │      │ n=87 epoch   │      │ 0.25 (95% conf.) │   │
│ └──────────────┘      └──────────────┘      └──────────────────┘   │
│                                                                    │
│ Concept drift gauge:  ●●●○○○○○○○  NORMAL  (z = 0.4)               │
│                                                                    │
│ Engine alignment:                                                  │
│   "Gemini's qualitative read of bullish institutional accumulation │
│    aligns with the engine's high-confidence niche_leads prior.     │
│    Confidence: HIGH."                                              │
│                                                                    │
│ ↳ Diffusion trace (4 cycles)    [niche/middle/mainstream sparkline]│
│ ↳ This prediction will be auto-verified at 3, 7, and 14 days.      │
└────────────────────────────────────────────────────────────────────┘
```

Match existing `ResearchReport` typography exactly. Use semantic colors:
- ACTIVE → secondary (teal)
- EXPLORATORY → outline-variant
- DEPRECATED → error
- NO_DATA → text-on-surface-variant

Each "?" tooltip on hover explains the term in plain English (Brier, Bayesian posterior, credible interval, drift z, adversarial null).

---

## 6 · Files to modify

### 6.1 `src/lib/types.ts`

Add the calibration interface and extend `AnalysisResult`. **Strictly additive — `?`-optional everywhere.**

```ts
// After CommunityHighlight (~line 156):

export interface EngineCalibration {
  cycle_count: number;
  flow_pattern: 'niche_leads' | 'simultaneous' | 'mainstream_first' | 'flat' | null;
  cap_class: 'large_cap' | 'mid_cap' | 'small_cap' | 'unknown';
  trace_window_size: number;

  posterior_mean: number | null;
  ci_low: number | null;
  ci_high: number | null;
  sample_size: number;
  status: 'ACTIVE' | 'EXPLORATORY' | 'DEPRECATED' | 'NO_DATA';
  brier_in_sample: number | null;
  brier_null: number | null;
  drift_z: number;

  logistic_score: number | null;
  logistic_ci_low: number | null;
  logistic_ci_high: number | null;
  logistic_sample_size: number;

  predicted_at: string;        // ISO

  // Gemini's qualitative response to the engine prior:
  engine_alignment: string | null;     // present if Gemini's read agrees
  engine_disagreement: string | null;  // present if Gemini's read disagrees

  // Sparkline data so UI doesn't have to refetch
  diffusion_sparkline: Array<{ niche: number; middle: number; mainstream: number; scanned_at: string }>;
}

// In AnalysisResult interface (~line 219):
//   community_highlights?: CommunityHighlight[];
//   engine_calibration?: EngineCalibration;     // NEW
```

### 6.2 `src/lib/gemini-analysis.ts`

Three changes:

**(a) Import the engine context fetcher.**

```ts
import { getEngineContextForTicker } from './engine-context';
```

**(b) Extend the Zod schema (additive).**

```ts
const EngineCalibrationSchema = z.object({
  // Numeric fields will be OVERWRITTEN post-generation — Gemini just needs to
  // include the keys with placeholder values. We do not trust LLM number copying.
  cycle_count: z.number().default(0),
  flow_pattern: z.enum(['niche_leads', 'simultaneous', 'mainstream_first', 'flat']).nullable().default(null),
  cap_class: z.enum(['large_cap', 'mid_cap', 'small_cap', 'unknown']).default('unknown'),
  trace_window_size: z.number().default(0),
  posterior_mean: z.number().nullable().default(null),
  ci_low: z.number().nullable().default(null),
  ci_high: z.number().nullable().default(null),
  sample_size: z.number().default(0),
  status: z.enum(['ACTIVE', 'EXPLORATORY', 'DEPRECATED', 'NO_DATA']).default('NO_DATA'),
  brier_in_sample: z.number().nullable().default(null),
  brier_null: z.number().nullable().default(null),
  drift_z: z.number().default(0),
  logistic_score: z.number().nullable().default(null),
  logistic_ci_low: z.number().nullable().default(null),
  logistic_ci_high: z.number().nullable().default(null),
  logistic_sample_size: z.number().default(0),
  predicted_at: z.string().default(''),
  // These two ARE LLM-generated and we keep them
  engine_alignment: z.string().nullable().default(null),
  engine_disagreement: z.string().nullable().default(null),
  diffusion_sparkline: z.array(z.object({
    niche: z.number(),
    middle: z.number(),
    mainstream: z.number(),
    scanned_at: z.string(),
  })).default([]),
});

export const AnalysisResultSchema = z.object({
  // ...existing fields...
  engine_calibration: EngineCalibrationSchema.optional(),
});
```

**(c) Build the calibration prompt block + post-process.**

Add a `buildEngineContextBlock(ctx: EngineContext): string` helper that returns a markdown-formatted block to append to `SYSTEM_PROMPT`. Then in `runGeminiAnalysis`, fetch the engine context, prepend the block to the system content, and post-process by overwriting numeric fields.

The new system-prompt suffix (string template):

```ts
function buildEngineContextBlock(ctx: EngineContext): string {
  if (ctx.status === 'NO_DATA') {
    return `

═══ ENGINE CALIBRATION CONTEXT ═══

The Cipher learning engine has no historical data for this ticker's
current diffusion regime yet (status: NO_DATA, cycle ${ctx.cycle_count}).
Your qualitative read is the only signal. In the engine_calibration
object, set engine_alignment to null and write engine_disagreement
explaining that the engine has no prior to defer to.
`;
  }

  const pct = (n: number | null) => n != null ? (n * 100).toFixed(0) + '%' : '—';
  return `

═══ ENGINE CALIBRATION CONTEXT ═══

Cipher's self-supervised learning engine has accumulated ${ctx.cycle_count}
cycles of evidence about how sentiment-diffusion patterns predict 7-day
returns vs SPY (excess > +1%). For this ticker right now:

  Pattern detected:    ${ctx.flow_pattern} × ${ctx.cap_class}
  Engine prior:        ${pct(ctx.posterior_mean)} [CI ${pct(ctx.ci_low)}–${pct(ctx.ci_high)}]
                       n=${ctx.sample_size}, status: ${ctx.status}
  Logistic score:      ${pct(ctx.logistic_score)} [CI ${pct(ctx.logistic_ci_low)}–${pct(ctx.logistic_ci_high)}]
                       (engine has trained on ${ctx.logistic_sample_size} resolved outcomes)
  Adversarial null:    real Brier ${ctx.brier_in_sample?.toFixed(2) ?? '—'}
                       null Brier ${ctx.brier_null?.toFixed(2) ?? '—'}
  Concept drift:       z = ${ctx.drift_z.toFixed(2)} (>2σ = drifting)

INSTRUCTIONS for engine_calibration:
1. Treat these numbers as **calibrated priors**. Do not invent numbers; the
   numeric fields will be overwritten post-generation regardless of what
   you output.
2. In engine_alignment (string, ≤300 chars):
   - If the engine prior is HIGH (>60%) and your qualitative read is bullish,
     OR engine prior is LOW (<40%) and your read is bearish: write a single
     sentence affirming alignment, naming the pattern, and noting the
     sample size.
   - Otherwise, leave engine_alignment as null.
3. In engine_disagreement (string, ≤500 chars):
   - If your qualitative read CONTRADICTS a high-confidence prior
     (sample_size ≥ 10 AND status ∈ {ACTIVE}), write a single paragraph
     explaining specifically WHY you disagree. Cite specific community
     evidence that overrides the prior.
   - If status is DEPRECATED (drift detected), explicitly note that the
     pattern has drifted and you are NOT deferring to the historical prior.
   - Otherwise, leave engine_disagreement as null.
4. Your investment_thesis, key_risks, and confidence_level MUST be
   consistent with the engine prior unless you have explicitly populated
   engine_disagreement above.
5. If status is EXPLORATORY (n < 10), treat the prior as weak and weight
   your qualitative read more heavily.
`;
}
```

**The post-process step** in `runGeminiAnalysis` (after the `generateText` call) overwrites the numeric calibration fields with the actual `EngineContext` values, keeping only Gemini's `engine_alignment` and `engine_disagreement` strings:

```ts
const ctx = await getEngineContextForTicker(ticker, new Date(pkg.assembled_at));
const sparkline = await loadDiffusionSparkline(ticker, ctx.predicted_at);

// ... existing generateText call with extended schema and SYSTEM_PROMPT + buildEngineContextBlock(ctx) ...

// Overwrite numeric fields — the LLM only contributed alignment/disagreement strings:
const llmCalibration = output.engine_calibration ?? {} as Partial<EngineCalibration>;
const final_calibration: EngineCalibration = {
  cycle_count: ctx.cycle_count,
  flow_pattern: ctx.flow_pattern,
  cap_class: ctx.cap_class,
  trace_window_size: ctx.trace_window_size,
  posterior_mean: ctx.posterior_mean,
  ci_low: ctx.ci_low,
  ci_high: ctx.ci_high,
  sample_size: ctx.sample_size,
  status: ctx.status,
  brier_in_sample: ctx.brier_in_sample,
  brier_null: ctx.brier_null,
  drift_z: ctx.drift_z,
  logistic_score: ctx.logistic_score,
  logistic_ci_low: ctx.logistic_ci_low,
  logistic_ci_high: ctx.logistic_ci_high,
  logistic_sample_size: ctx.logistic_sample_size,
  predicted_at: ctx.predicted_at.toISOString(),
  engine_alignment: llmCalibration.engine_alignment ?? null,
  engine_disagreement: llmCalibration.engine_disagreement ?? null,
  diffusion_sparkline: sparkline,
};

return {
  ...result,
  engine_calibration: final_calibration,
};
```

`loadDiffusionSparkline` is a small helper that pulls the last 4 snapshots' tier_breakdown for the chart.

### 6.3 `src/app/api/analysis/[ticker]/route.ts`

No new external behavior — `runGeminiAnalysis` now fetches the engine context internally. The route doesn't need any change. Verify by re-reading the file — leave untouched.

(If the route caller passes `scanned_at` separately, pass `pkg.assembled_at` as `asOf`. Already done in the snippet above.)

### 6.4 `src/components/ResearchReport.tsx`

Insert the new panel after Executive Summary, before Investment Thesis. One block import + one block render:

```tsx
import { EngineCalibrationPanel } from './EngineCalibrationPanel';
// ...
{result.engine_calibration && (
  <EngineCalibrationPanel calibration={result.engine_calibration} />
)}
```

Existing layout untouched if `engine_calibration` is absent.

### 6.5 `src/components/InsightsDashboard.tsx`

No change required. The insights page already reads engine state independently.

### 6.6 `src/lib/reports-db.ts`

No change. `analysis: result as object` already serializes `engine_calibration` because it's part of `AnalysisResult`.

---

## 7 · Edge cases and chosen handling

| # | Edge case | Handling |
|---|---|---|
| 1 | Ticker not in watchlist, 0 snapshots | Cold-start: trigger `lightweightCommunityScan` synchronously, persist as a fresh SentimentSnapshot, use it as the single trace input. status=NO_DATA. |
| 2 | Ticker has 1 snapshot only | trace_window_size=1, flow_pattern=null, status=NO_DATA, posterior=null. Gemini prompt explicitly says "no historical regime data — your qualitative read is the only signal." |
| 3 | Ticker has 2–3 snapshots | Compute trace with reduced window. classifyFlowPattern still works on shorter velocity arrays. Sample size on the cell may still be 0 → NO_DATA. |
| 4 | Pattern is `flat` | Skip cell lookup. status=NO_DATA. Gemini prompt: "no informative pattern detected — sentiment is stable." |
| 5 | Pattern is DEPRECATED (drift detected) | Prompt explicitly says "the pattern has drifted; do NOT defer to the historical prior; populate engine_disagreement." |
| 6 | Pattern is EXPLORATORY (n<10) | Prompt: "weak prior — weight qualitative read more heavily." UI shows EXPLORATORY badge. |
| 7 | Market cap unknown | cap_class='unknown'. Cell lookup uses `(flow_pattern, 'unknown')`. Likely NO_DATA at first; populates over time. |
| 8 | yahoo-finance2 quote fails | Catch and treat market cap as missing → cap_class='unknown'. Non-fatal. |
| 9 | LogisticEpoch row missing | logistic_score=null. Prompt omits the logistic line. UI omits the logistic card. |
| 10 | Gemini hallucinates numbers | Mitigated by post-process overwrite. The LLM-supplied engine_alignment/engine_disagreement strings are kept; numbers are always authoritative. |
| 11 | Gemini omits engine_calibration entirely | `optional()` in schema → result.engine_calibration would be undefined. Post-process always sets it. |
| 12 | Gemini's engine_disagreement is empty when it should disagree | Acceptable — the report still shows the prior visibly. The reader can compare to Gemini's qualitative read themselves. |
| 13 | Engine context fetch throws | Catch in runGeminiAnalysis, fall back to no engine_calibration. Report still generates. Log for observability. |
| 14 | Concurrent reports for same ticker | Each independently reads engine state at request time. No locking needed (reads are cheap, posteriors only update at 07:30 UTC). |
| 15 | First-ever report (cycle_count=0) | Prompt: "engine has not yet completed its first learning cycle — your qualitative read stands alone." UI shows engine block but with sparser content. |

---

## 8 · Testing strategy

### 8.1 Unit tests (vitest)

`src/lib/__tests__/engine-context.test.ts`:

- `getEngineContextForTicker` returns NO_DATA when no LearnedPattern exists
- Returns correct posterior_mean from a mocked LearnedPattern
- Logistic score matches `predictLogistic` of mocked LogisticEpoch coefficients
- Cold-start path triggers `lightweightCommunityScan` (mock + assert called)
- Returns `flow_pattern: null` with one snapshot
- Returns `cap_class: 'unknown'` when no market_cap

### 8.2 Integration test (vitest with real Prisma against test DB or carefully mocked)

In `tests/unit/`:

- Run a full `runGeminiAnalysis` call (mock the AI SDK to return a canned response with engine_alignment string set). Assert the returned `result.engine_calibration` has authoritative numbers from EngineContext, and the LLM string is preserved.

### 8.3 E2E test (Playwright)

`tests/e2e/engine-calibration.spec.ts`:

- Seed a Report with `analysis.engine_calibration` populated
- Visit `/research/[ticker]?report=<id>`
- Assert EngineCalibrationPanel renders with correct posterior text
- Assert tooltips appear on hover
- Take screenshot, verify visually

### 8.4 Manual verification (one-time, post-deploy)

- Generate a fresh report on a watchlist ticker (PLTR or AMD)
- Confirm the report page shows the EngineCalibrationPanel
- Confirm the panel shows real numbers from `LearnedPattern`
- Confirm Gemini wrote a coherent `engine_alignment` or `engine_disagreement` paragraph
- Re-generate the same ticker after the next learn cron run; confirm the numbers have shifted

---

## 9 · Future enhancements (deliberately out of scope for v1)

These are noted to keep the v1 design clean but should be tracked.

### 9.1 Per-community alphas (Phase 2)

Right now communities collapse to 3 tiers. Track each `community_name` as its own Beta posterior. Display a per-community alpha leaderboard inside the report ("r/wallstreetbets posterior 0.49, n=72 — essentially noise"). Requires:
- New `CommunityPosterior` table keyed by community_name
- Update the learn cron to iterate over highlights and update per-community Bayesian posteriors
- Extend `EngineContext.community_alphas`

### 9.2 Confidence delta tracking

Store the engine's `posterior_mean` at report generation time. When the outcome resolves, write a `LearningEvent` of type `report_resolution` showing whether the engine's prior was right. Surface in `/insights` as a "Reports vs Reality" tile.

### 9.3 Report regeneration auto-comparison

When the same ticker is re-analyzed within 30 days, show side-by-side: "Last report's engine prior: 65%. This report's: 71%. The engine has gained confidence."

### 9.4 Engine disagreement annotations

When `engine_disagreement` is populated, render that block with extra prominence and tag it. Track over time: do disagreements end up being right more often than the engine prior? That's a meta-learning signal.

### 9.5 Conviction-weighted position sizing

Multiply `logistic_score` by historical Brier-skill to derive a Kelly-fraction position size recommendation. *"Suggested allocation: 0.4% of equity (capped by historical engine Brier of 0.21)."*

---

## 10 · Implementation order — three commits

### Commit 1: `feat(engine-context): library + tests`

Files:
- NEW `src/lib/engine-context.ts`
- NEW `src/lib/__tests__/engine-context.test.ts`
- MODIFIED `src/lib/types.ts` — add `EngineCalibration` interface, extend `AnalysisResult` with optional `engine_calibration` field

Acceptance:
- `npx vitest run src/lib/__tests__/engine-context.test.ts` — all green
- `npx tsc --noEmit` clean

### Commit 2: `feat(reports): Gemini reads + reflects engine state`

Files:
- MODIFIED `src/lib/gemini-analysis.ts`:
  - Import `getEngineContextForTicker`
  - Add `EngineCalibrationSchema`
  - Extend `AnalysisResultSchema` with `engine_calibration: EngineCalibrationSchema.optional()`
  - Add `buildEngineContextBlock(ctx)` helper
  - Add `loadDiffusionSparkline(ticker, asOf)` helper
  - In `runGeminiAnalysis`: fetch ctx, append block to system prompt, post-process to overwrite numeric fields

Acceptance:
- `npx tsc --noEmit` clean
- All existing vitest tests still pass (38+ engine-context tests + the rest)
- Local `npm run dev`, generate a real report on a watchlist ticker, confirm `result.engine_calibration` is populated in the SSE final message

### Commit 3: `feat(ui): EngineCalibrationPanel in research report`

Files:
- NEW `src/components/EngineCalibrationPanel.tsx`
- MODIFIED `src/components/ResearchReport.tsx` — insert the panel between Executive Summary and Investment Thesis, gated on `result.engine_calibration` being present
- NEW `tests/e2e/engine-calibration.spec.ts` (Playwright)

Acceptance:
- Visual Playwright run: load `/research/<ticker>?report=<existing-id>` and confirm panel renders
- Tooltip on Brier and posterior renders on hover
- Take a screenshot, read it, confirm legibility
- Push and verify production at `https://ciphersearch.app/research/<ticker>?report=<id>`

---

## 11 · Verification checklist (run after all 3 commits)

```bash
# Tests
npx vitest run                        # 100% green for new tests; pre-existing
                                      # 3 stale failures (gemini-analysis,
                                      # analysis-web-mode) are unrelated

# Typecheck
npx tsc --noEmit                      # clean

# Local end-to-end
set -a && source .env.local && set +a
npm run dev > /tmp/cipher-dev.log 2>&1 &
sleep 8
# Generate a report (manually via UI on /terminal → enter ticker → confirm)
# OR: programmatically:
curl -X POST http://localhost:3000/api/research/PLTR \
  -H "Content-Type: application/json" -d '{"confirmed":true}' \
  | jq '.filePath' \
  | xargs -I{} curl -N -X POST http://localhost:3000/api/analysis/PLTR \
       -H "Content-Type: application/json" -d "{\"filePath\":\"{}\"}" \
  | grep '^data: {"type":"result"' \
  | sed 's/^data: //' \
  | jq '.data.engine_calibration'

# Production smoke
curl -s https://ciphersearch.app/api/insights | jq '.logistic_epoch.epoch'
# Generate a real report on production via UI; verify panel appears

# DB sanity
psql "$DIRECT_URL" -c "
  SELECT id, ticker, jsonb_typeof(analysis::jsonb -> 'engine_calibration')
  FROM reports
  ORDER BY analyzed_at DESC LIMIT 5;
"
# New reports should have 'object' in the third column; older reports 'null'
```

---

## 12 · What this is, and what it is NOT

### IS
- A genuine closing of the prediction-improvement loop. The engine learns from outcomes; the next report uses what it learned.
- Visible self-improvement: same ticker, two months apart, two materially different reports — and the user can SEE why.
- A research-grade artifact suitable for college applications and technical interviews. The pitch is one sentence: *"Each report quotes the engine's calibrated prior — a Bayesian posterior derived from N prior cases of this exact diffusion pattern, with a credible interval and adversarial null Brier — and explains in plain English when the AI's qualitative read disagrees."*

### IS NOT
- A prompt-engineering hack that pretends to learn. The numbers in the report are post-process-overwritten with authoritative values from the database — Gemini cannot fabricate them.
- A model retrain. Online updates only. The engine state evolves continuously, no batch retraining.
- An investment recommendation system. All output is research-only, framed as probabilities with credible intervals, never as advice.
- A breaking change. Old reports continue to render exactly as before. New schema field is optional everywhere.

---

## 13 · Anti-patterns to avoid

The fresh-context executor MUST NOT:

1. **Trust Gemini to copy numbers correctly.** The post-process overwrite is mandatory — the LLM contributes only the `engine_alignment` and `engine_disagreement` prose strings.
2. **Add a `engine_calibrations` table.** All state is already on `Report.analysis` Json. Don't migrate.
3. **Skip the cold-start path.** A user analyzing a non-watchlist ticker must still get a calibration block (status=NO_DATA), not a missing field.
4. **Block report generation if engine context fails.** Catch and return result without `engine_calibration`. Reports must keep working.
5. **Re-classify flow_pattern with custom thresholds.** Use the existing `computeDiffusionTrace` + `classifyFlowPattern` from `src/lib/diffusion-trace.ts`. Same math everywhere.
6. **Cache EngineContext.** Cheap to compute, posteriors only update once per day. Don't add cache complexity.
7. **Render the panel when `engine_calibration` is undefined.** Hide it entirely. Don't show "no data" placeholders unless the calibration object exists with status=NO_DATA.
8. **Ship without verifying `tsc --noEmit` and `vitest` pass.** Both must be green before each commit.
9. **Treat this as a UI feature.** It's a model integration. The UI panel is the most visible part, but the actual leverage is in `runGeminiAnalysis` reading + reflecting the learned state.
10. **Forget the prediction registration.** Each new report's `Report.id` IS the prediction registration — `price-followup` cron already resolves it. No new code needed for registration; it works automatically.

---

## 14 · Mission re-statement (read this last, before starting)

You are building the integration that makes Cipher's reports demonstrably better over time. The engine has been learning silently for days; this work makes that learning **visible inside the user-facing report**.

The single test of success: generate a report today, generate the same report 30 days from now after the engine has processed more outcomes, and the two reports show **different posterior numbers, different credible intervals, possibly different status badges, possibly an engine_disagreement that wasn't there before**. The user can read those differences and understand exactly what the model learned.

That visibility is the deliverable. Everything else is plumbing.

---

**End of plan. Execute in order. Run tests at every commit. Verify on production at `https://ciphersearch.app` after deploy.**
