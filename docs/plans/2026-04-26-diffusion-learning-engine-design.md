# Sentiment-Diffusion Learning Engine — Design

**Date:** 2026-04-26
**Status:** Approved for implementation
**Supersedes:** `2026-04-25-sentiment-research-engine-design.md` extends, does not replace

---

## Problem

The existing engine collects sentiment and verifies outcomes, but its beliefs are static:
- `/api/insights/route.ts:106-109` uses hardcoded thresholds (`diffusion_gap > 2`, `direction > 0.6`, `quality > 0.5`, `quantity > 10`)
- `lightweight-community-scan.ts:41-53` collapses three named communities into a 3-tier breakdown, discarding names before persistence
- After 1,000 resolved outcomes the same numbers are still on the dashboard

The system records evidence but never updates its model from the evidence.

## Goal

A self-supervised learning loop that:
- Runs entirely on cron (no app interaction required)
- Reads the existing `Report` / `SentimentSnapshot` / `PriceOutcome` stream
- Updates Bayesian beliefs about which sentiment-diffusion patterns predict price movement
- Surfaces those evolving beliefs on `/insights` with credible intervals, drift detection, out-of-sample validation, and an adversarial null test

## Core hypothesis

Sentiment that originates in niche communities (`r/${TICKER}`) and diffuses to middle (`r/investing`) and then mainstream (`r/wallstreetbets`) precedes price movement; sentiment that appears mainstream-first does not. The engine learns this conditional probability from outcomes.

## ML stack

### Layer 1 — Beta-Bernoulli posteriors over discrete flow patterns (headline)

For each `(flow_pattern, cap_class)` cell, maintain `Beta(α, β)` posterior over `P(7d alpha hit)`.

**Flow patterns**
- `niche_leads` — `v_niche` turns positive at least one cycle before `v_mainstream`
- `simultaneous` — all three velocities turn positive in the same cycle
- `mainstream_first` — mainstream rises before niche/middle
- `flat` — all velocities ≈ 0 (excluded from learning)

**Cap classes** (from `summaryProfile.marketCap` at scan time)
- `large_cap` — > $10B
- `mid_cap` — $2B – $10B
- `small_cap` — < $2B

**Update rule** — on every resolved 7d `PriceOutcome`:
```
hit ≡ (ticker_return_7d − SPY_return_7d) > +0.01
α ← α + (hit ? 1 : 0)
β ← β + (hit ? 0 : 1)
```

Closed-form, exact, online. Credible interval is the 2.5th–97.5th percentile of `Beta(α, β)`.

### Layer 2 — Bayesian logistic regression with Laplace approximation

Continuous per-ticker scoring. Features (z-scored within ticker history):
- `v_niche`, `v_middle`, `v_mainstream` (engagement velocity per cycle)
- `niche_lead_cycles` (integer 0–3)
- `q_z` (quantity z-score)
- `qual_z` (quality z-score)

Output: `P(7d alpha hit | features)` with coefficient credible intervals via Laplace approximation. Online updates via Kalman-style step on each resolved outcome.

Used to rank tickers in the **Live Diffusion Map** with a continuous edge estimate, not just the discrete pattern label.

### Why Bayesian, not gradient boosting

| Concern | Decision |
|---|---|
| Sample size at launch | N≈100 outcomes — XGBoost overfits, Bayesian regularizes naturally |
| Online updates | Beta is conjugate (closed-form); logistic+Laplace is a single matrix update — both are O(1) per outcome |
| Uncertainty quantification | Beta gives exact credible intervals; logistic+Laplace gives coefficient CIs |
| Defensibility in interview | "Bayesian conjugate prior" is one sentence; tree ensemble is harder to explain |
| Cron compatibility | Pure TypeScript, no library, runs in Vercel function under 100ms |

### Labels: SPY-relative excess return

Existing `PriceOutcome.pct_change` records absolute return — kept for the live thesis tile. The learning layer uses **excess vs SPY 7d return > +1%**. Computed in the learn cron via a single `yahooFinance.chart('SPY', { period1, period2 })` call per run, joined by date. Zero schema cost.

Rationale: a 3% absolute gain in an up-2% market is barely a signal; a 3% gain in a down-3% market is a real edge. Excess return removes regime confounds.

### Validation regime

Every cron run, per pattern cell:
- **In-sample Brier score** — over all resolved outcomes
- **Out-of-sample Brier score** — over the last 14 days only (held out)
- **Adversarial null Brier** — same data, labels shuffled

Status assignment:
- `ACTIVE` — `brier_in_sample` significantly below `brier_null` (1σ)
- `EXPLORATORY` — `n < 10` or test inconclusive
- `DEPRECATED` — `brier_out_sample` worse than `brier_null` (drift detected)

Concept drift Z-score:
```
drift_z = (P_30d_rolling − P_alltime) / sqrt(P_alltime × (1 − P_alltime) / n_30d)
```
`|drift_z| > 2` triggers a `LearningEvent.event_type = 'drift_alert'`.

