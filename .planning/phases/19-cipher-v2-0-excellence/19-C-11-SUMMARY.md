---
phase: 19
plan: 19-C-11
subsystem: sentiment-data-backfill
tags: [arctic-shift, reddit, backfill, community-chatter, ops-script, phase-19, wave-c, d-43]
dependency_graph:
  requires:
    - 19-Z-02 (CommunityChatter table + UNIQUE constraint)
  provides:
    - scripts/arctic-shift-backfill.ts (one-shot Reddit historical ingest)
    - .planning/v1-ticker-universe.txt (50-ticker universe)
    - npm run arctic-shift-backfill (package.json entry)
  affects:
    - 19-C-01..02 (FinSentLLM ensemble — consumes CommunityChatter rows for training corpus)
    - 19-C-08 (CoVe — backfilled chatter feeds NLI verification claims)
tech-stack:
  added:
    - "Arctic Shift API (https://arctic-shift.photon-reddit.com/api/posts/search) — Pushshift successor, free, rate-limited"
  patterns:
    - "One-time ops script wired via package.json `npm run arctic-shift-backfill` (matches shadow-verdict / model-card-status convention)"
    - "Lazy Prisma client construction — module imports cleanly without DATABASE_URL, lets tests vi.stubGlobal('fetch') without forcing a DB connection"
    - "Local inline withRetry helper for transient 5xx + 429 — will swap for src/lib/data/retry.ts (Plan 19-B-02) when that lands"
    - "Idempotency via Prisma P2002 unique-constraint catch (silent skip) — re-running the script across already-ingested windows is a no-op"
    - "Sanitization-on-write — HTML tags stripped, whitespace normalized, truncated at 5000 chars before Prisma create"
key-files:
  created:
    - scripts/arctic-shift-backfill.ts
    - tests/integration/arctic-shift-backfill.live.test.ts
    - .planning/v1-ticker-universe.txt
  modified:
    - package.json (added "arctic-shift-backfill" script)
    - .env.example (documented optional ARCTIC_SHIFT_KEY)
decisions:
  - "Inlined withRetry in the script rather than creating src/lib/data/retry.ts — that file is owned by Plan 19-B-02, which has not landed yet. Inline copy is small (~15 lines) and isolated to the script; once 19-B-02 lands, it's a one-import swap."
  - "Lazy Prisma init via getPrisma() module-level singleton — lets the test file (which mocks fetch and never actually needs a DB-less import path, but does need to import the script's exports cleanly) avoid surprising connection-time errors when DATABASE_URL is unset."
  - "Test ticker prefix `TEST-C11-` namespaces rows for safe afterEach cleanup. Avoids any chance of polluting live LearnedPattern rows that the engine is currently learning on."
  - "ARCTIC_SHIFT_KEY treated as optional — Arctic Shift currently runs unauthenticated; if it ever requires keys, the script forwards as Bearer header. .env.example documents the slot but leaves it empty."
  - "Used 50 tickers in the v1.0 universe (≥10 required by the gate, but 50 reflects the actual scan footprint of ANCHORS + LARGE + MID pools from src/lib/data/ticker-watchlist.ts). One-line-per-ticker `.txt` format matches the simplest possible operator workflow."
metrics:
  duration: ~25min
  completed_date: 2026-05-08
  tasks_completed: 4
  files_created: 3
  files_modified: 2
  unit_tests_pass: 478/478
  integration_tests_pass: 6/6
  tsc_clean: true
---

# Phase 19 Plan C-11: Arctic Shift one-time historical Reddit backfill Summary

One-shot ops script that ingests 5y of historical Reddit chatter from Arctic Shift (the free Pushshift successor) into `CommunityChatter` for the v1.0 ticker universe — supplying the training corpus that downstream FinSentLLM ensemble (Plan 19-C-01/02) and CoVe NLI verification (Plan 19-C-08) consume. Per D-43, NOT a recurring cron — explicit `npm run arctic-shift-backfill` invocation only.

## What was built

### 1. `scripts/arctic-shift-backfill.ts`

Pure-TypeScript one-shot script. Iterates the v1.0 ticker universe × 4 subreddits (`wallstreetbets`, `stocks`, `SecurityAnalysis`, `algotrading`) × 30-day windows back N years, persisting one `CommunityChatter` row per post.

**Key surface (exports):**
- `sanitize(text: string): string` — T-19-C-11-01 mitigation
- `backfillTicker(ticker, yearsBack, opts?): Promise<number>` — per-ticker driver, returns inserted count
- `ARCTIC_SHIFT_BASE`, `DEFAULT_SUBREDDITS` — for tests / future reuse
- `ArcticPost` type — wire shape (note `author?` field exists on the wire but is intentionally dropped before persist)

**Privacy enforcement (T-19-C-11-02 / V8 ASVS):**
- Schema-level: `CommunityChatter` has no `author` / `user_id` column (verified at type-check time — Prisma would reject any `data: { author }` write)
- Code-level: the `data:` block in `prisma.communityChatter.create()` lists only `ticker, source, url, raw_text, scraped_at`
- Test-level: Test 4 asserts no row contains the synthetic `sensitive_username` author and no key named `author` or `user_id` exists on the returned row

