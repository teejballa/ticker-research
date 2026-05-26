# Phase 27: Historical Backfill — Research

**Researched:** 2026-05-26
**Domain:** Historical OHLCV ingestion, technical-signal extraction, Prisma schema migration, PIT-disciplined outcome labeling, Bayesian CV pool bootstrapping
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Backfilled observations feed the **lift-gate CV pool only (raw / undecayed)** — NOT the live Bayesian posterior. Phase 18 time-decay naturally drives old rows to ~0 live weight; no explicit `source='backfill'` exclusion is needed in `/api/cron/learn`. Only the lift-gate's CV query reads outcomes by raw membership regardless of decay.
- **D-02:** Primary vendor = **Yahoo via `yahoo-finance2` `chart()`**. Use `close` (split-adjusted), NOT `adjclose`. No Tiingo adapter exists in the codebase.
- **D-03:** Survivorship bias is a **documented known limitation** — record as explicit caveat in model card and `docs/paper/methodology.md`. Not silently ignored.
- **D-04:** Universe = **curated, versioned, cap-balanced static list** (~120 tickers) checked into `src/lib/backtest/universe.ts` or a `.planning` data file.
- **D-05:** **~30 tickers per cap-class** (large / mid / small / micro) so historically-starved cells get bootstrapped.
- **D-06:** **Local one-shot CLI** (`npx tsx scripts/backfill-historical.ts`) with `--dry-run`, idempotent, **resumable by ticker** (crash at ticker 80 does not restart from zero).
- **D-07:** Cache each ticker's raw OHLCV to **local disk on first fetch** + light throttle. Expected wall-clock 15–45 min. Fetch full history once per ticker (not per-snapshot).
- **D-08:** `cap_class` assigned **as-of the historical date** — reuse `scripts/backfill-snapshot-cap.ts` as-of pattern.
- **D-09:** Backfilled rows tagged **`source='backfill'`** → additive `SentimentSnapshot.source` column (Prisma, default `'live'`). **[BLOCKING]** schema-push task.
- **D-10:** **Hard live-only gate** — cell cannot flip EXPLORATORY→ACTIVE until ≥10 live (non-backfill) outcomes confirm the prior. Threshold default **10**, configurable in `HYPERPARAMETERS.md`. `live_outcome_count` = outcomes whose snapshot `source != 'backfill'`.
- **D-11:** Reuse **`computeTechnicalSnapshot`** (`src/lib/data/technical.ts:180`) as the single feature-extraction path. No forked extractor.
- **D-12:** Backfilled `PriceOutcome` rows compute **all three labels** (`pct_change` vs-SPY, `forward_return_raw`, `forward_return_sector_rel`) per Phase 21, using `src/lib/data/sector-mapping.ts` with `asOfDate` for as-of sector ETF snapshotting.

### Claude's Discretion

- Snapshot cadence: **weekly default** (planner may revisit to daily if Purged-CV folds come out too sparse per cell).
- Disk-cache location/format, batch sizes, throttle interval, exact universe ticker picks, and resume-checkpoint mechanism.

### Deferred Ideas (OUT OF SCOPE)

- True delisted-ticker / survivorship-free universe via Polygon or paid PIT dataset.
- Building a real Tiingo EOD adapter.
- Daily-cadence backfill (unless weekly CV folds prove too sparse).
- Backfilling non-technical signal classes (diffusion / sentiment / insider / institutional).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COVERAGE-06 | Backfill universe spans ≥100 tickers × ≥5 years for technical signal class (deterministic features computable from historical OHLCV) | yahoo-finance2 `chart()` confirmed to return ≥5y of daily bars in a single call; 120-ticker static universe plan documented below |
| COVERAGE-07 | PIT data discipline: vendor returns unadjusted prices, cap_class assigned as-of historical date, no survivorship bias from delisted | Yahoo `close` is split-adjusted (no forward dividend adj); `scripts/backfill-snapshot-cap.ts` as-of pattern confirmed; survivorship caveat documentation path identified |
| COVERAGE-08 | Single feature-extraction code path for backfill and live (train/serve skew defense) | `computeTechnicalSnapshot(ticker, asOf)` signature confirmed: accepts an `asOf?: Date` and calls `fetchOhlcv(ticker, asOf)` internally — already PIT-capable |
| COVERAGE-09 | Backfilled SentimentSnapshot rows tagged `source = 'backfill'` | Current schema confirmed: NO `source` column on `SentimentSnapshot`. Additive migration (nullable String, default `'live'`) is the blocking Wave 0 task. |
| COVERAGE-10 | Live-only validation gate: every promoted ACTIVE cell must also have ≥10 live (non-backfill) outcomes confirming the prior | `patternStatus()` in `learning.ts` and `recomputeOneCell()` in learn cron are the right insertion points. `live_outcome_count` derivable via join on `SentimentSnapshot.source`. |
</phase_requirements>

---

## Summary

