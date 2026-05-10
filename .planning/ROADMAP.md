# Roadmap: Cipher

## Shipped Milestones

- ✅ **v1.0 — MVP & Self-Calibrating Engine** (2026-03-13 → 2026-05-03)
  17 phases · 59 plan summaries · 461 commits · 19,085 LOC.
  Full data pipeline → Gemini reasoning via Vercel AI Gateway → Diffusion Learning Engine → Technical Analysis as parallel signal class → Institutional & Insider Intelligence. Production live at **ciphersearch.app**.
  → See [`milestones/v1.0-ROADMAP.md`](./milestones/v1.0-ROADMAP.md) and [`milestones/v1.0-REQUIREMENTS.md`](./milestones/v1.0-REQUIREMENTS.md).

## Current Milestone — v2.0: Learning Engine Excellence

**Goal:** Take the v1.0 self-calibrating engine to **clean, defensible, industry-standard ML** with measurable out-of-sample lift, drift defenses, hierarchical sharing, regime awareness, lift-gated promotion, composite signal synthesis, and a public model card.

**Status:** Defined 2026-05-03. Research complete. Ready for `/gsd-plan-phase 18`.

### Phases (10 total — continues numbering from v1.0)

Phase order reconciled across all 4 research dimensions. Build dependencies (post-2026-05-07 consolidation): P18 → **P19 (Cipher v2.0 Excellence)** → P20 → P25 → P21 → P22 → P23/P24/P26 → P27. The original P19 ("Hierarchical Priors / Partial Pooling") is absorbed into P19 Wave A as Plan 19-A-07.

- [x] **Phase 18: Time-Decayed Bayesian Updates + ESS** — keystone phase. Adds `effective_sample_size` to LearnedPattern via exponential decay; Page-Hinkley drift detector; per-class λ tuning. Requirements: CORE-ML-01..05. (completed 2026-05-06)
  - **Plans:** 11 plans across 5 waves
  - Plans:
    - [x] 18-00-PLAN.md — Wave 0: 10 test stub files scaffolded before any implementation (TDD red→green setup)
    - [x] 18-01-PLAN.md — Wave 1: decay/ESS/Page-Hinkley/confirmedDrift pure functions + STATUS_VALUES const in src/lib/learning.ts
    - [x] 18-02-PLAN.md — Wave 1: src/lib/cv.ts purgedKFold (Purged K-Fold + Embargo CV per López de Prado)
    - [x] 18-03-PLAN.md — Wave 1: additive Prisma schema migration (effective_sample_size, n_trials_attempted) + [BLOCKING] db push
    - [x] 18-04-PLAN.md — Wave 2: rewire /api/cron/learn — apply decay+ESS, two-of-two confirmedDrift, EXPLORATORY-WATCH writes
    - [x] 18-05-PLAN.md — Wave 2: /api/cron/backfill-ess — env-flag + auth + idempotent single-tx replay
    - [x] 18-06-PLAN.md — Wave 2: scripts/tune-lambda.ts + scripts/tune-page-hinkley.ts (operator-driven, paste into HYPERPARAMETERS)
    - [x] 18-07-PLAN.md — Wave 3: engine-context.ts surfaces ESS + EXPLORATORY-WATCH; types extended back-compat
    - [x] 18-08-PLAN.md — Wave 3: EngineCalibrationPanel ESS column + WatchBadge "regime stability: watching"
    - [x] 18-09-PLAN.md — Wave 3: /insights ESS-based CI widths + drift_clear recovery counter (D-09 step 4 derived)
    - [x] 18-10-PLAN.md — Wave 4: full-suite verification, per-task validation map, nyquist_compliant: true sign-off
