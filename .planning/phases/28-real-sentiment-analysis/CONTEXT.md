# Phase 28 — Real Sentiment Analysis

**Status**: planning
**Created**: 2026-05-10
**Triggered by**: GME report showed `100% bullish` from StockTwits raw bull/bear tag count, which is unphysical. User asked: "is this how real sentiment analysis would do it?" Honest answer: no — what shipped in post-Phase-19 (Beta-smoothed multi-source aggregator) is one component of one stage of a real pipeline. Real systems do per-document NLP, source-tier weighting, time decay, aspect disaggregation, volume baselining, bot/coordination filters, and continuous calibration against realized returns. This phase brings Cipher's sentiment layer to industry baseline.

---

## Background — what real institutional systems do

Synthesized from RavenPack methodology whitepapers, LSEG MarketPsych fact sheets, the Loughran-McDonald 2011 paper, Tetlock 2007, FinBERT (Araci 2019), Cresci et al. on StockTwits bots (2019), Cookson & Engelberg's "Echo Chambers" (UCSD Rady), the Open FinLLM Leaderboard (FinOS/HF 2025), and ~20 other primary sources. Full citation list at the bottom.

### What we have today (post-Phase-19)

- StockTwits raw `bull%` tag count (vendor-tagged, not classifier-scored)
- Reputation-weighted re-aggregation of StockTwits messages by `log10(followers+1) + log10(post_count+1)` (Phase 19-C-03)
- ApeWisdom + Swaggystocks supplemental community signals (Phase 19-C-05)
- **Beta(α=5, β=5) cross-source aggregator** with WEIGHT_CAP=10K (post-19, just shipped)
- FinSentLLM ensemble scaffolding (FinGPT v3 + Mistral-Fin + FinBERT) — **HF endpoints not provisioned**, so it returns null sentinels
- Firecrawl scrape of WSB / r/stocks / r/SecurityAnalysis / r/algotrading / r/{TICKER} — passed to Gemini for qualitative tone narrative, but no per-document classification
- Diffusion learning engine that tracks `(sentiment_type × cap_class × direction)` priors and Bayesian-updates them against alpha-vs-SPY at 3/7/14d (Phases 12, 17, 19-A)
- Conformal CIs (19-A-03), CPCV (19-A-04), rolling-IC monitor (19-A-05), calibration harness (19-A-06)

### What real systems do that ours doesn't

