# Phase 19: Cipher v2.0 Excellence — Context

**Gathered:** 2026-05-07
**Status:** Ready for planning
**Source:** Design doc + Implementation plan (PRD Express Path)

<domain>
## Phase Boundary

Phase 19 is a brownfield additive overhaul of three Cipher subsystems (data, sentiment/reasoning, ML), shipped as four parallel waves under a single phase identifier. Every existing fetcher, prompt, model, and learning primitive remains in tree as a fallback; new code paths land behind feature flags, run in shadow A/B vs the canonical path, atomically cut over on PASS verdict, and delete the old path in the same commit.

The phase ends when `npm run model-card-status` exits zero — a composite-DoD check that asserts every quant-grade primitive (CPCV, DSR, PBO, conformal, hierarchical pooling, alpha-decay monitor, FinSentLLM ensemble, structured citations) is live AND zero feature flags from this effort remain in `features.ts` AND zero references to deleted old code paths exist in tree.

Phase boundary in / out:
- **IN:** Track Z (shadow + cutover infra), Track A (ML hygiene + quant-grade validation, including hierarchical pooling absorbed from original v2.0 P19), Track B (data layer modernization), Track C (sentiment + reasoning excellence)
- **OUT:** Market-Regime Feature (P20), Historical Backfill (P25), Lift-Gated Cell Promotion (P21), Composite Signal Synthesis (P22), Counterfactual Reasoning (P23), Adaptive Watchlist (P24), Performance Dashboard (P26), Public Calibration Trail + Model Card (P27) — these continue the v2.0 sequence after Phase 19 completes
- **OUT:** Removing or modifying any existing fetcher's interface (Yahoo / Finnhub / Polygon / Anthropic-search / Firecrawl all stay) — this is brownfield additive only

</domain>

<decisions>
## Implementation Decisions

### Wave structure
- **D-01:** Phase 19 is split into four waves: Wave Z (4 plans, infra prereq), Wave A (7 plans, ML hygiene + quant + hierarchical), Wave B (8 plans, data), Wave C (11 plans, sentiment + reasoning). 30 plans total.
- **D-02:** Wave Z ships first (3 days). Waves A/B/C run in parallel after Z lands.
- **D-03:** Wave A absorbs the original v2.0 Phase 19 (Hierarchical Priors / Partial Pooling) as Plan 19-A-07. Original P19 acceptance criteria preserved.

### Autonomous execution (mandatory in every plan's preamble)
- **D-04:** Agent (Claude) executes every plan end-to-end without user authorization between gates. User receives status reports but does not approve each step.
- **D-05:** Per-path lifecycle: land code (flag off) → flip to shadow → drive workload (≥200 req OR 3-7 days) → run `npm run shadow-verdict <plan-id>` → PASS = cutover PR with old code DELETED in same commit → 7-day rollback hatch → final flag-removal PR.
- **D-06:** Hard Cleanup Gate (Definition of Done for EVERY plan): shadow-reports/<plan-id>.json verdict=PASS AND cutover PR merged with old code deleted AND 7d post-cutover with zero RollbackLog entries AND flag-removal PR merged AND vitest+integration+e2e all green on main post-cleanup.
- **D-07:** `/gsd-execute-phase` MUST refuse to mark a plan complete until all five Hard Cleanup Gate conditions hold.

### Composite Phase 19 done gate
- **D-08:** Phase 19 is not done until `npm run model-card-status` exits zero. Script asserts: conformal coverage validated, DSR > threshold, PBO < threshold, IC monitor live, hierarchical pooling live (parent_alpha/parent_beta populated for ≥80% of cells), FinSentLLM ensemble live, structured citations live (≥90% URL coverage), zero references to old code paths in tree, zero feature flags from this effort remaining in `features.ts`.

### Feature flag matrix (Wave Z deliverable)
- **D-09:** Three-mode flag (`off` | `shadow` | `on`) per env triple. Lifecycle: off → shadow → on → flag removed entirely.
- **D-10:** All 15 flags default to `off` on first deploy. Each graduates independently after its own shadow verdict passes.

### Shadow A/B → atomic cutover protocol
- **D-11:** PASS rule: new ≥ old on quality AND (latency OR cost) AND output disagreement < 5%
- **D-12:** FAIL rule: new < old on quality OR latency_p95 ≥ 2× old OR cost > 1.5× old
- **D-13:** HOLD rule: quality unmeasurable AND row count < 200 → extend window
- **D-14:** New path runs in `setImmediate()` background — old path returns first; new path latency tracked but doesn't gate user response
- **D-15:** ShadowComparison rows older than 30 days garbage-collected by daily cron
- **D-16:** Rollback = one env-var flip during the 7-day hatch. After 7 quiet days, second PR removes the flag entirely.

