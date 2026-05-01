---
phase: 17-institutional-insider-intelligence
verified: 2026-05-01T18:53:31Z
status: gaps_found
score: 8/11 must-haves verified
overrides_applied: 0
gaps:
  - truth: "mergeInstitutionalData correctly merges numeric fields without silently dropping legitimate zero values"
    status: failed
    reason: "src/lib/data/merge.ts lines 212-220 use falsy-OR (||) on 6 numeric fields that are legitimately zero in real 13F data. When Finnhub returns 0 for total_institutional_share, fund_count_current, fund_count_prev, top10_concentration_pct, etc., the merge silently falls through to EDGAR, producing incorrect merged snapshots. Directly affects contrarian-inflow/outflow classifier paths."
    artifacts:
      - path: "src/lib/data/merge.ts"
        issue: "Lines 212-220: || used instead of ?? on total_institutional_share, total_institutional_share_prev, fund_count_current, fund_count_prev, top10_concentration_pct, top10_concentration_pct_prev"
    missing:
      - "Replace falsy-OR with null-coalescing (??) on all 6 numeric merge fields in mergeInstitutionalData"

  - truth: "Integration tests use accurate bucket vocabulary matching actual InsiderBucket and InstitutionalBucket unions"
    status: failed
    reason: "Three test files use phantom bucket names that do not exist in the type system and will never be produced by the real classifiers. (1) smart-money-affects-reports.test.ts line 28: INST_PATTERN='cluster_buying' stored as signal_class='institutional' — but cluster_buying is an InsiderBucket, not an InstitutionalBucket. INSIDER_PATTERN='smart_money_concentration' stored as signal_class='insider' — but smart_money_concentration is an InstitutionalBucket. (2) backfill-smart-money-active-rate.test.ts INSTITUTIONAL_BUCKETS contains cluster_buying/distribution_phase/accumulation_phase/institutional_outflow/fund_rotation/consensus_buy/consensus_sell — 7 of 8 are not real InstitutionalBucket values. INSIDER_BUCKETS contains smart_money_concentration/insider_cluster_buy/insider_cluster_sell/c_suite_buy/10b5_1_plan/opportunistic_buy/opportunistic_sell/silent_period — none match the real InsiderBucket union. (3) smart-money-affects-reports.test.ts line 297 regex includes insider_cluster_buy/c_suite_buy/10b5_1_plan as insider patterns — none of these are real InsiderBucket literals."
    artifacts:
      - path: "tests/integration/smart-money-affects-reports.test.ts"
        issue: "INST_PATTERN='cluster_buying' used as institutional bucket (it's an insider bucket). INSIDER_PATTERN='smart_money_concentration' used as insider bucket (it's an institutional bucket). AC5 regex (line 297) includes phantom insider bucket names."
      - path: "tests/integration/backfill-smart-money-active-rate.test.ts"
        issue: "INSTITUTIONAL_BUCKETS and INSIDER_BUCKETS arrays contain fabricated bucket names not in InsiderBucket or InstitutionalBucket type unions"
    missing:
      - "Replace INST_PATTERN with a real InstitutionalBucket value (e.g. 'net_accumulation')"
      - "Replace INSIDER_PATTERN with a real InsiderBucket value (e.g. 'cluster_buying')"
      - "Replace INSTITUTIONAL_BUCKETS array with actual InstitutionalBucket values from types.ts"
      - "Replace INSIDER_BUCKETS array with actual InsiderBucket values from types.ts"
      - "Fix AC5 InsiderPattern regex (line 297) to match real InsiderBucket literals: cluster_buying|lone_buy|ceo_buy|cfo_buy|director_buy|cluster_selling|planned_sell_10b5_1|lone_sell"

  - truth: "price-followup cron guards against divide-by-zero when cold-start snapshot has price_at_scan=0"
    status: failed
    reason: "engine-context.ts line 478 creates cold-start snapshots with price_at_scan=0. price-followup cron at route.ts line 77 computes pct_change = ((price - snap.price_at_scan) / snap.price_at_scan) * 100 with no guard. Division by zero produces Infinity or NaN for any cold-start snapshot, corrupting PriceOutcome rows and poisoning the learning engine's hit computation."
    artifacts:
      - path: "src/lib/engine-context.ts"
        issue: "Line 478: cold-start snapshot created with price_at_scan: 0"
      - path: "src/app/api/cron/price-followup/route.ts"
        issue: "Line 77: pct_change computed with no guard against price_at_scan === 0"
    missing:
      - "Add guard in price-followup: if (snap.price_at_scan === 0) { results.skipped++; continue; } before computing pct_change"
      - "OR: pass livePriceHint to getEngineContextForTicker so cold-start snapshot uses real price"

  - truth: "backfill-smart-money.ts null filter reliably matches NULL JSON columns in Prisma"
    status: partial
    reason: "scripts/backfill-smart-money.ts lines 55 and 103 use where: { institutional_data: { equals: undefined } } and where: { insider_data: { equals: undefined } } to find NULL rows. Prisma adapter behavior with { equals: undefined } for JSONB columns is unreliable — may return 0 rows or all rows depending on adapter version. The secondary .filter((s) => s.institutional_data == null) on lines 60/108 partially compensates but the initial query may silently return wrong rows, causing silent no-ops or excessive reads."
    artifacts:
      - path: "scripts/backfill-smart-money.ts"
        issue: "Lines 55, 103: { equals: undefined } is not a reliable null filter for JSONB columns in Prisma"
    missing:
      - "Replace { equals: undefined } with { equals: null } or { equals: Prisma.DbNull } for JSONB null comparison"