| Gap | Real systems | Cipher today | Impact |
|---|---|---|---|
| **1. Per-document NLP** | Each article/post classified individually with FinBERT/FinGPT or domain LLM. RavenPack: emotionally-charged-word matching against expert-rated training stories, calibrated against intraday tick data. MarketPsych: 2,000 news + 800 social sites scored per-document. FinBERT hit ~97% on Financial PhraseBank, ~86% on noisier subset. Loughran-McDonald 2011 showed ~75% of "negative" words in Harvard IV-4 dictionary aren't negative in finance — generic sentiment is misleading on 10-Ks. | We trust StockTwits' user-self-reported bull/bear tag and treat ApeWisdom/Swaggystocks bull% as comparable. No per-message classification. | **HIGHEST** |
| **2. Source-tier weighting** | Reuters / Bloomberg / WSJ ≫ blog ≫ social. RavenPack and MarketPsych explicitly factor source authority and author credibility. | Single bull% blends all sources; no tier table. A Reuters earnings story is treated the same as a thousand WSB posts on fundamentals. | **HIGH** |
| **3. Time decay** | Exponential decay: half-life ~24h for retail chatter, ~3d for news, ~7-14d for SEC. RavenPack publishes a 90-day SMA factor. Tetlock's WSJ pessimism factor uses VAR lags showing pessimism predicts next-day returns then mean-reverts within a week. | None. A 30d-old StockTwits message counts the same as a 1h-old one. | **HIGH** |
| **4. Volume baselining** | RavenPack ships an Event Novelty Score (ENS) — repeated coverage of the same event is down-weighted. "Trending" is a z-score against a ticker's 30/90-day mention baseline, not raw count. | "Trending" = `Math.abs(stocktwits_sentiment_change) > 0.5`, a literal threshold on a vendor field. No ticker-specific baseline. | **MEDIUM-HIGH** |
| **5. Aspect/topic disaggregation** | Targeted Aspect-Based Financial Sentiment (TABFSA) — per-aspect polarity for `{earnings, guidance, regulatory, M&A, macro, product, management}`. Sentence-level averaging hides opposite signals (bullish-on-product + bearish-on-guidance). | None. Single headline number. | **MEDIUM** |
| **6. Dispersion / crowding metric** | Cookson & Engelberg (UCSD Rady): high StockTwits agreement is an **echo-chamber crowding signal**, not a thesis signal — and crowding predicts mean-reversion. Lucchini et al. 2022: GME WSB sentiment became a self-induced consensus during the squeeze. Kim/Ryu/Seo 2014 + Cen/Lu/Yang 2013: high dispersion + high sentiment predicts NEGATIVE future returns. | We report mean. Variance / agreement metric not surfaced. The 100% bull% on GME IS the crowding warning, but the UI shows it as a thesis-confirming number. | **HIGH** (this is THE specific GME 100% fix) |
| **7. Bot / coordination filters** | Cresci et al. 2019: ~6% of StockTwits accounts are signal bots; concentrated on low-cap tickers with manipulation events. Detection: text-pair cosine similarity > 0.5, "pump" phrases, >5 hashtags. Nam & Yang 2023: F1 = 0.67 on confirmed pump-and-dump from posts alone. | None. We ingest bull/bear pct as published. | **MEDIUM** |
| **8. Per-component IC calibration** | RavenPack tracks IC and long-short Sharpe per signal; degrades or down-weights signals that don't predict. Tetlock validated pessimism→returns via VAR with significance tests. | We run rolling-IC for the diffusion engine OVERALL (Phase 19-A-05). No per-input-source IC for sentiment specifically. We can't tell whether StockTwits, ApeWisdom, or Swaggystocks contributes signal vs noise. | **MEDIUM** |
| **9. Cross-platform agreement signal** | Context Analytics: combined Twitter + StockTwits S-Score long/short returned >80% in 2022 vs either alone. Reddit predicts abrupt vol shifts; Twitter predicts gradual reactions — complements not substitutes. | We compute a single aggregate but don't surface agreement as its own feature. | **MEDIUM** |
| **10. Calibration vs realized returns for sentiment specifically** | Modern picture: news sentiment effects survive 1-2 weeks; Twitter/StockTwits effects largely gone after 1 trading day, signal is crowded. ML papers: raw sentiment scores often lack robust standalone power but add value combined with price/volume. Plan for small effect (~10-30 bps/week long-short). | The diffusion engine validates the FULL thesis, not the sentiment field as a standalone feature. We don't know whether our sentiment number adds IC over price+volume baselines. | **MEDIUM** |

---

## Goal

Bring Cipher's sentiment layer to **industry baseline** — per-document classification, source-tier weighting, time decay, dispersion/crowding flags, volume baselining, bot filters, per-source calibration. The headline output for any ticker must be a **calibrated, dispersion-aware, time-decayed, source-weighted sentiment score** with a UI that distinguishes "consensus thesis" from "crowded echo-chamber" — fixing the specific failure mode where 100% bullish on a meme stock reads as a thesis confirmation rather than a crowding warning.

Definition of "industry baseline" for this phase = parity with the publicly-documented methodology of RavenPack and MarketPsych on the per-document, source-tier, time-decay, dispersion, and calibration dimensions. Aspect-based decomposition and bot detection are stretch targets within scope.

---

## Sub-plan structure

Three waves, ~13 plans total. Waves are roughly ordered by impact-per-engineering-hour for the specific 100%-bullish fix.

### Wave A — Quick wins (≤1 week, no infra dependency)

These ship the dispersion / crowding fix and the time-decay fix without needing HF endpoints or cross-source NLP infrastructure.

