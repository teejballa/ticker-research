# Cipher v2.0 Excellence — Design Document

**Status:** Approved · 2026-05-07
**Author:** brainstormed with Claude (Opus 4.7, 1M ctx)
**Baseline:** post-Phase-18 (commit `ef52789`, "phase 18 — 11/11 plans, nyquist_compliant: true")
**Scope:** Brownfield additive overhaul. No functionality removed. Existing v2.0 ML sequence (P19-P27) unblocked, not delayed.

---

## 1 — Executive Summary

The just-shipped Phase 18 (time-decay + ESS + Page-Hinkley + confirmedDrift) is the keystone of the v2.0 milestone. The remaining v2.0 phases (P19-P27) cover hierarchical pooling, regime, lift-gated CV, isotonic calibration, composite signals, counterfactuals, bandits, dashboard, and model card.

A focused audit of the current codebase and 2026 industry SOTA exposed three gap classes that the v2.0 sequence does **not** address:

1. **ML Hygiene + Quant-Grade Validation** — silent bugs in Phase-18 primitives and missing techniques (CPCV, DSR, PBO, conformal prediction, rolling-IC alpha-decay monitor) that every serious quant fund uses
2. **Data Layer Modernization** — single-source dependence (Yahoo / Finnhub / Polygon / Anthropic-search) with no caching, no retries, ~$200/mo of avoidable spend
3. **Sentiment + Reasoning Excellence** — naive sentiment (no FinBERT-class models), fabricated citations, no model routing, no contradiction detection

This design proposes three **parallel tracks** that ship alongside (not in place of) the v2.0 ML sequence:

| Track | Phase ID | Theme | Duration |
|---|---|---|---|
| A | 18.1 | ML Hygiene + Quant-Grade Validation | 1-2 weeks |
| B | 28 | Data Layer Modernization | 2-3 weeks |
| C | 29 | Sentiment + Reasoning Excellence | 4-5 weeks |

Total monthly infra cost after rollout: **≤ $135/mo** (replaces ~$200/mo of Anthropic-search burn).

The effort is **agent-executable end-to-end** (shadow testing, verdict, cutover, cleanup), with no functionality removed and explicit hard-gates on completion.

---

## 2 — Architecture (the three parallel tracks)

### 2.1 — Track A: ML Hygiene + Quant-Grade Validation (Phase 18.1)

Additive primitives in `src/lib/learning.ts`. No edits to existing pure-function logic.

```
Track A deliverables:
├ decayWeights lambda guard + Zod schema validation for HYPERPARAMETERS
├ Brier out-of-sample split bug fix (n<16 edge case)
├ Look-ahead bias audit on buildTraceForOutcome
├ Conformal prediction primitive (Vovk-Romano coverage)
├ Deflated Sharpe Ratio (DSR) primitive (Bailey-Lopez de Prado)
├ Probability of Backtest Overfitting (PBO) primitive
├ Combinatorial Purged K-Fold CV (CPCV) primitive
├ Rolling 20d rank-IC monitor + cron + ic_decay_flag column
├ Calibration validation harness (reliability diagram + Hosmer-Lemeshow)
└ scripts/dsr-pbo-audit.ts — gates alpha claims with quant-grade tests
```

### 2.2 — Track B: Data Layer Modernization (Phase 28)

Adapters in new directory `src/lib/data/adapters/`. Existing fetchers (`yahoo.ts`, `finnhub.ts`, `polygon.ts`, `anthropic-search.ts`) **stay in place** as fallbacks. Merge precedence reordered to put new adapters first.

```
Track B deliverables:
├ Tiingo adapter ($30/mo, point-in-time fundamentals + EOD)
├ Twelve Data adapter ($29/mo, fundamentals)
├ Exa 2.0 adapter (news/analyst, replaces Anthropic-search hot path)
├ Upstash Redis cache layer (5min quote TTL, 24h fundamentals TTL)
├ Vercel Runtime Cache for SourcePackage (10min idempotency)
├ Retry + exponential backoff wrapper around all fetchers
└ Merge precedence: tiingo → twelvedata → yahoo → finnhub → polygon
```

**Firecrawl is NOT touched in Track B.** Community intelligence stays Firecrawl-primary; community supplemental sources are scoped to Track C.

### 2.3 — Track C: Sentiment + Reasoning Excellence (Phase 29)