human_verification:
  - test: "Finnhub coverage measurement (D-09 decision gate)"
    expected: "scripts/validate-finnhub-coverage.ts prints 'insider coverage: N/200' and '13F coverage: N/200' — both should be ≥95%. If below 95%, edgar.ts stubs must be fleshed out (fast-xml-parser install required)."
    why_human: "Requires live FINNHUB_API_KEY and ~25 minutes to walk 200 tickers at 1.1s/tick. Not runnable in automated verification. D-09 outcome has not been measured — script was not run during plan execution."

  - test: "4-column panel responsive behavior at multiple viewports (AC1)"
    expected: "EngineCalibrationPanel shows 4-col at ≥1440px wide, 2-row×2-col at 1024-1439px, stacked at ≤1023px. Horizon table hides CI columns ≤1280px. ALIGNED badge centered above grid at all widths."
    why_human: "Visual layout at breakpoints requires human eye. Playwright tests covered 1920×1080 and 1279px only. 1440px and 1024px breakpoints were not exercised by automated tests."

  - test: "Smart Money Intelligence section copy quality (D-05)"
    expected: "Run two reports: one with both classes ACTIVE, one with insider-only. Sub-cards read naturally. 'Latest 13F: Nd ago' / 'Latest Form 4: Nd ago' surface prominently. Prose does not feel mechanical."
    why_human: "Editorial quality judgment. Cannot be automated."

  - test: "Bucket histogram distribution review after backfill"
    expected: "Run npx tsx scripts/backfill-smart-money.ts (live). Review printed InstitutionalPattern and InsiderPattern histograms. No single bucket >40% or <5% of population. If distribution is skewed, §3.3 thresholds need tuning."
    why_human: "Empirical threshold validation requires real data distribution from production Neon. The backfill has not been run yet."

  - test: "10b5-1 planned-sale detection (Pitfall 7)"
    expected: "For a known 10b5-1 sale (e.g., recent CEO planned sale at AAPL/GOOG/NVDA), probe Finnhub and confirm insider_bucket = 'planned_sell_10b5_1'. Currently always returns false because Finnhub free tier does not expose the flag reliably."
    why_human: "Requires manual API probe and knowledge of real 10b5-1 transactions. Automated tests cannot validate against live Finnhub responses."
---

# Phase 17: Institutional & Insider Intelligence Verification Report

**Phase Goal:** Surface institutional ownership changes (13F filings) and insider transactions (Form 4) as a distinct sentiment signal class with its own report section.
**Verified:** 2026-05-01T18:53:31Z
**Status:** gaps_found
**Re-verification:** No — initial verification

---

## Goal Achievement

The phase goal is substantially achieved: institutional and insider data flows through fetchers, classifiers, schema columns, the learning engine (quad-class cron), engine-context lookup, the Gemini system prompt (SMART MONEY CALIBRATION CONTEXT block), the UI (QuadClassPanel, SmartMoneyIntelligence section), and the Insights Dashboard (two new pattern library tabs). The D-04 trust boundary is preserved and D-22 (12-d logistic unchanged) is confirmed.