- **28-A-01 — Dispersion + crowding flag.** Compute `bull_pct_std` across {StockTwits, ApeWisdom, Swaggystocks} components AND Shannon entropy of bull/bear/neutral message tags within StockTwits. Surface a `crowded_consensus` boolean = `bull_pct > 90 AND mention_z > 5 AND author_diversity < 0.1`. UI: when set, render Sentiment Intelligence card with explicit "crowded consensus — historical base rate of mean-reversion within 14d" warning instead of trumpeting the high bull%.
- **28-A-02 — Volume baselining.** Persist 90d rolling mention count per ticker (cron). Compute z-score against trailing-30d mean+std on each fetch. Replace "TRENDING = sentiment_change > 0.5" with "TRENDING = mention_z > 2."
- **28-A-03 — Exponential time decay.** Apply per-message exponential decay weight (half-life 24h for StockTwits/Reddit, 72h for news, 7d for SEC) inside the cross-source aggregator. The Beta-smoothed weighted mean shipped in post-19 stays — this just multiplies each message's weight by its decay factor.
- **28-A-04 — Author-diversity ratio.** `unique_authors / total_messages` per ticker. Surface in the breakdown UI. Down-weight when <0.1 (likely bot / pump activity).
- **28-A-05 — Cross-platform agreement signal.** When ≥2 sources contributed, surface `agreement_score = 1 - bull_pct_std/50` ∈ [0,1] in the SentimentIntelligence shape. UI badge "MIXED · LOW AGREEMENT" when <0.5.

### Wave B — Per-document NLP (1-2 weeks, requires HF endpoint provisioning OR Gemini per-message)

The big-impact item. Two paths: cheap (Gemini classifies in batch as part of the existing analysis call) or expensive (provision FinBERT on a $0.033/hr HF CPU endpoint and run per-message). Recommended path is **cheap first, expensive later**.

- **28-B-01 — Gemini per-document sentiment in the analysis pass.** Add a structured `per_document_sentiment` block to the Gemini prompt + Zod schema: for the top-N news + community items, return `{doc_id, polarity ∈ [-1,+1], confidence ∈ [0,1], aspect ∈ {earnings, guidance, regulatory, M&A, macro, product, management}}`. Aggregate into per-aspect headline numbers. No new infra. Cost: marginal — Gemini already reads these documents.
- **28-B-02 — Provision FinBERT on $0.033/hr HF CPU endpoint.** One-time operator step. Wire `classifyFinBERT` (already exists in `src/lib/sentiment/finsentllm.ts`) into the per-message flow as a complement to Gemini's batch pass. Use FinBERT for high-volume StockTwits messages where calling Gemini on each would be cost-prohibitive.
- **28-B-03 — Per-head temperature scaling on FinBERT/Gemini outputs.** Standard calibration: fit a single scalar T on a held-out subset of Financial PhraseBank + recent labeled production data. Track ECE in `/insights`.
- **28-B-04 — Source-tier weighting table.** New `SOURCE_TIERS = { 'reuters.com': 4, 'bloomberg.com': 4, 'wsj.com': 4, 'cnbc.com': 3, 'seekingalpha.com': 2, 'stocktwits.com': 2, 'reddit.com/r/SecurityAnalysis': 2, 'reddit.com/r/wallstreetbets': 1, ... }`. Multiply each document's contribution to the headline number by its tier weight.
- **28-B-05 — Per-aspect headline numbers.** UI: stack of per-aspect bull% chips (Earnings 75% · Guidance 50% · Regulatory 30% · M&A null) instead of one global number. Falls back to global when no aspect-tagged signal.

### Wave C — Calibration + bot filters (2-3 weeks)

Closes the validation loop and adds the table-stakes fraud detection.

