# Project Overview

This project builds **Cipher** — a deployable Ticker Research Assistant that
analyzes financial tickers and generates structured, source-based research reports.

The system evaluates financial data and produces:

- Market sentiment analysis (bullish / neutral / bearish + reasoning)
- Buy / Hold / Sell guidance with confidence level
- Bullish and bearish signals tied to sources
- Forward outlook + price target context
- Community Intelligence (Reddit / X / forums via Firecrawl)
- Engine Calibration — historical alpha-vs-SPY priors injected into the prompt

The goal is to allow a user to input a ticker symbol and receive a clear,
structured research report with transparent reasoning and traceable sources.

---

# Core Design Principles

1. **Source-grounded reasoning** — conclusions must reference retrieved data, not model assumptions.
2. **Modular pipeline** — data collection, prompt assembly, model reasoning, and rendering are independently testable.
3. **Self-improving thesis** — the diffusion learning engine accumulates priors per
   `(sentiment_type × cap_class × direction)` and injects them into every report.
4. **Scalable deployment** — primary target is a Vercel-hosted multi-user web app.

---

# System Architecture (current — post-Phase 12)

The reasoning layer is a pure-TypeScript pipeline. There is no Python, no container,
and no external notebook engine — the previous container-based stack was decommissioned
in Phase 12 (2026-04-15).

## Data Collection Layer (`src/lib/data/`)

Parallel fetchers feed a single `SourcePackage`:

- **yahoo-finance2** — primary market data + fundamentals (price, volume, 52w range, P/E, EPS, revenue, market cap)
- **Polygon** + **Finnhub** — fallback fields when Yahoo returns null. Field-level merge in `merge.ts` — first non-null wins. Each field carries a `FieldOrigin` (`yahoo` | `finnhub` | `polygon`).
- **Anthropic web search** (`anthropic-search.ts`) — news, SEC filings, analyst commentary, social sentiment
- **StockTwits API** + **yahoo-finance2 options** — bull/bear percentages and put/call ratio
- **Firecrawl** — community intelligence (Reddit / X / forums); Haiku-driven URL discovery

Output: `SourcePackage` JSON written to `/tmp/source-package-<ticker>.json`.

## Reasoning Layer (`src/lib/gemini-analysis.ts`)

- Uses Gemini via the **Vercel AI Gateway** (no separate provider key required in production).
- Reads the SourcePackage, formats it via `research-brief.ts` into a structured prompt, and calls Gemini with a Zod schema for the `AnalysisResult` shape.
- Injects **Engine Calibration Context** — the matching learned prior (alpha-vs-SPY) for the ticker's diffusion regime, looked up via `engine-context.ts`. Numbers in the prior are post-process overwritten so the LLM can't drift them.

## Diffusion Learning Engine (`src/lib/learning.ts` + crons)

Three Vercel cron jobs (configured in `vercel.json`):

1. `/api/cron/sentiment-scan` — sweeps the rotating watchlist, writes `SentimentSnapshot` rows
2. `/api/cron/price-followup` — closes the prediction loop at 3/7/14 days, computes alpha vs SPY
3. `/api/cron/learn` — Bayesian update of `LearnedPattern` priors

Surfaced via `EngineCalibrationPanel` in `/research/[ticker]` and the `InsightsDashboard` at `/insights`.

## Persistence

- **Neon Postgres** via Prisma (`@prisma/adapter-neon` singleton in `src/lib/db.ts`)
- **NextAuth** (Google provider) for identity; `Report.user_id` scopes per-user history

## Deployment

- **Vercel** for everything — Functions for API routes, Crons for the learning engine, Neon for storage, AI Gateway for Gemini.
- No container infrastructure. `DEPLOYMENT_MODE=web` switches the app from local-Filesystem persistence to Neon.

---

# System Data Flow

```
User → Vercel-hosted Next.js UI
  → POST /api/research/[ticker]
      → parallel fetch: yahoo + finnhub + polygon + anthropic web search
                       + stocktwits + options + firecrawl community
      → field-level merge (yahoo → finnhub → polygon)
      → SourcePackage JSON → /tmp/source-package-[ticker].json
  → POST /api/analysis/[ticker]
      → runGeminiAnalysis(pkg)
          → engine-context lookup → Engine Calibration block
          → research-brief → prompt
          → Gemini via AI Gateway (Zod-validated AnalysisResult)
      → writeReportToDb (web mode) or local file (local mode)
      → SSE stream of progress + final RESULT to client
  → /research/[ticker] renders ResearchReport + EngineCalibrationPanel
  → User downloads PDF via browser print
```

---

# Research Output Storage

In web mode, reports are persisted in Neon (`Report` table, scoped by `user_id`).
In local mode, reports are written to `~/.cipher/reports/`. **Do not commit
generated research artifacts** (PDFs, sample reports) to the repo.

---

# Development Roadmap (high level)

Detailed roadmap lives in `.planning/ROADMAP.md`. Current state:

