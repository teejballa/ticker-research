# Cipher Data-Source Utilization Audit
**Date:** 2026-05-10
**Phase:** 19 (close-out)
**Branch / commit:** `main` @ `eecd898`
**Production deploy:** `ticker-research-1hr9gfibv` (READY, 6m old at audit time)

---

## Methodology

Read each integration file end-to-end, mapped today's actual call surface
against each provider's documented capability, then ranked the deltas by
expected research-quality lift per dollar / engineering hour.

Each section ends with a prioritized backlog (P0 = land this session if
the user picks it, P1 = next phase, P2 = nice-to-have / defer).

---

## 1. TwelveData (`src/lib/data/adapters/twelve-data.ts`)

**Today.** Single endpoint — `GET /statistics`. Pulls trailing P/E, diluted
EPS TTM, revenue TTM, total debt/equity (MRQ), profit margin. Fundamentals-
only, second-tier in the cascade behind Yahoo when `TWELVEDATA_PRIMARY=on`.
Wrapped in `cached()` (24h TTL) + `withRetry()`.

**Untapped capability.** TwelveData ships ~30 endpoint families on the $29/mo
tier. The ones aligned with Cipher's domain:

- `/time_series` — historical OHLCV at 1m/5m/15m/30m/45m/1h/2h/4h/1day/1week/1month resolution
- `/rsi`, `/macd`, `/ema`, `/sma`, `/bbands`, `/atr`, `/adx`, `/stoch`, `/willr`, `/obv`, `/ichimoku` — pre-computed technical indicators
- `/price` — real-time quote
- `/quote` — full quote (price + change + 52w range + open/high/low/close/vol)
- `/earnings` — past + upcoming earnings calendar
- `/dividends`, `/splits` — corporate actions
- `/end_of_day` — closing snapshot for any past trading day

**Gap.** Cipher computes RSI / MACD / SMA in-house from Yahoo OHLC inside the
technical-signal class (Phase 16). Switching to TwelveData's pre-computed
indicators removes a chunk of arithmetic, simplifies that path, and cross-
checks the in-house math (free correctness signal). Real-time `/price` is
also a candidate fallback for the quote ladder when Yahoo throttles.

**Backlog.**
- **P1** — Add `fetchTwelveDataIndicators(ticker)` returning RSI(14) +
  MACD(12,26,9) + EMA(20/50/200). Slot it as the **shadow** input next to
  the in-house technical computation; verdict on agreement after 7 days.
  Atomic commit, new flag `TECHNICAL_TWELVEDATA_SHADOW` defaulted off.
- **P2** — Earnings calendar (`/earnings`) wired into the prompt as a
  forward-looking event signal ("next earnings in 4 days"). Low effort,
  but Anthropic web search already surfaces this informally.
- **P2** — `/price` as a 4th-tier quote fallback (after polygon). Marginal
  — Yahoo + Finnhub + Polygon already cover the ladder.

---

## 2. Polygon (`src/lib/data/polygon.ts`)

**Today.** Two endpoints:
1. `GET /v3/reference/tickers/{ticker}` — company reference (name, exchange,
   SIC, employees, market cap, shares outstanding, description).
2. `GET /vX/reference/financials?ticker=…&limit=1` — single most-recent
   income statement (revenue, net income, basic EPS).

Returns a free-text `text_block` plus structured `SupplementaryMarketFields`
+ `SupplementaryFundamentalsFields`. **Not wrapped** in `cached()` or
`withRetry()` (predates the helpers).

**Untapped capability.**
- `GET /v2/reference/news?ticker=…&limit=10` — Polygon publishes a curated
  news feed indexed per-ticker, free on the $29 tier. Articles include
  publisher, author, image, description, AND **per-article published-date
  + sentiment insights** (a stripped-down version of MaxBPM data).
- `GET /v3/reference/options/contracts?underlying_ticker=…` — full options
  chain incl. delta / IV / OI for every strike/expiry.
- `GET /v2/last/trade/{ticker}` and `/v2/last/quote/{ticker}` — sub-second
  last-trade endpoints.
- `GET /v3/reference/dividends`, `/splits` — corporate actions
- `GET /v3/reference/tickers/types` and ticker search
- `GET /v1/marketstatus/now` — open/closed gating
- `GET /v3/reference/conditions` — exchange condition codes

