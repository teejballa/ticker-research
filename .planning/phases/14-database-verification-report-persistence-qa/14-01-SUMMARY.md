---
phase: 14-database-verification-report-persistence-qa
plan: 01
status: complete
subsystem: db-persistence, unit-tests, components
tags: [bug-fix, test-coverage, reports-db, ReportHistory, mock-gap]
decisions:
  - "Used report.id ?? toFilename(report) pattern so local-mode reports (no UUID) still work unchanged"
  - "Added @testing-library/react + jsdom as devDependencies to support component render tests"
  - "ResearchReport.test.tsx uses @vitest-environment jsdom pragma + NavBar/FooterTicker mocks to isolate rendering from Next.js internals"
key-files:
  created: []
  modified:
    - src/lib/types.ts
    - src/lib/reports-db.ts
    - src/components/ReportHistory.tsx
    - tests/unit/reports-db.test.ts
    - tests/unit/analysis-web-mode.test.ts
    - src/app/api/analysis/__tests__/route.test.ts
    - src/components/__tests__/ResearchReport.test.tsx
metrics:
  completed: 2026-04-23
  tasks: 2
  files_modified: 7
---

# Phase 14 Plan 01 Summary

## One-liner

Fixed four DB persistence bugs (missing id field, broken nav key, mock gaps) and extended unit tests to cover fixed behavior — 155 tests green.

## What Was Done

### Task 1: id field + reports-db mapping + mock gaps

1. **`src/lib/types.ts`** — Added `id?: string` as first field in `StoredReport` interface. Field is optional so local-mode reports (no UUID) remain valid.

2. **`src/lib/reports-db.ts`** — Added `id: r.id` as first field in `listReportsFromDb` map. Added `id: row.id` as first field in `readReportFromDb` return object.

3. **`tests/unit/reports-db.test.ts`** — Added 3 new test cases:
   - `includes id field from DB row in returned StoredReport` (listReportsFromDb)
   - `includes id field from DB row in returned StoredReport` (readReportFromDb)
   - `round-trips all Phase 12/13 fields through analysis JSON column` (verifies price_target, future_projection, sentiment_intelligence, community_highlights survive the read path)

4. **`tests/unit/analysis-web-mode.test.ts`** — Added `extractCommunityHighlights: vi.fn().mockResolvedValue([])` to the `vi.mock('@/lib/gemini-analysis')` factory. Previously missing, causing 3 test failures.

5. **`src/app/api/analysis/__tests__/route.test.ts`** — Same fix: added `extractCommunityHighlights` to the mock factory. Previously missing, causing 2 test failures.

### Task 2: ReportHistory navigation + ResearchReport backward-compat + full suite green

6. **`src/components/ReportHistory.tsx`** — Replaced `const filename = toFilename(report)` with `const navKey = report.id ?? toFilename(report)`. Updated `key={navKey}` and `encodeURIComponent(navKey)` in onClick. Web-mode OPEN button now uses the UUID; local-mode fallback unchanged.

7. **`src/components/ResearchReport.tsx`** — Audited all Phase 12/13 field usages. All fields already guarded: `sentiment_intelligence` (line 262), `community_highlights` (line 503), `community_analysis` (line 514), `community_sources_scraped` (line 310 inside sentiment_intelligence guard), `future_projection` (line 631). No changes needed.

8. **`src/components/__tests__/ResearchReport.test.tsx`** — Added `@vitest-environment jsdom` pragma, installed `@testing-library/react` + `jsdom` devDependencies, added `vi.mock` for `next/navigation`, `@/components/NavBar`, `@/components/FooterTicker`. Added DB-QA-05 backward-compat test: renders `ResearchReport` with a pre-Phase-12 `AnalysisResult` (no optional fields) and asserts no throw + ticker text visible.

## Test Results

```
Test Files  1 failed (pre-existing) | 21 passed | 1 skipped (23)
     Tests  1 failed (pre-existing) | 155 passed | 3 todo (159)
```

All 5 previously failing tests in `analysis-web-mode.test.ts` and `route.test.ts` now pass.
All 9 tests in `reports-db.test.ts` pass (6 pre-existing + 3 new).
All 7 tests in `ResearchReport.test.tsx` pass (6 pre-existing + 1 new DB-QA-05).

## Issues Found and Fixed

### Auto-fixed Issues

**1. [Rule 2 - Missing mock export] extractCommunityHighlights absent from gemini-analysis mock**
- Found during: Task 1
- Issue: `vi.mock('@/lib/gemini-analysis')` in both `analysis-web-mode.test.ts` and `route.test.ts` exported only `runGeminiAnalysis` and `scrapeCommunitySentiment`. The actual route imports a third export `extractCommunityHighlights` — missing mock caused 5 test failures.
- Fix: Added `extractCommunityHighlights: vi.fn().mockResolvedValue([])` to both mock factories.
- Commit: ede8265

**2. [Rule 1 - Bug] ReportHistory constructed filename instead of using UUID**
- Found during: Task 2
- Issue: `const filename = toFilename(report)` always built a `TICKER-YYYY-MM-DDT...Z.json` string. In web mode the API route expects a UUID as the `?report=` param — passing a filename caused 404 on every OPEN click.
- Fix: `const navKey = report.id ?? toFilename(report)` — UUID in web mode, filename fallback in local mode.
- Commit: ede8265

### Deferred Issues

**Pre-existing failure in `src/lib/gemini-analysis.test.ts`**
- Test: `scrapeCommunitySentiment > Test 2`
- Was failing before Plan 01 (confirmed in baseline: 6 pre-existing failures → 5 fixed by this plan → 1 remains)
- Root cause: Firecrawl mock not wiring to correct call path in `scrapeCommunitySentiment`
- Out of scope for this plan; logged to `deferred-items.md`

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The `id` field added to `StoredReport` is read-only data returned to the authenticated user who owns the report — consistent with T-14-03 disposition (accept).

## Self-Check

- [x] `src/lib/types.ts` contains `id?: string` — FOUND
- [x] `src/lib/reports-db.ts` contains `id: r.id` — FOUND
- [x] `src/lib/reports-db.ts` contains `id: row.id` — FOUND
- [x] `src/components/ReportHistory.tsx` contains `navKey` — FOUND
- [x] `tests/unit/analysis-web-mode.test.ts` contains `extractCommunityHighlights` — FOUND
- [x] `tests/unit/reports-db.test.ts` contains `round-trips all Phase 12/13 fields` — FOUND
- [x] `src/components/__tests__/ResearchReport.test.tsx` contains `DB-QA-05` — FOUND
- [x] Commit ede8265 exists — VERIFIED

## Self-Check: PASSED
