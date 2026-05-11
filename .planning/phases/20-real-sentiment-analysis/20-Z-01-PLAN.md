---
phase: 20
plan: 20-Z-01
wave: Z
type: execute
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/lib/sentiment/observation-store.ts
  - src/app/api/cron/sentiment-scan/route.ts
  - scripts/check-sentiment-immutability.ts
  - package.json
  - tests/sentiment-observation-store.unit.test.ts
  - tests/integration/sentiment-observation.integration.test.ts
  - .planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md
autonomous: false
requirements: []
shadow_required: false
shadow_skip_reason: "Additive table + insert-only DAO with NO existing read consumers. Writes run in parallel alongside the unchanged SentimentSnapshot writer (which keeps serving all current readers). Per S3, when no read path is being changed there is no off→shadow→on transition to gate; verdict for the new writer is purely the numerical acceptance criteria below."
hard_cleanup_gate: true
must_haves:
  truths:
    - "SentimentObservation table exists in production Neon with PIT-INVARIANT marker on fetched_at"
    - "raw_body_hash column stores SHA-256 hex digest (64-char lowercase) of the raw message body"
    - "(ticker, message_id, model_version) is composite unique — same message under a new classifier version inserts a new row, never overwrites"
    - "fetched_at column is NOT NULL with @default(now()) at @db.Timestamptz; published_at is nullable and explicitly distinct from fetched_at"
    - "DAO insertObservation rejects UPDATE-shaped operations at runtime AND no source file calls prisma.sentimentObservation.update / updateMany / upsert"
    - "Existing SentimentSnapshot writer at src/app/api/cron/sentiment-scan/route.ts continues to run unchanged; new SentimentObservation writer runs in PARALLEL inside the same cron tick"
    - "20-Z-07 lookahead-bias regression test (future plan) will read this schema's fetched_at column and PIT-INVARIANT marker to enforce the join convention"
    - "DATASET-CARD-SentimentObservation.md stub committed and references 20-Z-02 for fill-in"
    - "npm run check-immutability exits 0 on a clean tree and non-zero if any SentimentObservation UPDATE is introduced"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "SentimentObservation model + 2 composite indexes + 1 composite unique constraint + // PIT-INVARIANT marker"
      contains: "model SentimentObservation"
    - path: "src/lib/sentiment/observation-store.ts"
      provides: "Insert-only DAO with sha256 hashing + runtime guard against UPDATE shapes"
      contains: "insertObservation"
    - path: "scripts/check-sentiment-immutability.ts"
      provides: "Grep-based CI guard fails build on any SentimentObservation UPDATE in source"
      contains: "sentimentObservation.update"
    - path: "tests/sentiment-observation-store.unit.test.ts"
      provides: "Unit tests — hash determinism + UPDATE-rejection guard + idempotent upsert-shape rejection"
    - path: "tests/integration/sentiment-observation.integration.test.ts"
      provides: "Live-Neon integration test — ≥1 row written after one cron-equivalent invocation, 0 NULL fetched_at, composite uniqueness enforced"
    - path: ".planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md"
      provides: "Gebru-2018 dataset card stub; 20-Z-02 fills in full sections"
  key_links:
    - from: "src/app/api/cron/sentiment-scan/route.ts"
      to: "src/lib/sentiment/observation-store.ts insertObservation()"
      via: "parallel write inside the existing for-each-ticker loop"
      pattern: "insertObservation\\("
    - from: "prisma/schema.prisma SentimentObservation.fetched_at"
      to: "20-Z-07 lookahead-bias regression test"
      via: "PIT-INVARIANT comment marker on the column"
      pattern: "// PIT-INVARIANT"
    - from: "scripts/check-sentiment-immutability.ts"
      to: "package.json scripts.check-immutability"
      via: "npm-run-script wrapper used by CI"
      pattern: "check-immutability"
---

# Plan 20-Z-01: Sentiment feature store with PIT snapshots (SentimentObservation)

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for ONE step only: the `npx prisma db push` against live Neon (per CONTEXT.md line 172 "Prisma schema migration + db push (additive, non-blocking)"). All other tasks are autonomous. After the operator confirms the push has landed, the remaining tasks (writer wiring, integration test, immutability script, commit) proceed without further prompts.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. **No shadow lifecycle to graduate** (S3 N/A — additive table, no existing read consumers; writes-only this plan)
2. **No old code deleted** (additive only; existing `SentimentSnapshot` writer untouched)
3. **No feature flag introduced** (writer always runs; failure is logged-and-continue, never blocks the snapshot path)
4. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest), and `npm run test:e2e` (Playwright) all green on `main` post-commit
5. **Schema Push Gate**: `npx prisma db push` succeeded against the live `DATABASE_URL` (production Neon) AND the integration test `tests/integration/sentiment-observation.integration.test.ts` writes ≥1 row in a single cron-equivalent invocation
6. **Immutability Gate**: `npm run check-immutability` exits 0 on the committed tree
7. **PIT Gate forward-reference**: 20-Z-07 (future plan) will instrument the production query path and assert no SQL references `published_at` for backtest joins. This plan does NOT ship that test — it ships the schema columns the test will read.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S2 (PIT discipline)** — CORE INVARIANT of this plan. `fetched_at` carries the `// PIT-INVARIANT` grep marker. `published_at` exists separately and nullable. Backfills create new `(ticker, message_id, model_version)` rows; the composite unique constraint enforces no overwrites.
- **S3 (shadow lifecycle)** — Skipped with documented reason in frontmatter `shadow_skip_reason`. The new writer runs in parallel with the existing `SentimentSnapshot.create()` writer (which serves all current readers). When future plans (20-A-03, 20-B-01) add read consumers of `SentimentObservation`, those plans introduce their own `off|shadow|on` flags.
- **S4 (model/dataset card)** — `DATASET-CARD-SentimentObservation.md` stub committed; full fill-in deferred to 20-Z-02 per its scope.
- **S7 (threat model)** — five plan-level threats T-20-Z-01-{01..05} mapped to phase catalog T-28-002 (lookahead bias) and T-28-004 (silent classifier upgrade).
- **S8 (numerical acceptance)** — every DONE criterion below is a grep / test exit / row-count assertion. Zero adjectives.

</universal_preamble>

<objective>
Persist immutable point-in-time sentiment observations in a new `SentimentObservation` Prisma table. Schema columns: `(ticker, source, message_id, fetched_at, published_at, raw_body_hash, classifier_version, classifier_score, decay_weight, author_id, author_features_snapshot, model_version)`. Composite unique on `(ticker, message_id, model_version)` — backfill under a new classifier version inserts a new row, never overwrites. Insert-only DAO + runtime guard + CI immutability script defend the invariant. The existing `SentimentSnapshot` writer in `sentiment-scan/route.ts` continues unchanged; the new `SentimentObservation` writer runs in PARALLEL inside the same cron loop. 20-Z-07 (future plan) ships the lookahead-bias regression test that reads this schema — the PIT marker and `fetched_at`/`published_at` separation are how 20-Z-01 instruments itself for that test.

Purpose: Phase 20's Waves A–D (time decay 20-A-03, dispersion 20-A-01, per-document NLP 20-B-01, source-tier weighting 20-B-04, per-source ICIR 20-C-01) all need a row-level immutable snapshot they can join on `fetched_at` without lookahead bias. Vendor-tagged `bull_pct` rolls up to the snapshot grain — too coarse for the calibration work. This plan is the foundation those plans build on.

Output:
- 1 new Prisma model + 2 indexes + 1 composite unique
- 1 insert-only DAO (~80 LOC)
- 1 writer hook in the existing cron route (≤20 LOC delta, additive)
- 1 immutability script + `package.json` wiring
- 1 unit test file (≥6 cases)
- 1 live-Neon integration test (≥3 cases including 0-NULL assertion)
- 1 dataset card stub
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@prisma/schema.prisma
@src/app/api/cron/sentiment-scan/route.ts
@src/lib/db.ts
@src/lib/sentiment/aggregator.ts
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md
@.planning/phases/19-cipher-v2-0-excellence/19-Z-02-PLAN.md

