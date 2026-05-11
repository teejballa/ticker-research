---
phase: 20
plan: 20-A-04
wave: A
type: execute
depends_on: [20-Z-01]
files_modified:
  - src/lib/sentiment/gini.ts
  - src/lib/sentiment/aggregator.ts
  - src/lib/types.ts
  - prisma/schema.prisma
  - scripts/calibrate-author-share-thresholds.ts
  - src/app/api/cron/author-share-calibration/route.ts
  - vercel.json
  - src/components/ResearchReport.tsx
  - tests/sentiment-gini.unit.test.ts
  - tests/integration/sentiment-author-concentration.integration.test.ts
  - tests/playwright/research-author-concentration.spec.ts
  - docs/cards/MODEL-CARD-author-gini.md
  - HYPERPARAMETERS.md
autonomous: true
requirements: []
shadow_required: true
shadow_skip_reason: ""
hard_cleanup_gate: true
must_haves:
  truths:
    - "giniCoefficient(values) returns ∈ [0,1] with G=0 on uniform distribution and G→1 on perfect concentration"
    - "messageCountsByAuthor and authorShareDistribution operate on SentimentObservation[] from 20-Z-01 (PII-safe via author_id, never raw handle)"
    - "topNAuthorShare(counts, n) returns sum of top-N shares ∈ [0,1]"
    - "AuthorShareCalibration Prisma table exists in production Neon with one row per ticker recording trailing-90d Q1 author-share threshold"
    - "Cron /api/cron/author-share-calibration runs weekly (vercel.json schedule '0 8 * * 1') and writes new AuthorShareCalibration rows; old rows preserved for 30d (no UPDATE/DELETE in cron path — pure INSERT)"
    - "SentimentIntelligenceSection carries new optional field gini_coefficient: number | null (null when unique authors < 5; T-20-A-04-02)"
    - "Aggregator computes Gini over the 24h window of SentimentObservation rows for the ticker and surfaces it on SentimentIntelligenceSection"
    - "Aggregator down-weights observations whose author_share > per-ticker Q1 threshold by multiplying weight × 0.5 (Cookson/Engelberg-cited; documented in HYPERPARAMETERS.md)"
    - "UI renders 'Top author concentration' sub-card showing top-5 author shares as horizontal bars; each author label is the first 8 chars of sha256(author_id) (T-20-A-04-01 PII safety)"
    - "Shadow lifecycle: aggregator computes Gini in 'shadow' for ≥7d before flipping FEATURE_AUTHOR_GINI to 'on'; verdict gate = Gini values lie within published meme-stock distribution range [0.3, 0.85] on a backfill set of GME/AMC/SOFI"
    - "UI rollout gated SEPARATELY behind FEATURE_AUTHOR_GINI_UI=on (off|shadow|on); UI never reads from aggregator until both flags are 'on'"
    - "MODEL-CARD-author-gini.md committed per 20-Z-02 stub schema with intended use, training/calibration data, known failure modes (sparse-author tickers, single-poster days), retrain cadence (weekly cron)"
    - "Three canonical Gini unit tests pass: uniform 10-author equal counts → 0 (within ε=0.01); single-author → null (n_authors<5 sentinel); 80/20 Pareto canonical case → 0.5 (within ε=0.05)"
    - "PII safety unit test: rendered HTML for top-5 author bars contains 0 occurrences of any raw author handle from fixture; assert via grep on rendered DOM"
  artifacts:
    - path: "src/lib/sentiment/gini.ts"
      provides: "Pure-function Gini coefficient + author-share distribution + top-N share helpers (no Prisma imports — pure math)"
      contains: "export function giniCoefficient"
    - path: "src/lib/sentiment/aggregator.ts"
      provides: "Extended aggregator: computes Gini over 24h window + applies Q1-relative down-weight gated by FEATURE_AUTHOR_GINI"
      contains: "gini_coefficient"
    - path: "src/lib/types.ts"
      provides: "SentimentIntelligenceSection.gini_coefficient field + author_concentration: { author_hash_prefix: string; share: number }[]"
      contains: "gini_coefficient"
    - path: "prisma/schema.prisma"
      provides: "AuthorShareCalibration model — per-ticker weekly Q1 threshold (insert-only, 30d retention)"
      contains: "model AuthorShareCalibration"
    - path: "scripts/calibrate-author-share-thresholds.ts"
      provides: "Tuning script: for each ticker, computes Q1 of trailing-90d author-share distribution and inserts AuthorShareCalibration row"
      contains: "q1_author_share_pct"
    - path: "src/app/api/cron/author-share-calibration/route.ts"
      provides: "Weekly Vercel Cron handler invoking the calibration script"
      contains: "calibrateAuthorShareThresholds"
    - path: "src/components/ResearchReport.tsx"
      provides: "Top-author-concentration sub-card inside SentimentIntelligenceCard rendering top-5 shares as horizontal bars with hashed labels"
      contains: "Top author concentration"
    - path: "tests/sentiment-gini.unit.test.ts"
      provides: "Vitest unit cases — uniform → 0; single → null; 80/20 → 0.5; topNAuthorShare; PII rejection"
    - path: "tests/integration/sentiment-author-concentration.integration.test.ts"
      provides: "Live-Neon integration: aggregator computes gini_coefficient end-to-end for fixture ticker + AuthorShareCalibration round-trip + SQL row count assertion"
    - path: "tests/playwright/research-author-concentration.spec.ts"
      provides: "Playwright assertion: top-5 bars render; rendered HTML contains 0 raw author handles (PII safety)"
    - path: "docs/cards/MODEL-CARD-author-gini.md"
      provides: "Mitchell-2019 model card per 20-Z-02 schema for the Gini composite signal (S4)"
    - path: "HYPERPARAMETERS.md"
      provides: "Documents the 0.5 down-weight constant + n_authors<5 sentinel + Q1 threshold semantics + Cookson/Engelberg citation"
  key_links:
    - from: "src/lib/sentiment/aggregator.ts"
      to: "src/lib/sentiment/gini.ts giniCoefficient + messageCountsByAuthor + topNAuthorShare"
      via: "named imports inside the 24h-window aggregation path"
      pattern: "from ['\"]\\./gini['\"]"
    - from: "src/lib/sentiment/aggregator.ts"
      to: "prisma.sentimentObservation findMany filtered by ticker + fetched_at >= now()-24h"
      via: "PIT-safe query on fetched_at (S2 — never published_at, enforced by 20-Z-07)"
      pattern: "fetched_at"
    - from: "src/lib/sentiment/aggregator.ts"
      to: "prisma.authorShareCalibration findFirst by ticker order by computed_at desc"
      via: "Reads latest weekly threshold; if none exists falls back to global 0.25 sentinel + warns"
      pattern: "authorShareCalibration"
    - from: "src/components/ResearchReport.tsx Sentiment Intelligence card"
      to: "sentiment_intelligence.gini_coefficient + sentiment_intelligence.author_concentration"
      via: "Conditional render gated by FEATURE_AUTHOR_GINI_UI === 'on' AND gini_coefficient != null"
      pattern: "author_concentration"
    - from: "scripts/calibrate-author-share-thresholds.ts"
      to: "src/app/api/cron/author-share-calibration/route.ts"
      via: "Cron route imports + invokes the script function"
      pattern: "calibrateAuthorShareThresholds"
---