Phase 27 bootstraps the Bayesian lift-gate's CV pool by replaying ≥100 tickers × ≥5 years of the technical signal class through the existing feature-extraction pipeline. All locked decisions are implementable with existing codebase primitives — the only blocking new artifact is the additive `SentimentSnapshot.source` Prisma column (D-09).

The primary execution path is a new local CLI (`scripts/backfill-historical.ts`) that mirrors `scripts/backfill-technical.ts` but scales to a versioned 120-ticker universe, caches raw OHLCV to disk, generates weekly technical snapshots via `computeTechnicalSnapshot(ticker, asOf)`, computes all three Phase 21 outcome labels for each snapshot, and writes rows tagged `source='backfill'`. The learn cron (`/api/cron/learn`) requires no changes for D-01 — decay naturally zeroes old rows in the live posterior. The live-only promotion gate (D-10) requires a small addition to `recomputeOneCell()` to count `source != 'backfill'` outcomes per cell.

The technical cell space is 8 patterns × 3 cap_classes × 6 horizons = **144 cells** (technical signal class only). With 120 tickers × 260 weekly snapshots over 5 years, the raw population is ~31,200 snapshot rows before `bar_count < 200` culling. Even at 60% fill rate (tickers that had ≥200 bars by the snapshot date), that yields ~18,700 labeled technical snapshots spread across 144 cells — roughly 130 observations per cell on average, well above Phase 23's Purged-K-Fold minimum.

**Primary recommendation:** Build in four clearly-ordered waves: (W0) schema migration + test scaffolding; (W1) universe file + disk-cache fetch layer; (W2) snapshot + outcome generation (the heavy lift); (W3) live-only gate + documentation.

---

## Standard Stack

### Core (all already in repo)
| Library | Purpose | Confirmed Present |
|---------|---------|-------------------|
| `yahoo-finance2` | OHLCV via `chart()`, market-cap via `quoteSummary()` | [VERIFIED: scripts/backfill-technical.ts] |
| `@prisma/client` + `@prisma/adapter-neon` | DB writes with Neon adapter | [VERIFIED: schema.prisma, scripts/backfill-technical.ts] |
| `dotenv` | `.env.local` loading in scripts | [VERIFIED: scripts/backfill-technical.ts:1] |
| `tsx` | Run TypeScript scripts locally via `npx tsx` | [VERIFIED: backfill-technical.ts usage pattern] |
| `technicalindicators` | RSI / MACD / SMA / ATR — used inside `computeTechnicalSnapshot` | [VERIFIED: src/lib/data/technical.ts:20] |
| `src/lib/data/sector-mapping.ts` | `getSectorETF({ ticker, asOfDate })` for PIT sector lookup | [VERIFIED: sector-mapping.ts] |
| `src/lib/data/sector-prices.ts` | `fetchSectorETFReturn(etf, from, to)` for sector return | [VERIFIED: price-followup/route.ts:5] |

### No New Dependencies Required
All required libraries are already installed. The CLI is a pure TypeScript script using existing imports.

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
scripts/
└── backfill-historical.ts        # New: the Phase 27 CLI (mirrors backfill-technical.ts)

src/lib/backtest/
└── universe.ts                   # New: versioned 120-ticker static universe (D-04)

docs/paper/
└── methodology.md                # New: survivorship bias + split-adjustment caveats (D-03)

prisma/
└── schema.prisma                 # Modified: additive source column on SentimentSnapshot (D-09)
```

### Pattern 1: Fetch-Once-Per-Ticker with Disk Cache

**What:** Pull the full 5-year daily OHLCV for a ticker in one `chart()` call. Cache the raw JSON to `~/.cipher/backfill-cache/<ticker>.json`. On re-runs, read from disk if the file exists.

**Why:** Yahoo's soft-block triggers on rapid successive calls, not total volume. One call per ticker every N minutes is fine; one call per snapshot (260× per ticker) would trigger soft-blocks and blow the runtime to hours.

**Pattern:**
```typescript
// Source: mirrors scripts/backfill-technical.ts fetchHistoricalPrice pattern
const CACHE_DIR = path.join(os.homedir(), '.cipher', 'backfill-cache');

