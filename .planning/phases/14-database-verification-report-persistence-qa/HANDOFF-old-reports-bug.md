# Handoff: Old Reports Show "ANALYSIS FAILED" After Phase 14 Fix

## What the User Sees
Clicking OPEN on an **old report** (stored before the Phase 14 id fix) shows:

> SYSTEM ERROR — ANALYSIS FAILED
> Report "GOOGL-2026-04-21T22-34-21Z.json" could not be loaded. The file may have been deleted.

The `?report=` URL param contains the **old filename format** (`GOOGL-2026-04-21T22-34-21Z.json`), not a UUID.

## Root Cause
Old reports in Neon were stored before `listReportsFromDb` returned the `id` field.
Those old rows DO have an `id` in the DB, but when the history page was first loaded
with the old code, the `id` was never returned — so `ReportHistory` fell back to constructing
a filename from metadata and stored that in `localStorage`/browser history/bookmarks.

BUT — the actual issue is simpler: these old rows were loaded into `ReportHistory` with the
pre-fix code, so `navKey = report.id ?? toFilename(report)`. Since `id` is now returned
by the fixed `listReportsFromDb`, a **page refresh** should make old reports work too.

## More Likely Root Cause (Check First)
The `?report=` param is the filename `GOOGL-2026-04-21T22-34-21Z.json`. This means the
OPEN button is still using the filename. This happens only if `report.id` is `undefined`
on that row. Two possible causes:

1. **The row was read from a cached/stale API response** before the fix deployed
2. **The row genuinely has `id = null` or `undefined` in the DB** (shouldn't happen — Prisma
   auto-generates UUIDs at insert time)

The `/api/history/[filename]` route in web mode treats the param as a UUID and calls
`readReportFromDb(filename, userEmail)`. When `filename` is a `.json` filename (not a UUID),
Prisma `findFirst({ where: { id: 'GOOGL-2026-...' } })` returns null → throws → 404 → "ANALYSIS FAILED".

## Fix to Investigate in Next Session

**Option A — Hard reload (try first):**
Force refresh the dashboard (`Cmd+Shift+R`) to get fresh `listReportsFromDb` data with
the `id` field. If old rows now have UUIDs in the URLs, the fix is working.

**Option B — The real issue: old cached `?report=` links:**
If the user navigated to OPEN from a bookmarked or previously-cached URL that still has
the filename format, the page will always fail. The fix is in `ReportHistory.tsx` —
already ships `navKey = report.id ?? toFilename(report)`. So a fresh load of `/dashboard`
will produce UUID-based OPEN URLs.

**Option C — Stale deployment:**
If the fix hasn't been deployed to Vercel yet, old code is still running. Deploy:
```bash
vercel --prod
```

## Files Involved
- `src/app/api/history/[filename]/route.ts` — web mode uses param as UUID, falls back to filename only in local mode
- `src/components/ReportHistory.tsx` — `navKey = report.id ?? toFilename(report)` (Phase 14 fix)
- `src/lib/reports-db.ts` — `listReportsFromDb` now returns `id: r.id` (Phase 14 fix)

## What Needs to Happen
1. Deploy Phase 14 fixes to Vercel (`vercel --prod`)
2. Sign in fresh → go to `/dashboard`
3. Click OPEN on any report — URL should now contain a UUID
4. If a report row legitimately has no id in the DB (impossible with Prisma auto-UUID), 
   investigate with `npx prisma studio` or direct Neon query

## Phase 14 Status
- Plan 01 ✅ — code fixes committed, all tests green
- Plan 02 ✅ — Playwright e2e passing
- Human checkpoint: PENDING — this screenshot shows the checkpoint has NOT passed yet
  The fix needs to be deployed before the manual verification can succeed.
