---
phase: 08
plan: 03
subsystem: analysis-route-web-mode
tags: [credential-storage, analysis-route, daytona, web-mode, prisma, nextauth]
dependency_graph:
  requires: [08-01, 08-02]
  provides: [web-mode-analysis-pipeline, user-credential-db-helpers]
  affects: [src/app/api/analysis/ticker/route.ts, src/lib/user-credential-db.ts]
tech_stack:
  added: []
  patterns: [dynamic-import-isolation, tdd-red-green, prisma-upsert, sse-proxy]
key_files:
  created:
    - src/lib/user-credential-db.ts
    - tests/unit/analysis-web-mode.test.ts
  modified:
    - tests/unit/user-credential-db.test.ts
    - src/app/api/analysis/[ticker]/route.ts
decisions:
  - "Replace DEPLOYMENT_MODE=cloud stub with DEPLOYMENT_MODE=web — cloud branch sent filePath cross-network (broken); web branch reads content from disk and sends JSON to Daytona"
  - "All web-mode imports inside dynamic await import() — prevents Prisma/NextAuth from loading for local users who have no DATABASE_URL"
  - "getCredential uses select: { encrypted_state: true } — minimal column fetch, avoids pulling id/updated_at unnecessarily"
metrics:
  duration_seconds: 172
  completed_date: "2026-03-27T02:47:59Z"
  tasks_completed: 2
  files_changed: 4
---

# Phase 08 Plan 03: Web-Mode Analysis Route + Credential DB Helpers Summary

**One-liner:** Per-user NbLM credential injection for Daytona proxy — analysis route reads session, decrypts Neon-stored storage_state, POSTs content (not path) to container.

## What Was Built

### src/lib/user-credential-db.ts (new)

Thin Prisma helpers for the `user_credentials` table:

- `upsertCredential(userId, encryptedState)` — creates or updates the encrypted `storage_state.json` blob for a user
- `getCredential(userId)` — returns `{ encrypted_state }` or `null`; uses `select` to fetch only what's needed

Both functions import directly from `@/lib/db` (the Prisma singleton). The module itself is only imported inside `await import()` calls in the analysis route, so it never loads for local users.

### src/app/api/analysis/[ticker]/route.ts (modified)

Replaced the non-functional `DEPLOYMENT_MODE=cloud` stub (which forwarded a local `/tmp` path to a container that can't access it) with a working `DEPLOYMENT_MODE=web` branch:

1. `getServerSession(authOptions)` — returns 401 if unauthenticated
2. `readFile(filePath, 'utf-8')` — reads source package from Vercel's ephemeral filesystem
3. `getCredential(session.user.email)` — returns 400 with `"NotebookLM account not connected."` if absent
4. `decrypt(cred.encrypted_state)` — AES-256-GCM decryption via credentials.ts
5. `fetch(containerUrl/analyze/ticker, { body: {sourcePackage, storageState}, headers: { x-daytona-secret } })` — forwards to Daytona
6. Returns `upstream.body` as SSE stream — existing frontend SSE parsing requires zero changes

The old `cloud` branch comment is preserved as a dead-code note. The local Python spawn branch is completely untouched.

### tests/unit/user-credential-db.test.ts (modified)

Replaced `it.todo` Wave 0 stubs with real Vitest assertions using `vi.hoisted` + `vi.mock('@/lib/db')`:
- Test 1: upsert called with correct where/create/update shape
- Test 2: getCredential returns null when findUnique returns null
- Test 3: getCredential returns `{ encrypted_state }` record when found

### tests/unit/analysis-web-mode.test.ts (new)

4-test suite covering the new web branch:
- Test 1: no session → 401 response with `{ type: 'error' }`
- Test 2: session + no credential → 400 with `"NotebookLM account not connected."`
- Test 3: happy path → fetch called with correct URL, headers, body shape; response is SSE stream
- Test 4: local mode (no DEPLOYMENT_MODE) → `getServerSession` never called

## Test Results

```
tests/unit/user-credential-db.test.ts  3 passed (3)
tests/unit/analysis-web-mode.test.ts   4 passed (4)
Total: 7 passed
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.mock hoisting causes "Cannot access before initialization" with inline vi.fn() variables**

- **Found during:** Task 1 GREEN phase
- **Issue:** `vi.mock('@/lib/db', () => ({ prisma: { userCredential: { upsert: mockUpsert } } }))` — `mockUpsert` is referenced in the factory but Vitest hoists `vi.mock` above variable declarations, causing a TDZ error
- **Fix:** Used `vi.hoisted(() => ({ mockUpsert: vi.fn(), ... }))` to initialize mock functions before hoisting
- **Files modified:** tests/unit/user-credential-db.test.ts, tests/unit/analysis-web-mode.test.ts
- **Commit:** c1a6fb4

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | c1a6fb4 | feat(08-03): add user-credential-db.ts Prisma helpers and unit tests |
| Task 2 | 088faa0 | feat(08-03): extend analysis route with web-mode branch and unit tests |

## Self-Check: PASSED