Four gaps block full production safety: a zero-value merge bug, wrong bucket names in tests, a divide-by-zero in price-followup from cold-start snapshots, and an unreliable null filter in the backfill script. These do not prevent the report section from rendering but do affect correctness of learned priors and backfill reliability.

---

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | fetchInsiderData returns InsiderSnapshot with bucket + auditable inputs OR null | VERIFIED | src/lib/data/insider.ts 158 lines; exports fetchInsiderData; calls classifyInsider; falls back to fetchEdgarForm4 on empty/error |
| 2 | fetchInstitutionalData returns InstitutionalSnapshot with bucket + auditable inputs OR null | VERIFIED | src/lib/data/institutional.ts 141 lines; exports fetchInstitutionalData; calls classifyInstitutional; falls back to fetchEdgar13F |
| 3 | classifyInsider and classifyInstitutional map to locked buckets OR null | VERIFIED | insider-classifier.ts (24 lines) and institutional-classifier.ts (35 lines) confirmed; thresholds match 17-RESEARCH §3.3 per SUMMARY-01 |
| 4 | FieldOrigin union includes 'edgar' | VERIFIED | types.ts line 18: `export type FieldOrigin = 'yahoo' \| 'finnhub' \| 'polygon' \| 'edgar' \| null` |
| 5 | edgar.ts exports fetchEdgarForm4, fetchEdgar13F, lookupCik as stubs | VERIFIED | edgar.ts 32 lines; all 3 exports confirmed at lines 19, 23, 30 — all return null |
| 6 | Schema has 4 nullable JSONB columns (insider_data, institutional_data, insider_at_report, institutional_at_report) | VERIFIED | prisma/schema.prisma lines 24-25, 49-50; migration SQL exists at prisma/migrations/20260430_add_smart_money_columns/migration.sql |
| 7 | sentiment-scan cron runs 4 sensors in parallel and writes insider_data + institutional_data | VERIFIED | route.ts imports fetchInsiderData + fetchInstitutionalData; Promise.all with 4 elements confirmed at lines 45-46 |
| 8 | learn cron upserts 4 Beta cells per resolved outcome with quad-class patterns | VERIFIED | learn/route.ts: INSIDER_PATTERNS (line 81), INSTITUTIONAL_PATTERNS (line 91), readInsiderBucketForOutcome (line 275), readInstitutionalBucketForOutcome (line 293), upsert blocks at lines 746 and 761 |
| 9 | mergeInstitutionalData correctly merges without dropping zero values | FAILED | merge.ts lines 212-220 use \|\| (falsy-OR) on 6 numeric fields; zero values from Finnhub silently fall through to EDGAR |
| 10 | Integration tests use accurate InsiderBucket/InstitutionalBucket vocabulary | FAILED | INST_PATTERN='cluster_buying' stored as institutional signal_class; INSIDER_PATTERN='smart_money_concentration' stored as insider signal_class — taxonomically inverted. INSTITUTIONAL_BUCKETS and INSIDER_BUCKETS arrays in backfill-active-rate test contain fabricated names not in type unions |
| 11 | EngineCalibrationPanel renders QuadClassPanel; ResearchReport renders SmartMoneyIntelligence | VERIFIED | EngineCalibrationPanel.tsx: QuadClassPanel (line 400), AgreementBadge (line 94). ResearchReport.tsx: SmartMoneyIntelligence (line 270), wired at lines 941-943 |

**Score:** 8/11 truths verified

