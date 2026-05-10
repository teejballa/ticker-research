# Phase 20 — Real Sentiment Analysis & Report-Generation Excellence

**Status**: planning
**Created**: 2026-05-10 (refined: 2026-05-10 — added Wave Z hygiene foundations, Wave D report-gen, threat model, measurable acceptance criteria)
**Triggered by**: GME report rendered `100% bullish` from a single-source vendor tag — an unphysical extreme treated as a thesis when academic consensus (Cookson & Engelberg "Echo Chambers"; Lucchini et al. 2022 GME study) shows it is a *crowding* signal that mean-reverts. The post-Phase-19 Beta-smoothed multi-source aggregator was a 30-line robustness patch; real institutional systems do per-document NLP, source-tier weighting, time decay, aspect disaggregation, volume baselining, bot/coordination filters, and continuous per-source calibration against realized returns. This phase brings Cipher's sentiment layer AND report-generation layer to documented industry baseline (RavenPack / MarketPsych methodology parity).

---

## Cross-cutting standards (apply to every plan)

These are the non-negotiables — every plan in Phase 20 must demonstrate adherence in its own PLAN.md sign-off.

### S1 — No hand-picked parameters
Every threshold, half-life, prior strength, weight cap, or class boundary must be either (a) cited from a peer-reviewed source whose ticker class / time period matches Cipher's, OR (b) calibrated on labeled production data via the documented procedure in 20-Z-05 (LLM-as-judge / human eval harness). Hand-picking is allowed only for explicit experiment defaults that the calibration step then overrides.

### S2 — Point-in-time (PIT) discipline
Every sentiment feature must be queryable by `fetched_at` (when *we* recorded it), never by `published_at` (which upstream sources may revise/edit). Persisted snapshots are immutable. Any backfill that recomputes a feature creates a new column or model_version, never overwrites. Lookahead-bias regression test (20-Z-07) fails the build if any feature joins on `published_at` for backtest queries.

### S3 — Per-plan shadow lifecycle
Same convention as Phase 19. Every new code path is gated behind a three-mode flag (`off | shadow | on`). Off → shadow (parallel run, persist comparison rows) → on (cutover) → flag removed (off-path deleted). Verdict criteria for shadow→on must be a numerical threshold defined in the plan, not vibes.

### S4 — Model card per artifact
Every classifier, ensemble, or composite signal that ships in Phase 20 produces a Mitchell-2019-style model card (`MODEL-CARD-{component}.md`) covering: training data + size, evaluation metrics with CIs, intended use, out-of-distribution behavior, ethical considerations, known failure modes, retrain cadence. No model goes to `on` without one.

### S5 — Pinned model + prompt versions
Every external model invocation pins SHA / revision / endpoint version. Every Gemini prompt is a versioned artifact in a registry (20-Z-04) with golden-file regression on every change.

### S6 — Telemetry on every external call
Every external provider call surfaces latency p50/p95/p99, error rate, cost per request, cache hit rate, and fallback rate to a `/insights` "Sentiment Health" tab (20-Z-03). Cost per ticker per request is computed and budget-alerting at 1.5× rolling baseline.

### S7 — Threat model per plan
Phase-19 convention: every plan enumerates `T-28-{plan}-{n}` threats with concrete mitigations. Security-sensitive (key handling) and adversarial (manipulation, model attack) threats are tracked separately. The phase-level threat catalog at the bottom of this doc consolidates them.

### S8 — Numerical acceptance criteria
Every plan defines its DONE state as numbers (Brier, ECE, ICIR, F1, p-value, latency p95, cost per call), never adjectives. The phase-level Done Gate (model-card-status equivalent) checks the numerical gates pass for every plan that has graduated past `shadow`.

### S9 — Failure-mode coverage
Every report-generation change is regression-tested against a fixed set of "golden tickers" spanning {large-cap-equity, mid-cap-equity, micro-cap-equity, ETF, SPAC, ADR, recently-listed, low-coverage} (20-D-04). A change that fails any golden ticker auto-blocks merge.

### S10 — Regulatory hygiene
Every report contains required disclaimers (no personalized investment advice, data-as-of timestamps, source attribution). 20-D-05 is the audit. **Phase 20 does NOT publish public-per-user calibration data** — that lives behind Phase 29's legal-counsel gate.

---

## Background — what real institutional systems do (research summary)

Synthesized from 4 parallel research agent runs on 2026-05-10 (~25 primary sources). Full URL list at the bottom.

