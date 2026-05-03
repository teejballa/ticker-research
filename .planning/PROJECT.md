# Cipher — Ticker Research Assistant

## What This Is

A financial research tool that takes a ticker symbol, confirms the correct stock via chart preview, gathers comprehensive data (market data, news, fundamentals, insider/institutional flows, public sentiment), and produces a structured, source-backed research report with self-calibrating priors learned against SPY.

## Core Value

Given a ticker, return a clear, evidence-backed research report with transparent reasoning, traceable sources, and priors that improve over time as the engine learns which signals produce SPY-relative alpha.

## Requirements

### Validated

- [x] User can enter a ticker, confirm via chart preview, and receive a full structured report
- [x] Report sections: Ticker Overview, Market Sentiment, Bullish/Bearish Signals, Buy/Hold/Sell + confidence, Forward Outlook, Sentiment Intelligence, Community Intelligence, Engine Calibration, Sources
- [x] Multi-source market data (yahoo → finnhub → polygon, field-level merge with origin attribution)
- [x] Gemini reasoning via Vercel AI Gateway with Zod-validated AnalysisResult shape
- [x] Diffusion Learning Engine: SentimentSnapshot → price-followup → Bayesian LearnedPattern priors injected as Engine Calibration block
- [x] Technical Analysis as a parallel signal class (Phase 16) with multi-horizon outcomes (3/7/14/30/60/90d)
- [x] Institutional & Insider intelligence (Phase 17) — 13F + Form 4 ingested with Yahoo-primary, real EDGAR fallback
- [x] NextAuth (Google) identity, Neon Postgres persistence, per-user report history

### Active (v1.0 close-out)

- [ ] Phase 10 plan 10-04 — supplementary fallback smoke test rescoped to current pipeline (Gemini path, no Python)
- [ ] Phase 17 UAT — Test 11 (30-day deep gate) + Test 12 (production deploy verify)

## Context

The system is a pure-TypeScript pipeline running entirely on Vercel:

- **Data Collection** (`src/lib/data/`): parallel fetchers for market data (yahoo + finnhub + polygon), news (Anthropic web search), sentiment (StockTwits + options), community (Firecrawl), and institutional/insider (Yahoo + SEC EDGAR)
- **Reasoning** (`src/lib/gemini-analysis.ts`): Gemini via Vercel AI Gateway, Zod-validated, with Engine Calibration priors injected at prompt time
- **Learning Engine** (`src/lib/learning.ts` + 3 crons): scan → outcome → Bayesian update of LearnedPattern priors per (signal_class × pattern_key × cap_class × horizon_days)
- **Persistence**: Neon Postgres via Prisma; NextAuth Google for identity; per-user report scope
- **Deployment**: Vercel Functions + Crons; AI Gateway for Gemini; no container infrastructure

## Constraints

- **Architecture**: Maintain separation between data collection, prompt assembly, model reasoning, and rendering
- **Source-grounded reasoning**: LLM never invents data — conclusions reference retrieved sources
- **Storage**: Never commit generated research artifacts to the repo
- **Deployment**: Vercel-native; no containers, no Python in the runtime path

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Gemini via Vercel AI Gateway | No separate provider key; unified billing; Zod-validated output | Phase 12 |
| Field-level merge across yahoo/finnhub/polygon | Partial data from primary supplemented (not replaced) by fallbacks; per-field source attribution | Phase 10 |
| Diffusion learning engine with Bayesian priors | Reports self-calibrate against SPY-relative alpha rather than reasoning from generic logic | Phase 15 |
| Technical analysis as parallel signal class | Same scan→outcome→posterior loop as sentiment; multi-horizon (30d primary) | Phase 16 |
| Yahoo-primary + EDGAR fallback for institutional/insider | Yahoo gives broad coverage cheaply; EDGAR is authoritative for the long tail | Phase 17 |
| NextAuth (Google) for identity | Single-provider OAuth; Report.user_id scopes per-user history | Phase 5/6 |
| Decommission container/Python reasoning | Pure TypeScript pipeline removes infra complexity, latency, and a third-party dependency | Phase 12 |

## Current State (post v1.0)

**Shipped:** 2026-05-03 — v1.0 archived in `.planning/milestones/v1.0-ROADMAP.md`. Live at **ciphersearch.app** on Vercel. Pure-TypeScript pipeline, 19,085 LOC, 17 phases, 461 commits over 49 days. Engine measurably learning (18 LearnedPattern cells, 2 ACTIVE, 87 PriceOutcomes, 70 LearningEvents).

**What works today:**
- Full report pipeline (data → Gemini → render) with 4 signal classes (diffusion, technical, institutional, insider)
- Diffusion Learning Engine closing the scan→outcome→posterior loop daily
- Engine Calibration block injected into every Gemini prompt with matching learned priors
- /insights dashboard with quad-class Pattern Library tabs
- 30-day primary horizon backed by 12-d Bayesian logistic regression (epoch=1, real training fires ~2026-05-26 when first 30d outcomes resolve)

