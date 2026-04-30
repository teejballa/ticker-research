# Phase 17: Institutional & Insider Intelligence — Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Surface 13F institutional ownership changes and Form 4 insider transactions as **two new learnable signal classes** in the existing diffusion learning engine, with a dedicated "Smart Money Intelligence" report section and 4-column EngineCalibrationPanel.

This phase **extends** Phase 16's signal-class architecture — it does not redesign it. The schema discriminator `LearnedPattern.signal_class` already exists as a string; this phase adds two new values (`'institutional'`, `'insider'`) and the storage / fetcher / classifier / display surfaces that go with them.

Out of scope: real-time options flow, dark-pool prints, alternative-data vendors (Quiver, etc.), portfolio-tracking features, and any UI for filtering reports by smart-money state.

</domain>

<decisions>
## Implementation Decisions

### Signal-Class Shape
- **D-01:** Two separate signal classes — `'institutional'` (13F) and `'insider'` (Form 4). Engine-wide signal_class set becomes `'diffusion' | 'technical' | 'institutional' | 'insider'`.
- **D-02:** All four classes share the same horizon set `[3, 7, 14, 30, 60, 90]` with **30d primary**. No per-class horizon variation.
- **D-03:** `EngineCalibrationPanel` extends from 2 columns (DIFFUSION × TECHNICAL) to 4 columns. Agreement badge generalizes to N-way (`ALIGNED` / `MIXED` / `OPPOSED` based on majority direction across populated classes).
- **D-04:** Trust boundary preserved exactly as Phase 16: Gemini fills only `institutional_alignment` / `institutional_disagreement` / `insider_alignment` / `insider_disagreement` prose strings; numeric fields are post-process overwritten from `getEngineContextForTicker()`.

### Report Section
- **D-05:** New top-level report section **"Smart Money Intelligence"** between Community Intelligence and Engine Calibration. Contains two sub-cards: "Institutional Flow" (13F) and "Insider Activity" (Form 4). Each sub-card shows recent activity, filing age, and the matching engine bucket.
- **D-06:** System prompt requirement: Buy/Hold/Sell rationale must reference at least one institutional or insider pattern when the relevant class has an ACTIVE prior at 30d.

### Data Sources
- **D-07:** **Finnhub primary, SEC EDGAR fallback.** Mirrors the existing `yahoo → finnhub → polygon` field-level merge pattern from `src/lib/data/merge.ts`. `FieldOrigin` extends with a new `'edgar'` value.
- **D-08:** Two new fetchers — `src/lib/data/insider.ts` and `src/lib/data/institutional.ts` — each calling Finnhub then EDGAR with field-level fallback. Two new merge functions in `merge.ts` (`mergeInsiderData`, `mergeInstitutionalData`).
- **D-09:** Researcher must validate Finnhub coverage on the existing 200-ticker watchlist before the EDGAR fallback parser is built. If Finnhub coverage ≥95% on US-listed tickers, EDGAR is implemented as a thin guard for null responses; if <95%, EDGAR becomes a co-equal source.

### Pattern Bucketing
- **D-10:** **Insider class — 8 buckets:** `cluster_buying`, `lone_buy`, `ceo_buy`, `cfo_buy`, `director_buy`, `cluster_selling`, `planned_sell_10b5_1`, `lone_sell`. Lookback window = **30 days trailing** (matches 30d primary horizon).
- **D-11:** **Institutional class — 8 buckets:** `net_accumulation`, `net_distribution`, `new_initiation`, `complete_exit`, `smart_money_concentration`, `smart_money_dispersion`, `contrarian_inflow`, `contrarian_outflow`. Bucket reflects the latest 13F's reported position vs prior quarter.
- **D-12:** Each class gets a **deterministic TypeScript classifier**: `src/lib/data/insider-classifier.ts` and `src/lib/data/institutional-classifier.ts`. No LLM in the classification path. Researcher pins the exact threshold values (e.g., `cluster` minimum count, `concentration` top-N fund cutoff).
- **D-13:** **Cell space:** insider 8 × 4 cap_class × 6 horizons = 192. Institutional 192. Engine-wide total grows from 288 (Phase 16) to **672 cells** across 4 signal classes.

