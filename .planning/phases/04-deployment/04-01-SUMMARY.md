---
phase: 04-deployment
plan: "01"
subsystem: local-packaging
tags: [deployment, preflight, setup, local-install]
dependency_graph:
  requires: []
  provides: [local-install-packaging]
  affects: [package.json, scripts/setup.sh, .env.local.example]
tech_stack:
  added: []
  patterns: [prestart-npm-hook, bash-preflight-validator, env-var-template]
key_files:
  created:
    - scripts/setup.sh
    - src/lib/__tests__/preflight.test.ts
    - .env.local.example
  modified:
    - package.json
decisions:
  - prestart npm hook runs setup.sh before every npm start — validates Node 18+, Python 3.10+, ANTHROPIC_API_KEY
  - start script changed from 'next start' to 'next build && next start' — prevents 'Could not find production build' error on fresh clone
  - Python test uses stub binaries prepended to PATH (not PATH restriction) so bash and system tools remain available
  - Node version check is not unit-tested — the test process IS Node 18+ so the check always passes in CI; validated by manual smoke test instead
metrics:
  duration: "225s"
  completed: "2026-03-18"
  tasks: 2
  files: 4
---

# Phase 4 Plan 1: Local Packaging Summary

**One-liner:** Bash preflight validator via npm prestart hook that exits with clear errors for missing Node 18+, Python 3.10+, or ANTHROPIC_API_KEY before the production build runs.

## What Was Built

The plan adds the scaffolding that makes `npm install && npm start` work correctly on a fresh clone:

1. **`scripts/setup.sh`** — executable bash script with three checks: Node.js 18+ (via `node --version` + major version extraction), Python 3.10+ (tries `python3` and `python` candidates against regex `Python 3\.(1[0-9]|[2-9][0-9])`), and `ANTHROPIC_API_KEY` non-empty. Exits 1 with a human-readable error message on any failure. Exits 0 with "All prerequisites met." on success.

2. **`package.json` scripts** — `prestart` hook added (`bash scripts/setup.sh`) so npm runs the validator automatically before `start`. `start` changed from `next start` to `next build && next start` so a fresh clone builds the app before serving it.

3. **`.env.local.example`** — documents all environment variables: `ANTHROPIC_API_KEY` (required), `DEPLOYMENT_MODE`, `DAYTONA_CONTAINER_URL`, `INTERNAL_SECRET` (all optional/cloud-mode).

4. **`src/lib/__tests__/preflight.test.ts`** — Vitest unit tests using `spawnSync('bash', [SETUP_SH], ...)` that exercise: happy path (all valid), missing `ANTHROPIC_API_KEY`, and Python-not-found (using stub `python3`/`python` scripts that echo "Python 2.7.0" prepended to PATH).

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `prestart` npm hook vs manual call | npm runs `prestart` automatically — no user knowledge required |
| `next build && next start` chain | `next start` without a prior build exits with "Could not find a production build" |
| Stub binaries for Python test | Prepend tmpDir with fake python3/python scripts rather than stripping PATH — keeps bash/sed/grep working during test |
| Node check not unit-tested | Test process is Node 18+; check always passes; documented as manual-only validation |

## Verification Results

- `npm test -- src/lib/__tests__/preflight.test.ts`: 3/3 tests pass
- `npm test` full suite: 91/91 unit tests pass (pre-existing e2e Playwright conflict unchanged)
- `package.json` start script: `"next build && next start"` confirmed
- `package.json` prestart script: `"bash scripts/setup.sh"` confirmed
- `scripts/setup.sh` executable, exits 0 with valid env, exits 1 with correct messages otherwise
- `.env.local.example` exists and documents `ANTHROPIC_API_KEY`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All created files confirmed present:
- FOUND: scripts/setup.sh
- FOUND: src/lib/__tests__/preflight.test.ts
- FOUND: .env.local.example

All commits confirmed:
- FOUND: b9bdeb3 (feat(04-01): preflight tests + setup.sh)
- FOUND: 0c4672e (feat(04-01): package.json scripts + .env.local.example)