# Plan 20-A-04: Author-concentration via Gini coefficient + per-ticker Q1 calibration

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for ONE step only: the `npx prisma db push` against live Neon (Task 3 — additive `AuthorShareCalibration` table). All other tasks are autonomous. After the operator confirms the push, the remaining tasks (Gini library, aggregator wiring, calibration script, cron, UI sub-card, model card, tests, commit) proceed without further prompts.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. **Shadow lifecycle graduated**: `FEATURE_AUTHOR_GINI` flipped from `shadow` → `on` AFTER ≥7d of parallel shadow runs AND Gini values lie within published meme-stock range [0.3, 0.85] on the GME/AMC/SOFI backfill set.
2. **UI rollout gated SEPARATELY**: `FEATURE_AUTHOR_GINI_UI` is its own flag; UI does not render the sub-card until both flags are `on`. Cutover of the UI flag is a follow-up commit (not part of this plan's first-merge graduation).
3. **No old code deleted YET** — the legacy `unique_authors / total_messages` heuristic (currently `Map(author).size / messages.length` in aggregator) stays in place during shadow. Deletion happens in the cleanup commit AFTER `FEATURE_AUTHOR_GINI=on`.
4. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest), `npm run test:e2e` (Playwright) all green on `main` post-commit.
5. **Schema Push Gate**: `npx prisma db push` succeeded against the live `DATABASE_URL` (production Neon) AND the integration test `tests/integration/sentiment-author-concentration.integration.test.ts` writes ≥1 `AuthorShareCalibration` row in a single cron-equivalent invocation.
6. **Model card gate**: `docs/cards/MODEL-CARD-author-gini.md` exists and `scripts/check-model-cards.ts` (from 20-Z-02 — when shipped) exits 0 for the gini artifact.
7. **PII gate**: `tests/playwright/research-author-concentration.spec.ts` asserts the rendered HTML contains zero occurrences of any raw author handle from the fixture (only 8-char sha256 prefixes).

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — The X% threshold is NOT hand-set. It is the per-ticker trailing-90d Q1 of author-share distribution, computed weekly by `scripts/calibrate-author-share-thresholds.ts` and persisted in `AuthorShareCalibration`. The down-weight multiplier of 0.5 is the literature-cited default (Cookson & Engelberg 2020 "Echo Chambers" — see HYPERPARAMETERS.md).
- **S3 (shadow lifecycle)** — Two flags: `FEATURE_AUTHOR_GINI` (computation) + `FEATURE_AUTHOR_GINI_UI` (rendering). Both `off | shadow | on`. Verdict for `shadow → on`: Gini values within [0.3, 0.85] published meme-stock range on backfill (GME/AMC/SOFI). UI cutover is gated SEPARATELY per the spec ("UI rollout gated separately").
- **S4 (model card)** — Gini is a composite signal. `docs/cards/MODEL-CARD-author-gini.md` documents intended use, calibration data, failure modes (sparse-author tickers — handled by `n_authors<5 → null` sentinel; single-day burst from one journalist — handled by relative-to-Q1 down-weighting), retrain cadence (weekly cron). Stub against 20-Z-02 template; full fill-in tracked under 20-Z-02.
- **S7 (threat model)** — Five plan-level threats T-20-A-04-{01..05} below. Maps to phase catalog T-28-001 (PII leak), T-28-003 (silent suppression of legitimate signal).
- **S8 (numerical acceptance)** — every DONE criterion is a grep / numeric assertion / row-count / formula equality within ε. Zero adjectives.

## Forward / backward references

- **Depends on 20-Z-01**: Reads `SentimentObservation.author_id` (already PII-safe — sha256("{source}:{handle}")) and `fetched_at` (PIT-safe join key). All queries go through `prisma.sentimentObservation` with `fetched_at >= now()-24h`.
- **Forward-referenced by 20-A-01**: 20-A-01 (dispersion + crowded_consensus) imports `giniCoefficient` from `src/lib/sentiment/gini.ts` for its `author_diversity` term. Spec line: "Note: 20-A-01 references the Gini implementation here. 20-A-04 owns the implementation; 20-A-01 forward-references it." 20-A-04 ships the function; 20-A-01 wires it into the dispersion composite.

</universal_preamble>

<objective>
Replace the unique_authors/total_messages heuristic with the Gini coefficient of message-counts-per-author across the rolling 24h window of `SentimentObservation` rows. Surface `gini_coefficient` on `SentimentIntelligenceSection`, render top-5 author shares as horizontal bars in the UI (with hashed author labels — never raw handles), and down-weight messages from authors whose 24h share exceeds the per-ticker trailing-90d Q1 threshold (calibrated weekly, never hand-picked). Per Cookson & Engelberg, this punishes only abnormally-concentrated voices on the SAME ticker, not legitimate high-volume informed posters.

Purpose: Wave-A goal is to ship the GME-100% fix without per-document NLP. Author-concentration is one of the four Cookson-style crowding signals (the others: entropy of bull/bear tags → 20-A-01, mention z-score → 20-A-02, time-decay → 20-A-03). The current unique-authors ratio is symmetric — 10 authors with 1 message each gets the same score as 1 author with 10 messages and 9 with 1 each. Gini is the standard inequality measure that distinguishes them.

Output:
- 1 new pure-math module (~120 LOC: giniCoefficient + messageCountsByAuthor + authorShareDistribution + topNAuthorShare)
- 1 new Prisma model (`AuthorShareCalibration`) + 1 index, additive
- 1 calibration script + 1 weekly Vercel Cron route
- 1 aggregator extension (gated by FEATURE_AUTHOR_GINI; computes Gini + applies Q1 down-weight)
- 1 type field (`gini_coefficient`) + 1 nested array (`author_concentration`) on SentimentIntelligenceSection
- 1 UI sub-card inside SentimentIntelligenceCard (top-5 horizontal bars, hashed labels, gated by FEATURE_AUTHOR_GINI_UI)
- 1 unit test file (≥7 cases covering the 3 canonical Gini examples + topNAuthorShare + PII rejection)
- 1 live-Neon integration test (≥3 cases including 0-NULL calibration row + Gini round-trip)
- 1 Playwright spec (top-5 bars render + 0 raw handles in HTML)
- 1 model card stub
- HYPERPARAMETERS.md entries for the 0.5 down-weight constant + n_authors<5 sentinel
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@prisma/schema.prisma
@src/lib/sentiment/aggregator.ts
@src/lib/types.ts
@src/lib/db.ts
@src/components/ResearchReport.tsx
@vercel.json
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md

<interfaces>

