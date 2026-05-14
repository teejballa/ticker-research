---
status: resolved
trigger: "User reports that in PRODUCTION the Bayesian learning engine is not working. They want a full diagnosis across all environments (local dev, preview, prod) — find why ML is failing and where, then plan the fix."
created: 2026-05-13T20:30:00-07:00
updated: 2026-05-13T21:21:00-07:00
resolved: 2026-05-13T21:21:00-07:00
prod_deploy: dpl_2h74dnGU1wXJw4eKQTwckWB2qwzN
prod_url: https://ticker-research-pumfgnx8r-tjameswalsh-8512s-projects.vercel.app
verification_curl: "GET /api/cron/learn → HTTP 200 outcomes_processed=13 hits=6 traces_built=8 logistic_updates=5"
---

## Current Focus

hypothesis: confirmed — /api/cron/learn route module-load throws ENOENT scanning src/lib/prompts (prompt registry _manifest.ts reads from a path that doesn't exist in the Vercel serverless bundle), so the Bayesian learn cycle has not run successfully in production. Compounded by other deployment-level issues.
test: live HTTP invocation of all three crons against ciphersearch.app with the prod CRON_SECRET, parallel Neon prod DB row-count audit, prompt-registry source reading, Vercel runtime log capture.
expecting: matched — see Evidence section.
next_action: User flipped to find_and_fix mode. Apply Fix 1 (refactor _manifest.ts to build-time generated static imports), Fix 2 (verify no client leak), Fix 3 (sentiment_observations wiring or safe log), Fix 5 (regression test). Skip Fix 4 (data quality / yahoo + firecrawl + gemini) unless trivial.

## Symptoms

expected: Bayesian learning engine (LearnedPattern priors, SentimentObservation feature store, sentiment-scan + price-followup + learn cron pipeline) is updating posteriors and surfacing them via EngineCalibrationPanel and /insights — in all environments.

actual: In production the Bayesian learning engine is "not working" per user report. Confirmed: /api/cron/learn returns HTTP 500 in prod. Daily learning cycle has not run successfully for ~10h+ in prod and was running degraded for days before that.

errors: prod runtime log captures `Error: ENOENT: no such file or directory, scandir '/vercel/path0/src/lib/prompts'` thrown from `.next/server/app/api/cron/learn/route.js`. Originates from `src/lib/prompts/_manifest.ts:156` `readdirSync(__dirname, …)` at module load.

reproduction:
1. `curl -H "Authorization: Bearer <CRON_SECRET>" https://ciphersearch.app/api/cron/learn` → HTTP 500.
2. `curl -H "Authorization: Bearer <CRON_SECRET>" https://ciphersearch.app/api/cron/sentiment-scan` → HTTP 200, `{"ok":true,"scanned":6,...,"obs_written_*": 0}` for every ticker (Phase-20-Z-01 silent no-op).
3. Inspect Vercel runtime logs for ticker-research alias ciphersearch.app: `vercel logs ... | grep -i cron` → ENOENT stack.
4. Query Neon prod: `SELECT MAX(occurred_at), COUNT(*) FROM learning_events WHERE event_type='posterior_update'` → last successful posterior update 2026-05-13T17:38:26Z (≈10h ago), then nothing.

started:
- Phase 20-Z-04 (prompt registry + _manifest.ts) shipped commit 6464235 at 2026-05-11T21:49:36-07:00.
- Phase-20-Z-04 broke the learn cron the moment it cold-started on Vercel because the .md prompt bodies under src/lib/prompts/_v1/_v2 are not bundled into the serverless route output.
- Last 14 prod deployments: 6 are ● Error (build failures from the same `node:fs / node:path / node:url` UnhandledSchemeError in webpack for `/src/lib/prompts/_manifest.ts`). The Ready deployments inherited a working build cache so the bundle ships — but at runtime the readFileSync/readdirSync calls still execute and crash because the .md files don't exist in the lambda fs layout.

## Eliminated

- hypothesis: DATABASE_URL missing or wrong in prod.
  evidence: prod DB IS being read/written from prod runtime. `provider_call_logs` has 569 rows with most recent at 2026-05-14T03:02:36Z; `sentiment_snapshots` has 175 rows with most recent at 2026-05-14T03:00:19Z; `reports.analyzed_at` latest 2026-05-14T03:02:35Z. Adapter is healthy.
  timestamp: 2026-05-13T20:48

- hypothesis: All Phase-20 tables missing in prod (the "1/15 DoD Gate" memory note).
  evidence: All 9 Phase-20 tables exist post fd5a742. `_prisma_migrations` shows `20260514_phase_20_consolidate` finished_at 2026-05-14T01:03:10Z, applied_steps_count=1, rolled_back_at=null. Schema audit confirms 22 expected tables present.
  timestamp: 2026-05-13T20:48

- hypothesis: AI Gateway / Gemini key missing → learn cron's `generateText` call fails.
  evidence: gemini provider has 9 successful calls in last 24h (error_rate=0) via /api/insights/sentiment-health. The learn cron's Gemini call is also inside a try/catch that falls back to a deterministic summary, so even if it failed it would NOT 500 the route.
  timestamp: 2026-05-13T20:50

- hypothesis: CRON_SECRET mismatch.
  evidence: cron auth IS passing — sentiment-scan returns 200 with detailed body, price-followup returns 200. learn returns 500 AFTER auth passes (module-load crash).
  timestamp: 2026-05-13T20:50

## Evidence

- timestamp: 2026-05-13T20:40
  checked: prod Neon DB row counts via `@neondatabase/serverless` direct query
  found:
    learned_patterns=87 (status=EXPLORATORY for all 87, ACTIVE=0)
    learning_events=515 (last posterior_update 2026-05-13T17:38:26Z, ≈10h ago)
    logistic_epochs=5 (last epoch=8 recorded 2026-05-13T17:38:36Z)
    sentiment_snapshots=175 (last 2026-05-14T03:00:19Z — sentiment-scan IS still firing)
    price_outcomes=326 (last 2026-05-14T02:51:45Z — price-followup IS firing)
    sentiment_observations=0 (Phase-20-Z-01 PIT feature store EMPTY despite tables existing)
    provider_call_logs=569 (telemetry IS firing)
    bot_filter_flags=0, coordination_clusters=0 (Phase-20-C-03 silent no-op)
    source_tiers=0, per_source_ic=0, manipulation_warnings=0, fairness_audit_reports=0 (Phase-20 monthly crons haven't run yet)
    engine_theses=1 (last 2026-05-10T22:42:26Z — 3 days stale)
  implication: The learning loop is partially dead: snapshots and price outcomes accumulate, but the daily `/api/cron/learn` recompute never completes, so LearnedPattern.alpha/beta/effective_sample_size/status are frozen at their May-13-17:38 state. The Phase-20-Z-01 sentiment_observations feed feeding into 20-A-03 / 20-B-04 / 20-C-01 has never written a single row.

- timestamp: 2026-05-13T20:42
  checked: prod cron route invocations via curl + CRON_SECRET against ciphersearch.app
  found:
    /api/cron/learn → HTTP 500 "Internal Server Error" (Next default error page)
    /api/cron/sentiment-scan → HTTP 200 `{"ok":true,"scanned":6,"failed":1,"skipped":12,"obs_written_*":0,"obs_dupes_*":0,"obs_errors_*":0,...}` for each ticker
    /api/cron/price-followup → HTTP 200 `{"ok":true,"outcomes_recorded":0,"skipped":28,"failed":0}`
  implication: The `learn` route is dead at module-load. The other two routes complete but `sentiment_observations` rows are NOT being written even when sentiment-scan succeeds. (sentiment-scan's stocktwits-message loop only fires when `communityData.stocktwits.messages` exists; lightweightCommunityScan currently returns EnrichedSnapshot summary data, not raw messages — see route.ts:114, comment lines 109–113 acknowledge this.)

- timestamp: 2026-05-13T20:45
  checked: Vercel runtime logs `vercel logs https://ticker-research-5gl0cwxcr-...vercel.app | grep -iE "(cron|learn|sentiment-scan|price-followup|error)"`
  found:
    ```
    20:38:38.46  🚫  GET  ---  ciphersearch.app  ƒ  /api/cron/learn
    ⨯ Error: ENOENT: no such file or directory, scandir '/vercel/path0/src/lib/prompts'
        at <unknown> (.next/server/app/api/cron/learn/route.js:1:27737)
        at 87400 (.next/server/app/api/cron/learn/route.js:1:29154)
        at 15286 (.next/server/app/api/cron/learn/route.js:1:971)
        at <unknown> (.next/server/app/api/cron/learn/route.js:1:30960)
        at Object.<anonymous> (.next/server/app/api/cron/learn/route.js:1:30992) {
      page: '/api/cron/learn'
    ```
  implication: This is the exact module-load failure. `src/lib/prompts/_manifest.ts` line 156 (`readdirSync(__dirname, { withFileTypes: true })`) walks the source-tree path baked into the bundle. The bundle is at `.next/server/app/api/cron/learn/route.js` on the lambda fs; `__dirname` resolves relative to the bundle file, but the original source path `/vercel/path0/src/lib/prompts` is what gets scanned because of the ESM `fileURLToPath(import.meta.url)` path and Next's serverless output not copying the .md files. The _v1/_v2 markdown bodies were never traced as runtime assets.

- timestamp: 2026-05-13T20:47
  checked: prompt-registry source files
  found:
    `src/lib/prompts/_manifest.ts:18` imports `readFileSync, readdirSync, existsSync` from `node:fs`
    Line 23: `const __dirname = dirname(fileURLToPath(import.meta.url))`
    Line 155–162: `loadAllVersions()` runs `readdirSync(promptsRoot)` to enumerate `_vN` subdirs, then `readFileSync(join(versionDir, f))` for every `.md` file.
    Line 165: `export const REGISTERED_PROMPTS: ReadonlyArray<RegisteredPrompt> = Object.freeze(loadAllVersions());` — executes at MODULE LOAD time. Any throw here crashes the route handler before any code in route.ts runs.
    14 .md files in `_v1/`, 1 in `_v2/` — none of these are bundled by Next.js because there's no static reference (e.g. `import body from './_v1/foo.md'`).
    `next.config.ts` sets `outputFileTracingRoot: __dirname` but does NOT include `outputFileTracingIncludes` for `**/*.md` under `src/lib/prompts/`.
  implication: This is a generic Next.js + ESM + dynamic-fs bug — the file-tracer can't see the .md files because they're loaded via `readdirSync(__dirname)` at module-eval, not via a static import. Reproducible across every deployment since Phase 20-Z-04 (commit 6464235, 2026-05-11).

- timestamp: 2026-05-13T20:48
  checked: `vercel ls --prod` deployment history
  found: 6 of last 14 prod deployments are `● Error`. Inspecting one (`ticker-research-4oysbwivb-...`) shows webpack build failure: `Module build failed: UnhandledSchemeError: Reading from "node:fs" is not handled by plugins (Unhandled scheme)` with import trace through `./src/lib/prompts/_manifest.ts → ./src/lib/prompts/registry.ts → ./src/lib/prompts/render.ts → ./src/components/ResearchReport.tsx → ./src/app/research/[ticker]/page.tsx`.
  implication: The same `_manifest.ts` module is being imported transitively from `ResearchReport.tsx` (a CLIENT component via the App Router page). Webpack's client bundle build chokes on `node:fs`/`node:path`/`node:url` schemes because they're Node-only. The 6 failed deploys are because someone added a client-side import path that pulls in `renderPrompt`. The 8 successful deploys probably restored from build cache (the log shows `Restored build cache from previous deployment` on the failed ones too — so cache invalidation isn't saving them). When a build does succeed, the SERVER bundle still includes _manifest.ts but ships without the .md files on disk → 500 at runtime.

- timestamp: 2026-05-13T20:50
  checked: provider call logs for last 24h via /api/insights/sentiment-health JSON endpoint
  found:
    yahoo: 258 calls, error_rate=0.907 (90.7%)
    firecrawl: 145 calls, error_rate=1.00 (100%)
    anthropic-search: 51 calls, error_rate=0.863
    gemini: 9 calls, error_rate=0, total_cost_usd_24h=$36.07 ← striking — $4/call
    polygon: 25 calls, error_rate=0
    finnhub: 27 calls, error_rate=0
    stocktwits: 41 calls, error_rate=0
  implication: Upstream data layer is degraded too. Yahoo Finance 90.7% errors means most sentiment-scan rows have null price → snapshot writer skips → no SentimentSnapshot row → no PriceOutcome ever recorded for that scan → no input for the learn cron even if it WERE working. Firecrawl 100% errors means community-intel scraping is fully broken (API key issue, rate limit, or upstream outage — likely the prod-only FIRECRAWL_API_KEY needs rotation or has been billed out). Anthropic web-search 86% errors degrades the reasoning layer. Gemini per-call cost $4 looks like the AI Gateway is routing to an unintended (expensive) model — but the calls themselves succeed.

- timestamp: 2026-05-13T20:52
  checked: prod LearnedPattern cell distribution and hit rates
  found:
    diffusion: 4 cells, 9 obs, 33.3% hit_rate, 0 ACTIVE
    insider: 26 cells, 124 obs, 49.2% hit_rate, 0 ACTIVE
    institutional: 31 cells, 184 obs, 50.5% hit_rate, 0 ACTIVE
    technical: 26 cells, 309 obs, 42.1% hit_rate, 0 ACTIVE
    All 87 cells have status='EXPLORATORY' — zero have graduated to ACTIVE per `patternStatus()` gating in src/lib/learning.ts.
  implication: The engine genuinely has not crossed the ACTIVE-eligible threshold yet because sample sizes per cell are sparse (mean ≈ 7 obs/cell, well below the n≥30 + ESS≥30 + Brier-beats-null gate in `patternStatus`). EngineCalibrationPanel therefore renders all "EXPLORATORY" badges — to a user this LOOKS LIKE "the engine is not learning". Even if /api/cron/learn were fixed, the engine wouldn't suddenly turn ACTIVE — it would just resume making slow progress.

- timestamp: 2026-05-13T20:54
  checked: recent `learning_events` event_type distribution
  found:
    cycle_summary: 194 rows, last 2026-05-13T17:39:59Z. The last 6 cycle_summary rows all have message="test cycle summary" within 90 seconds, occurring AT/AROUND the same timestamp the last successful posterior_update was written. These look like local-dev test seeds, not real cron-cycle outputs.
    posterior_update: 312 rows, last 2026-05-13T17:38:26Z
    model_router_decision: 2 rows, last 2026-05-11T00:38:44Z
    No drift_alert, drift_clear, or any other event types in the last 14d.
  implication: The "successful cycle ~10h ago" was almost certainly NOT a Vercel cron run — it was a local `npm run` invocation against prod DB or a seeded test fixture. The crons in vercel.json are scheduled "30 7 * * *" UTC = 00:30 PDT — 17:38 UTC doesn't match any cron in vercel.json. The DB row at 17:38 corresponds to ~10:38 PDT May 13, which lines up with when someone manually triggered learning during phase-20 UAT.

- timestamp: 2026-05-13T20:55
  checked: sentiment-scan side-effects (rate vs DB writes)
  found:
    The sentiment-scan cron writes `SentimentSnapshot` (works — we see 175 rows) but the Phase-20-Z-01 `sentiment_observations` loop is gated on `communityData.stocktwits.messages` (route.ts:114). `lightweightCommunityScan()` currently returns aggregated EnrichedSnapshot data with no raw `stocktwits.messages` array (per the explicit comment block at route.ts:109–113 — this is a forward-reference to Phase 20-C-01 wiring). Until that wiring lands, `sentiment_observations` stays empty even on a successful scan.
    Same root cause for `bot_filter_flags` (0 rows) and `coordination_clusters` (0 rows) — both loops also iterate over `stocktwitsMessages`.
  implication: Even when sentiment-scan succeeds in prod, the Phase-20 ML feature store collects ZERO rows. The downstream calibrators (20-A-03 tune-decay, 20-A-04 author-share, 20-A-05 agreement, 20-B-04 source-tier, 20-C-01 per-source-IC) are all reading from an empty table → they'll publish degenerate (or null) calibrations that further weaken the engine. This is independent of the learn-cron crash and would still need to be fixed even if learn started succeeding tomorrow.

## Resolution

root_cause: PRIMARY — `/api/cron/learn` route crashes at module load in production because the prompt-registry's `src/lib/prompts/_manifest.ts` (shipped in commit 6464235 / Phase 20-Z-04 on 2026-05-11) uses `readdirSync(__dirname)` + `readFileSync` to enumerate and read `.md` files in `src/lib/prompts/_v1/` and `_v2/` at module load time. Next.js's file-tracer does NOT include these markdown bodies in the serverless output, so when the lambda cold-starts the `readdirSync` throws `ENOENT: no such file or directory, scandir '/vercel/path0/src/lib/prompts'`. Because `REGISTERED_PROMPTS` is exported as a top-level `const`, the module evaluation fails, the route handler import fails, and Next.js serves a generic 500. Every transitive importer (route.ts, gemini-analysis.ts, ResearchReport.tsx, research-brief.ts, eval/judge.ts, eval/claim-extraction-llm.ts, sentiment/per-doc-classifier.ts) is now a ticking bomb on cold-start; the `learn` route happens to be the one with no fallback path.

SECONDARY — six of the last 14 prod deploys are also failing the BUILD step (not just runtime) because `src/lib/prompts/_manifest.ts` is being imported (transitively) into a client-component via `src/components/ResearchReport.tsx`. Webpack's client bundler rejects `node:fs`/`node:path`/`node:url` schemes (`UnhandledSchemeError`). The successful deploys are using a cached server bundle from before that client-side import path was introduced. So we're one bad cache invalidation away from a fully red prod.

TERTIARY (also user-visible but unrelated to PRIMARY) — the Phase-20-Z-01 SentimentObservation feature store has zero rows in production despite the table now existing. The sentiment-scan cron's per-message loop is gated on `communityData.stocktwits.messages`, but `lightweightCommunityScan()` doesn't currently return raw messages — only aggregated EnrichedSnapshot fields. The DAO comment block at sentiment-scan/route.ts:109–113 acknowledges this is a forward-reference to Phase 20-C-01 wiring that hasn't shipped. All downstream Phase 20 calibration crons (20-A-03/04/05, 20-B-04, 20-C-01) will read an empty feature store and produce degenerate calibrations until the upstream wire-up ships.

QUATERNARY (data-quality, also relevant) — Yahoo Finance error rate 90.7% and Firecrawl error rate 100% in last 24h. Even when the learn cron is restored, the input feed quality is severely degraded. Firecrawl needs key/quota check; Yahoo errors may be rate-limit at the regional egress IP from Vercel iad1.

fix:
  PRIMARY (P0 — required to restore the engine):
    1. Refactor `src/lib/prompts/_manifest.ts` from dynamic-fs at module load to STATIC imports of each `.md` file using Next.js's webpack raw-loader (or `?raw` query syntax with the `experimental.turbo` rules, or webpack `asset/source` config). Example pattern:
         import researchBriefSystemV1 from './_v1/gemini-research-brief-system.md';
         (Next.js requires a webpack rule for `.md` files: `{ test: /\.md$/, type: 'asset/source' }` in next.config.ts. Turbopack supports the same via `loaders` config.)
       This bundles the bodies into the route's static bundle — no runtime fs needed.
    2. Alternative cheaper fix: add `outputFileTracingIncludes` to next.config.ts:
         outputFileTracingIncludes: { '**/*': ['./src/lib/prompts/_v1/*.md', './src/lib/prompts/_v2/*.md'] }
       This tells Next's tracer to copy the .md files into every route's output bundle. Keeps the `readdirSync` approach but ensures the directory exists at runtime. Lower-risk than the static-import refactor.
    3. Add a regression test: `tests/e2e/cron-cold-start.test.ts` that boots `next start` (or `vercel dev`) and asserts a 200 from `GET /api/cron/learn` with the right auth header. Today no integration test catches this class of bug.

  SECONDARY (P0 — required to keep prod builds from intermittently red):
    1. Ensure `ResearchReport.tsx` does NOT import `renderPrompt` at the client. Inspect `src/components/ResearchReport.tsx` for any direct `from '@/lib/prompts/...'` import. Move client-rendered disclaimer/hedge strings into a separate `src/lib/prompts/client-disclaimers.ts` (which already exists per `ls` — verify it's the one being imported, not registry.ts).
    2. Add an ESLint rule (or CI grep) that blocks any client component (`'use client'`) from importing `@/lib/prompts/registry`, `@/lib/prompts/render`, or `@/lib/prompts/_manifest`. (The 6d1c951 commit "fix(20-D-05): client-safe disclaimer constants — unblock vercel build" suggests this was partially fixed but hasn't held.)

  TERTIARY (P1 — required for Phase 20 ML stack to actually collect data):
    1. Wire `lightweightCommunityScan()` (or a sibling fetcher) to return `stocktwits.messages: RawMessage[]` in its return shape so the SentimentObservation loop at sentiment-scan/route.ts:114 has something to iterate. The upstream StockTwits API call already exists in `src/lib/data/stocktwits-stream.ts` (or wherever StockTwits is currently fetched) — surface the raw messages array up to the cron.
    2. Once messages flow, the bot_filter_flags / coordination_clusters / sentiment_observations writes will start populating naturally.

  QUATERNARY (P1 — data-quality):
    1. Investigate Yahoo Finance 90.7% error rate — likely Vercel iad1 → yahoo rate limit. Implement a per-call jittered retry inside `withTelemetry` or move to twelvedata/polygon-only for hot paths.
    2. Check FIRECRAWL_API_KEY validity — 100% error rate is almost certainly billing/quota or key-revoked. Re-issue if needed.
    3. Gemini $4/call is alarming — verify AI Gateway is not routing to gemini-2.5-pro by accident. Should be gemini-2.5-flash for the cycle-summary path.

verification:
  Applied in find_and_fix follow-up (2026-05-13T21:05–21:16 PDT). Self-verification results:
    - `npx tsc --noEmit` → zero errors.
    - `npm test` → 1570 passing (vs 1558 baseline on main), 4 failing (all pre-existing DATABASE_URL env failures unrelated to this fix). +12 net passing.
    - `npm run build` → ✓ passed cleanly, no webpack `UnhandledSchemeError`, no `node:fs`/`node:url`/`node:path` warnings in any chunk. `/api/cron/learn` listed under Functions output.
    - `grep "disclaimer-footer\|gemini-cycle-summary" .next/server/app/api/cron/learn/route.js` → matches found. Prompt bodies are baked into the route bundle as JS string literals. Zero `.md` files traced into the route .nft.json.
    - `npm run check-prompts` → green (no .md drift).
    - `npm run check-prompt-manifest` → "OK — 15 prompts, generated file is in-sync."
    - `npm run check-disclaimers` → "PASS — render + audit clean".
    - New regression test `tests/unit/cron-module-load.unit.test.ts` → 10/10 passing. Imports the 8 most-at-risk cron route modules in fresh isolation (mimicking Vercel cold start) and asserts each loads without throwing. Static-source check asserts `_manifest.ts` contains no `readdirSync|readFileSync|existsSync(...)` call expressions in non-comment code. This catches the bug class going forward.

  Post-deploy verification (user to confirm after vercel --prod):
    - `curl -H "Authorization: Bearer $CRON_SECRET" https://ciphersearch.app/api/cron/learn` should return HTTP 200 with `{"ok":true,...,"outcomes_processed":N,...}`.
    - Wait 24h, re-query Neon: `SELECT MAX(occurred_at) FROM learning_events WHERE event_type='posterior_update'` is fresh (within last 24h).
    - After next sentiment-scan tick: `SELECT COUNT(*) FROM sentiment_observations` > 0 (Phase-20-Z-01 feature store now receiving rows from StockTwits messages).

files_changed:
  - src/lib/prompts/_manifest.ts (PRIMARY — replaced dynamic-fs at module load with static re-export of REGISTERED_PROMPTS from _manifest.generated.ts)
  - src/lib/prompts/_manifest.generated.ts (NEW, auto-generated — 15 prompts as inline JS string literals, no fs at runtime, fully bundler-safe)
  - scripts/generate-prompt-manifest.ts (NEW — build-time generator; `--check` mode is the CI gate against drift)
  - package.json (added `prebuild` + `predev` hooks running the generator; added `generate-prompt-manifest` and `check-prompt-manifest` scripts)
  - vercel.json (build command now runs the generator BEFORE prisma migrate + next build, so prod deploys are deterministic)
  - src/lib/data/stocktwits.ts (TERTIARY — new exported `fetchStockTwitsRaw(ticker)` returns raw message bag for the PIT feature store)
  - src/lib/data/lightweight-community-scan.ts (TERTIARY — wired fetchStockTwitsRaw into the parallel fan-out; EnrichedSnapshot now exposes `stocktwits.messages: StockTwitsRawMessage[]`)
  - src/app/api/cron/sentiment-scan/route.ts (TERTIARY — comment updated; existing optional-chained cast now flows real messages so SentimentObservation, BotFilterFlag, CoordinationCluster writers populate)
  - tests/unit/cron-module-load.unit.test.ts (NEW — 10-test regression suite that would have caught the original ENOENT bug at PR time)

deferred (out of scope for this fix — needs follow-up plans):
  - QUATERNARY data-quality issues (Yahoo 90.7% errors, Firecrawl 100% errors, Gemini $4/call routing anomaly). These are real but independent of the engine-restart fix. Should be a Phase 20-Z-05 plan: provider health investigation + Firecrawl key rotation + Gemini model-id audit.
  - SECONDARY ESLint rule for `'use client'` files importing the registry. Manual grep confirmed ResearchReport.tsx already correctly uses client-disclaimers.ts (per commit 6d1c951). An automated rule would prevent future drift but is not required to ship — the build itself would fail-loud if a regression occurs.
  - Stocktwits cron error rate not addressed; cron-side telemetry on `obs_written_*` counters now meaningful enough to surface the issue if it persists.

files_involved (for the fix):
  - src/lib/prompts/_manifest.ts (PRIMARY refactor target)
  - next.config.ts (add outputFileTracingIncludes OR webpack md-loader rule)
  - src/components/ResearchReport.tsx (verify no server-only import leaks to client)
  - src/lib/prompts/client-disclaimers.ts (verify client uses this, not registry)
  - src/app/api/cron/sentiment-scan/route.ts (TERTIARY — wire raw messages)
  - src/lib/data/lightweight-community-scan.ts (TERTIARY — surface stocktwits.messages)
  - tests/e2e/cron-cold-start.test.ts (NEW — regression coverage)