### Wave A — ML Hygiene + Quant-Grade Validation (7 plans)
- **D-17:** Plan 19-A-01: `decayWeights` rejects `lambdaDays ≤ 0` with descriptive error; HYPERPARAMETERS validated at module load via Zod
- **D-18:** Plan 19-A-02: Brier OOS split bug — replace `max(1, n-14)` with time-based 80/20 split honoring chronology; embargo enforcement on `buildTraceForOutcome`
- **D-19:** Plan 19-A-03: Conformal prediction primitive (Vovk-Romano split-conformal); coverage validated within ±2% of nominal 1-α on synthetic data
- **D-20:** Plan 19-A-04: DSR (Bailey-Lopez de Prado), PBO (Bailey-Borwein-Lopez de Prado-Zhu), CPCV (Lopez de Prado 2018 ch.7) — all golden-master tested against published examples (≤1e-6 tolerance)
- **D-21:** Plan 19-A-05: Rolling 20d Spearman rank-IC per signal class; `ic_decay_flag = true` when `rolling_ic_20d < 0.02` for 5 consecutive days
- **D-22:** Plan 19-A-06: Calibration validation harness — reliability diagram (10 quantile bins) + Hosmer-Lemeshow chi-square test; output to `calibration-reports/<date>.md`
- **D-23:** Plan 19-A-07 (absorbed P19): Empirical Bayes hierarchical pooling; pool α/β across cells in same `(signal_class, cap_class)` group; per-cell shrinkage `α_pooled = (n × α_local + λ × α_group) / (n + λ)`; λ learned per group; falls back to flat prior when group n<5

### Wave B — Data Layer Modernization (8 plans)
- **D-24:** Plan 19-B-01: Upstash Redis cache layer (`cached(key, fetcher, opts)` wrapper); graceful degrade on Redis outage (fall through to fetcher)
- **D-25:** Plan 19-B-02: Retry + exponential backoff wrapper (5xx + network errors only, NOT 4xx); 3 attempts, 100ms base
- **D-26:** Plan 19-B-03: Tiingo adapter (point-in-time fundamentals + EOD); $30/mo
- **D-27:** Plan 19-B-04: Twelve Data adapter (fundamentals); $29/mo
- **D-28:** Plan 19-B-05: Exa 2.0 adapter (news/analyst, replaces Anthropic-search hot path); ~$5/mo
- **D-29:** Plan 19-B-06: source-package.ts merge precedence reorder — new ladder: tiingo → twelvedata → yahoo → finnhub → polygon. Old ladder kept when flags off (no behavior change for current users). **Shadow A/B starts here.**
- **D-30:** Plan 19-B-07: Vercel Runtime Cache for SourcePackage (10min idempotency)
- **D-31:** Plan 19-B-08: Feature flag rollout + dual-write verification (process-only plan, drives the cutover for B-06/B-07)
- **D-32:** Yahoo / Finnhub / Polygon / Anthropic-search adapters remain wired up as fallbacks — NOT deleted from tree. Only the direct call from `source-package.ts` primary path is removed after shadow verdict passes.

