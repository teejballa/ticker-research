# Phase 14 — Database Verification & Report Persistence QA

## Goal

Confirm the Neon database works correctly end-to-end in production: reports are written and
read back cleanly with all Phase 12/13 fields intact, returning users see their full history,
per-user isolation holds, and old reports (pre-Phase 12) degrade gracefully.

---

## Decisions

### A. StoredReport ID gap — fix the broken web-mode navigation

**Decision:** Add `id?: string` to the `StoredReport` interface and populate it in
`listReportsFromDb`. Update `ReportHistory` to use the report's `id` as the navigation key
in web mode instead of the constructed filename.

**What to change:**
- `src/lib/types.ts` — add `id?: string` to `StoredReport`
- `src/lib/reports-db.ts` — `listReportsFromDb` must include `id: r.id` in the returned
  object; `readReportFromDb` must also include `id: row.id`
- `src/components/ReportHistory.tsx` — `toFilename()` is only valid in local mode; in web
  mode use `report.id` as the `?report=` query param value
- Local mode is unchanged — `id` is optional, local reports have no UUID

**Why:** `listReportsFromDb` currently maps Prisma rows to `StoredReport` without the `id`
field. `ReportHistory` constructs a filename from metadata and passes it as `?report=`. In web
mode `/api/history/[filename]` treats the param as a UUID — but the constructed filename is
not a UUID, so every "Open" click in history returns 404. This is a blocking bug.

---

### B. Test database strategy

**Decision:** Mock Prisma with vitest for unit tests; use the real production Neon DB for
Playwright e2e only.

- **Unit tests** (`reports-db.test.ts`, route tests): mock `@/lib/db` with vitest and test
  the logic of `writeReportToDb`, `listReportsFromDb`, `readReportFromDb`, and the history
  routes without a real DB connection
- **Playwright e2e**: run against the real production Neon DB (DEPLOYMENT_MODE=web). Tests
  must clean up any rows they insert (delete by the test user_id after the test completes)
- No separate Neon test branch required — mocks cover unit coverage, prod DB covers e2e

---

### C. Backward compatibility — old reports (pre-Phase 12)

**Decision:** Silently hide sections whose data is missing.

- If `sentiment_intelligence`, `future_projection`, `price_target`, or any Phase 12/13 field
  is `undefined` or `null` on a loaded report, do not render that section at all
- No "Not available" placeholders — the report just shows the sections that have data
- `ResearchReport.tsx` already has conditional rendering for most optional fields; audit and
  ensure all Phase 12/13 additions are guarded with `?.` or `?? null` checks
- A pre-Phase 12 report must not throw or crash — only render what exists

---

### D. Per-user isolation test

**Decision:** Unit test with mocked Prisma (no real DB needed).

- Write a vitest unit test for `readReportFromDb` that mocks `prisma.report.findFirst`
  returning `null` when `user_id` doesn't match
- Verify that `readReportFromDb(id, wrongUserId)` throws (which the history route catches and
  returns 404)
- No second real Google account or Playwright multi-context needed for the isolation proof

---

### E. Playwright e2e scope

**Decision:** Mock NextAuth session + mock the Gemini analysis response.

- Mock NextAuth so Playwright tests skip the real Google OAuth flow
- Mock the Gemini analysis response (return a fixture `AnalysisResult`) so the e2e test
  doesn't trigger a real 60s research run
- The e2e covers the persistence + history flow: sign in (mocked) → analysis returns fixture
  → report written to Neon → sign out → sign in again (mocked) → history shows the report →
  open it → report page renders correctly
- Run against `DEPLOYMENT_MODE=web` on the local Next.js dev server connected to production
  Neon DB
- Clean up: delete the inserted test row from Neon after the Playwright run

---

## Success Criteria (locked from ROADMAP)

1. `writeReportToDb` → `readReportFromDb` round-trip returns all Phase 12/13 fields intact
   (`sentiment_intelligence`, `future_projection`, `price_target`, `signals`)
2. Returning user sees full report history (not empty list) after signing in again
3. Same ticker run multiple times creates multiple distinct timestamped records (no dedup)
4. `GET /api/history` in web mode returns all reports for the authenticated user, newest first
5. Pre-Phase 12 report (missing new fields) loads on report page without crash
6. `readReportFromDb` returns 404 for a valid report ID requested by a different user
7. `prisma migrate deploy` runs against production Neon with no errors and no pending
   migrations
8. Playwright e2e: sign in → run research → sign out → sign in → history shows report →
   open it → report renders correctly

---

## Scope Boundary

This phase is QA and bug-fixing only — no new report sections, no new data sources, no UI
redesign. Changes are limited to:
- Fixing the `id` field in `StoredReport` and `ReportHistory`
- Unit test coverage for `reports-db.ts` and history routes
- Backward-compat guards in `ResearchReport.tsx` for optional fields
- Prisma migration validation
- Playwright e2e for the history flow

Anything that adds new functionality (new report sections, new data signals) is a future phase.