- **Phases 1–9, 11–15: complete.** Data pipeline, multi-cap watchlist, Gemini reasoning, Firecrawl community, StockTwits, options sentiment, Forward Outlook, DB QA, Diffusion Learning Engine.
- **Phase 10:** field-level merge layer + UI source attribution shipped.
- **Phase 16: Technical Analysis** — context document only, plans pending.
- **Phase 17: Institutional & Insider Intelligence** — context document only, plans pending.

---

# UHS Independent Study (Spring 2027)

This codebase is also the experimental substrate for a half-credit, project-style **Independent Study at San Francisco University High School** during the Spring 2027 semester. Any work happening in this repo during that semester contributes to the IS deliverables. Sessions touching this codebase should keep the IS framing in mind. Engineering work should advance one of the syllabus milestones below, and any progress that maps to a weekly deliverable should be flagged so the vault tracker can be updated.

**Source-of-truth files (in TJ's Obsidian vault, `~/Desktop/Cowork Prod SB/`):**
- `Projects/Ticker Research/cipher-IS-syllabus.md`: live 16-week semester tracker with progress table and session log. **Update this when weekly deliverables ship.**
- `Projects/Ticker Research/cipher-independent-study.md`: pre-submission application tracker (sponsor signoff, paragraph, form submission).

## Essential Questions

1. Can AI stock research be made reliable, so it never makes things up, by forcing it to back every claim with a real source?
2. Can a learning engine that updates from its past calls actually predict whether a stock will move up or down in the short term, using a mix of news, analyst ratings, social posts, SEC filings, technicals, and institutional flows?
3. How do you fairly test an AI that gives judgments (Buy / Hold / Sell) instead of a number you can just score?
4. Does this actually work, or do the people who say markets are too efficient to beat have a point?

## Learning Objectives

By the end of the semester, I'll be able to: (a) build a backtesting system that fairly checks how well an AI's stock calls actually hold up over time, including testing on data the system never saw; (b) use real statistical methods like hit rate, calibration curves, and source attribution to measure how good an AI's judgment calls actually are; (c) write a technical paper explaining the system, the methods I used, and what I found; (d) defend my own view on whether AI can do useful stock research, taking on both the AI-in-finance crowd and the efficient-markets crowd.

(The full 16-week weekly schedule lives in the vault. See source-of-truth files above. It's not duplicated here to keep this file clean.)

## Implications for engineering work in this repo

- The **backtesting and evaluation harness** (Weeks 2–7) is the highest-priority new infrastructure. Treat it as production code, not throwaway scripting. Likely lives in `src/lib/evaluation/` and `src/lib/backtest/`, with its own Vitest suites and a runbook in `docs/`.
- **Hit rate, calibration curves, and signal attribution outputs** must be reproducible from raw historical data. No hand-curated intermediate files. The harness should run from a single command.
- The **new feature in Week 13** is open-ended (Schwab brokerage integration, portfolio-level analysis, or sector-relative labeling). Decision deferred until Week 12; whichever feature ships must be production-quality on ciphersearch.app, not a feature branch.
- Weeks 14–16 are **testing-only**, with no new features during this window. Any engineering work during these weeks must be in service of validation, reproducibility, or bug fixes surfaced by the test runs.
- The **technical paper** (Weeks 8–14) is a deliverable in its own right and may live under `docs/paper/` or as a separate document. Discuss with sponsor at Week 8 outline review.

---

# Statistical-Methods Reference (CS229 + ISL)

The evaluation harness, the diffusion learning engine, and the IS technical paper are all grounded in two external references. Consult these before adding metrics, redesigning the backtest, defending methodology, or arguing for / against a modeling choice. Cite them in `docs/paper/` rather than inventing methodology from scratch.

- **CS229 main notes (Stanford)** — <https://cs229.stanford.edu/main_notes.pdf> — full course notes covering supervised learning, GLMs, generative classifiers, kernels, bias-variance, Bayesian methods, EM, info theory, and evaluation. Section ordering follows the CS229 syllabus (verified Summer 2019 syllabus topic list).
- **An Introduction to Statistical Learning, 2nd ed.** — <https://www.statlearning.com> — free PDF. 13 chapters; chapters most relevant to Cipher confirmed below.

## Map: Cipher need → reference

| Cipher need | CS229 topic | ISL chapter |
|---|---|---|
| Train / val / test split, generalization | "Setting of Supervised Learning" | Ch. 2 — Statistical Learning |
| Bias-variance tradeoff & overfitting | "Bias-Variance and Regularization" | Ch. 2 |
| Cross-validation, time-series / walk-forward CV | "Bias-Variance and Regularization" | Ch. 5 — Resampling Methods |
| Bootstrap, confidence intervals on hit-rate / alpha | "Bias-Variance and Regularization" | Ch. 5 |
| Logistic regression for Buy/Hold/Sell probabilities | "Discriminative Classifiers" | Ch. 4 — Classification |
| Confusion matrix, ROC, AUC | "Evaluation Metrics" | Ch. 4 |
| Probability calibration (Platt, isotonic, reliability diagrams) | "Evaluation Metrics" + "Information Theory" | Ch. 4 |
| Proper scoring rules — log loss, Brier score, KL | "Information Theory" | Ch. 4 |
| Ridge / Lasso shrinkage for sparse-cell priors | "Bias-Variance and Regularization" | Ch. 6 — Linear Model Selection and Regularization |
| MLE / MAP / Bayesian updating of `LearnedPattern` | "Bayesian Methods" | Ch. 4 (Bayes classifier) |
| Multiple-testing correction across regime cells | — | Ch. 13 — Multiple Testing |
| Tree / ensemble baselines to compare the LLM against | — | Ch. 8 — Tree-Based Methods |

## Load-bearing rules (do NOT violate without explicit justification)

1. **Time-series CV, never random k-fold.** Random k-fold leaks future information into training (ISL Ch. 5). The backtest harness must use forward-chaining / walk-forward splits: train on `(t₀, tₖ]`, evaluate on `(tₖ, tₖ₊ₙ]`, advance, repeat. Anything else is lookahead bias and invalidates the IS paper.
2. **Calibration is a first-class metric, not an afterthought.** A "70% Buy" call should be right ~70% of the time. Report reliability diagrams + Brier score *alongside* hit rate. Hit rate alone is gameable by always predicting the majority class.
3. **Every reported number gets a confidence interval.** Hit rate, alpha-vs-SPY, calibration error — bootstrap-resample over the prediction set and report 95% CIs (ISL Ch. 5). Single-point estimates do not survive paper review.
4. **Priors must regress to a base rate.** `(sentiment_type × cap_class × direction)` cells with few observations are statistically noisy. Use a Beta-Binomial conjugate update (MAP under a Beta prior) so sparse cells shrink toward the global base rate — same logic as ridge regularization (CS229 "Bias-Variance and Regularization").
5. **Multiple-testing correction is mandatory before regime claims.** With ~26 cells × 3 horizons × N tickers, naive p-values inflate false-positive rates. Apply Bonferroni or Benjamini–Hochberg FDR (ISL Ch. 13) before claiming any cell "works".
6. **Feature-leakage audit at every data-source addition.** Every feature in `SourcePackage` must be tagged with the as-of-time it would have been knowable at decision time. Any new fetcher in `src/lib/data/` must document its timestamp semantics before being added to the backtest input.
7. **Probabilistic decisions are scored with proper scoring rules.** For Buy/Hold/Sell with confidence, prefer log loss or Brier over raw accuracy — they reward calibrated confidence and punish overconfident wrong calls (CS229 "Information Theory").
8. **Always have a non-LLM baseline.** A logistic regression on the same features (ISL Ch. 4) and/or a gradient-boosted tree (Ch. 8) must be benchmarked alongside the Gemini pipeline. "The LLM is better than nothing" is not a defensible claim; "the LLM beats logistic regression on calibrated Brier score by X with bootstrap CI [Y, Z]" is.

## Where this lives in code (planned modules)

- `src/lib/evaluation/calibration.ts` — reliability diagrams, Brier, log loss
- `src/lib/evaluation/significance.ts` — bootstrap CIs, BH-FDR correction
- `src/lib/backtest/walk-forward.ts` — time-series CV split generator
- `src/lib/backtest/baselines.ts` — logistic / tree baselines for head-to-head comparison
- `docs/paper/methodology.md` — methodology section of the IS paper; cite CS229 + ISL by chapter here

If any of these files already exist, extend them; do not create parallel modules.

---

# Development Guidelines for AI Agents

1. Maintain a clean separation between data collection, prompt assembly, model reasoning, and rendering.
2. Prefer modular fetchers; new data sources go in `src/lib/data/` with their own unit tests.
3. Source retrieval comes before analysis — the LLM should never invent data.
4. Vitest for units (`npm test`), live-DB integration tests (`npm run test:integration`), Playwright for e2e (`npm run test:e2e`).
5. Never store generated research artifacts inside the repository.

---

# Expected Report Sections

1. **Ticker Overview** (with security-type badge)
2. **Market Sentiment** + reasoning
3. **Bullish / Bearish Signals** (each tied to a source)
4. **Buy / Hold / Sell Assessment** + confidence
5. **Forward Outlook** + price target context
6. **Sentiment Intelligence** (StockTwits + put/call)
7. **Community Intelligence** (Firecrawl-scraped public discussion)
8. **Engine Calibration** (learned prior alignment / disagreement)
9. **Sources Used**

All conclusions should reference their supporting source where possible.

---

# Long-Term Vision

A personal AI financial research assistant that calibrates itself against
the market over time. Future capabilities under planning:

- Technical analysis layer (Phase 16)
- Institutional + insider intelligence (Phase 17)
- Expanded sentiment niches via Firecrawl

Priorities: transparency, modularity, user-owned research history, and scalable deployment.