```
Track C deliverables:
├ Community ingestion overhaul:
│   ├ Firecrawl (PRIMARY — current implementation, unchanged, "very reliable")
│   ├ Swaggystocks adapter (SUPPLEMENTAL — real-time r/WSB chatter)
│   ├ ApeWisdom adapter (SUPPLEMENTAL — trending tickers across r/WSB + r/crypto + 4chan)
│   ├ Quiver Quantitative adapter (OPTIONAL flag — insider + congressional)
│   ├ Subreddit expansion via Firecrawl: r/WSB + r/stocks + r/SecurityAnalysis + r/algotrading
│   └ Arctic Shift one-time historical backfill (free Pushshift successor, training only)
├ FinSentLLM ensemble classifier:
│   ├ FinGPT v3 (HuggingFace Inference Endpoint)
│   ├ Mistral 7B finance-tuned (HuggingFace Inference Endpoint)
│   ├ FinBERT (existing public weights)
│   └ Meta-classifier — learns which model to trust per context
├ Reputation-weighted StockTwits aggregation (replaces naive count)
├ Options term-structure 30/60/90d weighted by OI + IV regime gate
├ Optional: Unusual Whales options-flow ($50/mo, dark pools + flow signals)
├ Structured citation schema { source, url, confidence, date_retrieved }
├ Chain-of-Verification (CoVe) two-pass on Gemini output
├ Model cascade routing (Haiku draft → Gemini Pro on high-stakes tickers)
├ Cross-class contradiction detector (NLI on technical/insider/institutional posteriors)
└ engine_calibration null-fallback (sentinel handling)
```

---

## 3 — File map

```
src/lib/
├ data/
│  ├ adapters/                          NEW — Track B
│  │  ├ tiingo.ts
│  │  ├ twelve-data.ts
│  │  ├ exa-search.ts
│  │  ├ swaggystocks.ts                 (Track C)
│  │  ├ apewisdom.ts                    (Track C)
│  │  ├ quiver.ts                       (Track C)
│  │  └ unusual-whales.ts               (Track C)
│  ├ cache/                             NEW — Track B
│  │  ├ upstash.ts
│  │  ├ runtime-cache.ts
│  │  └ cache-keys.ts
│  ├ retry.ts                           NEW — Track B
│  ├ source-package.ts                  EDIT — merge precedence + cache hooks
│  ├ merge.ts                           EDIT — extend FieldOrigin union
│  ├ stocktwits.ts                      EDIT — add reputation-weighted mode (Track C)
│  ├ options-sentiment.ts               EDIT — term-structure 30/60/90d (Track C)
│  ├ yahoo.ts / finnhub.ts / polygon.ts UNCHANGED — kept as fallbacks
│  └ anthropic-search.ts                UNCHANGED — kept as fallback for Exa
├ sentiment/                            NEW — Track C
│  ├ finsentllm.ts
│  ├ ensemble.ts
│  ├ contradiction-detector.ts
│  └ citation-schema.ts
├ reasoning/                            NEW — Track C
│  ├ cove.ts
│  ├ router.ts
│  └ alpha-decay-monitor.ts             (also Track A)
├ shadow/                               NEW — autonomous cutover infra
│  ├ shadow-runner.ts
│  ├ shadow-comparison.ts
│  └ verdict.ts
├ features.ts                           NEW — feature flag matrix
├ learning.ts                           EDIT (Track A — additive primitives only)
├ engine-context.ts                     EDIT — consume conformal CI + ic_decay_flag
├ gemini-analysis.ts                    EDIT — citation schema + CoVe + router
└ research-brief.ts                     EDIT — structured citations in prompt

src/app/api/cron/
├ learn/route.ts                        EDIT (Track A — log DSR/PBO/IC)
├ alpha-decay-watch/route.ts            NEW (Track A — daily IC computation)
└ ic-recompute/route.ts                 NEW (Track A — recompute rolling IC per class)

scripts/
├ calibration-report.ts                 NEW (Track A)
├ dsr-pbo-audit.ts                      NEW (Track A)
├ shadow-verdict.ts                     NEW (autonomous cutover infra)
├ arctic-shift-backfill.ts              NEW (Track C, one-time)
└ model-card-status.ts                  NEW — gates "industry-standard ML" claim
```

---

## 4 — Data flow (post-changes)