**Gap.** Cipher has **no Polygon news consumption today** — every news pull
is Exa (primary) → Anthropic web search (fallback). Polygon news would be a
zero-marginal-cost 3rd-tier insurance source: it has structured
`published_utc`, `tickers[]`, `publisher.name`, `keywords[]`, `description`.
Specifically it is **resilient when both Exa and Anthropic search miss
small-cap tickers** (the long-tail failure mode flagged in 19-B-05's
"niche tickers" pitfall).

Polygon options chain is *richer* than `yahoo-finance2` (delta and Greeks
present), but the existing `options-sentiment.ts` already produces the
metric Cipher actually consumes (OI-weighted put/call ratio + IV regime),
so options is a **lower** priority than news.

**Backlog.**
- **P0** — `fetchPolygonNews(ticker)` as 3rd-tier news fallback after
  Exa → Anthropic search. Returns `NewsSection`-shaped, `cached()` 30min,
  `withRetry()` 3x. No new flag — it slots in as a `?? fallback` in
  `buildSourcePackageNewLadder`.
- **P1** — Wrap existing `fetchPolygon` in `cached()` (24h fundamentals
  TTL) + `withRetry()`. One commit, mechanical.
- **P2** — Polygon options chain as a 2nd-tier OI fallback when the
  yahoo-finance2 options call returns null.

---

## 3. Finnhub (`src/lib/data/finnhub.ts`)

**Today.** Two parallel calls:
1. `/stock/profile2?symbol=…` — company profile.
2. `/stock/metric?symbol=…&metric=all` — full metric panel.

Surfaces P/E TTM/annual/forward, EPS TTM/annual, revenue/share, 52w high/
low, beta, net profit margin, debt/equity, ROA/ROE, P/B, current ratio,
dividend yield, into a `text_block` AND structured `SupplementaryMarket/
Fundamentals` fields. **Not wrapped** in `cached()` or `withRetry()`.

**Untapped capability.** The free Finnhub tier exposes:

- `/stock/recommendation?symbol=…` — analyst recommendation trends with
  Buy / Hold / Sell counts month-by-month for the last 4 months.
- `/stock/price-target?symbol=…` — average / high / low / median price
  target + last-updated.
- `/stock/upgrade-downgrade?symbol=…` — chronological upgrade/downgrade
  feed with from-grade → to-grade.
- `/stock/earnings?symbol=…` — past earnings surprises (actual vs estimate).
- `/calendar/earnings?symbol=…` — upcoming earnings calendar.
- `/calendar/ipo` — IPO calendar.
- `/stock/insider-transactions?symbol=…` — insider trade feed (overlaps
  with EDGAR Form 4 + Quiver — see §10).
- `/stock/insider-sentiment?symbol=…` — pre-aggregated insider monthly
  sentiment score.
- `/news?category=general` and `/company-news?symbol=…` — news feed.

**Gap.** Cipher's analyst layer today is Exa + Anthropic-search ONLY. Both
return *unstructured* text; we have no structured `consensus / target /
count` fallback. Finnhub's `/stock/recommendation` and `/stock/price-target`
return clean numeric structured rows — exactly what
`AnalystSentimentSection` expects. This is the highest-value Finnhub
addition.

`/stock/insider-sentiment` is also interesting — a single pre-baked monthly
score per ticker would supplement EDGAR Form 4 raw rows in the Phase 17
institutional layer.

**Backlog.**
- **P0** — `fetchFinnhubAnalystSentiment(ticker)` returning
  `AnalystSentimentSection` (consensus + price target + analyst count +
  recent_changes from upgrade-downgrade). Slot in the new ladder as
  `exa ?? finnhub ?? anthropic-search`. Free, structured, no flag needed.
- **P1** — Wrap existing `fetchFinnhub` in `cached()` (24h fundamentals
  TTL) + `withRetry()`. Mechanical.
- **P1** — `fetchFinnhubInsiderSentiment(ticker)` as a Phase 17 supplement
  to EDGAR Form 4 (additive — does not replace the EDGAR pull).
- **P2** — Earnings calendar / surprises into the forward-outlook prompt.

---

## 4. Yahoo Finance (`src/lib/data/yahoo.ts`, `options-sentiment.ts`)

**Today.** Three call sites:
1. `yahooFinance.search()` — autocomplete in the ticker input.
2. `yahooFinance.chart()` — 30-day OHLCV (UI sparkline + realized-vol
   computation in 19-C-04).