async function fetchOrLoadOhlcv(ticker: string): Promise<OhlcvBar[]> {
  const cacheFile = path.join(CACHE_DIR, `${ticker}.json`);
  if (fs.existsSync(cacheFile)) {
    const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    return raw.map((b: Record<string,unknown>) => ({ ...b, date: new Date(b.date as string) }));
  }
  // One chart() call covering full 5y window
  const period2 = new Date();
  const period1 = new Date(period2.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
  const raw = await yf.chart(ticker, { period1, period2, interval: '1d' });
  const bars = (raw?.quotes ?? []).filter(q => q.close != null);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(bars));
  return bars as OhlcvBar[];
}
```

### Pattern 2: Weekly Snapshot Windowing (PIT-safe)

**What:** For each ticker's full OHLCV bar array, slide a window ending every Friday (or every 7 days from a start anchor). For each window, pass the bars up to that date to `computeTechnicalSnapshot`. The `asOf` parameter anchors the Yahoo call inside `fetchOhlcv`, but for backfill the bars are already cached — so the pattern is to slice the pre-fetched bar array to bars `<= asOf` and call a slightly adapted path.

**Critical insight:** `computeTechnicalSnapshot(ticker, asOf)` calls `fetchOhlcv(ticker, asOf)` which calls `yf.chart(ticker, { period1: asOf-365d, period2: asOf })`. For backfill the disk-cached bars must be sliced to `<= asOf` and limited to the most recent 365 days before `asOf` — exactly what `fetchOhlcv` does live. The cleanest approach is to call `computeTechnicalSnapshot(ticker, asOf)` directly with each weekly `asOf` date; it naturally fetches the trailing year via disk-cached-backed Yahoo. This keeps the single feature-extraction path (D-11) perfectly clean.

**Alternative (if caching inside fetchOhlcv is impractical):** Export a `computeTechnicalSnapshotFromBars(bars: OhlcvBar[], asOf: Date)` overload that accepts a pre-fetched bar array — but this creates a parallel path and risks train/serve skew. **Avoid.** Cache at the `yf.chart()` level instead.

### Pattern 3: Idempotent Per-Ticker Checkpoint (Resume on Crash)

**What:** Write a `.checkpoint` file listing completed tickers. On startup, skip any ticker already in the checkpoint.

**Pattern:**
```typescript
// Source: mirrors scripts/backfill-technical.ts DRY_RUN pattern
const CHECKPOINT_FILE = path.join(CACHE_DIR, 'checkpoint.json');

