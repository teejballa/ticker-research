# Phase 27: Historical Backfill - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Replay **≥100 tickers × ≥5 years of the technical signal class** through the learning
engine to bootstrap the prior count `N` that Phase 23's lift-gate needs — under
point-in-time discipline, via the **same** feature-extraction path as the live pipeline.

**In scope:** historical OHLCV ingestion (Yahoo), per-trading-window technical-signal
extraction over history, forward-return outcome computation (raw / vs-SPY / sector-relative),
writing backfilled `SentimentSnapshot` + `PriceOutcome` rows tagged `source='backfill'`,
a recompute pass to populate the lift-gate's CV pool, and a live-only promotion gate.

**Out of scope (do NOT build this phase):** backfilling the diffusion/sentiment,
insider, or institutional signal classes (not deterministically reconstructable from
cheap historical data); true delisted-ticker coverage; Phase 23's lift-gate math itself
(this phase only *feeds* it).
</domain>

<decisions>
## Implementation Decisions

### Engine integration / weighting (the core tension)
- **D-01:** Backfilled observations feed the **lift-gate CV pool only (raw / undecayed)** —
  the historical-outcome population that Phase 23's Purged-K-Fold Brier-lift reads.
  They do **NOT** inflate the live, report-facing Bayesian posterior, which keeps Phase
  18's time-decay so current priors stay recent. Because backfill rows are old, Phase
  18 decay already drives their live-posterior weight to ≈0 **naturally** — so the
  `/api/cron/learn` posterior update needs **no special exclusion filter**. Only the
  lift-gate's CV query reads outcomes by **raw membership** (regardless of `source` or
  decay weight). This is the clean train/serve separation and the defensible IS-paper position.

### Data sourcing
- **D-02:** Primary historical vendor = **Yahoo via `yahoo-finance2` `chart()`** (already
  used by `scripts/backfill-technical.ts`). No API key, no hard free-tier rate cap, returns
  full multi-year daily history in a single call. Use Yahoo's **`close` (split-adjusted)**,
  **not `adjclose`** — split-adjusted is correct for technical patterns and avoids
  forward-dividend-adjustment lookahead. *(Switched from Tiingo after discovering no Tiingo
  adapter exists in the codebase despite the ROADMAP 19-B-03 summary — see code_context.)*
- **D-03:** **Survivorship bias is a documented known limitation.** Yahoo returns nothing
  for delisted tickers, so the universe is effectively currently-listed names. This is
  recorded as an explicit caveat in the model card and the IS paper methodology — NOT
  silently ignored. (Truly survivorship-free coverage would require Polygon/paid data —
  deferred.)
- **D-07:** To keep it genuinely "one shot," the CLI **caches each ticker's raw OHLCV to
  local disk on first fetch** so re-runs/recompute read from disk, plus a **light throttle**
  to avoid Yahoo soft-blocks. No multi-hour rate-window waiting (that was the Tiingo-free-tier
  concern, now moot). Expected wall-clock ≈ **15–45 min** for a batched run.

### Universe selection
- **D-04:** Universe = a **curated, versioned, cap-balanced static list** of ~120 tickers
  (a checked-in file, e.g. `src/lib/backtest/universe.ts` or a `.planning` data file).
  Deterministic + reproducible per the CLAUDE.md "single reproducible command" mandate;
  trivially documentable in the paper.
- **D-05:** **Roughly even across the 4 cap-classes** (~30 each large / mid / small / micro)
  so historically-starved cells (esp. micro-cap) get bootstrapped — directly serving the
  lift-gate's need for `N` in under-sampled cells.
- **D-08:** `cap_class` is assigned **as-of the historical date** (not current) — reuse the
  `scripts/backfill-snapshot-cap.ts` as-of snapshotting pattern. (COVERAGE-07)

### Execution / runbook
- **D-06:** **Local one-shot CLI** mirroring `backfill-technical.ts`:
  `npx tsx scripts/backfill-historical.ts` with `--dry-run`, idempotent, **resumable by
  ticker** (a crash 80 tickers in does not restart from zero). Runs off-Vercel (no 300s
  ceiling). Operator triggers `/api/cron/learn` afterward for the recompute pass.