3. `yahooFinance.quote()` — `MarketDataSection`.
4. `yahooFinance.quoteSummary({ modules: ['financialData', 'defaultKeyStatistics'] })` —
   `FundamentalsSection`.
5. `yahooFinance.options(ticker, { date })` — options chain x3 expiries
   for `fetchOptionsTermStructure` (19-C-04).

**Untapped capability.** The `yahoo-finance2` v3 SDK exposes
`quoteSummary` with **30+ modules**. Modules NOT requested today:

- `recommendationTrend` — Buy/Hold/Sell counts the same way Finnhub
  exposes them, but free, no key, no rate limit. **Easy win.**
- `upgradeDowngradeHistory` — chronological upgrade/downgrade feed,
  again free, again exact match to `AnalystChange` rows.
- `earnings` and `earningsHistory` — earnings calendar + surprise
  history without an API key.
- `cashflowStatementHistory`, `balanceSheetHistory`, `incomeStatementHistory` —
  3-year historical statements (annual + quarterly).
- `assetProfile` — full company profile incl. officers, sector, industry.
- `summaryDetail` — beta, dividend yield, ex-dividend date, payout ratio.
- `institutionOwnership`, `majorHoldersBreakdown`, `insiderHolders`,
  `insiderTransactions`, `netSharePurchaseActivity` — institutional and
  insider data WITHOUT a Quiver / Finnhub key.
- `secFilings` — recent SEC filing list (date + form + URL).
- `calendarEvents` — next earnings date + revenue estimates.

**Gap.** This is the largest single utilization hole in the codebase.
Yahoo's `quoteSummary` is free, requires no API key, has no rate limit
issues at our volume, and ships analyst + insider + institutional + SEC
filing data structured the way Cipher already consumes it.

The four highest-value modules:
1. `recommendationTrend` → analyst cascade (free competitor to Finnhub's
   `/stock/recommendation`).
2. `upgradeDowngradeHistory` → `recent_changes[]` rows for
   `AnalystSentimentSection`.
3. `insiderTransactions` + `netSharePurchaseActivity` → Phase 17 insider
   layer fallback when EDGAR / Quiver are unavailable.
4. `calendarEvents.earnings` → forward outlook ("earnings in N days").

**Backlog.**
- **P0** — Extend `fetchFundamentals` to also pull `recommendationTrend` +
  `upgradeDowngradeHistory` modules in the same `quoteSummary` call (one
  network round-trip already happens). Surface as
  `fetchYahooAnalystSentiment(ticker)` returning a structured
  `AnalystSentimentSection`. Slot ahead of Finnhub in the analyst cascade
  → `exa ?? yahoo-rec-trend ?? finnhub ?? anthropic-search`. Free, zero
  infra, no flag.
- **P1** — `fetchYahooInsiderTransactions(ticker)` as Phase 17 layer
  supplement.
- **P1** — `calendarEvents.earnings` → prompt-injected "next earnings in N
  days" line for the Forward Outlook section.
- **P2** — Historical statements (3-year cashflow / balance sheet) added
  to the Engine Calibration prompt for ratio trend analysis.

---

## 5. Exa (`src/lib/data/adapters/exa-search.ts`)

**Today.** Two call sites — both `client.search()`:
1. `fetchExaNews(ticker)` — `category: 'news'`, news lookback 30d, 10 results.
2. `fetchExaAnalystSentiment(ticker)` — no category specified, 10 results.

Both wrapped in `cached()` (30min) + `withRetry()` with custom
`isExaRetryable` classifier.

**Untapped capability.** Per Exa's official `searchAndContents` /
`search` reference (https://docs.exa.ai/reference/search), the `category`
parameter accepts **8 values**:

| category | Cipher fit |
|---|---|
| `company` | LinkedIn-style company pages |
| `research paper` | Academic papers |
| `news` | ✓ already used |
| `pdf` | Generic PDFs |
| `github` | Code repos |
| `tweet` | Twitter/X posts |
| `personal site` | Blog posts |
| `linkedin profile` | People profiles |
| `financial report` | SEC filings, earnings reports, investor decks |

The only domain-relevant unused category is `'financial report'` — it
specifically targets SEC filings (10-K, 10-Q, 8-K) and earnings reports.
Today, SEC filings flow through `fetchSecFilingSummary` which uses
Anthropic web search w/ `max_uses: 3`. That's expensive (Anthropic
search is $5–$10 per 1k searches at our volume).