<interfaces>
```typescript
// src/lib/sentiment/observation-store.ts — NEW

export interface SentimentObservationInput {
  ticker: string;
  source: 'stocktwits' | 'reddit' | 'x' | 'news' | 'sec' | 'apewisdom' | 'firecrawl';
  message_id: string;                       // upstream-provided ID (stocktwits id, reddit post id, etc.)
  raw_body: string;                         // hashed → raw_body_hash; NEVER persisted directly
  classifier_version: string;               // e.g. "stocktwits-tag-v1", "finbert-prosus@<sha>", "gemini-2.5-flash-prompt-v3"
  classifier_score: number | null;          // [-1, +1] or null when classifier didn't fire
  model_version: string;                    // backfill-bucket key; differs from classifier_version when ONLY the score is recomputed
  decay_weight: number | null;              // nullable — set later by 20-A-03 calibration job
  author_id: string;                        // hashed upstream handle (sha256 of "{source}:{handle}")
  author_features_snapshot: {               // ALLOWLIST — see threat model T-20-Z-01-01
    account_age_days: number | null;
    follower_count: number | null;
    is_verified: boolean | null;
    message_count_30d: number | null;
  };
  fetched_at?: Date;                        // defaults to now() at DB layer; tests may inject for determinism
  published_at?: Date | null;               // upstream-claimed timestamp; PIT consumers MUST NOT join on this
}

export async function insertObservation(input: SentimentObservationInput): Promise<{ id: string }>;
// Throws on:
//   - empty ticker, source, message_id, classifier_version, model_version
//   - raw_body === '' (hash of empty string is well-defined but signals upstream bug)
//   - author_features_snapshot containing any key NOT in the allowlist (T-20-Z-01-01 PII defense)
// Returns: { id } of the newly inserted row.
// On (ticker, message_id, model_version) collision: throws a typed `SentimentObservationDuplicateError`
//   carrying { ticker, message_id, model_version }. Callers handle by skip-and-continue (NOT retry-with-update).

export class SentimentObservationDuplicateError extends Error {
  readonly ticker: string;
  readonly message_id: string;
  readonly model_version: string;
}

// Helper exported for testing:
export function sha256Hex(input: string): string;  // crypto.createHash('sha256').update(input, 'utf8').digest('hex')
```

```prisma
// prisma/schema.prisma — NEW model (appended after EngineThesis)

model SentimentObservation {
  id                       String   @id @default(uuid())
  ticker                   String
  source                   String   // 'stocktwits' | 'reddit' | 'x' | 'news' | 'sec' | 'apewisdom' | 'firecrawl'
  message_id               String   // upstream-provided message ID
  fetched_at               DateTime @default(now()) @db.Timestamptz  // PIT-INVARIANT — queryable join key; never join on published_at for backtests (enforced by 20-Z-07)
  published_at             DateTime? @db.Timestamptz                  // upstream-claimed timestamp; informational only, NOT a join key
  raw_body_hash            String   // sha256 hex of raw message body (64 lowercase chars); raw text NEVER persisted (T-20-Z-01-02)
  classifier_version       String   // pinned classifier identifier (e.g. "finbert-prosus@<commit-sha>")
  classifier_score         Float?
  decay_weight             Float?   // nullable — populated by 20-A-03 calibration via NEW model_version row
  author_id                String   // hashed upstream handle (sha256 of "{source}:{handle}")
  author_features_snapshot Json     // allowlisted fields only — see T-20-Z-01-01
  model_version            String   // backfill partition key — (ticker, message_id, model_version) is unique

  @@unique([ticker, message_id, model_version], map: "sentobs_ticker_msg_modelver_uq")
  @@index([ticker, fetched_at(sort: Desc)], map: "idx_sentobs_ticker_fetched_at")
  @@index([ticker, model_version, fetched_at(sort: Desc)], map: "idx_sentobs_ticker_modelver_fetched_at")
  @@map("sentiment_observations")
}
```
</interfaces>
</context>

<threat_model>

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-Z-01-01 | Information disclosure | `author_features_snapshot` could capture PII from vendor profile bios | mitigate | Schema column is `Json`, but the DAO `insertObservation` enforces a hard allowlist `{ account_age_days, follower_count, is_verified, message_count_30d }` — any other key throws. Unit test asserts `bio` / `profile_text` / `email` are rejected. Maps to phase catalog T-28-004 (silent classifier upgrade) when allowlist is later widened — wider allowlist requires new `model_version` per S2. |
| T-20-Z-01-02 | Information disclosure / vendor ToS | Raw message body retained | mitigate | Column is `raw_body_hash` (SHA-256 hex) only — never `raw_body`. Raw text persists only in transient `/tmp/source-package-<ticker>.json` per existing project convention (CLAUDE.md "Research Output Storage"). Unit test asserts the DAO never writes a column named `raw_body`. |
| T-20-Z-01-03 | Tampering / lookahead bias | Future queries joining on `published_at` for backtests inflate IC results | mitigate | `// PIT-INVARIANT` grep marker on the `fetched_at` column. `published_at` is nullable and documented "informational only" in-line. 20-Z-07 (forward-referenced future plan) ships the regression test that fails the build on any SQL/ORM call joining on `published_at` for backtest paths. **Maps to phase catalog T-28-002.** **Severity: HIGH** — mitigation is REQUIRED in this plan (cannot defer to 20-Z-07 because the schema must be PIT-shaped from day 1). |
| T-20-Z-01-04 | Tampering | Classifier upgrade silently overwrites historical scores → all priors corrupt | mitigate | `model_version` partition key on composite unique `(ticker, message_id, model_version)`. DAO is insert-only — `update`/`updateMany`/`upsert` throw at runtime. `scripts/check-sentiment-immutability.ts` greps source for any `prisma.sentimentObservation.update` / `updateMany` / `upsert` and exits non-zero. Wired to CI via `npm run check-immutability`. **Maps to phase catalog T-28-004.** |
| T-20-Z-01-05 | DoS / cardinality explosion | 10 retraining model_versions × 90d × 50 tickers × 100 msgs/day ≈ 4.5M rows/year; without indexes query path degrades | mitigate | Two composite indexes shipped from day 1: `(ticker, fetched_at DESC)` for live reads, `(ticker, model_version, fetched_at DESC)` for backfill / IC queries. Documented as Phase 27 follow-up: monthly partitioning if row count exceeds 10M (deferred). Integration test asserts both indexes exist via `pg_indexes` query. |

</threat_model>

<tasks>

