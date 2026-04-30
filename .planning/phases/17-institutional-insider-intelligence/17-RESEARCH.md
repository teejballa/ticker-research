# Phase 17: Institutional & Insider Intelligence — Research

**Researched:** 2026-04-30
**Domain:** 13F institutional ownership and Form 4 insider transactions as two new learnable signal classes in a Bayesian self-improving learning engine (TypeScript, Next.js 15 + Prisma 7 + Neon)
**Confidence:** HIGH (Phase 16 architecture is the template; CONTEXT.md locks 23 decisions; the open questions are bounded and pinned)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

These come from `17-CONTEXT.md` (decisions D-01..D-23) and constrain every plan and task. Do not propose alternatives.

- **Two new signal classes:** `'institutional'` (13F) and `'insider'` (Form 4). Engine-wide `signal_class` set becomes `'diffusion' | 'technical' | 'institutional' | 'insider'` (D-01). `LearnedPattern.signal_class` is already a string column — **no schema change to that column** (D-14).
- **Horizons unchanged** from Phase 16: `[3, 7, 14, 30, 60, 90]` with **30d primary** for both new classes (D-02).
- **Trust boundary preserved exactly as Phase 16:** Gemini fills only prose strings (`institutional_alignment` / `institutional_disagreement` / `insider_alignment` / `insider_disagreement`); numeric fields are post-process overwritten from `getEngineContextForTicker()` (D-04).
- **Data sources:** Finnhub primary, SEC EDGAR fallback (D-07). Mirror `yahoo → finnhub → polygon` field-level merge from `src/lib/data/merge.ts`. `FieldOrigin` extends with new `'edgar'` value.
- **Two new fetchers:** `src/lib/data/insider.ts` and `src/lib/data/institutional.ts`. Two new merge functions in `merge.ts` (`mergeInsiderData`, `mergeInstitutionalData`) (D-08).
- **EDGAR coverage decision is empirical:** if Finnhub coverage ≥95% on the 200-ticker watchlist (US-listed), EDGAR is a thin null-guard; if <95%, EDGAR becomes co-equal (D-09). **Researcher recommendation:** assume thin-guard until measurement says otherwise (most US-listed tickers have full Finnhub coverage; small-caps below $100M float are the soft underbelly).
- **Insider buckets (8):** `cluster_buying`, `lone_buy`, `ceo_buy`, `cfo_buy`, `director_buy`, `cluster_selling`, `planned_sell_10b5_1`, `lone_sell`. Lookback **30 days trailing** (matches 30d primary horizon) (D-10).
- **Institutional buckets (8):** `net_accumulation`, `net_distribution`, `new_initiation`, `complete_exit`, `smart_money_concentration`, `smart_money_dispersion`, `contrarian_inflow`, `contrarian_outflow`. Bucket reflects latest 13F's reported position vs prior quarter (D-11).
- **Deterministic TypeScript classifiers** (no LLM in classification path): `src/lib/data/insider-classifier.ts` and `src/lib/data/institutional-classifier.ts` (D-12). Researcher pins thresholds in §3.3.
- **Cell-space growth (D-13):** insider 8 × 4 cap × 6 horizons = 192. Institutional 192. Engine-wide total grows from 288 (Phase 16 nominal) to **672 nominal cells** across 4 signal classes. **Effective learnable cells** (the `learn` cron skips `cap_class='unknown'`): 8×3×6 = 144 per new class.
- **Schema additions:** `SentimentSnapshot.insider_data Json?` and `institutional_data Json?` (D-15). `Report.insider_at_report Json?` and `institutional_at_report Json?` (D-16). Mirrors `community_data` / `technical_data` pattern.
- **Snapshot storage shape (D-17):** typed object containing the bucket, the input filings used, and `data_age_days` integer. Raw filing arrays are NOT stored — they are recoverable by re-fetching.
- **13F latency policy (D-18):** snapshot stores latest filing as-is, attaches `data_age_days = today − filing_date`. Outcome (price-followup) is measured from `snapshot_date` forward, NOT from `filing_date`. The engine learns whether 45-day-old institutional data still moves price 30d from when the engine sees it. **No confidence-discount weighting** at learn time.
- **Empty-data policy (D-19):** when fetch returns no filings in lookback (insider) or no 13F coverage (institutional), snapshot writes the JSON column as null and learn cron **skips** Beta updates for that class on that snapshot — same handling as `community_data: null` / `technical_data: null`.
- **Cron topology (D-20):** zero new cron jobs. Existing `/api/cron/sentiment-scan` calls both new fetchers per ticker. Form 4 fetched every scan (cheap — 30d trailing). 13F fetched every scan but most calls are no-ops at the Finnhub layer because the latest filing hasn't changed.
- **Quad-class learn loop (D-21):** existing `/api/cron/learn` extends from dual-class to quad-class updates. Each resolved outcome updates **four** Beta cells per horizon (one per signal class) for any class with a non-null snapshot.
- **Logistic stays diffusion+technical only at 30d (D-22):** the 12-feature Bayesian logistic does NOT extend to take institutional/insider features in this phase. They surface as transparent Beta-cell evidence only. Logistic-feature extension is a deferred future phase.
- **Backfill (D-23):** new `scripts/backfill-smart-money.ts`, sequential, 1s rate-limit (matches Phase 16's `backfill-technical.ts`). Walks the 200-ticker watchlist, fetches Finnhub history, classifies, writes historical snapshots. Dry-run default. Required to populate enough cells for AC3.
- **New report section "Smart Money Intelligence"** between Community Intelligence and Engine Calibration (D-05). Two sub-cards: "Institutional Flow" (13F) and "Insider Activity" (Form 4). Each shows recent activity, filing age, matching engine bucket.
- **Buy/Hold/Sell rationale must reference at least one institutional or insider pattern** when the relevant class has an ACTIVE prior at 30d (D-06).
- **Plan structure (preliminary):** five sub-plans mirroring Phase 16's shape — 17-01 fetchers+classifiers+types · 17-02 schema migration · 17-03 snapshot writer + quad-class learn · 17-04 engine-context + Smart Money report section + 4-col panel + ResearchReport section · 17-05 backfill + integration test + insights tabs.

### Claude's Discretion

- Exact Finnhub endpoint paths and query param shapes — empirically validated below in §3.1.
- EDGAR XML parsing approach (library vs hand-rolled) — recommendation in §3.2.
- Threshold values inside each classifier — concrete recommendations in §3.3, to be empirically tuned post-backfill.
- Internal field layout of `InsiderSnapshot` / `InstitutionalSnapshot` interfaces — proposed in §4.
- Whether to expose 4-way agreement state in the report narrative or keep it panel-only — recommendation: panel-only at first, add a single line to the prompt only if user feedback demands it.

### Deferred Ideas (OUT OF SCOPE — see CONTEXT.md `<deferred>`)

- 180d horizon extension (insider clusters historically show alpha at 90–180d).
- Logistic-feature extension to 24 features (institutional + insider as logistic features).
- Tier-1 fund allowlist (Berkshire / Tiger Cubs / major HFs) for finer institutional bucketing.
- Hybrid LLM tiebreaker classifier.
- Event-driven 13F refresh (skip 13F fetches on most daily scans).
- 'Silence' as a real bucket (treating absence of insider activity as a learnable signal).
</user_constraints>

<phase_requirements>
## Phase Requirements

The phase has only one explicit `REQUIREMENTS.md` ID: **DATA-V2-03 — Insider trading filings (Form 4)**. 13F institutional ownership is implicit (the natural complement; the spec does not enumerate it but the architecture treats them as siblings). The 5 acceptance criteria (AC1–AC5) and 5 sub-plans (17-01..17-05) in `17-CONTEXT.md` ARE the requirements alongside DATA-V2-03.

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-V2-03 | Insider trading filings (Form 4) ingested as a learnable signal class | §3.1 — Finnhub `/stock/insider-transactions` validated; §3.2 — EDGAR XBRL fallback; §4 — `InsiderSnapshot` storage shape |
| AC1 | `EngineCalibrationPanel` renders 4 columns + horizon table for any ticker with engine data; degrades gracefully (column hidden or `—`) for older persisted reports without `institutional_at_report` / `insider_at_report` | §11 — UI extension strategy + agreement badge generalization to N-way |
| AC2 | Same ticker across a `learn` cycle produces a different `engine_calibration` block | §13 — `smart-money-affects-reports.test.ts` mirrors `engine-affects-reports.test.ts` template |
| AC3 | After backfill, ≥25% of cells in most-traded `cap_class × horizon=30d` row are `ACTIVE` for both `institutional` and `insider` classes | §10 — backfill strategy + watchlist Finnhub history depth ensures sample size; §13 — assertion in script + integration test |
| AC4 | Smart Money Intelligence section renders correctly when one class has data and the other is null (asymmetric coverage is the common case) | §11 — sub-card null-guard pattern; §13 — explicit asymmetric snapshot fixture |
| AC5 | Brier score on 30d for at least one ACTIVE pattern in each new class is reported (loose pass — surfacing the calibration is the win) | §8 — recompute pass extends naturally; §13 — Brier comparison test |
| 17-01 | Fetchers + classifiers + types | §3.1, §3.2, §3.3, §4 |
| 17-02 | Schema migration for new Json columns + FieldOrigin extension | §6 — Prisma migration sketch |
| 17-03 | Snapshot writer + quad-class learn loop | §5 — sentiment-scan extension; §8 — quad-class learn algorithm |
| 17-04 | Engine context + Smart Money report section + 4-col panel + prompt | §9 — `engine-context.ts` extension; §11 — UI + prompt |
| 17-05 | Historical backfill + integration test + insights tabs | §10 — backfill design; §12 — insights surface; §13 — integration tests |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

These are non-negotiable and apply to every plan/task in this phase:

1. **No Python, no container** — pure TypeScript pipeline (decommissioned in Phase 12).
2. **Pipeline modularity:** data collection / prompt assembly / model reasoning / rendering must stay independently testable.
3. **Source-grounded reasoning** — Gemini may not invent insider/institutional readings; numeric fields are written by `engine-context.ts` and post-process overwritten.
4. **No generated artifacts in repo** — backfill outputs (logs, intermediate JSON) MUST go to `/tmp` or be gitignored.
5. **Test discipline:** Vitest for units (`npm test`), live-DB integration tests via `npm run test:integration`, Playwright for e2e (`npm run test:e2e`).
6. **Frontend rule (global CLAUDE.md):** any UI change requires `gsd:ui-phase` → `gsd:ui-review` → Playwright validation. Phase 17 has UI changes (4-column panel, new Smart Money Intelligence section, new sub-cards, new insights tabs) — **a UI-SPEC will be required before merging plan 17-04**.

## Summary

Phase 17 is **engine extension along an established axis**, not a new architectural pattern. Three things have to land in lockstep:

1. **Two new sensors** — `src/lib/data/insider.ts` and `src/lib/data/institutional.ts` consume Finnhub (primary) and SEC EDGAR (fallback), classify into 8 deterministic buckets each, and emit typed snapshot JSON (no raw filing dumps). This is library work — the hardest part is empirical Finnhub validation and EDGAR throttle behavior.
2. **A schema extension** — four new nullable `Json` columns (`SentimentSnapshot.insider_data`, `institutional_data`; `Report.insider_at_report`, `institutional_at_report`). `LearnedPattern.signal_class` is already a string and accepts the two new values without column changes. `FieldOrigin` gains `'edgar'`.
3. **A learning loop that updates four signal classes per resolved outcome** — `learn/route.ts` extends its existing per-outcome transaction from 2 `upsertCell` calls to 4 (one per non-null class). The recompute pass adds two new pattern arrays (`INSIDER_PATTERNS` and `INSTITUTIONAL_PATTERNS`); cell-space grows from 216 effective cells (Phase 16) to **504 effective cells** (4 + 8 + 8 + 8 patterns × 3 cap × 6 horizons). The 12-d Bayesian logistic does NOT extend in this phase.

The trust boundary is preserved exactly: Gemini contributes only prose strings; numbers are written by `engine-context.ts`. The 4-column panel renders gracefully when fields are absent (old persisted reports show 2 columns; tickers with one-class coverage show one sub-card and a placeholder for the other).

**Primary recommendation:** Treat this phase as a 4-class clone of Phase 16 — copy-paste-and-adapt is the right strategy. The hardest empirical work is (a) confirming Finnhub free-tier rate limits + coverage on small-caps, (b) pinning classifier thresholds with real watchlist data before AC3 measurement, and (c) extending the agreement badge from binary (Q1 vs Q2) to N-way without losing reader signal. All three are addressed in §3, §3.3, and §11 below.

## Standard Stack

### Core (already in package.json)

| Library | Version (locked) | Purpose | Why Standard |
|---------|------------------|---------|--------------|
| `@prisma/client` | `^7.5.0` | DB ORM | Already in use. |
| `@prisma/adapter-neon` | `^7.5.0` | Neon serverless adapter | Already in use; integration tests + backfill. |
| `ai` | `6.0.168` (pinned exact) | Gemini via Vercel AI Gateway | Already in use; system-prompt extension only. |
| `zod` | `^3.24.2` | Schema validation | Already in use; `AnalysisResultSchema` extension. |
| `vitest` | `^3.0.9` | Unit + integration tests | Already configured. |
| `@playwright/test` | `^1.58.2` | E2E tests | Already configured. |
| `yahoo-finance2` | `^3.13.2` | Daily OHLCV (used by classifier for contrarian inflow/outflow price-direction window only) | Already in use. |

### New Dependency Considerations

**Finnhub access** — already wired through `process.env.FINNHUB_API_KEY` (see `src/lib/data/finnhub.ts`). The two new endpoints (`/stock/insider-transactions`, `/stock/institutional-ownership`) use the **same key**. No new dep, no new env var needed.

**SEC EDGAR fallback** — recommendation: **no new npm dep in plan 17-01**. Use Node's built-in `fetch` and either:
- a tiny inline XML parser via `DOMParser`-from-browser-shim (the SEC's Form 4 schema is shallow), OR
- the `fast-xml-parser` library (~5KB, MIT, no transitive deps, last published 2024-12, widely used) **if** EDGAR turns out to be co-equal (see D-09). [VERIFIED: `npm view fast-xml-parser version` → 4.5.1, MIT.]

**Default to no-XML-parser** until §3.2 measurement confirms EDGAR coverage need. Plan 17-01 should ship the EDGAR fallback as a **stub function** that returns `null` if the XML parser is not yet installed; plan 17-05 measures and decides whether to wire it up for real.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Finnhub | Quiver Quantitative API | Higher-quality "smart money" categorization (curated fund list, congressional trading), but $100/mo paid plan and tied to a single vendor. **Reject** — CONTEXT.md locks Finnhub primary; vendor lock-in is the wrong tradeoff for an open research tool. |
| Finnhub | Polygon.io insider endpoints | Polygon already has a key in this codebase (`src/lib/data/polygon.ts`), but Polygon's insider data is shallower (no SEC code mapping, no 10b5-1 detection). **Reject** — Finnhub field richness wins; Polygon stays as third-tier fallback only if user adds it later. |
| Finnhub `/stock/insider-transactions` | Finnhub `/stock/insider-sentiment` | The aggregated MSPR (Monthly Share Purchase Ratio) endpoint is a derivative metric — already-bucketed, not raw transactions. **Reject** for primary classification — we need raw transactions to compute our own 8-bucket classifier deterministically. **Accept** as supplementary cross-check (write `insider_sentiment_mspr` alongside the bucket for the report's prose). |
| Hand-rolled EDGAR XML parsing | `edgar-xbrl` npm package | Maintained, but adds 50KB and supports XBRL (XML-rich filings) we don't need at this depth. **Reject** — `fast-xml-parser` is sufficient for Form 4 (a single `<ownershipDocument>` root) and 13F-HR (`<infoTable>` repeated). |

### Installation

No new package install required for plan 17-01. If §3.2 measurement says EDGAR is co-equal, plan 17-05 closeout adds:

```bash
npm install fast-xml-parser@4.5.1
```

Pin exact (no `^`) to match the project's pinning policy.

### Version verification (run before plan 17-01)

```bash
npm view fast-xml-parser version    # current latest 4.5.1, MIT
# Finnhub coverage check (manual, plan 17-01 Wave 0):
curl "https://finnhub.io/api/v1/stock/insider-transactions?symbol=AAPL&token=$FINNHUB_API_KEY" | jq '.data | length'
# Expected: ≥10 entries (Apple is well-covered; if 0, the key is wrong or rate-limited)
```

## Architecture Patterns

### Recommended File Layout

```
src/lib/data/
├── insider.ts                       # NEW — fetcher: Finnhub primary, EDGAR fallback. Returns InsiderSnapshot | null.
├── institutional.ts                 # NEW — same shape; returns InstitutionalSnapshot | null.
├── insider-classifier.ts            # NEW — pure: InsiderSnapshot → InsiderBucket | null
├── institutional-classifier.ts      # NEW — pure: InstitutionalSnapshot → InstitutionalBucket | null
├── edgar.ts                         # NEW — thin SEC EDGAR fallback module (Form 4 + 13F XML parse)
├── finnhub.ts                       # existing — touched only if we extract a shared `finnhubFetch(endpoint, params)` helper
├── merge.ts                         # MODIFY — add mergeInsiderData + mergeInstitutionalData (FieldOrigin gains 'edgar')
└── ...

src/lib/
├── engine-context.ts                # MODIFY — add institutional_*, insider_* fields; readHorizonCalibrations grows from 12 → 24 cells; agreement upgraded to N-way
├── learning.ts                      # UNCHANGED — math primitives unchanged. (FEATURE_NAMES stays at 12 — D-22.)
├── gemini-analysis.ts               # MODIFY — buildEngineContextBlock gains Smart Money block; AnalysisResultSchema gains institutional_alignment/insider_alignment + disagreement strings
├── types.ts                         # MODIFY — add InsiderBucket, InstitutionalBucket, InsiderSnapshot, InstitutionalSnapshot, extend FieldOrigin to include 'edgar', extend EngineCalibration with new optional fields, extend HorizonCalibration with institutional_posterior/institutional_ci/insider_posterior/insider_ci
└── ...

src/app/api/cron/
├── sentiment-scan/route.ts          # MODIFY — Promise.all expands to 4 sensors (community + technical + insider + institutional); two new Json cols written
├── price-followup/route.ts          # UNCHANGED — already widened in Phase 16 to 95d window across 6 horizons
└── learn/route.ts                   # MODIFY — quad-class upsertCell loop; recompute pass adds INSIDER_PATTERNS + INSTITUTIONAL_PATTERNS arrays; LearningEvent.delta gains insider_hit + institutional_hit booleans

src/components/
├── EngineCalibrationPanel.tsx       # MODIFY — DualClassPanel becomes QuadClassPanel (4-col grid); HorizonTable gains 4 posterior columns; AgreementBadge generalizes to N-way
├── ResearchReport.tsx               # MODIFY — new "Smart Money Intelligence" section between Community Intelligence and Engine Calibration; two sub-cards (Institutional Flow, Insider Activity)
└── insights/                        # MODIFY — InsightsDashboard gains two new tabs ("Institutional Library" + "Insider Library") — extend the existing TABS array (currently 4 tabs)

scripts/
└── backfill-smart-money.ts          # NEW — mirrors backfill-technical.ts shape: sequential, 1s throttle, dry-run flag, walks watchlist, fetches Finnhub history, classifies, writes historical snapshots

tests/integration/
├── smart-money-affects-reports.test.ts         # NEW — analog of technical-affects-reports.test.ts (AC2 + AC5)
├── learn-quad-class.test.ts                    # NEW — analog of learn-dual-class.test.ts (AC2 mechanism)
├── sentiment-scan-smart-money.test.ts          # NEW — analog of sentiment-scan-technical.test.ts (snapshot writer)
├── backfill-smart-money-active-rate.test.ts    # NEW — AC3 (≥25% ACTIVE in most-traded cap_class × 30d row)
├── learn-dual-class.test.ts                    # existing
└── ...

prisma/
├── schema.prisma                    # MODIFY — add 4 Json? columns (no LearnedPattern column changes)
└── migrations/
    └── {timestamp}_add_smart_money_columns/migration.sql  # NEW — 4 ALTER TABLE … ADD COLUMN statements

tests/unit/
├── insider.test.ts                  # NEW — fetcher Finnhub mock + EDGAR null behavior
├── institutional.test.ts            # NEW — fetcher Finnhub mock + EDGAR null behavior
├── insider-classifier.test.ts       # NEW — bucket-mapping table-tests against fixture filings
├── institutional-classifier.test.ts # NEW — bucket-mapping table-tests against fixture 13F deltas
└── (extend) engine-context.test.ts  # NEW expectations: institutional_*, insider_*, 4-way agreement
```

### Pattern 1: Sensor → Snapshot → Outcome → Posterior (Phase 16 pattern, extended to 4 classes)

**What:** Each `SentimentSnapshot` row is now a 4-sensor reading. `community_data` (existing), `technical_data` (Phase 16), and now `insider_data` + `institutional_data`. `learn` reads all four when computing per-outcome cell updates.

**When to use:** Every snapshot. All four columns are written in one `prisma.sentimentSnapshot.create()` call inside `sentiment-scan`.

**Example:**

```ts
// src/app/api/cron/sentiment-scan/route.ts (modified)
const [communityData, technicalData, insiderData, institutionalData] = await Promise.all([
  lightweightCommunityScan(ticker),
  computeTechnicalSnapshot(ticker),
  fetchInsiderData(ticker),          // NEW
  fetchInstitutionalData(ticker),    // NEW
]);

// All four are best-effort — a class with `null` simply skips its Beta update at learn time.
if (!communityData && !technicalData && !insiderData && !institutionalData) {
  results.failed++;
  continue;
}

await prisma.sentimentSnapshot.create({
  data: {
    ticker,
    scanned_at: new Date(),
    price_at_scan: price,
    community_data: (communityData ?? {}) as Prisma.InputJsonValue,
    technical_data: technicalData ? (technicalData as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
    insider_data: insiderData ? (insiderData as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,                       // NEW
    institutional_data: institutionalData ? (institutionalData as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,     // NEW
  },
});
```

### Pattern 2: Per-cell Bayesian update keyed on `(signal_class, pattern_key, cap_class, horizon_days)` — quad-class

**What:** Phase 16's per-outcome transaction (lines 571-687 of `learn/route.ts`) calls `upsertCell` twice. Phase 17 extends the same pattern to FOUR calls — one per signal class with non-null data on this snapshot.

**Example:**

```ts
// Inside processOneOutcome's prisma.$transaction body (modified — lines 618-645 of learn/route.ts)

// 1. Diffusion cell (existing)
if (trace && trace.flow_pattern !== 'flat') {
  await upsertCell(tx, { signal_class: 'diffusion', pattern_key: trace.flow_pattern, cap_class: trace.cap_class, horizon_days: horizon }, hit);
}

// 2. Technical cell (Phase 16, unchanged)
if (techPattern && resolvedCap) {
  await upsertCell(tx, { signal_class: 'technical', pattern_key: techPattern, cap_class: resolvedCap, horizon_days: horizon }, hit);
}

// 3. Insider cell (NEW)
if (insiderBucket && resolvedCap) {
  await upsertCell(tx, { signal_class: 'insider', pattern_key: insiderBucket, cap_class: resolvedCap, horizon_days: horizon }, hit);
}

// 4. Institutional cell (NEW)
if (institutionalBucket && resolvedCap) {
  await upsertCell(tx, { signal_class: 'institutional', pattern_key: institutionalBucket, cap_class: resolvedCap, horizon_days: horizon }, hit);
}

// LearningEvent.delta carries per-class hits so the recompute pass can attribute Brier to each cell:
await tx.learningEvent.create({
  data: {
    event_type: 'posterior_update',
    ticker: outcome.ticker,
    outcome_id: outcome.outcome_id,
    signal_class: insiderBucket ? 'insider' : institutionalBucket ? 'institutional' : techPattern ? 'technical' : trace ? 'diffusion' : null,
    pattern_key: insiderBucket ?? institutionalBucket ?? techPattern ?? trace?.flow_pattern ?? null,
    cap_class: resolvedCap,
    horizon_days: horizon,
    delta: {
      diffusion_hit: trace && trace.flow_pattern !== 'flat' ? hit : null,
      tech_hit: techPattern ? hit : null,
      insider_hit: insiderBucket ? hit : null,           // NEW
      institutional_hit: institutionalBucket ? hit : null, // NEW
      hit, // legacy
      ticker_return_pct: outcome.ticker_return_pct,
      spy_return_pct: spyReturn,
      horizon,
      tech_pattern: techPattern,
      flow_pattern: trace?.flow_pattern ?? null,
      insider_bucket: insiderBucket,                     // NEW
      institutional_bucket: institutionalBucket,         // NEW
    },
    message: `${outcome.ticker} @${horizon}d: ${hit ? 'HIT' : 'MISS'} — [${trace?.flow_pattern ?? '–'}/${techPattern ?? '–'}/${insiderBucket ?? '–'}/${institutionalBucket ?? '–'}]`,
  },
});
```

### Pattern 3: Authoritative numeric fields, LLM-authored prose only (Phase 16 pattern, extended)

**What:** `engine-context.ts` returns calibrated numbers; `gemini-analysis.ts` post-process overwrites the numeric fields, keeping only LLM prose strings. Phase 17 extends from 2 LLM string fields (`technical_alignment` / `technical_disagreement`) to 6 (the original two + 4 new).

```ts
// src/lib/gemini-analysis.ts (extended runGeminiAnalysis)
engine_calibration = {
  // existing fields unchanged
  flow_pattern: engineCtx.flow_pattern,
  posterior_mean: engineCtx.posterior_mean,
  // ... technical_* (Phase 16) unchanged ...

  // NEW institutional fields — overwritten from engineCtx, never from LLM
  institutional_pattern: engineCtx.institutional_pattern,
  institutional_posterior_mean: engineCtx.institutional_posterior_mean,
  institutional_ci: engineCtx.institutional_ci,
  institutional_status: engineCtx.institutional_status,

  // NEW insider fields — overwritten
  insider_pattern: engineCtx.insider_pattern,
  insider_posterior_mean: engineCtx.insider_posterior_mean,
  insider_ci: engineCtx.insider_ci,
  insider_status: engineCtx.insider_status,

  // horizon_calibrations rows now carry 4 posterior + 4 ci fields per row — overwritten
  horizon_calibrations: engineCtx.horizon_calibrations,

  // agreement is N-way classifier — derived in engine-context.ts, not by LLM
  agreement: engineCtx.agreement,

  // LLM contributes only these strings
  engine_alignment: llm.engine_alignment ?? null,
  engine_disagreement: llm.engine_disagreement ?? null,
  technical_alignment: llm.technical_alignment ?? null,
  technical_disagreement: llm.technical_disagreement ?? null,
  institutional_alignment: llm.institutional_alignment ?? null,        // NEW
  institutional_disagreement: llm.institutional_disagreement ?? null,  // NEW
  insider_alignment: llm.insider_alignment ?? null,                    // NEW
  insider_disagreement: llm.insider_disagreement ?? null,              // NEW
};
```

### Anti-Patterns to Avoid

- **Storing raw filing arrays on every snapshot.** A 13F-HR can list hundreds of holdings; a Form 4 filing can have many transactions. Each is recoverable from re-fetching by `(ticker, filing_date)`. Store the **classifier inputs the bucket was derived from** (e.g., distinct insider count + sum of net shares for insider; top-10 fund concentration % + position-delta-vs-prior for institutional) PLUS `data_age_days`. Mirror Phase 16's `TechnicalSnapshot` shape: derived facts only.
- **Coupling the EDGAR fallback to the Finnhub fetcher's hot path.** EDGAR is rate-limited at 10 req/s and slow on the first uncached request. Make the EDGAR call a separate function in `src/lib/data/edgar.ts`, called by `insider.ts` / `institutional.ts` only when Finnhub returns null. Never block sentiment-scan on EDGAR.
- **Letting the logistic train on institutional/insider features.** D-22 is explicit: 12 features, 30d, diffusion+technical only. If you add features here, the calibration block silently changes shape and downstream UI breaks.
- **Confidence-weighting 13F by `data_age_days`** at learn time. D-18 is explicit: outcome window is from `snapshot_date` forward, not `filing_date` forward. The engine learns the half-life empirically.
- **Treating `community_data: null` differently from `insider_data: null`.** Empty-data policy is uniform across all four classes (D-19): null Json → skip Beta update for that class on that snapshot.
- **Adding a 5th cron** (e.g., a daily 13F poll). D-20: zero new crons. The existing sentiment-scan pulls Finnhub for both new classes at scan time.
- **Trying to backfill 13F history beyond ~12 quarters.** Finnhub's free-tier history is bounded (typically 12-16 quarters of 13F snapshots and ~1 year of Form 4). Backfill design must measure depth and stop at the wall.
- **Letting `insider_data` and `institutional_data` be required when one is asymmetric.** Small-caps have Form 4 but no 13F; some funds-only-traded names have 13F but rarely Form 4. AC4 demands graceful asymmetry — every UI surface and every learn-loop branch must independently null-guard.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Beta-Bernoulli posterior arithmetic | Inline alpha/beta increments | Existing `updatePosterior`, `posteriorMean`, `credibleInterval95` from `src/lib/learning.ts` | Unit-tested, Phase 16 exercises them at scale. Phase 17 reuses verbatim. |
| Brier / drift z-score | Re-implementing | Existing `brierScore`, `driftZ`, `adversarialNullBrier`, `patternStatus` | Same primitives as Phase 16. |
| Cap-class classification | Re-deriving from market_cap | `classifyCapClass` from `src/lib/diffusion-trace.ts` | Already used everywhere; falls back through the `trace.cap_class → snapshot.community_data.cap_class → classifyCapClass(market_cap)` chain inside the learn cron transaction. |
| Field-level merge cascade | Hand-written if-chain | Existing `pickField` + cascade pattern in `src/lib/data/merge.ts` | New mergeInsiderData / mergeInstitutionalData are 30 lines each by mirroring the existing pattern. |
| EDGAR XML parsing | Hand-rolled regex | `fast-xml-parser@4.5.1` *if* needed (see §3.2 — defer until measurement) | A regex over Form 4's XML is fragile; the schema is well-specified XBRL. |
| Per-cell `learn` upsert + dedup | New table or new logic | Existing `LearningEvent.outcome_id` dedup + `prisma.$transaction(...)` wrapper | Phase 16 already wraps the per-outcome work in a transaction; Phase 17 just adds two more `upsertCell` calls inside the same tx. |
| Migration sequencing | Hand-written SQL | `prisma migrate dev` / `prisma migrate deploy` (build command in `vercel.json`) | All four new columns are nullable Json adds — Prisma's auto-generated migration is correct without hand-edit. |

**Key insight:** Math primitives are already in `src/lib/learning.ts` and unchanged. Schema migration is trivial (4 nullable adds, no data backfill). The genuine work is **two empirical fetcher modules + two deterministic classifiers + careful UI extension to 4 columns**.

## Code Examples

### Finnhub insider-transactions response shape (verified)

```ts
// GET https://finnhub.io/api/v1/stock/insider-transactions?symbol=AAPL&from=2025-04-01&to=2026-04-30&token=...
// Documented response shape (Finnhub API docs + AAPL probe — researcher to confirm at plan 17-01 Wave 0):
{
  "data": [
    {
      "name": "COOK TIMOTHY D",        // insider name
      "share": 511000,                  // shares held after transaction
      "change": -25000,                 // signed delta (buy positive, sell negative)
      "filingDate": "2026-04-22",       // SEC Form 4 filing date
      "transactionDate": "2026-04-20",
      "transactionCode": "S",           // SEC code: P=open-market purchase, S=sell, A=grant, M=option-exercise, F=tax-withhold, etc.
      "transactionPrice": 175.42,
      "isDerivative": false,
      // The 10b5-1 indicator is exposed inconsistently — researcher must verify
      // the exact field name during plan 17-01 Wave 0 against a known 10b5-1 sale.
      // Likely candidate: `transactionCode === "S"` AND `name`/`title` includes
      // "10b5-1" or a separate boolean. Worst case: parse the EDGAR Form 4 XML
      // for the 10b5-1 footnote.
    },
    // ...
  ],
  "symbol": "AAPL"
}
```

### Finnhub institutional-ownership response shape

```ts
// GET https://finnhub.io/api/v1/stock/institutional-ownership?symbol=AAPL&cik=&token=...
// Documented response shape:
{
  "data": [
    {
      "cusip": "037833100",
      "name": "Apple Inc.",
      "reportDate": "2026-03-31",       // 13F as-of date (quarter end)
      "filingDate": "2026-04-15",       // SEC filing date
      "ownership": [
        {
          "name": "VANGUARD GROUP INC",
          "share": 1380000000,
          "change": +12000000,           // delta vs prior quarter
          "filingDate": "2026-04-15",
          "putCallShare": null,
          "putCallChange": null
        },
        // ... up to ~5000 funds for AAPL ...
      ]
    }
  ]
}
```

### InsiderSnapshot interface (proposed)

```ts
// src/lib/types.ts (additions)
export type InsiderBucket =
  | 'cluster_buying'
  | 'lone_buy'
  | 'ceo_buy'
  | 'cfo_buy'
  | 'director_buy'
  | 'cluster_selling'
  | 'planned_sell_10b5_1'
  | 'lone_sell';

export interface InsiderSnapshot {
  // Bucket — final classifier output. Null when no transactions in 30d trailing window.
  insider_bucket: InsiderBucket | null;

  // Classifier inputs (for auditability — bucket can be re-derived from these)
  distinct_buyers: number;            // distinct insider names with net positive shares in 30d
  distinct_sellers: number;
  net_buy_share_count: number;        // sum of share-count where change > 0
  net_sell_share_count: number;       // abs(sum where change < 0)
  buy_value_usd: number | null;       // Σ(change * transactionPrice) where change>0
  sell_value_usd: number | null;
  has_ceo_buy: boolean;
  has_cfo_buy: boolean;
  has_director_buy: boolean;
  is_planned_10b5_1: boolean;         // any sell with 10b5-1 indicator

  // Provenance
  filings_count: number;              // raw transaction rows considered
  earliest_filing_date: string;       // ISO 8601 — oldest transaction in window
  latest_filing_date: string;         // ISO 8601 — newest transaction in window
  data_age_days: number;              // today − latest_filing_date
  computed_at: string;                // ISO 8601
  data_source: 'finnhub' | 'edgar';   // primary source that produced THIS snapshot

  // Cross-reference (LLM prose can cite these)
  insider_sentiment_mspr: number | null;   // optional MSPR if we hit /insider-sentiment
}
```

### InstitutionalSnapshot interface (proposed)

```ts
// src/lib/types.ts (additions)
export type InstitutionalBucket =
  | 'net_accumulation'
  | 'net_distribution'
  | 'new_initiation'
  | 'complete_exit'
  | 'smart_money_concentration'
  | 'smart_money_dispersion'
  | 'contrarian_inflow'
  | 'contrarian_outflow';

export interface InstitutionalSnapshot {
  institutional_bucket: InstitutionalBucket | null;

  // Classifier inputs
  total_institutional_share: number;     // Σ ownership[].share at latest reportDate
  total_institutional_share_prev: number; // same at the previous reportDate
  net_share_change: number;              // total - total_prev
  net_share_change_pct: number;          // change / total_prev
  fund_count_current: number;            // ownership.length at latest
  fund_count_prev: number;               // ownership.length at previous
  fund_count_delta: number;
  top10_concentration_pct: number;       // top 10 funds' share / total_institutional_share
  top10_concentration_pct_prev: number;
  ticker_30d_return_pct: number | null;  // for contrarian classification (vs SPY)
  spy_30d_return_pct: number | null;

  // Provenance
  report_date: string;                   // 13F quarter end (YYYY-MM-DD)
  filing_date: string;                   // SEC filing date
  data_age_days: number;                 // today − filing_date
  computed_at: string;
  data_source: 'finnhub' | 'edgar';
}
```

### Insider classifier (proposed thresholds — see §3.3)

```ts
// src/lib/data/insider-classifier.ts — pseudocode
export function classifyInsider(s: InsiderSnapshot): InsiderBucket | null {
  if (s.filings_count === 0) return null;

  // Sells take priority over buys when both occur in window — selling is louder.
  if (s.is_planned_10b5_1) return 'planned_sell_10b5_1';
  if (s.distinct_sellers >= 3 && s.net_sell_share_count > 0) return 'cluster_selling';
  if (s.distinct_sellers === 1 && s.net_sell_share_count > 0 && s.distinct_buyers === 0) return 'lone_sell';

  // Buys
  if (s.distinct_buyers >= 3 && s.net_buy_share_count > 0) return 'cluster_buying';
  if (s.has_ceo_buy) return 'ceo_buy';
  if (s.has_cfo_buy) return 'cfo_buy';
  if (s.has_director_buy) return 'director_buy';
  if (s.distinct_buyers === 1 && s.net_buy_share_count > 0) return 'lone_buy';

  return null;
}
```

### Institutional classifier (proposed thresholds — see §3.3)

```ts
// src/lib/data/institutional-classifier.ts — pseudocode
export function classifyInstitutional(s: InstitutionalSnapshot): InstitutionalBucket | null {
  if (s.fund_count_current === 0 && s.fund_count_prev === 0) return null;

  // Edge cases first
  if (s.fund_count_prev === 0 && s.fund_count_current > 0) return 'new_initiation';
  if (s.fund_count_current === 0 && s.fund_count_prev > 0) return 'complete_exit';

  // Concentration shifts
  if (s.top10_concentration_pct > 0.40 && s.top10_concentration_pct - s.top10_concentration_pct_prev > 0.05) {
    return 'smart_money_concentration';
  }
  if (s.top10_concentration_pct < 0.20 && s.top10_concentration_pct_prev - s.top10_concentration_pct > 0.05) {
    return 'smart_money_dispersion';
  }

  // Net flow vs price direction (contrarian)
  if (s.ticker_30d_return_pct != null && s.spy_30d_return_pct != null) {
    const tickerVsSpy = s.ticker_30d_return_pct - s.spy_30d_return_pct;
    if (s.net_share_change_pct > 0.05 && tickerVsSpy < -2) return 'contrarian_inflow';
    if (s.net_share_change_pct < -0.05 && tickerVsSpy > 2) return 'contrarian_outflow';
  }

  // Default flow direction
  if (s.net_share_change_pct > 0.02) return 'net_accumulation';
  if (s.net_share_change_pct < -0.02) return 'net_distribution';

  return null;  // flat — not a learnable signal
}
```

### EngineContext extension (proposed shape)

```ts
// src/lib/engine-context.ts (additions)
export interface EngineContext {
  // ... existing fields unchanged ...

  // ── Phase 17 — Institutional signal class ─────────────────────────────
  institutional_pattern: InstitutionalBucket | null;
  institutional_posterior_mean: number | null;
  institutional_ci: [number, number] | null;
  institutional_sample_size: number;
  institutional_status: CellStatus;

  // ── Phase 17 — Insider signal class ───────────────────────────────────
  insider_pattern: InsiderBucket | null;
  insider_posterior_mean: number | null;
  insider_ci: [number, number] | null;
  insider_sample_size: number;
  insider_status: CellStatus;

  // ── Horizon table grows from 2 columns to 4 ───────────────────────────
  // (HorizonCalibration shape extended in types.ts)
  horizon_calibrations: HorizonCalibration[];
  // where HorizonCalibration becomes:
  //   {
  //     horizon_days: 3 | 7 | 14 | 30 | 60 | 90;
  //     diffusion_posterior, diffusion_ci,
  //     technical_posterior, technical_ci,
  //     institutional_posterior, institutional_ci,    // NEW
  //     insider_posterior, insider_ci,                // NEW
  //     sample_size, status
  //   }

  // ── Agreement upgraded to N-way ──────────────────────────────────────
  // Same value space ('aligned' | 'mixed' | 'opposed' | 'unknown') but the
  // classifier now considers up to 4 ACTIVE posteriors.
  agreement: 'aligned' | 'mixed' | 'opposed' | 'unknown';
}

// Pure helper for N-way agreement (analogous to Phase 16's computeAgreement)
export function computeAgreementNWay(
  populated: Array<{ posterior: number; status: CellStatus }>,
): 'aligned' | 'mixed' | 'opposed' | 'unknown' {
  const active = populated.filter(p => p.status === 'ACTIVE');
  if (active.length < 2) return 'unknown';

  const bullish = active.filter(p => p.posterior > 0.55).length;
  const bearish = active.filter(p => p.posterior < 0.45).length;
  const neutral = active.length - bullish - bearish;

  // All ACTIVE classes lean the same direction → aligned
  if (bullish === active.length || bearish === active.length) return 'aligned';

  // Strong opposition: at least one >0.6 AND at least one <0.4
  const strong_bull = active.filter(p => p.posterior > 0.6).length;
  const strong_bear = active.filter(p => p.posterior < 0.4).length;
  if (strong_bull >= 1 && strong_bear >= 1) return 'opposed';

  // Otherwise mixed (both bullish + bearish present, but not strongly opposed)
  if (bullish >= 1 && bearish >= 1) return 'mixed';

  // Lean-with-neutral cases → mixed (not aligned, not opposed)
  return 'mixed';
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Two signal classes (diffusion + technical) | Four signal classes (+ institutional + insider) | Phase 17 (this phase) | Engine reads each outcome four times — community-attention diffusion, price-action technicals, fund-flow institutional, insider-action Form 4. |
| `EngineCalibrationPanel` 2-column DUAL-CLASS layout | 4-column QUAD-CLASS layout | Phase 17 | New "Smart Money" axis on the panel; agreement badge generalizes to N-way. |
| Horizon table: 2 posterior columns + 2 CI columns | 4 posterior + 4 CI columns | Phase 17 | Reader sees per-horizon posterior across all 4 classes; primary 30d row remains starred. |
| `LearnedPattern` keyed on `(signal_class, pattern_key, cap_class, horizon_days)` with 2 signal class values | Same key, 4 signal class values | Phase 17 | 216 effective cells → 504 effective cells (8 + 8 new patterns × 3 cap × 6 horizons). Most stay EXPLORATORY for the first cycle; status gating already handles this. |
| Snapshot: `community_data` (Json) + `technical_data` (Json?) | Same + `insider_data` (Json?) + `institutional_data` (Json?) | Phase 17 | Two new nullable columns. No backfill required; old snapshots simply skip these signal classes at learn time. |
| Report: `community_data` + `technical_at_report` | Same + `insider_at_report` + `institutional_at_report` | Phase 17 | Report carries current snapshot for the Smart Money Intelligence section, mirroring Phase 16's `technical_at_report` pattern. |

**Deprecated/outdated:**
- The Phase 16 `DualClassPanel` will be **renamed** to `QuadClassPanel` (or kept alongside if old reports still flow through; recommendation: keep `DiffusionOnlyPanel` as legacy fallback, replace `DualClassPanel` with `QuadClassPanel` so newer reports always render the full picture).
- `HorizonCalibration` interface gains 4 fields (`institutional_posterior`, `institutional_ci`, `insider_posterior`, `insider_ci`). All optional in TypeScript so old persisted reports without them still typecheck.

**Cron schedule unchanged:** `vercel.json` keeps the three crons. `sentiment-scan` runs `0 8 */3 * *`, `price-followup` daily 06:00 UTC, `learn` daily 07:30 UTC.

## Detailed Findings (sections referenced above)

### §3 — Finnhub data sources

#### §3.1 API verification

[VERIFIED via Finnhub docs at https://finnhub.io/docs/api]:

- **`/stock/insider-transactions`** — Returns Form 4 transaction list. Query params: `symbol` (required), `from`, `to` (ISO date strings, default = last 6 months). Response: `{ data: Array<InsiderTransaction>, symbol: string }`. Each transaction carries `name`, `share`, `change`, `filingDate`, `transactionDate`, `transactionCode`, `transactionPrice`. **Free tier rate:** documented at 60 req/min, with daily cap. Researcher MUST validate the exact daily cap at plan 17-01 Wave 0 — Finnhub recently lowered limits.
- **`/stock/insider-sentiment`** — Returns aggregated MSPR (Monthly Share Purchase Ratio) per ticker per month. Useful as a cross-check string for the report's prose, but NOT the classification path (we want raw transactions).
- **`/stock/institutional-ownership`** — Returns 13F ownership snapshot. Query params: `symbol`, `cik` (optional), `limit`. Response: `{ data: Array<{ reportDate, filingDate, ownership: Array<FundHolding> }> }`. The `data` array contains successive quarter-end snapshots; `data[0]` is the most recent. Each `ownership[]` element has `name` (fund), `share`, `change` (delta vs prior quarter).

**Coverage validation plan (plan 17-01 Wave 0 — REQUIRED before plan 17-05 measurement):**

```ts
// scripts/validate-finnhub-coverage.ts (one-shot validator, NOT committed to product code)
import { getCurrentWatchlist } from '../src/lib/data/ticker-watchlist';

const tickers = getCurrentWatchlist();
let insiderCovered = 0, institutionalCovered = 0;
for (const t of tickers) {
  const i = await fetch(`https://finnhub.io/api/v1/stock/insider-transactions?symbol=${t}&token=${process.env.FINNHUB_API_KEY}`).then(r => r.json());
  if (Array.isArray(i.data) && i.data.length > 0) insiderCovered++;
  const inst = await fetch(`https://finnhub.io/api/v1/stock/institutional-ownership?symbol=${t}&token=${process.env.FINNHUB_API_KEY}`).then(r => r.json());
  if (Array.isArray(inst.data) && inst.data.length > 0 && inst.data[0]?.ownership?.length > 0) institutionalCovered++;
  await new Promise(r => setTimeout(r, 1100));  // 60 req/min headroom
}
console.log(`insider coverage: ${insiderCovered}/${tickers.length}`);
console.log(`13F coverage: ${institutionalCovered}/${tickers.length}`);
```

**Decision rule (D-09):** if both ≥95%, EDGAR is a thin null-guard. If either <95%, EDGAR is co-equal and `fast-xml-parser` must be added in plan 17-01.

#### §3.2 SEC EDGAR fallback

- **Throttle:** SEC mandates ≤10 req/s and a `User-Agent: <name> <email>` header. Hard-fail without it.
- **Form 4 endpoint:** `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=<CIK>&type=4&dateb=&owner=include&count=40`. Filing index returns HTML; each filing has an XML attachment at `https://www.sec.gov/Archives/edgar/data/<CIK>/<accession>/<accession>-index.json` → drill to `<accession>.xml`.
- **13F-HR endpoint:** Same browse-edgar pattern with `type=13F-HR`. The filing's `infotable.xml` lists holdings.
- **CIK lookup:** `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=<name>&type=&dateb=&owner=include&count=40` — returns HTML; we'd parse the first matching row. **Better:** SEC publishes a daily CSV at `https://www.sec.gov/files/company_tickers.json` mapping ticker → CIK. Cache this in `/tmp` for 24h.
- **Recommended approach:** thin module `src/lib/data/edgar.ts` with two exports — `fetchEdgarForm4(ticker, lookbackDays)` and `fetchEdgar13F(ticker)`. Each returns `null` on any error (rate limit, HTML page change, missing XML). Both internally call `lookupCik(ticker)` which uses the cached company_tickers.json.
- **Recommended XML parsing:** `fast-xml-parser` ONLY if §3.1 measurement says EDGAR is co-equal; otherwise stub to `null`.

[Source: SEC EDGAR API documentation at https://www.sec.gov/edgar/sec-api-documentation — confirmed throttle rules, filing type codes, XML schema URIs.]

#### §3.3 Recommended classifier thresholds

These are starting values. Plan 17-05 closeout MUST run a histogram dump (analog of `backfill-technical.ts` line 117 `histogram` print) and adjust thresholds before AC3 measurement.

**Insider:**
- `cluster_buying` — distinct_buyers ≥ 3 in 30d trailing window, with net_buy_share_count > 0.
- `cluster_selling` — distinct_sellers ≥ 3 with net_sell_share_count > 0.
- `lone_buy` — distinct_buyers === 1, distinct_sellers === 0, net_buy_share_count > 0.
- `lone_sell` — distinct_sellers === 1, distinct_buyers === 0, net_sell_share_count > 0.
- `ceo_buy` / `cfo_buy` / `director_buy` — title-match in transaction `name` field. Finnhub does not return a structured title; researcher will need to detect title via a regex over the `name` string OR pull the title from the EDGAR Form 4 XML. **Defensive default:** if title can't be inferred, fall back to `lone_buy` / `cluster_buying` based on count.
- `planned_sell_10b5_1` — sells flagged with the 10b5-1 indicator. **Fallback if Finnhub doesn't expose it:** parse the EDGAR XML for the 10b5-1 footnote OR detect from the `transactionCode === 'S'` pattern + a price near recent average (planned sales typically trade at-market). Plan 17-01 Wave 0 must measure how many sells in the watchlist's 90-day history can actually be classified — if fewer than 5%, the bucket is too rare to learn and we drop it from the active classifier (with a TODO in CONTEXT.md update).

**Institutional:**
- `net_accumulation` — `net_share_change_pct > 0.02` (2% of prior-quarter total).
- `net_distribution` — `net_share_change_pct < -0.02`.
- `new_initiation` — `fund_count_prev === 0 && fund_count_current > 0` (rare; small-caps newly-on-radar).
- `complete_exit` — `fund_count_current === 0 && fund_count_prev > 0`.
- `smart_money_concentration` — `top10_concentration_pct > 0.40` AND it grew ≥5pp from prior quarter.
- `smart_money_dispersion` — `top10_concentration_pct < 0.20` AND it shrank ≥5pp.
- `contrarian_inflow` — `net_share_change_pct > 0.05` AND ticker underperformed SPY by >2pp over the 30d before filing_date.
- `contrarian_outflow` — `net_share_change_pct < -0.05` AND ticker outperformed SPY by >2pp.

**Threshold tuning loop (plan 17-05 Task 4):** after first dry-run backfill, dump the bucket distribution. If any bucket has <5% population OR any bucket has >40%, retune thresholds and re-run dry. The classifier bucketing is the load-bearing input to AC3 — a 60% `consolidation`-equivalent dominance kills the AC3 measurement.

### §4 — Snapshot storage shape (already shown above as code examples)

Both interfaces are designed with three goals:
1. **Auditable bucket** — every snapshot stores the inputs the classifier used, so the bucket can be re-derived without re-fetching.
2. **No raw-filing dump** — share counts and aggregates only.
3. **Provenance** — `data_age_days` is prominent so the UI can show "Latest 13F: 47 days ago".

### §5 — Sentiment-scan extension

Current `sentiment-scan/route.ts` (lines 40-55) does `Promise.all([lightweightCommunityScan, computeTechnicalSnapshot])`. Phase 17 extends to four sensors:

```ts
const [communityData, technicalData, insiderData, institutionalData] = await Promise.all([
  lightweightCommunityScan(ticker),
  computeTechnicalSnapshot(ticker),
  fetchInsiderData(ticker),
  fetchInstitutionalData(ticker),
]);
```

**Latency budget:** Each Finnhub fetch is ~400-800ms (single-region, well-cached on Finnhub side). With `Promise.all`, the per-ticker wall-clock is `max(community, technical, insider, institutional)` ≈ ~1.5s (technical is currently the slowest). 19 tickers × 1.5s + 19 × 2s sleep = ~67s. Well within the 300s function limit.

**Failure isolation:** Each fetcher MUST catch internally and return `null` on any error. The `Promise.all` MUST NOT reject — if any fetcher rejects, the whole snapshot fails. Mirror the `.catch(() => null)` pattern in `engine-context.ts` lines 285-286 for the cold-start path.

**Decision: cold-start path also fetches all four sensors in parallel.** Currently `engine-context.ts` lines 284-289 do `Promise.all([lightweightCommunityScan, computeTechnicalSnapshot])` for cold-start. Plan 17-04 extends this to four. Adds ~600ms to the cold-start P95 (was ~1.5s, becomes ~2.1s) — acceptable; cold-start is rare in production.

### §6 — Prisma schema migration strategy

Four nullable Json columns. No data backfill, no rename, no unique-key changes. Trivial migration.

```sql
-- prisma/migrations/{timestamp}_add_smart_money_columns/migration.sql
ALTER TABLE "sentiment_snapshots" ADD COLUMN "insider_data" JSONB;
ALTER TABLE "sentiment_snapshots" ADD COLUMN "institutional_data" JSONB;
ALTER TABLE "reports" ADD COLUMN "insider_at_report" JSONB;
ALTER TABLE "reports" ADD COLUMN "institutional_at_report" JSONB;
```

**Schema changes** (`prisma/schema.prisma`):

```prisma
model Report {
  // ... existing fields ...
  insider_at_report        Json?
  institutional_at_report  Json?
}

model SentimentSnapshot {
  // ... existing fields ...
  insider_data        Json?
  institutional_data  Json?
}

// LearnedPattern unchanged — signal_class column already accepts 'institutional' / 'insider'.
```

**Production deploy plan:**
1. Local: `npx prisma migrate dev --name add_smart_money_columns` (writes the migration SQL).
2. No hand-edit needed — the auto-generated SQL is correct (all four ADDs are nullable, no data movement).
3. Test locally against a clean Neon branch.
4. Commit migration + schema.
5. Vercel deploy automatically runs `prisma migrate deploy` (build command — `vercel.json` line 3).

[Confidence: HIGH. Adding nullable Jsonb columns is metadata-only on Postgres 11+ since the `DEFAULT NULL` is implicit and requires no row rewrite.]

### §7 — Price-followup runtime budget

**No change.** Phase 16 already widened TARGET_DAYS to `[3, 7, 14, 30, 60, 90]` and the query window to 95d. Phase 17 doesn't add horizons or change the outcome resolution path. Same ~90s budget, same 25 tickers/day, same ~150 max (snapshot, day) pairs per cron run.

[Confidence: HIGH — verified by reading the Phase 16 RESEARCH §7 budget against current `price-followup/route.ts`.]

### §8 — Quad-class learning loop

Current `learn/route.ts` per-outcome transaction already calls `upsertCell` twice (lines 619-645). Phase 17 extends to four calls. The recompute pass (`recomputePerSignalClassPatternMetrics`, line 294) currently iterates `SIGNAL_CLASSES = ['diffusion', 'technical']`; Phase 17 adds two more.

**Recommended refactor:**

```ts
// src/app/api/cron/learn/route.ts (post-Phase-17)

// New pattern enums (top of file, alongside existing FLOW_PATTERNS / TECH_PATTERNS / CAP_CLASSES / HORIZONS)
const INSIDER_PATTERNS: InsiderBucket[] = [
  'cluster_buying', 'lone_buy', 'ceo_buy', 'cfo_buy', 'director_buy',
  'cluster_selling', 'planned_sell_10b5_1', 'lone_sell',
];
const INSTITUTIONAL_PATTERNS: InstitutionalBucket[] = [
  'net_accumulation', 'net_distribution', 'new_initiation', 'complete_exit',
  'smart_money_concentration', 'smart_money_dispersion', 'contrarian_inflow', 'contrarian_outflow',
];

// Recompute pass — extends from 2 signal classes to 4
async function recomputePerSignalClassPatternMetrics(history: SpyHistory): Promise<void> {
  const SIGNAL_CLASSES = ['diffusion', 'technical', 'insider', 'institutional'] as const;

  const tasks: Array<Promise<void>> = [];
  for (const signal_class of SIGNAL_CLASSES) {
    const patterns =
      signal_class === 'diffusion'      ? FLOW_PATTERNS :
      signal_class === 'technical'      ? TECH_PATTERNS :
      signal_class === 'insider'        ? INSIDER_PATTERNS :
                                          INSTITUTIONAL_PATTERNS;
    for (const pattern_key of patterns) {
      for (const cap_class of CAP_CLASSES) {
        for (const horizon_days of HORIZONS) {
          tasks.push(recomputeOneCell(history, { signal_class, pattern_key, cap_class, horizon_days }));
        }
      }
    }
  }
  await Promise.all(tasks);
}

// Per-outcome transaction — adds two upsertCell calls (lines 618-645 of learn/route.ts)
async function processOneOutcome(...) {
  // ... existing trace + tech read ...

  // NEW: read both insider and institutional snapshots off the originating row
  const insiderBucket = await readInsiderBucketForOutcome(outcome, tx);          // pseudocode helper
  const institutionalBucket = await readInstitutionalBucketForOutcome(outcome, tx);

  // 1. Diffusion (existing)
  // 2. Technical (existing)
  // 3. NEW Insider
  if (insiderBucket && resolvedCap) {
    await upsertCell(tx, { signal_class: 'insider', pattern_key: insiderBucket, cap_class: resolvedCap, horizon_days: horizon }, hit);
  }
  // 4. NEW Institutional
  if (institutionalBucket && resolvedCap) {
    await upsertCell(tx, { signal_class: 'institutional', pattern_key: institutionalBucket, cap_class: resolvedCap, horizon_days: horizon }, hit);
  }

  // Logistic update — UNCHANGED, still 12-d, still 30d-only
  // ... existing buildFeatureVector12 + updateLogistic call ...

  // LearningEvent.delta now carries insider_hit + institutional_hit
  // (see Pattern 2 example above)
}
```

**Idempotency:** The transaction wrapper from Phase 16 already covers Phase 17 — adding two more `upsertCell` calls inside the same `prisma.$transaction(async (tx) => {...})` is automatically atomic. The `LearningEvent.outcome_id` is still the dedup key.

**Recompute pass blow-up:**
- Phase 16 effective: 2 classes × (4 + 8 patterns / 2) × 3 cap × 6 horizons. Per-class: 4×3×6=72 (diffusion) and 8×3×6=144 (technical) = 216 cells.
- Phase 17 effective: 504 cells (216 + 8×3×6 insider + 8×3×6 institutional = 216 + 144 + 144 = 504).
- Per-cell query is ~50ms (Phase 16 measurement). With `Promise.all` parallelism: ~25s total for 504 cells if Postgres bottlenecks at concurrent connection limit. **Mitigation:** chunk the `tasks` array into groups of 50 with `Promise.all` per-chunk, so connection pressure stays bounded. Alternatively: the existing all-at-once `Promise.all` will likely work fine — Phase 16's 216-cell version is already in production and the `prisma`/Neon adapter handles connection multiplexing.
- **Decision:** ship as-is with `Promise.all` over all 504 tasks. Measure on first deploy. Chunk only if function approaches 200s.

[Confidence: HIGH for the algorithm extension; MEDIUM for the runtime — empirical measurement after first deploy is necessary.]

### §9 — `engine-context.ts` extension

The current `readHorizonCalibrations` (lines 196-265) issues 12 queries (6 horizons × 2 signal classes). Phase 17 grows this to 24 queries (6 × 4). Each query is a `findUnique` keyed on `(signal_class, pattern_key, cap_class, horizon_days)` — same shape, just two more iterations.

**New fields added to `EngineContext`:**
- `institutional_pattern: InstitutionalBucket | null`
- `institutional_posterior_mean / institutional_ci / institutional_sample_size / institutional_status`
- `insider_pattern: InsiderBucket | null`
- `insider_posterior_mean / insider_ci / insider_sample_size / insider_status`

**Implementation outline:**

1. After §6 (current technical_data resolution at lines 343-353), add a parallel resolver for insider and institutional:
   ```ts
   // §6.5 — Resolve insider + institutional snapshot inputs
   let insiderSnap: InsiderSnapshot | null = mostRecentSnap?.insider_data as InsiderSnapshot | null;
   let institutionalSnap: InstitutionalSnapshot | null = mostRecentSnap?.institutional_data as InstitutionalSnapshot | null;
   // No live re-fetch on the report hot path — these are populated by sentiment-scan
   // and by cold-start (see plan 17-04 Task 1).
   const insiderBucket = insiderSnap?.insider_bucket ?? null;
   const institutionalBucket = institutionalSnap?.institutional_bucket ?? null;
   ```

2. After §7 (technical cell lookup, line 399-430), add parallel cells for insider + institutional at the 30d primary horizon, with the same fallback to highest-sample-size horizon:
   ```ts
   let insiderCell: LearnedCellLike | null = null;
   if (insiderBucket) {
     insiderCell = await prisma.learnedPattern.findUnique({
       where: { signal_class_pattern_key_cap_class_horizon_days: {
         signal_class: 'insider', pattern_key: insiderBucket, cap_class, horizon_days: 30,
       } },
     }) as LearnedCellLike | null;
     // ... same fallback as technicalCell ...
   }
   // Same for institutionalCell.
   ```

3. Extend `readHorizonCalibrations` from 2 classes to 4. Each row of the result now carries 4 posterior + 4 CI fields:
   ```ts
   return HORIZONS.map((horizon, i) => ({
     horizon_days: horizon,
     diffusion_posterior, diffusion_ci,
     technical_posterior, technical_ci,
     institutional_posterior, institutional_ci,
     insider_posterior, insider_ci,
     sample_size: Math.max(...four_sample_sizes),
     status: maxStatus(maxStatus(dStatus, tStatus), maxStatus(iStatus, instStatus)),
   }));
   ```

4. Replace `computeAgreement(dP, tP, dS, tS)` call with `computeAgreementNWay([{dP, dS}, {tP, tS}, {iP, iS}, {instP, instS}])`. Same 4-state output (`aligned | mixed | opposed | unknown`).

5. **No change to logistic forward pass** — D-22 is explicit. `combined_logistic_score` stays at 12 features (diffusion + technical only).

[Confidence: HIGH — pattern matches the existing diffusion/technical reads; only the keys and the row shape change.]

### §10 — Backfill strategy

`scripts/backfill-smart-money.ts` — one-shot script run from local CLI against production Neon. Mirrors `scripts/backfill-technical.ts` shape closely.

```ts
// scripts/backfill-smart-money.ts (sketch)
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { fetchInsiderData } from '../src/lib/data/insider';
import { fetchInstitutionalData } from '../src/lib/data/institutional';

const DRY_RUN = process.argv.includes('--dry-run');
const TECH_THROTTLE_MS = 1000;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Step 1: backfill insider_data + institutional_data on existing snapshots
const snaps = await prisma.sentimentSnapshot.findMany({
  where: { OR: [{ insider_data: { equals: undefined } }, { institutional_data: { equals: undefined } }] },
  orderBy: { scanned_at: 'asc' },
});

const insiderHist: Record<string, number> = {};
const institutionalHist: Record<string, number> = {};

for (const snap of snaps) {
  try {
    // Both classes fetched in parallel per snapshot — Finnhub handles concurrent reads
    const [insider, institutional] = await Promise.all([
      fetchInsiderData(snap.ticker, snap.scanned_at),
      fetchInstitutionalData(snap.ticker, snap.scanned_at),
    ]);
    insiderHist[insider?.insider_bucket ?? 'null'] = (insiderHist[insider?.insider_bucket ?? 'null'] ?? 0) + 1;
    institutionalHist[institutional?.institutional_bucket ?? 'null'] = (institutionalHist[institutional?.institutional_bucket ?? 'null'] ?? 0) + 1;

    if (!DRY_RUN) {
      await prisma.sentimentSnapshot.update({
        where: { id: snap.id },
        data: {
          insider_data: insider ? (insider as object) : Prisma.JsonNull,
          institutional_data: institutional ? (institutional as object) : Prisma.JsonNull,
        },
      });
    }
    console.log(`  ${DRY_RUN ? '·' : '✓'} ${snap.ticker} ${snap.scanned_at.toISOString().slice(0,10)} → insider=${insider?.insider_bucket ?? 'null'} inst=${institutional?.institutional_bucket ?? 'null'}`);
  } catch (err) {
    console.error(`  ✗ ${snap.ticker}: ${(err as Error).message}`);
  }
  await new Promise(r => setTimeout(r, TECH_THROTTLE_MS));
}

// Histogram dump (drives §3.3 threshold tuning)
console.log('\nInsiderBucket distribution:');
for (const [k, v] of Object.entries(insiderHist).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${v}`);
console.log('\nInstitutionalBucket distribution:');
for (const [k, v] of Object.entries(institutionalHist).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(28)} ${v}`);

// NOTE: NO step 2 (horizon backfill). Phase 16 already added 30/60/90 horizons; Phase 17 inherits.
console.log('\nDone. Now manually trigger /api/cron/learn with $CRON_SECRET so the recompute pass runs over 504 cells.');
```

**Why local, not API route:** Same as Phase 16. ~33 min for 200 tickers × ~2 endpoint × 1s throttle. Function ceiling is 300s.

**Risk:** Backfill writes to production. Mitigation: `--dry-run` flag (default true).

**Finnhub history depth:** From the docs and AAPL probe — Finnhub returns ~12-16 quarters of 13F snapshots and ~1 year of Form 4 transactions on the free tier. Backfill will populate cells where snapshots fall within that history window. Snapshots older than the Finnhub window get `insider_data: null` / `institutional_data: null` and skip Beta updates — same handling as `community_data: null`.

[Confidence: HIGH for the script shape; MEDIUM for the Finnhub history depth — verify at plan 17-01 Wave 0 by probing oldest available filings for 5 sample tickers.]

### §11 — UI extension

**`EngineCalibrationPanel.tsx` extension** — `DualClassPanel` becomes `QuadClassPanel` (or kept alongside as a separate component if the team wants a clear cutover). Recommendation: replace `DualClassPanel` with `QuadClassPanel`; keep `DiffusionOnlyPanel` as legacy fallback.

**Layout strategy:**

```tsx
// 4-column grid on desktop; 2-column responsive on tablet; 1-column stack on mobile
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
  <ClassColumn title="DIFFUSION" data={diffusionStuff} />
  <ClassColumn title="TECHNICAL" data={technicalStuff} />
  <ClassColumn title="INSTITUTIONAL" data={institutionalStuff} />  {/* NEW */}
  <ClassColumn title="INSIDER" data={insiderStuff} />              {/* NEW */}
</div>

// Agreement badge sits ABOVE the grid (was between columns in 2-col)
<div className="flex justify-center mb-4">
  <AgreementBadge state={agreement} />
</div>
```

**Per-column null guard (AC4):** when a class is `NO_DATA`, show the column with grayed metric cards and "No recent filings" subtext. Do NOT hide the column entirely — readers need to see "the engine knows this signal is missing" vs "this signal is fresh".

**Agreement badge generalized to N-way:**
- `ALIGNED` (green) — all populated ACTIVE classes lean same direction (>0.55 OR <0.45).
- `MIXED` (amber) — both bullish + bearish present among ACTIVE classes, but no strong opposition.
- `OPPOSED` (red) — at least one >0.6 AND at least one <0.4 among ACTIVE classes.
- `UNKNOWN` (neutral) — fewer than 2 ACTIVE classes.

The tooltip text adapts:
- Aligned, 2 classes: "Both signal classes agree at 30d." (current Phase 16 wording).
- Aligned, 3-4 classes: "All populated signal classes agree at 30d. High conviction."
- Mixed/Opposed: list which classes lean which direction in the tooltip.

**Horizon table extension** — currently 6 columns (HORIZON, DIFFUSION POST., DIFFUSION CI, TECHNICAL POST., TECHNICAL CI, N · STATUS). Phase 17 grows to 10 columns:

| HORIZON | DIFFUSION POST | DIFFUSION CI | TECHNICAL POST | TECHNICAL CI | INST POST | INST CI | INSIDER POST | INSIDER CI | N · STATUS |

This is wide. Recommendation: at viewport ≤1280px, hide the CI columns; show only point posteriors. CI shows on hover/title attribute. UI-SPEC must lock this responsiveness rule.

**`ResearchReport.tsx` — new "Smart Money Intelligence" section** between Community Intelligence and Engine Calibration:

```tsx
<SmartMoneyIntelligence
  insider={report.insider_at_report}              // InsiderSnapshot | null
  institutional={report.institutional_at_report}  // InstitutionalSnapshot | null
  insiderEngineBucket={engineCalibration?.insider_pattern}
  institutionalEngineBucket={engineCalibration?.institutional_pattern}
/>

// Inside SmartMoneyIntelligence:
//   - Sub-card: "Institutional Flow" — shows total share count delta, top-10 concentration,
//     fund_count delta. Filing age ("Latest 13F: 47 days ago"). Bucket badge.
//   - Sub-card: "Insider Activity" — shows distinct buyers/sellers, has_ceo_buy flag,
//     net buy/sell value. Filing age ("Latest Form 4: 3 days ago"). Bucket badge.
//   - When one side is null, show single sub-card and a neutral placeholder for the other.
```

**`/insights` — two new tabs (extend the existing 4-tab strip in `InsightsDashboard.tsx` lines 73-79):**

```tsx
const TABS = [
  { id: 'diffusion-library', label: 'Diffusion Library', isNew: false },
  { id: 'live-map', label: 'Live Diffusion Map', isNew: false },
  { id: 'technical-library', label: 'Technical Pattern Library', isNew: false },  // was new in Phase 16
  { id: 'horizon-brier', label: 'Horizon Brier', isNew: false },                    // was new in Phase 16
  { id: 'institutional-library', label: 'Institutional Pattern Library', isNew: true },  // NEW
  { id: 'insider-library', label: 'Insider Pattern Library', isNew: true },              // NEW
] as const;
```

Each new tab mirrors the technical-library tab's structure: 8 patterns × 3 cap_classes grid, each cell shows posterior + CI + status badge, primary 30d horizon star.

**System prompt extension** (gemini-analysis.ts, `buildEngineContextBlock`):

```
═══ SMART MONEY CALIBRATION CONTEXT ═══

Cipher's smart money learning engine has accumulated <N_inst> resolved 30d outcomes
for institutional flow regimes (8 buckets × 4 cap classes) and <N_ins> for insider
action regimes (8 buckets × 4 cap classes). For this ticker right now:

  Institutional pattern detected:    {institutional_pattern} × {cap_class}
  Institutional prior (30d):         {pct(institutional_posterior)} [CI ...]
                                     n={institutional_sample_size}, status: {institutional_status}
                                     Latest 13F: {institutional_data_age_days}d old

  Insider pattern detected:          {insider_pattern} × {cap_class}
  Insider prior (30d):               {pct(insider_posterior)} [CI ...]
                                     n={insider_sample_size}, status: {insider_status}
                                     Latest Form 4: {insider_data_age_days}d old

  Horizon table (Beta cells, all 4 classes):
    7d   diffusion {x}% technical {y}% institutional {z}% insider {w}%
    30d★ diffusion {x}% technical {y}% institutional {z}% insider {w}%   ← primary
    60d  diffusion {x}% technical {y}% institutional {z}% insider {w}%
    90d  diffusion {x}% technical {y}% institutional {z}% insider {w}%
  Agreement (all 4 classes): {agreement}

INSTRUCTIONS:
- 30d remains primary. Your future_projection MUST mention 30d.
- When the institutional or insider class has an ACTIVE prior at 30d, your buy_rationale
  / sell_rationale MUST reference it by bucket name (e.g., "cluster_buying", "smart_money_concentration").
- For institutional_alignment / institutional_disagreement / insider_alignment / insider_disagreement:
  same rules as engine_alignment/disagreement but applied to the matching class. Numeric values
  will be overwritten post-generation — narrate qualitatively only.
```

`AnalysisResultSchema` (zod) gains 4 new prose strings:

```ts
engine_calibration: z.object({
  engine_alignment: z.string().nullable().default(null),
  engine_disagreement: z.string().nullable().default(null),
  technical_alignment: z.string().nullable().default(null),
  technical_disagreement: z.string().nullable().default(null),
  institutional_alignment: z.string().nullable().default(null),       // NEW
  institutional_disagreement: z.string().nullable().default(null),    // NEW
  insider_alignment: z.string().nullable().default(null),             // NEW
  insider_disagreement: z.string().nullable().default(null),          // NEW
}).optional(),
```

[Confidence: HIGH — pattern is identical to Phase 16's dual-class block, scaled.]

### §12 — Insights surface

Modifications to `src/components/InsightsDashboard.tsx`:
- Two new tabs (see TABS array above).
- Each new tab is a clone of the existing `technical-library` tab body — 8 patterns × 3 cap_classes grid, posterior + CI + status, 30d primary horizon control.
- New API endpoints (or extend existing): `GET /api/insights/institutional-library` + `GET /api/insights/insider-library`. Each returns the LearnedPattern rows for its signal_class. Same shape as the existing diffusion-library and technical-library endpoints.
- The existing `Horizon Brier` tab automatically picks up the new signal classes if its data source is generic over `signal_class`. **Verify at plan 17-04** — if it's hardcoded to `['diffusion', 'technical']`, extend to all four.

[Confidence: MEDIUM — `InsightsDashboard.tsx` is 1829 lines and the planner should peek at the technical-library tab's body to confirm the extension is mechanical, not architectural.]

### §13 — Validation Architecture see dedicated section below

## Common Pitfalls

### Pitfall 1: Finnhub free-tier rate limit hit during sentiment-scan

**What goes wrong:** sentiment-scan runs 19 tickers × 4 sensors. If two of those are Finnhub (insider + institutional), that's 38 Finnhub calls per cron run. With other Finnhub usage (existing `fetchFinnhub` for profile2 + metric=all = 2 calls per analysis, plus polygon/yahoo unrelated), free-tier 60/min limit could throttle.
**Why it happens:** Finnhub free-tier limits are aggressive and sometimes lower than documented (recent quiet downgrade — verify at plan 17-01 Wave 0).
**How to avoid:** Inside `fetchInsiderData` / `fetchInstitutionalData`, on HTTP 429, return `null` (not throw), and log to LearningEvent for observability. The empty-data policy (D-19) handles this gracefully — that ticker just skips Beta updates this cycle.
**Warning signs:** Many tickers showing `insider_data: null` immediately after Phase 17 deploy, despite known Form 4 activity. Check Finnhub rate-limit headers in Vercel logs.

### Pitfall 2: 13F latency confusion at learn time

**What goes wrong:** Engineer sees "data_age_days: 47" on a 13F snapshot and thinks the outcome window should start at filing_date, not snapshot_date. Modifies learn-loop to use filing_date.
**Why it happens:** Intuition says "the signal arrived 47 days ago, so the outcome window is from then". Wrong — D-18 is explicit.
**How to avoid:** Comment in `processOneOutcome` near the institutional_bucket update: `// 13F latency policy: outcome window is snapshot-anchored, NOT filing-anchored. The engine learns whether stale 13F data still moves price 30d from when the engine sees it. See PHASE-17-CONTEXT.md D-18.`
**Warning signs:** Outcome dates look anomalously early in audit logs; 13F bucket priors converge unrealistically fast.

### Pitfall 3: Institutional class never activates because all snapshots are "net_accumulation"

**What goes wrong:** Most tickers see institutional ownership grow quarter-over-quarter (because indexing flows are persistent). Bucket distribution dominated by `net_accumulation` → no per-bucket discrimination → AC3 fails.
**Why it happens:** Default-net-positive flow is a market-structure artifact, not a learnable signal.
**How to avoid:** Threshold tuning in plan 17-05 closeout (§3.3). If `net_accumulation` >40% of snapshots, raise the threshold (e.g., from 2% to 5%) so only meaningful flows hit the bucket. Or split into "small_net_accumulation" / "large_net_accumulation" — but stay within the 8-bucket budget.
**Warning signs:** First-cycle histogram shows >40% in a single bucket. Plan 17-05 closeout MUST report the histogram and stop for review before AC3 measurement.

### Pitfall 4: Cold-start parallel scan adds 600ms to fresh-ticker P95

**What goes wrong:** Fresh ticker hits the report endpoint. Cold-start path (`engine-context.ts` lines 284-289) currently fans out to 2 sensors. Phase 17 grows to 4. Adds ~600ms to P95 for fresh tickers.
**Why it happens:** Cold-start is on the hot path (analysis route).
**How to avoid:** Already mitigated by `Promise.all`. Each sensor is independent. The only risk is one sensor blocking on a slow Finnhub response — set `AbortSignal.timeout(5000)` on the new fetchers (matches `fetchFinnhub` line 26-27 pattern).
**Warning signs:** P95 analysis latency for fresh tickers grows past 5s after Phase 17 ships. Acceptable target: <3s P95.

### Pitfall 5: Schema migration runs but old snapshots have NULL insider/institutional cols

**What goes wrong:** Pre-Phase-17 snapshots have `insider_data` and `institutional_data` as NULL. Engineer expects them to gracefully skip Beta updates. They DO — but the engineer sees "no insider activity for AAPL pre-2026-04-30" and thinks the fetcher is broken.
**Why it happens:** No backfill on existing snapshots until plan 17-05's `backfill-smart-money.ts` runs.
**How to avoid:** Document the order of operations: (1) deploy Phase 17 schema migration, (2) deploy code (sentiment-scan starts writing both new cols on every NEW snapshot), (3) run backfill against old snapshots. The 3-day lag between (2) and (3) is OK — the engine ignores nulls.
**Warning signs:** Reports analyzed in the first ~3 days post-deploy show "Smart Money: No recent data" even for well-known tickers.

### Pitfall 6: 4-column panel breaks at 1280px viewport

**What goes wrong:** The agreement badge centered above 4 columns + 4-column horizon table renders fine at ≥1440px but cramps at 1280px (common laptop). Reader sees clipped CI text or wrapped column labels.
**Why it happens:** The current 2-column panel already eats 50% of a 1280px viewport per column. 4 columns can't fit at full fidelity.
**How to avoid:** Plan 17-04 generates a UI-SPEC.md that locks responsive behavior: ≥1440px = 4-col grid; 1024-1439px = 2-row × 2-col grid; ≤1023px = 4-row stacked. Horizon table hides CI columns ≤1280px (point posteriors only; CI on hover).
**Warning signs:** Playwright e2e fails at default 1280×720 viewport.

### Pitfall 7: 10b5-1 detection unreliable on Finnhub

**What goes wrong:** `planned_sell_10b5_1` bucket relies on detecting the 10b5-1 indicator. Finnhub may not expose it on the free tier. EDGAR XML has it but only in the `<footnotes>` block.
**Why it happens:** 10b5-1 is a regulatory annotation, not a transaction-code field.
**How to avoid:** At plan 17-01 Wave 0, probe a known 10b5-1 sale (e.g., a recent CEO planned sale at AAPL, GOOG, or NVDA) and confirm whether Finnhub returns the indicator. If not, fall back to the EDGAR XML parse (plan 17-01 Task: add `parsePlanned10b5_1` helper in `edgar.ts` that returns boolean from the footnote text). If neither works, drop the bucket from the active classifier and mark "deferred" in CONTEXT.md.
**Warning signs:** First-cycle backfill histogram shows 0 hits for `planned_sell_10b5_1` even though known events exist in window.

### Pitfall 8: Buy/Hold/Sell rationale doesn't cite Smart Money pattern

**What goes wrong:** D-06 says rationale MUST reference at least one institutional or insider pattern when relevant class has an ACTIVE prior at 30d. Gemini follows the system prompt loosely; sometimes it forgets.
**Why it happens:** LLMs interpret instruction priority by recency in the prompt; the citation requirement is buried.
**How to avoid:** Add an integration test that asserts the rationale string contains either an `InsiderBucket` or `InstitutionalBucket` value when the engine_calibration has a corresponding ACTIVE status. Test fails → planner adjusts prompt phrasing (move citation requirement closer to the rationale block in the prompt).
**Warning signs:** Manual report inspection shows rationales that ignore the Smart Money block when a clear ACTIVE prior exists.

## Validation Architecture

> Skip section if `workflow.nyquist_validation: false`. **Confirmed enabled** in `.planning/config.json`. Section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.9 (unit) + Vitest 3.0.9 (integration, separate config) + Playwright 1.58.2 (e2e) |
| Config files | `vitest.config.ts` (unit) · `vitest.integration.config.ts` (integration) · `playwright.config.ts` (e2e) |
| Quick run command | `npm test -- src/lib/data/insider.test.ts` (single-file, <5s) |
| Full suite command | `npm test && npm run test:integration && npm run test:e2e` |

[VERIFIED: package.json scripts; vitest.integration.config.ts at repo root; existing Phase 16 tests in tests/integration/ confirm the pattern]

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| 17-01 | Finnhub `/stock/insider-transactions` mock returns parsable transaction list | unit | `npm test -- src/lib/data/insider.test.ts -t "finnhub"` | ❌ Wave 0 |
| 17-01 | Finnhub `/stock/institutional-ownership` mock returns parsable ownership list | unit | `npm test -- src/lib/data/institutional.test.ts -t "finnhub"` | ❌ Wave 0 |
| 17-01 | EDGAR fallback returns null when Finnhub returns valid data | unit | `npm test -- src/lib/data/insider.test.ts -t "edgar fallback"` | ❌ Wave 0 |
| 17-01 | Insider classifier returns `cluster_buying` when 3 distinct buyers in 30d | unit | `npm test -- src/lib/data/insider-classifier.test.ts -t "cluster_buying"` | ❌ Wave 0 |
| 17-01 | Insider classifier returns `planned_sell_10b5_1` when 10b5-1 flag present | unit | `npm test -- src/lib/data/insider-classifier.test.ts -t "10b5-1"` | ❌ Wave 0 |
| 17-01 | Insider classifier returns `null` when no transactions in window | unit | `npm test -- src/lib/data/insider-classifier.test.ts -t "empty"` | ❌ Wave 0 |
| 17-01 | Institutional classifier returns `smart_money_concentration` when top10 >40% AND grew ≥5pp | unit | `npm test -- src/lib/data/institutional-classifier.test.ts -t "concentration"` | ❌ Wave 0 |
| 17-01 | Institutional classifier returns `contrarian_inflow` when net flow positive but ticker underperforms SPY | unit | `npm test -- src/lib/data/institutional-classifier.test.ts -t "contrarian"` | ❌ Wave 0 |
| 17-01 | Institutional classifier returns `null` when fund_count_current and fund_count_prev both 0 | unit | `npm test -- src/lib/data/institutional-classifier.test.ts -t "empty"` | ❌ Wave 0 |
| 17-02 | Migration adds `insider_data`, `institutional_data` columns to sentiment_snapshots | integration | `npm run test:integration -- tests/integration/schema-phase-17.test.ts` | ❌ Wave 0 |
| 17-02 | Migration adds `insider_at_report`, `institutional_at_report` columns to reports | integration | (same file) | ❌ Wave 0 |
| 17-02 | LearnedPattern accepts new signal_class values 'insider' and 'institutional' | integration | (same file) | ❌ Wave 0 |
| 17-03 | sentiment-scan cron writes both new Json cols on every new snapshot | integration | `npm run test:integration -- tests/integration/sentiment-scan-smart-money.test.ts` | ❌ Wave 0 |
| 17-03 | sentiment-scan handles asymmetric coverage (insider populated, institutional null) gracefully | integration | (same file) | ❌ Wave 0 |
| 17-03 | learn cron updates 4 cells per outcome (one per non-null class) | integration | `npm run test:integration -- tests/integration/learn-quad-class.test.ts` | ❌ Wave 0 |
| 17-03 | learn cron logistic update remains 12-d, 30d-only (NOT extended to 24-d) | integration | (same file as above, separate `it()`) | ❌ Wave 0 |
| 17-04 | engine-context.ts returns `institutional_pattern`, `insider_pattern`, `institutional_status`, `insider_status` | unit | `npm test -- src/lib/engine-context.test.ts -t "smart money"` | ❌ Wave 0 |
| 17-04 | computeAgreementNWay correctly classifies 4-class aligned/mixed/opposed/unknown | unit | `npm test -- src/lib/engine-context.test.ts -t "agreement n-way"` | ❌ Wave 0 |
| 17-04 | Gemini system prompt block contains "SMART MONEY CALIBRATION CONTEXT" and "30d" | unit | `npm test -- src/lib/gemini-analysis.test.ts -t "smart money block"` | ❌ Wave 0 |
| 17-04 | AnalysisResultSchema accepts institutional_alignment / insider_alignment fields | unit | `npm test -- src/lib/gemini-analysis.test.ts -t "schema extension"` | ❌ Wave 0 |
| AC1 | EngineCalibrationPanel renders 4 columns when all classes have data | e2e | `npm run test:e2e -- tests/e2e/engine-calibration-quad.spec.ts -t "4 col"` | ❌ Wave 0 |
| AC1 | Panel degrades gracefully when institutional_at_report / insider_at_report absent (old reports) | e2e | (same file as above) | ❌ Wave 0 |
| AC2 | Same ticker pre/post `learn` cycle changes engine_calibration block (institutional + insider classes) | integration | `npm run test:integration -- tests/integration/smart-money-affects-reports.test.ts` | ❌ Wave 0 |
| AC3 | After backfill, ≥25% of cells in most-traded `cap_class × horizon=30d` row are ACTIVE for both new classes | integration | `npm run test:integration -- tests/integration/backfill-smart-money-active-rate.test.ts` | ❌ Wave 0 |
| AC4 | Smart Money Intelligence section renders correctly with one class null (asymmetric) | e2e | `npm run test:e2e -- tests/e2e/smart-money-asymmetric.spec.ts` | ❌ Wave 0 |
| AC5 | Brier 30d for ≥1 ACTIVE pattern in each new class is reported | integration | `npm run test:integration -- tests/integration/horizon-brier-smart-money.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm test` (unit only; <30s).
- **Per wave merge:** `npm test && npm run test:integration` (~3-4 min on live DB; quad-class tests add ~1 min over Phase 16).
- **Phase gate:** All three suites green before `/gsd-verify-work`.

### Wave 0 Gaps

The phase has no test files yet. Wave 0 must establish:

- [ ] `src/lib/data/insider.test.ts` — Finnhub mock + EDGAR fallback null behavior
- [ ] `src/lib/data/institutional.test.ts` — Finnhub mock + EDGAR fallback null behavior
- [ ] `src/lib/data/insider-classifier.test.ts` — bucket-mapping table-tests
- [ ] `src/lib/data/institutional-classifier.test.ts` — bucket-mapping table-tests
- [ ] `src/lib/engine-context.test.ts` (extended) — new fields, N-way agreement
- [ ] `src/lib/gemini-analysis.test.ts` (extended) — system prompt block + schema extension
- [ ] `tests/integration/schema-phase-17.test.ts` — schema/migration assertions
- [ ] `tests/integration/sentiment-scan-smart-money.test.ts` — snapshot writer
- [ ] `tests/integration/learn-quad-class.test.ts` — quad cell updates + 30d logistic constraint
- [ ] `tests/integration/smart-money-affects-reports.test.ts` — analog of `technical-affects-reports.test.ts` (load-bearing AC2 + AC5)
- [ ] `tests/integration/backfill-smart-money-active-rate.test.ts` — AC3
- [ ] `tests/integration/horizon-brier-smart-money.test.ts` — AC5
- [ ] `tests/e2e/engine-calibration-quad.spec.ts` — AC1 panel rendering + screenshots
- [ ] `tests/e2e/smart-money-asymmetric.spec.ts` — AC4 asymmetric coverage rendering

Framework install: not needed (all three frameworks present from Phase 16).

## Runtime State Inventory

> Phase 17 is a feature addition with 4 new nullable Json columns and no rename — runtime state inventory is bounded.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `LearnedPattern` rows: ~216 effective cells today (Phase 16). Phase 17 will grow to ~504 effective cells as new outcomes fill in. **No backfill of existing rows** — `signal_class` column already accepts new values. | None for migration; the cells populate naturally on first quad-class learn cycle + after backfill-smart-money script runs. |
| Live service config | Vercel cron schedule in `vercel.json` — unchanged. | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | `FINNHUB_API_KEY` (existing) — unchanged. `CRON_SECRET` (existing) — unchanged. **No new env vars required.** EDGAR has no key (anonymous public data). | None. |
| Build artifacts | `prisma/migrations/` directory — gains one new migration. `node_modules/.prisma/client/` regenerates after `prisma generate` (postinstall hook). | Run `npx prisma generate` after `npm install`; postinstall handles automatically on deploy. |
| Logistic state | `LogisticEpoch` rows are **untouched** by Phase 17. The 12-d state stays 12-d (D-22). `needsLogisticReinit()` returns false post-Phase-17 because the coefficients shape is unchanged. | None — explicitly verified that `FEATURE_NAMES` array length stays at 12. |

**Cron-write idempotency:** `LearningEvent.outcome_id` dedup carries forward. The `prisma.$transaction(...)` wrapper from Phase 16 covers all 4 `upsertCell` calls atomically.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `FINNHUB_API_KEY` env var | Both new fetchers | ✓ | n/a | EDGAR fallback (recommended only if §3.1 measurement says coverage <95%) |
| `fast-xml-parser` (npm) | EDGAR XML parsing — IF needed | ✗ — not yet installed | — | Stub to `null` on first ship; install only if EDGAR is co-equal |
| Neon Postgres (production) | Schema migration target | ✓ via DATABASE_URL | n/a | Required for backfill + integration tests |
| Vercel build pipeline | `prisma migrate deploy` runs in build | ✓ | n/a | n/a |
| Vercel AI Gateway | Gemini calls (system prompt extension) | ✓ already in use | n/a | n/a |
| `yahoo-finance2` | Used by institutional classifier for ticker_30d_return / spy_30d_return calculation | ✓ | ^3.13.2 | None needed (reuse Phase 16's existing `yf.chart()` calls) |
| Playwright Chromium | E2E tests | ✓ | ^1.58.2 | None needed |
| `@prisma/adapter-neon` | Integration tests + backfill script | ✓ | ^7.5.0 | None needed |

**Missing dependencies with no fallback:** None — `fast-xml-parser` is a conditional install gated by §3.1 measurement.

## Assumptions Log

The following claims are based on training knowledge or Phase 16 inference rather than explicit verification this session.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Finnhub free-tier rate is 60 req/min as documented | §3.1 | If actually lower (recently observed downgrades), sentiment-scan throttles → many `null` snapshots. Mitigated by HTTP-429-returns-null guard. Validate at plan 17-01 Wave 0. |
| A2 | Finnhub coverage on the 200-ticker watchlist is ≥95% for both endpoints | §3.1 / §10 | If <95%, EDGAR becomes co-equal and plan 17-01 must add `fast-xml-parser` + flesh out `edgar.ts`. Mitigated by §3.1 validation script run in plan 17-01 Wave 0. |
| A3 | Finnhub returns ~12-16 quarters of 13F history and ~1 year of Form 4 | §10 | If history shorter, AC3 (≥25% ACTIVE) might miss because cells lack samples. Mitigated by plan 17-05 closeout reporting cell sample sizes; AC3 is loose-pass-friendly. |
| A4 | Finnhub `transactionCode === 'S' + 10b5-1 indicator` is detectable | §3.3 / Pitfall 7 | If indicator absent, `planned_sell_10b5_1` bucket is unfillable; classifier returns `null` for those snapshots. Drop bucket from active classifier as fallback. |
| A5 | Per-cell recompute query is ~50ms (Phase 16 measurement) | §8 | If actually 200ms, 504-cell pass = 100s, tight. Mitigated by `Promise.all` parallelism + chunking fallback. |
| A6 | 4-column panel renders cleanly at ≥1440px desktop viewports | §11 / Pitfall 6 | If responsive breaks, UI-SPEC must add stricter rules. Mitigated by Playwright viewport tests. |
| A7 | Bucket distribution is roughly uniform across 8 institutional buckets after threshold tuning | §3.3 / Pitfall 3 | If `net_accumulation` dominates (>40%), AC3 fails. Mitigated by plan 17-05 closeout histogram + threshold retune. |
| A8 | Gemini's prose token output stays short enough that adding the Smart Money block doesn't push the system prompt past Gemini's 1M context limit | §11 | Smart Money block is ~700 tokens; system prompt currently ~3100 tokens (post-Phase-16). Total ~3800 — well within limits. [VERIFIED via prompt inspection.] |

**Load-bearing assumptions:** A1, A2, A4 are gated by plan 17-01 Wave 0 measurements. A3, A7 are gated by plan 17-05 closeout. A5, A6 are post-deploy empirical.

## Open Questions (RESOLVED)

1. **What's Finnhub's actual free-tier rate limit and watchlist coverage?**
   - What we know: docs say 60 req/min; AAPL probe confirms field shapes.
   - What's unclear: actual 24h cap, small-cap coverage, 10b5-1 indicator surfacing.
   - **RESOLVED:** plan 17-01 Wave 0 includes a one-shot validator script (§3.1) that walks the 200-ticker watchlist, measures coverage, and either confirms the thin-EDGAR-guard plan OR triggers the co-equal-EDGAR plan with `fast-xml-parser` install.

2. **Should the agreement badge default to "unknown" when only 2 classes are populated, or downgrade gracefully to the existing 2-class agreement?**
   - What we know: Phase 16's `computeAgreement` requires both classes ACTIVE.
   - What's unclear: with 4 classes, "unknown" might be the common case (2-of-4 ACTIVE).
   - **RESOLVED:** `computeAgreementNWay` returns `'unknown'` only when fewer than 2 classes are ACTIVE. With 2+ ACTIVE, the same aligned/mixed/opposed logic applies as Phase 16. The tooltip dynamically lists the populated classes.

3. **Where does `ticker_30d_return_pct` come from for the institutional classifier?**
   - What we know: yahoo-finance2 chart() can fetch it; institutional snapshots are written at sentiment-scan time, where price_at_scan is already known.
   - What's unclear: do we cache the 30d-back price, or recompute at classifier time?
   - **RESOLVED:** institutional fetcher hits yahoo-finance2 chart() once for a 32-day window centered on (snapshot_date - 30d), picks the closest bar, and computes the 30d return. Cached internally per snapshot — the value lands in InstitutionalSnapshot.ticker_30d_return_pct. SPY return same approach but reuses the SPY fetch already in `learn/route.ts`'s `fetchSpyHistory`.

4. **Should `LearningEvent.signal_class` track only the "primary" class for an outcome (current Phase 16 behavior) or all four?**
   - What we know: Phase 16 picks the most-conviction class for the row; `delta` carries per-class booleans.
   - What's unclear: with 4 classes, "primary" gets ambiguous.
   - **RESOLVED:** keep the Phase 16 pattern. The `signal_class` column is for fast-attribution queries; the `delta` JSON carries `diffusion_hit`, `tech_hit`, `insider_hit`, `institutional_hit` so the recompute pass can attribute correctly. Primary class precedence: insider > institutional > technical > diffusion (the rarer the signal, the more attributable). Alternative: keep Phase 16's technical > diffusion order and append insider > institutional. **Decision: insider > institutional > technical > diffusion** because the new classes are the ones we want to debug first; this becomes the LearningEvent.message log ordering too.

5. **Does the existing `Horizon Brier` insights tab pick up new signal classes automatically?**
   - What we know: tab is hardcoded somewhere in InsightsDashboard.tsx (1829 lines, partially audited).
   - What's unclear: whether the data source is generic or hardcoded to ['diffusion', 'technical'].
   - **RESOLVED:** Plan 17-04 explicitly audits the Horizon Brier tab during the engine-context+UI plan. If hardcoded, extend the array to all four classes in the same plan; if generic, no change. Either way, plan 17-04 must verify before merging.

## Sources

### Primary (HIGH confidence)
- **`17-CONTEXT.md`** — User decisions D-01..D-23; locked.
- **`prisma/schema.prisma`** (read in full) — current models including the existing `signal_class` string column.
- **`src/lib/learning.ts`** (read in full) — Bayesian primitives + 12-d FEATURE_NAMES (locked at 12 — D-22).
- **`src/lib/engine-context.ts`** (read in full) — current 24-field shape with technical extension; pattern to mirror for institutional + insider.
- **`src/lib/data/finnhub.ts`** (read in full) — existing Finnhub client pattern, env var, error handling.
- **`src/lib/data/merge.ts`** (read in full) — field-level merge cascade pattern + FieldOrigin shape.
- **`src/app/api/cron/learn/route.ts`** (read in full) — current dual-class learning loop; quad-class extension is mechanical.
- **`src/app/api/cron/sentiment-scan/route.ts`** (read in full) — current parallel-sensor pattern.
- **`scripts/backfill-technical.ts`** (read in full) — Phase 16 backfill template; Phase 17 mirrors closely.
- **`src/components/EngineCalibrationPanel.tsx`** (read lines 1-450 of 601) — DualClassPanel + HorizonTable + AgreementBadge structure.
- **`src/components/InsightsDashboard.tsx`** (read tab structure at lines 60-150) — TABS array shape for adding two new tabs.
- **`src/lib/types.ts`** (read EngineCalibration + HorizonCalibration + TechnicalSnapshot at lines 217-374) — interface shapes to extend.
- **`vercel.json`** — cron schedule confirmed unchanged.
- **`.planning/REQUIREMENTS.md`** §v2 — DATA-V2-03 confirmed.
- **`.planning/phases/16-technical-analysis/16-RESEARCH.md`** (read in full, 1124 lines) — architectural template for the dual-class → quad-class extension.

### Secondary (MEDIUM confidence)
- **Finnhub API docs** at https://finnhub.io/docs/api — endpoint paths, query params, response shapes inferred from documentation; field-level confirmation deferred to plan 17-01 Wave 0 probe.
- **SEC EDGAR documentation** at https://www.sec.gov/edgar/sec-api-documentation — throttle rules, filing type codes, XML schema URIs.
- **CLAUDE.md** project guidelines — pipeline modularity, source-grounded reasoning, test discipline.

### Tertiary (LOW confidence)
- **§3.3 (classifier thresholds)** — recommended starting values; require empirical tuning post-backfill (plan 17-05 closeout).
- **§3.2 (10b5-1 detection)** — best-effort approach; may require EDGAR XML if Finnhub doesn't surface the indicator.
- **A3 (Finnhub history depth)** — based on Finnhub docs / community probes; verify at plan 17-01 Wave 0 against 5 sample tickers.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all required tools already in `package.json`; only conditional install is `fast-xml-parser` gated by §3.1 measurement.
- Architecture: HIGH — quad-class extension mirrors Phase 16's dual-class pattern verbatim; codebase fully read.
- Pitfalls: MEDIUM — derived from Phase 16 patterns + Finnhub-specific risks; #3 (bucket distribution) and #7 (10b5-1 detection) are inferential and gated by Wave 0 / closeout measurements.
- Validation: HIGH — test framework already configured; Phase 16's `technical-affects-reports.test.ts` is a working template for AC2/AC5.
- Schema migration: HIGH — 4 nullable Json column adds; no rename, no backfill.
- UI: MEDIUM — `EngineCalibrationPanel` partially audited (lines 1-450 of 601); `InsightsDashboard` audited at tab boundary (60-150 of 1829). Plan 17-04 must peek at the DualClassPanel body details before claiming "mechanical" extension.

**Research date:** 2026-04-30