### Schema (Prisma)
- **D-14:** `LearnedPattern.signal_class` string already supports new values — no schema change to that column. Backfill not needed.
- **D-15:** `SentimentSnapshot` adds two columns: `insider_data Json?` and `institutional_data Json?`. Mirrors the existing `community_data` / `technical_data` pattern.
- **D-16:** `Report` adds two columns: `insider_at_report Json?` and `institutional_at_report Json?`. Mirrors `community_at_report` / `technical_at_report`.
- **D-17:** Storage shape per snapshot: a typed object containing the bucket, the input filings used, and a `data_age_days` integer. OHLCV-style raw filing arrays are NOT stored — recoverable from re-fetching.

### Staleness Handling
- **D-18:** **13F latency policy:** snapshot stores the latest filing as-is and attaches `data_age_days = today − filing_date`. Outcome (price-followup) is measured from `snapshot_date` forward, NOT from `filing_date`. The engine naturally learns whether 45-day-old institutional data still moves price 30d from when the engine sees it. **No confidence-discount weighting** applied at learn time.
- **D-19:** **Empty-data policy:** when a fetch returns no filings in the lookback (insider) or no 13F coverage (institutional), the snapshot writes `insider_data: null` / `institutional_data: null` and the learn cron **skips** Beta updates for that class on that snapshot — same handling as `community_data: null` today. No artificial "silence" bucket.

### Cron / Fetch Cadence
- **D-20:** Existing `/api/cron/sentiment-scan` calls both new fetchers as part of each ticker scan. No new cron job. Form 4 fetches every scan (cheap — 30d trailing). 13F fetches every scan but most calls are no-ops at the Finnhub layer because the latest filing hasn't changed; the classifier still re-evaluates against the cached filing.

### Learn Loop
- **D-21:** Existing `/api/cron/learn` extends from dual-class (diffusion + technical) to **quad-class** updates per resolved outcome. Each resolved outcome updates **four** Beta cells per horizon — one per signal class — for any class that has a non-null snapshot at report time.
- **D-22:** The 12-feature Bayesian logistic stays trained only on the 30d horizon (Phase 16 lock). It does NOT extend to take institutional/insider features in this phase — those stay as transparent Beta-cell evidence in the calibration table. Logistic-feature extension is deferred.

