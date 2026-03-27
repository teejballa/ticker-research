---
phase: 08
plan: 01
subsystem: credentials-foundation
tags: [prisma, aes-256-gcm, credentials, devcontainer, wave0-stubs]
dependency_graph:
  requires: []
  provides:
    - UserCredential Prisma model (user_credentials table in Neon)
    - AES-256-GCM encrypt/decrypt library (src/lib/credentials.ts)
    - Wave 0 test stubs for user-credential-db and container-server-auth
    - devcontainer VNC stack (x11vnc, xvfb, port 6080)
  affects:
    - Plan 02: container_server.py uses DAYTONA_SECRET pattern tested in container-server-auth stubs
    - Plan 03: user-credential-db.ts implements the upsert/get stubs
    - Plan 04: analysis route reads UserCredential and calls decrypt()
tech_stack:
  added:
    - Node.js crypto (built-in, no new dependency) — AES-256-GCM credential encryption
    - Prisma migration 20260327023737_add_user_credentials — user_credentials table
    - x11vnc (apt-get) — VNC server for Daytona container browser stream
    - xvfb (apt-get) — virtual display driver for headless Chromium VNC session
  patterns:
    - TDD Red-Green: credentials tests written first, failed, then implementation made them pass
    - Wave 0 stubs: it.todo() pattern for future plan dependencies (user-credential-db, container-server-auth)
key_files:
  created:
    - src/lib/credentials.ts
    - tests/unit/credentials.test.ts
    - tests/unit/user-credential-db.test.ts
    - tests/unit/container-server-auth.test.ts
    - prisma/migrations/20260327023737_add_user_credentials/migration.sql
  modified:
    - prisma/schema.prisma (UserCredential model appended)
    - .devcontainer/devcontainer.json (VNC packages + port 6080)
decisions:
  - AES-256-GCM chosen over Fernet (Python) for TypeScript-side encryption — Node.js stdlib, no extra dependency, 256-bit key matches RESEARCH.md recommendation
  - CREDENTIAL_ENCRYPTION_KEY validated at call time (not module load) — allows test harness to set env var before first import without module caching issues
  - Wave 0 stubs use it.todo() (not it.skip()) — vitest marks them as "todo" not "skipped" which correctly communicates intent
  - prisma generate run locally; prisma migrate deploy runs on Vercel during production deploy
metrics:
  duration: "5 min"
  completed_date: "2026-03-27T02:38:26Z"
  tasks_completed: 2
  files_changed: 7
---

# Phase 8 Plan 1: UserCredential Schema + Credentials Crypto + Wave 0 Stubs Summary

**One-liner:** AES-256-GCM credential library, UserCredential Prisma model with Neon migration, Wave 0 test stubs, and devcontainer VNC stack for Phase 8 foundation.

## What Was Built

### Task 1: UserCredential Schema + Credentials Library + Wave 0 Test Stubs

**TDD Flow (Red → Green):**

1. Wrote `tests/unit/credentials.test.ts` first — 5 tests that immediately failed (no implementation).
2. Implemented `src/lib/credentials.ts` using Node.js `crypto.createCipheriv('aes-256-gcm')`.
3. All 5 tests pass: roundtrip, wrong key throws, tampered ciphertext throws, random IV (different outputs), 3-segment format.

**Prisma schema:**
- Appended `UserCredential` model to `prisma/schema.prisma` with `user_id UNIQUE`, `encrypted_state TEXT`, `updated_at Timestamptz`.
- Applied migration `20260327023737_add_user_credentials` — `user_credentials` table created in Neon production DB.

**Wave 0 stubs:**
- `tests/unit/user-credential-db.test.ts`: 3 `it.todo()` stubs for Plan 03's `src/lib/user-credential-db.ts`.
- `tests/unit/container-server-auth.test.ts`: 3 `it.todo()` stubs for Plan 02's container server auth validation.
- Both files collectible by vitest with 0 runtime errors.

### Task 2: devcontainer.json VNC Dependencies

- Added `sudo apt-get install -y x11vnc xvfb` to `postCreateCommand`.
- Added port `6080` to `forwardPorts` for websockify WebSocket VNC bridge.
- All existing fields preserved.

## Verification Results

```
Tests:  25 passed | 6 todo (31 total)
Files:  5 passed  | 2 skipped
```

Schema compile: `prisma generate` succeeds, Prisma Client v7.5.0 generated with UserCredential model.

## Deviations from Plan

None — plan executed exactly as written. `prisma migrate dev` required explicit env var export from `.env.local` since Prisma 7 config does not auto-load `.env.local` (consistent with existing project behavior).

## Self-Check

- [x] `src/lib/credentials.ts` exists
- [x] `tests/unit/credentials.test.ts` exists, 5 tests pass
- [x] `tests/unit/user-credential-db.test.ts` exists, collectible (3 todo)
- [x] `tests/unit/container-server-auth.test.ts` exists, collectible (3 todo)
- [x] `prisma/schema.prisma` contains `model UserCredential`
- [x] `prisma/migrations/20260327023737_add_user_credentials/migration.sql` exists
- [x] `.devcontainer/devcontainer.json` contains `x11vnc`, `xvfb`, port `6080`
- [x] Commits: 16687f2 (Task 1), b57c738 (Task 2)