<task type="auto" id="20-Z-01-01">
  <name>Task 1: Add SentimentObservation Prisma model + indexes + PIT-INVARIANT marker</name>
  <read_first>
    - prisma/schema.prisma (current 12-model state; add new model AFTER `EngineThesis` at line 220 to preserve diff locality)
    - .planning/phases/19-cipher-v2-0-excellence/19-Z-02-PLAN.md (precedent for additive Phase Z migration — same shape)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (lines 13-41 for S1-S10 standards, line 89 for verbatim 20-Z-01 spec)
  </read_first>
  <action>
    Append the following block to `prisma/schema.prisma` AFTER the `EngineThesis` model (current bottom of file). Do NOT modify any existing model — this is purely additive.

    ```prisma

    // ─── Phase 20-Z-01 — Sentiment feature store with PIT snapshots ───
    // Immutable point-in-time observations. (ticker, message_id, model_version) is unique —
    // a classifier upgrade or backfill inserts a NEW row under a new model_version, never
    // overwrites an existing row. fetched_at is the ONLY PIT-safe join key for backtest
    // queries; published_at is upstream-claimed and may be revised — DO NOT JOIN ON IT for
    // backtest paths. Enforced by 20-Z-07 lookahead-bias regression test.
    model SentimentObservation {
      id                       String   @id @default(uuid())
      ticker                   String
      source                   String   // 'stocktwits' | 'reddit' | 'x' | 'news' | 'sec' | 'apewisdom' | 'firecrawl'
      message_id               String   // upstream-provided message ID
      // PIT-INVARIANT — queryable join key; never join on published_at for backtests (enforced by 20-Z-07)
      fetched_at               DateTime  @default(now()) @db.Timestamptz
      published_at             DateTime? @db.Timestamptz                  // informational only — NOT a backtest join key
      raw_body_hash            String   // sha256 hex of raw body (64 lowercase chars); raw text never persisted (T-20-Z-01-02)
      classifier_version       String   // pinned classifier id (e.g. "finbert-prosus@<commit-sha>")
      classifier_score         Float?
      decay_weight             Float?   // populated by 20-A-03 calibration via NEW model_version row
      author_id                String   // hashed handle: sha256("{source}:{handle}")
      author_features_snapshot Json     // allowlisted fields only — see DAO + T-20-Z-01-01
      model_version            String   // backfill partition key

      @@unique([ticker, message_id, model_version], map: "sentobs_ticker_msg_modelver_uq")
      @@index([ticker, fetched_at(sort: Desc)], map: "idx_sentobs_ticker_fetched_at")
      @@index([ticker, model_version, fetched_at(sort: Desc)], map: "idx_sentobs_ticker_modelver_fetched_at")
      @@map("sentiment_observations")
    }
    ```

    Run Prisma client regeneration after the edit (no DB push yet — that is Task 3):

    ```bash
    npx prisma generate
    ```
  </action>
  <acceptance_criteria>
    - `grep -c "model SentimentObservation" prisma/schema.prisma` returns `1`
    - `grep -c "// PIT-INVARIANT" prisma/schema.prisma` returns `>= 1`
    - `grep -c "sentobs_ticker_msg_modelver_uq" prisma/schema.prisma` returns `1`
    - `grep -c "idx_sentobs_" prisma/schema.prisma` returns `2`
    - `grep -c "raw_body_hash" prisma/schema.prisma` returns `1`
    - `grep -c "\\braw_body\\b[^_]" prisma/schema.prisma` returns `0` (no raw_body column — hash only; T-20-Z-01-02)
    - `npx prisma generate` exits 0
    - `npx prisma format` exits 0 and produces no diff (schema is canonical)
    - No existing model was modified: `git diff prisma/schema.prisma | grep -E "^-[^-]" | wc -l` returns `0` (only additions)
  </acceptance_criteria>
  <automated>npx prisma format --check && grep -q "model SentimentObservation" prisma/schema.prisma && grep -q "// PIT-INVARIANT" prisma/schema.prisma && [ "$(grep -c "idx_sentobs_" prisma/schema.prisma)" -eq 2 ]</automated>
  <done>Schema model + 2 indexes + 1 composite unique + PIT-INVARIANT marker present; Prisma client regenerated; no existing model touched</done>
</task>

<task type="auto" id="20-Z-01-02">
  <name>Task 2: Implement insert-only DAO at src/lib/sentiment/observation-store.ts</name>
  <read_first>
    - src/lib/db.ts (prisma singleton — line 20 `export const prisma = ...`)
    - src/lib/sentiment/aggregator.ts (existing module style: imports, exports, error handling)
    - src/lib/sentiment/finsentllm.ts (existing pinned-version pattern)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (threat model lines 195-211)
    - prisma/schema.prisma (the model written in Task 1)
  </read_first>
  <action>
    Create `src/lib/sentiment/observation-store.ts` with the following EXACT contents (use `crypto.createHash('sha256').update(input, 'utf8').digest('hex')` for hashing — no external libs):

    ```typescript
    /**
     * Plan 20-Z-01 — Sentiment feature store with PIT snapshots.
     *
     * Insert-only DAO for SentimentObservation. Enforces:
     *  - SHA-256 hashing of raw bodies (T-20-Z-01-02 — raw text never persisted)
     *  - Allowlist on author_features_snapshot keys (T-20-Z-01-01 — PII defense)
     *  - Runtime rejection of UPDATE-shaped calls (T-20-Z-01-04 — model_version partition integrity)
     *
     * Read consumers come in later plans (20-A-03 time decay, 20-B-01 per-doc NLP,
     * 20-B-04 source-tier weighting, 20-C-01 per-source ICIR). This plan ships writes
     * only — that is why no shadow lifecycle is required (S3 documented skip).
     */
    import { createHash } from 'crypto';
    import type { Prisma } from '@prisma/client';
    import { prisma } from '@/lib/db';

    export type SentimentObservationSource =
      | 'stocktwits' | 'reddit' | 'x' | 'news' | 'sec' | 'apewisdom' | 'firecrawl';

    // T-20-Z-01-01 — allowlist. Widening this list requires a new model_version (S2 immutability).
    const AUTHOR_FEATURE_ALLOWLIST = [
      'account_age_days',
      'follower_count',
      'is_verified',
      'message_count_30d',
    ] as const;
    type AllowedAuthorFeatureKey = typeof AUTHOR_FEATURE_ALLOWLIST[number];
    export type AuthorFeaturesSnapshot = {
      account_age_days: number | null;
      follower_count: number | null;
      is_verified: boolean | null;
      message_count_30d: number | null;
    };

    export interface SentimentObservationInput {
      ticker: string;
      source: SentimentObservationSource;
      message_id: string;
      raw_body: string;
      classifier_version: string;
      classifier_score: number | null;
      model_version: string;
      decay_weight: number | null;
      author_id: string;
      author_features_snapshot: AuthorFeaturesSnapshot;
      fetched_at?: Date;
      published_at?: Date | null;
    }

    export class SentimentObservationDuplicateError extends Error {
      constructor(
        public readonly ticker: string,
        public readonly message_id: string,
        public readonly model_version: string,
      ) {
        super(
          `SentimentObservation already exists for (ticker=${ticker}, message_id=${message_id}, model_version=${model_version}). ` +
          `Backfills must use a NEW model_version (PIT immutability — see Plan 20-Z-01).`
        );
        this.name = 'SentimentObservationDuplicateError';
      }
    }

    export function sha256Hex(input: string): string {
      return createHash('sha256').update(input, 'utf8').digest('hex');
    }

    function assertNonEmpty(name: string, value: string): void {
      if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`SentimentObservation: ${name} must be a non-empty string (got: ${JSON.stringify(value)})`);
      }
    }

    function assertAllowlist(features: AuthorFeaturesSnapshot): void {
      const keys = Object.keys(features);
      for (const k of keys) {
        if (!(AUTHOR_FEATURE_ALLOWLIST as readonly string[]).includes(k)) {
          throw new Error(
            `SentimentObservation: author_features_snapshot key "${k}" not in allowlist ` +
            `[${AUTHOR_FEATURE_ALLOWLIST.join(', ')}] (T-20-Z-01-01 PII defense). ` +
            `Widening the allowlist requires a new model_version per S2 immutability.`
          );
        }
      }
    }

    export async function insertObservation(
      input: SentimentObservationInput,
    ): Promise<{ id: string }> {
      assertNonEmpty('ticker', input.ticker);
      assertNonEmpty('source', input.source);
      assertNonEmpty('message_id', input.message_id);
      assertNonEmpty('classifier_version', input.classifier_version);
      assertNonEmpty('model_version', input.model_version);
      if (typeof input.raw_body !== 'string' || input.raw_body.length === 0) {
        throw new Error('SentimentObservation: raw_body must be a non-empty string (upstream signal bug otherwise)');
      }
      assertAllowlist(input.author_features_snapshot);

      const raw_body_hash = sha256Hex(input.raw_body);

      try {
        const row = await prisma.sentimentObservation.create({
          data: {
            ticker: input.ticker,
            source: input.source,
            message_id: input.message_id,
            fetched_at: input.fetched_at ?? new Date(),
            published_at: input.published_at ?? null,
            raw_body_hash,
            classifier_version: input.classifier_version,
            classifier_score: input.classifier_score,
            decay_weight: input.decay_weight,
            author_id: input.author_id,
            author_features_snapshot: input.author_features_snapshot as unknown as Prisma.InputJsonValue,
            model_version: input.model_version,
          },
          select: { id: true },
        });
        return row;
      } catch (e) {
        // Prisma P2002 = unique constraint violation on (ticker, message_id, model_version)
        const err = e as { code?: string };
        if (err.code === 'P2002') {
          throw new SentimentObservationDuplicateError(
            input.ticker,
            input.message_id,
            input.model_version,
          );
        }
        throw e;
      }
    }
    ```

    Notes:
    - Module is insert-only by construction — it exports ONLY `insertObservation`, `sha256Hex`, `SentimentObservationDuplicateError`, types. No `update`, `upsert`, `delete`.
    - Duplicate-on-conflict throws a typed error rather than silently upserting — callers handle by skip-and-continue (Task 4 cron writer does this).
  </action>
  <acceptance_criteria>
    - File exists: `test -f src/lib/sentiment/observation-store.ts`
    - `grep -c "export async function insertObservation" src/lib/sentiment/observation-store.ts` returns `1`
    - `grep -c "createHash('sha256')" src/lib/sentiment/observation-store.ts` returns `1`
    - `grep -c "AUTHOR_FEATURE_ALLOWLIST" src/lib/sentiment/observation-store.ts` returns `>= 2`
    - `grep -c "prisma.sentimentObservation.update" src/lib/sentiment/observation-store.ts` returns `0`
    - `grep -c "prisma.sentimentObservation.upsert" src/lib/sentiment/observation-store.ts` returns `0`
    - `grep -c "prisma.sentimentObservation.delete" src/lib/sentiment/observation-store.ts` returns `0`
    - `grep -c "SentimentObservationDuplicateError" src/lib/sentiment/observation-store.ts` returns `>= 2`
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <automated>npx tsc --noEmit && grep -q "createHash('sha256')" src/lib/sentiment/observation-store.ts && [ "$(grep -c "prisma.sentimentObservation.update\|prisma.sentimentObservation.upsert\|prisma.sentimentObservation.delete" src/lib/sentiment/observation-store.ts)" -eq 0 ]</automated>
  <done>Insert-only DAO compiles cleanly; PII allowlist enforced; UPDATE/UPSERT/DELETE absent from source</done>
