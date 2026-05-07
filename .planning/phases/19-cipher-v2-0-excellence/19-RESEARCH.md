# Phase 19: Cipher v2.0 Excellence — Research

**Researched:** 2026-05-06
**Domain:** Brownfield additive overhaul of three Cipher subsystems (data, sentiment/reasoning, ML hygiene + quant-grade validation) with shadow A/B → atomic cutover
**Confidence:** HIGH on stack/integration analysis (verified via codebase grep + npm registry + canonical docs); MEDIUM-HIGH on validation procedures (golden-master numerical anchors verified to paper-level via web search, but the chosen examples need pinning during 19-A-04 implementation); MEDIUM on ApeWisdom/Swaggystocks/Arctic Shift (community-discovered shapes, no official docs).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Wave structure**
- D-01: Phase 19 is split into four waves: Wave Z (4 plans, infra prereq), Wave A (7 plans, ML hygiene + quant + hierarchical), Wave B (8 plans, data), Wave C (11 plans, sentiment + reasoning). 30 plans total.
- D-02: Wave Z ships first (3 days). Waves A/B/C run in parallel after Z lands.
- D-03: Wave A absorbs the original v2.0 Phase 19 (Hierarchical Priors / Partial Pooling) as Plan 19-A-07. Original P19 acceptance criteria preserved.

