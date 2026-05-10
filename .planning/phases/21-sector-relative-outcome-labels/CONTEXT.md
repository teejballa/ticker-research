# Phase 21 — Sector-Relative Outcome Labels

> **Status:** Context written 2026-05-10. Phase not yet planned (run `/gsd-plan-phase 29`).
>
> **TL;DR:** Switch Cipher's primary outcome label from `alpha-vs-SPY` to
> `alpha-vs-sector-ETF`. Keep SPY-alpha as a secondary diagnostic. This
> aligns Cipher with the literature consensus across event-study academia,
> practitioner quant evaluation (Quantopian / AQR / RavenPack), ML-finance
> label construction, and signal-specific (insider / sentiment / chart-pattern)
> empirical work.

---

## 1. Problem Statement

Cipher's diffusion engine currently grades every prediction as a
**hit** when the stock beat the S&P 500 by ≥1% over the horizon (3, 7, 14,
30, 60, or 90 days). This is the `isHit()` rule in `src/lib/learning.ts`
and the `pct_change` computation in `/api/cron/price-followup`.

**The flaw:** SPY-alpha rewards a signal for happening during a sector
rotation. If a chart-pattern fires on NVDA during a semis rally, every
chip stock ripped together — SPY-alpha credits the signal even though the
signal's information content was zero. The Beta posteriors then
*overestimate* the cell's predictive power, and the engine's stated
beliefs become overconfident.

This was surfaced by the question: *"Why are we measuring everything
against the S&P? Shouldn't we be looking at what kinds of signals affect
the specific stock?"*

## 2. Research Synthesis (4-agent parallel run, 2026-05-10)

Four parallel research agents — academic literature, practitioner methods,
modern ML-for-finance, and sentiment/technical signal-specific —
**independently converged on the same recommendation**. No agent
recommended pure SPY-alpha as the primary label.

### 2.1 Convergent finding: sector-relative is the literature consensus

| Domain | Source | Benchmark used |
|---|---|---|
| Event-study academia | Brown & Warner 1985; MacKinlay 1997; Kothari & Warner 2007 | Market-model abnormal returns (β-adjusted), not raw SPY |
| Factor research | Daniel-Grinblatt-Titman-Wermers (DGTW) 1997 | 125 size × book-to-market × momentum characteristic portfolios |
| Insider signals | Lakonishok & Lee 2001; Cohen-Malloy-Pomorski 2012 | Size × book-to-market portfolios + FF4 alphas |
| Institutional / 13F | DGTW characteristic benchmarks | Same |
| Sentiment | Tetlock 2007; Antweiler & Frank 2004; RavenPack | FF5+momentum or sector-neutralized factor portfolios |
| Chart patterns | Lo-Mamaysky-Wang 2000; Park & Irwin 2007 | Conditional vs unconditional return distribution of the same ticker |
| ML for finance | Gu-Kelly-Xiu 2020; López de Prado 2018; Qlib | Excess return over RF + sector neutralization; not SPY |
| Practitioner platforms | Quantopian Alphalens; QuantConnect docs; Numerai Signals | Universe-relative IC; benchmark-appropriate ETF; residualized target |

**Quote (Quantopian/QuantConnect docs):**
> "An algorithm that trades commodity ETFs should pick a benchmark of a
> popular commodity ETF; a fixed-income algorithm should pick a
> fixed-income ETF."

**Quote (Lakonishok & Lee 2001):** SPY-style benchmarks are wrong for
insider work because insiders systematically tilt to small-cap value.
Their headline 7.8% gross outperformance shrinks to 4.8% after
size × book-to-market control.

### 2.2 Secondary findings (deferred to future phases)

- **Information Coefficient (Spearman rank-IC)** is the academic-preferred
  evaluation metric over hit-rate. `IC ≈ 2·HitRate − 1` for a balanced
  binary classifier — hit-rate is a coarse binarization of IC.
- **Triple-barrier labels** (López de Prado 2018) with volatility-scaled
  barriers are more statistically defensible at short horizons (3-7d)
  than fixed-threshold labels.
- **Hierarchical sector pooling** — partial-pool sparse sector cells
  toward a sector-aggregate prior. Cipher already has hierarchical
  pooling by `cap_class` (Phase 19-A-07); extending to sector is a
  separate phase.
- **Conditional-vs-unconditional return distribution** (Lo-Mamaysky-Wang)
  for chart patterns specifically — a deeper change than sector-relative
  alpha and out of scope here.

These are explicit non-goals for Phase 21. Phase 21 ships the highest-ROI
upgrade (sector-relative primary label) and defers the rest.

## 3. Architectural Implications

### 3.1 The Bayesian math doesn't change

`LearnedPattern` Beta(α, β) posteriors keep the same update rule. Only
the *definition of a hit* — the input to the update — changes. This is
the Bayesian equivalent of "replay the tape with a new judge."

### 3.2 Posteriors will compress toward 0.5

Sector-relative returns have lower variance than SPY-relative (most stocks
move with their sector). So:
- Hit-rates will compress toward 0.5
- Credible intervals will widen
- The engine becomes *less confident, more honest*

This is the literature's whole point: the engine is currently overconfident
because it credits sector beta as signal skill.

### 3.3 Migration is mechanical, not architectural

1. **Prisma migration** — additive columns on `PriceOutcome`:
   - `sector_etf` (TEXT) — the ETF used at prediction time
   - `forward_return_raw` (DOUBLE PRECISION) — absolute pct_change
   - `forward_return_sector_rel` (DOUBLE PRECISION) — alpha vs sector ETF
   - Existing `pct_change` (currently alpha-vs-SPY) stays for backward
     compatibility and becomes the "vs market" secondary diagnostic.