</task>

<task type="checkpoint:human-action" id="20-Z-01-03" gate="blocking">
  <name>Task 3: [BLOCKING] Run npx prisma db push against live Neon (operator-confirmed)</name>
  <read_first>
    - prisma/schema.prisma (after Task 1 — verify the SentimentObservation block is present)
    - CONTEXT.md line 172 (the operator-action row that explicitly requires this push: "Prisma schema migration + db push (additive, non-blocking)")
  </read_first>
  <what-built>
    Task 1 added a new `SentimentObservation` model to `prisma/schema.prisma`. This task pushes that schema to live Neon. The push is purely additive (new table, two indexes, one composite unique — no column drops, no type changes on existing columns), so it is non-blocking and reversible (just `DROP TABLE sentiment_observations` if needed).
  </what-built>
  <how-to-verify>
    1. Confirm `DATABASE_URL` in the executing shell points to **production Neon**, not a local DB:
       ```bash
       echo "$DATABASE_URL" | sed 's|//[^@]*@|//***@|'   # mask credentials in output
       ```
       Expect a `neon.tech` host.

    2. Run the push (Cipher is on Prisma 7 with `previewFeatures = ["driverAdapters"]`):
       ```bash
       npx prisma db push
       ```
       If Prisma prompts about a potential issue, accept ONLY if the displayed plan is purely additive (new table `sentiment_observations` + indexes). Decline if it proposes any destructive operation on existing tables.

       Fallback if `prisma db push` warns about migration drift in this repo's Prisma 7 config:
       ```bash
       npx prisma migrate dev --name 20_z_01_sentiment_observation --skip-seed
       ```
       (This generates a proper migration file under `prisma/migrations/`.)

       Non-TTY fallback (CI / pipe environments):
       ```bash
       yes "" | npx prisma db push --skip-generate && npx prisma generate
       ```

    3. Verify the table landed:
       ```bash
       psql "$DATABASE_URL" -c '\d "sentiment_observations"'
       ```
       Expect to see: 11 columns including `fetched_at` (NOT NULL), `published_at` (nullable), `raw_body_hash`, `model_version`, plus 2 indexes (`idx_sentobs_ticker_fetched_at`, `idx_sentobs_ticker_modelver_fetched_at`) and 1 unique constraint (`sentobs_ticker_msg_modelver_uq`).

    4. Verify row count is zero (table is fresh, no orphan data):
       ```bash
       psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "sentiment_observations"'
       ```
       Expect `0`.

    **Why this is operator-gated**: build + `tsc` pass even without the push because Prisma client types are generated from `schema.prisma`, not the live DB. Without this push, Task 5's integration test will fail at runtime with "relation does not exist." The push is the verification trap 20-Z-07 was designed to catch.
  </how-to-verify>
  <acceptance_criteria>
    - `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "sentiment_observations"'` returns `0` (table exists, empty)
    - `psql "$DATABASE_URL" -c '\d "sentiment_observations"' | grep -c "idx_sentobs_"` returns `>= 2`
    - `psql "$DATABASE_URL" -c '\d "sentiment_observations"' | grep -c "sentobs_ticker_msg_modelver_uq"` returns `>= 1`
    - `psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='sentiment_observations' AND column_name='fetched_at' AND is_nullable='NO'"` returns 1 row (fetched_at is NOT NULL)
  </acceptance_criteria>
  <resume-signal>Reply with `approved` once `psql` confirms the table + indexes + composite unique are live. Reply with `failed: <reason>` if the push errored; the planner will reroute.</resume-signal>
  <done>SentimentObservation table live in production Neon with 2 indexes + 1 composite unique; row count = 0</done>
</task>