- [ ] **Phase 20: Market-Regime Feature** — extends LearnedPattern composite key with regime dimension (4 buckets: bull/bear/chop × low-vol/high-vol via VIX bucketing + SPY trend); 2-step migration to manage risk. Requirements: CORE-ML-06..10.
- [x] **Phase 19: Cipher v2.0 Excellence** — shipped to production at ciphersearch.app on 2026-05-10; all 30 plans + 5 post-19 P0 utilization improvements landed; flag graduation lifecycle (model-card-status) operator-driven from here. Consolidated post-Phase-18 push to industry-standard quant-grade quality across data, sentiment, and ML pipelines. Brownfield additive only — no functionality removed. Agent-executable end-to-end with shadow A/B → atomic cutover (zero 60-day retention). Designed 2026-05-07. Absorbs original P19 Hierarchical Priors as Plan 19-A-07. Requirements: CORE-ML-11..14 (preserved from absorbed P19) + new gap-fill from 2026-05-07 audit (CPCV, DSR, PBO, conformal, IC monitor, FinSentLLM, structured citations, model routing, CoVe, contradiction detector, data-layer modernization, caching).
  - **Design doc:** `docs/plans/2026-05-07-cipher-v2-excellence-design.md`
  - **Implementation plan:** `docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md`
  - **Plans:** 30 plans across 4 waves (Z=infra, A=ML hygiene+quant+hierarchical, B=data, C=sentiment+reasoning)
  - **Composite Done Gate:** `npm run model-card-status` exits zero
  - Wave Z (4 plans, 3 days): 19-Z-01 features.ts · 19-Z-02 ShadowComparison schema · 19-Z-03 shadow-runner+verdict CLI · 19-Z-04 model-card-status script
  - Wave A (7 plans, 2-3 weeks): 19-A-01 decayWeights guard+Zod · 19-A-02 Brier OOS+lookahead · 19-A-03 Conformal · 19-A-04 DSR+PBO+CPCV · 19-A-05 Rolling IC monitor · 19-A-06 Calibration harness · 19-A-07 Hierarchical Bayesian pooling (absorbed P19)
  - Wave B (8 plans, 2-3 weeks): 19-B-01 Upstash · 19-B-02 retry · 19-B-03 Tiingo · 19-B-04 Twelve Data · 19-B-05 Exa · 19-B-06 merge precedence · 19-B-07 Runtime Cache · 19-B-08 rollout
  - Wave C (11 plans, 4-5 weeks): 19-C-01 FinSentLLM clients · 19-C-02 ensemble · 19-C-03 reputation StockTwits · 19-C-04 options term-structure · 19-C-05 Swaggystocks+ApeWisdom · 19-C-06 Quiver · 19-C-07 structured citations · 19-C-08 CoVe · 19-C-09 model router · 19-C-10 contradiction detector · 19-C-11 Arctic Shift backfill
- [ ] **Phase 25: Historical Backfill** — bootstrap N for lift gating: ≥100 tickers × ≥5 years of technical signals; point-in-time discipline; single feature-extraction code path. Requirements: COVERAGE-06..10.
- [ ] **Phase 21: Lift-Gated Cell Promotion** — out-of-sample Brier-lift > threshold gate via Purged K-Fold + Embargo CV; Benjamini-Yekutieli FDR correction; Deflated Sharpe Ratio. Requirements: CORE-ML-15..19.
- [ ] **Phase 22: Composite Signal Synthesis** — single calibrated headline probability with CI from per-class isotonic-calibrated combination; first user-visible v2.0 win. Requirements: REASON-01..05.
- [ ] **Phase 23: Counterfactual Reasoning** — leave-one-out deltas injected as structured Zod block in Gemini prompt; "Why this thesis moved" report section. Requirements: REASON-06..09.
- [ ] **Phase 24: Adaptive Watchlist (Thompson Sampling)** — bandit-driven scan target selection on cell undersampledness; ε-floor; A/B vs v1.0 fixed watchlist. Requirements: COVERAGE-01..05.
- [ ] **Phase 26: Live Engine Performance Dashboard** — `/insights` "Engine Performance" tab; daily learning feed; Brier-lift over time; cell-space coverage heatmap; ESS-gated metrics. Requirements: DEMO-01..06.
- [ ] **Phase 27: Public Per-Report Calibration Trail + Model Card** — public-readable trail page; aggregate-only public stats; Mitchell 2019 model card. **Entry gate: legal counsel engaged.** Requirements: DEMO-07..11.

### Parallelization Opportunities

After Phase 22 ships, Phases 23 / 24 / 26 share no files and can be planned in parallel. Phase 27 depends on Phase 26's metrics.

### Definition of Done

Per user direction: "industry-standard ML model and product that works perfectly for what it is supposed to do."