---

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/lib/types.ts` | VERIFIED | InsiderBucket, InstitutionalBucket, InsiderSnapshot, InstitutionalSnapshot, FieldOrigin all present |
| `src/lib/data/insider.ts` | VERIFIED | 158 lines; fetchInsiderData exported; classifier + EDGAR fallback wired |
| `src/lib/data/institutional.ts` | VERIFIED | 141 lines; fetchInstitutionalData exported; classifier + EDGAR fallback wired |
| `src/lib/data/edgar.ts` | VERIFIED | 32 lines; fetchEdgarForm4, fetchEdgar13F, lookupCik all export as stubs returning null |
| `src/lib/data/insider-classifier.ts` | VERIFIED | 24 lines; classifyInsider exported |
| `src/lib/data/institutional-classifier.ts` | VERIFIED | 35 lines; classifyInstitutional exported |
| `src/lib/data/merge.ts` | PARTIAL | mergeInsiderData exported; mergeInstitutionalData has falsy-OR bug (WR-01) |
| `scripts/validate-finnhub-coverage.ts` | VERIFIED | 113 lines; getCurrentWatchlist imported |
| `prisma/schema.prisma` | VERIFIED | 4 nullable Json columns added to Report + SentimentSnapshot |
| `prisma/migrations/20260430_add_smart_money_columns/migration.sql` | VERIFIED | File exists with 4 ALTER TABLE statements |
| `tests/integration/schema-phase-17.test.ts` | VERIFIED | Exists; per SUMMARY-02: 8 tests all passing |
| `src/app/api/cron/sentiment-scan/route.ts` | VERIFIED | fetchInsiderData + fetchInstitutionalData imported and called in Promise.all |
| `src/app/api/cron/learn/route.ts` | VERIFIED | INSIDER_PATTERNS, INSTITUTIONAL_PATTERNS, quad-class upsert, D-22 logistic gate preserved |
| `src/lib/engine-context.ts` | VERIFIED | coldStartInsiderSnap, coldStartInstitutionalSnap, computeAgreementNWay all present |
| `src/lib/gemini-analysis.ts` | VERIFIED | SMART MONEY CALIBRATION CONTEXT block at line 611; D-04 post-process overwrite at line 835+ |
| `src/components/EngineCalibrationPanel.tsx` | VERIFIED | QuadClassPanel (line 400), AgreementBadge (line 94), 4-class HorizonTable |
| `src/components/ResearchReport.tsx` | VERIFIED | SmartMoneyIntelligence (line 270), wired to institutional_at_report + insider_at_report |
| `tests/e2e/engine-calibration-quad.spec.ts` | VERIFIED | 204 lines (exceeds 80-line minimum) |
| `tests/e2e/smart-money-asymmetric.spec.ts` | VERIFIED | 288 lines (exceeds 40-line minimum) |
| `scripts/backfill-smart-money.ts` | PARTIAL | 156 lines (exceeds 130-line minimum); but null filter is unreliable (WR-02) |
| `src/app/api/insights/institutional-library/route.ts` | VERIFIED | signal_class: 'institutional' filter confirmed |
| `src/app/api/insights/insider-library/route.ts` | VERIFIED | signal_class: 'insider' filter confirmed |
| `tests/integration/smart-money-affects-reports.test.ts` | PARTIAL | Exists; AC2 posterior-shift test logic is structurally sound but fixture uses inverted bucket taxonomy (INST_PATTERN/INSIDER_PATTERN swapped) |
| `tests/integration/backfill-smart-money-active-rate.test.ts` | PARTIAL | Exists; INSTITUTIONAL_BUCKETS + INSIDER_BUCKETS arrays contain fabricated bucket names |
| `tests/integration/horizon-brier-smart-money.test.ts` | VERIFIED | Exists; AC5 brier-at-30d assertions |
| `tests/e2e/insights-institutional.spec.ts` | VERIFIED | 47 lines; tab rendering confirmed |
| `tests/e2e/insights-insider.spec.ts` | VERIFIED | 47 lines; tab rendering confirmed |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| src/lib/data/insider.ts | src/lib/data/edgar.ts (fetchEdgarForm4) | fallback when Finnhub empty/null | WIRED | Confirmed at lines 62, 71, 75, 78 of insider.ts |
| src/lib/data/institutional.ts | src/lib/data/edgar.ts (fetchEdgar13F) | fallback when Finnhub empty/null | WIRED | fetchEdgar13F imported and used as fallback |
| src/lib/data/insider.ts | src/lib/data/insider-classifier.ts | classifyInsider called in fetcher | WIRED | Line 156 of insider.ts: `classifyInsider(snapshot)` |
| src/lib/data/institutional.ts | src/lib/data/institutional-classifier.ts | classifyInstitutional called in fetcher | WIRED | Line 139 of institutional.ts: `classifyInstitutional(snapshot)` |
| sentiment-scan/route.ts | fetchInsiderData + fetchInstitutionalData | Promise.all 4-element array | WIRED | Lines 45-46 confirmed |
| learn/route.ts processOneOutcome | learnedPattern.upsert insider + institutional | readInsiderBucketForOutcome → signal_class:'insider' | WIRED | Lines 746, 761 confirmed |
| engine-context.ts | fetchInsiderData + fetchInstitutionalData | 4-element cold-start Promise.all | WIRED | Lines 467-472 confirmed |
| engine-context.ts | gemini-analysis.ts | EngineContext 10 new fields consumed by buildEngineContextBlock | WIRED | institutional_posterior_mean and insider fields at lines 614, 835 |
| ResearchReport.tsx | institutional_at_report / insider_at_report | SmartMoneyIntelligence reads persisted snapshots | WIRED | Lines 380-381, 941-943 |
| InsightsDashboard.tsx | /api/insights/institutional-library + /api/insights/insider-library | fetch on tab activation | WIRED | Lines 79-80, 482-502 confirmed |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| EngineCalibrationPanel.tsx | calibration.institutional_posterior_mean | engine-context.ts → LearnedPattern DB query | Yes — when rows exist (NO_DATA when none) | FLOWING |
| ResearchReport.tsx SmartMoneyIntelligence | institutionalAtReport / insiderAtReport | report.institutional_at_report / report.insider_at_report from DB | Yes — written by sentiment-scan cron | FLOWING |
| InsightsDashboard.tsx SmartMoneyPatternLibrarySection | Pattern library data | /api/insights/institutional-library + /api/insights/insider-library → prisma.learnedPattern.findMany | Yes — real DB query with signal_class filter | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — no runnable entry points available without live Neon + Finnhub API credentials. Automated checks verified compilation and static wiring instead.

---

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| DATA-V2-03 | 17-01, 17-02, 17-03, 17-04, 17-05 | Insider trading filings (Form 4) | SATISFIED | fetchInsiderData (Finnhub Form 4 primary + EDGAR stub fallback), insider_data schema column, cron writing, SmartMoneyIntelligence section rendering insider transactions in report |
| 17-01 | 17-01 | Fetchers, classifiers, types, EDGAR stub, merge, validator | SATISFIED (with merge caveat) | All 6 modules created and exported; validator script compiles. mergeInstitutionalData has falsy-OR bug (WR-01) — acceptable severity does not block requirement satisfaction but must be fixed |
| 17-02 | 17-02 | Schema migration — 4 nullable JSONB columns | SATISFIED | prisma/schema.prisma verified; migration SQL exists; integration tests confirm columns as jsonb |
| 17-03 | 17-03 | Quad-class cron extension | SATISFIED | sentiment-scan 4-sensor Promise.all confirmed; learn cron quad-class upsert confirmed; D-22 logistic preserved |
| 17-04 | 17-04 | Engine-context + UI (QuadClassPanel + SmartMoneyIntelligence) | SATISFIED | computeAgreementNWay, SMART MONEY CALIBRATION CONTEXT, QuadClassPanel, SmartMoneyIntelligence all confirmed in codebase |
| 17-05 | 17-05 | Backfill + Insights tabs | SATISFIED (with caveats) | backfill-smart-money.ts exists (156 lines); API routes exist with correct queries; InsightsDashboard TABS extended to 6 entries with isNew: true for both new tabs |

Note: Requirement IDs 17-01 through 17-05 are plan-internal identifiers declared in each plan's frontmatter. They do not appear in REQUIREMENTS.md's traceability table (which covers only v1 requirements up to Phase 5). DATA-V2-03 appears in REQUIREMENTS.md at line 64 as a v2 requirement. No orphaned requirements detected.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/lib/data/merge.ts | 212-220 | `\|\|` on numeric fields that can legitimately be 0 | Blocker | Incorrect merged snapshots for new positions / empty-prior-quarter funds; wrong bucket assignments for contrarian paths |
| src/lib/engine-context.ts | 478 | `price_at_scan: 0` in cold-start snapshot | Blocker | Divide-by-zero in price-followup cron; corrupts PriceOutcome rows; poisons learning engine alpha/beta updates |
| scripts/backfill-smart-money.ts | 55, 103 | `{ equals: undefined }` Prisma null filter for JSONB | Warning | May silently return wrong rows; backfill may operate on incorrect row set depending on Prisma adapter version |
| tests/integration/smart-money-affects-reports.test.ts | 28-29, 297 | Wrong bucket taxonomy (INST_PATTERN='cluster_buying' as institutional; phantom InsiderBucket names in regex) | Warning | AC2 + AC5 tests prove incorrect invariants; fixtures use taxonomically inverted data |
| tests/integration/backfill-smart-money-active-rate.test.ts | 24-44 | Fabricated INSTITUTIONAL_BUCKETS + INSIDER_BUCKETS arrays | Warning | AC3 test proves active rate over fake bucket names that will never appear in production |

WR-05 (`cluster_buys` → `cluster_buying` typo) was fixed in commit c6d7ae0 — confirmed resolved.

---

### Human Verification Required

#### 1. Finnhub Coverage Measurement (D-09 Gate)

**Test:** Run `npx tsx scripts/validate-finnhub-coverage.ts` with live FINNHUB_API_KEY set in .env.local. Takes ~25 minutes.
**Expected:** Prints `insider coverage: N/200` and `13F coverage: N/200`. Both should be ≥95%. If either is below, plan 17-01 escalates: install `fast-xml-parser@4.5.1` and implement real fetchEdgarForm4 / fetchEdgar13F in edgar.ts.
**Why human:** Live external API. Rate-limited. The D-09 decision (EDGAR stays stub vs. real implementation) has not yet been made — the validator was never run.

#### 2. 4-Column Panel Responsive Behavior (AC1)

**Test:** Deploy or run locally, then inspect EngineCalibrationPanel at 1440×900 and 1024×768 in Chrome DevTools device mode.
**Expected:** 4-col at ≥1440px, 2×2 grid at 1024-1439px, stacked at ≤1023px. CI columns hidden at ≤1280px.
**Why human:** Playwright tests covered 1920×1080 and 1279px only. The 1440px and 1024px breakpoints (specified in VALIDATION.md manual-only section) were not exercised.

#### 3. Smart Money Intelligence Section Copy (D-05)

**Test:** Run two reports — one with both insider and institutional ACTIVE, one with insider-only.
**Expected:** Sub-cards read naturally. "Latest 13F: Nd ago" / "Latest Form 4: Nd ago" surface prominently. Prose feels editorial, not mechanical.
**Why human:** Reader-facing copy quality cannot be automated.

#### 4. Bucket Histogram Distribution After Backfill

**Test:** Run `npx tsx scripts/backfill-smart-money.ts` (live, ~33 min). Review printed histograms.
**Expected:** Neither class has a bucket >40% or <5% of population. If skewed, §3.3 classifier thresholds need tuning.
**Why human:** Backfill has not been run. Threshold validation requires empirical data from production Neon.

#### 5. 10b5-1 Planned-Sale Detection (Pitfall 7)

**Test:** For a known 10b5-1 sale (e.g., recent Apple/Google/NVDA CEO planned sale), probe Finnhub via fetchInsiderData and confirm insider_bucket = 'planned_sell_10b5_1'.
**Expected:** is_planned_10b5_1 flag = true in InsiderSnapshot; bucket classified as 'planned_sell_10b5_1'.
**Why human:** Finnhub free tier does not expose the 10b5-1 flag reliably. Current implementation always returns false. This needs a real transaction known to be 10b5-1.

---

### Gaps Summary

**4 gaps require closure before phase can be considered production-safe:**

**Gap 1 (Blocker): merge.ts falsy-OR bug (WR-01)** — Six numeric fields in mergeInstitutionalData use `||` instead of `??`. Any fund with zero holdings in prior quarter will produce wrong merged data, leading to incorrect InstitutionalBucket classifications. One-line fix per field.

**Gap 2 (Warning): Test bucket taxonomy inversion (WR-03 + WR-04)** — Two integration test files use bucket names that are cross-class (INST_PATTERN is an InsiderBucket stored as institutional; INSIDER_PATTERN is an InstitutionalBucket stored as insider) and fabricated names that don't exist in the type unions. The tests pass but prove wrong invariants. The AC2 posterior-shift logic is structurally sound; only the fixture identifiers need correcting.

**Gap 3 (Blocker): Cold-start divide-by-zero (WR-06)** — price-followup cron divides by price_at_scan without guarding against the zero value written by cold-start paths in engine-context.ts. This will produce Infinity/NaN PriceOutcome records that corrupt the learning engine whenever a ticker's first snapshot is cold-start-created.

**Gap 4 (Warning): Backfill null filter (WR-02)** — `{ equals: undefined }` is not a reliable Prisma JSONB null filter. The secondary filter partially compensates but the primary query behavior is adapter-version-dependent. Fix is a one-line change.

Five human verification items remain open, all consistent with the VALIDATION.md manual-only section and expected at this phase stage. The D-09 coverage measurement is the highest-stakes: if Finnhub coverage is below 95%, the EDGAR stubs must be promoted to real implementations before the smart money data has production value.

---

_Verified: 2026-05-01T18:53:31Z_
_Verifier: Claude (gsd-verifier)_