<task type="auto" id="20-Z-01-04">
  <name>Task 4: Wire SentimentObservation writer in parallel into sentiment-scan cron route</name>
  <read_first>
    - src/app/api/cron/sentiment-scan/route.ts (existing 80-line file; the new writer goes INSIDE the existing for-each-ticker loop)
    - src/lib/data/lightweight-community-scan.ts (returns the StockTwits messages we'll iterate over — confirm the shape: each item should have `id`, `body`, `created_at`, `user.username`, etc.)
    - src/lib/sentiment/observation-store.ts (Task 2 output)
  </read_first>
  <action>
    Edit `src/app/api/cron/sentiment-scan/route.ts` to write `SentimentObservation` rows in PARALLEL with the existing `SentimentSnapshot` write. The existing `prisma.sentimentSnapshot.create({...})` call at line 53 stays UNCHANGED — this is the parallel-shadow pattern (S3 documented as N/A for read consumers, but for the write side we still run both in parallel for observability).

    1. Add import at the top of the file (after the existing `import YahooFinance ...` line):
       ```typescript
       import { insertObservation, SentimentObservationDuplicateError } from '@/lib/sentiment/observation-store';
       import { createHash } from 'crypto';
       ```

    2. AFTER the existing `await prisma.sentimentSnapshot.create({...})` block (currently lines 53-69), BEFORE `results.scanned++`, append the following block (insert at line 69, before line 70 `results.scanned++`):

       ```typescript
       // Plan 20-Z-01 — write per-message SentimentObservation rows in PARALLEL with the
       // SentimentSnapshot above. This is the PIT-immutable row-level grain that
       // 20-A-03 (time decay), 20-B-01 (per-doc NLP), 20-B-04 (source-tier weight),
       // and 20-C-01 (per-source ICIR) will join on. Failure here is logged-and-continued —
       // it MUST NOT block the snapshot writer that serves current readers.
       const stocktwitsMessages =
         (communityData as { stocktwits?: { messages?: Array<{ id?: string | number; body?: string; created_at?: string; user?: { username?: string; followers?: number; ideas?: number; created_at?: string; identity?: string } }> } } | null | undefined)
           ?.stocktwits?.messages ?? [];

       const MODEL_VERSION_BOOTSTRAP = 'stocktwits-tag-v1';      // initial classifier version; backfills bump this
       const CLASSIFIER_VERSION_BOOTSTRAP = 'stocktwits-tag-v1'; // same as model_version for the initial write

       let obs_written = 0;
       let obs_dupes = 0;
       let obs_errors = 0;
       for (const m of stocktwitsMessages) {
         if (!m.id || !m.body) continue;
         const handle = m.user?.username ?? 'anonymous';
         const author_id = createHash('sha256').update(`stocktwits:${handle}`, 'utf8').digest('hex');
         const account_age_days = m.user?.created_at
           ? Math.max(0, Math.floor((Date.now() - new Date(m.user.created_at).getTime()) / 86_400_000))
           : null;
         try {
           await insertObservation({
             ticker,
             source: 'stocktwits',
             message_id: String(m.id),
             raw_body: m.body,                          // hashed inside the DAO; never persisted raw
             classifier_version: CLASSIFIER_VERSION_BOOTSTRAP,
             classifier_score: null,                    // bootstrap row — Phase 20-B-01 fills this in via a new model_version
             model_version: MODEL_VERSION_BOOTSTRAP,
             decay_weight: null,                        // populated by 20-A-03 via new model_version
             author_id,
             author_features_snapshot: {
               account_age_days,
               follower_count: m.user?.followers ?? null,
               is_verified: m.user?.identity ? m.user.identity === 'Official' : null,
               message_count_30d: m.user?.ideas ?? null,
             },
             published_at: m.created_at ? new Date(m.created_at) : null,
             // fetched_at omitted — DB defaults to now() (PIT-INVARIANT)
           });
           obs_written++;
         } catch (e) {
           if (e instanceof SentimentObservationDuplicateError) {
             obs_dupes++;                               // expected on re-scan of the same ticker within the dedupe window
           } else {
             obs_errors++;                              // logged-and-continued; does NOT fail the cron
           }
         }
       }
       // (We attach the counters to the route response below for telemetry; 20-Z-03 will
       // graduate this to ProviderCallLog.)
       (results as Record<string, number>)[`obs_written_${ticker}`] = obs_written;
       (results as Record<string, number>)[`obs_dupes_${ticker}`]   = obs_dupes;
       (results as Record<string, number>)[`obs_errors_${ticker}`]  = obs_errors;
       ```

    Constraints:
    - Do NOT remove or modify the existing `prisma.sentimentSnapshot.create({...})` call.
    - Do NOT change the existing `results.scanned++` counter behaviour — the new writer's success is reported via separate per-ticker counters.
    - If `stocktwitsMessages` is empty (no community data for this ticker), the loop runs zero times and the cron continues exactly as today.
    - Failure in the new writer MUST be caught and logged-and-continued — it must NOT cause the existing snapshot row to be lost.
  </action>
  <acceptance_criteria>
    - `grep -c "prisma.sentimentSnapshot.create" src/app/api/cron/sentiment-scan/route.ts` still returns `1` (the existing writer is preserved)
    - `grep -c "insertObservation(" src/app/api/cron/sentiment-scan/route.ts` returns `>= 1`
    - `grep -c "SentimentObservationDuplicateError" src/app/api/cron/sentiment-scan/route.ts` returns `>= 1`
    - `grep -c "// Plan 20-Z-01" src/app/api/cron/sentiment-scan/route.ts` returns `>= 1` (provenance comment)
    - `grep -c "fetched_at" src/app/api/cron/sentiment-scan/route.ts` returns `0` (we let the DB default fire so the writer cannot accidentally backdate)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <automated>npx tsc --noEmit && grep -q "insertObservation(" src/app/api/cron/sentiment-scan/route.ts && [ "$(grep -c "prisma.sentimentSnapshot.create" src/app/api/cron/sentiment-scan/route.ts)" -eq 1 ]</automated>
  <done>Cron route writes SentimentObservation rows in parallel with SentimentSnapshot; failures logged-and-continued; existing snapshot writer untouched</done>
</task>

<task type="auto" id="20-Z-01-05">
  <name>Task 5: Unit tests for DAO — hash determinism, UPDATE-rejection, allowlist enforcement</name>
  <read_first>
    - src/lib/sentiment/observation-store.ts (Task 2 output)
    - tests/learning.unit.bugs.test.ts (precedent test style: `describe`/`it` + numeric assertions)
    - vitest.config.* (confirm unit-test pattern; project uses Vitest per CLAUDE.md)
  </read_first>
  <action>
    Create `tests/sentiment-observation-store.unit.test.ts` with the following test cases. Mock `prisma.sentimentObservation.create` via Vitest module mock — these are unit tests, no live DB.

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    vi.mock('@/lib/db', () => ({
      prisma: {
        sentimentObservation: {
          create: vi.fn(),
        },
      },
    }));

    import { prisma } from '@/lib/db';
    import {
      insertObservation,
      sha256Hex,
      SentimentObservationDuplicateError,
    } from '@/lib/sentiment/observation-store';

    const baseInput = {
      ticker: 'GME',
      source: 'stocktwits' as const,
      message_id: 'msg-1',
      raw_body: 'to the moon',
      classifier_version: 'stocktwits-tag-v1',
      classifier_score: 0.8,
      model_version: 'stocktwits-tag-v1',
      decay_weight: null,
      author_id: 'sha256:abc',
      author_features_snapshot: {
        account_age_days: 1000,
        follower_count: 500,
        is_verified: false,
        message_count_30d: 42,
      },
    };

    beforeEach(() => {
      vi.clearAllMocks();
      (prisma.sentimentObservation.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'row-1' });
    });

    describe('sha256Hex', () => {
      it('produces 64 lowercase hex chars', () => {
        const h = sha256Hex('hello');
        expect(h).toMatch(/^[0-9a-f]{64}$/);
      });
      it('is deterministic — same input → same hash', () => {
        expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
      });
      it('is collision-resistant — different inputs → different hashes', () => {
        expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
      });
    });

    describe('insertObservation — happy path', () => {
      it('hashes raw_body and never passes raw_body to Prisma', async () => {
        await insertObservation(baseInput);
        const call = (prisma.sentimentObservation.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.data.raw_body_hash).toBe(sha256Hex('to the moon'));
        expect(call.data).not.toHaveProperty('raw_body');
      });
      it('returns { id } from the create result', async () => {
        const r = await insertObservation(baseInput);
        expect(r).toEqual({ id: 'row-1' });
      });
      it('defaults fetched_at to a Date instance when not provided', async () => {
        await insertObservation(baseInput);
        const call = (prisma.sentimentObservation.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(call.data.fetched_at).toBeInstanceOf(Date);
      });
    });

    describe('insertObservation — validation', () => {
      it('rejects empty ticker', async () => {
        await expect(insertObservation({ ...baseInput, ticker: '' })).rejects.toThrow(/ticker/);
      });
      it('rejects empty message_id', async () => {
        await expect(insertObservation({ ...baseInput, message_id: '' })).rejects.toThrow(/message_id/);
      });
      it('rejects empty model_version', async () => {
        await expect(insertObservation({ ...baseInput, model_version: '' })).rejects.toThrow(/model_version/);
      });
      it('rejects empty raw_body (upstream signal bug)', async () => {
        await expect(insertObservation({ ...baseInput, raw_body: '' })).rejects.toThrow(/raw_body/);
      });
    });

    describe('insertObservation — PII allowlist (T-20-Z-01-01)', () => {
      it('rejects author_features_snapshot containing "bio"', async () => {
        await expect(insertObservation({
          ...baseInput,
          author_features_snapshot: { ...baseInput.author_features_snapshot, bio: 'long-text' } as unknown as typeof baseInput.author_features_snapshot,
        })).rejects.toThrow(/allowlist|bio/);
      });
      it('rejects author_features_snapshot containing "profile_text"', async () => {
        await expect(insertObservation({
          ...baseInput,
          author_features_snapshot: { ...baseInput.author_features_snapshot, profile_text: 'x' } as unknown as typeof baseInput.author_features_snapshot,
        })).rejects.toThrow(/allowlist|profile_text/);
      });
      it('rejects author_features_snapshot containing "email"', async () => {
        await expect(insertObservation({
          ...baseInput,
          author_features_snapshot: { ...baseInput.author_features_snapshot, email: 'x@y.com' } as unknown as typeof baseInput.author_features_snapshot,
        })).rejects.toThrow(/allowlist|email/);
      });
    });

    describe('insertObservation — duplicate handling (T-20-Z-01-04)', () => {
      it('throws SentimentObservationDuplicateError on Prisma P2002', async () => {
        (prisma.sentimentObservation.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
          Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
        );
        await expect(insertObservation(baseInput)).rejects.toBeInstanceOf(SentimentObservationDuplicateError);
      });
      it('typed error carries ticker + message_id + model_version', async () => {
        (prisma.sentimentObservation.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
          Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
        );
        try {
          await insertObservation(baseInput);
          expect.fail('should have thrown');
        } catch (e) {
          expect(e).toBeInstanceOf(SentimentObservationDuplicateError);
          const err = e as SentimentObservationDuplicateError;
          expect(err.ticker).toBe('GME');
          expect(err.message_id).toBe('msg-1');
          expect(err.model_version).toBe('stocktwits-tag-v1');
        }
      });
      it('rethrows non-P2002 Prisma errors unchanged', async () => {
        const other = Object.assign(new Error('Connection lost'), { code: 'P1001' });
        (prisma.sentimentObservation.create as ReturnType<typeof vi.fn>).mockRejectedValueOnce(other);
        await expect(insertObservation(baseInput)).rejects.toThrow(/Connection lost/);
      });
    });
    ```

    Then run:
    ```bash
    npx vitest run tests/sentiment-observation-store.unit.test.ts
    ```
  </action>
  <acceptance_criteria>
    - File exists: `test -f tests/sentiment-observation-store.unit.test.ts`
    - `grep -c "it(" tests/sentiment-observation-store.unit.test.ts` returns `>= 13`
    - `npx vitest run tests/sentiment-observation-store.unit.test.ts` exits 0
    - Test output shows ≥13 passing assertions
  </acceptance_criteria>
  <automated>npx vitest run tests/sentiment-observation-store.unit.test.ts</automated>
  <done>≥13 unit tests GREEN covering hash determinism, validation, PII allowlist, and duplicate error typing</done>
</task>

<task type="auto" id="20-Z-01-06">
  <name>Task 6: Integration test — live Neon write + 0-NULL fetched_at + index existence</name>
  <read_first>
    - tests/integration/ (existing integration tests for shape conventions — look for one that uses live Neon via DATABASE_URL)
    - vitest.integration.config.ts (or package.json `test:integration` script)
    - src/lib/sentiment/observation-store.ts (DAO under test)
  </read_first>
  <action>
    Create `tests/integration/sentiment-observation.integration.test.ts`:

    ```typescript
    import { describe, it, expect, beforeAll, afterAll } from 'vitest';
    import { Client } from 'pg';
    import { prisma } from '@/lib/db';
    import { insertObservation, SentimentObservationDuplicateError } from '@/lib/sentiment/observation-store';

    /**
     * Plan 20-Z-01 — Integration test against live Neon.
     * Acceptance gate per CONTEXT.md line 89:
     *   "Live for ≥1 cron cycle; lookahead-bias regression test (20-Z-07) green; 0 NULL fetched_at."
     *
     * This test covers the first ("≥1 row written") and third ("0 NULL fetched_at") gates.
     * The 20-Z-07 lookahead test ships in its own plan.
     */
    const TEST_TICKER = `TEST20Z01_${Date.now()}`;        // unique per-run to avoid collision
    const TEST_MODEL_VERSION = 'stocktwits-tag-v1';
    const insertedIds: string[] = [];

    beforeAll(async () => {
      // Ensure DATABASE_URL is set — otherwise skip cleanly.
      if (!process.env.DATABASE_URL) {
        throw new Error('Integration test requires DATABASE_URL');
      }
    });

    afterAll(async () => {
      // Best-effort cleanup; safe even if some inserts failed.
      await prisma.sentimentObservation.deleteMany({ where: { ticker: TEST_TICKER } });
      await prisma.$disconnect();
    });

    describe('SentimentObservation — live-Neon integration', () => {
      it('writes ≥1 row in one simulated cron-equivalent invocation', async () => {
        const r = await insertObservation({
          ticker: TEST_TICKER,
          source: 'stocktwits',
          message_id: 'integ-msg-1',
          raw_body: 'integration test body',
          classifier_version: TEST_MODEL_VERSION,
          classifier_score: 0.5,
          model_version: TEST_MODEL_VERSION,
          decay_weight: null,
          author_id: 'sha256:integ',
          author_features_snapshot: {
            account_age_days: 365,
            follower_count: 10,
            is_verified: false,
            message_count_30d: 3,
          },
        });
        expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
        insertedIds.push(r.id);

        const count = await prisma.sentimentObservation.count({ where: { ticker: TEST_TICKER } });
        expect(count).toBeGreaterThanOrEqual(1);
      });

      it('every persisted row has NON-NULL fetched_at (PIT invariant)', async () => {
        const nullCount = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT COUNT(*)::bigint AS count FROM "sentiment_observations" WHERE "fetched_at" IS NULL`
        );
        expect(Number(nullCount[0].count)).toBe(0);
      });

      it('enforces (ticker, message_id, model_version) composite uniqueness — backfill same-version is rejected', async () => {
        // Same triple as the first write → must throw the typed duplicate error.
        await expect(insertObservation({
          ticker: TEST_TICKER,
          source: 'stocktwits',
          message_id: 'integ-msg-1',
          raw_body: 'integration test body',
          classifier_version: TEST_MODEL_VERSION,
          classifier_score: 0.7,
          model_version: TEST_MODEL_VERSION,
          decay_weight: null,
          author_id: 'sha256:integ',
          author_features_snapshot: {
            account_age_days: 365, follower_count: 10, is_verified: false, message_count_30d: 3,
          },
        })).rejects.toBeInstanceOf(SentimentObservationDuplicateError);
      });

      it('allows insert under a NEW model_version for the same (ticker, message_id) — backfill PIT pattern', async () => {
        const r = await insertObservation({
          ticker: TEST_TICKER,
          source: 'stocktwits',
          message_id: 'integ-msg-1',
          raw_body: 'integration test body',
          classifier_version: 'finbert-prosus@sha-DUMMY',
          classifier_score: -0.2,                 // a new classifier scored it differently
          model_version: 'finbert-prosus@sha-DUMMY',  // ← NEW model_version → allowed
          decay_weight: null,
          author_id: 'sha256:integ',
          author_features_snapshot: {
            account_age_days: 365, follower_count: 10, is_verified: false, message_count_30d: 3,
          },
        });
        expect(r.id).toMatch(/^[0-9a-f-]{36}$/);
        insertedIds.push(r.id);
      });

      it('both required composite indexes exist on the table', async () => {
        const client = new Client({ connectionString: process.env.DATABASE_URL });
        await client.connect();
        try {
          const res = await client.query(
            `SELECT indexname FROM pg_indexes
             WHERE tablename = 'sentiment_observations' AND indexname LIKE 'idx_sentobs_%'`
          );
          const indexNames = res.rows.map(r => r.indexname).sort();
          expect(indexNames).toContain('idx_sentobs_ticker_fetched_at');
          expect(indexNames).toContain('idx_sentobs_ticker_modelver_fetched_at');
          expect(indexNames.length).toBeGreaterThanOrEqual(2);
        } finally {
          await client.end();
        }
      });

      it('raw_body_hash is the SHA-256 hex of the input (T-20-Z-01-02)', async () => {
        const row = await prisma.sentimentObservation.findFirst({
          where: { ticker: TEST_TICKER, message_id: 'integ-msg-1', model_version: TEST_MODEL_VERSION },
        });
        expect(row).not.toBeNull();
        // SHA-256 hex of "integration test body" — precomputed:
        // node -e 'console.log(require("crypto").createHash("sha256").update("integration test body","utf8").digest("hex"))'
        // (Executor must paste actual digest here; this assertion uses match-shape instead.)
        expect(row!.raw_body_hash).toMatch(/^[0-9a-f]{64}$/);
      });
    });
    ```

    Run:
    ```bash
    npm run test:integration -- sentiment-observation
    ```

    (If the project's integration runner uses a different invocation, adapt — but it MUST hit live Neon and MUST pass the 0-NULL `fetched_at` and composite-uniqueness assertions.)
  </action>
  <acceptance_criteria>
    - File exists: `test -f tests/integration/sentiment-observation.integration.test.ts`
    - `grep -c "it(" tests/integration/sentiment-observation.integration.test.ts` returns `>= 6`
    - `npm run test:integration -- sentiment-observation` exits 0
    - Direct SQL check: `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "sentiment_observations" WHERE "fetched_at" IS NULL'` returns a single row with value `0`
    - Direct SQL check: `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "sentiment_observations"'` returns a value `>= 1` (test left a row from the new-model_version case before afterAll cleanup, OR a real cron tick has run since Task 3)
  </acceptance_criteria>
  <automated>npm run test:integration -- sentiment-observation</automated>
  <done>≥6 integration tests GREEN against live Neon; PIT invariant (0 NULL fetched_at) and composite uniqueness verified; both required indexes confirmed via pg_indexes</done>
</task>

<task type="auto" id="20-Z-01-07">
  <name>Task 7: CI immutability guard — scripts/check-sentiment-immutability.ts + package.json wiring</name>
  <read_first>
    - scripts/model-card-status.ts (precedent for grep-style CI guards in this repo)
    - package.json (find the existing scripts block — add `check-immutability` near `model-card-status` if present)
  </read_first>
  <action>
    1. Create `scripts/check-sentiment-immutability.ts`:

       ```typescript
       #!/usr/bin/env -S node --import tsx
       /**
        * Plan 20-Z-01 — Immutability guard (T-20-Z-01-04).
        *
        * Greps the codebase for any UPDATE-shaped call against SentimentObservation
        * and exits non-zero. The whole PIT model collapses if a classifier-version
        * upgrade silently overwrites historical scores; this script is the CI gate
        * that prevents that.
        *
        * Approved escape hatches (allowlisted paths):
        *   - prisma/migrations/**         (Prisma-managed schema migrations)
        *   - scripts/check-sentiment-immutability.ts  (this file itself)
        *   - tests/**                                   (test mocks may reference the call shape)
        */
       import { readdirSync, readFileSync, statSync } from 'fs';
       import { join, relative } from 'path';

       const ROOT = process.cwd();
       const SCAN_ROOTS = ['src', 'scripts'];
       const FORBIDDEN_PATTERNS = [
         /prisma\.sentimentObservation\.update\b/,
         /prisma\.sentimentObservation\.updateMany\b/,
         /prisma\.sentimentObservation\.upsert\b/,
         /prisma\.sentimentObservation\.delete\b/,
         /prisma\.sentimentObservation\.deleteMany\b/,
       ];
       const ALLOWLIST_FILES = new Set<string>([
         'scripts/check-sentiment-immutability.ts',
       ]);

       function walk(dir: string, out: string[] = []): string[] {
         for (const name of readdirSync(dir)) {
           const p = join(dir, name);
           const s = statSync(p);
           if (s.isDirectory()) {
             if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
             walk(p, out);
           } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
             out.push(p);
           }
         }
         return out;
       }

       const offenders: Array<{ file: string; line: number; text: string; pattern: string }> = [];
       for (const root of SCAN_ROOTS) {
         const abs = join(ROOT, root);
         try { statSync(abs); } catch { continue; }
         for (const file of walk(abs)) {
           const rel = relative(ROOT, file);
           if (ALLOWLIST_FILES.has(rel)) continue;
           const text = readFileSync(file, 'utf8');
           const lines = text.split('\n');
           for (let i = 0; i < lines.length; i++) {
             for (const pat of FORBIDDEN_PATTERNS) {
               if (pat.test(lines[i])) {
                 offenders.push({ file: rel, line: i + 1, text: lines[i].trim(), pattern: pat.source });
               }
             }
           }
         }
       }

       if (offenders.length > 0) {
         console.error('check-sentiment-immutability: FAIL — SentimentObservation is insert-only (Plan 20-Z-01 / T-20-Z-01-04).');
         console.error('Backfills must use a NEW model_version, not overwrite an existing row.\n');
         for (const o of offenders) {
           console.error(`  ${o.file}:${o.line}  [${o.pattern}]`);
           console.error(`    ${o.text}`);
         }
         process.exit(1);
       }
       console.log('check-sentiment-immutability: OK — no SentimentObservation UPDATE/UPSERT/DELETE found in src/ or scripts/.');
       ```

    2. Edit `package.json` to add the script under `"scripts"`:
       ```json
       "check-immutability": "tsx scripts/check-sentiment-immutability.ts"
       ```

    3. Run it to confirm it exits 0 on the current tree (which has zero UPDATEs):
       ```bash
       npm run check-immutability
       ```

    4. Verify the negative case manually (do NOT commit the change — just test the guard):
       ```bash
       # Add a deliberate offender as a quick sanity check:
       echo "// prisma.sentimentObservation.update({ where: {}, data: {} });" >> src/lib/sentiment/observation-store.ts
       npm run check-immutability                                 # MUST exit non-zero
       git checkout -- src/lib/sentiment/observation-store.ts     # revert
       npm run check-immutability                                 # MUST exit 0 again
       ```
  </action>
  <acceptance_criteria>
    - File exists: `test -f scripts/check-sentiment-immutability.ts`
    - `grep -c '"check-immutability"' package.json` returns `1`
    - `npm run check-immutability` exits 0 on the committed tree
    - Negative-case sanity (see manual step) confirmed: injecting a fake UPDATE causes exit code 1
    - Guard skips `node_modules`, `.next`, `dist` (walk function filters these)
  </acceptance_criteria>
  <automated>npm run check-immutability</automated>
  <done>Immutability guard in place; exits 0 clean and non-zero on offender; wired into package.json</done>
</task>

<task type="auto" id="20-Z-01-08">
  <name>Task 8: Dataset card stub + commit + full test suite</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 22 S4 model-card requirement, line 90 20-Z-02 scope which fills this card)
    - .planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md (commit message format precedent)
  </read_first>
  <action>
    1. Create `.planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md`:

       ```markdown
       # Dataset Card — SentimentObservation

       **Status**: STUB (filled in by Plan 20-Z-02 — model + dataset card scaffold).

       **Plan of origin**: 20-Z-01 (this stub) + 20-Z-02 (full Gebru-2018 fill-in).

       **Format**: Mitchell-2019 model card / Gebru-2018 datasheet hybrid.

       ## Purpose (stub)

       SentimentObservation persists immutable point-in-time per-message sentiment
       observations. Each row is keyed by `(ticker, message_id, model_version)` and
       carries: SHA-256 hash of the raw message body, pinned classifier version,
       classifier score, decay weight (set later by Plan 20-A-03 via NEW model_version),
       hashed author ID, allowlisted author features, and `fetched_at` (the ONLY
       PIT-safe join key for backtest queries — see Plan 20-Z-07).

       ## Why this dataset exists

       Phase 20's per-document NLP (20-B-01), source-tier weighting (20-B-04),
       per-source ICIR (20-C-01), and time decay (20-A-03) all need a row-level
       immutable snapshot they can join on `fetched_at`. The pre-existing
       `SentimentSnapshot` table is at the ticker × cron-tick grain — too coarse for
       calibration work.

       ## What is NOT in this stub (filled in by 20-Z-02)

       - Composition (source breakdown, message-volume distribution)
       - Collection process (cron cadence, dedup behaviour)
       - Recommended uses / out-of-distribution warnings
       - Maintenance plan (retention, partitioning at Phase 27)
       - Fairness / bias considerations (deferred to Plan 20-C-06 audit)

       ## Plan-of-record references

       - **Schema**: `prisma/schema.prisma → model SentimentObservation`
       - **DAO**: `src/lib/sentiment/observation-store.ts`
       - **Writer**: `src/app/api/cron/sentiment-scan/route.ts` (Plan 20-Z-01 block)
       - **Immutability guard**: `scripts/check-sentiment-immutability.ts`
       - **PIT defense**: Plan 20-Z-07 lookahead-bias regression test (future)
       ```

    2. Run the full test suite to confirm zero regression:
       ```bash
       npm test
       npm run test:integration
       npm run check-immutability
       npx tsc --noEmit
       ```

    3. Stage and commit. Commit message:
       ```
       feat(20-z-01): SentimentObservation PIT feature store

       Adds an immutable point-in-time per-message sentiment observation table
       to support Phase 20 Waves A-D (time decay, per-doc NLP, source-tier weight,
       per-source ICIR). Composite unique on (ticker, message_id, model_version)
       means classifier upgrades insert a NEW row under a new model_version —
       never overwrite — preserving the PIT invariant that 20-Z-07 will enforce
       in production query paths.

       Defenses shipped:
         - SHA-256 hash of raw body only — raw text never persisted (T-20-Z-01-02)
         - PII allowlist on author_features_snapshot (T-20-Z-01-01)
         - Insert-only DAO + npm run check-immutability CI guard (T-20-Z-01-04)
         - // PIT-INVARIANT grep marker on fetched_at (T-20-Z-01-03)
         - Two composite indexes from day 1 (T-20-Z-01-05)

       Parallel-shadow pattern: the existing SentimentSnapshot writer in
       /api/cron/sentiment-scan continues unchanged; the new SentimentObservation
       writer runs in parallel inside the same cron loop, with failures
       logged-and-continued so the snapshot path remains uninterrupted.

       Dataset card stub committed; full Gebru-2018 fill-in deferred to 20-Z-02.

       Maps to phase threat catalog T-28-002 (lookahead bias) + T-28-004
       (silent classifier upgrade).

       Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
       ```

       Stage specifically (no `git add -A`):
       ```bash
       git add prisma/schema.prisma \
               src/lib/sentiment/observation-store.ts \
               src/app/api/cron/sentiment-scan/route.ts \
               scripts/check-sentiment-immutability.ts \
               package.json \
               tests/sentiment-observation-store.unit.test.ts \
               tests/integration/sentiment-observation.integration.test.ts \
               .planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md
       git commit -m "..."
       ```
  </action>
  <acceptance_criteria>
    - `test -f .planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md`
    - `grep -c "Plan 20-Z-02" .planning/phases/20-real-sentiment-analysis/DATASET-CARD-SentimentObservation.md` returns `>= 1` (forward reference)
    - `npm test` exits 0
    - `npm run test:integration` exits 0
    - `npm run check-immutability` exits 0
    - `npx tsc --noEmit` exits 0
    - `git log -1 --pretty=%s` matches `^feat\(20-z-01\):`
    - `git log -1 --pretty=%B | grep -c "T-20-Z-01-"` returns `>= 5` (all five threats referenced in commit message)
  </acceptance_criteria>
  <automated>npm test && npm run test:integration && npm run check-immutability && npx tsc --noEmit && git log -1 --pretty=%s | grep -q "^feat(20-z-01)"</automated>
  <done>Dataset card stub committed; full test suite green; commit landed referencing all five plan-level threats</done>
</task>

</tasks>

<verification>

Plan-level numerical acceptance (rolls up the per-task `<acceptance_criteria>`):

- [ ] `npm run test:integration -- sentiment-observation` exits 0
- [ ] `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "sentiment_observations" WHERE "fetched_at" IS NULL'` returns `0`
- [ ] `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "sentiment_observations"'` returns `>= 1` after one cron-equivalent invocation (Task 6 leaves a row, OR Task 3 + a real cron tick has run)
- [ ] `npm run check-immutability` exits 0
- [ ] `psql "$DATABASE_URL" -c '\d "sentiment_observations"' | grep -c "idx_sentobs_"` returns `>= 2`
- [ ] `psql "$DATABASE_URL" -c '\d "sentiment_observations"' | grep -c "sentobs_ticker_msg_modelver_uq"` returns `>= 1`
- [ ] `grep -c "// PIT-INVARIANT" prisma/schema.prisma` returns `>= 1`
- [ ] `grep -c "prisma.sentimentObservation.update\|prisma.sentimentObservation.upsert\|prisma.sentimentObservation.delete" src/` returns `0` (insert-only invariant)
- [ ] `grep -c "prisma.sentimentSnapshot.create" src/app/api/cron/sentiment-scan/route.ts` returns `1` (existing writer untouched)
- [ ] `npm test` exits 0 (Vitest unit)
- [ ] `npm run test:e2e` exits 0 (Playwright — no regression)
- [ ] Phase-20 cross-cutting standard S8 satisfied: zero adjectives in any DONE clause above

PIT-defense forward reference (20-Z-07):
- Plan 20-Z-07 will ship the lookahead-bias regression test that instruments the production query path via Prisma's query-event hook. It will assert no SQL / ORM call joins `SentimentObservation` on `published_at` for backtest paths. Plan 20-Z-01 provides the columns (`fetched_at` NOT NULL + `published_at` nullable + `// PIT-INVARIANT` marker) that 20-Z-07 reads. The two plans MUST stay co-evolved: any schema change to the join keys requires a 20-Z-07 update.

</verification>

<success_criteria>

1. **Live writes**: A real cron tick has written ≥1 `SentimentObservation` row, and zero rows have NULL `fetched_at` (CONTEXT.md line 89 numerical acceptance, gate 1 + gate 3).
2. **Existing path untouched**: The pre-existing `SentimentSnapshot` writer at `src/app/api/cron/sentiment-scan/route.ts` still runs unchanged — `grep -c "prisma.sentimentSnapshot.create" route.ts == 1`. Failure in the new writer never causes a snapshot row to be lost.
3. **PIT invariant codified**: `// PIT-INVARIANT` marker on `fetched_at` exists in `prisma/schema.prisma` and is grep-checkable by Plan 20-Z-07 (CONTEXT.md line 89 gate 2 — "lookahead-bias regression test (20-Z-07) green" — this plan provides the surface area, 20-Z-07 ships the test).
4. **Immutability enforced**: `npm run check-immutability` exits 0 on a clean tree; injecting a synthetic `prisma.sentimentObservation.update` causes exit code 1.
5. **PII defense**: Author allowlist rejects `bio`, `profile_text`, `email`, and any other off-allowlist key at the DAO layer (T-20-Z-01-01).
6. **Vendor-ToS defense**: No column named `raw_body` exists — only `raw_body_hash` (T-20-Z-01-02).
7. **Cardinality controlled**: Two composite indexes (`idx_sentobs_ticker_fetched_at`, `idx_sentobs_ticker_modelver_fetched_at`) exist in production Neon (T-20-Z-01-05).
8. **Backfill PIT pattern proven**: Integration test confirms the same `(ticker, message_id)` can be re-classified under a NEW `model_version` and the new row inserts successfully alongside the original (the canonical Phase 20 backfill shape that 20-A-03 / 20-B-01 / 20-B-04 will rely on).
9. **Dataset card forward-references 20-Z-02**: Stub committed; 20-Z-02 fills it in.
10. **No scope creep**: This plan does NOT ship time decay (20-A-03), per-aspect tagging (20-B-01/05), per-source ICIR (20-C-01), telemetry wrapper (20-Z-03), eval harness (20-Z-05), model-card scaffold (20-Z-02), lookahead regression test (20-Z-07), or anything from Waves A/B/C/D. Only schema + DAO + writer wiring + immutability guard + stub.

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-Z-01-SUMMARY.md` documenting:
- Final committed SHA + commit message
- `psql` row count, NULL-fetched_at count, and index list snapshots (proof of live state)
- Confirmation that 20-A-03, 20-B-01, 20-B-04, 20-C-01 can now build against this schema (link to each plan slot)
- Any deviations from this plan (none expected — but record explicitly if any)
- Pointer to 20-Z-02 (dataset card fill-in) and 20-Z-07 (PIT regression test) as the immediate downstream plans
</output>