- **28-C-01 — Per-input-source IC tracking.** Daily cron: for each {StockTwits, ApeWisdom, Swaggystocks, Anthropic-search-news, Exa-news} input, compute the rolling-20d cross-sectional Spearman IC of `bull_pct - bear_pct` against forward 7d and 30d alpha-vs-SPY. Surface in `/insights` "Sentiment Sources" tab. Auto-down-weight (or alert) when ICIR drops below 0.3 for two consecutive windows.
- **28-C-02 — Brier + reliability decomposition.** For the binary "sentiment-bullish ⇒ beats SPY in 7d" claim, compute Brier score and decompose into Reliability − Resolution + Uncertainty. Display reliability diagram in `/insights`.
- **28-C-03 — Bot / coordination filter for StockTwits.** Cresci 2019 heuristics: text-pair cosine similarity >0.5 across user history (down-weight), "pump"/"to_the_moon" phrase density (flag), >5 hashtags (down-weight), <30d account age (zero-weight). Wire into `getUserReputation`.
- **28-C-04 — Pump-and-dump cluster detection.** Nam & Yang 2023 pattern: within a 24h window, if any cluster of >50 posts shares >0.7 cosine similarity AND appears on a small-cap ticker with mention_z > 5, set `manipulation_warning` flag on the SentimentIntelligence section.
- **28-C-05 — Sentiment × momentum × volume joint feature.** The literature consensus is sentiment alone has weak standalone power but adds IC when joined with price/volume features. Add `sentiment × abs(returns_5d)`, `sentiment × volume_zscore`, `Δsentiment_3d`, and `sentiment_dispersion` as derived features into the Diffusion Engine's pattern key. Ablation: does sentiment marginal IC > 0 after controlling for 5d momentum?

---

## Definition of Done

1. **Sentiment number is dispersion-aware**: Sentiment Intelligence card shows aggregated bull% AND a dispersion / agreement indicator. When `bull_pct > 90 AND mention_z > 5 AND author_diversity < 0.1`, the UI renders the "crowded consensus" warning instead of trumpeting the extreme value. **GME-style 100% bullish reads as a crowding warning, not a thesis confirmation.**
2. **Per-document classification active**: every news article + ≥top-50 community messages per ticker get a per-document `{polarity, confidence, aspect}` either via Gemini batch or FinBERT.
3. **Source-tier table live**: Reuters > CNBC > Seeking Alpha > StockTwits > raw forum, with each tier multiplying headline contribution.
4. **Time decay applied**: per-message exponential weight, half-life by source class.
5. **Per-input-source IC tracked**: every input source has a rolling-20d ICIR visible in `/insights` against 7d alpha-vs-SPY. Sources with sustained ICIR < 0.3 are auto-down-weighted.
6. **Brier-decomposition + reliability diagram** for the headline sentiment → 7d outperform-SPY claim, refreshed daily, surfaced in `/insights`.
7. **Bot / coordination filter** running on StockTwits ingest: account age < 30d zero-weighted, near-duplicate text down-weighted, pump-language flagged.
8. **All retroactive integration tests still pass** (no regressions in the diffusion engine learning loop).

---

## Operator-driven prerequisites

Same model as Phase 19. Some plans need operator-side infra before they can graduate from off → shadow → on.

| Plan | Needs operator action |
|---|---|
| 28-B-02 | Provision `ProsusAI/finbert` on a $0.033/hr HF CPU Inference Endpoint; set `HF_FINBERT_ENDPOINT` + `HF_INFERENCE_TOKEN` in Vercel prod. |
| 28-A-02, 28-C-01 | Ensure `DATA_CACHE` flag remains enabled (90d rolling baselines need a persistence layer; Postgres OK as fallback if Upstash still unprovisioned). |
| 28-C-05 | Same as Phase 21 — needs sufficient OOS Brier-lift sample size. May depend on Phase 25 (Historical Backfill) for full statistical power. |

---

## Out of scope (defer to later phases)

- **Multimodal price + sentiment fusion model** — this is Phase 22 (Composite Signal Synthesis) territory.
- **Deep historical backfill of sentiment** — this is Phase 25 (Historical Backfill).
- **Public per-report calibration trail** — Phase 27.
- **Self-hosted FinGPT v3 / Mistral-Fin endpoints** — the cost/latency math (~$2.4k/month for both warm) doesn't pencil at current user volume. The phase ships with FinBERT-only + Gemini per-document and leaves the larger ensemble as a flag-gated future-on path.