**Per-document classification**. Every institutional system classifies the *document*, not a vendor's pre-tagged "bullish" flag. RavenPack's CSS scores stories 0-100 by matching emotionally-charged words against expert-rated training stories, calibrated against intraday tick data on ~100 large-caps. MarketPsych runs NLP across 2,000 news + 800 social sites that "weighs relationships between parts of speech, dependencies, tenses, perspective, author credibility, and thousands of modifiers." FinBERT (Araci 2019) hit ~97% on Financial PhraseBank, +14 pp over prior SOTA. **Loughran-McDonald 2011 showed ~75% of "negative" words in the Harvard IV-4 dictionary are not negative in finance** (tax, cost, capital, liability, vice) — generic sentiment lexicons are actively misleading on 10-Ks.

**Source-tier weighting + author credibility**. RavenPack and MarketPsych explicitly weight by source authority (Reuters/Bloomberg ≫ blog ≫ social). MarketPsych factors author credibility per-post.

**Time decay**. RavenPack's published sentiment factor uses a 90-day SMA. Tetlock 2007 used VAR lags showing pessimism predicts next-day returns then mean-reverts within a week. Practitioners overwhelmingly use exponential decay; defensible defaults: half-life ~24h retail chatter, ~3d news, ~7-14d SEC.

**Volume baselining + novelty**. RavenPack ships an Event Novelty Score (ENS) — repeated coverage of the same event is down-weighted; only novel events move the score. They also publish an Event Relevance Score (ERS) — typically filter ≥90 — to drop tangential mentions. "Trending" should be a z-score against ticker-specific 30/90-day mention baseline.

**Aspect-based decomposition (TABFSA)**. Sentence-level polarity averages out opposite signals (bullish-on-product + bearish-on-guidance → neutral, which is wrong). RavenPack's taxonomy splits sentiment by event type (earnings, guidance, M&A, regulatory, litigation, analyst-revision); MarketPsych exposes Optimism, Fear, Uncertainty plus topical scores like earnings forecast and interest rates.

**Dispersion / crowding as a separate signal**. Cookson & Engelberg (UCSD Rady): high StockTwits agreement is an echo-chamber crowding signal, not a thesis signal — and **crowding predicts mean-reversion**. Lucchini et al. 2022: GameStop WSB sentiment became a self-induced consensus during the squeeze. Kim/Ryu/Seo 2014 + Cen/Lu/Yang 2013: high dispersion + high sentiment predicts NEGATIVE future returns. Disagreement is itself a return predictor — reporting only the mean throws away signal.

**Bot / coordination detection**. Cresci et al. 2019: ~6% of StockTwits accounts are signal bots, concentrated on low-cap tickers tied to manipulation events. Detection: text-pair cosine similarity > 0.5 across user history, "pump"/"to-the-moon" phrase density, >5 hashtags, "bot" in handle. Nam & Yang 2023: F1 = 0.67 from posts alone on confirmed pump-and-dump, sensitivity 85% / specificity 99%.

**Calibration against realized returns (per-component IC)**. RavenPack reports IC and long-short Sharpe per signal; degrades signals that don't predict. Tetlock validated pessimism→returns via VAR with significance tests. Modern picture: news sentiment effects survive 1-2 weeks; Twitter/StockTwits effects largely vanish after 1 trading day, signal is crowded. Plan for small effect (~10-30 bps/week long-short) and design power calculations for ≥6 months of daily snapshots.

**Calibration of classifiers**. Standard practice = temperature scaling (Guo et al. 2017) — single scalar T fit on held-out NLL. Evaluation via Expected Calibration Error (ECE) and reliability diagrams. CORP method (PNAS 2021) is the modern replacement for ad-hoc binning. GETS (ICLR 2025) shows ensemble temperature scaling further reduces ECE.

**Cost / latency profile**. HF Inference Endpoints: FinBERT (110M) on $0.033/hr CPU = effectively free per-request (~80 inferences × ~100ms ≈ $0.0001 per ticker). FinGPT v3 (Llama-2-13B + LoRA) on $2.50/hr A100 with 10-30s cold-start = $2.4k/month idle. Recommendation: **FinBERT-only baseline + Gemini per-document fallback; 7B/13B ensemble is opt-in deep mode only.**

---

## Goal

**Sentiment**: every ticker's headline sentiment is a calibrated, dispersion-aware, time-decayed, source-weighted, per-aspect score with a UI that distinguishes "consensus thesis" from "crowded echo chamber." The GME-style 100% bullish reads as a CROWDING WARNING, not a thesis confirmation.

