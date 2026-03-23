---
phase: 05-user-identity-report-history
plan: 02
subsystem: api
tags: [history, reports, persistence, email, setup]
dependency_graph:
  requires: [05-01]
  provides: [GET /api/history, GET /api/history/[filename], report persistence on analysis, userEmail in setup/status]
  affects: [05-03, 05-04]
tech_stack:
  added: []
  patterns: [module-level cache, async IIFE in sync callback, security regex guard]
key_files:
  created:
    - src/app/api/history/route.ts
    - src/app/api/history/[filename]/route.ts
  modified:
    - src/app/api/analysis/[ticker]/route.ts
    - src/app/api/setup/status/route.ts
decisions:
  - "Module-level cachedEmail (undefined/null/string) avoids repeated 3-5s Playwright startup on consecutive setup/status checks"
  - "IIFE async pattern in sync proc.stdout.on('data') callback enables await writeReport without changing callback signature"
  - "writeReport failure is non-fatal — streaming result event continues regardless; error logged server-side only"
  - "Path-traversal security: /^[A-Z0-9.\\-_]+\\.json$/i regex rejects filenames with slashes or unusual chars"
metrics:
  duration: "103 seconds"
  completed_date: "2026-03-19"
  tasks_completed: 2
  files_modified: 4
requirements_met: [AUTH-01, HIST-01, HIST-02, HIST-03]
---

# Phase 05 Plan 02: Backend API Routes for History and User Identity Summary

History and setup API routes implemented: GET /api/history list + GET /api/history/[filename] single report retrieval, POST /api/analysis persists to ~/.cipher/reports/ before streaming result, GET /api/setup/status returns userEmail via module-level-cached get_email.py extraction.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create GET /api/history and GET /api/history/[filename] | 3be2167 | src/app/api/history/route.ts, src/app/api/history/[filename]/route.ts |
| 2 | Extend analysis route to write report + extend setup/status to return userEmail | cd4206a | src/app/api/analysis/[ticker]/route.ts, src/app/api/setup/status/route.ts |

## What Was Built

### GET /api/history (src/app/api/history/route.ts)
Returns `{ reports: StoredReport[] }` sorted newest first. Delegates to `listReports()` from `src/lib/reports`. Returns empty array on any error — never 500s.

### GET /api/history/[filename] (src/app/api/history/[filename]/route.ts)
Returns a single `StoredReport` by filename. Security guard: regex `/^[A-Z0-9.\-_]+\.json$/i` rejects path-traversal attempts with HTTP 400. Returns 404 if file not found.

### Analysis Route Persistence (src/app/api/analysis/[ticker]/route.ts)
Added `writeReport` import and replaced the bare RESULT handling block with an async IIFE. Report is written to `~/.cipher/reports/` **before** the `result` SSE event is enqueued — guarantees no gap between analysis completion and history availability. Write failures are non-fatal: logged to server stderr, streaming continues.

### Setup Status userEmail (src/app/api/setup/status/route.ts)
- Added `userEmail: string | null` to `SetupStatus` interface
- Added `extractEmail(notebooklmHome: string)` function that runs `scripts/get_email.py` via `python3`/`python` candidates
- Added module-level `cachedEmail` (type `string | null | undefined`) — `undefined` means "not yet fetched"; avoids 3-5s Playwright startup on every status check
- Cache is reset to `undefined` if `authOk` becomes false (handles account disconnect)

## Decisions Made

1. **Module-level email cache**: `cachedEmail` typed as `string | null | undefined` — `undefined` distinguishes "not yet attempted" from `null` (no email found). Cache persists for the Next.js server process lifetime.

2. **IIFE async pattern**: The `proc.stdout.on('data')` callback is synchronous. Using `(async () => { await writeReport(...); })()` allows `await` without converting the event emitter callback to async, which would silently swallow errors in Node.js.

3. **Non-fatal write**: If `writeReport` throws (e.g., disk full, permissions), the error is logged server-side but the SSE result event is still streamed. The user gets their analysis even if persistence fails.

4. **Security regex**: `/^[A-Z0-9.\-_]+\.json$/i` on the `[filename]` route param — blocks `../../etc/passwd`, `../secrets`, and any filename with slashes or URL-encoded traversal attempts.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Files exist:
- src/app/api/history/route.ts: FOUND
- src/app/api/history/[filename]/route.ts: FOUND

Commits exist:
- 3be2167: FOUND
- cd4206a: FOUND

TypeScript: Only pre-existing errors in src/lib/__tests__/preflight.test.ts — no new errors introduced.

## Self-Check: PASSED