function loadCheckpoint(): Set<string> {
  if (!fs.existsSync(CHECKPOINT_FILE)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8')));
}

function markDone(ticker: string, done: Set<string>): void {
  done.add(ticker);
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify([...done]));
}
```

### Pattern 4: Batched createMany Writes (~1k rows/batch)

**What:** Accumulate SentimentSnapshot + PriceOutcome rows in memory per ticker. Write via `prisma.sentimentSnapshot.createMany({ data: batch, skipDuplicates: true })` in chunks of 500–1000.

**Why:** Naive per-row `create` calls at 31,200 rows × round-trip latency would dominate the 15–45 min budget. `createMany` with `skipDuplicates: true` also provides idempotency within a batch.

**Neon note:** Neon's HTTP adapter supports `createMany` [VERIFIED: prisma/schema.prisma uses `@prisma/adapter-neon`]. Batch size ~500 rows is safe for Neon's connection timeout.

### Pattern 5: As-Of cap_class Assignment (D-08)

**What:** Look up market-cap as-of the snapshot date rather than current. Reference: `scripts/backfill-snapshot-cap.ts` uses `yf.quoteSummary(ticker, { modules: ['summaryDetail', 'price'] })` → `classifyCapClass(marketCap)` from `src/lib/diffusion-trace.ts`.

**Critical:** Yahoo's `quoteSummary` returns CURRENT market cap, not historical. The as-of pattern in `backfill-snapshot-cap.ts` is actually a current-cap lookup used to backfill old rows — it is NOT a time-series market cap lookup. True point-in-time market cap would require a paid data source. The correct Phase 27 approach is: assign `cap_class` at time of backfill run using current Yahoo market-cap (same as the existing pattern). This is a documented, explicit simplification — the universe is hand-curated so large-caps that were small-caps 5 years ago can be excluded manually.

**ASSUMED: Historical market cap for each ticker is not available via yahoo-finance2 for free — current market cap is used as a proxy.**

### Pattern 6: Sector Label Computation (D-12)

**What:** For each PriceOutcome row, compute all three labels exactly as `price-followup/route.ts` does:
1. `forward_return_raw` = `((price_at_outcome - price_at_scan) / price_at_scan) * 100`
2. `sector_etf` = `getSectorETF({ ticker, asOfDate: snapshot_date })` — respects reconstitution overrides
3. `forward_return_sector_rel` = `forward_return_raw - fetchSectorETFReturn(sector_etf, snapshot_date, outcome_date)`
4. `pct_change` = same as `forward_return_raw` (backward-compat field)

The `getSectorETF` call with `asOfDate` will use `SECTOR_RECONSTITUTIONS` for META/GOOGL/GOOG/NFLX/DIS/T/VZ — the only tickers with known historical sector changes in the current override table.

**Note on sector ETF price fetching:** `fetchSectorETFReturn` will need the same disk-cache treatment as ticker OHLCV — each sector ETF's historical prices should be cached once per ETF (12 ETFs + SPY = 13 fetch calls), not once per outcome row.

### Anti-Patterns to Avoid

- **One `chart()` call per snapshot window:** Blows runtime to hours and triggers Yahoo soft-blocks. Always fetch full history once and slice.
- **Using `adjclose` instead of `close`:** `adjclose` applies backward dividend adjustment, introducing forward-looking bias (the adjustment factor at time T uses future dividend info). `close` is split-adjusted only.
- **Writing backfill rows without `source` field:** The schema migration must land before any rows are written. The planner must make the schema migration Wave 0, Task 0.
- **Random K-fold CV on the backfill pool:** CLAUDE.md rule #1 — always Purged K-Fold + Embargo for time series. Backfill rows must carry `scanned_at` timestamps so Phase 23 can apply PIT-correct forward-chaining splits.
- **Calling `computeTechnicalSnapshot` with future bars in the window:** Every weekly snapshot must use bars strictly `<= asOf`. The existing `fetchOhlcv(ticker, asOf)` enforces `period2 = asOf` — this is the correct guard.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Technical indicator computation | Custom RSI/MACD/SMA/ATR | `computeTechnicalSnapshot` via `technicalindicators` | Already handles null-bars, warmup truncation, halt-day volume |
| Sector ETF PIT lookup | Custom sector timeline logic | `getSectorETF({ ticker, asOfDate })` | Already implements SECTOR_RECONSTITUTIONS override table |
| Sector return computation | Manual ETF price math | `fetchSectorETFReturn(etf, from, to)` | Already handles nearest-trading-day logic |
| Cap class assignment | Custom market-cap thresholds | `classifyCapClass(marketCap)` from `src/lib/diffusion-trace.ts` | Locked thresholds: ≥$10B = large, ≥$2B = mid, else small |
| Outcome hit classification | Custom threshold logic | `classifyHit()` from `src/lib/learning.ts` | Handles both sector-relative (primary) and SPY-relative (fallback) paths |
| Prisma batch writes | Chunked manual SQL | `prisma.sentimentSnapshot.createMany({ skipDuplicates: true })` | Neon-safe, idempotent |

**Key insight:** The entire backfill is orchestration of existing primitives. No new domain logic is introduced — only a new CLI that wires them together at historical scale.

---

## Current Schema — Exact State

### SentimentSnapshot (current — NO `source` column)
```
id, ticker, scanned_at, price_at_scan, community_data, technical_data?,
insider_data?, institutional_data?, community_aggregated?, citations_v2?,
finsentllm_score?, model_agreement?
```
**Missing:** `source String? @default("live")` — blocking D-09.

### PriceOutcome (current — Phase 21 columns present)
```
id, report_id?, snapshot_id?, days_after, price, pct_change, recorded_at,
sector_etf?, forward_return_raw?, forward_return_sector_rel?
```
All three Phase 21 label columns are already present. No schema change needed for PriceOutcome.

### LearnedPattern (current)
```
id, signal_class, pattern_key, cap_class, horizon_days,
alpha, beta, sample_size, effective_sample_size, n_trials_attempted, hits,
brier_in_sample, brier_out_sample, brier_null, alpha_30d, beta_30d, drift_z,
status, last_updated, rolling_ic_20d?, ic_decay_flag?, dsr?, pbo?,
conformal_low?, conformal_high?, parent_alpha?, parent_beta?, shrinkage_strength?
```
Unique key: `(signal_class, pattern_key, cap_class, horizon_days)`.

### Required Schema Migration (D-09)
```prisma
model SentimentSnapshot {
  // ... existing fields ...
  source  String  @default("live")   // 'live' | 'backfill' — Phase 27 D-09
}
```
Migration is **additive** (has default, all existing rows get `'live'` automatically). Safe for `npx prisma db push` with zero downtime.

---

## Technical Cell Space Sizing

| Dimension | Count | Source |
|-----------|-------|--------|
| TechPattern values | 8 | `TECH_PATTERNS` in learn/route.ts:91-100 |
| Cap classes (learnable) | 3 (`large_cap`, `mid_cap`, `small_cap`) | learn/route.ts:121 — `unknown` explicitly excluded |
| Horizons | 6 (3, 7, 14, 30, 60, 90d) | `HORIZONS` in learn/route.ts:122 |
| **Total technical cells** | **144** | 8 × 3 × 6 |

**Row volume estimate (weekly cadence, 120 tickers, 5y):**
- Snapshot rows: 120 tickers × (5 × 52 weeks) = 120 × 260 = **31,200 SentimentSnapshot rows**
- PriceOutcome rows: 31,200 snapshots × 6 horizons = **187,200 PriceOutcome rows** (max; many early snapshots won't have 90d outcomes resolved yet in historical data, but since we have 5y of history we can compute outcomes for all windows ≤ 5y−horizon)
- Effective outcome rows after removing snapshots where `bar_count < 200` (requires ~200 trading days = ~10 months of history before the first usable snapshot): ~80% fill rate for a 5y window → ~25,000 snapshots with valid tech_pattern → ~150,000 PriceOutcome rows
- Per-cell average: 150,000 / 144 = **~1,040 observations per cell** — well above Phase 23's Purged-K-Fold minimum

**Wall-clock estimate:**
- 120 ticker cache fetches at 1s throttle = ~2 min
- 13 sector ETF cache fetches = <1 min
- 31,200 `computeTechnicalSnapshot` calls (pure CPU, no network after cache) at ~5ms each = ~2.5 min
- 187,200 outcome price lookups from pre-cached bars = <1 min (array slices)
- DB writes: ~320 batches of 500 rows at ~200ms/batch = ~60–90 min **[RISK: this is the bottleneck]**

**Revised estimate:** The DB write phase may push beyond the 45-min target for 187,200 PriceOutcome rows. Mitigation: use `createMany` in large batches (1000 rows) and pipeline inserts with processing; or write SentimentSnapshot and PriceOutcome in the same transaction per ticker (reduces round-trips).

**ASSUMED: Neon connection latency from local script is ~150-300ms per `createMany` call. Planner should verify and tune batch size.**

---

## Learn Cron Integration (D-01 analysis)

### What the learn cron currently does
1. `loadUnprocessedOutcomes({ isBackfill })` — loads PriceOutcome rows without a linked LearningEvent. The `isBackfill` flag widens the time window to `new Date(0)` (all time). **This flag already exists.**
2. For each outcome: upsert `LearnedPattern` cells via `upsertCell()` (increments alpha/beta/sample_size).
3. `recomputePerSignalClassPatternMetrics()` — recomputes ESS, weighted posterior, Brier in/out, drift_z, status for every cell.

### D-01: Why no exclusion filter is needed in the learn cron
The `recomputeOneCell()` function runs `decayWeights(weightedObs, lambdaDays=60, now)`. A backfill row from 5 years ago has `dtDays ≈ 1825`, so `w = exp(-1825/60) ≈ exp(-30.4) ≈ 1.5×10⁻¹³` — effectively zero. It contributes negligibly to `updatePosteriorWeighted` and `computeESS`. The D-01 decision is validated: **no code change to the learn cron is needed for the posterior path.**

### D-10: Live-only gate insertion point
The live-only gate must be added to `recomputeOneCell()` in `learn/route.ts`. The gate reads `live_outcome_count` = count of `LearningEvent` rows with `event_type='posterior_update'` for this cell **where the originating snapshot's `source != 'backfill'`**.

**Join path for live_outcome_count:**
```
LearningEvent.outcome_id → PriceOutcome.id → PriceOutcome.snapshot_id → SentimentSnapshot.source
```
The join is: `LearningEvent` has `outcome_id`; `PriceOutcome` has `snapshot_id`; `SentimentSnapshot` has `source`. A Prisma query with two levels of include can derive this, but it's simpler to add a `source` field to the `LearningEvent.delta` JSON payload at write time (when `processOneOutcome` writes the `posterior_update` event, it has access to the snapshot's source field). This is the recommended approach — it avoids a 3-table join in the hot recompute loop.

**Gate logic in `patternStatus()` or as a pre-check in `recomputeOneCell()`:**
```typescript
// D-10 live-only gate (Phase 27)
const liveOutcomeCount = events.filter(ev => {
  const d = ev.delta as { source?: string } | null;
  return d?.source !== 'backfill';
}).length;
if (liveOutcomeCount < LIVE_OUTCOME_THRESHOLD) {
  // Cell cannot promote beyond EXPLORATORY regardless of Brier lift
  status = 'EXPLORATORY';
}
```
Where `LIVE_OUTCOME_THRESHOLD = 10` (configurable in `HYPERPARAMETERS.md`).

---

## Purged-K-Fold CV Pool Compatibility (CLAUDE.md Rule #1)

The Phase 23 lift-gate will need to run Purged K-Fold + Embargo CV on the combined backfill + live outcome pool. For this to work, Phase 27 must ensure:

1. **`SentimentSnapshot.scanned_at` is a real historical timestamp** — not the backfill run date. Each backfill snapshot must use the actual weekly window date (e.g. the Friday closing date).
2. **`PriceOutcome.recorded_at` reflects the outcome resolution date** — `scanned_at + days_after`, not today's date.
3. **`LearningEvent.occurred_at` reflects when the outcome was resolved historically** — same as `PriceOutcome.recorded_at`.

These timestamps are what Phase 23's Purged K-Fold uses to determine fold boundaries and the embargo gap. If they are set to `new Date()` (the backfill run date), all backfill rows will appear as simultaneous observations and Purged K-Fold will degenerate to no folds.

**This is a CRITICAL correctness requirement** — the planner must explicitly call it out as a task-level constraint.

---

## cap_class Thresholds (D-08 reference)

From `src/lib/diffusion-trace.ts:39-43` [VERIFIED]:
```typescript
export function classifyCapClass(marketCap: number | null | undefined): CapClass {
  if (marketCap >= 10_000_000_000) return 'large_cap';   // ≥ $10B
  if (marketCap >= 2_000_000_000) return 'mid_cap';      // ≥ $2B
  return 'small_cap';                                     // < $2B
}
```
**Note:** The current `CapClass` type is `'large_cap' | 'mid_cap' | 'small_cap' | 'unknown'` — there is NO `'micro_cap'` value in the codebase. D-05 references "micro" as a universe curation concept (tickers with very small market caps), but the cap-class bucket they'd fall into is `'small_cap'`. The planner should note this: the universe can include micro-cap tickers by market-cap value but they will be classified as `'small_cap'` unless `classifyCapClass` is extended.

**ASSUMED: D-05's "micro_cap" universe bucket maps to the existing `small_cap` CapClass — or requires adding `micro_cap` to the CapClass union and all downstream enumerations. This needs planner attention.**

---

## Common Pitfalls

### Pitfall 1: Wrong Timestamps on Backfill Rows
**What goes wrong:** Setting `scanned_at = new Date()` (backfill run date) on SentimentSnapshot rows instead of the actual historical window date.
**Why it happens:** Easy mistake when adapting the live cron pattern to batch insert.
**How to avoid:** Use the actual weekly window end-date (e.g. `new Date('2021-03-05')`) as `scanned_at`. Use `scanned_at + days_after × 86400000` as `recorded_at` on PriceOutcome rows.
**Warning signs:** All backfill `scanned_at` values appear clustered in a single day in the DB.

### Pitfall 2: Duplicate Rows on Re-Run
**What goes wrong:** Re-running the CLI after a partial completion inserts duplicate `SentimentSnapshot` rows.
**Why it happens:** `createMany({ skipDuplicates: true })` requires a unique constraint to function. `SentimentSnapshot` has no unique constraint on `(ticker, scanned_at)`.
**How to avoid:** Either (a) add a unique constraint on `(ticker, scanned_at)` as part of the schema migration, or (b) query existence before inserting (slower but safe). Option (a) is preferable — it also defends the live pipeline against duplicate scans.
**Warning signs:** `scanned_at` count grows on each re-run for already-completed tickers.

### Pitfall 3: fetchOhlcv Refetches on Every computeTechnicalSnapshot Call
**What goes wrong:** `computeTechnicalSnapshot(ticker, asOf)` calls `fetchOhlcv(ticker, asOf)` which hits `yf.chart()` — once per weekly window = 260 calls per ticker.
**Why it happens:** The existing `computeTechnicalSnapshot` function always calls `fetchOhlcv` internally.
**How to avoid:** The disk-cache wrapping must intercept at the `yf.chart()` level so `fetchOhlcv` hits the cache. The recommended approach is to monkey-patch the `yahooFinance` instance's `chart` method in the CLI script to check disk cache first, or to use a module-level cache map keyed by `(ticker, period1-rounded-to-week)`.
**Warning signs:** Wall-clock time is >30 min for the fetch phase alone; Yahoo returns 429/captcha responses.

### Pitfall 4: `bar_count < 200` Silently Produces null tech_pattern
**What goes wrong:** Snapshots computed within the first ~10 months of a ticker's 5y window will have `bar_count < 200` and return `tech_pattern = null`. These rows are useless for cell counting.
**Why it happens:** `classifyTechPattern` returns null when `bar_count < 200` (SMA-200 warmup requirement).
**How to avoid:** Skip writing SentimentSnapshot rows where `tech_pattern === null`. Only write rows that have a valid 8-bucket classification.
**Warning signs:** Large numbers of null tech_pattern in the pattern histogram output.

### Pitfall 5: Sector ETF Returns Unavailable for Historical Dates
**What goes wrong:** `fetchSectorETFReturn(etf, from, to)` returns null for dates >5y ago if Yahoo's free history doesn't extend that far for some ETFs.
**Why it happens:** Some sector ETFs (especially XLRE, XLC) were created after 2015 — they won't have prices before their inception date.
**How to avoid:** Fall back to SPY when sector ETF return is null (exactly as `price-followup/route.ts` does). Document in methodology.md that sector-relative labels before ETF inception fall back to SPY-relative.
**Warning signs:** High `sector_fallback_to_spy` count in the CLI output for pre-2015 snapshots.

### Pitfall 6: live-only Gate Not Propagating Source to LearningEvent
**What goes wrong:** `processOneOutcome` writes `LearningEvent.delta` without a `source` field, making it impossible to count live vs. backfill outcomes in `recomputeOneCell` without expensive 3-table joins.
**Why it happens:** `source` doesn't exist on `SentimentSnapshot` until Phase 27 ships.
**How to avoid:** When writing `posterior_update` LearningEvent, include `source: snapshot.source ?? 'live'` in the delta JSON. This is a small addition to `processOneOutcome` in the learn cron.
**Warning signs:** Phase 23 can't filter live vs. backfill outcomes without full table scans.

---

## Code Examples

### computeTechnicalSnapshot signature (the single feature path)
```typescript
// Source: src/lib/data/technical.ts:180
export async function computeTechnicalSnapshot(
  ticker: string,
  asOf?: Date,  // <-- the PIT anchor. Defaults to now.
): Promise<TechnicalSnapshot | null>
```
Returns `null` when no bars fetched or Yahoo fails. Returns a snapshot with `tech_pattern = null` when `bar_count < 200`. Otherwise returns the full `TechnicalSnapshot` with a valid 8-bucket `tech_pattern`.

### classifyCapClass thresholds
```typescript
// Source: src/lib/diffusion-trace.ts:39
export function classifyCapClass(marketCap: number | null | undefined): CapClass {
  if (marketCap >= 10_000_000_000) return 'large_cap';
  if (marketCap >= 2_000_000_000) return 'mid_cap';
  return 'small_cap';
}
```

### getSectorETF with as-of discipline
```typescript
// Source: src/lib/data/sector-mapping.ts:127
export async function getSectorETF(args: {
  ticker: string;
  asOfDate?: Date;  // <-- pass snapshot date for PIT sector lookup
}): Promise<SectorETF>
```

### Additive schema migration (D-09)
```prisma
// Add to SentimentSnapshot in prisma/schema.prisma
source  String  @default("live")   // 'live' | 'backfill'
```
Then: `npx prisma db push` (additive — zero downtime, all existing rows get default `'live'`).

### HYPERPARAMETERS current state (bootstrap — all λ=60d)
```typescript
// Source: src/lib/learning.ts:744
export const HYPERPARAMETERS = {
  technical: { lambda_days: 60, ph_delta: 0.005, ph_lambda: 50, tuned_at: 'bootstrap', cv_brier_oos: null },
  // ... same for diffusion / insider / institutional
};
// All four classes are in HYPERPARAMETERS_DEFERRED_RETUNE — tuning deferred until Phase 27 N grows.
// Phase 27 is the event that enables re-tuning (via scripts/tune-lambda.ts, scripts/tune-page-hinkley.ts).
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Historical market cap is not available via yahoo-finance2 for free; current market cap used as proxy for cap_class assignment | Architecture Patterns §5 | Tickers that were different cap-class 5y ago get wrong classification; affects cell distribution |
| A2 | D-05 "micro_cap" universe bucket maps to existing `small_cap` CapClass (no `micro_cap` CapClass exists) | cap_class Thresholds | If planner adds `micro_cap` to CapClass union, all downstream enumerations in learn cron need updating — significant scope expansion |
| A3 | Neon createMany round-trip from local script is ~150-300ms; 187,200 rows may exceed 45-min budget | Row Volume section | DB write phase becomes the bottleneck; planner may need to tune batch size or accept longer runtime |
| A4 | `fetchSectorETFReturn` in `src/lib/data/sector-prices.ts` accepts historical `from/to` dates and returns the correct ETF return for that window | Sector Label Computation | If sector-prices only fetches live/recent prices, historical sector-relative labels will be wrong; this file was not read directly |