**Report generation**: every report is numerically grounded (every number traces to SourcePackage), citation-complete (every qualitative claim has ≥1 source), per-claim confidence-rated (CoVe-extended), and regression-tested across 8 golden tickers spanning all security types. Failure-mode coverage is enforced in CI; prompt changes go through a versioned registry with golden-file diffs.

**Process**: every claim above is *measurable*, every parameter is *calibrated or cited*, every model has a *card*, every external call is *telemetered*, every flag has a *graduation lifecycle*, and every report change is *regression-tested*.

---

## Plan structure (4 waves, 27 plans)

Wave Z is FIRST — same as Phase 19. The hygiene foundations have to land before any of the user-visible work because Waves A-D depend on the persistence + telemetry + eval harness Wave Z creates.

### Wave Z — Infrastructure & hygiene foundations (7 plans)

| ID | Goal | Acceptance |
|---|---|---|
| **20-Z-01** | **Sentiment feature store with PIT snapshots.** Persist `(ticker, source, message_id, fetched_at, raw_body_hash, classifier_version, classifier_score, decay_weight, author_id, author_features_snapshot)` in a new `SentimentObservation` Prisma table. Snapshots are immutable; backfill creates a new `model_version` row per `(ticker, message_id, model_version)`. | Live for ≥1 cron cycle; lookahead-bias regression test (20-Z-07) green; 0 NULL `fetched_at`. |
| **20-Z-02** | **Model + dataset card scaffold.** `MODEL-CARD-template.md` (Mitchell 2019) and `DATASET-CARD-template.md` (Gebru 2018). New release script `scripts/check-model-cards.ts` exits non-zero if any model in `src/lib/sentiment/` lacks an up-to-date card. Existing artifacts (StockTwits naive, reputation-weighted, FinBERT) get retroactive cards. | check-model-cards exits 0; ≥3 cards committed; CI gate added. |
| **20-Z-03** | **Telemetry — `/insights` Sentiment Health tab.** Per-provider latency p50/p95/p99, error rate, cost per request (USD), cache hit rate, fallback rate. Pulled from a new `ProviderCallLog` table + `withTelemetry()` wrapper around every external call (extends `withRetry()` from 19-B-02). Cost-budget alert at 1.5× rolling 7d baseline. | All Phase-28 + Wave-B Phase-19 adapters wrapped; `/insights/sentiment-health` renders with non-zero data after 24h. |
| **20-Z-04** | **Prompt registry + golden-file regression.** New `src/lib/prompts/registry.ts` exports versioned named prompts (every Gemini prompt becomes a `PromptId` + `version`). Golden-file diff test fails the build when a prompt changes without a version bump. Side-by-side eval harness (LLM-as-judge) reports BLEU + numeric-grounding + citation-coverage delta on every version bump. | All existing Gemini prompts migrated; ≥1 version bump exercised end-to-end through eval; CI gate added. |
| **20-Z-05** | **LLM-as-judge eval harness.** `scripts/eval-report.ts` runs N pairs (baseline vs candidate) through a judge prompt (Claude Opus 4.7 in this codebase) scoring per dimension: numeric-grounding, citation-coverage, narrative coherence, hedging quality, contradiction-handling. Scores are calibrated against ≥30 human-labeled exemplars (20-D-04 golden set). | ≥0.7 Pearson agreement with human labels on the 30-exemplar set; harness runs in <10min on the golden set. |
| **20-Z-06** | **Composite Phase-28 done gate.** `npm run phase-28-status` analog of `model-card-status` — exits 0 only when every Phase 20 flag has graduated AND every model card is up to date AND lookahead test is green AND golden-ticker regression passes. | Script exists; can exit non-zero today; tests cover the 4 gate branches. |
| **20-Z-07** | **Lookahead-bias regression test.** Integration test that loads the production query path for sentiment features and fails if any SQL/ORM call uses `published_at` rather than `fetched_at` for backtest joins. Uses Prisma query-event hook to instrument. | Test added + green; documented in 20-Z-01 PLAN as the PIT defense. |

### Wave A — Quick wins (no infra dependency, ships GME-100% fix; 5 plans)

These ship the dispersion / crowding fix and time-decay fix without requiring HF endpoints. **Each plan calibrates its parameters via a documented procedure on labeled data — no hand-picked thresholds.**