- **Performance lever (Claude's discretion):** fetch each ticker's full history **once**
  (not per-snapshot like the old Yahoo-bound script), and **batch DB writes** (`createMany`,
  ~1k rows/batch) — these two choices are what keep runtime in the 15–45 min range vs hours.

### Promotion gate
- **D-10:** **Hard live-only gate** matching COVERAGE-10 verbatim: a cell may be
  lift-gate-*evaluated* using backfill data but **cannot flip EXPLORATORY→ACTIVE until
  ≥10 live (non-backfill) outcomes confirm the prior**. Backfill alone never graduates a
  cell. Derive `live_outcome_count` as outcomes whose snapshot `source != 'backfill'`.
  Threshold default **10**, configurable in `HYPERPARAMETERS.md`. Gate lives in the
  promotion/status logic read by `/api/cron/learn`.

### Schema & feature path
- **D-09:** Backfilled rows tagged **`source='backfill'`** → requires an **additive
  `SentimentSnapshot.source` column** (Prisma migration, default `'live'` for back-compat;
  this is a `[BLOCKING]` schema-push task). (COVERAGE-09)
- **D-11:** Reuse **`computeTechnicalSnapshot`** (`src/lib/data/technical.ts:180`) as the
  **single feature-extraction path** for both backfill and live — no forked extractor
  (train/serve skew defense). (COVERAGE-08)
- **D-12:** Backfilled `PriceOutcome` rows compute **all three labels** (`pct_change`
  vs-SPY, `forward_return_raw`, `forward_return_sector_rel`) consistent with Phase 21,
  using `src/lib/data/sector-mapping.ts` for the sector-ETF resolution (sector ETF
  snapshotted as-of, never re-resolved).

### Claude's Discretion
- **Snapshot cadence:** default **weekly** historical snapshots (plenty to bootstrap cell
  counts, keeps row volume + runtime modest). Planner may revisit to **daily** if Purged-CV
  folds come out too sparse per cell.
- Disk-cache location/format, batch sizes, throttle interval, exact universe ticker picks,
  and resume-checkpoint mechanism are implementation details for research/planning.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope & requirements
- `.planning/ROADMAP.md` § "Phase 27: Historical Backfill" — boundary, success criteria, COVERAGE mapping
- `.planning/REQUIREMENTS.md` § COVERAGE-06..10 — the five acceptance criteria this phase satisfies

### Statistical methodology (load-bearing — do not violate)
- `CLAUDE.md` § "Load-bearing rules" — esp. **#1** (time-series / Purged-K-Fold CV, never random),
  **#4** (priors regress to base rate), **#6** (feature-leakage audit + as-of timestamps for every
  feature), **#8** (non-LLM baseline). Plus § "Statistical-Methods Reference (CS229 + ISL)" for the
  backtest/eval grounding.

### Prior-phase decisions this phase depends on
- `.planning/phases/16-technical-analysis/16-CONTEXT.md` — technical signal class + pattern definitions
- `.planning/phases/18-time-decayed-bayesian-updates-ess/18-CONTEXT.md` — time-decay + ESS (the D-01 tension)
- `.planning/phases/21-sector-relative-outcome-labels/CONTEXT.md` — sector-relative outcome labels (D-12)

### Reference implementations (read before writing equivalents)
- `scripts/backfill-technical.ts` — **the** one-shot-CLI pattern to mirror (local tsx, `--dry-run`, throttle, off-Vercel rationale)
- `scripts/backfill-snapshot-cap.ts` — `cap_class` as-of snapshotting (D-08)
- `src/lib/data/technical.ts` (`computeTechnicalSnapshot` @ line 180) — single feature path (D-11)
- `src/lib/learning.ts` — cell status/promotion + decay/ESS; live-only gate plugs in here (D-10)
- `src/lib/data/sector-mapping.ts` — sector-ETF resolution for sector-relative labels (D-12)
- `prisma/schema.prisma` — `SentimentSnapshot` (needs additive `source` col), `PriceOutcome`, `LearnedPattern`
- `src/app/api/cron/learn/route.ts` — recompute pass operator triggers after backfill