**Gap.** A `fetchExaFinancialReports(ticker)` wrapper would let
`buildSourcePackageNewLadder` cascade SEC the same way it already
cascades news + analyst:
`exa-financial-report ?? anthropic-search.fetchSecFilingSummary`.
Net effect: ~50% Anthropic search call reduction at the same quality
floor.

The `'company'` category is a marginal-fit — useful for the company
overview block but Yahoo `assetProfile` (free) covers it better.

The `'tweet'` category is *banned* per project priors — Cipher's social
sentiment routes through StockTwits + Reddit (Firecrawl) explicitly.

**Backlog.**
- **P0** — `fetchExaFinancialReports(ticker)` wrapping `client.search()`
  with `category: 'financial report'`, returning `SecFilingSummarySection`.
  Slot in `buildSourcePackageNewLadder` as
  `exa-financial-report ?? anthropic-search.fetchSecFilingSummary`. New
  cache key `news:TICKER:exa-fin`. No new flag.
- **P2** — `category: 'company'` for the overview block. Defer — Yahoo
  `assetProfile` covers it for free.

---

## 6. Caching coverage (`cached()` from `src/lib/data/cache/upstash.ts`)

**Today.** `cached()` wraps:
- ✓ `fetchTwelveDataFundamentals`
- ✓ `fetchExaNews`, `fetchExaAnalystSentiment`
- ✓ `fetchQuiverInsider`, `fetchQuiverCongressional`
- ✓ `fetchSwaggyStocks`, `fetchSwaggyStocksViaFirecrawl`
- ✓ `fetchApeWisdom`

**NOT wrapped:**
- ✗ `fetchMarketData` (yahoo.ts — quote)
- ✗ `fetchFundamentals` (yahoo.ts — quoteSummary)
- ✗ `fetchChartData` (yahoo.ts)
- ✗ `searchTickers` (yahoo.ts — autocomplete)
- ✗ `fetchFinnhub` (finnhub.ts)
- ✗ `fetchPolygon` (polygon.ts)
- ✗ `fetchNews` (anthropic-search.ts) — the most expensive call
- ✗ `fetchAnalystSentiment` (anthropic-search.ts)
- ✗ `fetchSecFilingSummary` (anthropic-search.ts)
- ✗ `fetchSocialSentiment` (anthropic-search.ts)
- ✗ `fetchStockTwitsSentiment` (stocktwits.ts) — only the user-reputation
  helper has its own in-process Map cache
- ✗ `fetchOptionsSentiment`, `fetchOptionsTermStructure` (options-sentiment.ts)
- ✗ `lookupCik`, `fetchEdgarForm4`, `fetchEdgar13F` (edgar.ts) — has its
  own 24h in-memory CIK cache but no shared Redis layer
- ✗ `lightweightCommunityScan` (lightweight-community-scan.ts) — scrapes
  Firecrawl 5x per call, no caching

With `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` unset (today's
production state), the helper no-ops gracefully — every adapter still
hits upstream. Once Upstash is provisioned, **the wins are massive**:
- Anthropic search calls cost ≥ $0.005 each × 4 calls/research ≈
  $0.02/research. A 10min cache hit rate at our duplicate-ticker
  density saves ~30% — meaningful at scale.
- Firecrawl scrape costs 1 credit per scrape × 5 subreddits × N
  research/day = the largest line item. A 10min cache here saves
  ~50% during burst periods.

**Backlog.**
- **P0 (set of 4 commits)** — Wrap each older adapter with `cached()` at
  the appropriate TTL:
  - `fetchMarketData` → `quote` namespace, 5min TTL
  - `fetchFundamentals` → `fund` namespace, 24h TTL
  - `fetchFinnhub` → `fund` namespace, 24h TTL
  - `fetchPolygon` → `fund` namespace, 24h TTL
- **P1** — Wrap `anthropic-search` calls (news, analyst, SEC, social) at
  appropriate TTLs (30min news, 24h SEC, 30min analyst, 30min social).
  *Higher impact than the P0 set — but the integration is more delicate
  because shape includes per-ticker SecurityType so cache keys must
  encode it (`news:TICKER:equity`, `news:TICKER:spac`, ...). Ship as a
  separate phase commit.*
- **P1** — Wrap `lightweightCommunityScan` (whole-function level — same
  ticker should not re-scrape 5 subreddits within 10min).
- **P2** — Wrap `fetchOptionsSentiment` + `fetchOptionsTermStructure`
  (15min TTL, options data moves slowly intra-day).