```
User → POST /api/research/[ticker]
  ↓
[1] Cache check: SourcePackage in Vercel Runtime Cache (10min idempotency)
    HIT  → skip to step 6
    MISS → proceed
  ↓
[2] Parallel fan-out (Promise.allSettled, retry-wrapped):
    ┌─ Market data ladder (first non-null wins):
    │   tiingo → twelve-data → yahoo → finnhub → polygon
    │   each leg retried 3× exponential backoff
    │   each result cached in Upstash: 5min for prices, 24h for fundamentals
    ├─ News + analyst:
    │   exa-search (primary) + anthropic-search (fallback if Exa errors)
    ├─ Options sentiment:
    │   yahoo-finance2 chains @ 30/60/90d → OI-weighted P/C ratio + IV regime gate
    ├─ StockTwits:
    │   stocktwits.ts in reputation-weighted mode
    └─ Community intelligence:
        ┌─ Firecrawl (PRIMARY)
        ├─ Swaggystocks (SUPPLEMENTAL)
        ├─ ApeWisdom (SUPPLEMENTAL)
        └─ Quiver (OPTIONAL flag)
        → all merged into community_aggregated JSON
  ↓
[3] FinSentLLM ensemble runs over raw community text + StockTwits messages
    → produces { score, confidence, model_agreement } per source
  ↓
[4] Build SourcePackage (existing structure, additive fields only)
    → write to Vercel Runtime Cache
  ↓
[5] POST /api/analysis/[ticker]
  ↓
[6] runGeminiAnalysis(pkg)
    a. engine-context lookup (now includes conformal CI + ic_decay_flag)
    b. research-brief assembles prompt with structured citations
    c. Router decision:
        - Low-stakes ticker → Haiku draft only
        - Standard ticker → Gemini Flash (current)
        - High-stakes (large cap OR high disagreement OR ic_decay_flag=true)
          → Haiku draft → Gemini Pro synthesis
    d. CoVe two-pass:
        - Pass 1: Gemini emits AnalysisResult + 3 verification claims
        - Pass 2: Independent NLI check vs SourcePackage
        - Contradictions → flagged in source_warnings
    e. Cross-class contradiction detector over technical/insider/institutional posteriors
    f. Schema validate (Zod) — citations_v2 with mandatory URLs
  ↓
[7] Persist Report to Neon (existing path)
  ↓
[8] SSE stream → client renders ResearchReport (existing UI, no UX regression)
```

---

## 5 — Sequencing

```
Week 1-2  Track A (Phase 18.1) ── ships first ── unblocks v2.0 P21
Week 1-3  Track B (Phase 28)   ── parallel    ── independent of A & C
Week 2-5  Track C (Phase 29)   ── parallel    ── depends on Track A flag infra only

Week 6+   v2.0 P19, P20 unaffected — start as scheduled
          v2.0 P21 now uses CPCV/DSR/PBO from Track A
          v2.0 P22 now uses conformal + isotonic together
          v2.0 P27 model card consumes Track A + C deliverables
```

Constraints:
- Track A 18.1-04 (DSR/PBO/CPCV primitives) blocks v2.0 P21 (lift-gated CV)
- Track B 28-01 (cache infra) blocks 28-03/04/05 (adapters use cache)
- Track C 29-01 (HF client) blocks 29-02 (ensemble)
- Track C 29-02 (ensemble) blocks 29-08 (CoVe — uses ensemble for verification)
- All three tracks gated by feature flags

---

## 6 — Schema changes (additive only)