2. **Ticker → sector ETF map** — `src/lib/data/sector-mapping.ts`:
   - Pulls `quoteSummary.sector` from yahoo-finance2
   - Maps to SPDR sector ETF (XLK/XLF/XLE/XLV/XLY/XLP/XLI/XLU/XLB/XLRE/XLC)
   - **Snapshots at prediction time** (writes to `sector_etf` column on
     PriceOutcome creation) to avoid reconstitution drift (e.g., META
     moved from XLK to XLC in 2018)
   - Falls back to SPY when sector is unknown (large-cap defaults; small-cap
     biotech without XLV-equivalent stays SPY-relative for now)

3. **Backfill cron** — `/api/cron/relabel`:
   - One-shot route, idempotent
   - Walks every `PriceOutcome` row, looks up the ticker's sector at
     `Report.analyzed_at` (or `SentimentSnapshot.scanned_at`), pulls
     cached sector ETF prices over the same window, computes
     sector-relative return, writes the new columns
   - Logs counts: scanned / labeled / skipped (no sector / no cached prices)

4. **Forward path** — update `/api/cron/price-followup`:
   - On outcome creation, compute and store all three labels (raw, vs-SPY,
     vs-sector)

5. **`learning.isHit()` change** — primary label flips:
   ```ts
   // Before
   const isHit = pct_change > 1.0;
   // After
   const isHit = (forward_return_sector_rel ?? pct_change) > 1.0;
   ```
   Keep SPY-alpha as fallback when sector mapping is unavailable.

6. **Relearn pass** — manually trigger `/api/cron/learn` after backfill
   completes. Beta posteriors recompute from the relabeled history. No new
   data collection needed.

7. **UI**:
   - `EngineCalibrationPanel` — primary number is sector-relative; SPY-alpha
     surfaced as a smaller "vs market" diagnostic underneath
   - `/insights` Overview tab — plain-English copy switches from "the stock
     beat the S&P 500" to "the stock beat its sector"
   - `EngineThesis.narrative` regenerated post-relearn

## 4. Scope and Non-Goals

### In scope (Phase 21)
- Schema migration + backfill cron + forward path
- `isHit()` switch + full relearn pass
- UI primary/secondary swap + plain-English copy update
- Tests: backfill correctness, label semantics, UI rendering with both
  labels co-existing during migration

### Explicit non-goals
- Rank-IC per cell — future phase
- Triple-barrier labels — future phase
- Hierarchical Bayesian sector pooling — future phase (extends 19-A-07)
- Conformal prediction intervals on returns — future phase
- Lo-Mamaysky-Wang conditional-distribution evaluation for chart patterns
  — future phase

## 5. Verification Criteria

A successful Phase 21 ships when:
- [ ] Every `PriceOutcome` row has non-null `sector_etf` (or documented
      reason for fallback to SPY)
- [ ] Every `PriceOutcome` row has non-null `forward_return_sector_rel`
      (or SPY fallback)
- [ ] `learning.isHit()` primary path uses sector-relative; SPY-alpha
      reachable only as fallback
- [ ] Full relearn pass completes; `LearnedPattern.last_updated` advances
      for every cell with ≥1 outcome
- [ ] EngineCalibrationPanel renders sector-relative as the headline number
- [ ] `/insights` Overview tab copy reads "beat its sector" not
      "beat the S&P 500"
- [ ] Vitest suite green; typecheck clean

**Quantitative expectation** (sanity check, not pass/fail):
- Aggregate hit-rates across cells should compress toward 0.5 (most
  hit-rates currently 0.45-0.55 should move 0.05-0.10 closer to 0.5)
- Credible intervals should widen by 10-20% in most cells
- Direction of the headline thesis should not invert (top-family stays
  the top family with high probability, just less confident)

## 6. Sources (full citations)

**Academic event-study:**
- Brown & Warner 1985, *J. Financial Economics*
- MacKinlay 1997, *J. Economic Literature*
- Kothari & Warner 2007, *Handbook of Corporate Finance*

**Factor / characteristic benchmarks:**
- Daniel, Grinblatt, Titman & Wermers 1997, *J. Finance*
- Lyon, Barber & Tsai 1999, *J. Finance*

**Signal-specific:**
- Lakonishok & Lee 2001, *RFS* (insider)
- Cohen, Malloy & Pomorski 2012, *J. Finance* (insider)
- Tetlock 2007, *J. Finance* (sentiment)
- Lo, Mamaysky & Wang 2000, *J. Finance* (technical patterns)
- Park & Irwin 2007, *J. Economic Surveys* (technical analysis survey)

**Industry-leads-market:**
- Hong, Torous & Valkanov 2007, *JFE*

**ML for finance:**
- Gu, Kelly & Xiu 2020, *RFS* / NBER 25398
- López de Prado 2018, *Advances in Financial Machine Learning*
- Microsoft Qlib (GitHub) — Spearman rank-IC reference implementation

**Practitioner:**
- Quantopian Alphalens (GitHub)
- QuantConnect Algorithm Scoring docs
- Numerai Signals / Numerai Corr docs
- AQR — "Building a Better Equity Market Neutral Strategy"
- RavenPack — "Constructing a Sentiment Factor"
- Macrosynergy — "How to Measure the Quality of a Trading Signal"

---

*4-agent research synthesis preserved in conversation context 2026-05-10.
Full source URLs in agent transcripts.*