1. Drift detector live with ESS down-weighting > 30-day-old observations
2. Hierarchical pooling demonstrably accelerates sparse-cell learning vs no-pool control
3. Regime feature integrated with deterministic labels for all snapshots (live + backfill)
4. ≥1 cell with FDR-corrected, Purged-CV out-of-sample Brier-lift > 5% vs null
5. Composite signal block in every report (headline probability + CI + per-class breakdown)
6. Counterfactual deltas in every report
7. Adaptive watchlist live and measurably accelerating cell saturation
8. Backfill universe ≥100 tickers × 5 years with point-in-time correctness
9. Performance dashboard live at `/insights` with daily learning feed
10. Public calibration trail published with legal sign-off and aggregate-only metrics

### Defensive Engineering Mandate (cross-cutting)

Every phase plan must include prevention work for the pitfall(s) it owns. Specifically:
- Every phase touching LearnedPattern must record `n_trials_attempted` (FDR denominator)
- Every CV must use Purged K-Fold + Embargo (not random splits)
- Every new metric must document its operational action (no vanity metrics)
- Every posterior surface must show ESS, not raw N
- Every phase that ships in production must run vitest + Playwright before commit

---

## Phase Details

### Phase 19: Cipher v2.0 Excellence
**Goal**: Aggressively improve Cipher's data, sentiment, and ML pipelines to industry-standard quant-grade quality — additive only (no functionality removed), agent-executable end-to-end with shadow A/B → atomic cutover. Absorbs the original v2.0 P19 (Hierarchical Priors / Partial Pooling) into Wave A as Plan 19-A-07.
**Depends on**: Phase 18 (post-Phase-18 baseline at commit `ef52789`)
**Requirements**: CORE-ML-11, CORE-ML-12, CORE-ML-13, CORE-ML-14
**Success Criteria** (what must be TRUE):
  1. `npm run model-card-status` exits zero — engine reports as "industry-standard ML"
  2. Hierarchical Bayesian pooling demonstrably accelerates sparse-cell learning ≥30% vs no-pool control (preserved from absorbed P19)
  3. CPCV + DSR + PBO primitives available in `learning.ts` and gating alpha claims
  4. Conformal prediction CI bands surfaced in EngineCalibrationPanel alongside Bayesian CI
  5. Rolling 20d rank-IC monitor live for all 4 signal classes with `ic_decay_flag` populated
  6. FinSentLLM ensemble (FinGPT + Mistral + FinBERT) live, scoring ≥95% of community chatter
  7. Structured citations with mandatory URLs for ≥90% of analyst/news claims
  8. Model cascade router live (Haiku draft → Gemini Pro on high-stakes)
  9. Cross-class contradiction detector live and flagging at least one historical case
  10. Source-package median latency drops by ≥40% (Tiingo + Twelve Data + Upstash Redis caching)
  11. Anthropic-search hot-path call count drops by ≥80% (Exa primary)
  12. Firecrawl remains primary community ingestion (per user direction); Swaggystocks + ApeWisdom + Quiver supplemental
  13. Yahoo / Finnhub / Polygon / Anthropic-search remain wired up as fallbacks (no functionality removed)
  14. All shadow A/B verdicts PASS; old code paths deleted; zero feature flags from this effort remain in `features.ts`
  15. Full test suite (vitest + integration + Playwright) green on `main` post-cleanup
**Plans**: 30 plans across 4 waves (Z=infra, A=ML hygiene + quant + hierarchical, B=data, C=sentiment+reasoning)