### Wave C — Sentiment + Reasoning Excellence (11 plans)
- **D-33:** Plan 19-C-01: HF Inference Endpoint clients for FinGPT v3, Mistral 7B finance-tuned, FinBERT; uniform `SentimentScore` interface; null sentinels on error (do not throw)
- **D-34:** Plan 19-C-02: Ensemble meta-classifier — weighted average of non-null scores (weight = confidence); agreement = 1 - std(scores); falls back to single available if 2+ models null
- **D-35:** Plan 19-C-03: Reputation-weighted StockTwits — `score = Σ(message_sentiment × user_reputation) / Σ(user_reputation)`; reputation from follower count + post history (cached per user 24h)
- **D-36:** Plan 19-C-04: Options term-structure 30/60/90d weighted by Open Interest; new IV regime classifier (high-IV regime flips put/call interpretation)
- **D-37:** Plan 19-C-05: Swaggystocks + ApeWisdom adapters (SUPPLEMENTAL); merged into `community_aggregated` JSONB column on SentimentSnapshot. **Firecrawl remains primary** per user direction 2026-05-07 ("firecrawl is very reliable").
- **D-38:** Plan 19-C-06: Quiver adapter (insider + congressional trades); OPTIONAL flag — only activates if `QUIVER_API_KEY` env set; ~$30/mo Hobbyist tier
- **D-39:** Plan 19-C-07: Structured citation schema `{ source, url, confidence, date_retrieved }`; replaces free-text `source_citation: string` in `AnalysisResultSchema`; mandatory URL for analyst/news claims at Zod validation time
- **D-40:** Plan 19-C-08: Chain-of-Verification (CoVe) two-pass — Pass 1: Gemini emits `AnalysisResult` + 3 verification claims; Pass 2: NLI check (FinBERT or distilbert-mnli) on each claim vs SourcePackage; contradictions flagged in `source_warnings`
- **D-41:** Plan 19-C-09: Model cascade router — `routeModel({ ticker, controversy, ic_decay_flag })` returns `'haiku' | 'gemini-flash' | 'gemini-pro'`; cost telemetry logged to LearningEvent for `/insights` dashboard
- **D-42:** Plan 19-C-10: Cross-class contradiction detector — NLI on pairs of class posteriors; severity threshold flagged in EngineCalibrationPanel; first cycle in detection-only mode (don't gate output)
- **D-43:** Plan 19-C-11: Arctic Shift one-time historical Reddit backfill (5y of v1.0 ticker universe); populates `CommunityChatter` historical rows for FinSentLLM training corpus; no shadow (one-time ingest)
- **D-44:** Subreddit expansion via Firecrawl (no new adapter needed): r/wallstreetbets + r/stocks + r/SecurityAnalysis + r/algotrading
- **D-45:** Optional: Unusual Whales options-flow adapter ($50/mo, dark pools + flow signals) — out of scope for initial Wave C plans, deferred to follow-up

### Schema additions (additive only — Plan 19-Z-02 + per-plan additions)
- **D-46:** `LearnedPattern` adds: `rolling_ic_20d`, `ic_decay_flag` (default false), `dsr`, `pbo`, `conformal_low`, `conformal_high`, `parent_alpha`, `parent_beta`, `shrinkage_strength` — all nullable
- **D-47:** `SentimentSnapshot` adds: `community_aggregated` (Json), `citations_v2` (Json), `finsentllm_score`, `model_agreement` — all nullable
- **D-48:** New tables: `CommunityChatter` (id, ticker, source, url, raw_text, finsentllm_score, reputation_weight, scraped_at); `ShadowComparison` (id, path_name, ticker, old_output_json, new_output_json, latencies, costs, created_at); `RollbackLog` (id, feature_flag, reason, created_at)

### Cost envelope
- **D-49:** Total monthly infra cost ≤ $135 (Twelve Data $29 + Tiingo $30 + Exa ~$5 + Upstash ~$5 + HF Inference ~$10 + Quiver $30 + Unusual Whales $50 if enabled)
- **D-50:** Replaces ~$200/mo of Anthropic-search burn → net savings ~$65/mo while gaining all the quant-grade primitives

### Testing requirements (per plan)
- **D-51:** Vitest unit tests for every primitive
- **D-52:** Live-DB integration tests for cron + DB-touching code
- **D-53:** Playwright E2E tests for any UI surface change (e.g., EngineCalibrationPanel updates)
- **D-54:** Plan 18-10 hyperparameter sanity test (`tests/learning.hyperparameters.test.ts`) MUST stay green throughout — no regression to nyquist_compliant: true sign-off

### Claude's Discretion
- Internal naming of helper functions, test descriptions, error message wording
- Exact directory layout under `src/lib/sentiment/`, `src/lib/reasoning/`, `src/lib/shadow/` (subdirectory organization)
- Choice of Zod parser ergonomics (e.g., `z.discriminatedUnion` vs `z.union`)
- Specific HF model revision pins (must use latest stable as of execution)
- Mock strategies in unit tests (HTTP mocks vs fixture loads)
- Wave-internal task ordering when not gated by D-XX dependency

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design + master plan (this effort's source of truth)
- `docs/plans/2026-05-07-cipher-v2-excellence-design.md` — Phase 19 design doc with architecture, data flow, sequencing, schema, risk register, sign-off. THE source of truth for every D-XX above.
- `docs/plans/2026-05-07-cipher-v2-excellence-implementation-plan.md` — Master implementation plan with full TDD detail for first plan of each wave (19-Z-01, 19-A-01, 19-B-01, 19-C-01) plus stubs for remaining 26 plans.

### Existing learning engine (must not regress)
- `src/lib/learning.ts` — Phase 18 ML primitives (decayWeights, computeESS, pageHinkleyStatistic, confirmedDrift, HYPERPARAMETERS); Wave A is additive only, no edits to existing pure-function logic
- `src/app/api/cron/learn/route.ts` — Phase 18 recompute logic; Wave A edits only to wire in DSR/PBO/IC/hierarchical
- `src/app/api/cron/backfill-ess/route.ts` — Phase 18-05 ESS backfill route, pattern reference for any new backfill cron (Plan 19-C-11)
- `tests/learning.hyperparameters.test.ts` — Plan 18-10 sanity test, MUST NOT regress

### Existing data layer (additive ladder; no removal)
- `src/lib/data/source-package.ts` — orchestrator; Plan 19-B-06 reorders merge precedence
- `src/lib/data/merge.ts` — field-level merge; Plan 19-B-06 extends `FieldOrigin` union
- `src/lib/data/yahoo.ts`, `src/lib/data/finnhub.ts`, `src/lib/data/polygon.ts`, `src/lib/data/anthropic-search.ts` — UNCHANGED, kept as fallbacks
- `src/lib/data/stocktwits.ts` — Plan 19-C-03 adds reputation-weighted mode (additive flag)
- `src/lib/data/options-sentiment.ts` — Plan 19-C-04 adds term-structure mode (additive flag)
- `src/lib/data/lightweight-community-scan.ts` — existing Firecrawl path; Wave C does NOT touch it (Firecrawl stays primary)

### Existing reasoning + sentiment layer
- `src/lib/gemini-analysis.ts` — Plan 19-C-07 adds `citations_v2`, Plan 19-C-08 wires CoVe, Plan 19-C-09 wires router
- `src/lib/research-brief.ts` — Plan 19-C-07 adds structured citations to prompt
- `src/lib/engine-context.ts` — Wave A adds conformal_low/high + ic_decay_flag + hierarchical posterior surface

### Project-wide
- `CLAUDE.md` — project overview + AI agent guidelines
- `.planning/ROADMAP.md` — Phase 19 detail section (Phase Details) just added
- `.planning/STATE.md` — project state for cross-phase consistency
- `.planning/REQUIREMENTS.md` — CORE-ML-11..14 requirements absorbed from original P19
- `prisma/schema.prisma` — Plan 19-Z-02 + scattered Wave A/C plans add additive columns/tables

### Schema migration pattern
- `prisma/migrations/` — pattern reference for additive ALTER TABLE migrations (must be nullable + default; Postgres skips full table rewrite)

</canonical_refs>

<specifics>
## Specific Ideas

### 2026 industry research (from audit phase, Section 1 + Section 2 deltas)
- FinSentLLM > FinBERT alone — ensemble of FinGPT v3 + Mistral 7B + FinBERT meta-classifier achieves 92% F1 on FiQA-SA (FLANG benchmark)
- Reddit alpha decay: HOURS, not days. Rolling-IC monitor (Plan 19-A-05) is the alpha-decay tripwire.
- CPCV + DSR + PBO are Lopez de Prado's anti-backtest-overfitting trifecta — Plan 19-A-04 implements all three; v2.0 P21 (Lift-Gated CV) imports them
- Conformal prediction (Vovk-Romano) gives honest distribution-free CI bands; complements existing Bayesian credible intervals (NOT a replacement)
- Hierarchical empirical Bayes pooling (Plan 19-A-07) shrinks per-cell α/β toward group prior — defeats lake-of-cells starvation when n<10

### Free / cheap Reddit-sphere data sources
- Reddit official API ($12K/year minimum) — TOO EXPENSIVE, skip
- Pushshift dead → Arctic Shift is the free successor (Plan 19-C-11)
- Swaggystocks free real-time WSB chatter; ApeWisdom free trending tickers; Stocktwits free
- Quiver Hobbyist $30/mo for insider + congressional cross-validation (optional flag)

### Vercel-native infra
- Upstash Redis (Plan 19-B-01) — free tier 10K cmds/day, then ~$5/mo
- Vercel Runtime Cache (Plan 19-B-07) — included in Pro plan, Next.js 16 `use cache` directive

</specifics>

<deferred>
## Deferred Ideas

These came up during research but explicitly deferred OUT of Phase 19:

- **Unusual Whales options-flow adapter** ($50/mo, dark pools) — deferred to follow-up; Plan 19-C-04 (term-structure) covers options sentiment for now
- **Twitter/X API ingestion** — $0.005/post too expensive for continuous scraping; not worth the integration cost
- **BloombergGPT / proprietary commercial sentiment models** — out of scope; FinSentLLM ensemble (open-weight) is the chosen path
- **Real-time websocket ingestion of any source** — all current adapters poll; no streaming infra in Phase 19
- **Multi-language sentiment** — English-only for now; non-English subreddits / Naver / Xueqiu deferred
- **Public model card** — covered by v2.0 Phase 27, NOT this phase

</deferred>

---

*Phase: 19-cipher-v2-0-excellence*
*Context gathered: 2026-05-07 via PRD Express Path (design doc + impl plan)*