**Sanitization (T-19-C-11-01):**
```typescript
function sanitize(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')   // strip HTML tags incl. <script>
    .replace(/\s+/g, ' ')      // normalize whitespace
    .trim()
    .slice(0, 5000);           // truncate
}
```

**Rate-limit handling (T-19-C-11-03):**
- Inline `withRetry({ maxAttempts, baseDelayMs })` — exponential backoff (500ms → 1s → 2s)
- Treats 429 + 5xx + network errors as transient
- 4xx (non-429) re-thrown immediately
- Default 1100ms inter-request sleep ≈ 55 req/min (margin under assumed 60/min)

**Idempotency:**
- Relies on `CommunityChatter` UNIQUE(`ticker, source, url, scraped_at`) from Plan 19-Z-02
- Catches Prisma `P2002` and silently skips — re-running across ingested windows is a no-op
- Other Prisma errors are logged and the script continues (doesn't bring down the whole run)

### 2. `tests/integration/arctic-shift-backfill.live.test.ts`

6 live-Neon integration tests (all `vi.stubGlobal('fetch', ...)` mocked — zero live network calls):

| # | Test | Status |
|---|------|--------|
| 1 | populates CommunityChatter rows for a small mocked window | PASS |
| 2 | re-running is idempotent (no duplicate rows) | PASS |
| 3 | sanitize() strips HTML, normalizes whitespace, truncates ≤5000 | PASS |
| 4 | Reddit author NEVER persisted (V8 ASVS) | PASS |
| 5 | HTTP 429 → withRetry backoff → eventual success | PASS |
| 6 | cleanup deletes TEST-C11-* rows | PASS |

Test ticker prefix: `TEST-C11-`. `afterEach` hook deletes via `prisma.communityChatter.deleteMany({ where: { ticker: { startsWith: 'TEST-C11-' } } })`.

### 3. `.planning/v1-ticker-universe.txt`

50-line ticker file. Composition:
- Mega-cap anchors: AAPL NVDA MSFT GOOGL AMZN META TSLA AMD AVGO INTC SPY QQQ
- Large-cap leaders: JPM BAC GS V MA LLY UNH JNJ PFE MRK XOM CVX KO PEP WMT HD DIS NFLX CRM ORCL ADBE QCOM TXN COST MCD NKE
- Mid-cap consumer / fintech: SOFI HOOD RBLX SNAP PINS DDOG NET OKTA SHOP SQ PLTR COIN

One ticker per line; comment lines (`#`) and blank lines stripped at parse time.

### 4. `package.json` script entry

```json
"arctic-shift-backfill": "npx tsx scripts/arctic-shift-backfill.ts"
```

Matches the existing `shadow-verdict` / `model-card-status` script convention.

### 5. `.env.example`

Documented optional `ARCTIC_SHIFT_KEY=` slot — Bearer-auth forward path if Arctic Shift tightens its rate limit later.

## Verification

| Gate | Result |
|------|--------|
| Task 1: `[ "$(wc -l < .planning/v1-ticker-universe.txt)" -ge 10 ]` | 50 tickers, exit 0 |
| Task 2: `test -f tests/integration/arctic-shift-backfill.live.test.ts` | exit 0 |
| Task 2: tests RED before implementation | "Cannot find module '../../scripts/arctic-shift-backfill'" |
| Task 3: `grep -q "sanitize" scripts/arctic-shift-backfill.ts` | exit 0 |
| Task 3: `grep -q "arctic-shift-backfill" package.json` | exit 0 |
| Task 3: author NEVER in `prisma.communityChatter.create({ data: ... })` block | confirmed via AST-style regex |
| Task 3: `npx tsc --noEmit` | exit 0 |
| Task 3: `npx vitest run` (unit) | 478/478 passed, 1 file skipped |
| Task 3: integration test on live Neon | 6/6 passed |
| Task 4: `git log -1 --pretty=%s | grep -q "19-c-11"` | exit 0 |

## Commits

| Task | Hash | Subject |
|------|------|---------|
| 1 | `95cb055` | feat(19-c-11): add v1.0 ticker universe for Reddit backfill (Task 1) |
| 2 | `4f80ce9` | test(19-c-11): failing integration tests for Arctic Shift backfill (Task 2 RED) |
| 3 | `728a2f3` | feat(19-c-11): Arctic Shift one-time historical Reddit backfill (Task 3 GREEN) |
| 4 | (same as Task 3 — implementation + commit fused per atomic-commit rule) | |

## Production run results

**Not yet executed.** Per D-43, this is an operator-driven one-shot. When run, results will be appended here:

```
[run-date]
  command: npm run arctic-shift-backfill -- --years 5 --tickers-from .planning/v1-ticker-universe.txt
  total tickers: 50
  total rows inserted: <TBD>
  total runtime: <TBD>
  observed Arctic Shift rate limit: <TBD req/min>  ← calibrates Assumption A6
  per-ticker:
    AAPL: <N> rows
    ...
```

Idempotency means re-running the script after partial completion (operator Ctrl-C, network blip, etc.) is safe — already-ingested rows surface as Prisma P2002 and are silently skipped.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] `src/lib/data/retry.ts` does not exist yet**