Plans:
- [x] 19-Z-01: features.ts flag matrix + env wiring (3-mode flags: off/shadow/on)
- [x] 19-Z-02: ShadowComparison + RollbackLog Prisma schema (additive, nullable)
- [x] 19-Z-03: shadow-runner + shadow-verdict CLI (PASS/FAIL/HOLD verdicts)
- [x] 19-Z-04: model-card-status script (composite Phase 19 done gate)
- [x] 19-A-01: decayWeights lambda guard + HYPERPARAMETERS Zod schema (Phase 18 silent bug fix)
- [x] 19-A-02: Brier OOS split bug fix + look-ahead audit on buildTraceForOutcome
- [x] 19-A-03: Conformal prediction primitive (Vovk-Romano) + EngineCalibrationPanel surface
- [x] 19-A-04: DSR + PBO + CPCV primitives (Lopez de Prado) — unblocks v2.0 P21
- [x] 19-A-05: Rolling 20d rank-IC monitor + alpha-decay-watch cron (completed 2026-05-08; benchmark 356ms)
- [x] 19-A-06: Calibration validation harness — reliabilityDiagram + hosmerLemeshow + scripts/calibration-report.ts → /tmp/calibration-reports/<date>.md (completed 2026-05-08; 9/9 tests GREEN; institutional class flagged miscalibrated p=0.044 on baseline run)
- [x] 19-A-07: Hierarchical Bayesian pooling — empirical Bayes priors (absorbed from original v2.0 P19) (completed 2026-05-09; CORE-ML-11..14 verified; convergence test 50% speedup on n_local<10; cron + read-time + sweep + audit all landed flag-off; shadow lifecycle deferred to operator)
- [x] 19-B-01: Upstash Redis client + cache-keys + TTL config (graceful degrade) (completed 2026-05-08; 5/5 unit tests GREEN; @upstash/redis@^1.38.0 pinned; cached() + invalidate() with transparent Redis-outage fallthrough per D-24; CACHE_KEYS + TTL_SECONDS centralized; barrel src/lib/data/cache/index.ts for Wave B adapters; FEATURE_DATA_CACHE flag deferred to 19-B-08 rollout per plan preamble)
- [x] 19-B-02: Retry + exponential backoff wrapper (5xx + network only) (completed 2026-05-08; 11/11 tests GREEN; 5xx + ECONNREFUSED/ENOTFOUND/ETIMEDOUT/ECONNRESET/EAI_AGAIN retried; 4xx incl. 401/403/404/408/429 surfaced immediately per D-25; full jitter on by default)
- [x] 19-B-03: Tiingo adapter (point-in-time fundamentals + EOD) (completed 2026-05-08; 8/8 unit tests + 1 live-gated GREEN; fetchTiingoQuote + fetchTiingoFundamentals returning canonical MarketDataSection / FundamentalsSection shapes; cached(:tiingo, 5min/24h) + withRetry(3x, 5xx+network only) per RESEARCH Pattern 2; T-19-B-03-01 mitigated via sentinel-key spy test — Authorization: Token header only, no URL templating, console.warn logs err.message only; FEATURE_TIINGO_PRIMARY flag stays off — adapter dormant until 19-B-06 wires merge ladder)
- [x] 19-B-04: Twelve Data adapter (fundamentals) — completed 2026-05-09
- [x] 19-B-05: Exa 2.0 adapter + Anthropic-search fallback wiring (completed 2026-05-10; 8/8 unit tests GREEN; fetchExaNews + fetchExaAnalystSentiment returning canonical NewsSection / AnalystSentimentSection shapes — interchangeable with anthropic-search.ts so 19-B-06 merge ladder can do `fetchExaNews(t) ?? fetchNews(t)`; cached(news:TICKER:exa[-analyst], 30min) + withRetry(3x, 5xx+network) per Wave-B contract; custom isExaRetryable classifier accepts both e.status and ExaError.statusCode; T-19-B-05-01 mitigated via sentinel-key spy test — SDK reads key at construction, wrapper never logs raw key; exa-js@^2.12.1 pinned (RESEARCH-verified); D-32 honored — anthropic-search.ts unchanged, stays as fallback per RESEARCH Pitfall 7; FEATURE_EXA_PRIMARY default off — primitive dormant until 19-B-06 wires merge ladder; SDK migration: search() not deprecated searchAndContents() per exa-js v2.12.1 deprecation notice)
- [x] 19-B-06: source-package.ts merge precedence reorder + shadow A/B + cutover (code-side completed 2026-05-08; FieldOrigin extended additively with 'tiingo'|'twelvedata'|'exa'|'anthropic-search'; combinedMode helper exported with 6-permutation unit-test coverage matrix per T-19-B-06-04; collectAllData refactored into buildSourcePackageOldLadder + buildSourcePackageNewLadder gated by runWithShadow('source-package-merge', ...); 5 live-DB integration tests covering off/shadow/on modes + setImmediate non-propagation; Yahoo/Finnhub/Polygon/Anthropic-search adapters preserved per D-32; cutover-time grep pattern registered in scripts/model-card-grep-patterns.json with post_cutover:true; full project unit suite 644/649 GREEN; tsc --noEmit clean; Tasks 5b–5g [env flip → 3-7d shadow → verdict CLI → cutover PR → 7d hatch → flag-removal PR] operator-driven over calendar days)
- [x] 19-B-07: Vercel Runtime Cache integration (10min SourcePackage idempotency) (code-side completed 2026-05-08; getCachedSourcePackage in src/lib/data/cache/runtime-cache.ts wraps collectAllData with Next cache-components 'use cache' directive + unstable_cacheLife({revalidate: 600, expire: 600}) per D-30 10min idempotency target; wired at /api/research/[ticker]/route.ts via runWithShadow('runtime-cache', ...) on FEATURES.data_cache_mode — flag default off; experimental.cacheComponents + experimental.useCache enabled in next.config.ts; 5/5 unit tests GREEN (parity-test pattern per plan's Task 2 alternative — directive itself is Next-compiler-only, can't be exercised in vitest); full project unit suite 649/654 GREEN; tsc --noEmit clean; two-layer shadow architecture established (outer cache-vs-no-cache + inner 19-B-06 ladder shadow); deviation: used Next 15.5 surface 'use cache' / unstable_cacheLife rather than Next 16's 'use cache: remote' / cacheLife per plan's Task 1 NOTE TO EXECUTOR authorization — forward-compatible one-character swap when Next 16 lands via 19-B-08; Task 6 [env flip → 3-7d shadow → verdict CLI → cutover PR → 7d hatch → flag-removal PR] operator-driven over calendar days)
- [x] 19-B-08: Feature flag rollout + dual-write verification (driving plan) (code-side completed 2026-05-10; scripts/wave-b-rollout-status.ts surfaces 12 Wave B gates [2 child verdicts × 4 flag-removed × 4 D-32 fallbacks × 1 fallback wiring × 1 grep-pattern registry] in one CLI; buildCompositeVerdictReport / writeCompositeVerdictReport materialize shadow-reports/19-B-08.json matching plan Task 4 schema [plan_id, verdict, composite_metrics, child_plans, fallback_adapters_preserved, child_verdicts, timestamp]; 4 Wave B post-cutover grep patterns registered in scripts/model-card-grep-patterns.json with post_cutover:true [wave-b-source-package-merge-flag-readsite, wave-b-runtime-cache-flag-readsite, wave-b-runWithShadow-source-package-merge, wave-b-runWithShadow-runtime-cache] — model-card-status will block flag-removal PRs that leave dead readsites; tests/d32-fallback-adapters.test.ts permanent CI rule blocks T-19-B-08-02 fallback-adapter deletion; full project unit suite 696/701 GREEN [+47 new: 32 unit + 3 CLI + 12 D-32]; tsc --noEmit clean; smoke run: `npm run wave-b-rollout-status` reports PENDING [exit 2] in current state — verdict files deferred, flags still in features.ts, fallbacks preserved, grep patterns registered; multi-day operator lifecycle [env flips × 3-7d shadow × cutover PRs × 7d hatch × flag-removal PRs across 4 flags] deferred per 19-A-07/19-B-06/19-B-07 precedent — `npm run wave-b-rollout-status` is the one-command operator entry point at every checkpoint)
- [x] 19-C-01: HF Inference Endpoint + FinSentLLM client (FinGPT v3 + Mistral + FinBERT) (completed 2026-05-10; @huggingface/inference 4.13.15 pinned; classifyFinGPT/classifyMistralFin/classifyFinBERT primitives with uniform SentimentScore + null-sentinel error contract per D-33; 4/4 unit tests GREEN, full suite 482/485; 3 HF Inference Endpoint provisionings deferred to operator [User Setup Required]; flag-off lands per D-09 / D-10; verbatim impl-plan test block had two latent bugs fixed inline [Rule 1])
- [x] 19-C-02: Ensemble meta-classifier (weighted avg by confidence + agreement metric) (completed 2026-05-10; ensembleSentiment(text) → EnsembleResult composes 19-C-01 primitives via Promise.allSettled; pinned formulas score=Σ(s×c)/Σ(c), agreement=1-std, agreement=null at n<2; wired into source-package.ts via runWithShadow('finsentllm-ensemble'); SentimentIntelligenceSection adds optional finsentllm_score + model_agreement; 8/8 unit tests GREEN, 4/4 live-DB integration tests GREEN, full suite 595/598; flag-OFF lands per D-09 / D-10; D-05 lifecycle deferred to operator per 19-A-07/19-C-04 pattern; HF endpoint provisioning still gating shadow per 19-C-01 SUMMARY)
- [x] 19-C-03: Reputation-weighted StockTwits aggregation (completed 2026-05-08; 7/7 unit tests GREEN; flag-OFF lands; D-05 lifecycle deferred to operator per 19-A-07/19-C-04 pattern; 24h TTL cache shape matches cached() for one-line 19-B-01 migration)
- [x] 19-C-04: Options term-structure 30/60/90d + IV regime gate (completed 2026-05-08; 8/8 unit tests GREEN; flag-OFF lands; D-05 lifecycle deferred to operator per 19-A-07 pattern; lazy-prisma fix in shadow-runner [Rule 1])
- [x] 19-C-05: Swaggystocks + ApeWisdom adapters (supplemental, Firecrawl stays primary)
- [x] 19-C-06: Quiver adapter (insider + congressional, optional flag) (completed 2026-05-10; fetchQuiverInsider + fetchQuiverCongressional in src/lib/data/adapters/quiver.ts; opt-in via QUIVER_API_KEY env per D-38 — both fetchers short-circuit to null when key unset, no fetch issued; Bearer auth header never URL-interpolated; cached 24h via Wave B Upstash helper; retry 3x on 5xx + network via withRetry; 4xx surfaces as null without retry; 7/7 unit tests GREEN; wired additively into lightweightCommunityScan EnrichedSnapshot.quiver_insider/quiver_congressional via Promise.all + .catch(()=>null) — no shadow needed [purely additive]; deviation: plan Task 4 referenced communityWithSupplemental from 19-C-05 [not yet implemented] — wired directly into lightweightCommunityScan to preserve plan spirit while staying forward-compatible)
- [x] 19-C-07: Structured citation schema { source, url, confidence, date_retrieved }
- [x] 19-C-08: CoVe two-pass wrapper (Gemini draft → NLI verification) (completed 2026-05-08; runCoVe in src/lib/reasoning/cove.ts runs Pass-2 NLI verification on 3 verification claims emitted by Gemini in Pass 1; distilbert-mnli chosen over FinBERT-tone via 30-claim stratified fixture (28/30 vs 22/30); wired via runWithShadow('cove-two-pass', ...) in runGeminiAnalysis around the existing model-router shadow; AnalysisResult gains optional cove_verified + verification_claims; nli-verifier.ts demoted to a re-export of cove.nliVerify so 19-C-10 contradiction-detector and CoVe share one verifier; 6/6 unit tests GREEN; full vitest suite 595 passed; shadow lifecycle deferred to operator)
- [x] 19-C-09: Model cascade router + cost telemetry (Haiku/Flash/Pro) (completed 2026-05-10; routeModel + estimateCost pure functions; geminiRouted wrapped via runWithShadow('model-router', ...) in runGeminiAnalysis; cost telemetry persisted into existing LearningEvent table — zero schema changes; 8/8 unit tests GREEN; flag-off cutover deferred to operator)
- [x] 19-C-10: Cross-class contradiction detector (NLI on class posteriors) (completed 2026-05-09; detectContradictions runs NLI on 4-choose-2=6 pairs of class posteriors per D-42; severity threshold 0.3; warnings surfaced additively in EngineCalibrationPanel; DETECTION-ONLY mode permanent for Phase 19 — never gates report output; 6/6 unit tests GREEN; full vitest suite 577 passed; pre-19-C-08 NLI shim at src/lib/sentiment/nli-verifier.ts; shadow lifecycle deferred to operator)
- [x] 19-C-11: Arctic Shift one-time historical Reddit backfill (training corpus)

---

## Phase Numbering

- Integer phases (18, 19, 20, ..., 27): v2.0 milestone work
- Decimal phases (18.1, 18.2): Urgent insertions (marked with INSERTED)

Continues from where v1.0 left off. v2.0 phases were sequenced by dependency, not numerically (P18 → P20 → P19 → P25 → P21 → P22 → P23/24/26 → P27).