---

## Success criteria (measurable)

- **GME re-test**: regenerate the report on GME. Sentiment Intelligence card displays `crowded_consensus = true` warning. Headline number is calibrated, not 100%.
- **Per-aspect breakdown**: at least one ticker with non-trivial earnings + regulatory + product aspects in the prompt yields different per-aspect bull% values in the report (not all collapsed to one number).
- **Per-source ICIR**: by end of Phase 28, ≥1 of {StockTwits, ApeWisdom, Swaggystocks, news} has a 60-day-cumulative-window measured ICIR with statistical significance OR is documented as zero-IC and down-weighted accordingly.
- **Brier score for headline sentiment-→7d-outperform-SPY**: documented baseline established. Target: BS ≤ 0.24 (better than 0.25 random guess on roughly-balanced binary).

---

## Sources (research provenance)

Primary methodology + academic citations gathered by 4 parallel research agents on 2026-05-10:

- RavenPack Composite Sentiment Score — https://www.ravenpack.com/research/composite-sentiment-score/
- RavenPack Constructing a Sentiment Factor — https://www.ravenpack.com/research/constructing-sentiment-factor
- LSEG MarketPsych Analytics fact sheet — https://www.lseg.com/content/dam/data-analytics/en_us/documents/fact-sheets/lseg-marketpsych-analytics-factsheet.pdf
- Loughran & McDonald 2011 "When Is a Liability Not a Liability?" — Journal of Finance
- Loughran-McDonald Master Dictionary — https://sraf.nd.edu/loughranmcdonald-master-dictionary/
- Tetlock 2007 "Giving Content to Investor Sentiment" — Journal of Finance
- Araci 2019 FinBERT — https://arxiv.org/abs/1908.10063
- ProsusAI/finbert HF model — https://huggingface.co/ProsusAI/finbert
- FinGPT v3 — https://github.com/AI4Finance-Foundation/FinGPT/blob/master/fingpt/FinGPT_Sentiment_Analysis_v3/README.md
- Open FinLLM Leaderboard 2025 — https://arxiv.org/html/2501.10963v1
- Cresci et al. 2019 StockTwits bots — https://centaur.reading.ac.uk/88903/1/paper_final_v3.pdf
- Cookson & Engelberg "Echo Chambers" UCSD Rady — https://rady.ucsd.edu/faculty/directory/engelberg/pub/portfolios/ECHO_CHAMBERS.pdf
- Lucchini et al. 2022 GameStop / WSB — https://pmc.ncbi.nlm.nih.gov/articles/PMC9374300/
- Long et al. FinNLP 2021 WSB sentiment — https://aclanthology.org/2021.finnlp-1.4.pdf
- Nam & Yang 2023 pump-and-dump detection — https://arxiv.org/pdf/2301.11403
- Kim, Ryu, Seo 2014 disagreement & return predictability — Journal of Banking & Finance
- Cen, Lu, Yang 2013 disagreement & breadth-return — Management Science
- Guo et al. "On Calibration of Modern Neural Networks" (temperature scaling) — https://arxiv.org/pdf/1706.04599
- GETS Ensemble Temperature Scaling ICLR 2025 — https://openreview.net/pdf?id=qgsXsqahMq
- HF Inference Endpoints pricing — https://huggingface.co/docs/inference-endpoints/pricing
- López de Prado purged K-fold + embargo CV — https://en.wikipedia.org/wiki/Purged_cross-validation
- Murphy decomposition of Brier score — https://en.wikipedia.org/wiki/Brier_score
- CORP-method reliability diagrams PNAS 2021 — https://www.pnas.org/doi/10.1073/pnas.2016191118
- Modern news vs social-media sentiment effects MDPI 2024 — https://www.mdpi.com/1911-8074/18/12/660
- Context Analytics combined Twitter + StockTwits — https://blog.contextanalytics-ai.com/weekly-blog/social-sentiment-combo-using-twitter-and-stocktwits-sentiment

Full agent transcripts retained in session memory.
