# Next Session Prompt — Phase 19 Final Polish + Best-Use Audit

Paste this into a fresh Claude Code session. It's self-contained.

---

You are picking up Cipher mid-Phase-19. Phase 19 code is **shipped to production
at ciphersearch.app** (commit `eecd898`, deployed as `ticker-research-1hr9gfibv`).
Most flags are ON. The pooling cron is firing on live Neon (71 cells, 16.1%
speedup at current data density). Tiingo was removed entirely. Exa + TwelveData
keys are set in Vercel production.

Your job in this session is **best-use polish + Phase 19 close-out tests**, not
new features. Three blocks of work, in order.

## Block 1 — Audit current data-source utilization (under 30 min)

Cipher pulls stock + sentiment data from this stack today:

| Source | Used for | Where |
|---|---|---|
| `yahoo-finance2` | quotes, fundamentals, options chain | `src/lib/data/yahoo.ts`, `options-sentiment.ts` |
| Finnhub | quote/fundamentals fallback | `src/lib/data/finnhub.ts` |
| Polygon | quote/fundamentals fallback | `src/lib/data/polygon.ts` |
| TwelveData | fundamentals (NEW Phase 19, flag on) | `src/lib/data/adapters/twelve-data.ts` |
| Exa | news + analyst-sentiment search (NEW Phase 19, flag on) | `src/lib/data/adapters/exa-search.ts` |
| Anthropic web search | news + analyst + SEC + social fallback | `src/lib/data/anthropic-search.ts` |
| StockTwits | sentiment | `src/lib/data/stocktwits.ts` |
| EDGAR (SEC) | insider feed | `src/lib/data/edgar.ts` |
| Firecrawl | Reddit / community markdown scrape | `src/lib/data/lightweight-community-scan.ts` |
| Quiver | insider + congressional (env-key gated, NO KEY YET) | `src/lib/data/adapters/quiver.ts` |
| Swaggystocks + ApeWisdom | community sentiment supplemental | `src/lib/data/adapters/{swaggystocks,apewisdom}.ts` |
| Arctic Shift | one-shot historical Reddit backfill | `scripts/arctic-shift-backfill.ts` |

**Read each integration file and identify under-utilized capabilities.** Specifically:

1. **TwelveData** — we only use `/fundamentals`. Their API also has
   real-time prices, historical OHLC, technical indicators (RSI, MACD,
   EMA, Bollinger Bands, etc.). Survey the Twelve Data API docs and
   propose 1-2 highest-value additions (e.g., RSI/MACD for the technical
   signal class — currently computed in-house from Yahoo OHLC).

2. **Polygon** — used only as a price/fundamentals fallback. Polygon also
   exposes news, options chains, splits, dividends, ticker search, market
   status, financial reports. Propose adding Polygon as a **3rd-tier news
   source** (after Exa → Anthropic Search) and possibly an
   options-chain fallback (currently Yahoo-only).

3. **Finnhub** — used only as a quote/fundamentals fallback. Finnhub has
   insider transactions, IPO calendar, earnings calendar, recommendation
   trends, analyst price targets, basic financials (Phase 17 already
   uses some of this — verify what's missing). Propose adding Finnhub's
   recommendation-trends endpoint as an analyst-sentiment supplement.

4. **Yahoo Finance** — `yahoo-finance2` SDK exposes `quoteSummary` modules
   we don't use: `recommendationTrend`, `upgradeDowngradeHistory`,
   `earnings`, `cashflowStatementHistory`, `balanceSheetHistory`. Yahoo's
   recommendationTrend is free analyst data — easy win.

5. **Exa** — only `category: 'news'` used. The other categories that fit
   Cipher's domain are `'financial report'` (SEC filings, earnings
   reports) and `'company'` (LinkedIn-style company pages). Propose
   adding a `fetchExaFinancialReports` for the SEC filing fallback path.

6. **Caching coverage** — `cached()` from `src/lib/data/cache/upstash.ts`
   wraps Phase 19 adapters (TwelveData, Exa, Quiver, ApeWisdom,
   Swaggystocks) but NOT the older yahoo.ts / finnhub.ts / polygon.ts /
   anthropic-search.ts. With UPSTASH_REDIS_REST_URL + TOKEN unset
   today the cache no-ops gracefully, but once Upstash is provisioned
   every adapter should be wrapped. Plan the wiring (no implementation
   yet — just identify the call sites).

7. **Retry coverage** — same audit for `withRetry` from
   `src/lib/data/retry.ts`. Older adapters predate the helper and may
   not back off on 5xx / network errors uniformly.

**Output** for Block 1: write `.planning/phases/19-cipher-v2-0-excellence/UTILIZATION-AUDIT.md`
with one section per source, the gaps, and a prioritized backlog (P0/P1/P2)
for follow-on phases. Don't implement yet — the user will choose which to
land in this session vs. defer.

## Block 2 — Implement the P0 items the user picks (~1-3 hr)

After the user picks priorities from the audit, implement them inline. Each
implementation follows the same pattern Phase 19 used:

1. RED unit test → GREEN impl → atomic commit (`feat(post-19): ...`).
2. If a flag is needed, add to `src/lib/features.ts` `FLAG_NAMES` (it's
   currently 14 flags — would become 14 + N). Default `off` per Phase
   19 universal_preamble; the user flips on via `vercel env add`.
3. Wire `cached()` + `withRetry()` into every new external call.
4. Update `src/lib/data/source-package.ts buildSourcePackageNewLadder`
   if it changes the merge cascade order.
5. Update `src/lib/types.ts FieldOrigin` if a new origin needs
   provenance.
6. Run `npx tsc --noEmit && npx vitest run` after each task.

Likely P0 candidates (in expected priority order):

- **Yahoo `recommendationTrend`** as a 3rd analyst data source (free,
  zero infra cost, no flag needed — slot it into the analyst cascade
  AFTER Exa/Anthropic).
- **Exa `category: 'financial report'`** for SEC filings (replaces
  Anthropic-search SEC scrape on the primary path).
- **Polygon news endpoint** as a 3rd-tier news fallback.
- **Wrap older adapters with `cached()`** (one commit per adapter).

## Block 3 — Phase 19 close-out tests + sign-off (~30 min)

Once Blocks 1 + 2 are done:

1. **Run the full validation chain:**
   - `npx tsc --noEmit` — must be clean
   - `npx vitest run` — must be green (current baseline: 687 unit tests)
   - `npm run test:integration` — must be green except for the 3 known
     pre-existing data-state failures (`backfill-active-rate`,
     `learn-dual-class`, `schema-phase-16`). DO NOT mask these — flag
     them in the SUMMARY.
   - `npm run hierarchical-pooling-audit` — must produce a valid
     `shadow-reports/19-A-07-audit.json`.
   - `npm run wave-b-rollout-status` — should report PENDING (operator-driven
     graduation lifecycle still owns the post-cutover steps).
   - `npm run model-card-status` — also PENDING (composite gate exits 0
     only after every flag is removed from features.ts).

2. **Browser-verify the production site:**
   - Open https://ciphersearch.app via Playwright/agent-browser
   - Generate a research report on a real ticker (try `AAPL`, `NVDA`,
     `TSLA`, `GME`). Confirm:
     - The report renders end-to-end (no 500s)
     - The Engine Calibration panel shows conformal CIs (19-A-03)
     - Source attribution shows `via Twelve Data` or `via Exa`
       somewhere (proves the new adapters are in the merge ladder)
     - Citations block has `{source, url, confidence, date_retrieved}`
       structure (19-C-07)
     - Cross-class contradiction warnings render when present
       (19-C-10)

3. **Generate a sign-off report:**
   `.planning/phases/19-cipher-v2-0-excellence/PHASE-19-SIGNOFF.md`
   with:
   - Test results (unit / integration / e2e)
   - Live production verification (screenshots, ticker examples)
   - Per-flag status table (which are ON, which OFF and why)
   - The 3 pre-existing test failures (data-state, NOT phase-19)
   - Operator-driven follow-ups still owed (HF endpoints, Upstash,
     Quiver/Polygon/Finnhub keys, flag-removal PRs)
   - Phase-20 readiness gate

4. **Mark Phase 19 closed in ROADMAP.md:**
   Tick the `[ ] **Phase 19: Cipher v2.0 Excellence**` line as `[x]`
   with a 1-sentence completion note.

5. **Final commit + push:**
   `docs(19): Phase 19 closed — sign-off + utilization audit`

## Constraints (do not skip)

- **Never mask test failures** to make the suite look greener.
- **Never push to main without a clean local `npx tsc --noEmit` first.**
- **Never enable a flag in production without its corresponding API key
  already set.** (Currently all enabled flags either need no key or
  already have one provisioned.)
- **Per-task atomic commits.** Phase 19 was executed with this discipline
  — keep it for follow-on work.
- **Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>**
  on every commit.

## Reference state at session start

- Branch: `main`
- Last commit: `eecd898` (refactor(19-b): remove Tiingo + fix canary build + Exa canonical)
- Last production deploy: `ticker-research-1hr9gfibv-tjameswalsh-8512s-projects.vercel.app` (READY)
- Unit suite: 687 passed / 1 skipped / 3 todo
- Integration suite: 101 passed / 3 failed (pre-existing) / 1 skipped / 3 todo
- Phase 19 plans landed: 30/30
- Production flags ON: HIERARCHICAL_POOLING, CONFORMAL, CPCV, IC_DECAY_MONITOR,
  MODEL_ROUTER, CONTRADICTION_DETECTOR, OPTIONS_TERM_STRUCTURE,
  REPUTATION_WEIGHTED_STOCKTWITS, TWELVEDATA_PRIMARY, COMMUNITY_SUPPLEMENTAL,
  EXA_PRIMARY (11 of 14)
- Production flags OFF (need API keys): DATA_CACHE (needs Upstash),
  FINSENTLLM_ENSEMBLE (needs HF endpoints), COVE_TWO_PASS (needs HF
  distilbert-mnli endpoint)

Begin with Block 1.