- **Found during:** Task 3 (script implementation)
- **Issue:** The plan's reference TypeScript imports `withRetry` from `src/lib/data/retry.ts` — but that file is owned by Plan 19-B-02 (Wave B retry+backoff wrapper), which has not landed. Plan 19-C-11's `depends_on` lists only `[19-Z-01..04]`, not 19-B-02, so executing this plan now is correct — the import path was aspirational.
- **Fix:** Inlined a minimal `withRetry` helper (~15 LOC) inside `scripts/arctic-shift-backfill.ts`, kept the API identical to the design doc. When Plan 19-B-02 lands, this becomes a one-import swap.
- **Files modified:** `scripts/arctic-shift-backfill.ts`
- **Commit:** `728a2f3`

**2. [Rule 3 — Blocking issue] `.env.local` not present in worktree**

- **Found during:** Task 3 (running integration tests against live Neon)
- **Issue:** The agent worktree is a `git worktree` (separate working dir), and `.env.local` is gitignored — so it doesn't follow the worktree. Integration tests skipped with "injected env (0)".
- **Fix:** Symlinked `.env.local` from the main repo: `ln -s /Users/tj/Desktop/Cipher/.env.local .env.local`. Symlink is gitignored (verified `git check-ignore`) so it doesn't pollute the commit.
- **Verification:** Re-ran integration tests, "injected env (20) from .env.local" — all 6 tests passed.
- **Files modified:** none (symlink only, ignored by git)

### Architectural deviations

**1. [Discretionary] Lazy Prisma init**

- **Plan reference:** `import { prisma } from '../src/lib/db'` at module top
- **Adopted:** Module-level `_prisma: PrismaClient | null` lazily initialized via `getPrisma()` on first `backfillTicker()` call; tests pass `opts.prisma` to inject the test connection
- **Rationale:** The test file imports `sanitize` and `backfillTicker` from the script. Eager Prisma init at import time would force tests to either set `DATABASE_URL` before import (brittle ordering) or hit a confusing connection error. Lazy init keeps imports cheap and side-effect-free.
- **Trade-off:** Tiny startup-time cost (one extra null check on first call). Worth it for test ergonomics.

**2. [Discretionary] `_isMain` check before auto-running `main()`**

- **Plan reference:** `main().catch(...)` at file bottom (always runs on import)
- **Adopted:** `if (isMain) main().catch(...)` where `isMain = /arctic-shift-backfill\.ts$/.test(process.argv[1])`
- **Rationale:** Same as above — we don't want `main()` to fire when the test file imports from the script. Standard CommonJS-style guard adapted for ESM under tsx.

## Authentication gates

None required for the backfill script itself — Arctic Shift is currently public/unauthenticated. The optional `ARCTIC_SHIFT_KEY` env slot is present but empty in `.env.example`; if Arctic Shift ever locks down, the operator adds the key and the script forwards it as `Authorization: Bearer <key>`.

`DATABASE_URL` / `DIRECT_URL` for Neon were already in `.env.local` from earlier Phase 19 work.

## Hard Cleanup Gate (per plan template)

Per the plan's `universal_preamble`, conditions 1–4 are **N/A** (one-time script, no shadow lifecycle, no replacement, no flag, no old code path).

Condition 5 (the only applicable gate):
- ✅ `npm test` green (478/478 unit, 1 file skipped — pre-existing)
- ✅ Integration test on small sample passes (6/6)
- ✅ One-time script committed (`728a2f3`)
- ⏳ SUMMARY documents production run results — pending operator-driven execution; section pre-allocated above

## What unblocks

- **Plan 19-C-01/02 (FinSentLLM ensemble):** Has the historical training corpus once operator runs the backfill
- **Plan 19-C-08 (CoVe NLI verification):** Can index against multi-year ticker chatter for stronger NLI grounding
- **Phase 25 (Historical Backfill — composite training set):** Reddit slice now operator-runnable; combine with point-in-time fundamentals slice from Phase 25 plans

## Self-Check: PASSED

- ✅ FOUND: scripts/arctic-shift-backfill.ts
- ✅ FOUND: tests/integration/arctic-shift-backfill.live.test.ts
- ✅ FOUND: .planning/v1-ticker-universe.txt (50 tickers)
- ✅ FOUND: package.json contains "arctic-shift-backfill"
- ✅ FOUND: .env.example contains ARCTIC_SHIFT_KEY
- ✅ FOUND: commit 95cb055 (Task 1)
- ✅ FOUND: commit 4f80ce9 (Task 2 RED)
- ✅ FOUND: commit 728a2f3 (Task 3 GREEN)
- ✅ Unit suite 478/478 passing post-implementation
- ✅ Integration suite 6/6 passing against live Neon
- ✅ tsc --noEmit clean