| ID | Goal | Algorithm + calibration | Acceptance |
|---|---|---|---|
| **20-A-01** | **Dispersion + `crowded_consensus` flag.** Compute Shannon entropy of bull/bear/neutral message tags + bull_pct standard deviation across cross-platform sources. Flag `crowded_consensus = entropy < H_thresh AND mention_z > V_thresh AND author_diversity < D_thresh`. UI: when set, render Sentiment Intelligence card with "crowded consensus — historical base-rate of mean-reversion within 14d" warning. | H_thresh, V_thresh, D_thresh **calibrated** via grid-search maximizing Brier-skill-score on the binary "crowded-consensus → underperformed SPY at 14d" claim across the trailing 90d production sentiment snapshots. Recalibrate monthly via cron. | Calibration cron live; flag fires on ≥1 historical GME-style ticker in backfill; UI renders warning text. |
| **20-A-02** | **Volume baselining (z-score, robust).** Per-ticker rolling 90-day mention count baseline using **median + MAD** (not mean + std — meme-stock spikes contaminate the sample). Stratified by `cap_class` so micro-caps don't drown in large-cap baseline. Replace `stocktwits_is_trending = sentiment_change > 0.5` with `mention_z > Z_thresh`. | Z_thresh **calibrated** to maximize cross-sectional IC of `(mention_z, forward_5d_alpha_vs_SPY)` on backfill. Per cap-class threshold (small-caps need higher Z because they spike easier). | New `MentionBaseline` Prisma table populated nightly; ≥1 cap-class threshold differs from default; per-class threshold documented in `HYPERPARAMETERS.md`. |
| **20-A-03** | **Exponential time decay per source class.** Each persisted `SentimentObservation` carries a `decay_weight = exp(-λ × age_days)` where λ is per-source-class. Half-lives **calibrated** via grid search maximizing 20-day rolling ICIR of the decayed aggregate vs forward 7-day alpha-vs-SPY. Defaults from literature (24h retail / 72h news / 7d SEC) seed the search. | Calibration script `scripts/tune-decay.ts` — operator-driven first run, then monthly cron. Backfill applies new λ to historical observations via the model_version mechanism in 20-Z-01 (no overwrites). | Tuned λ committed to `HYPERPARAMETERS.md`; ICIR on validation window improves vs no-decay baseline by ≥0.05. |
| **20-A-04** | **Author-concentration via Gini coefficient.** Replace `unique_authors / total_messages` with the Gini coefficient of message-counts-per-author within the rolling 24h window — a more robust measure. Surface in UI breakdown. Down-weight messages from authors contributing >X% of the window's volume. | X% threshold = the bottom-quartile (Q1) of historical author-share for the trailing 90d on the same ticker. (i.e., punish only when an author is more concentrated than that ticker's normal pattern). | `gini_coefficient` field on SentimentIntelligenceSection; UI shows per-author top-N volume share; integration test validates Gini formula on synthetic data. |
| **20-A-05** | **Cross-platform agreement signal.** When ≥2 sources contributed, surface `agreement_score = 1 - bull_pct_std/50 ∈ [0,1]`. UI badge "MIXED · LOW AGREEMENT" when <0.5. **Treat agreement as a separately-calibrated feature**: log it into the Diffusion Engine pattern key. Per Cookson/Engelberg, low agreement on a high-mention ticker historically predicts higher subsequent volatility. | Threshold of 0.5 is the literature default; calibration step measures the Cookson-style relationship on backfill and adjusts. | Field on SentimentIntelligenceSection; UI badge renders; calibration script documented. |

### Wave B — Per-document NLP (the big-impact item; 6 plans)