### Backfill
- **D-23:** New `scripts/backfill-smart-money.ts` script — sequential, 1s rate-limit (matches Phase 16's `backfill-technical.ts`). Walks the existing 200-ticker watchlist, fetches Finnhub history, classifies, writes historical snapshots. Dry-run default. Required to populate enough cells for AC3 (≥25% ACTIVE in most-traded cap_class × horizon=30d row).

### Acceptance Criteria
- **AC1:** `EngineCalibrationPanel` renders 4 columns + horizon table for any ticker with engine data; degrades gracefully (column hidden or `—`) for older persisted reports without `institutional_at_report` / `insider_at_report`.
- **AC2:** Running the same ticker twice across a `learn` cycle produces a different `engine_calibration` block. Live integration test mirrors the existing `engine-affects-reports.test.ts` template.
- **AC3:** After backfill, ≥25% of cells in the most-traded `cap_class × horizon_days=30` row have `status='ACTIVE'` for both `institutional` and `insider` classes.
- **AC4:** Smart Money Intelligence section renders correctly when one class has data and the other is null (asymmetric coverage is the common case).
- **AC5:** Brier score on 30d for at least one ACTIVE pattern in each new class is reported (loose pass — surfacing the calibration is the win, regardless of direction).

### Plan Structure (preliminary)
Five sub-plans, mirroring Phase 16's shape:
- **17-01:** Fetchers + classifiers + types (Finnhub `insider.ts` / `institutional.ts`, EDGAR fallback stubs, insider/institutional-classifier modules, type contracts)
- **17-02:** Schema migration (`SentimentSnapshot.insider_data`, `institutional_data`; `Report.insider_at_report`, `institutional_at_report`)
- **17-03:** Snapshot writer + quad-class learn loop (`sentiment-scan` writes new fields; `learn` cron updates four Beta cells per outcome)
- **17-04:** Engine context + report + prompt integration (engine-context.ts gains institutional/insider calibrations, gemini-analysis.ts gets Smart Money block, EngineCalibrationPanel grows to 4 columns, ResearchReport new section)
- **17-05:** Backfill + integration test + insights tab (`backfill-smart-money.ts`, `smart-money-affects-reports.test.ts`, new `/insights` tabs for institutional and insider pattern libraries)

### Claude's Discretion
- Exact Finnhub endpoint paths (researcher confirms current API).
- EDGAR XML parsing approach (researcher recommends library or hand-rolled parser).
- Threshold values inside each classifier (researcher's empirical pass on real watchlist data).
- Internal field layout of `InsiderSnapshot` / `InstitutionalSnapshot` interfaces.
- Whether to expose 4-way agreement state in the report narrative or keep it panel-only.

### Folded Todos
None — no pending todos matched Phase 17 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Engine architecture (locked from Phase 16)
- `.planning/phases/16-technical-analysis/16-RESEARCH.md` — Multi-horizon signal-class architecture, dual-class learn loop, trust boundary policy. The institutional/insider work copies this template.
- `.planning/phases/16-technical-analysis/16-CONTEXT.md` — Original context file (stub) — supplementary; RESEARCH.md is the authoritative source.
- `prisma/schema.prisma` — Current `LearnedPattern`, `SentimentSnapshot`, `Report`, `LogisticEpoch` shapes. Particularly the `signal_class_pattern_key_cap_class_horizon_days` unique key.

### Existing code Phase 17 extends
- `src/lib/engine-context.ts` — Engine context builder; new institutional + insider lookups added alongside existing diffusion + technical paths.
- `src/lib/learning.ts` — Bayesian update math; quad-class extension lives here.
- `src/lib/gemini-analysis.ts` — Prompt assembly + Zod schema; new fields for `institutional_alignment` / `insider_alignment` etc.
- `src/lib/data/merge.ts` — Field-level merge pattern; new merge functions for the two new fetchers.
- `src/lib/data/finnhub.ts` — Existing Finnhub client; new endpoints added here or in dedicated modules that import it.
- `src/components/InsightsDashboard.tsx` — Existing tab strip; two new tabs for institutional + insider pattern libraries.
- `src/app/api/cron/sentiment-scan/route.ts` — Watchlist scan; new fetchers wired into the per-ticker pipeline.
- `src/app/api/cron/learn/route.ts` — Existing learn loop; extends to quad-class.

### Phase 16 patterns to replicate
- `scripts/backfill-technical.ts` — Backfill script template; `backfill-smart-money.ts` follows the same shape.
- Phase 16's `EngineCalibrationPanel` 2-column dual-class layout — extension target.

### Project-level
- `.planning/PROJECT.md` — Source-grounded reasoning principle (every conclusion must reference a source); applies to Smart Money Intelligence narrative.
- `.planning/REQUIREMENTS.md` §v2 — Lists `DATA-V2-03: Insider trading filings (Form 4)`. 13F is implicit.
- `CLAUDE.md` — Modular pipeline principle; new fetchers belong in `src/lib/data/` with their own unit tests.

### External (researcher will validate live)
- Finnhub API docs — `/stock/insider-transactions`, `/stock/insider-sentiment`, `/stock/institutional-ownership` endpoints + free-tier quotas.
- SEC EDGAR — Form 4 XML schema, 13F-HR/13F-NT filing format, throttling guidelines (10 req/s ceiling).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`signal_class` discriminator**: Already exists on `LearnedPattern` and `SentimentSnapshot.signal_class`. New values slot in without schema change to that column.
- **`merge.ts` field-level merge pattern**: `FieldOrigin` enum extends to `'edgar'`; first-non-null-wins logic reused for the two new fetchers.
- **`engine-context.ts` calibration lookup** (lines 217–230, 363–421): Existing diffusion + technical lookup pattern — copy-paste-and-adapt to institutional + insider.
- **`backfill-technical.ts` script**: Sequential rate-limited backfill template — `backfill-smart-money.ts` mirrors it.
- **`InsightsDashboard` 4-tab strip**: Already extensible; new tabs added without rebuilding the chrome.
- **`technical-affects-reports.test.ts`**: Live-DB integration test template — copy for `smart-money-affects-reports.test.ts`.

### Established Patterns
- **Snapshot pattern**: `Json?` columns on `SentimentSnapshot` (community_data, technical_data) and `Report` (community_at_report, technical_at_report). New columns follow exactly the same shape; absent-field guards in components handle older persisted reports.
- **Trust boundary**: Numeric calibration overwritten post-process from `engine-context.ts`; LLM prose-only in alignment/disagreement strings.
- **Cron topology**: 3 crons in `vercel.json` (sentiment-scan, price-followup, learn). Phase 17 adds zero new crons; extends sentiment-scan + learn.
- **Wave 0 stub-driven TDD**: Phase 16 plan-01 used dynamic `await import()` inside `it()` blocks so vitest collects tests before runtime fails. New fetchers/classifiers follow the same pattern.

### Integration Points
- **Sentiment-scan loop**: Add `await fetchInsiderData(ticker)` + `await fetchInstitutionalData(ticker)` to the per-ticker block, write results to new snapshot columns.
- **Learn cron**: After computing outcome, loop over four signal classes and call `updateBetaCell()` for each non-null snapshot.
- **Research route**: `POST /api/research/[ticker]` — engine-context lookup grows to fetch all four class calibrations; gemini-analysis prompt grows by one Smart Money block.
- **EngineCalibrationPanel**: Component extends from 2-col grid to 4-col grid; agreement-badge logic generalizes to N populated columns.

</code_context>

<specifics>
## Specific Ideas

- **Naming:** "Smart Money Intelligence" is the user-facing report-section title. Internal code uses `institutional` and `insider` as separate concerns.
- **Visual cue for filing age:** the institutional sub-card displays `data_age_days` prominently — e.g., "Latest 13F: 47 days ago (Q1 2026 filings)". Avoids the user mistaking stale data for current positioning.
- **Asymmetric coverage is the common case:** small/micro-caps often have Form 4 data but no 13F coverage (under 5% institutional ownership). The UI must handle one-class-populated gracefully — single sub-card visible, the other shows "No recent 13F filings" placeholder.
- **Researcher empirically validates everything before plan-01 merges:** Finnhub coverage on 200-ticker watchlist, EDGAR throttle behavior under sequential requests, classifier threshold values (especially `cluster_buying` count and `concentration` top-N).

</specifics>

<deferred>
## Deferred Ideas

- **180d horizon extension** — Insider clusters historically show alpha at 90–180d. Not added in this phase; would extend price-followup window to 190d and require a 6-month wait for ACTIVE cells.
- **Logistic-feature extension** — The 12-feature 30d-only Bayesian logistic stays diffusion+technical only. Adding institutional/insider as features (24-feature logistic) is its own phase once the Beta cells stabilize.
- **Tier-1 fund allowlist** — A curated list of "smart money" funds (Berkshire / Tiger Cubs / major HFs) for finer institutional bucketing. Not built; would need a maintained fund-quality list Finnhub doesn't provide.
- **Hybrid LLM tiebreaker classifier** — Rules-first with Haiku fallback for ambiguous cases. Revisit if production data shows >5% of snapshots fall in classifier ambiguity.
- **Event-driven 13F refresh** — Skip 13F fetches on most daily scans, only re-fetch when EDGAR signals a new filing. Optimization deferred until Finnhub rate-limit pressure is real.
- **'Silence' as a real bucket** — Treating absence of insider activity as a learnable signal. Conflates missing-data with no-event; needs a data-quality flag first.

### Reviewed Todos (not folded)
None — no pending todos matched.

</deferred>

---

*Phase: 17-institutional-insider-intelligence*
*Context gathered: 2026-04-30*
