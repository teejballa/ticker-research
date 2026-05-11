---
phase: 20-real-sentiment-analysis
plan: 20-Z-01
subsystem: database
tags: [prisma, neon, sentiment, pit, immutability, sha256, threat-model, ci-guard, vitest, integration-test]

# Dependency graph
requires:
  - phase: 17-institutional-and-insider
    provides: SentimentSnapshot writer + sentiment-scan cron loop (the loop this plan wires into)
  - phase: 19-cipher-v2-0-excellence
    provides: PrismaClient + PrismaNeon adapter pattern; live-Neon Vitest integration runner
provides:
  - "SentimentObservation Prisma model with PIT-INVARIANT marker on fetched_at (the ONLY backtest-safe join key)"
  - "Insert-only DAO (insertObservation) with SHA-256 body hashing + PII allowlist + typed SentimentObservationDuplicateError"
  - "Parallel SentimentObservation writer wired into the existing sentiment-scan cron (existing SentimentSnapshot writer untouched)"
  - "CI immutability guard (npm run check-immutability) — fails build on any update/upsert/delete shape against the table"
  - "Two composite indexes: (ticker, fetched_at DESC) for live reads, (ticker, model_version, fetched_at DESC) for backfill / IC queries"
  - "Composite uniqueness (ticker, message_id, model_version) — classifier upgrades insert a NEW row, never overwrite"
  - "Dataset card stub forward-referencing 20-Z-02 for full Gebru-2018 fill-in"
affects: [20-Z-02, 20-Z-07, 20-A-03, 20-B-01, 20-B-04, 20-C-01, 21-sector-relative-labels]

# Tech tracking
tech-stack:
  added: [crypto.createHash sha256 hashing, PrismaNeon-driven integration tests for new model]
  patterns:
    - "PIT-invariant column with grep marker (// PIT-INVARIANT) — schema-level documentation that downstream regression tests (20-Z-07) parse"
    - "Insert-only DAO with explicit P2002 → typed SentimentObservationDuplicateError translation (callers skip-and-continue, never retry-with-update)"
    - "PII allowlist enforced at the DAO layer (T-20-Z-01-01) — widening requires a new model_version per S2 immutability"
    - "Parallel-shadow writer wiring (additive table, no existing read consumers — S3 N/A; writes only)"
    - "Per-file walk-based CI grep guard (skips node_modules/.next/dist, self-allowlists)"

key-files:
  created:
    - "src/lib/sentiment/observation-store.ts (133-LOC insert-only DAO)"
    - "scripts/check-sentiment-immutability.ts (CI grep guard)"
    - "tests/sentiment-observation-store.unit.test.ts (16 unit tests)"
    - "tests/integration/sentiment-observation.integration.test.ts (6 live-Neon tests)"
    - "scripts/verify-sentobs-table.ts (one-shot Neon schema verifier)"
    - ".planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md (stub)"
  modified:
    - "prisma/schema.prisma (added SentimentObservation model + 2 indexes + 1 composite unique + PIT-INVARIANT marker; no existing model touched)"
    - "src/app/api/cron/sentiment-scan/route.ts (parallel SentimentObservation writer inside existing for-each-ticker loop; existing snapshot writer untouched)"
    - "package.json (added check-immutability npm script)"

key-decisions:
  - "Used npx prisma db push directly against live Neon (rather than prisma migrate dev) — additive change, non-blocking, reversible. prisma migrate status confirms 'Database schema is up to date' even though no migration file was generated for 20-Z-01; the schema is fully canonical and reproducible from prisma/schema.prisma."
  - "DAO throws a typed SentimentObservationDuplicateError on P2002 rather than silently upserting — forces callers to choose skip-and-continue (cron writer) or bump model_version (backfill scripts), never accidentally overwrite."
  - "Used PrismaClient + PrismaNeon adapter in integration test (matches schema-phase-17.test.ts), NOT raw 'pg' Client — keeps the test stack uniform and avoids adding a dependency the project did not already carry."

patterns-established:
  - "PIT-INVARIANT grep marker: schema columns load-bearing for backtest correctness carry an inline comment that downstream regression tests (20-Z-07) parse. Future PIT columns adopt the same marker."
  - "Composite unique (entity, message_id, model_version): the canonical Phase 20 backfill shape. New classifier or new score interpretation → new model_version → new row alongside the original. Overwrites are forbidden by both the unique constraint AND the immutability CI guard."