| ID | Goal | Algorithm | Acceptance |
|---|---|---|---|
| **20-B-01** | **Gemini per-document classification with versioned prompt (cheap path).** Add `per_document_sentiment` block to the analysis Zod schema. Top-N news + community items → `{doc_id, polarity ∈ [-1,+1], confidence ∈ [0,1], aspects: AspectTag[]}`. Prompt is versioned via 20-Z-04 registry. No new infra. | Aspect taxonomy: `{earnings, guidance, regulatory, M&A, macro, product, management}` — fixed set. Inter-aspect overlap allowed (a doc can carry multiple aspects). | Prompt v1 in registry; integration test on 10-doc fixture passes; ECE on FPB held-out subset ≤ 0.15. |
| **20-B-02** | **FinBERT HF endpoint (per-message backstop).** Provision `ProsusAI/finbert` at pinned commit SHA on $0.033/hr HF CPU endpoint. Wire `classifyFinBERT` (already in `src/lib/sentiment/finsentllm.ts`) into per-StockTwits-message pass when message volume > 50 (Gemini per-document is cost-prohibitive at that volume). Endpoint URL pinned in env; SHA pinned in URL per 19-C-01 convention. | Fallback chain: FinBERT endpoint → local CPU inference (lazy-load `@xenova/transformers` in-process) → null sentinel. | Endpoint provisioned + URL set; per-message pass active; latency p95 ≤ 2s; cost telemetry visible in 20-Z-03 dashboard. |
| **20-B-03** | **Temperature scaling + ECE tracking.** Fit single scalar T per classifier (Gemini, FinBERT) on held-out FPB + production-labeled subset. Refit monthly via cron. ECE displayed in `/insights`; ship-gate ECE < 0.05. | Validation set: FPB (~5k labeled sentences) + ≥500 production-labeled docs from human-spot-check (20-Z-05). Fit T via L-BFGS minimizing NLL. | T values committed per-model in `HYPERPARAMETERS.md`; ECE < 0.05 on validation; monthly cron live. |
| **20-B-04** | **Source-tier weighting (data-driven, not hand-curated).** New `source_tier` weight per source = `softmax(mean_IC_per_source)`, capped at [0.5, 5.0] so no source is fully suppressed or fully dominant. Recomputed monthly. Replaces my-original-plan hand-curated table. | Computed from per-source rolling-90d IC against forward 7d alpha-vs-SPY (20-C-01 dependency). New sources start at weight 1.0 until they have ≥30d of measured IC. | `SourceTier` Prisma table populated; weight applied in aggregator; per-source weights surfaced in UI breakdown. |
| **20-B-05** | **Per-aspect headline numbers.** UI: stack of per-aspect bull% chips (Earnings 75% · Guidance 50% · Regulatory 30% · M&A null) instead of one global number. Falls back to global when no aspect-tagged signal. Aggregation per aspect uses the same Beta-smoothed weighted-mean from post-Phase-19. **Cohen's kappa target ≥ 0.6** between Gemini's aspect tags and a 50-doc human-labeled set. | Aspect tags from 20-B-01. UI component reuses existing chip pattern. Empty-aspect handling: render "—" not 0%. | Cohen's kappa ≥ 0.6 measured on 50-doc set; UI rendering verified on 4 golden tickers; aspects surface in research-brief.ts prompt. |
| **20-B-06** | **Loughran-McDonald lexicon-based fallback.** When all NLP paths fail (no Gemini, no FinBERT, no HF), use the L&M finance-specific lexicon as a last-resort word-count classifier. Integrates the published L&M 2011 wordlist (open-licensed CSV from Notre Dame). Surface as `nlp_path = 'l&m-fallback'` in telemetry so we can measure how often we're degraded. | L&M wordlist committed under `data/lexicons/loughran-mcdonald.csv`. Classifier returns `{score, confidence: 0.4}` (low confidence reflecting lexicon-only). | Lexicon committed; fallback integration test passes; degradation rate visible in 20-Z-03. |

### Wave C — Calibration & adversarial robustness (6 plans)

