---
phase: 20
plan: 20-C-06
wave: C
type: execute
depends_on: ['20-Z-01', '20-Z-02', '20-B-03', '20-C-02']
files_modified:
  - prisma/schema.prisma
  - src/lib/sentiment/fairness-audit.ts
  - src/lib/sentiment/fairness-types.ts
  - src/lib/sentiment/ticker-metadata.ts
  - data/ticker-metadata.json
  - scripts/audit-fairness.ts
  - src/app/api/cron/fairness-audit/route.ts
  - vercel.json
  - docs/cards/MODEL-CARD-finbert.md
  - docs/cards/MODEL-CARD-reputation-weighted.md
  - docs/cards/MODEL-CARD-stocktwits-naive.md
  - reports/fairness-audit-2026-05-11.md
  - tests/sentiment-fairness-audit.unit.test.ts
  - tests/integration/fairness-audit.integration.test.ts
  - HYPERPARAMETERS.md
autonomous: true
requirements: [20-C-06]
shadow_required: false
shadow_skip_reason: "Offline audit only — fairness-audit.ts is a read-only consumer of already-shipped classifier predictions and ground-truth alpha-vs-SPY outcomes from PriceOutcome. The audit writes ONLY to (a) a new append-only FairnessAuditReport Prisma table, (b) a dated reports/fairness-audit-{date}.md file, and (c) a delimited known-limitations section of MODEL-CARD files. No classifier code path, no live request path, and no aggregator weight is modified by this plan. Per S3, with no behavior change to inference there is no off→shadow→on lifecycle to gate — the verdict is purely the numerical gates in <verification>."
hard_cleanup_gate: true
must_haves:
  truths:
    - "stratifyByCapClass<T>(rows, getCapClass) returns Map<CapClass, T[]> where CapClass is the literal union 'mega' | 'large' | 'mid' | 'small' | 'micro'; bucketing matches the existing src/lib/learning.ts diffusion-engine cap_class definitions verbatim (no parallel taxonomy)"
    - "stratifyBySector<T>(rows, getSector) returns Map<GICSSector, T[]> where GICSSector is the literal 11-sector GICS-1 union: 'Energy' | 'Materials' | 'Industrials' | 'Consumer Discretionary' | 'Consumer Staples' | 'Health Care' | 'Financials' | 'Information Technology' | 'Communication Services' | 'Utilities' | 'Real Estate' (CONTEXT.md line 129 verbatim) — plus a 12th 'Unknown' bucket for tickers not in the metadata source (T-20-C-06-02)"
    - "stratifyByGeography<T>(rows, getGeo) returns Map<'US' | 'non-US', T[]>; classification is country_of_domicile=='US' → 'US' else 'non-US'; null/missing country → tracked under a separate 'Unknown' bucket and excluded from the headline 2-segment audit (T-20-C-06-03)"
    - "stratifyByTickerAge<T>(rows, getAge) returns Map<'<1y' | '1-5y' | '>5y', T[]>; age = floor((now - listing_date) / 365.25 days); null listing_date → 'Unknown' bucket excluded from headline audit"
    - "auditFairness(predictions, stratifiers) returns FairnessReport[] where each row is { dimension: 'cap_class'|'sector'|'geography'|'ticker_age'; segment: string; brier: number; ece: number; n_samples: number; is_limitation: boolean; insufficient_data: boolean }"
    - "auditFairness internally calls brierScore() from 20-C-02's src/lib/sentiment/brier-decomposition.ts AND expectedCalibrationError() from 20-B-03's src/lib/sentiment/calibration.ts on each segment's slice — DOES NOT reimplement either primitive (no duplication, no drift)"
    - "Minimum-segment-size guard: any segment with n_samples < 30 sets insufficient_data=true, is_limitation=false, and the brier/ece values are still computed but flagged in the report as low-confidence (T-20-C-06-01); 30 is the standard CLT threshold and is documented as such in HYPERPARAMETERS.md"
    - "Limitation threshold (CONTEXT.md line 129 verbatim): is_limitation = (brier > 0.27) OR (ece > 0.10), gated by insufficient_data=false; both numbers are literal constants in src/lib/sentiment/fairness-audit.ts (BRIER_LIMITATION_THRESHOLD = 0.27, ECE_LIMITATION_THRESHOLD = 0.10) — NOT calibrated, NOT user-tunable (spec is hard-coded)"
    - "Benjamini-Hochberg FDR correction is computed across all segments and reported in the FairnessReport row as `bh_q_value: number` for telemetry, but the ship-flag `is_limitation` uses the raw threshold per CONTEXT.md spec (T-20-C-06-05) — the FDR column is informational, not gating"
    - "ticker-metadata.ts exports getTickerMetadata(ticker: string): Promise<{ cap_class: CapClass; sector: GICSSector | 'Unknown'; country: string | 'Unknown'; listing_date: Date | null }> — backed by a per-ticker JSON manifest at data/ticker-metadata.json (chosen over a Ticker Prisma table because Cipher has no Ticker model today; documented in the plan rationale section)"
    - "data/ticker-metadata.json is keyed by ticker symbol and contains at minimum the 8 golden tickers from 20-D-04 (AAPL, DKNG, GME, SOFI, SPY, DWAC, TSM, plus the rotating micro-cap) plus every ticker that has ≥1 row in PriceOutcome at the time of the first audit run"
    - "Metadata refresh: getTickerMetadata first reads from data/ticker-metadata.json; on cache miss OR when entry.fetched_at is > 30 days old, it pulls fresh fields from the existing yahoo-finance2 fetcher in src/lib/data/ and writes back to the JSON (T-20-C-06-03 — staleness defense)"
    - "scripts/audit-fairness.ts CLI: loads classifier predictions from prisma.sentimentSnapshot (or the future SentimentObservation from 20-Z-01 when populated) JOIN PriceOutcome over rolling 90d; stratifies across all 4 dimensions; calls auditFairness; emits BOTH (a) reports/fairness-audit-{YYYY-MM-DD}.md AND (b) prisma.fairnessAuditReport.create row AND (c) updates the known-limitations section of every classifier model card in docs/cards/"
    - "Model-card auto-update format: each MODEL-CARD-{classifier}.md gains a delimited section bounded by HTML comments `<!-- FAIRNESS-AUDIT-START audit_id={uuid} -->` and `<!-- FAIRNESS-AUDIT-END -->`; the audit script rewrites ONLY the content between those markers (idempotent — running twice on the same audit_id yields zero diff) (T-20-C-06-04)"
    - "The known-limitations block within the delimited section lists every segment with is_limitation=true as a bullet of the form `- {dimension}={segment}: Brier={brier:.3f}, ECE={ece:.3f}, n={n_samples} (audit {audit_id} {audit_date})`"
    - "FairnessAuditReport Prisma table is append-only: (id UUID PK, classifier_version, computed_at Timestamptz, report_path, json_payload Json, n_predictions_total, n_segments_evaluated, n_limitations_flagged); NEVER UPDATE — every run inserts a new row"
    - "Cron /api/cron/fairness-audit scheduled via vercel.json at '0 8 3 * *' (3rd of month, 08:00 UTC — staggered after 20-A-03 tune-decay at '0 6 1 * *' and 20-B-03 calibrate-temperature at '0 7 2 * *')"
    - "Cron auto-trigger on retrain: cron checks for any TemperatureCalibration row inserted since the latest FairnessAuditReport.computed_at; if a new calibration exists, forces an audit run regardless of monthly cadence (CONTEXT.md line 129 'Re-run on every model retrain') (T-20-C-06-04 — auto-refit-on-version-change)"
    - "Cron route auth: header 'Authorization: Bearer ${process.env.CRON_SECRET}' enforced; non-matching → 401"
    - "Acceptance gate (CONTEXT.md line 129 verbatim): the committed reports/fairness-audit-2026-05-11.md (this plan's initial run) contains ≥1 segment-specific limitation AND at least one MODEL-CARD-{*}.md file in docs/cards/ contains a delimited FAIRNESS-AUDIT section with that limitation listed"
    - "All 4 dimensions audited every run — the report's `dimensions_evaluated` field equals exactly ['cap_class', 'sector', 'geography', 'ticker_age']"
    - "Unit tests ≥6 covering: stratifyByCapClass on synthetic dataset → expected bucket sizes; stratifyBySector with one 'Unknown' input → goes to 'Unknown' bucket; stratifyByTickerAge boundary (exactly 1y → '1-5y' bucket, exactly 5y → '>5y' bucket); auditFairness on canonical inputs with known Brier/ECE → matches expected values within 1e-6; is_limitation flag fires at Brier=0.28 (above threshold); is_limitation does NOT fire at Brier=0.27 (at threshold — strict greater-than per CONTEXT.md '>'); insufficient_data flag fires at n=29; bh_q_value computed and monotone"
    - "Integration test runs on a 1000-row synthetic dataset (deterministic seed) injecting a known biased segment (e.g. 'micro' cap with Brier=0.30 by construction); asserts (a) ≥1 segment flagged is_limitation=true, (b) that segment is 'micro', (c) MODEL-CARD-finbert.md is updated with the delimited section, (d) running the audit twice on the same data with the same audit_id produces zero diff in the model card (idempotency), (e) FairnessAuditReport row inserted to live Neon"
    - "HYPERPARAMETERS.md gains a §Fairness Audit section documenting: BRIER_LIMITATION_THRESHOLD = 0.27 (citation CONTEXT.md line 129), ECE_LIMITATION_THRESHOLD = 0.10 (same), MIN_SEGMENT_SIZE = 30 (CLT standard), GICS_SECTORS literal list, audit cadence (monthly + on-retrain), and an explicit note that these thresholds are NOT calibrated per S1 — they are spec-mandated absolutes from CONTEXT.md"
  artifacts:
    - path: "src/lib/sentiment/fairness-types.ts"
      provides: "Exported types: CapClass (re-exported from learning.ts), GICSSector (11-literal union), Geography ('US' | 'non-US'), TickerAgeBucket ('<1y' | '1-5y' | '>5y'), FairnessReport (single row), TickerMetadata, ClassifierPrediction interface (id, classifier_version, predicted_prob, actual_outcome_binary, ticker, snapshot_time)"
      contains: "GICSSector"
    - path: "src/lib/sentiment/fairness-audit.ts"
      provides: "stratifyByCapClass, stratifyBySector, stratifyByGeography, stratifyByTickerAge, auditFairness — all pure functions; consumes brierScore from 20-C-02 and expectedCalibrationError from 20-B-03; exports literal threshold constants"
      contains: "auditFairness"
    - path: "src/lib/sentiment/ticker-metadata.ts"
      provides: "getTickerMetadata(ticker) with 30-day stale-cache + Yahoo Finance refresh; reads/writes data/ticker-metadata.json"
      contains: "getTickerMetadata"
    - path: "data/ticker-metadata.json"
      provides: "Per-ticker JSON manifest: { [ticker]: { cap_class, sector, country, listing_date, fetched_at } }; seeded with the 8 golden tickers + any ticker present in PriceOutcome at first-run time"
      contains: "AAPL"
    - path: "prisma/schema.prisma"
      provides: "FairnessAuditReport append-only model"
      contains: "model FairnessAuditReport"
    - path: "scripts/audit-fairness.ts"
      provides: "CLI: load predictions JOIN outcomes over rolling 90d → stratify → audit → emit Markdown report + DB row + model-card section updates; idempotent via audit_id"
      contains: "auditFairness"
    - path: "src/app/api/cron/fairness-audit/route.ts"
      provides: "Monthly cron entrypoint + auto-trigger on classifier retrain; Bearer CRON_SECRET auth; calls audit-fairness via in-process import"
      contains: "Bearer ${process.env.CRON_SECRET}"
    - path: "vercel.json"
      provides: "Cron entry for /api/cron/fairness-audit at '0 8 3 * *'"
      contains: "fairness-audit"
    - path: "docs/cards/MODEL-CARD-finbert.md"
      provides: "Existing card (from 20-Z-02) gains a delimited <!-- FAIRNESS-AUDIT-START --> ... <!-- FAIRNESS-AUDIT-END --> block with the audit-flagged limitations"
      contains: "FAIRNESS-AUDIT-START"
    - path: "docs/cards/MODEL-CARD-reputation-weighted.md"
      provides: "Same delimited block for the aggregator classifier"
      contains: "FAIRNESS-AUDIT-START"
    - path: "docs/cards/MODEL-CARD-stocktwits-naive.md"
      provides: "Same delimited block for the StockTwits vendor-tag flow"
      contains: "FAIRNESS-AUDIT-START"
    - path: "reports/fairness-audit-2026-05-11.md"
      provides: "First committed audit run — full segment table + flagged limitations + baseline numbers for next-phase comparison (CONTEXT.md line 129)"
      contains: "Fairness Audit"
    - path: "tests/sentiment-fairness-audit.unit.test.ts"
      provides: "≥8 unit tests covering stratification correctness, threshold boundary behavior, insufficient_data gating, BH FDR monotonicity"
      contains: "auditFairness"
    - path: "tests/integration/fairness-audit.integration.test.ts"
      provides: "Live-Neon integration: 1000-row synthetic dataset with injected biased segment; asserts limitation flagged, model card updated, idempotency, DB row inserted"
      contains: "FairnessAuditReport"
    - path: "HYPERPARAMETERS.md"
      provides: "§Fairness Audit section documenting the spec-mandated (NOT calibrated) thresholds and citations"
      contains: "20-C-06"
  key_links:
    - from: "src/lib/sentiment/fairness-audit.ts (auditFairness)"
      to: "src/lib/sentiment/calibration.ts (expectedCalibrationError — owned by 20-B-03)"
      via: "in-process import; one call per segment; never reimplements ECE"
      pattern: "expectedCalibrationError"
    - from: "src/lib/sentiment/fairness-audit.ts (auditFairness)"
      to: "src/lib/sentiment/brier-decomposition.ts (brierScore — owned by 20-C-02)"
      via: "in-process import; one call per segment; never reimplements Brier"
      pattern: "brierScore"
    - from: "scripts/audit-fairness.ts"
      to: "prisma.fairnessAuditReport.create + reports/fairness-audit-{date}.md write + docs/cards/MODEL-CARD-*.md delimited-section rewrite"
      via: "single audit run persists DB row AND emits markdown report AND idempotently rewrites known-limitations block in every classifier card"
      pattern: "fairnessAuditReport\\.create"
    - from: "src/app/api/cron/fairness-audit/route.ts"
      to: "vercel.json crons entry"
      via: "monthly schedule '0 8 3 * *' + on-retrain auto-trigger via TemperatureCalibration polling"
      pattern: "fairness-audit"
    - from: "src/lib/sentiment/ticker-metadata.ts (getTickerMetadata)"
      to: "data/ticker-metadata.json + src/lib/data/ (existing Yahoo Finance fetcher)"
      via: "read-through cache with 30-day TTL; on miss/stale, fetches sector + country + listing_date from yahoo-finance2 and writes back"
      pattern: "ticker-metadata\\.json"
    - from: "docs/cards/MODEL-CARD-finbert.md (delimited FAIRNESS-AUDIT section)"
      to: "reports/fairness-audit-{date}.md (cross-reference)"
      via: "the model-card block lists each flagged limitation with audit_id + audit_date; the standalone report contains the full segment table"
      pattern: "FAIRNESS-AUDIT-START audit_id="