**Autonomous execution (mandatory in every plan's preamble)**
- D-04: Agent (Claude) executes every plan end-to-end without user authorization between gates. User receives status reports but does not approve each step.
- D-05: Per-path lifecycle: land code (flag off) → flip to shadow → drive workload (≥200 req OR 3-7 days) → run `npm run shadow-verdict <plan-id>` → PASS = cutover PR with old code DELETED in same commit → 7-day rollback hatch → final flag-removal PR.
- D-06: Hard Cleanup Gate (Definition of Done for EVERY plan): `shadow-reports/<plan-id>.json verdict=PASS` AND cutover PR merged with old code deleted AND 7d post-cutover with zero RollbackLog entries AND flag-removal PR merged AND vitest+integration+e2e all green on main post-cleanup.
- D-07: `/gsd-execute-phase` MUST refuse to mark a plan complete until all five Hard Cleanup Gate conditions hold.

**Composite Phase 19 done gate**
- D-08: Phase 19 is not done until `npm run model-card-status` exits zero. Script asserts: conformal coverage validated, DSR > threshold, PBO < threshold, IC monitor live, hierarchical pooling live (parent_alpha/parent_beta populated for ≥80% of cells), FinSentLLM ensemble live, structured citations live (≥90% URL coverage), zero references to old code paths in tree, zero feature flags from this effort remaining in `features.ts`.

**Feature flag matrix (Wave Z deliverable)**
- D-09: Three-mode flag (`off` | `shadow` | `on`) per env triple. Lifecycle: off → shadow → on → flag removed entirely.
- D-10: All 15 flags default to `off` on first deploy. Each graduates independently after its own shadow verdict passes.

**Shadow A/B → atomic cutover protocol**
- D-11: PASS rule: new ≥ old on quality AND (latency OR cost) AND output disagreement < 5%
- D-12: FAIL rule: new < old on quality OR latency_p95 ≥ 2× old OR cost > 1.5× old
- D-13: HOLD rule: quality unmeasurable AND row count < 200 → extend window
- D-14: New path runs in `setImmediate()` background — old path returns first; new path latency tracked but doesn't gate user response
- D-15: ShadowComparison rows older than 30 days garbage-collected by daily cron
- D-16: Rollback = one env-var flip during the 7-day hatch. After 7 quiet days, second PR removes the flag entirely.

**Wave A — ML Hygiene + Quant-Grade Validation (7 plans)**
- D-17: Plan 19-A-01: `decayWeights` rejects `lambdaDays ≤ 0` with descriptive error; HYPERPARAMETERS validated at module load via Zod
- D-18: Plan 19-A-02: Brier OOS split bug — replace `max(1, n-14)` with time-based 80/20 split honoring chronology; embargo enforcement on `buildTraceForOutcome`
- D-19: Plan 19-A-03: Conformal prediction primitive (Vovk-Romano split-conformal); coverage validated within ±2% of nominal 1-α on synthetic data
- D-20: Plan 19-A-04: DSR (Bailey-Lopez de Prado), PBO (Bailey-Borwein-Lopez de Prado-Zhu), CPCV (Lopez de Prado 2018 ch.7) — all golden-master tested against published examples (≤1e-6 tolerance)
- D-21: Plan 19-A-05: Rolling 20d Spearman rank-IC per signal class; `ic_decay_flag = true` when `rolling_ic_20d < 0.02` for 5 consecutive days
- D-22: Plan 19-A-06: Calibration validation harness — reliability diagram (10 quantile bins) + Hosmer-Lemeshow chi-square test; output to `calibration-reports/<date>.md`
- D-23: Plan 19-A-07 (absorbed P19): Empirical Bayes hierarchical pooling; pool α/β across cells in same `(signal_class, cap_class)` group; per-cell shrinkage `α_pooled = (n × α_local + λ × α_group) / (n + λ)`; λ learned per group; falls back to flat prior when group n<5

**Wave B — Data Layer Modernization (8 plans)**
- D-24: Plan 19-B-01: Upstash Redis cache layer (`cached(key, fetcher, opts)` wrapper); graceful degrade on Redis outage (fall through to fetcher)
- D-25: Plan 19-B-02: Retry + exponential backoff wrapper (5xx + network errors only, NOT 4xx); 3 attempts, 100ms base
- D-26: Plan 19-B-03: Tiingo adapter (point-in-time fundamentals + EOD); $30/mo
- D-27: Plan 19-B-04: Twelve Data adapter (fundamentals); $29/mo
- D-28: Plan 19-B-05: Exa 2.0 adapter (news/analyst, replaces Anthropic-search hot path); ~$5/mo
- D-29: Plan 19-B-06: source-package.ts merge precedence reorder — new ladder: tiingo → twelvedata → yahoo → finnhub → polygon. Old ladder kept when flags off (no behavior change for current users). **Shadow A/B starts here.**
- D-30: Plan 19-B-07: Vercel Runtime Cache for SourcePackage (10min idempotency)
- D-31: Plan 19-B-08: Feature flag rollout + dual-write verification (process-only plan, drives the cutover for B-06/B-07)
- D-32: Yahoo / Finnhub / Polygon / Anthropic-search adapters remain wired up as fallbacks — NOT deleted from tree. Only the direct call from `source-package.ts` primary path is removed after shadow verdict passes.

**Wave C — Sentiment + Reasoning Excellence (11 plans)**
- D-33: Plan 19-C-01: HF Inference Endpoint clients for FinGPT v3, Mistral 7B finance-tuned, FinBERT; uniform `SentimentScore` interface; null sentinels on error (do not throw)
- D-34: Plan 19-C-02: Ensemble meta-classifier — weighted average of non-null scores (weight = confidence); agreement = 1 - std(scores); falls back to single available if 2+ models null
- D-35: Plan 19-C-03: Reputation-weighted StockTwits — `score = Σ(message_sentiment × user_reputation) / Σ(user_reputation)`; reputation from follower count + post history (cached per user 24h)
- D-36: Plan 19-C-04: Options term-structure 30/60/90d weighted by Open Interest; new IV regime classifier (high-IV regime flips put/call interpretation)
- D-37: Plan 19-C-05: Swaggystocks + ApeWisdom adapters (SUPPLEMENTAL); merged into `community_aggregated` JSONB column on SentimentSnapshot. **Firecrawl remains primary** per user direction 2026-05-07 ("firecrawl is very reliable").
- D-38: Plan 19-C-06: Quiver adapter (insider + congressional trades); OPTIONAL flag — only activates if `QUIVER_API_KEY` env set; ~$30/mo Hobbyist tier
- D-39: Plan 19-C-07: Structured citation schema `{ source, url, confidence, date_retrieved }`; replaces free-text `source_citation: string` in `AnalysisResultSchema`; mandatory URL for analyst/news claims at Zod validation time
- D-40: Plan 19-C-08: Chain-of-Verification (CoVe) two-pass — Pass 1: Gemini emits `AnalysisResult` + 3 verification claims; Pass 2: NLI check (FinBERT or distilbert-mnli) on each claim vs SourcePackage; contradictions flagged in `source_warnings`
- D-41: Plan 19-C-09: Model cascade router — `routeModel({ ticker, controversy, ic_decay_flag })` returns `'haiku' | 'gemini-flash' | 'gemini-pro'`; cost telemetry logged to LearningEvent for `/insights` dashboard
- D-42: Plan 19-C-10: Cross-class contradiction detector — NLI on pairs of class posteriors; severity threshold flagged in EngineCalibrationPanel; first cycle in detection-only mode (don't gate output)
- D-43: Plan 19-C-11: Arctic Shift one-time historical Reddit backfill (5y of v1.0 ticker universe); populates `CommunityChatter` historical rows for FinSentLLM training corpus; no shadow (one-time ingest)
- D-44: Subreddit expansion via Firecrawl (no new adapter needed): r/wallstreetbets + r/stocks + r/SecurityAnalysis + r/algotrading
- D-45: Optional: Unusual Whales options-flow adapter ($50/mo, dark pools + flow signals) — out of scope for initial Wave C plans, deferred to follow-up

**Schema additions (additive only — Plan 19-Z-02 + per-plan additions)**
- D-46: `LearnedPattern` adds: `rolling_ic_20d`, `ic_decay_flag` (default false), `dsr`, `pbo`, `conformal_low`, `conformal_high`, `parent_alpha`, `parent_beta`, `shrinkage_strength` — all nullable
- D-47: `SentimentSnapshot` adds: `community_aggregated` (Json), `citations_v2` (Json), `finsentllm_score`, `model_agreement` — all nullable
- D-48: New tables: `CommunityChatter` (id, ticker, source, url, raw_text, finsentllm_score, reputation_weight, scraped_at); `ShadowComparison` (id, path_name, ticker, old_output_json, new_output_json, latencies, costs, created_at); `RollbackLog` (id, feature_flag, reason, created_at)

**Cost envelope**
- D-49: Total monthly infra cost ≤ $135 (Twelve Data $29 + Tiingo $30 + Exa ~$5 + Upstash ~$5 + HF Inference ~$10 + Quiver $30 + Unusual Whales $50 if enabled)
- D-50: Replaces ~$200/mo of Anthropic-search burn → net savings ~$65/mo while gaining all the quant-grade primitives

**Testing requirements (per plan)**
- D-51: Vitest unit tests for every primitive
- D-52: Live-DB integration tests for cron + DB-touching code
- D-53: Playwright E2E tests for any UI surface change (e.g., EngineCalibrationPanel updates)
- D-54: Plan 18-10 hyperparameter sanity test (`tests/learning.hyperparameters.test.ts`) MUST stay green throughout — no regression to nyquist_compliant: true sign-off

### Claude's Discretion
- Internal naming of helper functions, test descriptions, error message wording
- Exact directory layout under `src/lib/sentiment/`, `src/lib/reasoning/`, `src/lib/shadow/` (subdirectory organization)
- Choice of Zod parser ergonomics (e.g., `z.discriminatedUnion` vs `z.union`)
- Specific HF model revision pins (must use latest stable as of execution)
- Mock strategies in unit tests (HTTP mocks vs fixture loads)
- Wave-internal task ordering when not gated by D-XX dependency

### Deferred Ideas (OUT OF SCOPE)
- Unusual Whales options-flow adapter ($50/mo, dark pools) — deferred to follow-up; Plan 19-C-04 (term-structure) covers options sentiment for now
- Twitter/X API ingestion — $0.005/post too expensive for continuous scraping; not worth the integration cost
- BloombergGPT / proprietary commercial sentiment models — out of scope; FinSentLLM ensemble (open-weight) is the chosen path
- Real-time websocket ingestion of any source — all current adapters poll; no streaming infra in Phase 19
- Multi-language sentiment — English-only for now; non-English subreddits / Naver / Xueqiu deferred
- Public model card — covered by v2.0 Phase 27, NOT this phase
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORE-ML-11 | `learn` cron computes pooled posterior parameters (`pooled_alpha`, `pooled_beta`) per `(signal_class, pattern_key)` parent group, sharing strength across cap_class × horizon × regime children | Plan 19-A-07 (D-23); empirical Bayes via method-of-moments — see Hierarchical Pooling section below; integration point at `src/app/api/cron/learn/route.ts:582-620` (status decision + persist) |
| CORE-ML-12 | Pooling structure documented with empirical justification — both 2-level and 3-level hierarchies tested on existing data; chosen structure backed by no-pool / partial-pool / complete-pool sweep | Validation Architecture §"Plan 19-A-07" below — sweep test design covered |
| CORE-ML-13 | Sparse cells (low ESS) shrink toward parent prior; rich cells (high ESS) retain individual posterior — observable in `/insights` as differential confidence intervals | Schema additions D-46 (parent_alpha, parent_beta, shrinkage_strength); UI hook in EngineCalibrationPanel and `/insights` |
| CORE-ML-14 | Cell-space pruning: cells that have not been observed in N days AND have ESS < threshold are not allocated parameter rows (defends against the "lake of cells" combinatorial blowup) | CONTEXT D-23 says "falls back to flat prior when group n<5". Pruning policy itself is Claude's discretion within plan 19-A-07; existing code already iterates only the 3 traded cap buckets at `src/app/api/cron/learn/route.ts:79-80` (precedent for non-allocation) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

These are project-wide directives the planner MUST honor (treat with same authority as locked CONTEXT decisions):

1. **Pure-TypeScript only** — no Python, no containers (decommissioned Phase 12). Wave A primitives must stay in `learning.ts` as pure functions; Wave C HF clients call HTTPS endpoints only.
2. **`learning.ts` is "pure functions, no DB"** — Phase 18 invariant carried into Phase 19 — every Wave A primitive (conformal, DSR, PBO, CPCV, hierarchical pool) MUST be DB-free; cron route is the only place that reads/writes Prisma.
3. **`engine-context.ts` is the single trust boundary** — composite signals + counterfactuals come from here, not the LLM. Phase 19 surfaces `conformal_low/high`, `parent_alpha/beta`, `ic_decay_flag` here; Gemini cannot override.
4. **Prisma schema migrations are additive** — never drop columns, never change types. Aligns with D-46/D-47/D-48.
5. **Modular fetchers** — new data sources go in `src/lib/data/` with their own unit tests. Wave B `adapters/` subdirectory follows this.
6. **Source retrieval comes before analysis** — the LLM should never invent data. Plans 19-C-07 + 19-C-08 enforce this.
7. **Vitest for units (`npm test`), live-DB integration tests (`npm run test:integration`), Playwright for e2e (`npm run test:e2e`)**.
8. **Never store generated research artifacts inside the repository.**
9. **Vercel cron `maxDuration: 300` (default) suffices through Phase 21**; bump to `800` only for backfill (P25). Plan 19-C-11 (Arctic Shift one-time) runs as a `scripts/` tsx invocation, NOT a cron, so 300s ceiling is irrelevant.

## Summary

Phase 19 is a **brownfield additive** consolidation phase. Every existing fetcher, prompt, model, and learning primitive remains in tree as a fallback. The phase ships 30 plans across 4 waves under a single composite done-gate (`npm run model-card-status` exits zero). The orchestration model — flag-gated shadow A/B → autonomous verdict → atomic cutover with old code deleted in the same commit, plus a 7-day rollback hatch — is the same per-plan discipline for every cutover. Two distinct execution patterns exist within the phase:

1. **Shadow-required plans (≥17 of 30):** any plan that replaces a hot-path call (e.g., 19-B-06 merge precedence, 19-C-07 citations, 19-C-08 CoVe, 19-C-09 router) must traverse the full shadow → verdict → cutover → flag-removal lifecycle.
2. **Pure-primitive plans (≤13 of 30):** plans that only ADD a primitive without replacing an existing call (e.g., 19-A-01 decayWeights guard, 19-A-04 DSR/PBO/CPCV exports, 19-B-01 cache wrapper, 19-C-01 HF clients) are completed by tests-green-and-committed; no shadow lifecycle is meaningful.

The plans listed in CONTEXT.md and the master implementation plan are unambiguous about which is which, but the planner should be vigilant — for example, 19-A-07 hierarchical pooling IS shadow-required because it changes `recomputeOneCell`'s persisted output, while 19-A-04 is NOT because it only adds exports.

**Primary recommendation:** Plan in three layers per wave: (1) primitive layer = pure additions, no shadow; (2) wiring layer = the call site change behind a flag, with shadow A/B; (3) cleanup layer = a 100%-process plan that drives the verdict-cutover-removal sequence to completion. The master plan already does this — researcher's job is to make the wiring layer's verdict mechanics concrete.

---

## Standard Stack

### Core (verified via npm registry on 2026-05-06)

| Library | Verified Version | Published | Purpose | Why Standard |
|---------|------------------|-----------|---------|--------------|
| `@upstash/redis` | **1.38.0** | 2026-05-05 | HTTP-based Redis client for Vercel Functions/Edge | Only Vercel-native serverless Redis with stable HTTP transport — Wave B-01 cache wrapper [VERIFIED: `npm view @upstash/redis version` → 1.38.0; release 2026-05-05] |
| `@huggingface/inference` | **4.13.15** | 2026-03-06 | TS client for HF Inference API + dedicated Inference Endpoints | Maintained by HuggingFace; supports `textClassification` against deployed FinBERT/FinGPT/Mistral endpoints — Wave C-01 [VERIFIED: `npm view @huggingface/inference version` → 4.13.15] |
| `exa-js` | **2.12.1** | 2026-04-22 | Official TypeScript SDK for Exa neural search | Replaces Anthropic-search hot path with semantic news/analyst retrieval — Wave B-05 [VERIFIED: `npm view exa-js version` → 2.12.1] |
| `zod` | **3.24.2** (already pinned) | — | Runtime schema validation | Existing in tree; Wave A-01 uses for HYPERPARAMETERS validation; Wave C-07 uses for citations_v2 schema [VERIFIED: package.json] |
| `@prisma/client` + `prisma` | **7.5.0** (already pinned) | — | Postgres adapter + driver; D-46/D-47/D-48 schema additions | Existing in tree; Phase 18-03 used same pattern for `effective_sample_size` additive migration [VERIFIED: package.json] |
| `ai` | **6.0.168** (already pinned) | — | Vercel AI SDK — generateText + Output<Zod> | Existing in tree; Wave C-08 (CoVe) and 19-C-09 (router) build on this [VERIFIED: package.json line 23] |
| `@mendable/firecrawl-js` | **4.18.3** (already pinned) | — | Firecrawl SDK for community ingestion | UNCHANGED in Phase 19 per D-37 — primary remains Firecrawl [VERIFIED: package.json] |

### Supporting (required by specific waves)

| Library | Verified Version | Purpose | When to Use |
|---------|------------------|---------|-------------|
| `tsx` | install on demand | TypeScript execution for `scripts/*.ts` | Already used by `scripts/tune-lambda.ts` etc.; Wave Z `model-card-status` and Wave A `dsr-pbo-audit` invoke as `tsx scripts/...` [CITED: package.json scripts pattern] |
| `vitest` (test only) | 3.0.9 (already pinned) | Test runner | All Wave A/B/C unit tests [VERIFIED: package.json] |
| `@playwright/test` | 1.58.2 (already pinned) | E2E browser tests | UI surface changes in 19-C-07 (citations panel), 19-A-03 (conformal CI), 19-A-07 (pooled posterior) [VERIFIED: package.json] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff | Recommendation |
|------------|-----------|----------|----------------|
| `@upstash/redis` | Vercel KV | KV is now `@vercel/kv` thin wrapper; Upstash already serves Cipher's auth state in some setups | Use `@upstash/redis` directly per CONTEXT D-24 — more explicit, lower latency than KV layer |
| `exa-js` standalone | `@exalabs/ai-sdk` (Vercel AI SDK provider) | Provider variant routes through `generateText` tools; useful if you want Gemini to drive search | **Use direct `exa-js`** for B-05 — Wave B is data-layer, NOT LLM-driven; the AI-SDK provider is overkill and adds a tool-call hop |
| `@huggingface/inference` REST | TGI (Text Generation Inference) self-hosted | Self-hosted = $0 marginal but ops burden; CLAUDE.md forbids containers | **Use HF Inference Endpoints** per D-33 — pay-per-use, no container infra |
| Custom retry/backoff | `p-retry` package | `p-retry` is 4kb gzipped, battle-tested | Either is fine; CONTEXT D-25 spec says "Retry + exponential backoff wrapper (5xx + network only, NOT 4xx)" — prefer custom 30-line wrapper for tighter control over retryable-error classification |

**Installation (full Wave B+C dependency set):**
```bash
npm install @upstash/redis@^1.38.0 @huggingface/inference@^4.13.15 exa-js@^2.12.1
# tsx is dev-only and already used; if missing:
npm install -D tsx
```

**Version verification (run before each plan executes — versions may have moved):**
```bash
npm view @upstash/redis version   # expect ≥ 1.38.0 as of 2026-05-06
npm view @huggingface/inference version   # expect ≥ 4.13.15
npm view exa-js version   # expect ≥ 2.12.1
```

---

## Architecture Patterns

### Recommended Project Structure (extension of existing tree)

```
src/lib/
├── data/
│  ├── adapters/                          NEW — Wave B
│  │  ├ tiingo.ts                          (B-03) — REST + cached() + withRetry()
│  │  ├ twelve-data.ts                     (B-04) — same shape as tiingo
│  │  ├ exa-search.ts                      (B-05) — exa-js client wrapper
│  │  ├ swaggystocks.ts                    (C-05)
│  │  ├ apewisdom.ts                       (C-05)
│  │  ├ quiver.ts                          (C-06, optional)
│  ├ cache/                                NEW — Wave B
│  │  ├ upstash.ts                         (B-01) — cached() + invalidate()
│  │  ├ runtime-cache.ts                   (B-07) — `use cache: remote` wrapper
│  │  ├ cache-keys.ts                      (B-01) — CACHE_KEYS + TTL_SECONDS
│  ├ retry.ts                              NEW (B-02) — withRetry()
│  ├ source-package.ts                     EDIT (B-06) — merge precedence + cache hooks
│  ├ merge.ts                              EDIT (B-06) — extend FieldOrigin union
│  ├ stocktwits.ts                         EDIT (C-03) — reputation-weighted mode
│  ├ options-sentiment.ts                  EDIT (C-04) — term-structure
│  ├ yahoo.ts / finnhub.ts / polygon.ts    UNCHANGED — kept as fallbacks
│  ├ anthropic-search.ts                   UNCHANGED — kept as fallback
├── sentiment/                             NEW — Wave C
│  ├ finsentllm.ts                         (C-01) — HF clients
│  ├ ensemble.ts                           (C-02) — meta-classifier
│  ├ contradiction-detector.ts             (C-10)
│  ├ citation-schema.ts                    (C-07) — Zod schema for citations_v2
├── reasoning/                             NEW — Wave C
│  ├ cove.ts                               (C-08)
│  ├ router.ts                             (C-09)
│  ├ alpha-decay-monitor.ts                (A-05)
├── shadow/                                NEW — Wave Z
│  ├ shadow-runner.ts                      (Z-03) — runWithShadow<T>()
│  ├ verdict.ts                            (Z-03) — pure verdict()
├── features.ts                            NEW (Z-01) — flag matrix
├── learning.ts                            EDIT (Wave A) — additive primitives
├── engine-context.ts                      EDIT — surface conformal CI + ic_decay_flag + pooled posterior
├── gemini-analysis.ts                     EDIT (C-07/C-08/C-09) — citations + CoVe + router
└── research-brief.ts                      EDIT (C-07) — structured citations in prompt

src/app/api/cron/
├── learn/route.ts                         EDIT (Wave A) — wire DSR/PBO/IC + hierarchical pooling
├── alpha-decay-watch/route.ts             NEW (A-05) — daily IC computation
├── ic-recompute/route.ts                  NEW (A-05) — recompute rolling IC

scripts/
├── calibration-report.ts                  NEW (A-06)
├── dsr-pbo-audit.ts                       NEW (A-04 helper)
├── shadow-verdict.ts                      NEW (Z-03)
├── arctic-shift-backfill.ts               NEW (C-11, one-time)
├── model-card-status.ts                   NEW (Z-04) — composite gate

prisma/
├── schema.prisma                          EDIT (Z-02 + scattered) — D-46/D-47/D-48 additions
```

### Pattern 1: Shadow A/B background execution

**What:** New path runs in `setImmediate()` after old path resolves the user's request. Disagreement, latency, and cost are persisted to `ShadowComparison` for later verdict.

**When to use:** Any hot-path replacement (B-06 merge precedence, C-07 citations, C-08 CoVe, C-09 router, etc.).

**Reference example (compose a `runWithShadow` from the master plan stub at 19-Z-03 lines 291-302 of impl-plan):**
```ts
// src/lib/shadow/shadow-runner.ts (Plan 19-Z-03 deliverable)
export async function runWithShadow<T>(
  pathName: string,
  oldFn: () => Promise<T>,
  newFn: () => Promise<T>,
  mode: 'off' | 'shadow' | 'on',
  ctx: { ticker?: string },
): Promise<T> {
  if (mode === 'off') return oldFn();
  if (mode === 'on') return newFn();

  // shadow mode: old returns first, new runs in background
  const oldStart = Date.now();
  const oldResult = await oldFn();
  const oldLatency = Date.now() - oldStart;

  setImmediate(async () => {
    const newStart = Date.now();
    try {
      const newResult = await newFn();
      const newLatency = Date.now() - newStart;
      await prisma.shadowComparison.create({
        data: {
          path_name: pathName,
          ticker: ctx.ticker ?? null,
          old_output_json: oldResult as object,
          new_output_json: newResult as object,
          old_latency_ms: oldLatency,
          new_latency_ms: newLatency,
        },
      });
    } catch (err) {
      // log new-path errors but never propagate to user
      console.error(`[shadow] ${pathName} new-path error:`, err);
    }
  });

  return oldResult;
}
```

### Pattern 2: Cache-then-fetch (Wave B)

**What:** Every adapter wraps its fetcher with `cached(key, fetcher, opts)` — Redis miss falls through to fetcher transparently.

**Anti-pattern to avoid:** Hardcoding TTLs at the call site. ALL TTLs live in `cache-keys.ts` (`TTL_SECONDS.quote = 300` etc.) per the master plan deliverable.

```ts
// src/lib/data/adapters/tiingo.ts (Plan 19-B-03)
export async function fetchTiingoQuote(ticker: string): Promise<MarketDataSection> {
  return cached(
    CACHE_KEYS.quote(ticker),
    () => withRetry(() => doFetchTiingo(ticker), { maxAttempts: 3, baseDelayMs: 100 }),
    { ttlSeconds: TTL_SECONDS.quote },
  );
}
```

### Pattern 3: Null-sentinel error boundary (Wave C)

**What:** HF Inference clients (FinGPT/Mistral/FinBERT) NEVER throw on API error — they return `{ score: null, confidence: null, model, error }`. Ensemble meta-classifier handles nulls via fall-through to single-model.

**Why this matters:** HF Inference Endpoints have observable cold-start latency (search confirmed competitors at ~2-10s); the ensemble must degrade gracefully, not propagate the error to the user-facing report.

### Anti-Patterns to Avoid

- **Hand-rolling DSR/PBO/CPCV math** — these have been wrong in published implementations; Plan 19-A-04 must golden-master test every primitive against numerical examples from the cited paper. See "Validation Architecture" below for specific golden values to pin.
- **Calling `decayWeights` from new wave-A code without checking that it now throws on lambdaDays≤0** — Plan 19-A-01 changes the signature contract. Audit all 3 existing call sites (see "Integration Risks" §1).
- **Letting shadow A/B inject latency into the user-facing path** — `setImmediate()` discipline is mandatory; new path must NEVER block old path's return.
- **Adding a new adapter without going through `mergeMarketData`/`mergeFundamentals` field-level merge** — Phase 10's `FieldOrigin` discipline is preserved; B-06 extends the union, doesn't bypass it.
- **Treating "old path fallback" as dead code after cutover** — Per D-32, Yahoo/Finnhub/Polygon/Anthropic-search adapters STAY in tree as fallbacks. The cutover deletes only the `source-package.ts` direct call from the primary path.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP retry with exponential backoff | Custom recursive setTimeout chain | Either `p-retry` OR a tight 30-line wrapper that distinguishes 4xx (don't retry) from 5xx/network (do retry) | Misclassifying 401 as retryable burns rate limit; misclassifying 500 as terminal loses recoverable requests |
| Conformal prediction quantile | Custom percentile function | Sort + index lookup at `⌈(1-α)(n+1)⌉ / n` per Vovk-Romano | Off-by-one errors on the (n+1) factor are the classic conformal bug |
| Beta distribution PPF/CDF for credible interval tightening | Custom numerical inversion | The existing `credibleInterval95` in `learning.ts:46-62` uses a Wilson-style normal approximation that is good enough; Wave A does NOT need to upgrade it | Phase 18 sign-off accepted the normal approximation — don't open that can of worms in Phase 19 |
| HF API auth header construction | Custom fetch + bearer | `@huggingface/inference` `HfInference` class | The SDK handles dedicated-endpoint URL routing; raw fetch loses 30+ lines of error handling |
| Vercel Runtime Cache key derivation | Custom hash of args | Next.js 16 compiler-derived keys via `'use cache'` | Per Vercel docs: "compiler to automatically generate cache keys" — manual hashing breaks invalidation guarantees |
| Spearman rank correlation for IC | Custom rank-and-correlate | `simple-statistics` package or a 15-line implementation against pinned test vectors | The IC monitor needs to match academic IC definitions exactly; deviation here invalidates the alpha-decay flag |
| NLI model for CoVe verifier | Train your own | `distilbert-base-mnli` on HF (free Inference API) OR the same FinBERT instance from C-01 | Per CoVe paper (Dhuliawala et al. 2024), NLI is the published verification surface |
| Reddit historical scraping | Direct api.reddit.com calls | Arctic Shift API (free, Pushshift successor) | Reddit official API is $12K/year minimum; Arctic Shift is the canonical free historical archive [CITED: arctic-shift.photon-reddit.com] |

**Key insight:** Two specific traps in this domain — (1) re-implementing peer-reviewed quant primitives (DSR/PBO/CPCV) and (2) hand-rolling NLI/embedding models — are exactly the failures the phase is designed to prevent. Every `Don't Hand-Roll` row above is a mini-plan-19 in itself; respect the contract.

---

## Runtime State Inventory

> Phase 19 is brownfield additive only — no rename or refactor of existing names. Only one category contains state worth flagging: build artifacts after schema migrations.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — all schema additions are nullable; existing rows untouched per D-46/D-47/D-48. | None — Postgres `ADD COLUMN ... DEFAULT ... NULL` skips full table rewrite [CITED: design doc §6 line 302] |
| Live service config | None — Phase 19 does not rename any cron path, env var, or service identifier. New cron `/api/cron/alpha-decay-watch` is additive. | None |
| OS-registered state | None | None |
| Secrets/env vars | NEW env vars to provision (Vercel project env): `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `HF_INFERENCE_TOKEN`, `HF_FINGPT_ENDPOINT`, `HF_MISTRAL_FIN_ENDPOINT`, `HF_FINBERT_ENDPOINT`, `TIINGO_API_KEY`, `TWELVEDATA_API_KEY`, `EXA_API_KEY`, `QUIVER_API_KEY` (optional), plus the 15 `FEATURE_*` flags from Z-01. | Provision via `vercel env add ...` per environment (production/preview/development). Document missing-env behavior: every adapter degrades gracefully (returns null sentinel / falls through to fetcher). |
| Build artifacts / installed packages | After every Wave B/C plan that adds a dependency, `node_modules/` and `package-lock.json` change. After Wave Z-02 schema migration, `node_modules/.prisma/` regenerates. | Standard `npm install` and `npx prisma generate` at the right moments — already covered by the `postinstall` script in `package.json` line 7 (`"postinstall": "prisma generate"`). No special action needed beyond running `npm install` after pulling the cutover commit. |

**Schema migration ordering (answer to additional_context Q4):** All 7 LearnedPattern columns (D-46) plus 4 SentimentSnapshot columns (D-47) plus 3 new tables (D-48) are mutually independent additive ALTER TABLEs. **Recommendation: bundle ALL 14 column-adds + 3 table-creates into Plan 19-Z-02** — one migration, one `npx prisma generate`, one Prisma client regeneration. Per-plan column-adds (e.g., `parent_alpha` in 19-A-07) introduce N successive `prisma generate` runs and risk type drift between waves. The master implementation plan stub at 19-Z-02 lines 272-285 already implies this bundling — make it explicit in the planner output.

---

## Common Pitfalls

### Pitfall 1: decayWeights guard breaks an existing call site
**What goes wrong:** Plan 19-A-01 adds `if (lambdaDays <= 0) throw`. If any existing caller passes 0, the cron route blows up at runtime. **Verified call sites (grep on 2026-05-06):**

1. `src/app/api/cron/learn/route.ts:515` — passes `lambdaDays = HYPERPARAMETERS[key.signal_class]?.lambda_days ?? 60`. Default 60, real values are all 60 (HYPERPARAMETERS bootstrap defaults). **Safe** but the `?? 60` fallback is exactly the case the guard catches if HYPERPARAMETERS is somehow corrupted.
2. `src/app/api/cron/backfill-ess/route.ts:155` — same fallback pattern. **Safe** with bootstrap config.
3. `src/lib/__tests__/learning.decay.test.ts:18,24,35,47,59,66,78` — test file passes literal positives (30, 60, varies). **Safe**, but **the test file passes `decayWeights([], 30)` in the empty-input case** — the new guard must NOT reject empty input even though `lambdaDays > 0`. Plan 19-A-01's test `'returns [] for empty input'` must continue to pass.

**Why it happens:** Guard added at function entry without auditing all callers.

**How to avoid:** Plan 19-A-01 step 4 ("Run full suite") catches this. The CRITICAL test that must stay green is `tests/learning.hyperparameters.test.ts` (Plan 18-10 nyquist sanity, D-54). The guard implementation in master plan lines 407-418 correctly preserves the empty-input case (the `obs.map(...)` handles `[]` naturally — returns `[]`).

**Warning signs:** Any failing test in `learning.decay.test.ts` after the change.

### Pitfall 2: Buildtime `validateHyperparameters(HYPERPARAMETERS)` blocks cron startup
**What goes wrong:** Plan 19-A-01 step 3 places `validateHyperparameters(HYPERPARAMETERS)` at the BOTTOM of `learning.ts`. This runs at module load. If the schema doesn't match the bootstrap config, **every code path that imports from `learning.ts` fails to load** — including `/api/cron/learn`, `/api/cron/backfill-ess`, `engine-context.ts`, AND every test file.

**Why it happens:** Test on dev machine with one config; deploy to Vercel with stale bundle.

**How to avoid:**
1. Plan 19-A-01 must include a Vitest test that imports `learning.ts` at module load time and verifies it doesn't throw — that's exactly what `validates current bootstrap config` test does (master plan line 367-369). KEEP that test.
2. Add an integration test asserting the cron route loads — existing `learn.ess.live.test.ts` does this transitively.
3. CRITICAL: the Zod schema in master plan lines 422-435 uses `.strict()` on `HyperparametersSchema` — this means **adding any new field to HYPERPARAMETERS in a future plan (e.g., regime hyperparams in Phase 20) will throw at module load**. Plan 19-A-01 should add a TODO comment flagging that future-phase additions to HYPERPARAMETERS require either schema update OR removal of `.strict()`.

**Warning signs:** Local `npm test` fails with `HYPERPARAMETERS validation failed` immediately on any test that imports `learning.ts`.

### Pitfall 3: Hierarchical pooling shadow rollout breaks ESS expectations
**What goes wrong:** Plan 19-A-07 wires `hierarchicalPooledPosterior` into `recomputeOneCell`. The pooled posterior's α/β are *different from* the local α/β by design. If any downstream code (e.g., `/insights` ESS-based CI widths from Plan 18-09) computes ESS off the *new* pooled posterior, the user sees a sudden tightening of intervals on cells that haven't actually accumulated more evidence.

**Why it happens:** Pooling shrinks toward parent prior; this changes posterior mean AND apparent precision.

**How to avoid (safest rollout pattern, answer to additional_context Q2.3):**
1. **Persist BOTH posteriors:** keep `alpha`/`beta` (local, unchanged) AND add `parent_alpha`/`parent_beta` (D-46). The pooled posterior is a derived view, not a replacement.
2. **Per-call computation:** `engine-context.ts` reads both and computes `α_pooled = (n × α_local + λ × α_group) / (n + λ)` at READ time; the cron does NOT overwrite α/β with pooled values.
3. **Shadow verdict metric:** convergence speed = `n outcomes for cell to leave EXPLORATORY (ESS≥30)` — pooled vs no-pool control. Verdict PASSES when median pooled-cell convergence is ≥30% faster than control on cells with n_local<10. This matches the original P19 acceptance preserved as CORE-ML-12/13.
4. **Cell-space pruning** (CORE-ML-14): existing code at `learn/route.ts:79-80` already iterates only the 3 traded cap buckets. Plan 19-A-07's pruning policy = "don't allocate `LearnedPattern` rows for cells with raw N=0 AND no observations in last 90 days" — implemented at `recomputeAllCells` skip-condition, NOT at the pure primitive.

**Warning signs:** Sudden status flips from EXPLORATORY → ACTIVE on cells that have no new outcomes.

### Pitfall 4: HF Inference cold-start latency tanks the shadow verdict
**What goes wrong:** HF Inference Endpoints scale-to-zero in many configurations. First request after idle period can take 10-30s. If FinSentLLM ensemble (C-02) runs in shadow mode against fresh tickers, the `latency_p95 ≥ 2× old` FAIL rule fires immediately. [CITED: Replicate vs HF cold-start comparison from MetaCTO 2026]

**Why it happens:** Shadow mode = real production calls; cold endpoints = real cold-start.

**How to avoid:**
1. Provision endpoints in **always-on** mode (~$10/mo per endpoint, fits the D-49 envelope only if you skip Quiver for now).
2. **OR** provision a warm-up cron pinging each endpoint every 5 minutes — risk register design doc §13 line 477 already calls for this.
3. **OR** seed shadow comparisons with a 24h warm-up phase before measuring p95 — extend the shadow window to 7 days for C-02 specifically.
4. The shadow verdict CLI should use `latency_p50` + cold-start-aware p95 (e.g., trim top 5% of latencies as cold-start outliers). The master plan stub at 19-Z-03 line 299 says "latency_p50, latency_p95" — the planner must specify which one is the FAIL gate.

### Pitfall 5: Shadow A/B disagreement metric depends on output type
**What goes wrong:** `output_disagreement_rate` is mentioned as "Jaccard over fields" in design §8.1 line 352. But Jaccard works for SET-shaped outputs (e.g., list of sources). It does NOT work for:
- Numeric scores (sentiment) — should use cosine similarity or absolute delta
- Ranked lists (citations) — should use Spearman or Kendall tau
- Free-text summaries — use embedding cosine OR field-level diff count

**Answer to additional_context Q5:** Specific output-comparison metrics by path:

| Path | Output Type | Recommended Metric | PASS threshold |
|------|-------------|---------------------|----------------|
| 19-B-06 (SourcePackage) | Mixed numeric + nullable fields | Field-fill-rate delta + numeric L∞ on each field | new_fill_rate ≥ old AND max numeric delta ≤ 1% per field |
| 19-C-02 (FinSentLLM scores) | Numeric in [-1, 1] | Cosine similarity OR Pearson correlation on per-message scores | Pearson ≥ 0.85 |
| 19-C-07 (citations_v2 vs source_citation) | List of {source,url,confidence,date} vs string | URL coverage rate + Jaccard on URL set | new URL coverage ≥ 90% AND old URLs ⊂ new URLs (no information loss) |
| 19-C-08 (CoVe AnalysisResult) | Full AnalysisResult JSON | Field-by-field equality on numeric fields + embedding cosine on free-text fields | numeric fields exactly equal (post-engine-context overwrites) AND free-text cosine ≥ 0.80 |
| 19-C-09 (router-decided model) | string ∈ {haiku, flash, pro} | Decision agreement rate + Brier on resolved | agreement ≥ 70% AND Brier(new) ≤ Brier(old) |
| 19-A-07 (pooled posterior) | (alpha, beta) tuple | Convergence-speed delta as outlined in Pitfall 3 | ≥30% faster on n_local<10 |

The planner MUST select the right metric per plan; the shadow-verdict CLI in Z-03 must accept a metric strategy as an argument or per-path configuration.

### Pitfall 6: `prisma db push` vs `prisma migrate deploy` confusion
**What goes wrong:** `vercel.json` line 3 has `"buildCommand": "prisma migrate deploy && next build"`. Wave Z-02 must produce a *migration file* (`prisma/migrations/<timestamp>_phase19_additive/migration.sql`), not a `db push`. A `db push` works locally but skips the migration history → production deploy fails.

**Why it happens:** Easy to forget `prisma migrate dev --create-only` vs `prisma db push` distinction.

**How to avoid:** Plan 19-Z-02 task list MUST include `npx prisma migrate dev --name phase19_additive_columns_and_tables --create-only` (creates migration without applying), then `npx prisma migrate deploy` runs in CI.

**Warning signs:** Local works, deploy fails with "Database schema is not in sync with migration history".

### Pitfall 7: Exa vs Anthropic-search semantic gap on niche tickers
**What goes wrong:** Exa is embedding-first; works well for queries like "Apple Q4 earnings analyst reaction" but may underperform Anthropic-search (which uses Anthropic's `web_search_20250305` tool) on small-cap tickers with sparse coverage. Risk register §13 line 478 already flags this.

**How to avoid:** Plan 19-B-05 dual-source for first 30 days; A/B compare Brier on resolved tickers; auto-fallback to Anthropic-search if Exa returns null. This is exactly what the design doc prescribes; the planner must make sure the cutover for B-05 does NOT delete `anthropic-search.ts` per D-32 — only the direct Exa primary call replaces the call site, with `anthropic-search.ts` retained as catch-block fallback.

---

## Code Examples

### Example 1: Conformal prediction primitive (Plan 19-A-03)

```ts
// src/lib/learning.ts — additive export
// Source: Vovk, Gammerman, Shafer 2005; split-conformal as in Tibshirani / Berkeley lecture notes
export interface ConformalInterval {
  low: number;
  high: number;
  alpha: number;          // miscoverage level (e.g., 0.05 for 95% nominal)
  n_calibration: number;  // for diagnostics
}

export function conformalInterval(
  pointPrediction: number,                       // model's prediction at a new point
  calibrationResiduals: number[],                // |y_i - ŷ_i| over a held-out calibration set
  alpha = 0.05,
): ConformalInterval {
  const n = calibrationResiduals.length;
  if (n < 10) {
    // Plan 19-A-03 task 3: edge case — return widest possible interval
    return { low: 0, high: 1, alpha, n_calibration: n };
  }
  const sorted = [...calibrationResiduals].sort((a, b) => a - b);
  // Vovk-Romano: quantile at index ⌈(1-α)(n+1)⌉ - 1 (zero-indexed)
  const idx = Math.min(n - 1, Math.ceil((1 - alpha) * (n + 1)) - 1);
  const q = sorted[idx];
  return {
    low: Math.max(0, pointPrediction - q),
    high: Math.min(1, pointPrediction + q),
    alpha,
    n_calibration: n,
  };
}
```

### Example 2: HF Inference client null-sentinel pattern (Plan 19-C-01)

```ts
// src/lib/sentiment/finsentllm.ts — extracted from master plan lines 891-934
// Source: HuggingFace Inference SDK docs; null-sentinel discipline per CONTEXT D-33
import { HfInference } from '@huggingface/inference';

export interface SentimentScore {
  score: number | null;
  confidence: number | null;
  model: 'fingpt-v3' | 'mistral-fin-7b' | 'finbert';
  error?: string;
}

async function classifyVia(model: SentimentScore['model'], endpointEnv: string, text: string): Promise<SentimentScore> {
  try {
    const endpoint = process.env[endpointEnv];
    if (!endpoint) throw new Error(`${endpointEnv} not set`);
    const client = new HfInference(process.env.HF_INFERENCE_TOKEN!);
    const out = await client.textClassification({ model: endpoint, inputs: text });
    // ... reduce labels → { score, confidence }
    return { score, confidence, model };
  } catch (err) {
    return { score: null, confidence: null, model, error: err instanceof Error ? err.message : String(err) };
  }
}
```

### Example 3: Empirical Bayes hierarchical pooling (Plan 19-A-07)

```ts
// src/lib/learning.ts — additive export
// Source: Robbins 1956 / Casella 1985 / Method of Moments as in kiwidamien.github.io shrinkage reference
export interface PooledPosterior {
  alpha_pooled: number;
  beta_pooled: number;
  parent_alpha: number;        // group-level alpha
  parent_beta: number;         // group-level beta
  shrinkage_strength: number;  // λ — controls how strongly local shrinks toward parent
}

/**
 * Empirical Bayes hierarchical pooling per CORE-ML-11..14.
 * Pools (alpha, beta) across cells in the same group via method-of-moments
 * estimation of the group-level Beta hyperprior.
 *
 * Per-cell shrinkage: α_pooled = (n_local × α_local + λ × α_group) / (n_local + λ)
 * λ is learned per group from the marginal-likelihood-maximizing Beta(α_group, β_group)
 * fit; bounded [0.5, 50] to avoid numerical instability.
 *
 * Cold-start safety: if group_n < 5, returns the local posterior unchanged
 * (caller should treat this as "flat prior path").
 */
export function hierarchicalPooledPosterior(args: {
  cell_local: BetaPosterior;
  cell_n: number;
  group_cells: BetaPosterior[];   // sibling cells in the same (signal_class, cap_class)
}): PooledPosterior {
  const { cell_local, cell_n, group_cells } = args;
  const k = group_cells.length;
  if (k < 5) {
    return {
      alpha_pooled: cell_local.alpha,
      beta_pooled: cell_local.beta,
      parent_alpha: 1,
      parent_beta: 1,
      shrinkage_strength: 0,
    };
  }

  // Method of Moments on group means
  const means = group_cells.map(c => c.alpha / (c.alpha + c.beta));
  const muBar = means.reduce((a, b) => a + b, 0) / k;
  const sigma2 = means.reduce((acc, m) => acc + (m - muBar) ** 2, 0) / Math.max(1, k - 1);
  const ratio = sigma2 > 0 ? (muBar * (1 - muBar)) / sigma2 - 1 : 50;
  const groupAlpha = Math.max(0.5, muBar * Math.max(1, ratio));
  const groupBeta = Math.max(0.5, (1 - muBar) * Math.max(1, ratio));

  // λ from the implied prior strength; bounded [0.5, 50]
  const lambda = Math.min(50, Math.max(0.5, groupAlpha + groupBeta));

  return {
    alpha_pooled: (cell_n * cell_local.alpha + lambda * groupAlpha) / (cell_n + lambda),
    beta_pooled: (cell_n * cell_local.beta + lambda * groupBeta) / (cell_n + lambda),
    parent_alpha: groupAlpha,
    parent_beta: groupBeta,
    shrinkage_strength: lambda,
  };
}
```

### Example 4: Vercel Runtime Cache wrapper (Plan 19-B-07)

```ts
// src/lib/data/cache/runtime-cache.ts (Plan 19-B-07)
// Source: Vercel Runtime Cache docs https://vercel.com/docs/caching/runtime-cache
// Source: Next.js 16 'use cache' directive https://nextjs.org/docs/app/api-reference/directives/use-cache
//
// Note: in Next.js 16 cache components are configured via next.config.ts:
//   experimental: { cacheComponents: true }
// And used via the 'use cache' / 'use cache: remote' directive at the top of a function.
//
// 'use cache: remote' is the directive that pushes results into the Vercel Runtime Cache
// (vs in-memory). 10min idempotency for SourcePackage matches CONTEXT D-30.

'use cache: remote';

import { cacheLife } from 'next/cache';

export async function getCachedSourcePackage(ticker: string) {
  cacheLife({ revalidate: 600, expire: 600 }); // 10 minutes
  // ... build SourcePackage
}
```

---

## State of the Art

| Old Approach (pre-Phase-19) | Current (post-Phase-19) | When Changed | Impact |
|-----------------------------|---|--------------|--------|
| Random K-Fold or `max(1, n-14)` Brier OOS split | Time-aware 80/20 split + embargo (Lopez de Prado 2018) | Plan 19-A-02 | Eliminates horizon-overlap leakage on `n=14` edge case |
| Naive Sharpe + raw N gating | Deflated Sharpe Ratio + Probability of Backtest Overfitting + CPCV (Bailey & Lopez de Prado 2014) | Plan 19-A-04 | DSR corrects for selection bias under multiple testing; PBO quantifies overfitting risk; CPCV produces a distribution of Sharpe ratios |
| Bayesian credible intervals only | + Conformal prediction CI bands (Vovk-Romano 2005) | Plan 19-A-03 | Distribution-free coverage guarantees alongside parametric Bayesian intervals |
| Flat-prior per-cell posterior | Empirical Bayes hierarchical pooling (Robbins 1956 / method-of-moments) | Plan 19-A-07 | ≥30% faster convergence on sparse cells (n<10) per CORE-ML-12 acceptance criterion |
| FinBERT alone (or Anthropic-search-derived sentiment) | FinSentLLM ensemble (FinGPT v3 + Mistral 7B fin-tuned + FinBERT) with meta-classifier | Plans 19-C-01/C-02 | Verified: FLANG achieves Micro-F1 92% on FiQA-SA; FinGPT 88.2% [CITED: arxiv.org/html/2510.05151v1]; ensemble reduces single-model variance |
| Free-text `source_citation: string` in AnalysisResultSchema | Structured `citations_v2: { source, url, confidence, date_retrieved }[]` | Plan 19-C-07 | URL coverage ≥90% on analyst/news claims (CORE design §12.3); citations grep-checkable, deduplicatable, and revoke-able |
| Single Gemini Flash call per report | Cascade router: Haiku draft → Gemini Flash → Gemini Pro on high-stakes | Plan 19-C-09 | Cost telemetry per report; high-stakes detection driven by `controversy` + `ic_decay_flag` |
| LLM emits sentiment + reasoning in one pass | Two-pass Chain-of-Verification (CoVe) with NLI verification (Dhuliawala et al. 2024) | Plan 19-C-08 | Reduces factual hallucinations 50-70% on QA tasks per published benchmarks [CITED: arxiv.org/abs/2309.11495] |
| Anthropic-search hot path for news/analyst | Exa 2.0 neural search (primary) + Anthropic-search (fallback) | Plan 19-B-05 | ~$200/mo → ~$5/mo; semantic relevance over keyword match; D-32 keeps Anthropic as fallback |
| Ad-hoc Yahoo/Finnhub/Polygon ladder | Tiingo → Twelve Data → Yahoo → Finnhub → Polygon ladder + Upstash Redis cache + Vercel Runtime Cache + retry | Plans 19-B-01/02/03/04/06/07 | Source-package median latency ≥40% drop; point-in-time fundamentals from Tiingo unblocks P25 backfill correctness |
| Pushshift.io Reddit historical | Arctic Shift (free Pushshift successor) | Plan 19-C-11 | Pushshift admin-only since 2023 Reddit API controversy; Arctic Shift is the canonical replacement [CITED: github.com/ArthurHeitmann/arctic_shift] |

**Deprecated/outdated:**
- Pushshift public API (Reddit-admin-only since 2023). Use Arctic Shift.
- Reddit official Data API at $12K/year minimum — TOO EXPENSIVE; not in scope for Phase 19.
- Naive count-of-bullish-vs-bearish StockTwits — replaced by reputation-weighted aggregation (Plan 19-C-03).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.9 + Playwright 1.58.2 |
| Config files | `vitest.config.ts` (units), `vitest.integration.config.ts` (live-DB), `playwright.config.ts` (e2e) |
| Quick run command | `npm test` (unit only, all green in <30s today) |
| Live-DB command | `npm run test:integration` (requires `DATABASE_URL` to a live Neon instance) |
| Full e2e command | `npm run test:e2e` (Playwright chromium project) |
| Phase gate | `npm test && npm run test:integration && npm run test:e2e && npm run model-card-status` all green on `main` post-cleanup |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CORE-ML-11 | learn cron computes pooled (parent_alpha, parent_beta) | integration | `npx vitest run --config vitest.integration.config.ts tests/integration/hierarchical-pooling.live.test.ts` | ❌ Wave 0 (Plan 19-A-07 deliverable) |
| CORE-ML-12 | 2-level vs 3-level sweep documented | manual + script | `tsx scripts/hierarchical-sweep-report.ts` (writes report to `calibration-reports/`) | ❌ Plan 19-A-07 |
| CORE-ML-13 | Sparse cells shrink, rich cells don't (visible in /insights) | unit + e2e | `npx vitest run tests/learning.hierarchical.test.ts` + `npx playwright test tests/e2e/insights-pooling.spec.ts` | ❌ Plan 19-A-07 |
| CORE-ML-14 | Cell-space pruning (no rows for n=0 + idle 90d cells) | integration | `npx vitest run --config vitest.integration.config.ts tests/integration/pruning.live.test.ts` | ❌ Plan 19-A-07 |

**Plus the Composite Phase 19 done gate** — `npm run model-card-status` (Plan 19-Z-04) — asserts:
1. `prisma.learnedPattern.count({ where: { conformal_low: null }})` < 20% of total → conformal coverage validated
2. `prisma.learnedPattern.aggregate({ _avg: { dsr: true }})` > threshold (Plan 19-A-04 calibrates)
3. `prisma.learnedPattern.aggregate({ _avg: { pbo: true }})` < threshold
4. `prisma.learnedPattern.count({ where: { rolling_ic_20d: null }})` < 10% of total → IC monitor live for all 4 signal classes
5. `prisma.learnedPattern.count({ where: { parent_alpha: null }}) / total` < 0.20 → ≥80% pooled
6. `prisma.sentimentSnapshot.count({ where: { finsentllm_score: null }})` < 5% of last 30 days → ensemble live
7. `prisma.report.findMany({ select: { analysis: true }}).then(filter where citations_v2.url is not null) / total` ≥ 0.90
8. Grep tree for `// OLD-PATH-REMOVED` markers AND grep absence of pre-cutover patterns documented per plan
9. Grep `src/lib/features.ts` returns zero `FEATURE_*` const declarations from Phase 19

### Specific golden-master numbers for 19-A-04 (answer to additional_context Q1.1)

The Bailey-Lopez de Prado 2014 DSR paper publishes a worked example. Pin to these values:
- Estimated Sharpe ratio (annualized) = 2.5 / sqrt(252) [CITED: davidhbailey.com/dhbpapers/deflated-sharpe.pdf]
- Variance of SR estimates across trials = 0.5 / 252
- Number of trials N = 100
- Backtest horizon T = 1250 days
- Skewness γ̂₃ = -3
- Kurtosis γ̂₄ = 10

The DSR formula:
- σ_SR0 = sqrt((1 - γ̂₃·SR0 + (γ̂₄ - 1)/4·SR0²) / (T - 1))
- DSR = Φ((SR* - SR0) / σ_SR0)

**Action for Plan 19-A-04:** the planner MUST instruct the implementer to:
1. Open `https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf` (Section 4 worked example, table 1)
2. Compute the DSR by hand for the values above; record the result to 6 decimals in a fixture file
3. Implement `deflatedSharpeRatio()` against that fixture with `expect(dsr).toBeCloseTo(EXPECTED, 6)`
4. If exact paper values aren't recoverable, fall back to the SSRN paper [CITED: papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551] OR the `pypbo` GitHub reference implementation [CITED: github.com/esvhd/pypbo] cross-validating tests

For PBO, golden-master against the `pypbo` library's published unit tests. Specifically `pypbo.pbo(rtns_df, S=16, metric_func=sharpe, threshold=1)` [CITED: github.com/esvhd/pypbo README]. **MEDIUM confidence** — the planner must verify the test fixture values during 19-A-04 execution rather than trusting these from training data.

For CPCV, golden-master against Lopez de Prado 2018 ch.7 — specifically the `(N=6, k=2)` split that produces `C(6,2) = 15` train/test combinations and 5 distinct backtest paths [VERIFIED via web search + corroborated by towards-ai.net/p/l/the-combinatorial-purged-cross-validation-method]. The fold count `binomial(N, k)` and path count formula are the exact assertions.

### Specific golden-master numbers for 19-A-03 conformal (answer to Q1.3)

**Synthetic test design** (master plan stub at lines 504-509 leaves this open):
1. Generate `n = 10000` calibration samples with `y_i ~ Bernoulli(p)` and `ŷ_i = p + ε_i` where `ε_i ~ Normal(0, 0.05)` and `p = 0.5`
2. Compute residuals `R_i = |y_i - ŷ_i|`
3. For α = 0.05 (95% nominal), the quantile is at index `ceil(0.95 * 10001) - 1 = 9501` of the sorted residuals
4. Generate `n_test = 10000` fresh test samples; compute `coverage_rate = fraction of |y_test - ŷ_test| ≤ q`
5. **Acceptance: empirical coverage ∈ [0.93, 0.97]** (i.e., within ±2% of nominal 0.95)
6. Repeat for α ∈ {0.01, 0.05, 0.10, 0.20} — each must satisfy the ±2% bound

Use a fixed seed (`Math.seedrandom('phase19-conformal')` or vitest's deterministic Math.random) so the test is reproducible.

### Specific test design for 19-A-07 pooling convergence (answer to Q1.2)

**Test design:** "Convergence speed = number of outcomes for cell to leave EXPLORATORY (ESS≥30)."

```ts
// tests/integration/hierarchical-pooling.convergence.test.ts (Plan 19-A-07)
// Synthetic ground truth: each cell has a true probability p_true, drawn from a
// shared Beta(αg, βg) distribution. Pool = sample-and-shrink-toward-parent;
// no-pool = sample-only.

it('hierarchical pooling accelerates sparse-cell convergence by ≥30%', async () => {
  const SEED = 42;
  const N_GROUPS = 4;          // 4 cap classes (analog: large/mid/small/unknown)
  const N_CELLS_PER_GROUP = 8; // 8 patterns per group
  const N_TRIALS = 100;
  const PARENT_ALPHA = 5, PARENT_BETA = 3; // group-level prior
  let cellsToEss30_pool = 0, cellsToEss30_nopool = 0;

  for (let trial = 0; trial < N_TRIALS; trial++) {
    // ... simulate cells with sparse evidence (n<10), measure outcomes-to-ESS-30
    // ... record per-cell convergence count for both pool vs nopool
  }
  const median_pool = median(cellsToEss30_pool_array);
  const median_nopool = median(cellsToEss30_nopool_array);
  const speedup = (median_nopool - median_pool) / median_nopool;
  expect(speedup).toBeGreaterThan(0.30);
});
```

The CPCV from Plan 19-A-04 is invoked here as the OOS evaluation harness; the calibration harness from 19-A-06 produces the reliability comparison. Both upstream plans MUST land before 19-A-07 verdict can run — sequence intra-Wave-A as `A-01 → A-02 → A-03 → A-04 → A-05 → A-06 → A-07` (matches design §5 line 240).

### Specific scope for 19-Z-04 model-card-status (answer to Q1.4)

The script (Plan 19-Z-04) is the composite gate. **Concrete DB queries / grep patterns:**

```ts
// scripts/model-card-status.ts (Plan 19-Z-04)
type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

// 1. Conformal coverage validated (rolled-up from a calibration cron output)
const conformalCoverage = await prisma.learnedPattern.count({
  where: { conformal_low: { not: null }, status: 'ACTIVE' },
});
const totalActive = await prisma.learnedPattern.count({ where: { status: 'ACTIVE' }});
checks.push({
  name: 'conformal-coverage',
  ok: conformalCoverage / totalActive >= 0.80,
  detail: `${conformalCoverage}/${totalActive} ACTIVE cells have conformal CIs`,
});

// 2-3. DSR > threshold, PBO < threshold (thresholds calibrated from Plan 19-A-04 audit)
const dsrAvg = await prisma.learnedPattern.aggregate({
  where: { status: 'ACTIVE' }, _avg: { dsr: true },
});
checks.push({ name: 'dsr', ok: (dsrAvg._avg.dsr ?? 0) > 0.5, detail: ... });

const pboAvg = await prisma.learnedPattern.aggregate({
  where: { status: 'ACTIVE' }, _avg: { pbo: true },
});
checks.push({ name: 'pbo', ok: (pboAvg._avg.pbo ?? 1) < 0.5, detail: ... });

// 4. IC monitor live (all 4 signal classes have rolling_ic_20d in last 7 days)
for (const cls of ['diffusion','technical','insider','institutional']) {
  const recent = await prisma.learnedPattern.count({
    where: { signal_class: cls, rolling_ic_20d: { not: null }, last_updated: { gte: sevenDaysAgo() }},
  });
  checks.push({ name: `ic-${cls}`, ok: recent > 0, detail: ... });
}

// 5. Hierarchical pooling: ≥80% of cells have parent_alpha populated
const pooled = await prisma.learnedPattern.count({ where: { parent_alpha: { not: null }}});
const total = await prisma.learnedPattern.count();
checks.push({ name: 'pooled', ok: pooled / total >= 0.80, detail: ... });

// 6. FinSentLLM live: ≥95% of last-30-day SentimentSnapshot rows have finsentllm_score
const snaps30d = await prisma.sentimentSnapshot.count({
  where: { scanned_at: { gte: thirtyDaysAgo() }},
});
const snapsScored = await prisma.sentimentSnapshot.count({
  where: { scanned_at: { gte: thirtyDaysAgo() }, finsentllm_score: { not: null }},
});
checks.push({ name: 'finsentllm', ok: snapsScored / snaps30d >= 0.95, detail: ... });

// 7. Structured citations: ≥90% URL coverage on analyst/news claims
//    (read Report.analysis.citations_v2; flat-map URLs; count non-null)
const reports30d = await prisma.report.findMany({
  where: { analyzed_at: { gte: thirtyDaysAgo() }},
  select: { analysis: true },
});
let total_claims = 0, with_url = 0;
for (const r of reports30d) {
  const cits = (r.analysis as any)?.citations_v2 ?? [];
  for (const c of cits) {
    if (['analyst', 'news'].includes(c.source)) {
      total_claims++;
      if (c.url) with_url++;
    }
  }
}
checks.push({ name: 'citations', ok: with_url / total_claims >= 0.90, detail: ... });

// 8. Zero references to old paths in tree (one grep per documented pre-cutover pattern)
//    Each plan that does a cutover MUST register its pre-cutover grep pattern.
//    Patterns kept in `model-card-grep-patterns.json`:
const patterns = JSON.parse(readFileSync('model-card-grep-patterns.json', 'utf8'));
for (const { name, pattern } of patterns) {
  const result = execSync(`rg --count "${pattern}" src/ tests/ scripts/ || true`).toString().trim();
  checks.push({ name: `no-old-${name}`, ok: result === '' || result === '0', detail: ... });
}

// 9. Zero feature flags from Phase 19 remaining in features.ts
const featuresContent = readFileSync('src/lib/features.ts', 'utf8');
const phase19Flags = ['conformal_intervals','cpcv','ic_decay_monitor','hierarchical_pooling','data_cache','tiingo_primary','twelvedata_primary','exa_primary','finsentllm_ensemble','community_supplemental','cove_two_pass','model_router','contradiction_detector','options_term_structure','reputation_weighted_stocktwits'];
for (const flag of phase19Flags) {
  checks.push({ name: `flag-removed-${flag}`, ok: !featuresContent.includes(flag), detail: ... });
}

const failed = checks.filter(c => !c.ok);
if (failed.length === 0) {
  console.log('✓ Phase 19 done gate: ALL CHECKS PASSED');
  process.exit(0);
} else {
  console.error('✗ Phase 19 done gate: FAILED');
  for (const c of failed) console.error(`  - ${c.name}: ${c.detail}`);
  process.exit(1);
}
```

### Sampling Rate (Nyquist Dimension 8)

- **Per task commit:** `npm test` (vitest unit; full suite <30s today)
- **Per wave merge:** `npm test && npm run test:integration` (live-DB; runs against Neon)
- **Per cutover PR:** all of the above + `npm run test:e2e` (Playwright chromium)
- **Phase gate:** `npm run model-card-status` exits 0 (composite check above)

### Wave 0 Gaps (test infra to land BEFORE first plan executes)

- [ ] `tests/lib/features.test.ts` — covers Plan 19-Z-01 (full master plan TDD detail at lines 122-167)
- [ ] `tests/integration/shadow-comparison.live.test.ts` — covers 19-Z-02 ShadowComparison + RollbackLog inserts
- [ ] `tests/lib/shadow/shadow-runner.test.ts` + `tests/lib/shadow/verdict.test.ts` — covers 19-Z-03 (background `setImmediate`, verdict PASS/FAIL/HOLD math)
- [ ] `tests/scripts/model-card-status.test.ts` — covers 19-Z-04 (mock Prisma, verify gate semantics)
- [ ] `tests/learning.unit.bugs.test.ts` — covers 19-A-01 (master plan lines 339-385)
- [ ] `tests/learning.conformal.test.ts` — covers 19-A-03 (synthetic coverage validation per §"19-A-03 conformal" above)
- [ ] `tests/learning.dsr-pbo.test.ts` + `tests/learning.cpcv.test.ts` — covers 19-A-04 (golden-master against Bailey-Lopez de Prado fixtures)
- [ ] `tests/lib/reasoning/alpha-decay-monitor.test.ts` + `tests/integration/alpha-decay-watch.live.test.ts` — covers 19-A-05
- [ ] `tests/scripts/calibration-report.test.ts` — covers 19-A-06
- [ ] `tests/learning.hierarchical.test.ts` + `tests/integration/hierarchical-pooling.convergence.test.ts` — covers 19-A-07
- [ ] `tests/lib/data/cache/upstash.test.ts` — covers 19-B-01 (master plan lines 612-660)
- [ ] `tests/lib/data/retry.test.ts` — covers 19-B-02
- [ ] `tests/lib/data/adapters/{tiingo,twelve-data,exa-search,swaggystocks,apewisdom,quiver}.test.ts` — covers 19-B-03/04/05 + 19-C-05/06
- [ ] `tests/integration/source-package.merge.shadow.live.test.ts` — covers 19-B-06 shadow A/B harness
- [ ] `tests/lib/sentiment/{finsentllm,ensemble,citation-schema,contradiction-detector}.test.ts` — covers 19-C-01/02/07/10
- [ ] `tests/lib/reasoning/{cove,router}.test.ts` — covers 19-C-08/09

**Test framework already detected — no new framework install needed.** Test config files already exist (`vitest.config.ts`, `vitest.integration.config.ts`, `playwright.config.ts`); planner does NOT need a Wave 0 framework setup task.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All plans | ✓ | 24.14.0 | — |
| npm | All plans | ✓ | 11.9.0 | — |
| Vercel CLI | Wave Z (env flag flips), all shadow → cutover sequences | ✓ | 52.0.0 | Manual env var edit via Vercel dashboard |
| Postgres (psql) | Local debugging only | ✓ | 16.9 | Use Neon directly via Prisma |
| ffmpeg | Not used by any plan | ✓ | 8.1 | — (irrelevant) |
| redis-cli | Local Redis CLI debugging (Wave B-01) | ✗ | — | Upstash dashboard for live inspection; tests mock Redis transport |
| Docker | Not used by any plan | ✗ | — | — (irrelevant — pure-TS, no containers per CLAUDE.md) |
| tsx | Wave Z-04, A-04 (audit script), A-06 (calibration), C-11 (Arctic Shift) | install on demand | — | Already used by `scripts/tune-lambda.ts` etc.; `npm install -D tsx` in any plan that needs it |
| Upstash Redis instance | Wave B (cache layer) | external service | — | Graceful degrade: cached() falls through to fetcher (CONTEXT D-24) |
| Neon Postgres | Wave A/B/C live integration tests | external service | — | None — must be provisioned (likely already is per `DATABASE_URL`) |
| HuggingFace Inference Endpoints (3 deployed: FinGPT, Mistral-Fin, FinBERT) | Wave C-01/02/08 | NOT YET PROVISIONED | — | Each client returns null sentinel → ensemble falls back; plans must include "deploy 3 HF endpoints" as a prerequisite step before C-01 shadow phase |
| Tiingo API key | Wave B-03 | NOT YET PROVISIONED | — | Adapter returns null → merge ladder falls through to Yahoo (D-32); needed for cutover to be meaningful |
| Twelve Data API key | Wave B-04 | NOT YET PROVISIONED | — | Same — null fallback to next ladder rung |
| Exa API key | Wave B-05 | NOT YET PROVISIONED | — | Same — null fallback to anthropic-search (D-32) |
| Quiver API key | Wave C-06 (optional) | NOT YET PROVISIONED | — | Plan 19-C-06 only activates if `QUIVER_API_KEY` set; otherwise no-op |

**Missing dependencies with no fallback:** None — every external dependency has a documented degrade path.

**Missing dependencies with fallback:**
- HF Inference Endpoints — null-sentinel from FinSentLLM clients; ensemble degrades to single-model or returns null overall sentiment.
- Tiingo / Twelve Data / Exa / Quiver — every adapter returns `null` on missing API key; merge ladder falls through to existing Yahoo/Finnhub/Polygon/Anthropic-search per D-32.
- Upstash Redis — `cached()` is a transparent wrapper that falls through to fetcher per D-24.

**Action items for the planner:**
1. **Wave Z must include a prerequisite plan or task** that provisions the 7+ new env vars in Vercel. Either add this to Plan 19-Z-01 (extends features.ts to also install env vars) OR a tiny Plan 19-Z-00. I recommend folding it into Z-01.
2. **Plans 19-C-01/02/08 must include an HF endpoint deployment step.** This is operations work, not code — but it gates the shadow phase. Document it as a task in 19-C-01.
3. **No Phase 19 plan should fail catastrophically on missing API keys** — the entire degrade philosophy assumes graceful fallthrough.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | NextAuth (Google) — UNCHANGED in Phase 19; new HF/Upstash/Tiingo/Twelve Data/Exa API keys are SERVER-SIDE only, never exposed to client |
| V3 Session Management | no | Phase 19 doesn't touch session boundaries |
| V4 Access Control | yes | `Report.user_id` scoping preserved; no new shared data exposure; ShadowComparison/RollbackLog tables are admin-only (no API surface exposing them) |
| V5 Input Validation | yes | Zod schemas: `validateHyperparameters` (19-A-01), `citations_v2` schema (19-C-07), all adapter response shapes; HuggingFace responses validated before destructuring |
| V6 Cryptography | yes | All new secrets stored as Vercel encrypted env vars; `UserCredential.encrypted_state` scheme unchanged. **Never hand-roll any crypto.** |
| V7 Error Handling/Logging | yes | New shadow-runner logs new-path errors to console but NEVER propagates to user (D-14). Sensitive values (API keys) MUST never appear in logged URL strings. |
| V8 Data Protection | yes | `community_aggregated` JSONB and `CommunityChatter.raw_text` may contain user-generated Reddit/StockTwits content — review GDPR alignment in design. CLAUDE.md "never store generated research artifacts" — note: "research artifacts" excludes the SourcePackage / SentimentSnapshot evidence trail. |
| V9 Communications | yes | All third-party API calls over HTTPS; Upstash uses HTTPS REST. |
| V10 Configuration | yes | Feature flag matrix is the configuration surface. `validateHyperparameters` at module load catches misconfig early. |
| V11 Business Logic | yes | Verdict engine is the critical piece — verdict CLI must NOT silently mark FAIL paths as PASS due to threshold drift. Master plan stub at 19-Z-03 line 305 specifies exit codes 0/1/2 — keep them strict. |
| V12 Files and Resources | no | No new file upload surface |
| V13 API Security | yes | All cron routes have `CRON_SECRET` Bearer auth pattern (existing). New `/api/cron/alpha-decay-watch` MUST follow same pattern — verify in 19-A-05. |

### Known Threat Patterns for {Cipher / Vercel + Neon + AI Gateway}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Prompt injection via SourcePackage content | Tampering / Information Disclosure | Wave C-08 CoVe two-pass IS the mitigation; structured citations (C-07) bound the LLM's claim space; engine-context.ts trust boundary already documented |
| API key leak via shadow-comparison logs | Information Disclosure | Shadow-comparison stores `old_output_json` / `new_output_json` — sanitize before persist (strip any URL with embedded auth) |
| Unbounded ShadowComparison table growth | Denial of Service (storage cost) | D-15 daily cron GC for rows >30 days |
| Cron auth bypass on new alpha-decay-watch route | Elevation of Privilege | Reuse the existing `if (authHeader !== Bearer ${CRON_SECRET}) return 401` pattern from `/api/cron/learn` |
| HuggingFace endpoint URL guessing | Information Disclosure | Endpoint URLs include opaque IDs; treat as secrets, store in Vercel env, never log full URL on error |
| Reddit content / Reddit user content | Tampering / Privacy | Don't store user IDs in `CommunityChatter`; `reputation_weight` is derived per-call, not persisted per-user; respect Reddit content licensing — Arctic Shift archives are under CC-BY-NC for academic use |
| Race condition on cutover (env flag flip vs deploy lag) | Tampering | The Vercel deploy-then-flag-flip ordering: deploy code with flag default `off`; THEN flip env; THEN trigger redeploy of env. CONTEXT D-09 lifecycle assumes this ordering. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | DSR / PBO numerical fixtures from Bailey-Lopez de Prado 2014 paper Section 4 are recoverable to 6 decimals | Validation Architecture §"19-A-04 golden-master" | Plan 19-A-04 lands without a real golden-master; planner should require the implementer to download the paper PDF and verify exact values during implementation, falling back to `pypbo` library cross-validation |
| A2 | HuggingFace Inference Endpoints have a "always-on" mode at ~$10/mo per endpoint | Pitfall 4, Cost envelope | If always-on is more expensive than $10/mo per endpoint, the D-49 cost envelope ($135 total) may slip; if not available at all, every shadow window for C-01/C-02 has cold-start latency variance and the verdict gate must be tuned |
| A3 | The Bailey-Lopez de Prado DSR threshold (>0.5 for "industry-standard") is a sensible composite-gate value | Validation Architecture §model-card-status check 2 | If too lax, the gate passes prematurely; if too strict, Phase 19 cannot complete; Plan 19-A-04 audit step calibrates the actual threshold |
| A4 | ApeWisdom API endpoint shape `https://apewisdom.io/api/v1.0/filter/{filter}/page/{n}` is stable and unauthenticated | Wave C-05 design assumption | Endpoint moves or starts requiring auth → 19-C-05 plan stub becomes longer; community-discovered shape, no SLA |
| A5 | Swaggystocks has a free public endpoint with parseable JSON | Wave C-05 design assumption | Web search did NOT verify a stable public endpoint shape; planner must confirm before 19-C-05 implementation. Mitigation: fall back to Firecrawl scraping `swaggystocks.com` directly (Firecrawl is primary anyway per D-37) |
| A6 | Arctic Shift API rate limits are >= 60 req/min for one-time backfill use | Wave C-11 | At slower limits, 5y × 100+ tickers backfill could take days; mitigation: run backfill as a long-running script, not a Vercel function (already the design — `scripts/arctic-shift-backfill.ts`) |
| A7 | Method-of-moments empirical Bayes for Beta-Binomial is sufficient for hierarchical pooling (vs MLE / EM) | Plan 19-A-07 implementation | If MoM produces unstable parent_alpha estimates on small group sizes, convergence speedup may not hit the ≥30% threshold; mitigation: add a fallback to EBMLE (one Newton step) when MoM diverges |
| A8 | Existing test infra (Vitest 3.0.9 + Playwright 1.58.2) handles all Phase 19 test types without upgrade | Validation Architecture | If Vitest 3 has unknown limitations on integration tests in Wave A live-DB, this surfaces during Wave 0 setup; mitigation: planner adds a Wave 0 smoke task running `npm test && npm run test:integration` against current main |
| A9 | The Phase 18-10 hyperparameter sanity test stays green after Plan 19-A-01's Zod `.strict()` schema lands | Pitfall 2 | Schema mismatch breaks module load → every test fails; mitigation: 19-A-01's test `validates current bootstrap config` is the canary |
| A10 | `npm run test:integration` and `npm run test:e2e` run reliably in CI environment with Neon test DB | Phase gate | Tests that pass locally but fail in CI are the worst kind; mitigation: Wave 0 includes a CI-mode smoke test |

**This table is non-empty** — all 10 assumed claims need user/implementer confirmation during Phase 19 execution. The discuss-phase agent or the planner should treat these as items to validate during the relevant plan's first task.

---

## Open Questions

1. **HF Inference Endpoint provisioning order**
   - What we know: 3 endpoints needed (FinGPT v3, Mistral 7B fin-tuned, FinBERT); pricing ~$0.03/hr base, scales by GPU
   - What's unclear: which specific HF model revisions to pin (CONTEXT D claims "latest stable as of execution" — but `latest` drifts during the 4-5 week Wave C window)
   - Recommendation: Plan 19-C-01 step 1 = pin specific model revisions in `.env.example` placeholder values (e.g., `HF_FINGPT_ENDPOINT=https://<id>.aws.endpoints.huggingface.cloud/fingpt-v3@<commit-sha>`). The planner should add a step that records the pinned revision in a comment in `finsentllm.ts`.

2. **Threshold values for DSR/PBO in model-card-status**
   - What we know: DSR/PBO are computed; gate exists
   - What's unclear: actual numeric thresholds (DSR > 0.5? > 0.95?)
   - Recommendation: Plan 19-A-04 deliverable includes calibration step — run DSR/PBO against current LearnedPattern data, document distribution, set threshold at 75th percentile (mature signal class) or as documented in the design doc's Section 12.1. Plan 19-Z-04 reads the threshold from a config constant produced by 19-A-04.

3. **Subreddit list for Firecrawl expansion (D-44)**
   - What we know: r/wallstreetbets + r/stocks + r/SecurityAnalysis + r/algotrading
   - What's unclear: which existing Firecrawl call site adds the new subreddits
   - Recommendation: this is a tiny edit to `src/lib/data/lightweight-community-scan.ts` configuration; not a new plan, fits into Wave C scope; planner should attach to 19-C-05 (which is the Wave C community plan).

4. **CoVe NLI model choice — FinBERT or distilbert-mnli?**
   - What we know: CoVe paper uses generic NLI; CONTEXT D-40 says "FinBERT or distilbert-mnli"
   - What's unclear: which has better verification accuracy on financial claims
   - Recommendation: Plan 19-C-08 first task = run both NLI variants on a held-out set of 100 known Cipher reports + manual ground-truth labels for hallucinations. Pick the higher-accuracy variant. Distill the choice into a code comment.

5. **Cell-space pruning policy under hierarchical pooling**
   - What we know: D-23 says "falls back to flat prior when group n<5"; CORE-ML-14 says "cells not observed in N days AND ESS<threshold are not allocated"
   - What's unclear: exact N (in days) and the ESS threshold for pruning
   - Recommendation: Plan 19-A-07 inherits from existing `recomputeOneCell` skip behavior — current code at `learn/route.ts:79-80` only iterates 3 cap classes. Planner should set N=90 days (matches the existing 90-day event cleanup at the bottom of the cron route) and ESS threshold = 5 (matches CONTEXT D-23 cold-start threshold).

---

## Sources

### Primary (HIGH confidence)
- npm registry — `npm view @upstash/redis version` → 1.38.0 (2026-05-05); `npm view exa-js version` → 2.12.1 (2026-04-22); `npm view @huggingface/inference version` → 4.13.15 (2026-03-06)
- Cipher codebase grep on 2026-05-06 — verified all `decayWeights` call sites, `HYPERPARAMETERS` consumers, existing test infrastructure, vercel.json cron config
- `docs/plans/2026-05-07-cipher-v2-excellence-design.md` — design doc (authority for D-01..D-50)
- `docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md` — master implementation plan with Z-01/A-01/B-01/C-01 in full TDD detail
- `src/lib/learning.ts` lines 360-371, 519-548 — verified decayWeights signature and HYPERPARAMETERS structure
- `src/app/api/cron/learn/route.ts` lines 490-577 — verified Wave A integration surface (recomputeOneCell)

### Secondary (MEDIUM confidence)
- Vercel docs https://vercel.com/docs/caching/runtime-cache (Runtime Cache + `use cache: remote`)
- Next.js docs https://nextjs.org/docs/app/api-reference/directives/use-cache (Cache Components, cacheLife)
- HuggingFace Inference Endpoints docs https://huggingface.co/docs/inference-endpoints/pricing (~$0.03/hr base)
- ApeWisdom API https://apewisdom.io/api/ (endpoint shape `/v1.0/filter/{filter}/page/{n}`)
- Arctic Shift https://arctic-shift.photon-reddit.com/ + https://github.com/ArthurHeitmann/arctic_shift (Pushshift successor)
- Quiver API https://api.quiverquant.com/docs/ ($30/mo Hobbyist Tier 1)
- Bailey-Lopez de Prado DSR paper https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf (numerical example values cited)
- Bailey-Borwein-Lopez de Prado-Zhu PBO paper https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf (CSCV formulation)
- Vovk-Romano split conformal — Wikipedia + Berkeley/Tibshirani lecture notes
- CoVe paper https://arxiv.org/abs/2309.11495 (Dhuliawala et al. 2024); ACL Anthology 2024.findings-acl.212
- FinSentLLM benchmarks — arxiv.org/html/2510.05151v1 (FLANG/FinGPT/FinBERT F1 scores)
- pypbo reference https://github.com/esvhd/pypbo (Bailey-Borwein-Lopez de Prado-Zhu Python implementation)
- Empirical Bayes / method-of-moments — kiwidamien.github.io/shrinkage-and-empirical-bayes-to-improve-inference.html

### Tertiary (LOW confidence — needs validation during execution)
- Twelve Data fundamentals endpoint pricing — credit-based; specific endpoint cost in credits not verified, must check g2/twelvedata.com pricing during 19-B-04 execution
- Tiingo point-in-time fundamentals endpoint shape and rate limit — generic Tiingo docs found, but specific PIT endpoint details deferred to live verification during 19-B-03
- Swaggystocks API endpoint shape — no official docs; community-discovered; planner must verify or fall back to Firecrawl
- Specific HF model revision SHAs for FinGPT v3 / Mistral 7B fin-tuned — must pin at time of 19-C-01 execution
- DSR / PBO threshold values for the composite gate — calibrated during 19-A-04 audit, NOT in training data

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every recommended version verified against npm registry on 2026-05-06
- Architecture: HIGH — all integration points grep-verified in current codebase
- Pitfalls: HIGH — 7 specific pitfalls each tied to a concrete file:line in the codebase
- Validation Architecture: MEDIUM-HIGH — golden-master numerical anchors verified to paper-level via web search; specific test fixture values must be pinned during 19-A-04 execution against the paper PDFs
- Schema migration ordering: HIGH — bundling recommendation grounded in Postgres ALTER TABLE semantics + Prisma client regeneration cost
- Shadow A/B output-comparison metrics: MEDIUM — recommended metrics derived from output-type analysis, NOT from prior shadow A/B implementations in this codebase (this is the first phase using shadow A/B); planner should treat these as starting points
- Library versions for HF / Upstash / Exa: HIGH — verified
- ApeWisdom / Swaggystocks endpoint shapes: MEDIUM — verified via web search but no official SLA; flagged in Assumption Log

**Research date:** 2026-05-06

**Valid until:** 2026-06-06 (30 days for stable libraries; HF Inference Endpoints pricing/availability could move within 14 days, so reverify before any C-01 execution after 2026-05-20)