| ID | Goal | Algorithm | Acceptance |
|---|---|---|---|
| **20-C-01** | **Per-input-source rolling ICIR with Newey-West significance.** Daily cron computes per-source rolling-20d cross-sectional Spearman IC of `bull_pct - bear_pct` against forward 7d and 30d alpha-vs-SPY. ICIR = mean(IC) / std(IC) over rolling window. Significance test via Newey-West HAC standard errors (autocorrelation correction at lag 7). Surface in `/insights` "Sentiment Sources" tab. Auto-down-weight (or alert) when ICIR < 0.3 for two consecutive windows. | Newey-West implementation in TS — small lib, ~80 lines. Per-source signal reuses 19-A-05 IC infrastructure. | Cron live; per-source ICIR visible in dashboard for ≥7 days; auto-down-weight wired into 20-B-04. |
| **20-C-02** | **Brier decomposition + CORP reliability diagram.** For binary "sentiment-bullish ⇒ beats SPY in 7d," compute Brier score and decompose into Reliability − Resolution + Uncertainty (Murphy 1973). Reliability diagram via CORP method (PNAS 2021) — replaces ad-hoc binning. Display in `/insights`; ship-gate Brier ≤ 0.24 (vs 0.25 random). | Murphy decomposition formulas implemented as pure functions w/ unit tests against published numerical examples. CORP via isotonic regression. | Brier + decomposition computed on backfill; reliability diagram renders; ship-gate Brier ≤ 0.24 met or documented why not. |
| **20-C-03** | **Cresci-2019 bot filter + MinHash near-duplicate detection.** For each StockTwits author, compute: account_age_days (zero-weight if <30), text-pair cosine similarity across user history (down-weight if >0.5), pump-language phrase density ("to the moon", "rocket", "100x"), hashtag count (>5 → down-weight). Aggregate-level: MinHash + LSH on the 24h message bag for the ticker — if any cluster of ≥50 messages has >0.7 similarity, flag as `coordinated_posting`. | MinHash via `node-minhash` or hand-implemented (small). Cresci heuristics live in `src/lib/sentiment/bot-filter.ts`. | False-positive rate ≤ 5% on a 100-author labeled set (operator labels via spot-check); flagged authors visible in UI breakdown. |
| **20-C-04** | **Pump-and-dump cluster detection (Nam/Yang 2023 baseline).** Within a 24h window: if `mention_z > 5 AND bull_pct > 95 AND author_diversity_gini > 0.7 (concentrated) AND mean_account_age < 90 AND cap_class ∈ {micro, small}`, set `manipulation_warning = true` and surface explicit UI banner. Calibrated against confirmed P&D events from public NASDAQ surveillance alerts (where available; otherwise synthetic injection). | Per Nam/Yang F1 = 0.67, sensitivity 85% / specificity 99% on confirmed P&D. Replicate on synthetic-injection eval set. | F1 ≥ 0.6 on synthetic eval; manipulation_warning UI banner renders; integration test with synthetic P&D pattern green. |
| **20-C-05** | **Sentiment × momentum × volume joint feature ablation.** Add derived features `sentiment × abs(returns_5d)`, `sentiment × volume_zscore`, `Δsentiment_3d`, `sentiment_dispersion` into the Diffusion Engine pattern key. Ablate sentiment-alone vs joint-features via paired-bootstrap on Sharpe difference (1000 resamples, 95% CI). | Reuses 18-02 purgedKFold + 19-A-04 CPCV harness. Hypothesis: joint-features marginal IC > 0 after controlling for 5d momentum. | Ablation report committed; if joint > sentiment-alone with 95% CI lower-bound > 0, feature added to engine; otherwise documented as null result. |
| **20-C-06** | **Fairness / bias audit by cap_class, sector, geography, ticker age.** Stratified Brier + ECE by each segment. Document any segment with Brier > 0.27 or ECE > 0.10 as a known limitation in the model card (20-Z-02). Re-run on every model retrain. | Stratification dimensions: cap_class (mega/large/mid/small/micro), sector (GICS-1), geography (US/non-US), ticker_age (<1y, 1-5y, >5y). | Audit report committed; ≥1 segment-specific limitation documented in model card; baseline numbers for next-phase comparison. |

### Wave D — Report-generation excellence (5 plans)

The user explicitly asked for "highest industry standards for ML, **report generation**, and other related topics." This wave brings the report layer to parity with the sentiment layer.

| ID | Goal | Algorithm + acceptance |
|---|---|---|
| **20-D-01** | **Numeric-grounding regression test.** Every number in the rendered report (price target, P/E, revenue, percentages) must trace to a value present in the SourcePackage within ε tolerance (e.g., 0.5% for ratios, exact for share counts). Build-blocking integration test using the 8-golden-ticker SourcePackages + frozen Gemini outputs (recorded from a temperature=0 run, replayed in test). | Test asserts every numeric span in `report.executive_summary + investment_thesis + key_risks + valuation_context + future_projection` is matchable. Tolerance per field type. Failure surfaces specific span + closest SourcePackage value. |
| **20-D-02** | **Citation-coverage metric.** Compute `% of qualitative claims with ≥1 supporting citation` per report. Surface in `/insights` and add a build-blocking gate — coverage < 80% on any golden ticker fails the build. | Claim extraction via regex + LLM-judge (20-Z-05). Citation matching uses citations_v2 from 19-C-07. Track per-section coverage. |
| **20-D-03** | **Per-claim confidence (CoVe extension).** 19-C-08 already does CoVe Pass-2 verification at the report level. Extend to per-claim: every bullish_signal / bearish_signal / risk gets a `verified ∈ {true, false, null}` from the NLI verifier. UI: render unverified claims with a visible (?) badge. | Reuses 19-C-08 nli-verifier. New schema field per signal. UI badge. Per-claim verified rate baseline measured. |
| **20-D-04** | **Failure-mode coverage suite — 8 golden tickers across security types.** Curated set: AAPL (large-cap), DKNG (mid-cap), GME (meme/echo-chamber), SOFI (recently-public), SPY (ETF), DWAC (SPAC), TSM (ADR), undefined-low-coverage micro-cap (rotates). Snapshot SourcePackages frozen + replayed in CI. Every report-touching change runs the suite. | Snapshots in `tests/golden-tickers/`. Pass criteria: report renders, all 20-D-01/02/03 gates green, no 5xx, report_word_count ∈ [500, 5000]. |
| **20-D-05** | **Disclaimer / appropriate-use audit (regulatory hygiene).** Every report carries: data-as-of timestamp per source, disclaimer footer ("educational research, not personalized investment advice"), explicit hedging language on price targets, source-list in the footer. Audit script `scripts/audit-disclaimers.ts` exits non-zero if any rendered report is missing required elements. **Stops short of the public-trail / model-card publication that requires legal counsel — that is Phase 29.** | Disclaimer template versioned in 20-Z-04 registry. Audit script wired to CI. Hedging rules: any "price_target" rendered with a "± CI" band when conformal data available; otherwise rendered with "(implied range)" qualifier. |