requirements-completed: []

# Metrics
duration: ~25min (across two agent sessions — model + DAO + db push + cron wiring in session 1; tests + guard + dataset card + verification in session 2)
completed: 2026-05-11
---

# Phase 20-Z-01: Sentiment feature store with PIT snapshots Summary

**Immutable per-message SentimentObservation table in Neon — PIT-INVARIANT fetched_at, SHA-256 body hashing, PII allowlist, insert-only DAO + CI immutability guard, composite (ticker, message_id, model_version) unique — wired into the existing sentiment-scan cron in parallel with SentimentSnapshot (which stays untouched).**

## Performance

- **Duration:** ~25 min (cumulative across two agent sessions; session 1 landed schema+DAO+push+cron, session 2 landed tests+guard+dataset card+verification)
- **Started:** 2026-05-11T11:30 PDT (approx — session 1)
- **Completed:** 2026-05-11T14:43 PDT
- **Tasks:** 8/8 (all atomic-committed; 0 skipped)
- **Files created:** 6
- **Files modified:** 3
- **Net commits:** 8 task commits + 1 metadata commit

## Accomplishments

- Live SentimentObservation table in production Neon — 13 columns, 0 NULL fetched_at, 2 composite indexes + 1 composite unique + PK
- Insert-only DAO at `src/lib/sentiment/observation-store.ts` enforcing SHA-256 body hashing (T-20-Z-01-02), allowlist-only author features (T-20-Z-01-01), and typed duplicate error on P2002 (T-20-Z-01-04)
- Parallel writer wired into `/api/cron/sentiment-scan` — the existing `prisma.sentimentSnapshot.create` call is byte-identical to pre-plan state; failure in the new writer is logged-and-continued and CAN NOT block the snapshot path
- `npm run check-immutability` exits 0 on clean tree, exit 1 if any `prisma.sentimentObservation.{update,updateMany,upsert,delete,deleteMany}` is added to src/ or scripts/
- 16 unit tests + 6 live-Neon integration tests — all green; the integration test proves backfill under a NEW model_version inserts successfully (canonical Phase 20 backfill PIT pattern)
- Dataset card stub committed; forward-references 20-Z-02 for the full Mitchell/Gebru fill-in
- Zero regressions in the broader unit suite (742/746, 1 pre-existing skip, 3 pre-existing todo)

## Task Commits

Each task was committed atomically (in execution order):

1. **Task 1: Prisma model + indexes + PIT-INVARIANT marker** — `9af037c` (feat)
2. **Task 2: Insert-only DAO at src/lib/sentiment/observation-store.ts** — `b71628d` (feat)
3. **Task 3: prisma db push verified live in Neon (verify script committed)** — `219c7de` (chore)
4. **Task 4: Parallel writer wired into sentiment-scan cron** — `c6ee88a` (feat)
5. **Task 5: 16 unit tests (DAO — hash determinism, validation, allowlist, dup-error typing)** — `6cd80e2` (test)
6. **Task 6: 6 live-Neon integration tests (0 NULL fetched_at + composite unique + index existence)** — `423eaca` (test)
7. **Task 7: check-sentiment-immutability CI guard + package.json wiring** — `1f2e091` (feat)
8. **Task 8: Dataset card stub forward-referencing 20-Z-02** — `5cc06b3` (docs)

**Plan metadata commit:** _committed in step that follows this SUMMARY_ (docs: complete 20-Z-01 — SUMMARY + STATE + ROADMAP).

## Live-state proof (production Neon, captured 2026-05-11 14:42 PDT)

```
sentiment_observations columns (13):
  id                       text                        NULL=NO  (PK)
  ticker                   text                        NULL=NO
  source                   text                        NULL=NO
  message_id               text                        NULL=NO
  fetched_at               timestamp with time zone    NULL=NO  ← PIT-INVARIANT
  published_at             timestamp with time zone    NULL=YES (informational only)
  raw_body_hash            text                        NULL=NO
  classifier_version       text                        NULL=NO
  classifier_score         double precision            NULL=YES
  decay_weight             double precision            NULL=YES
  author_id                text                        NULL=NO
  author_features_snapshot jsonb                       NULL=NO
  model_version            text                        NULL=NO

Indexes (4):
  sentiment_observations_pkey
  idx_sentobs_ticker_fetched_at                ← (ticker, fetched_at DESC) — live reads
  idx_sentobs_ticker_modelver_fetched_at       ← (ticker, model_version, fetched_at DESC) — backfill / IC queries
  sentobs_ticker_msg_modelver_uq               ← unique (ticker, message_id, model_version)

NULL fetched_at rows: 0
ROW COUNT at capture-time: 0 (integration-test afterAll cleanup ran; gate 1 was satisfied during the test run itself)

npx prisma migrate status: "Database schema is up to date!"
```