```typescript
// src/lib/sentiment/gini.ts — NEW (pure math, no Prisma imports)

/**
 * Standard Gini coefficient.
 *
 * Formula (after sorting `values` ascending, x_1 ≤ x_2 ≤ ... ≤ x_n):
 *
 *     G = (2 × Σ_{i=1..n} i × x_i) / (n × Σ x_i) − (n+1)/n
 *
 * Returns ∈ [0, 1]:
 *   - 0 = perfect equality (every author posts same count)
 *   - 1 = perfect concentration (one author posts everything)
 *
 * Edge cases:
 *   - Empty array → throws RangeError("giniCoefficient: empty input")
 *   - Single value → 0 (degenerate equality; consumers using n_authors<5 sentinel handle this)
 *   - Negative values → throws RangeError (counts must be ≥ 0)
 *   - All zeros → throws RangeError("giniCoefficient: total=0")
 */
export function giniCoefficient(values: number[]): number;

/**
 * Roll up SentimentObservation[] into per-author message counts.
 * Uses observation.author_id directly — already sha256-hashed by 20-Z-01.
 * Skips rows where classifier_score === null (didn't actually classify the message).
 */
export interface MinimalObservation {
  author_id: string;
  classifier_score: number | null;
}
export function messageCountsByAuthor(observations: MinimalObservation[]): Map<string, number>;

/**
 * Author-share distribution sorted DESCENDING by share.
 * share_i = count_i / total_count ∈ [0, 1].
 * Returns [] when input is empty.
 */
export interface AuthorShare {
  author_id: string;     // already sha256-hashed (from 20-Z-01)
  share: number;         // ∈ [0, 1]
  message_count: number; // raw count for UI tooltip
}
export function authorShareDistribution(counts: Map<string, number>): AuthorShare[];

/**
 * Sum of the top-N author shares.
 * Returns 0 when counts is empty.
 * If counts.size < n, sums all available shares (returns ≤ 1).
 */
export function topNAuthorShare(counts: Map<string, number>, n: number): number;

/**
 * Hash an author_id to its 8-char display prefix for UI rendering.
 * Author IDs from 20-Z-01 are already sha256(`{source}:{handle}`) — this just
 * slices the first 8 chars for display. Defense-in-depth: even if a raw handle
 * leaks into author_id upstream, this function truncates and re-hashes.
 */
export function authorDisplayPrefix(author_id: string): string; // returns 8 lowercase hex chars
```

```prisma
// prisma/schema.prisma — NEW model (appended after EngineThesis or SentimentObservation)

// ─── Phase 20-A-04 — Per-ticker author-share Q1 calibration ───
// Weekly cron computes the 25th percentile (Q1) of trailing-90d author-share
// distribution per ticker. Aggregator down-weights observations whose author's
// 24h share exceeds this Q1 — i.e., punishes only authors more concentrated than
// the ticker's normal pattern (Cookson & Engelberg 2020 echo-chamber relative-baseline).
// Insert-only; 30d retention. Old rows preserved so historical reads can replay
// what threshold was active at any past timestamp (PIT — S2).
model AuthorShareCalibration {
  id                   String   @id @default(uuid())
  ticker               String
  // PIT-INVARIANT — readers MUST use computed_at to find the threshold active at any past time.
  computed_at          DateTime @default(now()) @db.Timestamptz
  q1_author_share_pct  Float    // 25th percentile of author-share distribution ∈ [0, 1]
  n_observations       Int      // size of the calibration sample (90d window for ticker)
  training_window_days Int      @default(90)

  @@index([ticker, computed_at(sort: Desc)], map: "idx_authcal_ticker_computed_at")
  @@map("author_share_calibrations")
}
```

```typescript
// src/lib/types.ts — extension to SentimentIntelligenceSection

export interface SentimentIntelligenceSection extends SourceSection {
  // ... existing fields unchanged ...

  // ─── Phase 20-A-04 — author-concentration via Gini ───
  /**
   * Gini coefficient of message-counts-per-author over the rolling 24h window.
   * ∈ [0, 1]; 0 = perfectly even, 1 = single author dominates.
   * Null when n_authors < 5 (insufficient data for a meaningful inequality measure;
   * T-20-A-04-02). Optional/nullable so SourcePackage stays backward-compatible
   * when FEATURE_AUTHOR_GINI is `off` or `shadow`.
   */
  gini_coefficient?: number | null;
  /**
   * Top-5 author shares for the 24h window. UI renders as horizontal bars.
   * author_hash_prefix is the FIRST 8 CHARS of sha256(author_id); raw handles
   * are NEVER surfaced (T-20-A-04-01 PII defense; references 20-Z-01 allowlist).
   */
  author_concentration?: Array<{
    author_hash_prefix: string;  // 8 lowercase hex chars
    share: number;               // ∈ [0, 1]
    message_count: number;
  }> | null;
}
```

```typescript
// src/lib/sentiment/aggregator.ts — additions (does NOT modify existing exports)

import { prisma } from '@/lib/db';
import {
  giniCoefficient,
  messageCountsByAuthor,
  authorShareDistribution,
  authorDisplayPrefix,
} from './gini';

/**
 * Compute the author-concentration block for a ticker over the rolling 24h window.
 * Reads from SentimentObservation (20-Z-01) — PIT-safe via fetched_at.
 *
 * Returns null when:
 *   - FEATURE_AUTHOR_GINI === 'off'
 *   - n_authors < 5 (insufficient data — T-20-A-04-02)
 *   - 0 observations in window
 *
 * Down-weighting (when FEATURE_AUTHOR_GINI === 'on'): observations whose author's
 * 24h share exceeds per-ticker Q1 (looked up from AuthorShareCalibration) get
 * weight × 0.5. The 0.5 multiplier is the Cookson-cited literature default —
 * documented in HYPERPARAMETERS.md.
 */
export interface AuthorConcentrationResult {
  gini_coefficient: number | null;
  author_concentration: Array<{
    author_hash_prefix: string;
    share: number;
    message_count: number;
  }> | null;
  /** Per-author down-weight multipliers ∈ {1.0, 0.5}. Used by callers that combine
   *  this with the Beta-smoothed aggregator. Empty Map when down-weighting is off. */
  weight_multipliers: Map<string, number>;
}

export async function computeAuthorConcentration(
  ticker: string,
  now: Date = new Date(),
): Promise<AuthorConcentrationResult>;
```

```typescript
// scripts/calibrate-author-share-thresholds.ts — NEW

/**
 * Weekly calibration: for each ticker with ≥30d of SentimentObservation history,
 * compute the trailing-90d author-share distribution and insert a new
 * AuthorShareCalibration row with the Q1 (25th percentile) threshold.
 *
 * Insert-only — never UPDATE/DELETE. Old rows preserved for 30d for historical
 * replay. A separate 30d-retention cleanup is OUT OF SCOPE for this plan
 * (tracked under Phase 27 follow-up).
 */
export async function calibrateAuthorShareThresholds(opts?: {
  trainingWindowDays?: number;  // default 90
  minObservations?: number;     // default 30 — skip tickers below this
}): Promise<{ tickers_calibrated: number; rows_inserted: number; skipped_sparse: string[] }>;
```

```typescript
// src/app/api/cron/author-share-calibration/route.ts — NEW

// Vercel Cron — runs weekly. Schedule defined in vercel.json: "0 8 * * 1" (Mondays 08:00 UTC).
import { calibrateAuthorShareThresholds } from '@/../scripts/calibrate-author-share-thresholds';
import { withTelemetry } from '@/lib/observability/telemetry'; // from 20-Z-03 (forward ref — soft dep)

export async function GET(request: Request): Promise<Response>;
// Returns: { tickers_calibrated, rows_inserted, skipped_sparse, ms_elapsed, status: 'ok' | 'partial' }
```

```typescript
// Feature flags (already in src/lib/featureFlags.ts pattern from Phase 19)

export const FEATURE_AUTHOR_GINI: 'off' | 'shadow' | 'on' =
  (process.env.FEATURE_AUTHOR_GINI as 'off' | 'shadow' | 'on') ?? 'shadow';
export const FEATURE_AUTHOR_GINI_UI: 'off' | 'shadow' | 'on' =
  (process.env.FEATURE_AUTHOR_GINI_UI as 'off' | 'shadow' | 'on') ?? 'off';
```