## Architecture

```
                                                   Existing
sentiment-scan cron (every 3d, 08:00 UTC)  ──►   SentimentSnapshot
                                                   community_data: dimensions + highlights[]
                                                   + market_cap + cap_class  (NEW additive fields)
                                                          │
price-followup cron (daily, 06:00 UTC)     ──►   PriceOutcome
                                                          │
*** NEW *** /api/cron/learn (daily, 07:30 UTC, post-followup)
                                                          │
   1. fetch SPY closes (1 yahoo call, last 21d)            │
   2. find PriceOutcome days_after=7 created in last 24h ──┘
      filtered: NOT EXISTS LearningEvent WHERE outcome_id = id  (idempotent)
   3. for each: rebuild DiffusionTrace from preceding 4 snapshots
   4. compute hit = (ticker_return − SPY_return) > +1%
   5. update LearnedPattern[flow_pattern, cap_class] α/β
   6. update LogisticEpoch coefficients (one online step)
   7. recompute drift_z + Brier (in/out/null) per pattern
   8. write LearningEvent rows (posterior_update + drift_alert + cycle_summary)
   9. AI SDK generates one English paragraph for cycle_summary
   10. delete LearningEvent rows >90d old
```

## Schema additions (`prisma/schema.prisma`)

```prisma
model DiffusionTrace {
  id                  String   @id @default(uuid())
  ticker              String
  cap_class           String
  end_at              DateTime @db.Timestamptz
  window_cycles       Int
  v_niche             Float
  v_middle            Float
  v_mainstream        Float
  q_z                 Float
  qual_z              Float
  niche_lead_cycles   Int
  flow_pattern        String
  source_snapshot_ids String[]
  created_at          DateTime @default(now()) @db.Timestamptz

  @@index([ticker, end_at(sort: Desc)])
  @@index([flow_pattern, cap_class, end_at(sort: Desc)])
  @@map("diffusion_traces")
}

model LearnedPattern {
  id                String   @id @default(uuid())
  flow_pattern      String
  cap_class         String
  alpha             Float    @default(1)
  beta              Float    @default(1)
  sample_size       Int      @default(0)
  hits              Int      @default(0)
  brier_in_sample   Float?
  brier_out_sample  Float?
  brier_null        Float?
  alpha_30d         Float    @default(1)
  beta_30d          Float    @default(1)
  drift_z           Float    @default(0)
  status            String   @default("EXPLORATORY")
  last_updated      DateTime @updatedAt @db.Timestamptz

  @@unique([flow_pattern, cap_class])
  @@map("learned_patterns")
}

model LearningEvent {
  id           String   @id @default(uuid())
  occurred_at  DateTime @default(now()) @db.Timestamptz
  event_type   String
  ticker       String?
  outcome_id   String?
  flow_pattern String?
  cap_class    String?
  delta        Json
  message      String   @db.Text

  @@index([occurred_at(sort: Desc)])
  @@index([outcome_id])
  @@map("learning_events")
}

model LogisticEpoch {
  id            String   @id @default(uuid())
  epoch         Int
  recorded_at   DateTime @default(now()) @db.Timestamptz
  coefficients  Json
  intercept     Float
  brier_in      Float
  brier_out     Float
  sample_size   Int

  @@index([epoch(sort: Desc)])
  @@map("logistic_epochs")
}
```

## Scanner enrichment (no migration)

`SentimentSnapshot.community_data` is `Json` — extend the shape:

```ts
{
  // existing
  direction, quantity, quality, diffusion_gap,
  tier_breakdown: { mainstream, middle, niche },
  computed_at,

  // NEW additive fields
  highlights: [
    { community_name, community_type, engagement, engagement_count }
  ],
  market_cap,
  cap_class
}
```

`computeSentimentDimensions` is unchanged. The scanner just attaches the extra fields after computing dimensions. Existing readers (insights endpoint, dashboard) ignore unknown fields.

## Insights endpoint additions (`/api/insights`)

Strictly additive JSON fields:

```ts
{
  // existing fields untouched
  total_data_points, resolved_outcomes, thesis,
  diffusion_signals, outcome_log, signal_correlation,

  // NEW
  market_state: { open: boolean, label: string },
  pattern_library: [
    { flow_pattern, cap_class, alpha, beta, posterior_mean,
      ci_low, ci_high, sample_size, brier_in, brier_out, brier_null,
      drift_z, status, week_delta }
  ],
  live_diffusion_map: [
    { ticker, cap_class, flow_pattern, sparkline: { niche, middle, mainstream }[],
      logistic_score, logistic_ci_low, logistic_ci_high }
  ],
  engine_memory: [
    { occurred_at, event_type, ticker, flow_pattern, message }
  ],
  concept_drift: { worst_z, status: 'NORMAL'|'WARNING'|'ALERT' },
  null_check: { p_value: number, real_brier: number, null_brier: number },
  logistic_epoch: { epoch, coefficients: Record<string, {mu, sigma}>, intercept, brier_in, brier_out }
}
```