## Files Created/Modified

- `prisma/schema.prisma` — appended `SentimentObservation` model (no existing model touched)
- `src/lib/sentiment/observation-store.ts` — insert-only DAO (133 LOC); exports `insertObservation`, `sha256Hex`, `SentimentObservationDuplicateError`, type aliases
- `src/app/api/cron/sentiment-scan/route.ts` — parallel writer block after the existing `prisma.sentimentSnapshot.create({...})`; logged-and-continued on failure
- `scripts/check-sentiment-immutability.ts` — CI grep guard (T-20-Z-01-04)
- `scripts/verify-sentobs-table.ts` — one-shot Neon schema verifier used during Task 3 confirmation
- `tests/sentiment-observation-store.unit.test.ts` — 16 unit tests
- `tests/integration/sentiment-observation.integration.test.ts` — 6 live-Neon integration tests
- `.planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md` — stub forward-referencing 20-Z-02
- `package.json` — added `check-immutability` npm script

## Decisions Made

- **prisma db push over prisma migrate dev**: schema is fully canonical from `prisma/schema.prisma` and `prisma migrate status` reports up-to-date. The push was already applied by the prior agent session; no migration file is needed for this purely additive change. If a future hosted-CI environment needs to recreate Neon from migrations alone, a `npx prisma db push` invocation in the deployment pipeline will materialize the table; downstream plans may opt to convert this into a tracked migration if they need migration-history symmetry across environments.
- **Typed SentimentObservationDuplicateError instead of silent upsert**: callers must EXPLICITLY decide to skip-and-continue (cron writer) or bump `model_version` (backfill scripts). This is the runtime enforcement of S2 immutability — there is no path through this DAO that overwrites an existing row.
- **PrismaNeon adapter (not raw pg) in the integration test**: matches `tests/integration/schema-phase-17.test.ts` line-for-line. Avoids adding a `pg` dependency the project did not already carry. Same connection semantics as production (the project runs on `@prisma/adapter-neon` everywhere).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Adapted integration test to use PrismaClient + PrismaNeon (not raw `pg` Client)**
- **Found during:** Task 6 (integration test) — `npm ls pg` returned 0 packages; raw `pg` is not a project dependency.
- **Issue:** The plan's example code imports `import { Client } from 'pg'` to hit `pg_indexes`. Project does not carry `pg` as a dependency; only `@prisma/adapter-neon` + `@neondatabase/serverless`.
- **Fix:** Switched the pg_indexes query to `prisma.$queryRawUnsafe`. This is the same pattern used by `tests/integration/schema-phase-17.test.ts`. Functionally identical — Prisma's raw query hits the same connection pool.
- **Files modified:** `tests/integration/sentiment-observation.integration.test.ts` (created — change is vs. the plan's example, not vs. anything previously committed)
- **Verification:** 6/6 integration tests green; index assertion confirmed `idx_sentobs_ticker_fetched_at` and `idx_sentobs_ticker_modelver_fetched_at` both present.
- **Committed in:** `423eaca` (Task 6 commit)

**2. [Rule 3 — Blocking] UUID regex tightened to UUID-v4 shape**
- **Found during:** Task 6 (integration test) — initial regex `/^[0-9a-f-]{36}$/` would not reject malformed IDs.
- **Issue:** Plan's example regex was permissive (any 36 chars from `[0-9a-f-]`). Tightened to the standard 8-4-4-4-12 hex shape to make the assertion meaningful.
- **Fix:** `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/`
- **Verification:** Test green; UUIDs from Prisma `@default(uuid())` match.

---

**Total deviations:** 2 minor adaptations of plan example code to the existing project test stack. No scope creep, no functional difference vs. plan intent.
**Impact on plan:** Zero — both adaptations are mechanical adjustments to existing project conventions; the acceptance criteria are satisfied.

## Threat Flags

None — this plan implemented the threat model `mitigate` dispositions for T-20-Z-01-01 through T-20-Z-01-05; no new surface introduced beyond what the plan defined.

| Threat | Mitigation status |
|--------|-------------------|
| T-20-Z-01-01 PII allowlist on author_features_snapshot | Enforced by DAO; 3 unit tests assert rejection of `bio`, `profile_text`, `email` |
| T-20-Z-01-02 raw body never persisted | Verified — schema has no `raw_body` column; only `raw_body_hash` (SHA-256 hex). 1 unit test asserts `data` passed to Prisma has no `raw_body` key |
| T-20-Z-01-03 lookahead bias via published_at join | Surface ready — `// PIT-INVARIANT` marker on `fetched_at`; `published_at` is nullable and inline-documented as informational only. **Regression test ships in 20-Z-07.** |
| T-20-Z-01-04 silent classifier upgrade overwriting history | Mitigated at THREE layers: (a) composite unique on (ticker, message_id, model_version), (b) DAO throws typed DuplicateError on P2002 (no upsert path exists), (c) `npm run check-immutability` CI guard. Both directions verified manually. |
| T-20-Z-01-05 cardinality explosion | Two composite indexes shipped from day 1; integration test confirms both exist via pg_indexes query. Phase 27 monthly partitioning deferred per plan. |

## Issues Encountered

- None. Live-Neon integration tests passed on the first run; the cron writer compiles and types check cleanly; the existing snapshot writer is bit-identical to its pre-plan state (`grep -c "prisma.sentimentSnapshot.create" route.ts == 1`).

## Self-Check: PASSED

**Files verified to exist (key-files.created):**
- `src/lib/sentiment/observation-store.ts` — FOUND
- `scripts/check-sentiment-immutability.ts` — FOUND
- `tests/sentiment-observation-store.unit.test.ts` — FOUND
- `tests/integration/sentiment-observation.integration.test.ts` — FOUND
- `scripts/verify-sentobs-table.ts` — FOUND
- `.planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md` — FOUND

**Commits verified via `git log --oneline --grep='20-z-01'`:** 9af037c, b71628d, 219c7de, c6ee88a, 6cd80e2, 423eaca, 1f2e091, 5cc06b3 — all FOUND on main.

**PIT discipline (S2) verified:** `grep -c "// PIT-INVARIANT" prisma/schema.prisma` → 1.

**Insert-only enforcement verified:** `grep -rE 'prisma.sentimentObservation.(update|updateMany|upsert|delete|deleteMany)' src/ scripts/` → 0 matches (script self-allowlists its own pattern strings).

**No UPDATE statements on historical rows:** verified at three layers (composite unique, DAO P2002 → typed error, CI grep guard with negative-case manual sanity).

**Live Neon proof:** verify-sentobs-table.ts output captured above; table + columns + indexes + composite unique all live; 0 NULL fetched_at.

## User Setup Required

None — `DATABASE_URL` was already configured in `.env.local`; live cron will populate rows on its next normal tick (no operator action needed beyond what was already in place).

## Next Phase Readiness

Downstream plans that build on this schema:

- **20-Z-02** — fills in the full Mitchell-2019 / Gebru-2018 dataset card sections (composition, collection process, fairness considerations, etc.). The stub committed here is the entry point.
- **20-Z-07** — ships the lookahead-bias regression test that reads the `// PIT-INVARIANT` marker on `fetched_at` and asserts no SQL/ORM call joins SentimentObservation on `published_at` for backtest paths. This plan provides the surface; 20-Z-07 enforces it.
- **20-A-03 (time decay)** — will introduce a NEW `model_version` per (ticker, message_id) carrying `decay_weight`, inserting new rows alongside the bootstrap rows. The composite unique constraint enforces this cleanly.
- **20-B-01 (per-doc Gemini NLP)** — will introduce a NEW `model_version` carrying `classifier_score`. Same pattern.
- **20-B-04 (data-driven source-tier weights)** — will join `SentimentObservation` ON `fetched_at` to compute per-source ICs.
- **20-C-01 (per-source rolling ICIR)** — same join surface.

No blockers. Phase 20 plan execution can proceed sequentially to 20-Z-02.

---
*Phase: 20-real-sentiment-analysis*
*Completed: 2026-05-11*