</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| SentimentObservation read → aggregator → SentimentIntelligenceSection | author_id traverses this path; must be hashed at every hop and never re-expanded to raw handle |
| Aggregator → ResearchReport.tsx → rendered HTML | rendered HTML is user-visible; raw author handles MUST NOT appear |
| Calibration cron → AuthorShareCalibration table → aggregator read | concurrent reads of latest threshold during write must be safe |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-A-04-01 | Information disclosure | `author_id` → UI `author_hash_prefix` could leak PII if upstream handle is mistakenly persisted as `author_id` | mitigate | Two layers: (1) 20-Z-01 already hashes via `sha256("{source}:{handle}")` and the `author_features_snapshot` allowlist rejects `bio`/`profile_text`/`email`; (2) `authorDisplayPrefix(author_id)` UI helper takes ONLY the first 8 chars of the already-hashed `author_id` — never the raw handle. Playwright spec asserts `grep -c "data-raw-author-handle\|@\\w" rendered.html` returns 0 over a fixture using realistic handles like `@WallStreetBets_Mod`. References 20-Z-01 PII allowlist (T-20-Z-01-01). |
| T-20-A-04-02 | Tampering / data integrity | Gini = 0 returned for single-author tickers (only one user posted) — would falsely signal "perfect equality" | mitigate | When n_authors < 5, `computeAuthorConcentration` returns `gini_coefficient: null` and `author_concentration: null`. UI renders "insufficient data — fewer than 5 unique authors in 24h window" copy instead of an empty bar chart. Unit test asserts the sentinel for n_authors ∈ {0, 1, 4}. |
| T-20-A-04-03 | Tampering / race | Calibration cron writes a new threshold while in-flight aggregator reads a different one | mitigate | INSERT-only model — no UPDATE or DELETE in cron path. Aggregator reads `findFirst` ordered by `computed_at desc`, which is atomic in Postgres. New row appears AFTER successful insert; in-flight reads see the previous row. Old rows retained for 30d (Phase 27 cleanup); aggregator NEVER reads `LIMIT 0,1` via mutable index — only the time-sorted `findFirst`. |
| T-20-A-04-04 | Tampering / fairness | Down-weighting suppresses legitimate high-volume informed posters (e.g., @TheTranscriptApp posts every earnings call) | mitigate | Down-weight is PER-TICKER-RELATIVE — only fires when an author's 24h share exceeds that ticker's own historical Q1. A poster who consistently posts ~10% of every ticker's volume is the NORM for that ticker (Q1 will track them) and won't be down-weighted. The model card (`docs/cards/MODEL-CARD-author-gini.md`) documents the false-suppression rate measurement methodology + commits to revisiting it after 90d of production data. Maps to phase catalog T-28-003 (silent suppression). |
| T-20-A-04-05 | Tampering / generalization | Synthetic-data integration test passes but real-world author-share distribution differs (Pareto tails fatter than synthetic) | mitigate | Integration test asserts the Gini formula on THREE documented edge cases on synthetic data — uniform 10×1, single 1×10, Pareto 80/20 — AND on a captured snapshot of real GME 24h data from production (committed under `tests/fixtures/sentiment/gme-24h-snapshot.json`, sourced from a recorded production query, with author handles re-hashed before commit per T-20-A-04-01). Snapshot Gini value asserted within ε=0.05 of an externally-computed reference. |

</threat_model>

<tasks>