```sql
ALTER TABLE "LearnedPattern"
  ADD COLUMN "rolling_ic_20d"   DOUBLE PRECISION,
  ADD COLUMN "ic_decay_flag"    BOOLEAN DEFAULT FALSE,
  ADD COLUMN "dsr"              DOUBLE PRECISION,
  ADD COLUMN "pbo"              DOUBLE PRECISION,
  ADD COLUMN "conformal_low"    DOUBLE PRECISION,
  ADD COLUMN "conformal_high"   DOUBLE PRECISION;

ALTER TABLE "SentimentSnapshot"
  ADD COLUMN "community_aggregated" JSONB,
  ADD COLUMN "citations_v2"         JSONB,
  ADD COLUMN "finsentllm_score"     DOUBLE PRECISION,
  ADD COLUMN "model_agreement"      DOUBLE PRECISION;

CREATE TABLE "CommunityChatter" (
  id              TEXT PRIMARY KEY,
  ticker          TEXT NOT NULL,
  source          TEXT NOT NULL,
  url             TEXT,
  raw_text        TEXT,
  finsentllm_score DOUBLE PRECISION,
  reputation_weight DOUBLE PRECISION DEFAULT 1.0,
  scraped_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chatter_ticker_idx UNIQUE (ticker, source, url, scraped_at)
);
CREATE INDEX "CommunityChatter_ticker_scraped_at_idx" ON "CommunityChatter" (ticker, scraped_at DESC);

CREATE TABLE "ShadowComparison" (
  id              TEXT PRIMARY KEY,
  path_name       TEXT NOT NULL,
  ticker          TEXT,
  old_output_json JSONB,
  new_output_json JSONB,
  old_latency_ms  INTEGER,
  new_latency_ms  INTEGER,
  old_cost_usd    DOUBLE PRECISION,
  new_cost_usd    DOUBLE PRECISION,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "ShadowComparison_path_created_idx" ON "ShadowComparison" (path_name, created_at DESC);

CREATE TABLE "RollbackLog" (
  id          TEXT PRIMARY KEY,
  feature_flag TEXT NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

All ADDs are nullable with sensible defaults. Existing rows untouched. No backfill required at migration time.

---

## 7 — Feature flag matrix

```ts
// src/lib/features.ts
export const FEATURES = {
  // Track A
  conformal_intervals_enabled:     env('FEATURE_CONFORMAL', 'false') === 'true',
  cpcv_enabled:                     env('FEATURE_CPCV', 'false') === 'true',
  ic_decay_monitor:                 env('FEATURE_IC_MONITOR', 'false') === 'true',
  // Track B
  data_cache_enabled:               env('FEATURE_DATA_CACHE', 'false') === 'true',
  tiingo_primary:                   env('FEATURE_TIINGO_PRIMARY', 'false') === 'true',
  twelvedata_primary:               env('FEATURE_TWELVEDATA_PRIMARY', 'false') === 'true',
  exa_primary:                      env('FEATURE_EXA_PRIMARY', 'false') === 'true',
  // Track C
  finsentllm_ensemble:              env('FEATURE_FINSENTLLM', 'false') === 'true',
  community_supplemental:           env('FEATURE_COMMUNITY_SUPP', 'false') === 'true',
  cove_two_pass:                    env('FEATURE_COVE', 'false') === 'true',
  model_router:                     env('FEATURE_MODEL_ROUTER', 'false') === 'true',
  contradiction_detector:           env('FEATURE_CONTRADICTION', 'false') === 'true',
  options_term_structure:           env('FEATURE_OPTIONS_TS', 'false') === 'true',
  reputation_weighted_stocktwits:   env('FEATURE_ST_REPUTATION', 'false') === 'true',
} as const;

// Each flag has three modes via env triple: 'false' | 'shadow' | 'true'
// Shadow mode runs both paths; true mode runs new path only.
```

Every flag defaults `false` on first deploy. Lifecycle: `false` → `shadow` → `true` → flag removed entirely.

---

## 8 — Shadow A/B → atomic cutover protocol (REPLACES 60-day retention)

### 8.1 — Per-path lifecycle

```
[1] Land new code behind flag (default false) → merge to main → deploy
[2] Flip env flag to "shadow" via Vercel CLI/API
    Both paths run; old returns to user; new logged to ShadowComparison
[3] Shadow window: 3-7 days OR N≥200 requests, whichever sooner
[4] npm run shadow-verdict <path> reads ShadowComparison rows, computes:
    - latency_delta_p50, latency_delta_p95
    - cost_delta_per_request
    - output_disagreement_rate (Jaccard over fields)
    - quality_delta (Brier/IC where outcomes resolved, else field-fill rate)
    Verdict:
      PASS  if new ≥ old on quality AND (latency OR cost) AND disagreement < 5%
      FAIL  if new < old on quality OR latency_p95 ≥ 2× old OR cost > 1.5× old
      HOLD  if quality unmeasurable yet → extend shadow window
[5] PASS  → Open cutover PR: flip flag default to true, DELETE OLD CODE in same commit
            Keep flag check itself in code 7 days as instant-rollback hatch
            After 7 quiet days (no RollbackLog rows) → final PR removes flag entirely
    FAIL  → File failure report, redesign new path, re-run shadow