- **P2** — Wrap `fetchStockTwitsSentiment` (15min TTL).

---

## 7. Retry coverage (`withRetry()` from `src/lib/data/retry.ts`)

**Today.** `withRetry()` wraps:
- ✓ All Wave-B adapters (TwelveData, Exa)
- ✓ All Wave-C adapters (Quiver, ApeWisdom, Swaggystocks)

**NOT wrapped:**
- ✗ Yahoo (yahoo-finance2 SDK — has its own internal retry on some
  endpoints but no uniform 5xx classifier)
- ✗ Finnhub
- ✗ Polygon
- ✗ Anthropic search (Anthropic SDK has its own retry — *probably ok*,
  but worth confirming the SDK's defaults match our policy of
  "5xx + network only, never 4xx")
- ✗ StockTwits
- ✗ Options-sentiment (yahoo-finance2 SDK passthrough)
- ✗ EDGAR

Each non-wrapped adapter today returns `null` / `available:false` on
**any** failure including transient 503s — so we silently lose a request
on every upstream blip rather than back off and retry.

**Backlog.**
- **P0 (bundled w/ caching commits)** — Wrap each `cached()` add with
  `withRetry()` inside the cache-miss path. Same commit pair pattern
  as Wave-B used.
- **P1** — Confirm Anthropic SDK retry defaults match our policy
  (`@anthropic-ai/sdk` v0.x has `maxRetries` arg; default is 2). One-line
  config change if mismatch.
- **P2** — `withRetry` around `fetchSubmissions` and `parseForm4Xml`
  fetches in `edgar.ts` — SEC's data API is reasonably reliable but
  the 150ms throttle plus 5xx blips do happen during their 09:30 ET
  daily refresh.

---

## 8. StockTwits (`src/lib/data/stocktwits.ts`)

**Today.** `/api/2/streams/symbol/{TICKER}.json` for messages +
sentiment_change. Phase 19-C-03 added `/api/2/users/show/{user_id}.json`
behind the reputation-weighted shadow.

**Untapped.** Public endpoints we don't use:
- `/api/2/trending/symbols.json` — site-wide trending tickers (could feed
  a "what's hot today" signal for the rotating watchlist).
- `/api/2/streams/symbols/{T1,T2,...}.json` — multi-ticker stream in one
  call (cheaper than N parallel ticker streams when running the
  sentiment-scan cron).
- `/api/2/charts.json?symbol=…` — historical sentiment timeseries.

**Backlog.**
- **P2** — `/api/2/trending/symbols.json` as an additional rotating-
  watchlist seed.
- **P2** — Multi-ticker batching when sentiment-scan cron sweeps multiple
  tickers in one run (currently issues N HTTPS requests).

---

## 9. EDGAR (`src/lib/data/edgar.ts`)

**Today.** CIK lookup, Form 4 (insider) parsing, SC 13D/13G as 13F-proxy.
24h in-memory CIK cache. Used by Phase 17 institutional + insider layers.

**Untapped.** SEC EDGAR exposes far more, but most of it overlaps with
data we already pull:
- `/cgi-bin/browse-edgar?action=getcompany&CIK=…&type=10-K&...` — ATOM
  feed of all filings (already covered by `fetchSubmissions`).
- Full-text search over EDGAR (`efts.sec.gov/LATEST/search-index`) —
  could deep-search 10-K narratives for risk factors / MD&A snippets.

**Backlog.**
- **P2** — EDGAR full-text search (efts.sec.gov) as a quote-extraction
  source for the Engine Calibration prompt. Niche.
- **P2** — Wrap CIK lookup in shared Redis cache (currently in-memory
  per Lambda instance — wasteful on Vercel cold starts).

---

## 10. Quiver, Swaggystocks, ApeWisdom (`src/lib/data/adapters/`)

**Today.** All three Wave-C adapters are functionally complete:
- Quiver — opt-in via `QUIVER_API_KEY` (NOT YET PROVISIONED). Insider
  trades + congressional trades.
- Swaggystocks — supplemental community signal, `cached()` + `withRetry()`.
- ApeWisdom — supplemental community signal, `cached()` + `withRetry()`.

No utilization gaps within this batch. The only follow-on work is
operator-side: provisioning the Quiver key when the user is ready.

---

## 11. Anthropic web search (`src/lib/data/anthropic-search.ts`)