---

## Open Questions (RESOLVED)

1. **Does `src/lib/data/sector-prices.ts` support arbitrary historical date ranges?**
   - What we know: `price-followup/route.ts` imports and calls `fetchSectorETFReturn(etf, fromDate, toDate)`.
   - What's unclear: Whether this function uses `yf.chart()` with the supplied dates (would work for historical) or only fetches live quotes.
   - **RESOLVED:** Plan 27-02 Task 3 adds a `--probe-sector` mode that verifies `fetchSectorETFReturn` against a 5-year-old date pair before building the outcome path, with an SPY fallback if historical coverage is missing.

2. **Does `SentimentSnapshot` need a unique constraint on `(ticker, scanned_at)` for `skipDuplicates: true` to work?**
   - What we know: Current schema has no such constraint (only an index on `[ticker, scanned_at(sort: Desc)]`).
   - What's unclear: Whether Prisma `createMany({ skipDuplicates: true })` requires a DB-level unique constraint or just silently skips on conflict.
   - **RESOLVED:** Plan 27-01 Task 1 adds `@@unique([ticker, scanned_at])` to the additive migration, making `createMany({ skipDuplicates: true })` idempotent for resumable runs.

3. **Should `micro_cap` be added as a 4th CapClass, or should D-05 micro-cap tickers be binned into `small_cap`?**
   - What we know: Current CapClass type and learn cron enumerate only `large_cap`, `mid_cap`, `small_cap`.
   - What's unclear: Whether Phase 23's lift-gate needs a separate micro-cap cell or is happy with an enriched small_cap.
   - **RESOLVED:** CONTEXT.md D-05 correction (2026-05-26) bins micro into `small_cap` — the learning-engine `CapClass` stays 3-way (`large_cap | mid_cap | small_cap`). Extending the union is deferred (see CONTEXT Deferred). Plan 27-01 Task 3 asserts no `micro_cap` bucket exists.