---

## Definition of Done — Phase 20 closes when ALL of these are numerically true

1. **`npm run phase-28-status` exits 0.** This rolls up:
2. **Sentiment**: GME re-test renders the `crowded_consensus` warning (not 100% bullish as a thesis).
3. **Per-document NLP active** for ≥80% of news/community items per ticker (the 20% slack accommodates lazy-load + cold-start fallbacks).
4. **Source-tier weights data-driven** from 20-C-01 IC measurements (no hand-curated entries shipping).
5. **Time decay applied** with calibrated λ; backtest ICIR uplift ≥ 0.05 vs no-decay baseline.
6. **Per-input-source ICIR tracked** for ≥30 days continuous; per-source weights auto-adjust.
7. **Brier ≤ 0.24** for the binary sentiment→outperform-SPY-at-7d claim (vs 0.25 random).
8. **ECE ≤ 0.05** for each shipped classifier after temperature scaling.
9. **Bot-filter false-positive ≤ 5%** on the labeled audit set; coordinated-posting detector F1 ≥ 0.6 on synthetic eval.
10. **Numeric-grounding test green** on all 8 golden tickers (20-D-01).
11. **Citation-coverage ≥ 80%** per report on all 8 golden tickers (20-D-02).
12. **Model cards exist** for every shipped sentiment artifact (Mitchell 2019 format).
13. **Lookahead-bias test green** (20-Z-07).
14. **Telemetry live** at `/insights/sentiment-health` with non-zero data for ≥7 days.
15. **Fairness audit committed** with documented per-segment Brier + ECE; ≥1 known limitation surfaced in model card.
16. **All flags graduated** off → shadow → on, OR documented as deferred-to-next-phase with reason.

---

## Operator-driven prerequisites

Same model as Phase 19. Some plans graduate only after operator-side infra lands.

| Plan | Operator action |
|---|---|
| 20-Z-01 | Prisma schema migration + db push (additive, non-blocking). |
| 20-Z-03 | Optional: provision OTel collector in Vercel for richer trace export (deferrable — internal dashboard works without it). |
| 20-B-02 | Provision `ProsusAI/finbert` HF Inference Endpoint at pinned SHA on $0.033/hr CPU instance; set `HF_FINBERT_ENDPOINT` + `HF_INFERENCE_TOKEN` in Vercel prod. |
| 20-A-02, 20-C-01 | Ensure backfill compute capacity for nightly cron (current crons run in <5 min; this phase adds ~3-5 min). |
| 20-D-04 | Curate the 8 golden-ticker snapshots once (one-time human curation step; ~2 hours). |
| 20-C-04 | Optionally license NASDAQ surveillance-alert feed for true labeled P&D ground truth (defer — synthetic-injection eval is sufficient for ship). |
| Wave-D ship | Optional legal review of disclaimer template before public ship (consistent with Phase 29 entry gate; this phase does NOT require it because nothing publishes outside the existing auth-gated UI). |

---

## Out of scope (deferred to later phases)

- **Multimodal price + sentiment fusion model** — Phase 24 (Composite Signal Synthesis).
- **Self-hosted FinGPT v3 / Mistral-Fin endpoints** — cost/latency math (~$2.4k/month for both warm) doesn't pencil at current user volume. Optional 7B/13B ensemble stays flag-gated and deferred until paying-user volume justifies.
- **Public per-report calibration trail** — Phase 29 (legal-counsel gate).
- **Deep historical sentiment backfill** — Phase 27 (Historical Backfill).
- **Cross-asset sentiment correlation features** (e.g., sector-ETF sentiment as a covariate) — backlog candidate; defer until Phase 24 composite scaffolding lands.
- **Real-time intraday sentiment** — out of scope; current cron cadence (8h sweep) is sufficient for the daily/weekly horizon Cipher operates at.