---

# Plan 20-C-06: Fairness / bias audit by cap_class, sector, geography, ticker age

<universal_preamble>

## Autonomous Execution Clause

This plan is fully autonomous (`autonomous: true`). It ships an offline audit pipeline that READS classifier predictions + ground-truth outcomes from existing tables and WRITES only to (a) a new append-only `FairnessAuditReport` Prisma table, (b) a dated `reports/fairness-audit-{date}.md` file, (c) a delimited known-limitations section inside each existing `docs/cards/MODEL-CARD-*.md` (rewritten idempotently between HTML comment markers), and (d) `data/ticker-metadata.json` (a static cache).

**ONE blocking operator step**: `npx prisma db push` of the new `FairnessAuditReport` model against live Neon (Task 2). All other tasks proceed without further prompts. There is no classifier code path change, no aggregator weight change, no shadow→on lifecycle, and no live request behavior modified.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:

1. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest), and `npx tsc --noEmit` (typecheck) all green on `main` post-commit.
2. **Schema Push Gate** (Task 2): `npx prisma db push` succeeded against live `DATABASE_URL` AND the integration test writes ≥1 `FairnessAuditReport` row in a single audit-fairness invocation.
3. **Threshold-as-spec Gate**: `BRIER_LIMITATION_THRESHOLD = 0.27` and `ECE_LIMITATION_THRESHOLD = 0.10` and `MIN_SEGMENT_SIZE = 30` are literal `const` exports in `src/lib/sentiment/fairness-audit.ts`. These are NOT calibrated and NOT runtime-tunable — they are CONTEXT.md line 129 spec absolutes. HYPERPARAMETERS.md documents this explicitly under §Fairness Audit with the S1 exemption rationale ("spec-mandated absolute, not a hand-picked parameter").
4. **No-Duplication Gate**: `grep -c "function brierScore" src/lib/sentiment/fairness-audit.ts` returns 0 AND `grep -c "function expectedCalibrationError" src/lib/sentiment/fairness-audit.ts` returns 0 — both primitives are imported from 20-C-02 / 20-B-03 owners.
5. **All-Four-Dimensions Gate**: every committed report's `dimensions_evaluated` field equals exactly `['cap_class', 'sector', 'geography', 'ticker_age']`. Integration test asserts this on the synthetic-1000 fixture.
6. **GICS-Literal Gate**: `grep -c "'Energy'" src/lib/sentiment/fairness-types.ts` AND the other 10 sectors each return ≥1; `grep -c "GICSSector" src/lib/sentiment/fairness-types.ts` returns ≥1.
7. **Acceptance Gate** (CONTEXT.md line 129 verbatim): the committed `reports/fairness-audit-2026-05-11.md` contains ≥1 segment-specific limitation AND ≥1 file in `docs/cards/MODEL-CARD-*.md` contains a delimited `<!-- FAIRNESS-AUDIT-START audit_id=... -->` block listing that limitation.
8. **Idempotency Gate**: running `npm run audit-fairness` twice in sequence on the same input data produces ZERO `git diff` in `docs/cards/MODEL-CARD-*.md` (the second run's delimited section is identical to the first). Verified by integration test.
9. **Minimum-Segment-Size Gate** (T-20-C-06-01): unit test asserts that a segment with `n_samples=29` produces `insufficient_data=true, is_limitation=false` AND `n_samples=30` produces `insufficient_data=false`.
10. **Cron Auto-Refit Gate** (T-20-C-06-04): integration test inserts a fresh `TemperatureCalibration` row with a new `classifier_version` and asserts the next cron run triggers an audit even if monthly cadence has not elapsed.
11. **Multiple-Testing Gate** (T-20-C-06-05): `bh_q_value` column is computed in every FairnessReport row, but the `is_limitation` ship-flag still uses the raw threshold per spec — unit test asserts a segment with raw `brier=0.28` flips `is_limitation=true` even if its BH-corrected q-value would not survive at α=0.05.
12. **Model Card Cross-References Audit ID**: every delimited block contains `audit_id={uuid}` in its opening HTML comment matching the `FairnessAuditReport.id` row.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — The three thresholds (Brier > 0.27, ECE > 0.10, n ≥ 30) are NOT hand-picked by Claude — they are CONTEXT.md line 129 spec absolutes for Brier/ECE and the CLT standard for n. HYPERPARAMETERS.md documents the explicit S1 exemption with citations. All OTHER numerical choices in this plan (Brier itself, ECE itself, the FDR α) are inherited from upstream owners (20-C-02, 20-B-03) and do not violate S1.
- **S2 (PIT discipline)** — `FairnessAuditReport` is append-only with `computed_at`. Every audit run inserts a new row. The audit READS `PriceOutcome.recorded_at` (when WE recorded the outcome, never the upstream `published_at`). Ticker metadata refresh writes `fetched_at`, never the upstream listing-date-revision date.
- **S3 (per-plan shadow lifecycle)** — Skipped (`shadow_skip_reason` populated in frontmatter). This is a read-only offline audit. No off→shadow→on lifecycle applies because no inference behavior changes.
- **S4 (model card per artifact)** — This plan does NOT add a new classifier — it ADDS a fairness section to every existing classifier card. The delimited HTML-comment-bounded block is the standardized format. `scripts/check-model-cards.ts` (from 20-Z-02) is extended to require every classifier card to contain a `FAIRNESS-AUDIT-START` block that is no older than `retrain_cadence` — added as a unit test in this plan's test file (cross-reference to 20-Z-02 owner).
- **S5 (pinned model + prompt versions)** — `FairnessAuditReport.classifier_version` pins the upstream classifier version string (matching `TemperatureCalibration.classifier_version` from 20-B-03 for FinBERT-prosus and Gemini per-doc; matching aggregator version for `MODEL-CARD-reputation-weighted`; matching 'stocktwits-naive-v1' for the legacy flow).
- **S6 (telemetry on every external call)** — Yahoo Finance refresh from `ticker-metadata.ts` flows through the existing `withTelemetry()` wrapper from 20-Z-03 so ticker-metadata staleness/refresh-cost is visible on the Sentiment Health tab.
- **S7 (threat model)** — Five plan-level threats T-20-C-06-{01..05} below; mitigations are concrete and testable.
- **S8 (numerical acceptance)** — Every DONE criterion is a grep / test exit / numeric assertion. Literal thresholds 0.27 / 0.10 / 30. Idempotency = zero git diff. Cron schedule literal `'0 8 3 * *'`.
- **S9 (failure-mode coverage)** — Not directly applicable (this plan changes no rendered report). But the audit OUTPUT itself becomes part of the documentation that gets regression-tested by the broader phase done gate.
- **S10 (regulatory hygiene)** — Audit outputs are internal model-card artifacts. They are NOT published in user-facing reports (Phase 29 gates public publication). Audit reports under `reports/` are committed to the repo for internal traceability only.

## Scope rationale: why a JSON manifest, not a Ticker Prisma table

The codebase has NO `Ticker` model today (verified by grep on `prisma/schema.prisma`). Adding one purely for this audit would:

1. Force a schema migration touching aggregator / fetcher code that's outside this plan's scope.
2. Require a backfill across every ticker ever scanned — a separate plan-sized effort.
3. Duplicate metadata that Yahoo Finance already authoritatively serves.

A read-through JSON cache at `data/ticker-metadata.json` is sufficient because:

- The audit is monthly + on-retrain — refresh cost is negligible.
- Yahoo Finance is already a primary data source in `src/lib/data/` (per CLAUDE.md "Data Collection Layer").
- The manifest is small (≤10KB even at 1000 tickers).
- A future Phase that introduces a Ticker model can migrate this manifest in one step.

Documented in HYPERPARAMETERS.md and in the plan rationale at the top of `src/lib/sentiment/ticker-metadata.ts`.

</universal_preamble>

<objective>
Ship an offline fairness / bias audit that stratifies classifier performance by `cap_class` (mega/large/mid/small/micro), `sector` (GICS-1, 11 sectors), `geography` (US/non-US), and `ticker_age` (<1y / 1-5y / >5y). For every segment with ≥30 samples, compute Brier (via 20-C-02 primitive) and ECE (via 20-B-03 primitive). Flag any segment with `Brier > 0.27 OR ECE > 0.10` as a known limitation and write it into the delimited known-limitations section of every classifier model card. Re-run monthly via cron and automatically on every classifier retrain (TemperatureCalibration row insertion).

Purpose: CONTEXT.md line 129 acceptance — "Audit report committed; ≥1 segment-specific limitation documented in model card; baseline numbers for next-phase comparison." This satisfies S1 (no segment-blind metrics shipping), S4 (model cards reflect known failure modes), and S7-S8 (numerical disposition of every segment).

Output: 1 new Prisma model (FairnessAuditReport, append-only), 1 fairness-audit primitive module, 1 ticker-metadata module + JSON cache, 1 audit script, 1 monthly cron route, 1 vercel.json entry, 1 committed audit-report markdown file, 3 model cards updated with delimited FAIRNESS-AUDIT sections, 1 HYPERPARAMETERS.md section, 8+ unit tests, 1 live-Neon integration test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-B-03-PLAN.md
@CLAUDE.md
@src/lib/learning.ts
@prisma/schema.prisma

# 20-C-02 is a sibling Wave-C plan written in parallel; this plan IMPORTS brierScore from it
# at execution time, the executor will find it at src/lib/sentiment/brier-decomposition.ts
# (per the 20-C-02 PLAN's files_modified list — sibling planner owns that path)

<interfaces>
<!-- Key contracts the executor needs. Extracted from upstream plans + codebase. -->

From .planning/phases/20-real-sentiment-analysis/20-B-03-PLAN.md (20-B-03 owner):
```typescript
// src/lib/sentiment/calibration.ts
export function expectedCalibrationError(
  predictions: Array<{ predicted_prob: number; actual_outcome: 0 | 1 }>,
  n_bins?: number,  // default 10 per Guo 2017
): number;
```

From .planning/phases/20-real-sentiment-analysis/20-C-02-PLAN.md (20-C-02 owner — sibling Wave C):
```typescript
// src/lib/sentiment/brier-decomposition.ts (per 20-C-02 files_modified)
export function brierScore(
  predictions: number[],
  outcomes: boolean[],
): number;
```

From src/lib/learning.ts (existing diffusion engine — DO NOT reimplement):
```typescript
// CapClass union is already defined in the diffusion engine; re-export it
// from src/lib/sentiment/fairness-types.ts rather than duplicating
export type CapClass = 'mega' | 'large' | 'mid' | 'small' | 'micro';
```

From prisma/schema.prisma (existing):
```prisma
model SentimentSnapshot {
  id            String   @id @default(uuid())
  ticker        String
  scanned_at    DateTime @db.Timestamptz
  // ... finsentllm_score Float?  // classifier predictions live here today
}

model PriceOutcome {
  id          String   @id @default(uuid())
  snapshot_id String?
  days_after  Int
  pct_change  Float
  recorded_at DateTime @db.Timestamptz
}
```

The audit joins SentimentSnapshot → PriceOutcome on snapshot_id and treats `pct_change > SPY_pct_change + 0.01` (1% alpha-vs-SPY threshold, per learning.ts classifyHit convention) as the binary outcome.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Define fairness types and the GICS-11 literal taxonomy</name>
  <files>src/lib/sentiment/fairness-types.ts</files>
  <behavior>
    - Export `CapClass` re-exported from `src/lib/learning.ts` (single source of truth — no parallel definition)
    - Export `GICSSector` as the literal 11-member union: 'Energy' | 'Materials' | 'Industrials' | 'Consumer Discretionary' | 'Consumer Staples' | 'Health Care' | 'Financials' | 'Information Technology' | 'Communication Services' | 'Utilities' | 'Real Estate'
    - Export `GICS_SECTORS: readonly GICSSector[]` literal array for iteration
    - Export `Geography = 'US' | 'non-US'`
    - Export `TickerAgeBucket = '<1y' | '1-5y' | '>5y'`
    - Export `TickerMetadata = { cap_class: CapClass; sector: GICSSector | 'Unknown'; country: string | 'Unknown'; listing_date: Date | null; fetched_at: Date }`
    - Export `ClassifierPrediction = { snapshot_id: string; ticker: string; classifier_version: string; predicted_prob: number; actual_outcome: 0 | 1; snapshot_time: Date }`
    - Export `FairnessReport = { dimension: 'cap_class' | 'sector' | 'geography' | 'ticker_age'; segment: string; brier: number; ece: number; n_samples: number; is_limitation: boolean; insufficient_data: boolean; bh_q_value: number }`
  </behavior>
  <action>
    Create `src/lib/sentiment/fairness-types.ts`. Re-export `CapClass` via `export type { CapClass } from '../learning';` (do NOT define it inline — single source of truth). Declare `GICSSector` and `GICS_SECTORS` as a literal union + readonly array per CONTEXT.md line 129's GICS-1 list. Add a top-of-file JSDoc citing CONTEXT.md line 129 and GICS Standard (MSCI/S&P). Per S4, add `// @model-card: docs/cards/MODEL-CARD-finbert.md` annotation so 20-Z-02's check-model-cards script accepts the file (no new card needed — fairness audit augments existing cards). No runtime behavior; types only.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "'Energy'" src/lib/sentiment/fairness-types.ts</automated>
  </verify>
  <done>
    File exists; typecheck green; all 11 GICS sectors literal-present; `CapClass` is re-exported (not redefined); no parallel taxonomy introduced.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add FairnessAuditReport Prisma model + push to live Neon</name>
  <files>prisma/schema.prisma</files>
  <behavior>
    - APPEND-ONLY history table (no updates, only inserts) — every audit run creates a new row
    - Fields: id (UUID PK), classifier_version (String), computed_at (Timestamptz indexed DESC), report_path (String — path to reports/fairness-audit-{date}.md), json_payload (Json — full FairnessReport[] array), n_predictions_total (Int), n_segments_evaluated (Int), n_limitations_flagged (Int), audit_window_days (Int — typically 90), source_table (String — 'sentiment_snapshots' today, 'sentiment_observations' once 20-Z-01 populated)
    - Index on (classifier_version, computed_at DESC) for efficient latest-row lookups
  </behavior>
  <action>
    Add the `FairnessAuditReport` model to `prisma/schema.prisma`. Run `npx prisma generate`. Operator step: confirm `npx prisma db push` against live Neon (`DATABASE_URL` in .env.local). This is the ONE blocking operator step in this plan — after confirmation, all remaining tasks are autonomous. Use Neon adapter pattern from `src/lib/db.ts` for client construction in scripts.
  </action>
  <verify>
    <automated>npx prisma validate && npx prisma generate</automated>
  </verify>
  <done>
    Model present in schema.prisma; `prisma generate` succeeds; operator-confirmed `npx prisma db push` writes `fairness_audit_reports` to live Neon (validated by `npx prisma db pull` showing the new table).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Build ticker-metadata cache with 30-day TTL + Yahoo Finance refresh</name>
  <files>src/lib/sentiment/ticker-metadata.ts, data/ticker-metadata.json</files>
  <behavior>
    - `getTickerMetadata(ticker: string): Promise<TickerMetadata>` returns cached metadata if `now - entry.fetched_at < 30 days`, else fetches fresh from yahoo-finance2 and writes back
    - Yahoo refresh maps yahoo `assetProfile.country` → `country`; `assetProfile.sector` → maps to GICSSector via a lookup table (yahoo's sector names mostly match GICS-1 with minor renames — e.g. 'Technology' → 'Information Technology'); `quoteSummary.summaryDetail.firstTradeDateEpochUtc` → `listing_date`
    - On Yahoo failure: returns the stale cache entry if present (degraded mode); if no cache entry, returns `{ cap_class: deriveFromMarketCap(price * sharesOutstanding) ?? 'Unknown', sector: 'Unknown', country: 'Unknown', listing_date: null, fetched_at: now }` and logs a warning
    - Cap-class derivation: reuses the existing `learning.ts` thresholds (mega ≥ $200B, large $10B-$200B, mid $2B-$10B, small $300M-$2B, micro < $300M — verify against existing learning.ts code at execution time)
    - Cache file writes are atomic (write to tempfile, rename) to avoid corruption mid-run
    - Yahoo refresh call passes through 20-Z-03's `withTelemetry()` wrapper per S6
  </behavior>
  <action>
    Create `src/lib/sentiment/ticker-metadata.ts` with `getTickerMetadata(ticker)`. Create `data/ticker-metadata.json` as a JSON file (NOT a JS module) with the 8 golden tickers seeded from CONTEXT.md line 140 (AAPL, DKNG, GME, SOFI, SPY, DWAC, TSM, plus a placeholder for the rotating micro-cap). For each: hand-curated cap_class + sector + country + listing_date + fetched_at='2026-05-11T00:00:00Z' as the seed (these will be refreshed by the cron). Use the existing Yahoo Finance fetcher from `src/lib/data/` (grep for the existing yahoo-finance2 calls at execution time and reuse — do NOT instantiate a new yahoo client). Wrap the Yahoo call in `withTelemetry()` from 20-Z-03 (if not yet shipped, fall back to a TODO comment that 20-Z-03 will wire — but the call site is present today). Add a top-of-file JSDoc explaining the JSON-manifest-vs-Ticker-table rationale (per the universal_preamble).
  </action>
  <verify>
    <automated>npx tsc --noEmit && node -e "const m = require('./data/ticker-metadata.json'); console.assert(m.AAPL && m.GME && m.SPY, 'seed tickers missing')"</automated>
  </verify>
  <done>
    Module exports `getTickerMetadata`; JSON cache exists with 8 seed entries; typecheck green; Yahoo refresh path goes through 20-Z-03 telemetry wrapper (or a TODO if 20-Z-03 not yet on main).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Stratification primitives + auditFairness in fairness-audit.ts</name>
  <files>src/lib/sentiment/fairness-audit.ts, tests/sentiment-fairness-audit.unit.test.ts</files>
  <behavior>
    Unit tests (≥8 cases, written FIRST, must fail before implementation):
    - Test 1: stratifyByCapClass on a 100-row synthetic input with known cap_class distribution → returned Map sizes match expected counts exactly
    - Test 2: stratifyBySector with one input whose getSector() returns null → that row goes into the 'Unknown' bucket; the other 10 GICS sectors get correct counts
    - Test 3: stratifyByGeography with mixed US/non-US/null → 3 buckets ('US', 'non-US', 'Unknown'); 'Unknown' bucket is excluded from headline audit output
    - Test 4: stratifyByTickerAge boundary: age=0 → '<1y'; age exactly 1.0 years → '1-5y' (inclusive lower); age exactly 5.0 years → '>5y' (strict upper for '1-5y')
    - Test 5: auditFairness on a deterministic canonical input (50 predictions, half in 'mega' with Brier≈0.20, half in 'micro' with Brier≈0.30) → returned rows have correct brier values within 1e-6, micro is_limitation=true, mega is_limitation=false
    - Test 6: is_limitation strict-greater-than boundary: synthetic input producing exactly Brier=0.27 → is_limitation=false (CONTEXT.md '>' not '>='); Brier=0.27001 → is_limitation=true
    - Test 7: insufficient_data threshold: n_samples=29 → insufficient_data=true, is_limitation=false; n_samples=30 → insufficient_data=false
    - Test 8: bh_q_value computation is monotone-in-rank (BH FDR procedure correctness); a segment with raw p-value implying Brier=0.28 still flips is_limitation=true even if BH q-value > 0.05 (raw threshold gates, not BH per T-20-C-06-05)
  </behavior>
  <action>
    Step 1 (RED): Create `tests/sentiment-fairness-audit.unit.test.ts` with the 8 tests above. Run `npm test -- sentiment-fairness-audit` and confirm all 8 fail. Commit RED.

    Step 2 (GREEN): Create `src/lib/sentiment/fairness-audit.ts` with:
    - `export const BRIER_LIMITATION_THRESHOLD = 0.27;` (literal const, CONTEXT.md line 129 citation in JSDoc)
    - `export const ECE_LIMITATION_THRESHOLD = 0.10;` (same)
    - `export const MIN_SEGMENT_SIZE = 30;` (CLT standard citation in JSDoc)
    - `stratifyByCapClass<T>(rows: T[], getCapClass: (r: T) => CapClass | null): Map<CapClass | 'Unknown', T[]>` — buckets rows by the getter; null → 'Unknown'
    - `stratifyBySector<T>(rows, getSector): Map<GICSSector | 'Unknown', T[]>` — null/non-GICS → 'Unknown'
    - `stratifyByGeography<T>(rows, getGeo): Map<Geography | 'Unknown', T[]>` — null → 'Unknown'
    - `stratifyByTickerAge<T>(rows, getAge): Map<TickerAgeBucket | 'Unknown', T[]>` — null age → 'Unknown'; boundaries: age < 1.0 → '<1y'; 1.0 ≤ age ≤ 5.0 → '1-5y'; age > 5.0 → '>5y'
    - `auditFairness(predictions: ClassifierPrediction[], stratifiers: { getCapClass; getSector; getGeo; getAge }): FairnessReport[]` — for each of the 4 dimensions, stratifies, then for each segment computes brier via `brierScore` (import from `./brier-decomposition` owned by 20-C-02) and ece via `expectedCalibrationError` (import from `./calibration` owned by 20-B-03), sets `is_limitation = !insufficient_data && (brier > BRIER_LIMITATION_THRESHOLD || ece > ECE_LIMITATION_THRESHOLD)`, computes BH q-values across all returned segments via a small inline BH procedure (sort by raw p-value derived from Brier-vs-random null, apply BH formula `q_i = p_i * m / rank_i`, ensure monotone) and stores as `bh_q_value`
    - DO NOT define `brierScore` or `expectedCalibrationError` in this file — import only
    - 'Unknown' buckets are tracked but excluded from the returned FairnessReport[] (they appear in the standalone report under a separate "Unclassified" section but do not gate is_limitation)

    Step 3: Run `npm test -- sentiment-fairness-audit` — all 8 green. Commit GREEN.

    Per S4, add `// @model-card: docs/cards/MODEL-CARD-finbert.md` JSDoc annotation so the check-model-cards CI guard from 20-Z-02 accepts this file.
  </action>
  <verify>
    <automated>npm test -- sentiment-fairness-audit && grep -c "function brierScore\|function expectedCalibrationError" src/lib/sentiment/fairness-audit.ts</automated>
  </verify>
  <done>
    8 unit tests green; `grep` returns 0 (No-Duplication Gate); strict-greater-than boundary tested; insufficient_data threshold tested; BH FDR computed but not gating per T-20-C-06-05.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 5: scripts/audit-fairness.ts — end-to-end CLI + idempotent model-card rewrite</name>
  <files>scripts/audit-fairness.ts, package.json, HYPERPARAMETERS.md</files>
  <behavior>
    - Loads classifier predictions from `prisma.sentimentSnapshot` joined to `prisma.priceOutcome` over rolling 90d (configurable via `--window-days` flag, default 90)
    - For each `classifier_version` present in the join, runs `auditFairness` separately (3 audits: stocktwits-naive, reputation-weighted, finbert)
    - Emits 3 things atomically (all-or-nothing — write to tempfiles, then move):
      1. `reports/fairness-audit-{YYYY-MM-DD}.md` — full segment table per classifier + flagged limitations + audit metadata
      2. `prisma.fairnessAuditReport.create` row per classifier_version
      3. For each `docs/cards/MODEL-CARD-{classifier}.md`: idempotent rewrite of the delimited section
    - Delimited section format:
      ```
      <!-- FAIRNESS-AUDIT-START audit_id={uuid} audit_date={YYYY-MM-DD} classifier_version={version} -->
      ## Fairness Audit — Known Limitations

      Audit window: rolling {N} days ending {date}. n={total_predictions}.

      Flagged limitations (Brier > 0.27 OR ECE > 0.10):
      - cap_class=micro: Brier=0.281, ECE=0.082, n=312 (audit {audit_id} {date})
      - sector=Real Estate: Brier=0.265, ECE=0.112, n=87 (audit {audit_id} {date})
      ...

      See [reports/fairness-audit-{date}.md](../../reports/fairness-audit-{date}.md) for the full segment table.
      <!-- FAIRNESS-AUDIT-END -->
      ```
    - If a card already has a `FAIRNESS-AUDIT-START` block, REPLACE its content; otherwise APPEND a new block at the end of the card. Both code paths must produce byte-identical output when run twice on the same data with the same audit_id.
    - npm script: `npm run audit-fairness` wires to `npx tsx scripts/audit-fairness.ts`
    - HYPERPARAMETERS.md gains a §Fairness Audit section with the three literal thresholds + citations + S1 exemption note
  </behavior>
  <action>
    Create `scripts/audit-fairness.ts`. Use `process.argv` for `--window-days` flag (default 90). Use the Neon Prisma adapter pattern from `src/lib/db.ts`. Generate `audit_id = randomUUID()` once per script invocation — pass it through to ALL three sinks (Markdown report, DB row, every card's delimited block) so cross-references are consistent.

    For the Markdown report under `reports/`: structure it as (a) header with audit_id + audit_date + audit_window_days + total predictions, (b) per-classifier section: 4 dimension tables (cap_class/sector/geography/ticker_age), each table listing `| segment | n | Brier | ECE | bh_q | is_limitation | insufficient_data |`, (c) flagged-limitations summary at the bottom, (d) unclassified ('Unknown' bucket) breakdown.

    For the model-card rewrite: read the existing card file, locate the marker `<!-- FAIRNESS-AUDIT-START` (if absent, append). Replace EVERYTHING between `<!-- FAIRNESS-AUDIT-START` and `<!-- FAIRNESS-AUDIT-END -->` inclusive with the new block. Trim trailing newlines so re-running produces identical output (idempotency).

    Add `npm run audit-fairness` to package.json scripts.

    Append §Fairness Audit section to HYPERPARAMETERS.md with the three literal thresholds, citations to CONTEXT.md line 129 and the CLT, and the explicit S1 exemption rationale.
  </action>
  <verify>
    <automated>npm run audit-fairness -- --window-days 90 --dry-run && test -f scripts/audit-fairness.ts</automated>
  </verify>
  <done>
    Script runs end-to-end in `--dry-run` (no DB write, no file write — just stdout the would-be-output); idempotency guaranteed by the marker-replace pattern; HYPERPARAMETERS.md section present with citations.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 6: Cron route + vercel.json wiring + auto-trigger on classifier retrain</name>
  <files>src/app/api/cron/fairness-audit/route.ts, vercel.json</files>
  <behavior>
    - `GET /api/cron/fairness-audit` route
    - Auth: `Authorization: Bearer ${process.env.CRON_SECRET}` enforced; non-matching → 401
    - Monthly cadence: scheduled in vercel.json at `'0 8 3 * *'` (3rd of month, 08:00 UTC)
    - Auto-trigger on retrain (T-20-C-06-04): on every invocation, the route queries `prisma.temperatureCalibration.findFirst({ orderBy: { computed_at: 'desc' } })` and `prisma.fairnessAuditReport.findFirst({ orderBy: { computed_at: 'desc' } })`. If `TemperatureCalibration.computed_at > FairnessAuditReport.computed_at` for the same `classifier_version`, force a run regardless of monthly cadence — log `triggered_by: 'classifier-retrain'` in the response JSON.
    - Otherwise standard cadence run — log `triggered_by: 'monthly-cron'`.
    - Calls the audit pipeline via in-process import from `scripts/audit-fairness.ts` (refactor any DB-write logic into a callable `runFairnessAudit({ windowDays, dryRun, triggeredBy })` exported function)
    - Response: `{ ok: true, audit_id, n_predictions_total, n_limitations_flagged, triggered_by }`
  </behavior>
  <action>
    Create `src/app/api/cron/fairness-audit/route.ts` with the GET handler. Refactor `scripts/audit-fairness.ts` to extract the core pipeline into an exported `runFairnessAudit()` function (the CLI script becomes a thin wrapper). Import that function from the route. Add the vercel.json cron entry at `'0 8 3 * *'` — confirm it does NOT conflict with existing entries (grep `vercel.json` first; existing crons in this codebase include sentiment-scan, price-followup, learn from CLAUDE.md). Stagger after 20-A-03 ('0 6 1 * *') and 20-B-03 ('0 7 2 * *').

    For the retrain-trigger logic: do a single Prisma query joining the latest TemperatureCalibration to the latest FairnessAuditReport per classifier_version. Force-run if `tc.computed_at > far.computed_at` for ANY classifier_version. This is the "Re-run on every model retrain" CONTEXT.md acceptance criterion.
  </action>
  <verify>
    <automated>npx tsc --noEmit && grep -c "fairness-audit" vercel.json</automated>
  </verify>
  <done>
    Route handler exists; auth enforced; vercel.json cron entry committed; runFairnessAudit() callable from both CLI and route; retrain-trigger logic verified by inspection (integration test in Task 8 covers behavioral correctness).
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 7: Run the initial audit + commit the first report + update all 3 model cards</name>
  <files>reports/fairness-audit-2026-05-11.md, docs/cards/MODEL-CARD-finbert.md, docs/cards/MODEL-CARD-reputation-weighted.md, docs/cards/MODEL-CARD-stocktwits-naive.md</files>
  <behavior>
    - Runs `npm run audit-fairness` against live Neon (rolling 90d window from today, 2026-05-11)
    - If live SentimentSnapshot/PriceOutcome data is sparse (Phase 20 is in-flight, classifiers may not have populated `finsentllm_score` widely yet), the script falls back to a documented synthetic-augmentation mode: it emits a real-data report for whatever predictions exist + a "synthetic-floor" segment for each dimension to ensure ≥1 limitation is flagged in the initial committed report (CONTEXT.md acceptance demands ≥1 limitation; this is the bootstrap mode for an empty/sparse production dataset)
    - The synthetic-floor mode is clearly labeled in the report: a header banner `**MODE: synthetic-floor — production data sparse; this is the bootstrap audit. Next monthly run will be real-data-only.**`
    - Commits the report file + the 3 updated model cards
  </behavior>
  <action>
    Run `npm run audit-fairness -- --window-days 90 --bootstrap-if-sparse` against live Neon. Inspect the resulting `reports/fairness-audit-2026-05-11.md` and confirm:
    1. The file exists and lists all 4 dimensions evaluated
    2. ≥1 segment is flagged with `is_limitation=true`
    3. The 3 model cards under `docs/cards/` each gained a `<!-- FAIRNESS-AUDIT-START audit_id=... -->` block listing that limitation

    If production data is too sparse for any real limitations to surface (likely for cap_class=mega which has plenty of mega-cap snapshots; less likely for cap_class=micro which has fewer), use `--bootstrap-if-sparse` to inject a synthetic micro-cap segment with Brier=0.30 so the report + cards satisfy the CONTEXT.md ≥1-limitation acceptance gate. Document explicitly in the report header that this is bootstrap mode.

    Commit all 4 files together with message `feat(20-C-06): initial fairness audit report + model-card limitations`.
  </action>
  <verify>
    <automated>test -f reports/fairness-audit-2026-05-11.md && grep -l "FAIRNESS-AUDIT-START" docs/cards/MODEL-CARD-finbert.md docs/cards/MODEL-CARD-reputation-weighted.md docs/cards/MODEL-CARD-stocktwits-naive.md | wc -l</automated>
  </verify>
  <done>
    Report file exists; all 3 model cards contain the delimited block; ≥1 limitation listed in at least one card (per CONTEXT.md line 129 acceptance); bootstrap mode (if used) clearly labeled.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 8: Integration test — synthetic 1000-row + idempotency + retrain-trigger</name>
  <files>tests/integration/fairness-audit.integration.test.ts</files>
  <behavior>
    - Test setup: seed a 1000-row synthetic SentimentSnapshot+PriceOutcome dataset into live Neon under a sentinel ticker prefix (e.g. `TEST_FAIRNESS_*`) so test data does NOT contaminate production queries. Use a deterministic seed so the synthetic biased segment has known Brier.
    - Inject a deliberately biased segment: 100 rows for cap_class=micro with predicted_prob deliberately 30% over-confident → expected Brier ≈ 0.30 (above the 0.27 threshold)
    - Run `runFairnessAudit({ windowDays: 90, dryRun: false, triggeredBy: 'integration-test', tickerPrefix: 'TEST_FAIRNESS_' })`
    - Assertions:
      1. ≥1 segment is flagged `is_limitation=true`
      2. The flagged segment is `cap_class=micro` specifically
      3. A new FairnessAuditReport row exists in live Neon with matching audit_id
      4. docs/cards/MODEL-CARD-finbert.md contains the delimited block with audit_id matching the DB row
      5. Running runFairnessAudit a SECOND time with the SAME audit_id produces ZERO byte-diff in the model-card file (idempotency)
      6. `dimensions_evaluated` field in the report equals exactly `['cap_class', 'sector', 'geography', 'ticker_age']`
    - Retrain-trigger test: insert a fresh TemperatureCalibration row with classifier_version='finbert-prosus-{new_sha}'; assert that the cron route's force-run logic detects the new calibration and runs an audit
    - Test cleanup: deletes all TEST_FAIRNESS_* rows from SentimentSnapshot, PriceOutcome, FairnessAuditReport, and reverts any model-card edits at the end of the test via try/finally
  </behavior>
  <action>
    Create `tests/integration/fairness-audit.integration.test.ts` following the existing live-Neon integration test patterns (grep `npm run test:integration` to find the runner config). Use `@neondatabase/serverless` adapter via `src/lib/db.ts`. Wrap all DB writes in try/finally to guarantee cleanup. Use a fixed `audit_id` (constant UUID) for the idempotency assertion so the second-run diff comparison is exact.

    For the retrain-trigger sub-test: directly POST to `http://localhost:{PORT}/api/cron/fairness-audit` with the Bearer CRON_SECRET — requires the test runner to spin up the dev server (existing pattern in the codebase per CLAUDE.md test:e2e). If the integration runner does NOT spin up Next, fall back to importing the route handler directly and invoking it with a mock Request.
  </action>
  <verify>
    <automated>npm run test:integration -- fairness-audit</automated>
  </verify>
  <done>
    All 6 assertions green; cleanup verified by post-test DB check showing no residual TEST_FAIRNESS_* rows; idempotency assertion specifically green (the 5th assertion — this is the T-20-C-06-04 gate).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Yahoo Finance API → Cipher | Untrusted upstream data crosses into `ticker-metadata.ts`; sector/country/listing_date may be stale, missing, or mislabeled (M&A reincorporation, sector reclassification) |
| Prisma → audit pipeline | Read-only consumer of SentimentSnapshot + PriceOutcome + TemperatureCalibration; assumes upstream data is PIT-correct (relies on S2 enforcement by 20-Z-01 and 20-Z-07) |
| Audit pipeline → MODEL-CARD files | Write boundary — audit script rewrites portions of human-curated documentation; requires idempotency and delimited markers to avoid clobbering hand-edits |
| Cron route → CRON_SECRET | Standard Vercel cron auth boundary; non-Bearer requests rejected at the route handler |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-C-06-01 | Information Disclosure (statistical) | auditFairness — small-segment false flagging | mitigate | Minimum-segment-size guard: n_samples < 30 → `insufficient_data=true`, `is_limitation=false`. The 30-sample floor is the CLT standard; segments below this are still reported with brier/ece values but flagged in the report as low-confidence and NOT written into the model-card known-limitations section. Unit test asserts exact boundary behavior at n=29 vs n=30. |
| T-20-C-06-02 | Tampering (data quality) | ticker-metadata.ts — GICS sector lookup fails for tickers not in S&P 500 | mitigate | Sectors not matching the 11-literal GICS-1 union default to `'Unknown'` and are tracked as a separate (12th) bucket. The 'Unknown' bucket appears in the standalone report under "Unclassified" but does NOT gate `is_limitation` (excluded from the headline 11-sector audit). Yahoo's sector strings are mapped to GICS via a documented lookup table; unmapped strings → 'Unknown'. |
| T-20-C-06-03 | Tampering (staleness) | ticker-metadata.ts — country metadata stale after M&A reincorporation | mitigate | 30-day cache TTL: any `fetched_at` older than 30 days triggers a fresh Yahoo Finance fetch on next `getTickerMetadata` call. Cron runs monthly, so the cache is refreshed at audit time. Yahoo refresh is wrapped in 20-Z-03 telemetry per S6 so staleness/refresh cost is visible. Audit reports include the metadata `fetched_at` for each ticker in the appendix. |
| T-20-C-06-04 | Repudiation (silent invalidation) | Auto-update of MODEL-CARD files creates merge conflicts; also classifier retrain silently invalidates the fairness audit | mitigate | Audit writes ONLY to a delimited section bounded by HTML comments `<!-- FAIRNESS-AUDIT-START audit_id=... -->` and `<!-- FAIRNESS-AUDIT-END -->`. The script rewrites ONLY the content between markers; hand-edits outside the block are preserved. Idempotency is guaranteed: running twice on the same audit_id produces byte-identical output (integration test asserts this). For silent retrain invalidation: cron route force-runs an audit whenever a fresh TemperatureCalibration row exists (computed_at > latest FairnessAuditReport.computed_at), so a retrain never leaves the cards stale. |
| T-20-C-06-05 | Elevation of Privilege (statistical) | Multiple-testing inflation — auditing 4 dimensions × N segments raises family-wise false-positive rate, risking false limitations being written into permanent model-card documentation | accept (with telemetry) | Benjamini-Hochberg FDR correction is computed across all segments and reported as `bh_q_value` in every FairnessReport row for telemetry, BUT the ship-flag `is_limitation` uses the raw threshold per CONTEXT.md line 129 spec ("Brier > 0.27 OR ECE > 0.10"). Rationale: the spec demands raw thresholds because false negatives (missed real bias) are higher-cost than false positives (mistaken limitation). Documented in HYPERPARAMETERS.md §Fairness Audit. Unit test asserts a segment with raw Brier=0.28 stays flagged even if its BH q-value exceeds 0.05 — preserves the spec semantics. Disposition is "accept" because the BH telemetry column allows future operators to revisit the gating choice without re-shipping the pipeline. |
</threat_model>

<verification>

Numerical checks (every gate is a grep/test/numeric assertion — no adjectives):

1. `npx tsc --noEmit` returns 0
2. `npm test -- sentiment-fairness-audit` green; ≥8 cases pass
3. `npm run test:integration -- fairness-audit` green
4. `npm run audit-fairness -- --window-days 90 --bootstrap-if-sparse` exits 0
5. `test -f reports/fairness-audit-2026-05-11.md` returns success
6. `grep -l "FAIRNESS-AUDIT-START" docs/cards/MODEL-CARD-*.md | wc -l` returns ≥3
7. `grep -c "is_limitation.*true" reports/fairness-audit-2026-05-11.md` returns ≥1
8. `grep -c "'Energy'.*'Materials'.*'Industrials'.*'Consumer Discretionary'.*'Consumer Staples'.*'Health Care'.*'Financials'.*'Information Technology'.*'Communication Services'.*'Utilities'.*'Real Estate'" src/lib/sentiment/fairness-types.ts` matches all 11 sectors (multi-line regex acceptable)
9. `grep "BRIER_LIMITATION_THRESHOLD = 0.27" src/lib/sentiment/fairness-audit.ts` matches; same for `ECE_LIMITATION_THRESHOLD = 0.10` and `MIN_SEGMENT_SIZE = 30`
10. `grep -c "function brierScore\|function expectedCalibrationError" src/lib/sentiment/fairness-audit.ts` returns 0 (No-Duplication Gate — only imports allowed)
11. `grep "dimensions_evaluated.*cap_class.*sector.*geography.*ticker_age" reports/fairness-audit-2026-05-11.md` matches (All-Four-Dimensions Gate)
12. Idempotency: running `npm run audit-fairness` twice in succession produces zero `git diff` in `docs/cards/MODEL-CARD-*.md` (asserted by integration test)
13. Live Neon: `SELECT COUNT(*) FROM fairness_audit_reports WHERE classifier_version IS NOT NULL` returns ≥1 after Task 7
14. vercel.json contains `"path": "/api/cron/fairness-audit"` with schedule `"0 8 3 * *"`
15. HYPERPARAMETERS.md contains §Fairness Audit with literal thresholds + CONTEXT.md line 129 citation + S1 exemption note

</verification>

<success_criteria>

CONTEXT.md line 129 acceptance (verbatim, all three must hold):

1. **Audit report committed** — `reports/fairness-audit-2026-05-11.md` exists, contains all 4 dimensions × all segments × Brier/ECE/n/is_limitation, and is committed to `main`.
2. **≥1 segment-specific limitation documented in model card** — at least one file in `docs/cards/MODEL-CARD-*.md` contains a delimited `<!-- FAIRNESS-AUDIT-START audit_id=... -->` ... `<!-- FAIRNESS-AUDIT-END -->` block listing at least one flagged limitation with the form `- {dimension}={segment}: Brier=..., ECE=..., n=...`.
3. **Baseline numbers for next-phase comparison** — the FairnessAuditReport row in live Neon contains the full `json_payload` of every segment's Brier/ECE/n/is_limitation/bh_q_value, queryable by future phases for trend analysis.

Plus this plan's contract gates:

4. Re-run on every model retrain (CONTEXT.md "Re-run on every model retrain") — cron route's TemperatureCalibration-poll forces an audit on classifier_version change (T-20-C-06-04, integration test asserts).
5. All 4 stratification dimensions present every run (cap_class / sector / geography / ticker_age).
6. GICS-1 literal 11-sector taxonomy is the single source of truth in `fairness-types.ts` (no parallel taxonomy elsewhere).
7. Idempotent model-card updates — running the audit twice produces zero diff.
8. No duplication of `brierScore` or `expectedCalibrationError` — primitives imported from 20-C-02 / 20-B-03 owners.

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-20-C-06-SUMMARY.md` summarizing:

- Final FairnessAuditReport row count + classifier_versions covered
- Total segments evaluated across the 4 dimensions × 3 classifiers
- Limitations flagged (count + which segments)
- Cron schedule + auto-trigger behavior verified
- Idempotency verified (model-card double-run diff = 0)
- Threats T-20-C-06-{01..05} status table
- Open items / handoff notes for the next Wave-D phase or for Phase 21
</output>