**Honest v1.0 ceilings (all addressable in v1.1):**
- Beta posteriors weight all observations equally regardless of age — concept drift not yet defended against
- Bucket granularity is fixed and discrete — no hierarchical sharing between related buckets
- ACTIVE cells show 0% Brier lift vs null model at current N — calibration ≠ predictive lift
- Reasoning quality capped by Gemini — only the priors fed in improve, the reasoner is frozen
- Watchlist coverage is fixed — engine only learns from tickers it has scanned
- 0/10 recent reports hit a calibrated cell — pattern-matching coincidence will improve as more cells go ACTIVE across more buckets

---

## Next Milestone — v1.1: Learning Engine Excellence

**Theme:** Take the v1.0 Diffusion Learning Engine from "alive and learning" to *genuinely impressive ML* — with measurable Brier lift, drift defenses, hierarchical sharing, regime awareness, and a feedback path that visibly improves report quality the longer Cipher runs.

**Goal:** Make the engine **optimal, impressive, actually working, and innovative in the ML department** — both as a research product and as a defensible technical artifact you can point to and explain end-to-end.

### Candidate v1.1 Phases (to be formalized via `/gsd-new-milestone`)

**Group A — Core ML quality (the "infinitely better" path)**

- **Phase 18: Time-decayed Bayesian updates.** Add exponential decay to LearnedPattern observations (recent samples weighted more, old samples decay). Defeats concept drift. Drives `drift_z` from a logged metric to an active gating signal. Effective sample size becomes the cell's currency.
- **Phase 19: Hierarchical priors (partial pooling).** Related buckets share information via a shared parent prior — `consolidation/large_cap/3d` borrows strength from `consolidation/mid_cap/3d` etc. Defeats granularity fragmentation. Sparse cells learn faster.
- **Phase 20: Market-regime feature.** Add a regime label (bull/bear/chop, rate-cycle, vol-regime) to the cell key so 2026-bull patterns don't contaminate 2028-bear posteriors. Regime detector via macro indicators + VIX bucketing.
- **Phase 21: Lift-driven cell promotion.** Today ACTIVE = sample_size + brier_in_sample threshold. Add Brier-lift-vs-null as the actual promotion gate, with `out-of-sample` validation via temporal CV. ACTIVE cells then *guarantee* lift, not just calibration.

**Group B — Engine impact on reports**

- **Phase 22: Multi-cell prior composition in the prompt.** Today the calibration block surfaces 4 cells (one per signal class). Compose them via the trained logistic regression into a single composite-signal probability with credible interval, surfaced as the headline number. Reasoning becomes "the composite signal says X with Y confidence" — directly checkable against outcomes.
- **Phase 23: Counterfactual reasoning in reports.** Inject "if this signal had been absent, the prior would shift from A to B" into the prompt — Gemini explains *why* the calibration moved the thesis, not just that it did. Educational + auditable.

**Group C — Coverage & evidence growth**

- **Phase 24: Adaptive watchlist.** Replace the fixed rotating watchlist with one that targets undersampled cells — explore-exploit on which buckets to populate. Sparse cells get scanned more aggressively until threshold sample size is reached.
- **Phase 25: Backfill from historical price data.** For any signal class with deterministic features (technical patterns), backfill 5+ years of historical SentimentSnapshots + PriceOutcomes against historical SPY data. Bootstraps thousands of observations per cell instead of waiting weeks.

**Group D — Demonstrability**

- **Phase 26: Live engine performance dashboard.** A new tab on `/insights` that shows actual Brier lift over time, % reports using ACTIVE priors, top-performing cells, drift detection alerts, and a daily "engine learned X new things" feed. Makes the learning visible to non-experts.
- **Phase 27: Public research log + transparency.** Publish a per-report "calibration trail" — what priors fired, what the engine predicted, what actually happened, ongoing accuracy stats. This becomes the differentiator: every Cipher report has receipts.

**Phase 28+: TBD via `/gsd-new-milestone` — likely v1.2 candidates**

### Why this is the right v1.1 scope

- **Provable.** Brier-lift, drift-z, and out-of-sample CV are testable. v1.1 will end with hard numbers on whether the engine is materially better than baseline.
- **Differentiating.** "AI ticker research" is a crowded space. "AI ticker research with a Bayesian learning loop, regime-aware priors, hierarchical pooling, and public calibration trails" is genuinely a research artifact.
- **Compounding.** Each phase makes the next one easier. Hierarchical priors make sparse cells learn faster, which makes adaptive-watchlist cheaper, which makes regime-aware learning faster, which raises Brier lift across the board.
- **Honest.** Avoids over-promising "infinite improvement" while building the actual mechanisms that get closer to it (drift defense, hierarchical pooling, regime awareness, lift-gated promotion).

### v1.1 Definition of Done

- ≥1 cell with measurable Brier-lift > 5% on out-of-sample data
- Drift detector down-weighting > 30-day-old observations in production
- Hierarchical pooling demonstrably accelerating sparse-cell learning (vs control)
- Engine performance dashboard live at `/insights` with daily learning feed
- Per-report calibration trail published

---

<details>
<summary>Pre-v1.0 PROJECT.md (history)</summary>

The pre-pivot description (NotebookLM as reasoning engine, Daytona container, 4-phase roadmap) is preserved in `.planning/milestones/v1.0-ROADMAP.md`. The current document is the post-Phase-17 architecture.

</details>

---
*Last updated: 2026-05-03 — v1.0 archived, v1.1 vision drafted.*