---

## Phase-level threat model (consolidates per-plan threats)

| ID | Threat | Mitigation |
|---|---|---|
| T-28-001 | Bot/coordination floods skew sentiment | 20-C-03 + 20-C-04 |
| T-28-002 | Lookahead bias in backtest | 20-Z-01 + 20-Z-07 (PIT discipline) |
| T-28-003 | Vendor source rot (StockTwits API change, ApeWisdom shutdown) | 20-Z-03 telemetry alerts on error rate spike; 20-B-06 lexicon fallback |
| T-28-004 | Classifier upgrade silently changes scoring | 20-Z-01 model_version columns; 20-Z-04 prompt registry; 20-B-03 ECE re-fit |
| T-28-005 | Cost runaway (FinBERT endpoint or Gemini per-doc) | 20-Z-03 cost-budget alert at 1.5× rolling baseline; FinBERT only fires when message_volume > 50 |
| T-28-006 | Hallucinated numbers in report | 20-D-01 numeric-grounding test |
| T-28-007 | Hallucinated citations in report | 20-D-02 + 19-C-07 (existing) |
| T-28-008 | Crowded consensus mistaken for thesis | 20-A-01 + 20-C-04 |
| T-28-009 | Aspect tagging inconsistent across runs | 20-B-05 Cohen's kappa target |
| T-28-010 | Calibration drifts with regime change | 20-B-03 monthly ECE refit cron |
| T-28-011 | Bot-filter false positives suppress real signal | 20-C-03 ≤5% FP gate; spot-check audit |
| T-28-012 | Disclaimer rotted / missing on report | 20-D-05 audit script CI gate |
| T-28-013 | Fairness gap (e.g., poor calibration on micro-caps or non-US) | 20-C-06 per-segment audit |
| T-28-014 | Prompt change breaks downstream reports | 20-Z-04 golden-file regression |
| T-28-015 | Per-source IC degraded → bad weight | 20-C-01 auto-down-weight on ICIR < 0.3 |

---

## MVP slice (ship first if scope-cut needed)

If we have to ship narrower: **Wave Z + 20-A-01 (crowded_consensus flag) + 20-A-03 (time decay) + 20-B-01 (Gemini per-doc) + 20-D-01 (numeric grounding) + 20-D-04 (golden tickers).** That's 12 plans and delivers the GME-100% fix + per-document NLP + report-quality regression, leaving the rigor (per-source IC, bot detection, fairness audit) for a Phase 20.5 follow-on.

---

## Sources (research provenance)

Primary methodology + academic citations gathered by 4 parallel research agents on 2026-05-10:

- RavenPack Composite Sentiment Score — https://www.ravenpack.com/research/composite-sentiment-score/
- RavenPack Constructing a Sentiment Factor — https://www.ravenpack.com/research/constructing-sentiment-factor
- LSEG MarketPsych Analytics fact sheet — https://www.lseg.com/content/dam/data-analytics/en_us/documents/fact-sheets/lseg-marketpsych-analytics-factsheet.pdf
- Loughran & McDonald 2011 "When Is a Liability Not a Liability?" — Journal of Finance, https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1540-6261.2010.01625.x
- Loughran-McDonald Master Dictionary — https://sraf.nd.edu/loughranmcdonald-master-dictionary/
- Tetlock 2007 "Giving Content to Investor Sentiment" — Journal of Finance, https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1540-6261.2007.01232.x
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
- Murphy 1973 Brier-score decomposition — https://en.wikipedia.org/wiki/Brier_score
- CORP-method reliability diagrams PNAS 2021 — https://www.pnas.org/doi/10.1073/pnas.2016191118
- HF Inference Endpoints pricing — https://huggingface.co/docs/inference-endpoints/pricing
- López de Prado purged K-fold + embargo CV — https://en.wikipedia.org/wiki/Purged_cross-validation
- Modern news vs social-media sentiment effects MDPI 2024 — https://www.mdpi.com/1911-8074/18/12/660
- Context Analytics combined Twitter + StockTwits — https://blog.contextanalytics-ai.com/weekly-blog/social-sentiment-combo-using-twitter-and-stocktwits-sentiment
- Mitchell et al. 2019 Model Cards for Model Reporting — https://arxiv.org/abs/1810.03993
- Gebru et al. 2018 Datasheets for Datasets — https://arxiv.org/abs/1803.09010
- Newey-West HAC standard errors — https://en.wikipedia.org/wiki/Newey%E2%80%93West_estimator