<task type="auto" id="20-A-04-01" tdd="true">
  <name>Task 1: Implement gini.ts pure-math module + unit tests (RED → GREEN)</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 106 = 20-A-04 spec; lines 9-41 = S1-S10)
    - src/lib/sentiment/aggregator.ts (existing module style for export patterns)
    - .planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md (Vitest test pattern precedent)
  </read_first>
  <behavior>
    Vitest cases that MUST be written FIRST and fail before implementation:
    - **Canonical 1 — uniform**: `giniCoefficient([1,1,1,1,1,1,1,1,1,1])` → 0 within ε=0.01
    - **Canonical 2 — perfect concentration**: `giniCoefficient([0,0,0,0,0,0,0,0,0,10])` → 0.9 within ε=0.01 (n=10 limits it; pure 1.0 is the asymptotic limit as n→∞)
    - **Canonical 3 — two-author 50/50**: `giniCoefficient([5,5])` → 0 within ε=0.01
    - **Canonical 4 — Pareto 80/20**: `giniCoefficient` on the canonical Pareto example `[1,1,1,1,1,1,1,1,16]` (1 author has 80% of total = 16/(16+8); 8 authors split the remaining 20%) → ≈ 0.7 within ε=0.05; assert exact value computed via independent formula in test setup
    - **Edge — empty array**: throws `RangeError("giniCoefficient: empty input")`
    - **Edge — all zeros**: throws `RangeError("giniCoefficient: total=0")`
    - **Edge — negative value**: throws `RangeError`
    - **messageCountsByAuthor — null score skip**: input with one row `{ author_id: "a", classifier_score: null }` and one `{ author_id: "b", classifier_score: 0.5 }` returns Map with only `b → 1`
    - **authorShareDistribution — descending**: input Map `{ a: 1, b: 5, c: 2 }` returns `[{author_id:'b',share:0.625,...}, {c, 0.25}, {a, 0.125}]`
    - **topNAuthorShare — n > size**: `topNAuthorShare(Map{a:1,b:1}, 5)` returns 1.0 (sums all available)
    - **authorDisplayPrefix — length 8**: returns string of length 8, all lowercase hex
  </behavior>
  <action>
    1. Create `tests/sentiment-gini.unit.test.ts` with the cases above. Run `npm test -- sentiment-gini` and confirm RED (module doesn't exist yet).
    2. Create `src/lib/sentiment/gini.ts` implementing the four exports + `authorDisplayPrefix` per the `<interfaces>` spec. Use the literal formula from the JSDoc:

       ```typescript
       // After sorting ascending: G = (2 × Σ i×x_i) / (n × Σ x_i) − (n+1)/n
       const sorted = [...values].sort((a, b) => a - b);
       const n = sorted.length;
       const total = sorted.reduce((s, v) => s + v, 0);
       if (total === 0) throw new RangeError('giniCoefficient: total=0');
       let weightedSum = 0;
       for (let i = 0; i < n; i++) weightedSum += (i + 1) * sorted[i];
       const g = (2 * weightedSum) / (n * total) - (n + 1) / n;
       return Math.max(0, Math.min(1, g));  // numerical safety clamp
       ```

       For `authorDisplayPrefix`: `crypto.createHash('sha256').update(author_id, 'utf8').digest('hex').slice(0, 8)`. Defense-in-depth re-hash even though 20-Z-01 already hashed.
    3. Run `npm test -- sentiment-gini` and confirm GREEN — all 11 cases pass.
  </action>
  <acceptance_criteria>
    - `tests/sentiment-gini.unit.test.ts` exists; `grep -c "describe" tests/sentiment-gini.unit.test.ts` returns ≥ 1
    - `src/lib/sentiment/gini.ts` exports exactly 5 named exports: `giniCoefficient`, `messageCountsByAuthor`, `authorShareDistribution`, `topNAuthorShare`, `authorDisplayPrefix`
    - `npm test -- sentiment-gini` exits 0 with all 11 cases passing
    - `grep -c "from '@prisma" src/lib/sentiment/gini.ts` returns 0 (pure math, no Prisma)
    - `grep -c "G = (2" src/lib/sentiment/gini.ts` returns ≥ 1 (formula in JSDoc — proves canonical formula was used)
  </acceptance_criteria>
  <verify>
    <automated>npm test -- sentiment-gini --run</automated>
  </verify>
  <done>Pure-math Gini library exists; 11 canonical/edge unit tests green; no Prisma deps in module</done>
</task>

<task type="auto" id="20-A-04-02">
  <name>Task 2: Add AuthorShareCalibration Prisma model</name>
  <read_first>
    - prisma/schema.prisma (current bottom = `EngineThesis`)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md Task 1 (precedent for additive PIT-aware schema)
  </read_first>
  <action>
    Append to `prisma/schema.prisma` AFTER `EngineThesis`:

    ```prisma

    // ─── Phase 20-A-04 — Per-ticker author-share Q1 calibration ───
    // Weekly cron computes Q1 (25th percentile) of trailing-90d author-share
    // distribution per ticker. Aggregator down-weights observations whose author's
    // 24h share exceeds this Q1 — punishes only authors more concentrated than
    // the ticker's own historical pattern (Cookson & Engelberg 2020).
    // Insert-only; 30d retention via Phase-27 cleanup. Old rows preserved so
    // historical reads can replay the threshold active at any past timestamp.
    model AuthorShareCalibration {
      id                   String   @id @default(uuid())
      ticker               String
      // PIT-INVARIANT — readers use computed_at to find the threshold active at any past time.
      computed_at          DateTime @default(now()) @db.Timestamptz
      q1_author_share_pct  Float    // 25th percentile of author-share distribution ∈ [0, 1]
      n_observations       Int      // size of the 90d calibration sample for the ticker
      training_window_days Int      @default(90)

      @@index([ticker, computed_at(sort: Desc)], map: "idx_authcal_ticker_computed_at")
      @@map("author_share_calibrations")
    }
    ```

    Then run:

    ```bash
    npx prisma format
    npx prisma generate
    ```

    Do NOT push yet — that's Task 3.
  </action>
  <acceptance_criteria>
    - `grep -c "model AuthorShareCalibration" prisma/schema.prisma` returns 1
    - `grep -c "// PIT-INVARIANT" prisma/schema.prisma` returns ≥ 2 (one from 20-Z-01 SentimentObservation + new one here)
    - `grep -c "idx_authcal_ticker_computed_at" prisma/schema.prisma` returns 1
    - `npx prisma format` exits 0 with no diff
    - `npx prisma generate` exits 0
    - No existing model modified: `git diff prisma/schema.prisma | grep -E "^-[^-]" | wc -l` returns 0
  </acceptance_criteria>
  <verify>
    <automated>npx prisma format && grep -q "model AuthorShareCalibration" prisma/schema.prisma && grep -q "idx_authcal_ticker_computed_at" prisma/schema.prisma</automated>
  </verify>
  <done>AuthorShareCalibration model + 1 index + PIT marker present; client regenerated; no existing model touched</done>
</task>

<task type="checkpoint:human-action" id="20-A-04-03" gate="blocking">
  <name>Task 3: [BLOCKING] Operator runs `npx prisma db push` against live Neon</name>
  <what-built>
    Task 2 added the `AuthorShareCalibration` model to `prisma/schema.prisma` (additive — no existing model touched). The DB push is operator-confirmed per the 20-Z-01 precedent.
  </what-built>
  <how-to-verify>
    Run from the repo root with the production Neon `DATABASE_URL` exported (the same one used by Vercel — confirm with `vercel env ls` or `cat .env.local | grep DATABASE_URL` and verify it matches the production Vercel env var):

    ```bash
    npx prisma db push
    ```

    Then verify the table exists with the correct shape:

    ```bash
    psql "$DATABASE_URL" -c '\d "author_share_calibrations"'
    ```

    Expected: 5 columns (`id`, `ticker`, `computed_at`, `q1_author_share_pct`, `n_observations`, `training_window_days`); 1 index `idx_authcal_ticker_computed_at`; row count 0 (no rows yet — calibration script hasn't run).

    Also verify the `SentimentObservation` table from 20-Z-01 still exists and is unchanged:

    ```bash
    psql "$DATABASE_URL" -c '\d "sentiment_observations"' | grep -c "fetched_at" # → 1
    ```
  </how-to-verify>
  <resume-signal>Reply "pushed" when both psql checks above succeed (table exists with 5 cols + 1 index, sentiment_observations untouched), or describe the failure.</resume-signal>
</task>

<task type="auto" id="20-A-04-04">
  <name>Task 4: Implement calibration script + Vercel Cron route</name>
  <read_first>
    - src/lib/db.ts (prisma singleton)
    - src/app/api/cron/sentiment-scan/route.ts (existing cron handler pattern)
    - vercel.json (existing cron schedules)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (cross-cutting standards S1, S6 telemetry)
  </read_first>
  <action>
    1. Create `scripts/calibrate-author-share-thresholds.ts`:

       ```typescript
       /**
        * Plan 20-A-04 — Weekly per-ticker author-share Q1 calibration.
        * For each ticker with ≥minObservations rows in the trailing trainingWindowDays:
        *   1. Group SentimentObservation rows by author_id, computing per-author share
        *      of total within trailing trainingWindowDays.
        *   2. Compute the 25th percentile (Q1) of that share distribution.
        *   3. INSERT a new AuthorShareCalibration row (never UPDATE).
        */
       import { prisma } from '@/lib/db';
       import { messageCountsByAuthor, authorShareDistribution } from '@/lib/sentiment/gini';

       export async function calibrateAuthorShareThresholds(opts: {
         trainingWindowDays?: number;
         minObservations?: number;
       } = {}) {
         const trainingWindowDays = opts.trainingWindowDays ?? 90;
         const minObservations = opts.minObservations ?? 30;
         const since = new Date(Date.now() - trainingWindowDays * 24 * 3600 * 1000);

         // Distinct tickers with any observation in the window — small set, OK to load.
         const distinctTickers = await prisma.sentimentObservation.findMany({
           where: { fetched_at: { gte: since } },
           select: { ticker: true },
           distinct: ['ticker'],
         });

         let rows_inserted = 0;
         const skipped_sparse: string[] = [];
         for (const { ticker } of distinctTickers) {
           const obs = await prisma.sentimentObservation.findMany({
             where: { ticker, fetched_at: { gte: since } },
             select: { author_id: true, classifier_score: true },
           });
           if (obs.length < minObservations) { skipped_sparse.push(ticker); continue; }
           const counts = messageCountsByAuthor(obs);
           const dist = authorShareDistribution(counts);
           if (dist.length === 0) { skipped_sparse.push(ticker); continue; }
           const shares = dist.map(d => d.share);
           // Q1 = 25th percentile via linear interpolation (NIST method 7).
           const idx = (shares.length - 1) * 0.25;
           const lo = Math.floor(idx), hi = Math.ceil(idx);
           const q1 = lo === hi
             ? shares[lo]
             : shares[lo] * (hi - idx) + shares[hi] * (idx - lo);
           await prisma.authorShareCalibration.create({
             data: {
               ticker,
               q1_author_share_pct: q1,
               n_observations: obs.length,
               training_window_days: trainingWindowDays,
             },
           });
           rows_inserted++;
         }
         return { tickers_calibrated: distinctTickers.length - skipped_sparse.length, rows_inserted, skipped_sparse };
       }
       ```

    2. Create `src/app/api/cron/author-share-calibration/route.ts`:

       ```typescript
       import { NextResponse } from 'next/server';
       import { calibrateAuthorShareThresholds } from '@/../scripts/calibrate-author-share-thresholds';

       export const runtime = 'nodejs';
       export const maxDuration = 60;

       export async function GET(request: Request) {
         // Vercel Cron auth — same pattern as sentiment-scan/route.ts
         const authHeader = request.headers.get('authorization');
         if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
           return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
         }
         const t0 = Date.now();
         try {
           const result = await calibrateAuthorShareThresholds();
           return NextResponse.json({ ...result, ms_elapsed: Date.now() - t0, status: 'ok' });
         } catch (err) {
           const msg = err instanceof Error ? err.message : String(err);
           return NextResponse.json({ status: 'error', error: msg, ms_elapsed: Date.now() - t0 }, { status: 500 });
         }
       }
       ```

    3. Add the schedule to `vercel.json` `crons` array — preserve all existing entries:

       ```json
       { "path": "/api/cron/author-share-calibration", "schedule": "0 8 * * 1" }
       ```

       Mondays 08:00 UTC — once per week, as spec demands.
  </action>
  <acceptance_criteria>
    - `scripts/calibrate-author-share-thresholds.ts` exists; exports `calibrateAuthorShareThresholds`
    - `src/app/api/cron/author-share-calibration/route.ts` exists; exports `GET`
    - `grep -c "/api/cron/author-share-calibration" vercel.json` returns 1
    - `grep -c "0 8 \\* \\* 1" vercel.json` returns 1
    - `grep -c "prisma.authorShareCalibration.update\\|prisma.authorShareCalibration.delete" scripts/calibrate-author-share-thresholds.ts src/app/api/cron/author-share-calibration/route.ts` returns 0 (insert-only — T-20-A-04-03)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -q '"path": "/api/cron/author-share-calibration"' vercel.json && [ "$(grep -c 'authorShareCalibration\.\(update\|delete\|upsert\)' scripts/calibrate-author-share-thresholds.ts src/app/api/cron/author-share-calibration/route.ts 2>/dev/null)" = "0" ]</automated>
  </verify>
  <done>Calibration script + cron route exist; weekly schedule wired in vercel.json; INSERT-only verified</done>
</task>

<task type="auto" id="20-A-04-05" tdd="true">
  <name>Task 5: Wire aggregator + extend SentimentIntelligenceSection types + integration test</name>
  <read_first>
    - src/lib/sentiment/aggregator.ts (existing exports — must not break post-Phase-19 multi-source aggregator)
    - src/lib/types.ts (lines 129-161 — SentimentIntelligenceSection)
    - src/lib/db.ts
    - .planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md (Vitest+integration test precedent)
  </read_first>
  <behavior>
    Integration test cases (live-Neon) — write FIRST and confirm RED:
    - **End-to-end Gini computation**: seed 5 SentimentObservation rows for ticker `TESTGINI` with author counts `[5,3,2,1,1]`; call `computeAuthorConcentration("TESTGINI")`; assert `gini_coefficient` ≈ 0.42 within ε=0.05 (computed independently)
    - **n_authors<5 sentinel**: seed 4 rows with 4 distinct authors; assert `gini_coefficient === null` AND `author_concentration === null`
    - **AuthorShareCalibration round-trip**: insert 1 calibration row for `TESTGINI` with `q1=0.10`; seed observations where author A has 30% share (>0.10); assert `weight_multipliers.get(A_hashed) === 0.5`; author B with 5% share (<0.10) gets `weight_multipliers.get(B_hashed) === 1.0`
    - **PIT correctness**: integration test asserts the aggregator's findMany SQL filters by `fetched_at` (not `published_at`) — capture via Prisma query event hook (same pattern 20-Z-07 will use)
    - **SQL row count**: after one cron-equivalent invocation of `calibrateAuthorShareThresholds({minObservations: 1})` against the test ticker, `psql -c 'SELECT COUNT(*) FROM "author_share_calibrations" WHERE ticker = $1' TESTGINI` returns ≥ 1
  </behavior>
  <action>
    1. Extend `src/lib/types.ts` `SentimentIntelligenceSection` per the `<interfaces>` block — add `gini_coefficient?: number | null;` and `author_concentration?: ...[] | null;`. ALL OTHER FIELDS UNCHANGED. Write `tsc --noEmit` and confirm compile.

    2. Create `tests/integration/sentiment-author-concentration.integration.test.ts` with the 5 cases above. Use a unique test ticker `TESTGINI_A04` to avoid collisions with prod data. Cleanup hook deletes seeded rows in `afterAll`.

    3. Run `npm run test:integration -- sentiment-author-concentration` and confirm RED.

    4. Add `computeAuthorConcentration` to `src/lib/sentiment/aggregator.ts` per the `<interfaces>` spec. Reads from `SentimentObservation` filtering on `fetched_at >= now() - 24h`. Looks up latest `AuthorShareCalibration` for ticker via `findFirst({ orderBy: { computed_at: 'desc' } })`; falls back to `0.25` global sentinel + `console.warn` when none exists. Returns `gini_coefficient: null` when `n_authors < 5`. When FEATURE_AUTHOR_GINI === 'off', returns `{ gini_coefficient: null, author_concentration: null, weight_multipliers: new Map() }` immediately (zero DB load).

    5. Run `npm run test:integration -- sentiment-author-concentration` and confirm GREEN.
  </action>
  <acceptance_criteria>
    - `grep -c "gini_coefficient" src/lib/types.ts` returns ≥ 1
    - `grep -c "author_concentration" src/lib/types.ts` returns ≥ 1
    - `grep -c "export.*computeAuthorConcentration" src/lib/sentiment/aggregator.ts` returns 1
    - `grep -c "fetched_at" src/lib/sentiment/aggregator.ts` returns ≥ 1 (PIT-safe — S2)
    - `grep -c "published_at" src/lib/sentiment/aggregator.ts` returns 0 (NEVER join on published_at — S2 / T-20-A-04-03 from 20-Z-01)
    - `npm run test:integration -- sentiment-author-concentration` exits 0
    - `psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"author_share_calibrations\" WHERE ticker LIKE 'TESTGINI%'"` returns ≥ 1 after the integration run
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && npm run test:integration -- sentiment-author-concentration --run</automated>
  </verify>
  <done>Aggregator computes Gini end-to-end against live Neon; type field present; integration tests green; PIT-safe via fetched_at; calibration row written</done>
</task>

<task type="auto" id="20-A-04-06">
  <name>Task 6: UI — Top author concentration sub-card in SentimentIntelligenceCard (gated)</name>
  <read_first>
    - src/components/ResearchReport.tsx lines 633-720 (Sentiment Intelligence card; existing per-source breakdown sub-section is the placement precedent)
    - src/lib/types.ts (extended SentimentIntelligenceSection from Task 5)
  </read_first>
  <action>
    1. After the existing "Per-source breakdown" sub-section in `src/components/ResearchReport.tsx` (the block at lines 691-710), insert a new sub-card BEFORE the annotation row. Gate on `FEATURE_AUTHOR_GINI_UI === 'on'` AND `sentiment_intelligence.gini_coefficient != null` AND `sentiment_intelligence.author_concentration != null`.

       The block (Tailwind, mirroring existing card style):

       ```tsx
       {process.env.NEXT_PUBLIC_FEATURE_AUTHOR_GINI_UI === 'on' &&
        sentiment_intelligence.gini_coefficient != null &&
        sentiment_intelligence.author_concentration != null && (
         <div className="border-t border-surface-container-highest pt-2 mt-2">
           <div className="flex items-center justify-between mb-1">
             <span className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant">
               Top author concentration
             </span>
             <span className="text-[10px] font-mono text-on-surface-variant">
               Gini {sentiment_intelligence.gini_coefficient.toFixed(2)}
             </span>
           </div>
           <div className="space-y-1">
             {sentiment_intelligence.author_concentration.slice(0, 5).map((a) => (
               <div key={a.author_hash_prefix} className="flex items-center gap-2 text-[11px] font-mono">
                 <span className="text-on-surface-variant w-20 truncate" data-author-hash-prefix={a.author_hash_prefix}>
                   {a.author_hash_prefix}…
                 </span>
                 <div className="flex-1 bg-surface-container-highest rounded-full h-2 overflow-hidden">
                   <div
                     className="bg-tertiary h-full"
                     style={{ width: `${Math.round(a.share * 100)}%` }}
                     aria-label={`Author ${a.author_hash_prefix} contributed ${Math.round(a.share * 100)}% of messages (n=${a.message_count})`}
                   />
                 </div>
                 <span className="w-12 text-right text-on-surface-variant">{Math.round(a.share * 100)}%</span>
               </div>
             ))}
           </div>
         </div>
       )}
       ```

    2. NEVER render `author_id` or any raw handle attribute. The `data-author-hash-prefix` attribute is the ONLY author-derived attribute, and its value is the 8-char sha256 prefix — never the raw handle.

    3. When n_authors<5 sentinel fires (gini_coefficient is null), the entire block is hidden — no "insufficient data" copy in this iteration (deferred to UI polish phase). The aggregator returns null; UI renders nothing.
  </action>
  <acceptance_criteria>
    - `grep -c "Top author concentration" src/components/ResearchReport.tsx` returns 1
    - `grep -c "author_hash_prefix" src/components/ResearchReport.tsx` returns ≥ 2 (key + data-attr)
    - `grep -c "FEATURE_AUTHOR_GINI_UI" src/components/ResearchReport.tsx` returns ≥ 1
    - `grep -c "data-raw-author-handle\|data-author-handle[^-]" src/components/ResearchReport.tsx` returns 0 (NO raw handle attrs — T-20-A-04-01)
    - `npx next build` exits 0
  </acceptance_criteria>
  <verify>
    <automated>grep -q "Top author concentration" src/components/ResearchReport.tsx && grep -q "FEATURE_AUTHOR_GINI_UI" src/components/ResearchReport.tsx && [ "$(grep -c 'data-raw-author-handle\|data-author-handle[^-]' src/components/ResearchReport.tsx)" = "0" ] && npx next build</automated>
  </verify>
  <done>Sub-card renders top-5 hashed author shares as horizontal bars with Gini badge; gated by FEATURE_AUTHOR_GINI_UI; PII-safe HTML</done>
</task>

<task type="auto" id="20-A-04-07">
  <name>Task 7: Playwright PII-safety + render assertion + model card + HYPERPARAMETERS update</name>
  <read_first>
    - tests/playwright/ (existing patterns, e.g. research report rendering)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (DATASET-CARD stub format precedent — model card mirrors it under docs/cards/)
    - HYPERPARAMETERS.md (existing entries — add the 0.5 down-weight + n_authors<5 sentinel)
  </read_first>
  <action>
    1. Create `tests/playwright/research-author-concentration.spec.ts`:

       - Mock the `/api/research/AAPL` and `/api/analysis/AAPL` SSE flow (or use existing fixture loader) to inject a `SentimentIntelligenceSection` with `gini_coefficient: 0.42` and `author_concentration: [{ author_hash_prefix: 'a1b2c3d4', share: 0.4, message_count: 40 }, ...]` (5 entries).
       - Set `process.env.NEXT_PUBLIC_FEATURE_AUTHOR_GINI_UI=on` for the test run via `playwright.config.ts` env override.
       - Visit `/research/AAPL`, wait for the Sentiment Intelligence card.
       - Assert: `await expect(page.getByText('Top author concentration')).toBeVisible()`; `await expect(page.locator('[data-author-hash-prefix]')).toHaveCount(5)`; `await expect(page.getByText(/Gini 0\.42/)).toBeVisible()`.
       - **PII assertion**: get the rendered HTML via `await page.content()`. Assert it contains 0 occurrences of any realistic raw handle pattern from a fixture list `['@WallStreetBets_Mod', 'EliteTrader_99', '$AAPL_bull', 'pumpking2026']` — none of those substrings should appear.
       - Assert each `data-author-hash-prefix` value matches `/^[0-9a-f]{8}$/`.

    2. Create `docs/cards/MODEL-CARD-author-gini.md` per 20-Z-02 schema (template will land in 20-Z-02; for now, stub the required sections):

       ```markdown
       # Model Card — Author-Concentration Gini Signal (Phase 20-A-04)

       **Status**: shadow → on (target)
       **Owner**: Phase 20 Wave A
       **Last updated**: <date of cutover>
       **Card schema**: pending 20-Z-02 template — section list mirrors Mitchell 2019.

       ## 1. Model details
       Composite signal: Gini coefficient of message-counts-per-author over rolling
       24h window of `SentimentObservation` rows. Pure-math (no ML). Implemented in
       `src/lib/sentiment/gini.ts`.

       ## 2. Intended use
       Surface author-concentration as a robust replacement for the
       `unique_authors / total_messages` ratio. Inform crowding warnings (forward-
       referenced by 20-A-01 dispersion composite). NOT a buy/sell signal in
       isolation.

       ## 3. Calibration data
       Per-ticker trailing-90d author-share distribution. Q1 (25th percentile)
       computed weekly via `scripts/calibrate-author-share-thresholds.ts` and
       persisted in `AuthorShareCalibration`. Recalibration cadence: weekly Mondays
       08:00 UTC.

       ## 4. Performance / acceptance criteria
       - Gini values must lie in published meme-stock range [0.3, 0.85] on the
         GME / AMC / SOFI backfill set during shadow → on graduation.
       - Down-weight false-suppression rate measured at 30/60/90d post-cutover;
         documented as supplementary section here.

       ## 5. Known failure modes
       - **Sparse-author tickers** (n_authors < 5 in 24h): `gini_coefficient` returns
         null; UI hides sub-card. Tracked count exposed via 20-Z-03 telemetry.
       - **Single-day burst from one journalist**: Q1-relative threshold absorbs
         consistent posters; one-off bursts on a single ticker get correctly
         down-weighted. False-suppression risk if a journalist suddenly posts on
         a ticker they normally don't cover.

       ## 6. Ethical considerations
       - PII: all author IDs are sha256-hashed at the source (20-Z-01) and only
         the 8-char sha256 prefix surfaces in UI. No raw handles persisted or rendered.
       - Down-weighting suppresses voices — done relative to per-ticker historical
         norm, NOT a global penalty. Caveat: a new prolific-but-legitimate poster
         on a previously-quiet ticker would be temporarily down-weighted until
         the next weekly calibration absorbs them.

       ## 7. Retrain cadence
       Q1 thresholds: weekly via `/api/cron/author-share-calibration` cron.
       Gini formula: pure math, no retrain.

       ## 8. References
       - Cookson, J. A., & Engelberg, J. (2020). "Echo Chambers." Review of
         Financial Studies. https://doi.org/10.1093/rfs/hhaa027
       - Lucchini et al. (2022). GameStop sentiment self-induced consensus study.
       - 20-Z-02 model card schema (pending — full conformance check upon landing).
       ```

    3. Append to `HYPERPARAMETERS.md` (or create a section if file already exists from earlier phases):

       ```markdown
       ## Phase 20-A-04 — Author-concentration Gini

       | Param | Value | Source / rationale |
       |-------|-------|---------------------|
       | `FEATURE_AUTHOR_GINI` down-weight multiplier | `0.5` | Cookson & Engelberg 2020 echo-chamber down-weight literature default. Re-tunable via `scripts/calibrate-author-share-thresholds.ts` (out of scope for first ship). |
       | `n_authors_min` sentinel | `5` | Below this, Gini is statistically meaningless on a 24h window. Returns null → UI hides sub-card. Threshold is a soft default; revisit after 90d production. |
       | `q1_author_share_pct` | per-ticker, weekly | NOT hand-set — calibrated by `/api/cron/author-share-calibration` (S1 compliance). Stored in `AuthorShareCalibration` table. |
       | `training_window_days` | `90` | Standard quarterly window; matches 20-A-02/20-A-03 baseline window. |
       | `topN` author bars | `5` | UI density choice; not a model parameter. |
       ```

    4. Run `npm run test:e2e -- research-author-concentration` and confirm GREEN.
  </action>
  <acceptance_criteria>
    - `tests/playwright/research-author-concentration.spec.ts` exists; `npm run test:e2e -- research-author-concentration` exits 0
    - `docs/cards/MODEL-CARD-author-gini.md` exists with all 8 sections; `grep -c "^## " docs/cards/MODEL-CARD-author-gini.md` returns ≥ 8
    - `grep -c "Phase 20-A-04 — Author-concentration Gini" HYPERPARAMETERS.md` returns 1
    - `grep -c "Cookson" HYPERPARAMETERS.md docs/cards/MODEL-CARD-author-gini.md` returns ≥ 2 (one per file — Cookson cited in both)
    - PII assertion in Playwright spec asserts 0 occurrences of fixture raw handles in rendered HTML
  </acceptance_criteria>
  <verify>
    <automated>npm run test:e2e -- research-author-concentration && [ -f docs/cards/MODEL-CARD-author-gini.md ] && grep -q "Phase 20-A-04 — Author-concentration Gini" HYPERPARAMETERS.md</automated>
  </verify>
  <done>Playwright PII + render assertions green; model card + HYPERPARAMETERS entries committed; Cookson citation in both</done>
</task>

</tasks>

<verification>

## Numerical acceptance — every gate is a command + expected exit/value

| # | Gate | Command | Expected |
|---|------|---------|----------|
| 1 | Gini formula correctness | `npm test -- sentiment-gini --run` | exit 0; 11 cases pass; uniform → 0±0.01; Pareto 80/20 → 0.7±0.05 |
| 2 | Pure math — no Prisma | `grep -c "from '@prisma" src/lib/sentiment/gini.ts` | 0 |
| 3 | Schema present | `grep -c "model AuthorShareCalibration" prisma/schema.prisma` | 1 |
| 4 | DB push landed | `psql "$DATABASE_URL" -c "\d author_share_calibrations" | grep -c q1_author_share_pct` | 1 |
| 5 | Cron schedule wired | `grep -c "author-share-calibration" vercel.json` | 1 |
| 6 | INSERT-only enforced | `grep -c "authorShareCalibration\.\(update\|delete\|upsert\)" scripts/ src/app/` | 0 |
| 7 | Type field present | `grep -c "gini_coefficient" src/lib/types.ts` | ≥ 1 |
| 8 | PIT-safe (S2) | `grep -c "published_at" src/lib/sentiment/aggregator.ts` | 0 |
| 9 | Aggregator integration | `npm run test:integration -- sentiment-author-concentration --run` | exit 0; ≥ 5 cases pass |
| 10 | Calibration row inserted | `psql ... 'SELECT COUNT(*) FROM "author_share_calibrations"'` | ≥ 1 |
| 11 | UI gated | `grep -c "FEATURE_AUTHOR_GINI_UI" src/components/ResearchReport.tsx` | ≥ 1 |
| 12 | UI PII-safe | `grep -c "data-raw-author-handle\|data-author-handle[^-]" src/components/ResearchReport.tsx` | 0 |
| 13 | Playwright PII assertion | `npm run test:e2e -- research-author-concentration` | exit 0; 0 raw handles in rendered HTML |
| 14 | Model card present | `[ -f docs/cards/MODEL-CARD-author-gini.md ]` | true |
| 15 | Hyperparameters documented | `grep -c "Phase 20-A-04 — Author-concentration Gini" HYPERPARAMETERS.md` | 1 |
| 16 | Cookson cited | `grep -c "Cookson" HYPERPARAMETERS.md docs/cards/MODEL-CARD-author-gini.md` | ≥ 2 |

## Shadow → on graduation gate (POST-MERGE, separate commit)

After ≥7 days of `FEATURE_AUTHOR_GINI=shadow` writes, the operator runs:

```bash
# Check Gini values lie within published meme-stock range [0.3, 0.85] on backfill
psql "$DATABASE_URL" -c "
  SELECT ticker, MIN(gini_coefficient), MAX(gini_coefficient), AVG(gini_coefficient)
  FROM <shadow log table from 20-Z-03 telemetry>
  WHERE ticker IN ('GME','AMC','SOFI') AND created_at > NOW() - INTERVAL '7 days'
  GROUP BY ticker;
"
# Expected: AVG in [0.3, 0.85]; MIN/MAX consistent with crowded ↔ diffuse range.
```

If gates pass: `vercel env add FEATURE_AUTHOR_GINI on production` then redeploy.
UI flag (`FEATURE_AUTHOR_GINI_UI`) flipped in a SEPARATE follow-up commit.

</verification>

<success_criteria>

This plan is DONE when ALL of the following are numerically true:

1. **Tasks 1-7 complete**, all `<verify>` automated commands exit 0.
2. **All 16 numerical gates** in the verification table above pass.
3. **`AuthorShareCalibration` table** exists in production Neon; ≥1 row inserted from a cron-equivalent invocation.
4. **`gini_coefficient`** field present on `SentimentIntelligenceSection` and computed end-to-end by the aggregator (gated by `FEATURE_AUTHOR_GINI`).
5. **UI sub-card** renders top-5 author shares with hashed labels under `FEATURE_AUTHOR_GINI_UI=on`; Playwright asserts 0 raw handles in HTML.
6. **Model card** `docs/cards/MODEL-CARD-author-gini.md` committed with all 8 Mitchell sections (stub against 20-Z-02).
7. **HYPERPARAMETERS.md** documents the 0.5 down-weight constant + n_authors<5 sentinel + Q1 calibration semantics + Cookson citation.
8. **Forward dep satisfied**: 20-A-01 can `import { giniCoefficient } from '@/lib/sentiment/gini'` for its dispersion composite.
9. **Cleanup gate** (post-merge, deferred): legacy `unique_authors / total_messages` heuristic stays during shadow; deleted only AFTER `FEATURE_AUTHOR_GINI=on`.

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-A-04-SUMMARY.md` per the standard summary template, recording:
- Final Gini values from the GME/AMC/SOFI backfill (range, mean)
- Number of `AuthorShareCalibration` rows after first cron run
- Shadow→on cutover date for `FEATURE_AUTHOR_GINI` (or note pending if still in shadow)
- Any deviations from the canonical 80/20 → 0.7 expectation in the unit tests (with explanation)
- Pointer to the model card + first measured false-suppression rate at 30d (placeholder if not yet measured)
</output>