```

### 8.2 — Why this is safe in one decisive test

1. Shadow mode = zero user impact. Old path is what users see.
2. Verdict is automated, not subjective.
3. Quality gate is measured on real outcomes, not vibes.
4. Rollback is one env-var flip for 7 days post-cutover.
5. Total dead-code residency ≤ ~14 days, not 60.

### 8.3 — Background execution to avoid latency

New path runs in `setImmediate()` or background worker — old path returns first; new path latency tracked but doesn't gate user response.

### 8.4 — TTL hygiene

ShadowComparison rows older than 30 days are garbage-collected by daily cron.

---

## 9 — Autonomous Execution Clause

> **Every plan in this effort is agent-executable end-to-end. The agent (Claude) is responsible for:**
>
> 1. Landing new code behind the flag (via `/gsd-execute-phase`)
> 2. Flipping the flag to `shadow` in Vercel env (via Vercel CLI / API)
> 3. Running shadow workload — for crons, this is automatic on schedule; for on-demand routes, the agent triggers N≥200 synthetic requests
> 4. Running `npm run shadow-verdict <path>` and reading the report
> 5. If PASS: opening the cutover PR with old code deleted in same commit, merging, deploying
> 6. If FAIL: opening a follow-up plan that addresses the failures, re-running shadow
> 7. Monitoring the 7-day rollback hatch — checking error rates daily; if clean, opening the final flag-removal PR
>
> **The user is not in the verdict loop.** The user receives a status report at each gate (shadow start, verdict, cutover, flag-removal) but does not need to authorize each step.

---

## 10 — Hard Cleanup Gate (per-plan Definition of Done)

> **A plan is NOT complete — and `/gsd-execute-phase` MUST refuse to mark it complete — until ALL of the following are true:**
>
> 1. Shadow verdict file `shadow-reports/<plan-id>.json` exists with `verdict: "PASS"`
> 2. The cutover PR is merged (old code deleted, new code is canonical)
> 3. 7 days have elapsed since cutover with zero rollback events recorded in `RollbackLog` table
> 4. Final flag-removal PR is merged (the feature flag check itself is gone from `features.ts`)
> 5. `npm test`, `npm run test:integration`, `npm run test:e2e` all green on `main` post-cleanup
>
> **Any plan stuck in shadow >14 days OR with FAIL verdict opens an automatic blocker plan** and surfaces a notification to the user.

---

## 11 — Composite Definition of Done (THIS EFFORT IS NOT SHIPPED UNTIL...)

This section is the user's hard contract. Per user direction 2026-05-07:

> *"This phase is not done until we have deleted old code and have a new industry standard, amazing, good, ML model."*

The v2.0 Excellence effort is **not done** until ALL of the following are true:

1. All three tracks (A/B/C) have every plan satisfying the Hard Cleanup Gate (§10)
2. **Zero feature-flag toggles remain** in `features.ts` from this effort
3. **Zero references to the old code paths** exist in the codebase (verified by grep post-cleanup, run as part of CI)
4. The model card draft (referenced in v2.0 P27) is updated to reflect:
   - FinSentLLM ensemble live
   - Conformal CIs surfaced in EngineCalibrationPanel
   - CPCV + DSR + PBO computed and gating alpha claims
   - Alpha-decay monitor live
   - Structured citations (≥90% of analyst/news claims have populated URLs)
5. **`npm run model-card-status`** reports the engine as **"industry-standard ML"**
   - This script is itself part of Track A
   - It asserts: conformal coverage validated, DSR > threshold, PBO < threshold, IC monitor live, ensemble live, structured citations live
   - Any missing component → script exits non-zero → effort blocked from being marked done

---

## 12 — Per-track success criteria

### 12.1 — Track A (Phase 18.1)

- decayWeights rejects `lambdaDays ≤ 0` with descriptive error
- Brier OOS split bug regression test green
- Conformal primitive: empirical coverage on synthetic data within ±2% of nominal 95%
- DSR + PBO golden-master tests pass against Lopez de Prado published examples
- CPCV: combinatorial fold counts match Lopez de Prado tables
- Rolling 20d rank-IC computed daily for all 4 signal classes
- ic_decay_flag fires for at least one class within 30 days of deployment (validates monitor)
- v2.0 P21 unblocked (can import CPCV/DSR/PBO from `learning.ts`)

### 12.2 — Track B (Phase 28)

- Source-package median latency drops by ≥40% (caching + Tiingo)
- Anthropic-search hot-path call count drops by ≥80% (Exa primary)
- Yahoo / Finnhub / Polygon / Anthropic-search remain wired up as fallbacks
- All adapters retried 3× with exponential backoff
- Cache miss rate <30% on warm production traffic
- Total Track B infra cost ≤ $65/mo (Twelve Data + Tiingo + Exa + Upstash)

### 12.3 — Track C (Phase 29)

- FinSentLLM ensemble score logged for ≥95% of community chatter rows
- Reputation-weighted StockTwits replaces naive count (verified in DB rows)
- Options term-structure 30/60/90d weighted by OI is the canonical put/call source
- ≥90% of analyst/news claims in reports have `url` populated in `citations_v2`
- CoVe two-pass active for high-stakes tickers (>20% of reports)
- Model router decisions logged + cost telemetry visible in `/insights`
- Cross-class contradiction detector flags ≥1 historical case in backfill (validates detector)
- Subreddit expansion live: Firecrawl scrapes r/WSB + r/stocks + r/SecurityAnalysis + r/algotrading
- Total Track C infra cost ≤ $85/mo (HF Inference + Quiver Hobbyist + Unusual Whales)

---

## 13 — Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| FinSentLLM Inference Endpoint cold-start latency | Medium | Warm-up pings every 5min; fallback to cached score on timeout |
| Exa returns lower-quality news than Anthropic-search for niche tickers | Medium | Dual-source for first 30 days; A/B Brier compare; auto-fallback if Exa null |
| Upstash Redis outage breaks fetches | High | Cache layer wrapper-only — miss path is "fetch as today" |
| CPCV/DSR/PBO off-by-one vs Lopez de Prado golden | High | Golden-master tests pinned to published numerical examples |
| Quiver/Swaggystocks rate-limited on production spike | Low | Both supplemental; Firecrawl+Stocktwits sufficient if these fail |
| Schema migration locks LearnedPattern table | Low | All ADDs nullable + default; Postgres skips full table rewrite |
| CoVe doubles Gemini cost | Medium | Router gates CoVe to high-stakes only; budget cap in env |
| Existing Phase 18 confirmedDrift logic affected | High | Track A is additive — confirmedDrift, decayWeights internals untouched |
| v2.0 P19-P27 blocked by these tracks | Critical | Track A finishes first (1-2 weeks); P19/P20 start immediately after |
| Shadow mode doubles request latency | Medium | New path runs in setImmediate() background; old returns first |
| ShadowComparison table grows unbounded | Low | TTL: rows older than 30 days cleaned by daily cron |
| Verdict gate too lenient → bad cutover | High | PASS requires non-regression on EVERY metric, not average |
| Auto-verdict masks edge cases | Medium | Verdict report flags any field with disagreement >20% even if average passes |

---

## 14 — Cost summary

| Component | Vendor | Monthly cost |
|---|---|---|
| Twelve Data (fundamentals) | Twelve Data | $29 |
| Tiingo (point-in-time + EOD) | Tiingo | $30 |
| Exa 2.0 (news/analyst) | Exa | ~$5 |
| Upstash Redis (cache) | Upstash | ~$5 |
| HuggingFace Inference Endpoints | HuggingFace | ~$10 |
| Quiver Hobbyist (insider/congressional, optional) | Quiver | $30 |
| Unusual Whales (options flow, optional) | Unusual Whales | $50 |
| **Total full stack** | | **≤ $135 / month** |

Replaces ~$200/mo of Anthropic-search burn → net **savings ~$65/mo** while gaining caching, retries, ensemble sentiment, structured citations, conformal CIs, alpha-decay monitor, and quant-grade validation.

---

## 15 — Implementation handoff

This design hands off to `superpowers:writing-plans` to generate three phase plans:

- `.planning/phases/18.1-ml-hygiene-quant-validation/` — Track A (~6 plans)
- `.planning/phases/28-data-layer-modernization/` — Track B (~8 plans)
- `.planning/phases/29-sentiment-reasoning-excellence/` — Track C (~11 plans)

Each generated plan **must** include:
- The Autonomous Execution Clause (§9) verbatim in its preamble
- The Hard Cleanup Gate (§10) verbatim in its Definition of Done
- A reference back to this design doc

The Composite Definition of Done (§11) is a milestone-level gate enforced by `npm run model-card-status` — added to CI as a required check on the v2.0 milestone close.

---

## 16 — Sign-off

- **Designed:** 2026-05-07
- **Approved by user:** 2026-05-07 (verbatim: "yes, but we are building on current, not restarting a new project" + "i think we do one big test then take out old code, not wait 60 days" + "make sure you can do it all yourself, the testing and deleting" + "This phase is not done until we have deleted old code and have a new industry standard, amazing, good, ML model.")
- **Next action:** invoke `superpowers:writing-plans` to generate phase plans for 18.1, 28, 29