**Today.** Four calls: `fetchNews`, `fetchAnalystSentiment`,
`fetchSecFilingSummary`, `fetchSocialSentiment`. Each is a Haiku-4.5 call
with `web_search_20250305` tool, max_uses 3-5 depending on security type.
**Not wrapped** in `cached()` or `withRetry()`.

**Untapped.** Not really — this layer is intentionally the LLM-driven
fallback that handles arbitrary questions. The under-utilization is on
the OUTPUT side: the prompts ask for short JSON shapes when the model
is happy to surface much richer per-article context (highlights,
quotes, key numbers). But that's a prompt-engineering problem, not an
adapter-utilization one.

**Backlog.**
- **P1** — Cache wrap with security-type-encoded keys (see §6).
- **P2** — Richer JSON schemas for fetchSecFilingSummary (extract
  per-section MD&A bullet list rather than a 2-3 paragraph blob).

---

## 12. Firecrawl (`src/lib/data/lightweight-community-scan.ts`)

**Today.** Scrapes 5 Reddit URLs per ticker (wsb, stocks, secanalysis,
algotrading, niche r/{TICKER}) + Yahoo quote for cap class. No `cached()`
wrap at the function level.

**Untapped.** Firecrawl exposes structured-extraction (`/extract`),
crawling (`/crawl`), and search (`/search`) endpoints we don't use. The
most relevant is `/extract` with a JSON schema — could turn Reddit
markdown into structured `{title, upvotes, top_comment, sentiment}`
rows directly.

**Backlog.**
- **P1** — `cached()` wrap on the whole `lightweightCommunityScan`
  function (see §6 — already P1 in caching).
- **P2** — `/extract` with schema for richer Reddit comment surfaces.

---

## 13. Arctic Shift (`scripts/arctic-shift-backfill.ts`)

**Today.** One-shot historical Reddit backfill script. Not in the
hot-path. Skipped from this audit.

---

## Prioritized session backlog (recap)

### P0 — propose to land in this session

1. **Yahoo `recommendationTrend` + `upgradeDowngradeHistory`** as a
   structured analyst data source. Slot **before** Finnhub in the
   analyst cascade. Free, zero infra, no flag. (§4)
2. **`fetchExaFinancialReports(ticker)`** with `category: 'financial
   report'` for SEC filing fallback. Replaces Anthropic search SEC scrape
   on the primary path. (§5)
3. **`fetchPolygonNews(ticker)`** as 3rd-tier news fallback after
   Exa → Anthropic search. (§2)
4. **`fetchFinnhubAnalystSentiment(ticker)`** with structured consensus
   + price target from `/stock/recommendation` + `/stock/price-target`.
   Slot in the analyst cascade. (§3)
5. **Wrap older adapters with `cached()` + `withRetry()`** — one commit
   per adapter (yahoo, finnhub, polygon — anthropic-search is P1). (§6, §7)

### P1 — defer to a follow-on phase

- Wrap `anthropic-search` calls in `cached()` w/ security-type-encoded keys
- Wrap `lightweightCommunityScan` whole-function in `cached()`
- TwelveData technical indicators (RSI/MACD/EMA) in shadow against in-house computation
- Yahoo `insiderTransactions` + `calendarEvents.earnings`
- Finnhub `/stock/insider-sentiment`
- Confirm Anthropic SDK retry defaults match policy
- Provision Quiver API key (operator-side)

### P2 — nice-to-have / backlog

- TwelveData `/earnings` calendar in prompt
- Polygon options chain as 2nd-tier OI fallback
- StockTwits trending + multi-ticker batching
- EDGAR full-text search
- Firecrawl `/extract` for richer Reddit surfaces
- Richer Anthropic-search SEC schemas

---

## Audit summary

**Most under-utilized source:** Yahoo `quoteSummary` (30+ free modules,
4 in use). The `recommendationTrend` + `upgradeDowngradeHistory` pair is
the single highest-leverage addition possible — zero cost, zero key,
zero rate-limit risk, structured-output match.

**Single biggest cost lever:** wrapping `cached()` around
`anthropic-search` once Upstash is provisioned. Saves ~30% on the
per-research Anthropic search bill at duplicate-ticker rates.

**Single biggest reliability lever:** `withRetry()` around the older
adapters — today a single 503 silently zeroes the source field.

**Phase 19 close-out gate:** none of these P0 items are blockers for
declaring Phase 19 complete. Phase 19 shipped a complete v2.0 reasoning
upgrade; this audit is pre-Phase-20 hygiene that the user picks à la
carte before sign-off.