---

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| `yahoo-finance2` | OHLCV fetch | Yes | Already in package.json |
| `DATABASE_URL` (Neon) | Prisma writes | Yes (in `.env.local`) | Must be set before running script |
| `npx tsx` | Script execution | Yes | `tsx` in devDependencies |
| Local disk write permission | OHLCV cache | Yes | `~/.cipher/backfill-cache/` |
| `docs/paper/` directory | D-03 methodology doc | No — does not exist | Wave 3 task creates it |
| `src/lib/backtest/` directory | Universe file (D-04) | No — does not exist | Wave 1 task creates it |

---

## Validation Architecture

> `nyquist_validation: true` in `.planning/config.json` — section is REQUIRED.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.9 |
| Config file | `vitest.config.ts` (unit) / `vitest.integration.config.ts` (integration) |
| Quick run command | `npm test` (vitest run) |
| Full suite command | `npm run test:integration` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COVERAGE-06 | Universe file has ≥100 tickers; `chart()` call returns ≥5y of bars | Unit + CLI dry-run | `npx tsx scripts/backfill-historical.ts --dry-run --max-tickers 5` | ❌ Wave 0 |
| COVERAGE-07 | PIT discipline: `scanned_at` timestamps are historical; `cap_class` at-of pattern; survivorship caveat in docs/paper/methodology.md | Unit (timestamp check) + doc existence check | `vitest run tests/unit/backfill-pit-discipline.test.ts` | ❌ Wave 0 |
| COVERAGE-08 | Backfill calls `computeTechnicalSnapshot` directly (no forked extractor); import path check | Unit (static import audit) | `vitest run tests/unit/backfill-single-feature-path.test.ts` | ❌ Wave 0 |
| COVERAGE-09 | `SentimentSnapshot.source` column exists in DB; backfill rows have `source='backfill'`; live rows default to `'live'` | Integration (schema check + row audit) | `npm run test:integration -- tests/integration/backfill-source-tag.test.ts` | ❌ Wave 0 |
| COVERAGE-10 | Cell with ≥N backfill outcomes but 0 live outcomes stays EXPLORATORY; cell with ≥10 live outcomes can promote | Unit (patternStatus + live-gate logic) | `vitest run tests/unit/backfill-live-gate.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test` (full unit suite, ~30 sec)
- **Per wave merge:** `npm run test:integration` (requires live Neon connection)
- **Phase gate:** Full suite green + `npx tsx scripts/backfill-historical.ts --dry-run` exit 0 before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/backfill-pit-discipline.test.ts` — verifies `scanned_at` is a historical date, not `new Date()`
- [ ] `tests/unit/backfill-single-feature-path.test.ts` — static import audit that backfill CLI does not define its own indicator logic
- [ ] `tests/unit/backfill-live-gate.test.ts` — unit tests for the `live_outcome_count < threshold → EXPLORATORY` gate in `patternStatus`/`recomputeOneCell`
- [ ] `tests/integration/backfill-source-tag.test.ts` — integration test verifying schema migration applied and source column values
- [ ] `docs/paper/methodology.md` — stub file with survivorship-bias and split-adjustment caveats (COVERAGE-07)
- [ ] `src/lib/backtest/` directory and `universe.ts` — the versioned 120-ticker static list

---

## Security Domain

> `security_enforcement` not explicitly `false` in config — section included.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | Script is local-only, no auth surface |
| V3 Session Management | No | Script is local-only |
| V4 Access Control | No | Script is local-only |
| V5 Input Validation | Yes (minimal) | Ticker symbols from static universe file — no user input |
| V6 Cryptography | No | No secrets generated |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `DATABASE_URL` in `.env.local` | Information Disclosure | Never commit `.env.local`; already in `.gitignore` |
| Ticker universe file could be path-traversal vector | Tampering | Universe is a checked-in TypeScript file, not user-supplied input |
| OHLCV disk cache contains no credentials | — | Cache is price data only; low sensitivity |

---

## Sources

### Primary (HIGH confidence — verified in codebase)
- `scripts/backfill-technical.ts` — reference CLI pattern (throttle, dry-run, Prisma+Neon, `computeTechnicalSnapshot` call)
- `scripts/backfill-snapshot-cap.ts` — as-of cap_class pattern
- `src/lib/data/technical.ts:180` — `computeTechnicalSnapshot` signature and `asOf` behavior
- `src/lib/learning.ts:744` — HYPERPARAMETERS (all λ=60d, all bootstrap)
- `src/lib/learning.ts:308` — `patternStatus()` insertion point for live-only gate
- `src/app/api/cron/learn/route.ts:350-400` — `upsertCell`, `recomputeOneCell` structure
- `src/app/api/cron/price-followup/route.ts:47-87` — `computeSectorLabels` pattern for all three labels
- `src/lib/data/sector-mapping.ts` — `getSectorETF({ ticker, asOfDate })` signature and reconstitution overrides
- `prisma/schema.prisma` — confirmed: no `source` column on `SentimentSnapshot` today

### Secondary (MEDIUM confidence)
- CLAUDE.md §"Load-bearing rules" — Purged K-Fold requirement (rule #1), timestamp correctness requirement (rule #6)
- `.planning/REQUIREMENTS.md` §COVERAGE-06..10 — verbatim acceptance criteria
- `.planning/phases/27-historical-backfill/27-CONTEXT.md` — all locked decisions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified present in codebase
- Architecture: HIGH — patterns derived directly from existing reference implementations
- Schema migration: HIGH — exact current schema verified, migration is 1-line additive
- Row volume estimate: MEDIUM — calculation is arithmetic; DB write latency is ASSUMED
- cap_class as-of limitation: MEDIUM — Yahoo free tier limitation is well-known; ASSUMED for historical
- Sector ETF historical coverage: MEDIUM — `fetchSectorETFReturn` interface verified, historical range not directly confirmed

**Research date:** 2026-05-26
**Valid until:** 2026-06-25 (yahoo-finance2 API shape is stable; Prisma pattern is stable)