## Dashboard sections (`InsightsDashboard.tsx`)

Match existing Bloomberg-terminal aesthetic exactly: dark surface, semantic colors (`primary`/`secondary`/`tertiary`/`error`), `font-mono`, `tracking-[0.4em]` headers, thin `border-outline-variant/30` dividers.

### Section A — Header strip (extend existing)

5 tiles instead of 4. New tiles:
- **Concept Drift** — green `NORMAL`, amber `WARNING`, red `ALERT`. Numeric `drift_z` shown.
- **Null Check** — `p < 0.01` ✓ or `noise` ✗. Real Brier vs null Brier.
- **Market State** — `OPEN · REGULAR SESSION`, `CLOSED`, `PRE-MARKET`, `AFTER-HOURS` from `market-status.ts`.

### Section B — Pattern Library (NEW, primary surface)

12-cell grid (`flow_pattern × cap_class`). Each cell:
- Posterior mean (large mono numeric)
- 95% credible interval bar (thin horizontal)
- `n=23` sample size
- Week-over-week delta (`▲4` / `▼2` / `—`)
- Status pill (`ACTIVE` secondary, `EXPLORATORY` outline, `DEPRECATED` error)

### Section C — Live Diffusion Map (NEW)

Small-multiples grid for tickers currently classified `niche_leads`. Each card:
- Ticker symbol + cap class
- 3-line sparkline of niche/middle/mainstream engagement (last 4 cycles, ~12 days)
- Logistic score with CI: `P(7d alpha) = 0.68 [0.49–0.83]`

### Section D — Engine Memory feed (NEW)

Terminal-style log, last 10 `LearningEvent` rows. Monospace, fade-in on new entries. Auto-generated English summaries for `cycle_summary` events via AI SDK in the cron.

### Section E — Outcome Log (extend existing)

Add two columns:
- `Pattern` — flow_pattern label
- `Edge` — excess return vs SPY (`+2.1% vs +0.4%`)

## Market-hours considerations

- All crons run pre-market or post-close (UTC schedule). No interference with trading hours.
- `regularMarketPrice` returns last regular-session close — robust to weekends/holidays.
- SPY closes use `yahooFinance.chart('SPY', period1, period2)` which auto-skips non-trading days.
- 7d follow-up tolerance is `±0.6 days`, gives 14h slack — handles holidays cleanly.
- Dashboard market-state badge updates client-side every minute via the existing `setNow` interval.

## Idempotency

Re-running the learn cron on the same day must not double-count. Achieved via:
```sql
PriceOutcome WHERE days_after = 7
  AND created_at > now - 24h
  AND id NOT IN (SELECT outcome_id FROM learning_events WHERE outcome_id IS NOT NULL)
```

`LearningEvent.outcome_id` is the durable record of "this outcome has been incorporated." Indexed.

## Backfill

First learn-cron run (when `LearnedPattern` table is empty) processes every existing `PriceOutcome` with `days_after=7` regardless of age. After that, daily cron only processes the last 24h.

## Retention

`LearningEvent` rows older than 90 days are deleted at the end of each cron run. Posterior tables (`LearnedPattern`, `LogisticEpoch`) are not pruned — they ARE the engine state.

## Cost / capacity

- Vercel cron count: existing 2 → 3. Requires Pro plan (already required for `maxDuration: 300`).
- Yahoo Finance: +1 SPY chart call per learn cron run. Negligible.
- Neon DB: 4 small new tables. `LearningEvent` retention bounds growth.
- Compute: O(N_outcomes_per_day × small constant). <2s per run.

## Implementation order

| Commit | Files | Verifies |
|---|---|---|
| 1 | schema.prisma, migration SQL, lib/diffusion-trace.ts, lib/learning.ts, scanner enrichment, vitest tests | Pure functions correct |
| 2 | api/cron/learn/route.ts, api/insights/route.ts (additive), vercel.json | Cron runs end-to-end with backfill |
| 3 | InsightsDashboard.tsx (5 new sections), Playwright e2e | UI renders correctly |

Each commit is reversible. After commit 2 the engine is live and learning silently. Commit 3 surfaces the learning visually.

## What this is NOT

- Not an "AI agent" — math is plain Beta-Bernoulli + Laplace approximation
- Not a model retrain — online updates only
- Not new infrastructure — same Firecrawl, yahoo-finance2, Neon, AI SDK, +1 cron
- Not a schema-breaking change — 4 new tables, additive `community_data` fields

## What it IS

- A genuinely self-supervised research engine that updates its beliefs from outcomes
- Posteriors with credible intervals, out-of-sample validation, adversarial null tests, drift detection — all on the dashboard
- Visible proof that the model is alive: every day the Engine Memory feed has new entries