### Planned (does not exist yet)
- `docs/paper/methodology.md` — destination for the survivorship-bias caveat (D-03) + unadjusted-price methodology note (D-02). Create if absent.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`scripts/backfill-technical.ts`** — proven one-shot local CLI: `dotenv` → Prisma+Neon
  adapter → `yahoo-finance2` `chart()` → `computeTechnicalSnapshot` → write rows; uses
  `--dry-run`, `TECH_THROTTLE_MS`/`PRICE_THROTTLE_MS`. Phase 27's CLI is a scaled, universe-driven
  generalization of this.
- **`computeTechnicalSnapshot`** (`src/lib/data/technical.ts:180`) — the canonical technical
  feature extractor; satisfies COVERAGE-08/D-11 directly (no forking).
- **`scripts/backfill-snapshot-cap.ts`** — as-of `cap_class` assignment to copy for D-08.
- **`src/lib/data/sector-mapping.ts`** — sector-ETF map (XLK/XLF/.../XLRE/XLC + SPY fallback) for D-12.

### Established Patterns
- Heavy backfills run **locally via `npx tsx`**, never inside a Vercel Function (300s ceiling) —
  documented rationale in `backfill-technical.ts` header.
- Prisma migrations are **additive only** (nullable/defaulted columns) — `SentimentSnapshot.source`
  defaults `'live'`.
- `LearnedPattern` cells = `(signal_class × pattern_key × cap_class × horizon_days)`; technical
  cell space ≈ 8 patterns × 4 cap × 6 horizons.

### Integration Points
- Backfill writes `SentimentSnapshot` (+ `technical_data`) and `PriceOutcome` rows → consumed by
  `/api/cron/learn` recompute → `LearnedPattern` posteriors + CV pool.
- Live-only gate reads `source` on snapshots to count non-backfill outcomes per cell (D-10).

### ⚠ Material finding — vendor reality
- **No Tiingo adapter exists.** `src/lib/data/adapters/` contains apewisdom, exa-search,
  hackernews, quiver, reddit, swaggystocks, twelve-data, twitter — **no `tiingo.ts`**, and nothing
  calls `api.tiingo.com`. "tiingo" appears only as a `FieldOrigin` label/precedence comment in
  `merge.ts`/`types.ts`. The ROADMAP 19-B-03 summary claiming a shipped Tiingo adapter is **not
  reflected in the current codebase.** This is why D-02 uses Yahoo (already working) instead.
</code_context>

<specifics>
## Specific Ideas

- Wall-clock target: **15–45 min** for a batched run; the two levers are fetch-once-per-ticker
  + batched `createMany` writes. Naive per-row inserts or per-snapshot fetches blow this to hours.
- Yahoo `close` (split-adjusted, not `adjclose`) is the chosen price series — document the
  split-adjustment retroactivity as a minor methodology caveat alongside survivorship bias.
</specifics>

<deferred>
## Deferred Ideas

- **True delisted-ticker / survivorship-free universe** via Polygon or a paid PIT dataset — only
  if the documented survivorship bias proves material to results. Future phase.
- **Building a real Tiingo EOD adapter** (`src/lib/data/adapters/tiingo.ts`) to reconcile the
  ROADMAP 19-B-03 claim with reality — separate data-layer cleanup, not this phase.
- **Daily-cadence backfill** (vs the weekly default) — fold in here only if CV folds are too sparse;
  otherwise its own tuning pass.
- Backfilling **non-technical** signal classes (diffusion/sentiment/insider/institutional) — out of
  COVERAGE-06 scope (technical signal class only).

None of the above are part of Phase 27 scope.
</deferred>

---

*Phase: 27-historical-backfill*
*Context gathered: 2026-05-26*
