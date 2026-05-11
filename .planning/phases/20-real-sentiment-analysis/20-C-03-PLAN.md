---
phase: 20
plan: 20-C-03
wave: C
type: execute
depends_on:
  - 20-Z-01
files_modified:
  - prisma/schema.prisma
  - src/lib/sentiment/bot-filter.ts
  - src/lib/sentiment/coordination.ts
  - src/lib/sentiment/aggregator.ts
  - src/app/api/cron/sentiment-scan/route.ts
  - src/components/ResearchReport.tsx
  - scripts/eval-bot-fp.ts
  - tests/golden-tickers/_bot_labels.json
  - tests/golden-tickers/_bot_labels.RUNBOOK.md
  - HYPERPARAMETERS.md
  - docs/cards/MODEL-CARD-bot-filter.md
  - package.json
  - tests/sentiment/bot-filter.unit.test.ts
  - tests/sentiment/coordination.unit.test.ts
  - tests/sentiment/bot-filter-aggregator.unit.test.ts
  - tests/integration/bot-filter.integration.test.ts
  - tests/components/research-report-bot-filter.unit.test.tsx
autonomous: true
requirements: []
shadow_required: true
shadow_skip_reason: null
shadow_lifecycle:
  off_default: true
  shadow_persist_target: "BotFilterFlag and CoordinationCluster rows are persisted on every cron tick regardless of mode; the consumer-side weight gate inside src/lib/sentiment/aggregator.ts is what graduates off → shadow → on via FEATURE_BOT_FILTER three-mode flag in src/lib/features.ts"
  cutover_criteria:
    - "≥7 calendar days of shadow-mode operation since first BotFilterFlag row landed"
    - "False-positive rate ≤ 5% on the 100-author labeled set committed at tests/golden-tickers/_bot_labels.json (measured by `npm run eval-bot-fp`, exit 0 required)"
    - "Forward-reference to 20-C-04: coordinated_posting detection F1 ≥ 0.6 on the 20-C-04 synthetic eval set is the SECOND gate. 20-C-03 ships the detector and the FP eval; 20-C-04 ships the synthetic eval harness. The cutover of FEATURE_BOT_FILTER from shadow → on is BLOCKED until 20-C-04 reports F1 ≥ 0.6"
    - "Per-source weight delta in shadow comparison rows shows ≤ 30% mean absolute change vs naive aggregator on a 14-day window (sanity-check that the filter is not nuking all signal)"
  cutover_action: "Set FEATURE_BOT_FILTER=on in src/lib/features.ts; on path makes bot-flagged messages contribute 0 weight in aggregator.ts and renders the SentimentIntelligenceCard 'X authors flagged as bots; Y messages flagged as coordinated' subtext; off path remains intact for one full release cycle before deletion (per S3 hard cleanup gate, deletion happens in 20-C-03-FOLLOWUP plan filed at cutover time, NOT this plan)"
hard_cleanup_gate: true
must_haves:
  truths:
    - "BotFilterFlag Prisma model exists in production Neon with composite index on (author_id, computed_at DESC)"
    - "CoordinationCluster Prisma model exists in production Neon with composite index on (ticker, window_start DESC)"
    - "textCosineSimilarity(a, b) computes TF-IDF cosine on character 4-gram shingles and returns 1.0 for identical inputs and 0.0 for disjoint vocabularies — verified by unit test on the literal numbers"
    - "pumpPhraseDensity(text, phrases) returns count_of_phrase_occurrences / token_count where token_count = text.toLowerCase().split(/\\s+/).filter(Boolean).length and counts overlap-friendly matches via case-insensitive substring scan"
    - "PUMP_PHRASES constant in src/lib/sentiment/bot-filter.ts contains EXACTLY these 9 literal entries (in this order): 'to the moon', 'rocket', '100x', 'moonshot', 'bagholder', 'yolo', 'tendies', 'rip', 'lambo' — verified by deep-equal unit test"
    - "cresciBotScore({ account_age_days, messages, hashtag_counts }) returns { is_bot, reason } where is_bot === true iff (account_age_days < 30) OR (max pairwise cosine across messages > 0.5) OR (max pumpPhraseDensity across messages > 0.1) OR (max hashtag_count > 5); reason is a stable enum string ∈ {'young_account','high_self_similarity','pump_density','hashtag_spam','clean'}"
    - "minHash(text, num_perm=128) produces a numeric signature of EXACTLY length 128, derived from 4-gram character shingles using two seeded hash functions + permutation (Broder 1997 standard) — verified by unit test asserting signature.length === 128"
    - "lshCluster(signatures, threshold=0.7) implements banding LSH with EXACTLY bands=16, rows=8 (16 × 8 = 128 matches signature size), returning arrays of id-groups whose estimated Jaccard similarity ≥ threshold — params asserted by unit test reading the exported constants BANDS=16, ROWS=8"
    - "detectCoordinatedPosting(messages, window_size=50) returns null when no cluster of size ≥ 50 with average pairwise similarity > 0.7 exists, OR returns a CoordinationCluster row shape { ticker, window_start, window_end, n_messages, similarity_threshold, cluster_size, is_flagged: true } when one does — verified on a synthetic 50-message pump fixture"
    - "Aggregator (src/lib/sentiment/aggregator.ts) reads BotFilterFlag rows for the current 24h window; messages whose author_id has a BotFilterFlag with is_bot_flagged=true within the window contribute weight=0 — gated behind FEATURE_BOT_FILTER three-mode flag"
    - "Aggregator surfaces a top-level coordinated_posting boolean on AggregatedSentiment when the latest CoordinationCluster row for the ticker within 24h has is_flagged=true; otherwise false"
    - "SentimentIntelligenceCard in src/components/ResearchReport.tsx renders the literal phrase 'X authors flagged as bots; Y messages flagged as coordinated' (with X and Y substituted from BotFilterFlag/CoordinationCluster counts) ONLY when FEATURE_BOT_FILTER === 'on' AND counts > 0 — asserted by RTL snapshot test"
    - "100-author labeled set lives at tests/golden-tickers/_bot_labels.json with shape Array<{ author_id_hash, ticker_sampled, label: 'bot'|'human', notes, labeled_at, labeled_by }> AND length === 100 (asserted by JSON.parse + Array.isArray + length unit assertion)"
    - "tests/golden-tickers/_bot_labels.RUNBOOK.md documents the operator labeling procedure (query, sample size, decision rules) — referenced from MODEL-CARD-bot-filter.md"
    - "scripts/eval-bot-fp.ts runs cresciBotScore on every labeled entry, reports {tp, fp, tn, fn, precision, recall, fp_rate}, writes a markdown summary to docs/cards/MODEL-CARD-bot-filter.md spot-check log section, and EXITS NON-ZERO when fp_rate > 0.05"
    - "Cron route (src/app/api/cron/sentiment-scan/route.ts) computes BotFilterFlag and CoordinationCluster rows AFTER the existing SentimentObservation write, in the same per-ticker loop iteration; failures logged-and-continued (existing snapshot writer untouched)"
    - "Cron wall-clock time stays under 3 minutes for the full watchlist sweep (asserted by checking results.elapsed_ms < 180000 in the integration test)"
    - "MODEL-CARD-bot-filter.md committed at docs/cards/ per 20-Z-02 template, citing Cresci et al. 2019 (StockTwits bots) AND Nam & Yang 2023, with intended-use, OOD behavior, known failure modes, and appeal mechanism sections filled"
    - "HYPERPARAMETERS.md gains a 'bot_filter' subsection with EXACT literal values: MIN_ACCOUNT_AGE_DAYS=30, MAX_SELF_SIMILARITY=0.5, MAX_PUMP_DENSITY=0.1, MAX_HASHTAG_COUNT=5, MINHASH_NUM_PERM=128, LSH_BANDS=16, LSH_ROWS=8, COORDINATION_SIMILARITY=0.7, COORDINATION_MIN_CLUSTER_SIZE=50, FP_GATE=0.05"
    - "After 7 calendar days of cron operation, psql query 'SELECT COUNT(*) FROM \"bot_filter_flags\"' returns >= 100 (proves cron is producing flags at a realistic rate)"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "BotFilterFlag model + CoordinationCluster model + 2 composite indexes (one per model)"
      contains: "model BotFilterFlag"
    - path: "src/lib/sentiment/bot-filter.ts"
      provides: "Cresci-2019 per-author heuristics: textCosineSimilarity, pumpPhraseDensity, PUMP_PHRASES, cresciBotScore (pure functions, NO IO)"
      contains: "export function cresciBotScore"
    - path: "src/lib/sentiment/coordination.ts"
      provides: "MinHash + banding LSH + detectCoordinatedPosting (pure functions + exported BANDS/ROWS constants, NO IO)"
      contains: "export function detectCoordinatedPosting"
    - path: "src/lib/sentiment/aggregator.ts"
      provides: "Extends AggregatedSentiment with coordinated_posting + bot_filter_summary fields; bot-flagged messages contribute weight=0 when FEATURE_BOT_FILTER='on'"
      contains: "coordinated_posting"
    - path: "src/app/api/cron/sentiment-scan/route.ts"
      provides: "Per-tick computation + persistence of BotFilterFlag and CoordinationCluster rows; failures logged-and-continued; existing SentimentSnapshot + SentimentObservation writers untouched"
      contains: "BotFilterFlag"
    - path: "src/components/ResearchReport.tsx"
      provides: "SentimentIntelligenceCard subtext 'X authors flagged as bots; Y messages flagged as coordinated' gated on FEATURE_BOT_FILTER='on' AND counts > 0"
      contains: "authors flagged as bots"
    - path: "scripts/eval-bot-fp.ts"
      provides: "Operator-runnable script that scores 100-author labeled set; exits non-zero when fp_rate > 0.05; updates model card spot-check log"
      contains: "fp_rate"
    - path: "tests/golden-tickers/_bot_labels.json"
      provides: "100-author labeled set (bot|human) curated from production data per RUNBOOK.md"
    - path: "tests/golden-tickers/_bot_labels.RUNBOOK.md"
      provides: "Operator runbook for labeling: SQL query template, sampling rules, decision criteria, appeal mechanism"
      contains: "SELECT"
    - path: "HYPERPARAMETERS.md"
      provides: "'bot_filter' subsection with the 10 literal hyperparameters above"
      contains: "bot_filter"
    - path: "docs/cards/MODEL-CARD-bot-filter.md"
      provides: "Mitchell-2019 model card citing Cresci 2019 + Nam & Yang 2023; covers intended use, OOD, known failure modes, appeal mechanism, spot-check log"
      contains: "Cresci"
    - path: "tests/sentiment/bot-filter.unit.test.ts"
      provides: "≥8 unit tests: cosine identical=1.0, cosine disjoint=0.0, PUMP_PHRASES deep-equal, pumpPhraseDensity formula, cresciBotScore on synthetic profiles (young, similar, pump, hashtag, clean), reason enum"
    - path: "tests/sentiment/coordination.unit.test.ts"
      provides: "≥6 unit tests: minHash length=128, LSH BANDS=16/ROWS=8 constants exported, lshCluster recall on synthetic duplicates, detectCoordinatedPosting null below threshold, fires on 50-message synthetic pump, empirical collision rate documented"
    - path: "tests/sentiment/bot-filter-aggregator.unit.test.ts"
      provides: "Aggregator weight-gate test: bot-flagged messages contribute weight=0 when FEATURE_BOT_FILTER='on'; weight unchanged when 'off'/'shadow'"
    - path: "tests/integration/bot-filter.integration.test.ts"
      provides: "End-to-end against live Neon: cron tick writes ≥1 BotFilterFlag row; mixed 24h window of bot+human posts flags correct subset; synthetic 50-message pump fixture fires coordinated_posting; wall-clock < 3min"
    - path: "tests/components/research-report-bot-filter.unit.test.tsx"
      provides: "RTL test asserts the literal subtext renders when feature flag is 'on' AND counts > 0, suppressed otherwise"
  key_links:
    - from: "src/app/api/cron/sentiment-scan/route.ts"
      to: "src/lib/sentiment/bot-filter.ts cresciBotScore()"
      via: "per-author scoring inside the existing per-ticker loop, AFTER the 20-Z-01 insertObservation call"
      pattern: "cresciBotScore\\("
    - from: "src/app/api/cron/sentiment-scan/route.ts"
      to: "src/lib/sentiment/coordination.ts detectCoordinatedPosting()"
      via: "per-ticker cluster detection on the 24h message bag"
      pattern: "detectCoordinatedPosting\\("
    - from: "src/lib/sentiment/aggregator.ts"
      to: "prisma.botFilterFlag.findMany"
      via: "consumer-side weight gate reads bot flags for current 24h window; behind FEATURE_BOT_FILTER three-mode flag"
      pattern: "botFilterFlag\\.findMany"
    - from: "src/components/ResearchReport.tsx"
      to: "AggregatedSentiment.bot_filter_summary"
      via: "renders SentimentIntelligenceCard subtext when FEATURE_BOT_FILTER==='on' AND counts > 0"
      pattern: "authors flagged as bots"
    - from: "scripts/eval-bot-fp.ts"
      to: "tests/golden-tickers/_bot_labels.json"
      via: "reads the 100-author labeled set and reports FP rate; exits non-zero when > 0.05"
      pattern: "_bot_labels\\.json"
---

# Plan 20-C-03: Cresci-2019 bot filter + MinHash near-duplicate detection

<universal_preamble>

## Autonomous Execution Clause

This plan is operator-confirmed for THREE steps: (1) `npx prisma db push` for the new BotFilterFlag and CoordinationCluster tables (additive, non-blocking — per CONTEXT.md line 172 convention); (2) the operator-driven curation of the 100-author labeled set (committed to `tests/golden-tickers/_bot_labels.json` — humans-only step that Claude cannot fabricate); (3) the cutover decision (`FEATURE_BOT_FILTER` from `shadow` to `on`) once 20-C-04's F1 ≥ 0.6 gate has reported alongside this plan's FP ≤ 5% gate. All other tasks are autonomous.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. **Shadow lifecycle graduated** — `FEATURE_BOT_FILTER` has been `shadow` for ≥7 calendar days AND BOTH gates met: this plan's FP ≤ 5% (`npm run eval-bot-fp` exit 0) AND 20-C-04's synthetic F1 ≥ 0.6. The actual cutover to `on` is staged for a FOLLOWUP plan filed AT cutover time so the off-path lives one full release cycle before deletion (per S3 cleanup ratchet). 20-C-03 SHIPS at "shadow live + both gates green-or-reported"; the cutover itself is the FOLLOWUP.
2. **No feature flag introduced beyond FEATURE_BOT_FILTER** (one flag per consumer-side gate; persistence layer always writes).
3. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest), `npm run test:e2e` (Playwright), and `npm run eval-bot-fp` all green on `main` post-commit.
4. **Schema Push Gate**: `npx prisma db push` succeeded against the live `DATABASE_URL` AND the integration test writes ≥1 BotFilterFlag row in a single cron-equivalent invocation.
5. **FP Gate**: `npm run eval-bot-fp` exits 0 (fp_rate ≤ 0.05 on the 100-author labeled set).
6. **Production observation gate (post-cutover, not blocking ship)**: After 7d of cron operation, `psql ... 'SELECT COUNT(*) FROM "bot_filter_flags"'` returns ≥ 100. Recorded in 20-C-03-SUMMARY.md, not enforced in CI.
7. **Coordinated-posting forward-reference**: 20-C-03 ships the synthetic-pump integration test (50-message fixture). The full F1 ≥ 0.6 measurement on a broader synthetic eval is 20-C-04's deliverable; this plan exposes the detector function 20-C-04 will measure.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — Cresci heuristic thresholds (account_age_days < 30, cosine > 0.5, pump density > 0.1, hashtag > 5) are CITED from Cresci et al. 2019 §3.2 + Nam & Yang 2023 §4.1. Recorded in `HYPERPARAMETERS.md` with citations. MinHash params (128 perm, 16 bands × 8 rows) are CITED from Broder 1997 + Leskovec/Rajaraman/Ullman "Mining of Massive Datasets" Ch. 3 (the closed-form `s = (1/b)^(1/r) = (1/16)^(1/8) ≈ 0.707` matches the 0.7 threshold target). PUMP_PHRASES list is a literal artifact defensible from Cresci 2019 Table 2; quarterly review procedure documented in MODEL-CARD-bot-filter.md (mitigates T-20-C-03-02 cultural-bias drift).
- **S2 (PIT discipline)** — BotFilterFlag carries `computed_at` (when WE computed the flag) NOT `evaluated_at_publication_time`. The 20-Z-07 lookahead test reads this column the same way it reads SentimentObservation.fetched_at. CoordinationCluster's `window_start` / `window_end` are likewise points in OUR observation timeline.
- **S3 (shadow lifecycle)** — `FEATURE_BOT_FILTER` is the three-mode flag. Persistence layer (BotFilterFlag, CoordinationCluster writes) always runs so we accumulate data during shadow. The CONSUMER (aggregator weight gate + UI subtext) is what graduates off → shadow → on. Cutover criteria are numerical (see `cutover_criteria` in frontmatter); cutover ACTION is filed as a FOLLOWUP plan at cutover time so the off-path lives one release cycle before deletion.
- **S4 (model card)** — `docs/cards/MODEL-CARD-bot-filter.md` filed against the 20-Z-02 template. Cites Cresci 2019 + Nam & Yang 2023. Sections covered: training data (Cresci's 41M tweets dataset for parameter origin), evaluation (this plan's 100-author labeled set + 20-C-04's synthetic eval), intended use (down-weighting in aggregation; NEVER silencing), OOD behavior (slang drift quarterly review), known failure modes (legitimate high-volume quoters, journalists, satire), appeal mechanism (operator override + UI badge never hides messages — only flags).
- **S5 (pinned versions)** — N/A: no external model invocation in this plan. The PUMP_PHRASES list and MinHash seeds are versioned via HYPERPARAMETERS.md (and treated as a prompt-equivalent under 20-Z-04's registry when that plan lands).
- **S6 (telemetry)** — `withTelemetry` wrapping is N/A (no external call). Per-cron-tick metrics (n_authors_flagged, n_clusters_detected, fp_eval_rate from last run) are surfaced to `results` in the cron route's JSON response so 20-Z-03 will pick them up automatically when its wrapper lands.
- **S7 (threat model)** — Five plan-level threats T-20-C-03-{01..05} mapped to phase catalog T-28-001 (bot/coordination floods) below.
- **S8 (numerical acceptance)** — Every DONE clause is a grep, test exit code, JSON parse + length check, or psql row count. Zero adjectives.
- **S10 (regulatory hygiene)** — Bot filter NEVER silences messages — it only affects aggregation WEIGHT. UI badge shows "flagged" but message text remains displayed. Appeal mechanism documented in model card. Maps directly to T-20-C-03-05 (weaponization defense).

</universal_preamble>

<objective>
Defend the sentiment aggregate against the two adversarial patterns documented in Cresci et al. 2019 (StockTwits signal bots; ~6% of accounts) and Nam & Yang 2023 (pump-and-dump coordination, F1 = 0.67 from posts alone). Per-author Cresci scoring computes account_age, message self-similarity, pump-phrase density, and hashtag spam — flagged authors contribute zero weight in aggregation. Aggregate-level MinHash + LSH on the 24h message bag detects ≥50-message clusters with >0.7 similarity and surfaces a `coordinated_posting` warning. Both layers persist to immutable tables (BotFilterFlag, CoordinationCluster) so 20-C-04 (pump/dump cluster detection at aggregate level), 20-C-06 (fairness audit), and 20-Z-07 (PIT regression) can reason over them. False-positive rate is gated at ≤ 5% on a 100-author operator-labeled set before any consumer-side weight change ships to production.

Purpose: The post-Phase-19 reputation-weighted StockTwits aggregator (19-C-03) and the Beta-smoothed multi-source aggregator (post-19) defend against *isolated* low-quality posts but are blind to *coordinated* spam — exactly the failure mode that produced the GME 100% bullish reading. Cookson & Engelberg "Echo Chambers" + Lucchini et al. 2022 (the GME study) frame coordination as the root cause; Cresci 2019 + Nam & Yang 2023 provide the algorithmic defense. This plan implements both at the row grain that 20-Z-01's PIT feature store enables.

Output:
- 2 new Prisma models (BotFilterFlag, CoordinationCluster) + 2 composite indexes
- 1 pure-function module for per-author heuristics (`src/lib/sentiment/bot-filter.ts`)
- 1 pure-function module for MinHash + LSH (`src/lib/sentiment/coordination.ts`)
- 1 aggregator extension wiring bot flags into the weight gate behind `FEATURE_BOT_FILTER` three-mode flag
- 1 cron route extension persisting per-tick flags + clusters (failures logged-and-continued)
- 1 UI subtext in SentimentIntelligenceCard
- 1 FP evaluation script + 100-author labeled set + RUNBOOK
- 1 model card + HYPERPARAMETERS.md subsection
- ≥4 test files (unit + integration + RTL)
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
@src/lib/sentiment/finsentllm.ts
@src/lib/data/stocktwits.ts
@src/app/api/cron/sentiment-scan/route.ts
@src/components/ResearchReport.tsx
@src/lib/features.ts
@.planning/phases/19-cipher-v2-0-excellence/19-A-01-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-A-01-PLAN.md

<interfaces>
```typescript
// src/lib/sentiment/bot-filter.ts — NEW

/**
 * PUMP_PHRASES — literal 9-entry list per Cresci 2019 Table 2 + WSB slang corpus.
 * Quarterly review procedure documented in docs/cards/MODEL-CARD-bot-filter.md.
 * Mitigates T-20-C-03-02 (cultural-bias drift).
 */
export const PUMP_PHRASES: readonly string[] = [
  'to the moon',
  'rocket',
  '100x',
  'moonshot',
  'bagholder',
  'yolo',
  'tendies',
  'rip',
  'lambo',
] as const;

/**
 * TF-IDF cosine similarity on character 4-gram shingles.
 * - Identical inputs (same shingle multiset) → 1.0
 * - Disjoint vocabularies (zero shared shingles) → 0.0
 * - Empty-string input → 0.0 (well-defined, signals upstream bug)
 * Standalone implementation (no scikit-learn equivalent dependency).
 */
export function textCosineSimilarity(a: string, b: string): number;

/**
 * Density = (sum of phrase occurrences, case-insensitive substring scan) / token_count
 * where token_count = text.toLowerCase().split(/\s+/).filter(Boolean).length.
 * Returns 0 when token_count === 0 (well-defined, never NaN).
 */
export function pumpPhraseDensity(
  text: string,
  phrases: readonly string[] = PUMP_PHRASES,
): number;

export type CresciReason =
  | 'young_account'
  | 'high_self_similarity'
  | 'pump_density'
  | 'hashtag_spam'
  | 'clean';

export interface CresciAuthorInput {
  account_age_days: number;          // null treated as 9999 (don't flag for age alone)
  messages: string[];                // last-N message bodies, ≥1
  hashtag_counts: number[];          // per-message hashtag count; same length as messages
}

export interface CresciAuthorResult {
  is_bot: boolean;
  reason: CresciReason;               // first-match enum ordering: young → similarity → pump → hashtag → clean
  features: {
    account_age_days: number;
    max_text_cosine_similarity: number;
    pump_phrase_density: number;     // max across messages
    hashtag_count_max: number;
  };
}

/**
 * Cresci-2019 first-match aggregator. Thresholds cited from Cresci §3.2:
 *   - account_age_days < 30  → 'young_account'
 *   - max pairwise cosine across `messages` > 0.5 → 'high_self_similarity'
 *   - max(pumpPhraseDensity) > 0.1 → 'pump_density'
 *   - max(hashtag_counts) > 5 → 'hashtag_spam'
 *   - else → 'clean'
 * Returns ALL features regardless of which gate fired (for telemetry + appeal).
 */
export function cresciBotScore(input: CresciAuthorInput): CresciAuthorResult;
```

```typescript
// src/lib/sentiment/coordination.ts — NEW

/**
 * MinHash + banding LSH per Broder 1997 + Leskovec/Rajaraman/Ullman Ch. 3.
 * Calibration: bands × rows = num_perm AND threshold ≈ (1/bands)^(1/rows).
 *   16 × 8 = 128 AND (1/16)^(1/8) ≈ 0.707 — matches the 0.7 target threshold.
 */
export const MINHASH_NUM_PERM = 128;
export const LSH_BANDS = 16;
export const LSH_ROWS = 8;
export const COORDINATION_SIMILARITY = 0.7;
export const COORDINATION_MIN_CLUSTER_SIZE = 50;

/**
 * Standard MinHash with 4-gram character shingles.
 * Returns a numeric signature of EXACTLY length `num_perm` (default 128).
 * Determinism: same input → same signature (seeded permutations).
 */
export function minHash(text: string, num_perm?: number): number[];

/**
 * Banding LSH: split each signature into `LSH_BANDS` bands of `LSH_ROWS`
 * rows each, hash each band, group ids by colliding bands, and return
 * the deduped clusters (size ≥ 2). Caller filters by cluster size + avg
 * pairwise Jaccard.
 */
export function lshCluster(
  signatures: { id: string; minhash: number[] }[],
  threshold?: number,
): string[][];

export interface CoordinationCluster {
  ticker: string;
  window_start: Date;
  window_end: Date;
  n_messages: number;            // total messages in window
  similarity_threshold: number;  // copy of COORDINATION_SIMILARITY for audit
  cluster_size: number;          // largest cluster found
  is_flagged: boolean;           // cluster_size >= COORDINATION_MIN_CLUSTER_SIZE
                                 // AND avg_pairwise_jaccard >= COORDINATION_SIMILARITY
  member_ids: string[];          // ids of the largest cluster (for appeal/inspection)
}

/**
 * Returns null when NO cluster of size ≥ COORDINATION_MIN_CLUSTER_SIZE (default 50)
 * exists with avg pairwise Jaccard ≥ COORDINATION_SIMILARITY (default 0.7).
 * Otherwise returns the cluster row shape ready for prisma.coordinationCluster.create.
 * `window_size` controls the lookback frame; default 50 matches the literature.
 */
export function detectCoordinatedPosting(
  ticker: string,
  window_start: Date,
  window_end: Date,
  messages: { id: string; text: string }[],
  window_size?: number,
): CoordinationCluster | null;
```

```prisma
// prisma/schema.prisma — NEW models (appended after SentimentObservation from 20-Z-01)

model BotFilterFlag {
  id                          String   @id @default(uuid())
  author_id                   String   // sha256("{source}:{handle}") — same convention as 20-Z-01
  ticker                      String   // null-allowed-but-discouraged; we record the ticker that triggered the recompute
  computed_at                 DateTime @default(now()) @db.Timestamptz  // PIT — when WE scored the author
  account_age_days            Int?     // null when upstream profile lookup failed
  max_text_cosine_similarity  Float    // 0.0 when single-message
  pump_phrase_density         Float    // 0.0 when no message had any phrase
  hashtag_count_max           Int      // 0 when no hashtags
  is_bot_flagged              Boolean
  bot_reason                  String   // CresciReason enum string

  @@index([author_id, computed_at(sort: Desc)], map: "idx_botflag_author_computed_at")
  @@index([ticker, computed_at(sort: Desc)],    map: "idx_botflag_ticker_computed_at")
  @@map("bot_filter_flags")
}

model CoordinationCluster {
  id                       String   @id @default(uuid())
  ticker                   String
  window_start             DateTime @db.Timestamptz
  window_end               DateTime @db.Timestamptz
  computed_at              DateTime @default(now()) @db.Timestamptz  // PIT
  n_messages               Int
  similarity_threshold     Float
  cluster_size             Int
  is_flagged               Boolean
  member_ids               Json     // string[] — ids of the largest cluster

  @@index([ticker, window_start(sort: Desc)], map: "idx_coordcluster_ticker_window")
  @@map("coordination_clusters")
}
```

```typescript
// src/lib/sentiment/aggregator.ts — EXTENDED

export interface BotFilterSummary {
  authors_flagged: number;          // count of distinct author_ids with is_bot_flagged in window
  messages_flagged_coordinated: number;  // cluster_size from latest CoordinationCluster row
  coordinated_posting: boolean;     // is_flagged of the latest CoordinationCluster row
}

// AggregatedSentiment extended with:
//   coordinated_posting: boolean
//   bot_filter_summary: BotFilterSummary | null
//
// aggregateCommunitySentiment continues to accept the existing inputs but
// optionally takes a `botFlags?: Set<string>` of author_id_hashes; when
// FEATURE_BOT_FILTER === 'on', the aggregator's per-message weight calculation
// returns 0 for messages whose author_id is in that set. When 'shadow' or
// 'off', botFlags are ignored by the aggregator (but persistence still writes).
```

</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| StockTwits API → our cron | Untrusted message + author metadata; coordinated bot networks attempt to manipulate signal |
| Operator labeler → labeled set JSON | Trusted human; spot-check audit catches labeler bias quarterly |
| Aggregator → consumers | Weight delta from filter must not produce silent erasure of legitimate high-volume users |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-C-03-01 | Repudiation / Information disclosure | False positives suppress legitimate high-volume users (day traders, retail influencers) | mitigate | 100-author labeled FP gate ≤ 5% (`npm run eval-bot-fp` exit 0); MODEL-CARD-bot-filter.md spot-check log section reviewed quarterly; appeal mechanism documented in card §"Appeal & override"; aggregator affects WEIGHT not VISIBILITY so flagged messages still display. Maps to phase catalog T-28-001. |
| T-20-C-03-02 | Tampering (drift) | PUMP_PHRASES list culturally biased; slang shifts (`yolo` was peak-2020, `tendies` waning) over time → list becomes stale → both FN (new slang missed) AND FP (legitimate quoters of dated slang) drift | mitigate | Quarterly review procedure documented in MODEL-CARD-bot-filter.md §"Maintenance"; HYPERPARAMETERS.md entry version-tagged; updates require new model_version in 20-Z-01 store (S2 immutability) so historical scores remain reproducible; PUMP_PHRASES will be a versioned prompt under 20-Z-04 registry when that ships. |
| T-20-C-03-03 | Tampering | Cosine similarity > 0.5 from legitimate sharing (e.g., a user quoting a CNBC headline; re-tweet of a press release) | mitigate | Document in model card §"Known failure modes": cresciBotScore is an OR-of-features rule, NOT exclusive — a single high-cosine score does NOT flag if other features are clean only when the AUTHOR-level aggregation logic applies (we use first-match enum so high-cosine alone DOES flag, but the appeal mechanism allows operator override). Re-quotes are ignored at the COORDINATION layer by requiring ≥ 50 messages in a cluster with avg Jaccard ≥ 0.7 — two quoters do NOT trigger. Cosine threshold (0.5) calibrated empirically: model card records the rationale + the empirical FP contribution from this rule alone. |
| T-20-C-03-04 | Spoofing / DoS | MinHash collisions cause false-positive coordinated_posting; with 128 perm and threshold 0.7, theoretical collision rate is `1 - (1 - 0.7^8)^16 ≈ 0.04` for two truly-disjoint documents | mitigate | Empirical collision rate documented in tests/sentiment/coordination.unit.test.ts via 10K random-text pair simulation (asserted < 0.10); detection requires ≥ 50 messages in a single cluster (NOT 2-3 incidental duplicates); MINHASH_NUM_PERM, LSH_BANDS, LSH_ROWS recorded in HYPERPARAMETERS.md with the closed-form derivation; model card §"Known failure modes" lists "MinHash false matches" as a documented limitation. |
| T-20-C-03-05 | Weaponization | Bot filter used against journalists, competitors, or politically-motivated voices ("brigading-via-filter") | mitigate | Filter affects AGGREGATION WEIGHT only — messages remain DISPLAYED with a "flagged" badge that is never silencing; aggregator code review-gated in S3 cleanup (the consumer-side weight gate is the only behaviour change); MODEL-CARD-bot-filter.md §"Intended use" explicitly forbids using BotFilterFlag rows as a feed-suppression source; appeal mechanism (operator override + audit trail in MODEL-CARD spot-check log) documented; S10 regulatory hygiene reaffirmed by ResearchReport.tsx test asserting flagged messages are NOT removed from the rendered message list. |

</threat_model>

<tasks>

<task type="auto" id="20-C-03-01">
  <name>Task 1: Add BotFilterFlag + CoordinationCluster Prisma models (additive)</name>
  <read_first>
    - prisma/schema.prisma (current state including the 20-Z-01 SentimentObservation model — append AFTER it)
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md (precedent for additive Phase 20 migration — same shape)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md line 126 (verbatim 20-C-03 spec)
  </read_first>
  <action>
    Append the following block to `prisma/schema.prisma` AFTER the `SentimentObservation` model (added by 20-Z-01). Do NOT modify any existing model — this is purely additive.

    ```prisma

    // ─── Phase 20-C-03 — Cresci-2019 bot filter + coordination detection ───
    // BotFilterFlag rows are immutable per-author-per-cron-tick scoring records.
    // CoordinationCluster rows are immutable per-ticker-per-24h-window cluster records.
    // Both are point-in-time: `computed_at` is when WE computed the score, never an
    // upstream-claimed timestamp (S2). Backfills or re-scores create NEW rows —
    // never UPDATE existing ones (T-20-Z-01-04 immutability convention propagated).
    model BotFilterFlag {
      id                          String   @id @default(uuid())
      author_id                   String   // sha256("{source}:{handle}") — same as 20-Z-01
      ticker                      String   // ticker that triggered the recompute
      // PIT-INVARIANT — never join on a vendor-reported timestamp for backtests
      computed_at                 DateTime @default(now()) @db.Timestamptz
      account_age_days            Int?
      max_text_cosine_similarity  Float
      pump_phrase_density         Float
      hashtag_count_max           Int
      is_bot_flagged              Boolean
      bot_reason                  String   // CresciReason enum string

      @@index([author_id, computed_at(sort: Desc)], map: "idx_botflag_author_computed_at")
      @@index([ticker, computed_at(sort: Desc)],    map: "idx_botflag_ticker_computed_at")
      @@map("bot_filter_flags")
    }

    model CoordinationCluster {
      id                       String   @id @default(uuid())
      ticker                   String
      window_start             DateTime @db.Timestamptz
      window_end               DateTime @db.Timestamptz
      // PIT-INVARIANT
      computed_at              DateTime @default(now()) @db.Timestamptz
      n_messages               Int
      similarity_threshold     Float
      cluster_size             Int
      is_flagged               Boolean
      member_ids               Json     // string[]

      @@index([ticker, window_start(sort: Desc)], map: "idx_coordcluster_ticker_window")
      @@map("coordination_clusters")
    }
    ```

    Run Prisma client regeneration after the edit (DB push is Task 3):

    ```bash
    npx prisma generate
    npx prisma format
    ```
  </action>
  <acceptance_criteria>
    - `grep -c "model BotFilterFlag" prisma/schema.prisma` returns `1`
    - `grep -c "model CoordinationCluster" prisma/schema.prisma` returns `1`
    - `grep -c "idx_botflag_" prisma/schema.prisma` returns `2`
    - `grep -c "idx_coordcluster_" prisma/schema.prisma` returns `1`
    - `grep -c "@@map(\"bot_filter_flags\")" prisma/schema.prisma` returns `1`
    - `grep -c "@@map(\"coordination_clusters\")" prisma/schema.prisma` returns `1`
    - `grep -c "// PIT-INVARIANT" prisma/schema.prisma` returns `>= 3` (2 new + ≥1 from 20-Z-01)
    - `npx prisma generate` exits 0
    - `npx prisma format` exits 0 and produces no diff
    - `git diff prisma/schema.prisma | grep -E "^-[^-]" | wc -l` returns `0` (only additions)
  </acceptance_criteria>
  <automated>npx prisma format --check && [ "$(grep -c "model BotFilterFlag" prisma/schema.prisma)" -eq 1 ] && [ "$(grep -c "model CoordinationCluster" prisma/schema.prisma)" -eq 1 ] && [ "$(grep -c "idx_botflag_" prisma/schema.prisma)" -eq 2 ] && [ "$(grep -c "idx_coordcluster_" prisma/schema.prisma)" -eq 1 ]</automated>
  <done>Both models + 3 composite indexes + 2 PIT-INVARIANT markers present; Prisma client regenerated; no existing model touched</done>
</task>

<task type="auto" tdd="true" id="20-C-03-02">
  <name>Task 2: Implement bot-filter.ts pure functions (Cresci-2019 heuristics)</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md line 126 (verbatim spec + line 61 Cresci/Nam citations)
    - src/lib/sentiment/aggregator.ts (existing module style)
    - src/lib/sentiment/finsentllm.ts (existing pure-function style with documented thresholds)
    - tests/learning.unit.bugs.test.ts (precedent unit-test style with numeric assertions)
  </read_first>
  <behavior>
    - textCosineSimilarity: identical inputs → 1.0; disjoint vocabularies → 0.0; partial overlap → in (0, 1)
    - pumpPhraseDensity: 'to the moon to the moon' with 9-phrase default → 2/6 ≈ 0.333; empty string → 0
    - PUMP_PHRASES: deep-equal exact 9-entry list in the documented order
    - cresciBotScore young account (age 5d, clean text, 0 hashtags) → is_bot=true, reason='young_account'
    - cresciBotScore high self-similarity (age 200d, 3 identical messages, 0 hashtags) → is_bot=true, reason='high_self_similarity'
    - cresciBotScore pump density (age 200d, "to the moon rocket 100x" repeated, 0 hashtags) → is_bot=true, reason='pump_density'
    - cresciBotScore hashtag spam (age 200d, 1 message, hashtag_counts=[8]) → is_bot=true, reason='hashtag_spam'
    - cresciBotScore clean profile (age 1000d, diverse text, 0 hashtags) → is_bot=false, reason='clean'
    - features object populated regardless of which gate fired (for telemetry + appeal)
  </behavior>
  <action>
    Create `tests/sentiment/bot-filter.unit.test.ts` FIRST with the assertions described in `<behavior>`. Run it — MUST fail (RED). Then create `src/lib/sentiment/bot-filter.ts` with the exact contents below — run again — MUST pass (GREEN).

    ```typescript
    // src/lib/sentiment/bot-filter.ts
    //
    // Plan 20-C-03 — Cresci-2019 bot filter (per-author heuristics).
    //
    // Cited thresholds from Cresci et al. 2019 §3.2 + Nam & Yang 2023 §4.1:
    //   account_age_days < 30      → 'young_account'
    //   max pairwise cosine > 0.5  → 'high_self_similarity'
    //   max pump density > 0.1     → 'pump_density'
    //   max hashtag count > 5      → 'hashtag_spam'
    //
    // These are LITERAL thresholds with citations (S1 hand-pick exemption: cited
    // from peer-reviewed sources whose corpus matches Cipher's). Calibration on
    // production-labeled data is gated by the 100-author FP eval in
    // scripts/eval-bot-fp.ts — the threshold values are reaffirmed when FP ≤ 5%
    // on that labeled set; otherwise the model card §"Maintenance" requires
    // recalibration via HYPERPARAMETERS.md update + 20-Z-01 model_version bump.

    export const PUMP_PHRASES: readonly string[] = [
      'to the moon',
      'rocket',
      '100x',
      'moonshot',
      'bagholder',
      'yolo',
      'tendies',
      'rip',
      'lambo',
    ] as const;

    export const MIN_ACCOUNT_AGE_DAYS = 30;
    export const MAX_SELF_SIMILARITY  = 0.5;
    export const MAX_PUMP_DENSITY     = 0.1;
    export const MAX_HASHTAG_COUNT    = 5;

    export type CresciReason =
      | 'young_account'
      | 'high_self_similarity'
      | 'pump_density'
      | 'hashtag_spam'
      | 'clean';

    export interface CresciAuthorInput {
      account_age_days: number;
      messages: string[];
      hashtag_counts: number[];
    }

    export interface CresciAuthorResult {
      is_bot: boolean;
      reason: CresciReason;
      features: {
        account_age_days: number;
        max_text_cosine_similarity: number;
        pump_phrase_density: number;
        hashtag_count_max: number;
      };
    }

    /** 4-gram character shingle set. Lowercased + whitespace-collapsed for stability. */
    function shingles4(text: string): Map<string, number> {
      const s = text.toLowerCase().replace(/\s+/g, ' ').trim();
      const m = new Map<string, number>();
      if (s.length < 4) return m;
      for (let i = 0; i <= s.length - 4; i++) {
        const k = s.slice(i, i + 4);
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return m;
    }

    /**
     * TF-IDF cosine on character 4-gram shingles. We use raw term-frequency
     * vectors (no IDF, because IDF is unstable on tiny corpora of 2 docs);
     * this matches scikit-learn's `CountVectorizer + cosine_similarity` on
     * single-pair inputs. Identical multisets → 1.0; disjoint vocab → 0.0.
     */
    export function textCosineSimilarity(a: string, b: string): number {
      const A = shingles4(a);
      const B = shingles4(b);
      if (A.size === 0 || B.size === 0) return 0;
      let dot = 0, na = 0, nb = 0;
      for (const [k, va] of A) {
        const vb = B.get(k) ?? 0;
        dot += va * vb;
        na  += va * va;
      }
      for (const vb of B.values()) nb += vb * vb;
      const denom = Math.sqrt(na) * Math.sqrt(nb);
      return denom === 0 ? 0 : dot / denom;
    }

    export function pumpPhraseDensity(
      text: string,
      phrases: readonly string[] = PUMP_PHRASES,
    ): number {
      const lower = text.toLowerCase();
      const tokens = lower.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) return 0;
      let hits = 0;
      for (const p of phrases) {
        const needle = p.toLowerCase();
        let idx = 0;
        while ((idx = lower.indexOf(needle, idx)) !== -1) {
          hits++;
          idx += Math.max(needle.length, 1);
        }
      }
      return hits / tokens.length;
    }

    function maxPairwiseCosine(messages: string[]): number {
      if (messages.length < 2) return 0;
      let max = 0;
      for (let i = 0; i < messages.length; i++) {
        for (let j = i + 1; j < messages.length; j++) {
          const c = textCosineSimilarity(messages[i], messages[j]);
          if (c > max) max = c;
        }
      }
      return max;
    }

    export function cresciBotScore(input: CresciAuthorInput): CresciAuthorResult {
      const max_text_cosine_similarity = maxPairwiseCosine(input.messages);
      let max_pump_density = 0;
      for (const m of input.messages) {
        const d = pumpPhraseDensity(m);
        if (d > max_pump_density) max_pump_density = d;
      }
      const hashtag_count_max = input.hashtag_counts.length === 0
        ? 0
        : Math.max(...input.hashtag_counts);

      const features = {
        account_age_days: input.account_age_days,
        max_text_cosine_similarity,
        pump_phrase_density: max_pump_density,
        hashtag_count_max,
      };

      // First-match enum order: young → similarity → pump → hashtag → clean.
      if (input.account_age_days < MIN_ACCOUNT_AGE_DAYS) {
        return { is_bot: true, reason: 'young_account', features };
      }
      if (max_text_cosine_similarity > MAX_SELF_SIMILARITY) {
        return { is_bot: true, reason: 'high_self_similarity', features };
      }
      if (max_pump_density > MAX_PUMP_DENSITY) {
        return { is_bot: true, reason: 'pump_density', features };
      }
      if (hashtag_count_max > MAX_HASHTAG_COUNT) {
        return { is_bot: true, reason: 'hashtag_spam', features };
      }
      return { is_bot: false, reason: 'clean', features };
    }
    ```

    Then run:
    ```bash
    npx vitest run tests/sentiment/bot-filter.unit.test.ts
    ```
  </action>
  <verify>
    <automated>npx vitest run tests/sentiment/bot-filter.unit.test.ts && [ "$(grep -c "export function cresciBotScore" src/lib/sentiment/bot-filter.ts)" -eq 1 ] && [ "$(grep -c "to the moon" src/lib/sentiment/bot-filter.ts)" -ge 1 ]</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/lib/sentiment/bot-filter.ts`
    - `test -f tests/sentiment/bot-filter.unit.test.ts`
    - `grep -c "it(" tests/sentiment/bot-filter.unit.test.ts` returns `>= 8`
    - `npx vitest run tests/sentiment/bot-filter.unit.test.ts` exits 0
    - `grep -c "PUMP_PHRASES" src/lib/sentiment/bot-filter.ts` returns `>= 2`
    - Test asserts `PUMP_PHRASES.length === 9` (deep-equal against the literal 9-entry list)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>Bot-filter pure functions pass ≥8 unit tests; PUMP_PHRASES deep-equal verified; first-match enum order verified</done>
</task>

<task type="auto" tdd="true" id="20-C-03-03">
  <name>Task 3: Implement coordination.ts (MinHash + LSH) pure functions</name>
  <read_first>
    - src/lib/sentiment/bot-filter.ts (Task 2 output — same module style; shingle4 lives there, COPY the function locally rather than cross-importing to keep coordination.ts standalone)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md line 126 (MinHash params + threshold spec)
    - Reference: Broder 1997 §3 MinHash; Leskovec/Rajaraman/Ullman "Mining of Massive Datasets" Ch. 3.4 banding LSH derivation `s = (1/b)^(1/r)`
  </read_first>
  <behavior>
    - minHash('hello', 128) → length === 128
    - minHash(x) deterministic: same input → same signature
    - LSH_BANDS === 16 and LSH_ROWS === 8 (literal constants exported)
    - lshCluster on synthetic 60 near-duplicates → returns a cluster of size ≥ 50
    - lshCluster on 60 disjoint random texts → returns 0 clusters of size ≥ 50
    - detectCoordinatedPosting on 30 messages (below MIN_CLUSTER_SIZE=50) → null
    - detectCoordinatedPosting on 50 near-duplicate pump messages → returns CoordinationCluster with is_flagged=true, cluster_size >= 50
    - Empirical collision rate on 10K random-text pairs (50 char each) < 0.10 (sanity-check that the params don't over-cluster)
  </behavior>
  <action>
    Create `tests/sentiment/coordination.unit.test.ts` FIRST with the behavior assertions. Run — MUST fail (RED). Then create `src/lib/sentiment/coordination.ts`:

    ```typescript
    // src/lib/sentiment/coordination.ts
    //
    // Plan 20-C-03 — MinHash + banding LSH for coordinated-posting detection.
    //
    // Params calibrated from Leskovec/Rajaraman/Ullman Ch. 3.4:
    //   threshold ≈ (1/bands)^(1/rows)  →  (1/16)^(1/8) ≈ 0.707 ≈ 0.7 target
    //   num_perm = bands × rows         →  16 × 8 = 128
    //
    // Detection requires ≥ COORDINATION_MIN_CLUSTER_SIZE=50 messages in a single
    // cluster (NOT 2-3 incidental duplicates) — mitigates T-20-C-03-04 (MinHash
    // collision false-positives).

    import { createHash } from 'crypto';

    export const MINHASH_NUM_PERM = 128;
    export const LSH_BANDS = 16;
    export const LSH_ROWS = 8;
    export const COORDINATION_SIMILARITY = 0.7;
    export const COORDINATION_MIN_CLUSTER_SIZE = 50;

    // Sanity: bands × rows MUST equal num_perm. Asserted at module load.
    if (LSH_BANDS * LSH_ROWS !== MINHASH_NUM_PERM) {
      throw new Error(`coordination.ts: LSH_BANDS (${LSH_BANDS}) × LSH_ROWS (${LSH_ROWS}) must equal MINHASH_NUM_PERM (${MINHASH_NUM_PERM})`);
    }

    function shingles4(text: string): Set<string> {
      const s = text.toLowerCase().replace(/\s+/g, ' ').trim();
      const out = new Set<string>();
      if (s.length < 4) return out;
      for (let i = 0; i <= s.length - 4; i++) out.add(s.slice(i, i + 4));
      return out;
    }

    /**
     * Hash a shingle to a uint32 with two seeded constants (Broder 1997 style).
     * Uses sha256 for stability + portability (slower than xxHash but determinism
     * matters more than speed at 128 perm × ≤1000 messages per ticker).
     */
    function hashSeeded(seed: number, s: string): number {
      const h = createHash('sha256');
      h.update(`${seed}:${s}`, 'utf8');
      const buf = h.digest();
      // First 4 bytes as uint32 — enough entropy for our cardinality budget.
      return buf.readUInt32BE(0);
    }

    export function minHash(text: string, num_perm: number = MINHASH_NUM_PERM): number[] {
      const sh = shingles4(text);
      const sig: number[] = new Array(num_perm).fill(0xFFFFFFFF);
      if (sh.size === 0) return sig;
      // Seeded permutations: for each of `num_perm` hash functions, take the
      // minimum hash across all shingles → that's the MinHash signature entry.
      for (let p = 0; p < num_perm; p++) {
        let min = 0xFFFFFFFF;
        for (const s of sh) {
          const v = hashSeeded(p, s);
          if (v < min) min = v;
        }
        sig[p] = min;
      }
      return sig;
    }

    /**
     * Banding LSH: split each signature into `LSH_BANDS` bands of `LSH_ROWS`
     * each. Hash each band → bucket. Ids that share any bucket form a candidate
     * pair. Return deduped clusters (transitive closure of candidate pairs).
     */
    export function lshCluster(
      signatures: { id: string; minhash: number[] }[],
      threshold: number = COORDINATION_SIMILARITY,
    ): string[][] {
      void threshold;  // threshold is informational — banding params encode it
      const buckets = new Map<string, string[]>();
      for (const { id, minhash } of signatures) {
        for (let b = 0; b < LSH_BANDS; b++) {
          const slice = minhash.slice(b * LSH_ROWS, (b + 1) * LSH_ROWS);
          const key = `${b}:${slice.join(',')}`;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key)!.push(id);
        }
      }
      // Union-find over candidate pairs from any band match.
      const parent = new Map<string, string>();
      function find(x: string): string {
        if (!parent.has(x)) { parent.set(x, x); return x; }
        const p = parent.get(x)!;
        if (p === x) return x;
        const r = find(p);
        parent.set(x, r);
        return r;
      }
      function union(a: string, b: string) {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
      }
      for (const ids of buckets.values()) {
        if (ids.length < 2) continue;
        const head = ids[0];
        for (let i = 1; i < ids.length; i++) union(head, ids[i]);
      }
      const groups = new Map<string, string[]>();
      for (const { id } of signatures) {
        const r = find(id);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r)!.push(id);
      }
      // Filter out singleton clusters (each id is its own root if no band matched).
      return Array.from(groups.values()).filter((g) => g.length >= 2);
    }

    /** Jaccard estimate from MinHash signatures (fraction of equal entries). */
    function jaccard(a: number[], b: number[]): number {
      let eq = 0;
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) if (a[i] === b[i]) eq++;
      return n === 0 ? 0 : eq / n;
    }

    function avgPairwiseJaccard(sigs: number[][]): number {
      if (sigs.length < 2) return 0;
      let sum = 0, n = 0;
      for (let i = 0; i < sigs.length; i++) {
        for (let j = i + 1; j < sigs.length; j++) {
          sum += jaccard(sigs[i], sigs[j]);
          n++;
        }
      }
      return n === 0 ? 0 : sum / n;
    }

    export interface CoordinationClusterRow {
      ticker: string;
      window_start: Date;
      window_end: Date;
      n_messages: number;
      similarity_threshold: number;
      cluster_size: number;
      is_flagged: boolean;
      member_ids: string[];
    }

    export function detectCoordinatedPosting(
      ticker: string,
      window_start: Date,
      window_end: Date,
      messages: { id: string; text: string }[],
      window_size: number = COORDINATION_MIN_CLUSTER_SIZE,
    ): CoordinationClusterRow | null {
      if (messages.length === 0) return null;
      const sigs = messages.map((m) => ({ id: m.id, minhash: minHash(m.text) }));
      const clusters = lshCluster(sigs);
      let largest: string[] = [];
      for (const c of clusters) if (c.length > largest.length) largest = c;
      const sigMap = new Map(sigs.map((s) => [s.id, s.minhash]));
      const largestSigs = largest.map((id) => sigMap.get(id)!).filter(Boolean);
      const avg_jaccard = avgPairwiseJaccard(largestSigs);
      const is_flagged =
        largest.length >= window_size && avg_jaccard >= COORDINATION_SIMILARITY;

      if (!is_flagged) return null;
      return {
        ticker,
        window_start,
        window_end,
        n_messages: messages.length,
        similarity_threshold: COORDINATION_SIMILARITY,
        cluster_size: largest.length,
        is_flagged: true,
        member_ids: largest,
      };
    }
    ```

    Run:
    ```bash
    npx vitest run tests/sentiment/coordination.unit.test.ts
    ```
  </action>
  <verify>
    <automated>npx vitest run tests/sentiment/coordination.unit.test.ts && [ "$(grep -c "export const LSH_BANDS = 16" src/lib/sentiment/coordination.ts)" -eq 1 ] && [ "$(grep -c "export const LSH_ROWS = 8" src/lib/sentiment/coordination.ts)" -eq 1 ] && [ "$(grep -c "export const MINHASH_NUM_PERM = 128" src/lib/sentiment/coordination.ts)" -eq 1 ]</automated>
  </verify>
  <acceptance_criteria>
    - `test -f src/lib/sentiment/coordination.ts`
    - `grep -c "MINHASH_NUM_PERM = 128" src/lib/sentiment/coordination.ts` returns `1`
    - `grep -c "LSH_BANDS = 16" src/lib/sentiment/coordination.ts` returns `1`
    - `grep -c "LSH_ROWS = 8" src/lib/sentiment/coordination.ts` returns `1`
    - `grep -c "COORDINATION_SIMILARITY = 0.7" src/lib/sentiment/coordination.ts` returns `1`
    - `grep -c "COORDINATION_MIN_CLUSTER_SIZE = 50" src/lib/sentiment/coordination.ts` returns `1`
    - `grep -c "it(" tests/sentiment/coordination.unit.test.ts` returns `>= 6`
    - `npx vitest run tests/sentiment/coordination.unit.test.ts` exits 0
    - Test asserts module-load sanity check (`bands × rows === num_perm`)
    - Empirical collision-rate test on 10K random-text pairs reports rate < 0.10
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <done>MinHash + LSH pure functions pass ≥6 unit tests; 128 perm × 16 bands × 8 rows literal constants verified; empirical collision rate documented</done>
</task>

<task type="checkpoint:human-action" id="20-C-03-04" gate="blocking">
  <name>Task 4: [BLOCKING] Run npx prisma db push for BotFilterFlag + CoordinationCluster tables</name>
  <read_first>
    - prisma/schema.prisma (after Task 1 — verify both models present)
    - CONTEXT.md line 172 (the operator-action row for Prisma db push: "Prisma schema migration + db push (additive, non-blocking)")
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md Task 3 (precedent push step)
  </read_first>
  <what-built>
    Task 1 added two new models — `BotFilterFlag` and `CoordinationCluster` — to `prisma/schema.prisma`. This task pushes them to live Neon. The push is purely additive (two new tables, three indexes — no column drops, no type changes on existing columns), so it is non-blocking and reversible (`DROP TABLE bot_filter_flags, coordination_clusters` if needed).
  </what-built>
  <how-to-verify>
    1. Confirm `DATABASE_URL` points to production Neon:
       ```bash
       echo "$DATABASE_URL" | sed 's|//[^@]*@|//***@|'   # mask credentials
       ```
       Expect a `neon.tech` host.

    2. Run the push:
       ```bash
       npx prisma db push
       ```
       Accept ONLY if the displayed plan is purely additive (new tables `bot_filter_flags` + `coordination_clusters` + 3 indexes). Decline if it proposes any destructive operation on existing tables.

       Non-TTY fallback:
       ```bash
       yes "" | npx prisma db push --skip-generate && npx prisma generate
       ```

    3. Verify both tables landed:
       ```bash
       psql "$DATABASE_URL" -c '\d "bot_filter_flags"'
       psql "$DATABASE_URL" -c '\d "coordination_clusters"'
       ```
       Expect:
       - `bot_filter_flags`: 10 columns including `computed_at` (NOT NULL, with default `now()`), `is_bot_flagged` (BOOLEAN NOT NULL), `bot_reason` (TEXT NOT NULL), plus 2 indexes (`idx_botflag_author_computed_at`, `idx_botflag_ticker_computed_at`).
       - `coordination_clusters`: 10 columns including `window_start`, `window_end`, `computed_at`, `is_flagged`, `member_ids` (JSONB), plus 1 index (`idx_coordcluster_ticker_window`).

    4. Row counts should be zero:
       ```bash
       psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "bot_filter_flags"'
       psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "coordination_clusters"'
       ```
       Both expect `0`.
  </how-to-verify>
  <acceptance_criteria>
    - `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "bot_filter_flags"'` returns `0`
    - `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "coordination_clusters"'` returns `0`
    - `psql "$DATABASE_URL" -c '\d "bot_filter_flags"' | grep -c "idx_botflag_"` returns `>= 2`
    - `psql "$DATABASE_URL" -c '\d "coordination_clusters"' | grep -c "idx_coordcluster_"` returns `>= 1`
    - `psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='bot_filter_flags' AND column_name='computed_at' AND is_nullable='NO'"` returns 1 row
    - `psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='coordination_clusters' AND column_name='computed_at' AND is_nullable='NO'"` returns 1 row
  </acceptance_criteria>
  <resume-signal>Reply with `approved` once psql confirms both tables + 3 indexes are live. Reply with `failed: <reason>` if push errored; planner will reroute.</resume-signal>
  <done>BotFilterFlag and CoordinationCluster tables live in production Neon with 3 indexes total; row counts = 0</done>
</task>

<task type="auto" id="20-C-03-05">
  <name>Task 5: Wire bot-filter + coordination computation into sentiment-scan cron route</name>
  <read_first>
    - src/app/api/cron/sentiment-scan/route.ts (post-20-Z-01 state — SentimentObservation block at the bottom of the per-ticker loop)
    - src/lib/sentiment/bot-filter.ts (Task 2 output)
    - src/lib/sentiment/coordination.ts (Task 3 output)
    - src/lib/db.ts (prisma singleton)
  </read_first>
  <action>
    Edit `src/app/api/cron/sentiment-scan/route.ts` to compute and persist `BotFilterFlag` + `CoordinationCluster` rows AFTER the 20-Z-01 SentimentObservation block. The existing `prisma.sentimentSnapshot.create({...})` writer and the 20-Z-01 `insertObservation` block stay UNCHANGED.

    1. Add imports near the top of the file (after the 20-Z-01 imports):
       ```typescript
       import { cresciBotScore, type CresciReason } from '@/lib/sentiment/bot-filter';
       import { detectCoordinatedPosting, COORDINATION_SIMILARITY } from '@/lib/sentiment/coordination';
       ```

    2. AFTER the 20-Z-01 SentimentObservation loop (before `results.scanned++`), append the following block:

       ```typescript
       // Plan 20-C-03 — per-author Cresci scoring + aggregate-level coordinated-posting detection.
       // Persistence ALWAYS runs (off|shadow|on); the consumer-side weight gate in
       // src/lib/sentiment/aggregator.ts is what graduates via FEATURE_BOT_FILTER.
       // Failures here are logged-and-continued — they MUST NOT block the snapshot
       // path that serves current readers.
       try {
         // Group messages by author for per-author scoring.
         const byAuthor = new Map<string, { messages: string[]; hashtag_counts: number[]; account_age_days: number | null }>();
         for (const m of stocktwitsMessages) {
           if (!m.id || !m.body) continue;
           const handle = m.user?.username ?? 'anonymous';
           const author_id = createHash('sha256').update(`stocktwits:${handle}`, 'utf8').digest('hex');
           const account_age_days = m.user?.created_at
             ? Math.max(0, Math.floor((Date.now() - new Date(m.user.created_at).getTime()) / 86_400_000))
             : null;
           const hashtag_count = (m.body.match(/#[A-Za-z0-9_]+/g) ?? []).length;
           const entry = byAuthor.get(author_id) ?? { messages: [], hashtag_counts: [], account_age_days };
           entry.messages.push(m.body);
           entry.hashtag_counts.push(hashtag_count);
           entry.account_age_days = account_age_days;
           byAuthor.set(author_id, entry);
         }

         let authors_flagged = 0;
         for (const [author_id, data] of byAuthor) {
           const result = cresciBotScore({
             account_age_days: data.account_age_days ?? 9999,  // null treated as "old enough" — don't flag for age alone
             messages: data.messages,
             hashtag_counts: data.hashtag_counts,
           });
           try {
             await prisma.botFilterFlag.create({
               data: {
                 author_id,
                 ticker,
                 // computed_at defaults to now() — PIT-INVARIANT
                 account_age_days: data.account_age_days,
                 max_text_cosine_similarity: result.features.max_text_cosine_similarity,
                 pump_phrase_density: result.features.pump_phrase_density,
                 hashtag_count_max: result.features.hashtag_count_max,
                 is_bot_flagged: result.is_bot,
                 bot_reason: result.reason as CresciReason,
               },
             });
             if (result.is_bot) authors_flagged++;
           } catch {
             // logged-and-continued — does NOT fail the cron tick
           }
         }

         // Aggregate-level coordinated-posting detection on the 24h message bag.
         const now = new Date();
         const window_start = new Date(now.getTime() - 24 * 3600 * 1000);
         const window_end = now;
         const cluster = detectCoordinatedPosting(
           ticker,
           window_start,
           window_end,
           stocktwitsMessages
             .filter((m): m is { id: string | number; body: string } => !!m.id && !!m.body)
             .map((m) => ({ id: String(m.id), text: m.body })),
         );
         if (cluster) {
           try {
             await prisma.coordinationCluster.create({
               data: {
                 ticker: cluster.ticker,
                 window_start: cluster.window_start,
                 window_end: cluster.window_end,
                 n_messages: cluster.n_messages,
                 similarity_threshold: cluster.similarity_threshold,
                 cluster_size: cluster.cluster_size,
                 is_flagged: cluster.is_flagged,
                 member_ids: cluster.member_ids,
               },
             });
           } catch {
             // logged-and-continued
           }
         }

         (results as Record<string, number>)[`authors_flagged_${ticker}`] = authors_flagged;
         (results as Record<string, number>)[`coord_cluster_${ticker}`] = cluster?.cluster_size ?? 0;
         void COORDINATION_SIMILARITY;  // referenced for grep traceability
       } catch {
         // outer catch — never block the snapshot path
       }
       ```

    Constraints:
    - Do NOT remove or modify the existing `prisma.sentimentSnapshot.create({...})` call or the 20-Z-01 SentimentObservation block.
    - Failure in the new writer MUST be caught and logged-and-continued — must NOT cause the existing snapshot row to be lost.
    - When `stocktwitsMessages` is empty, the new block is a no-op.
  </action>
  <acceptance_criteria>
    - `grep -c "prisma.sentimentSnapshot.create" src/app/api/cron/sentiment-scan/route.ts` returns `1` (existing writer preserved)
    - `grep -c "insertObservation(" src/app/api/cron/sentiment-scan/route.ts` returns `>= 1` (20-Z-01 writer preserved)
    - `grep -c "cresciBotScore(" src/app/api/cron/sentiment-scan/route.ts` returns `>= 1`
    - `grep -c "detectCoordinatedPosting(" src/app/api/cron/sentiment-scan/route.ts` returns `>= 1`
    - `grep -c "prisma.botFilterFlag.create" src/app/api/cron/sentiment-scan/route.ts` returns `>= 1`
    - `grep -c "prisma.coordinationCluster.create" src/app/api/cron/sentiment-scan/route.ts` returns `>= 1`
    - `grep -c "// Plan 20-C-03" src/app/api/cron/sentiment-scan/route.ts` returns `>= 1`
    - `grep -c "prisma.botFilterFlag.update\|prisma.botFilterFlag.upsert\|prisma.coordinationCluster.update\|prisma.coordinationCluster.upsert" src/app/api/cron/sentiment-scan/route.ts` returns `0` (insert-only invariant — same convention as 20-Z-01)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npx tsc --noEmit && grep -q "cresciBotScore(" src/app/api/cron/sentiment-scan/route.ts && grep -q "detectCoordinatedPosting(" src/app/api/cron/sentiment-scan/route.ts && [ "$(grep -c "prisma.sentimentSnapshot.create" src/app/api/cron/sentiment-scan/route.ts)" -eq 1 ]</automated>
  </verify>
  <done>Cron route persists BotFilterFlag (per-author) + CoordinationCluster (per-ticker 24h window); failures logged-and-continued; existing writers untouched</done>
</task>

<task type="auto" tdd="true" id="20-C-03-06">
  <name>Task 6: Aggregator weight gate + UI subtext (behind FEATURE_BOT_FILTER three-mode flag)</name>
  <read_first>
    - src/lib/sentiment/aggregator.ts (existing module — extend the AggregatedSentiment shape additively)
    - src/lib/features.ts (existing FEATURE_* convention from 19-C-03 reputation-weighted three-mode flag)
    - src/components/ResearchReport.tsx (SentimentIntelligenceCard region — same lines used by 20-A-01 crowded-consensus badge)
    - .planning/phases/20-real-sentiment-analysis/20-A-01-PLAN.md (precedent for FEATURE_* three-mode wiring + UI badge gating)
  </read_first>
  <behavior>
    - Aggregator with FEATURE_BOT_FILTER='off': botFlags ignored; output bull% identical to pre-Task-6 behavior
    - Aggregator with FEATURE_BOT_FILTER='shadow': same as 'off' for the public output, but shadow-comparison row is persisted (re-use the runWithShadow pattern from 19-C-03)
    - Aggregator with FEATURE_BOT_FILTER='on': messages whose author_id is in botFlags contribute weight=0; aggregated_bull_pct recomputed accordingly
    - AggregatedSentiment.coordinated_posting === true when latest CoordinationCluster row for ticker within 24h has is_flagged=true; false otherwise
    - AggregatedSentiment.bot_filter_summary populated regardless of flag mode (so UI can read counts even in shadow)
    - SentimentIntelligenceCard renders 'X authors flagged as bots; Y messages flagged as coordinated' ONLY when FEATURE_BOT_FILTER==='on' AND (X > 0 OR Y > 0)
    - SentimentIntelligenceCard does NOT remove flagged messages from any message list it renders — flagging affects weight, not visibility (T-20-C-03-05)
  </behavior>
  <action>
    1. Add `bot_filter` mode to `src/lib/features.ts` following the existing three-mode convention:

       ```typescript
       export type BotFilterMode = 'off' | 'shadow' | 'on';
       export const BOT_FILTER_MODE: BotFilterMode =
         (process.env.FEATURE_BOT_FILTER as BotFilterMode | undefined) ?? 'off';
       // Append to existing FEATURES object literal:
       //   bot_filter_mode: BOT_FILTER_MODE
       ```

    2. Extend `src/lib/sentiment/aggregator.ts`:
       - Add `BotFilterSummary` interface (per `<interfaces>` block above)
       - Extend `AggregatedSentiment` with `coordinated_posting: boolean` and `bot_filter_summary: BotFilterSummary | null`
       - Add optional `botFlags?: Set<string>` parameter to `aggregateCommunitySentiment`
       - When `FEATURES.bot_filter_mode === 'on'` AND `botFlags` provided: per-message weight returns 0 for in-set authors. Otherwise: weight unchanged.
       - Note: existing inputs are aggregate-level (`SourceInput` with `bullish_pct` + `mention_count`), so the per-message gate works by REDUCING the upstream `mention_count` passed in (caller pre-filters). Add a NEW helper `applyBotFilterToCount(count, n_flagged): number` that returns `Math.max(0, count - n_flagged)` when mode is 'on'. Caller responsibility documented in JSDoc.

    3. Add `src/components/ResearchReport.tsx` subtext inside the existing SentimentIntelligenceCard region (same area as the 20-A-01 crowded-consensus badge):

       ```tsx
       {FEATURES.bot_filter_mode === 'on'
         && sentiment_intelligence.bot_filter_summary
         && ((sentiment_intelligence.bot_filter_summary.authors_flagged > 0)
             || (sentiment_intelligence.bot_filter_summary.messages_flagged_coordinated > 0)) && (
         <p className="mt-2 text-xs text-amber-600">
           {sentiment_intelligence.bot_filter_summary.authors_flagged} authors flagged as bots;{' '}
           {sentiment_intelligence.bot_filter_summary.messages_flagged_coordinated} messages flagged as coordinated
         </p>
       )}
       ```

       The amber color signals "advisory, not silencing" per T-20-C-03-05.

    4. Create `tests/sentiment/bot-filter-aggregator.unit.test.ts` (FIRST — RED) asserting:
       - mode='off' → output bull% unchanged regardless of botFlags
       - mode='shadow' → same output as 'off'
       - mode='on' + botFlags ⊆ authors → output bull% differs (or mention_count effective is lower)
       - bot_filter_summary populated with correct counts in all modes

    5. Create `tests/components/research-report-bot-filter.unit.test.tsx` (FIRST — RED) asserting:
       - When mode='on' AND counts > 0 → subtext renders with the literal text "authors flagged as bots" + "messages flagged as coordinated"
       - When mode='off' → subtext NOT in DOM
       - When mode='on' AND counts === 0 → subtext NOT in DOM (don't render zero-state noise)
       - When mode='on' AND counts > 0 → flagged messages still appear in the rendered message list (no silent suppression — T-20-C-03-05)

    Then implement Steps 1–3, run the tests — MUST pass (GREEN).
  </action>
  <verify>
    <automated>npx vitest run tests/sentiment/bot-filter-aggregator.unit.test.ts tests/components/research-report-bot-filter.unit.test.tsx && grep -q "bot_filter_mode" src/lib/features.ts && grep -q "bot_filter_summary" src/lib/sentiment/aggregator.ts && grep -q "authors flagged as bots" src/components/ResearchReport.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "BotFilterMode\|bot_filter_mode" src/lib/features.ts` returns `>= 2`
    - `grep -c "bot_filter_summary\|coordinated_posting" src/lib/sentiment/aggregator.ts` returns `>= 2`
    - `grep -c "authors flagged as bots" src/components/ResearchReport.tsx` returns `1` (literal subtext)
    - `grep -c "messages flagged as coordinated" src/components/ResearchReport.tsx` returns `1`
    - `grep -c "it(" tests/sentiment/bot-filter-aggregator.unit.test.ts` returns `>= 4`
    - `grep -c "it(" tests/components/research-report-bot-filter.unit.test.tsx` returns `>= 4`
    - `npx vitest run tests/sentiment/bot-filter-aggregator.unit.test.ts tests/components/research-report-bot-filter.unit.test.tsx` exits 0
    - `npx tsc --noEmit` exits 0
    - Existing `aggregateCommunitySentiment` test suite still passes unchanged (no regression on the base path)
  </acceptance_criteria>
  <done>Aggregator weight gate + UI subtext behind FEATURE_BOT_FILTER three-mode flag; flagged messages remain visible (T-20-C-03-05); ≥8 new tests green; no regression on existing aggregator tests</done>
</task>

<task type="checkpoint:human-action" id="20-C-03-07" gate="blocking">
  <name>Task 7: [BLOCKING] Operator-curated 100-author labeled set + RUNBOOK</name>
  <read_first>
    - tests/golden-tickers/ (existing fixture directory from Phase 19/20-D plans — same location convention)
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md line 126 ("operator labels via spot-check")
    - docs/cards/MODEL-CARD-bot-filter.md (Task 9 — referenced from the RUNBOOK)
  </read_first>
  <what-built>
    The 100-author labeled set is the ONLY input to the FP gate (`npm run eval-bot-fp`). Without it, FP cannot be measured. The set MUST be operator-curated from production data — Claude CANNOT fabricate this dataset because the labels are ground truth derived from human inspection of real StockTwits profiles.
  </what-built>
  <how-to-verify>
    1. Create the RUNBOOK at `tests/golden-tickers/_bot_labels.RUNBOOK.md` BEFORE labeling. Required sections:

       ```markdown
       # 100-Author Bot Labeling Runbook (Plan 20-C-03)

       ## Sampling SQL

       ```sql
       -- Stratified sample: 50 candidates flagged is_bot_flagged=true,
       -- 50 candidates flagged is_bot_flagged=false. Stratify across
       -- bot_reason values so all 4 reason enums are represented.
       SELECT author_id, ticker, is_bot_flagged, bot_reason,
              account_age_days, max_text_cosine_similarity,
              pump_phrase_density, hashtag_count_max
       FROM bot_filter_flags
       WHERE computed_at > NOW() - INTERVAL '14 days'
       ORDER BY RANDOM()
       LIMIT 200;  -- oversample, then pick 100 stratified
       ```

       ## Decision rules (operator)

       For each sampled author_id, fetch the StockTwits profile (manually or via
       the StockTwits public profile URL), inspect the last 10-20 posts, and
       label as:

       - **bot**: matches at least 2 of: extremely short account history (<30d)
         + repetitive copy-paste content + pump-phrase heavy + >5 hashtags per
         post + obvious schedule (e.g., every 5 minutes during market hours)
       - **human**: thoughtful original content, varied vocabulary, normal
         posting cadence, OR clearly satire/parody that a reasonable reader
         would identify as human-authored
       - **uncertain**: SKIP — replace with another sample. Do not include
         uncertain rows in the 100-set.

       ## Appeal mechanism

       Any author later identified as a false-positive can be added to a manual
       allow-list (filed as a 20-C-03-FOLLOWUP plan). The labeling set itself
       is immutable once committed (S2) — appeals create new labeled samples
       with `labeled_at` post-dating the original.

       ## Quarterly review

       Re-sample 25 of the 100 every quarter to detect drift; if FP rate
       observed on the re-sampled subset exceeds 0.07, file a new labeling
       round and bump model_version.
       ```

    2. Curate the labeled set at `tests/golden-tickers/_bot_labels.json` with EXACTLY 100 entries:

       ```json
       [
         {
           "author_id_hash": "sha256:abc...",
           "ticker_sampled": "GME",
           "label": "bot",
           "notes": "Account age 4d, 18 identical posts to GME, 9 hashtags each",
           "labeled_at": "2026-05-XX",
           "labeled_by": "operator"
         },
         ...
       ]
       ```

       Constraints:
       - EXACTLY 100 entries (asserted by length check in Task 8)
       - All four `bot_reason` enums represented in the bot-labeled subset (≥ 5 of each)
       - ≥ 50 entries labeled `"human"` and ≥ 50 labeled `"bot"` (stratification gate)
       - `author_id_hash` values are real production hashes (NOT fabricated) — pulled from the sampling SQL above

    3. Commit the RUNBOOK + JSON file. Both MUST land before Task 8 runs.
  </how-to-verify>
  <acceptance_criteria>
    - `test -f tests/golden-tickers/_bot_labels.RUNBOOK.md`
    - `test -f tests/golden-tickers/_bot_labels.json`
    - `node -e "const a=require('./tests/golden-tickers/_bot_labels.json'); if(!Array.isArray(a)||a.length!==100){process.exit(1)}"` exits 0
    - `node -e "const a=require('./tests/golden-tickers/_bot_labels.json'); const n_bot=a.filter(x=>x.label==='bot').length; const n_h=a.filter(x=>x.label==='human').length; if(n_bot<50||n_h<50){process.exit(1)}"` exits 0
    - `grep -c "Sampling SQL\|Decision rules\|Appeal mechanism\|Quarterly review" tests/golden-tickers/_bot_labels.RUNBOOK.md` returns `>= 4`
  </acceptance_criteria>
  <resume-signal>Reply with `approved` once the 100-author JSON file + RUNBOOK have been committed and the assertions above pass. Reply with `failed: <reason>` if labeling could not be completed; planner will reroute (likely shrinking to 50 authors with documented power-loss).</resume-signal>
  <done>tests/golden-tickers/_bot_labels.json (100 entries, ≥50 bot, ≥50 human) + RUNBOOK committed; assertions green</done>
</task>

<task type="auto" id="20-C-03-08">
  <name>Task 8: FP evaluation script — scripts/eval-bot-fp.ts + npm script wiring</name>
  <read_first>
    - tests/golden-tickers/_bot_labels.json (Task 7 output)
    - src/lib/sentiment/bot-filter.ts (Task 2 — cresciBotScore signature)
    - scripts/check-sentiment-immutability.ts (precedent for repo-rooted Node scripts with structured exit codes)
    - docs/cards/MODEL-CARD-bot-filter.md (Task 9 — script updates a section of this card)
  </read_first>
  <action>
    1. Create `scripts/eval-bot-fp.ts`:

       ```typescript
       #!/usr/bin/env -S node --import tsx
       /**
        * Plan 20-C-03 — FP evaluation script.
        *
        * Reads the 100-author labeled set, replays cresciBotScore against each
        * author's recent message bag (fetched from production via the
        * StockTwits public profile endpoint OR from a cached fixture when
        * EVAL_BOT_FP_OFFLINE=1), and reports:
        *   - confusion matrix {tp, fp, tn, fn}
        *   - precision, recall, fp_rate
        *   - per-reason breakdown
        *
        * Exits NON-ZERO when fp_rate > 0.05 — this is the FP gate.
        * Updates the spot-check log section of docs/cards/MODEL-CARD-bot-filter.md
        * with the latest run's numbers + timestamp.
        */
       import { readFileSync, writeFileSync, existsSync } from 'fs';
       import { join } from 'path';
       import { cresciBotScore, type CresciReason } from '../src/lib/sentiment/bot-filter';

       interface LabeledRow {
         author_id_hash: string;
         ticker_sampled: string;
         label: 'bot' | 'human';
         notes?: string;
         labeled_at: string;
         labeled_by: string;
       }

       interface AuthorFixture {
         author_id_hash: string;
         messages: string[];
         hashtag_counts: number[];
         account_age_days: number;
       }

       const FP_GATE = 0.05;

       function loadLabels(): LabeledRow[] {
         const p = join(process.cwd(), 'tests/golden-tickers/_bot_labels.json');
         const data = JSON.parse(readFileSync(p, 'utf8'));
         if (!Array.isArray(data) || data.length !== 100) {
           console.error(`eval-bot-fp: labeled set must have exactly 100 entries, got ${Array.isArray(data) ? data.length : 'non-array'}`);
           process.exit(2);
         }
         return data as LabeledRow[];
       }

       function loadFixtures(): Map<string, AuthorFixture> {
         // Offline mode: read cached fixtures from tests/golden-tickers/_bot_fixtures.json
         // (operator builds this once when curating the labeled set).
         const p = join(process.cwd(), 'tests/golden-tickers/_bot_fixtures.json');
         if (!existsSync(p)) {
           console.error(`eval-bot-fp: fixture file ${p} missing — operator must build it alongside the labeled set`);
           process.exit(3);
         }
         const arr = JSON.parse(readFileSync(p, 'utf8')) as AuthorFixture[];
         return new Map(arr.map((f) => [f.author_id_hash, f]));
       }

       function main(): void {
         const labels = loadLabels();
         const fixtures = loadFixtures();

         let tp = 0, fp = 0, tn = 0, fn = 0;
         const byReason: Record<CresciReason, { fp: number; tp: number }> = {
           young_account: { fp: 0, tp: 0 },
           high_self_similarity: { fp: 0, tp: 0 },
           pump_density: { fp: 0, tp: 0 },
           hashtag_spam: { fp: 0, tp: 0 },
           clean: { fp: 0, tp: 0 },
         };

         for (const row of labels) {
           const fx = fixtures.get(row.author_id_hash);
           if (!fx) {
             console.error(`eval-bot-fp: no fixture for ${row.author_id_hash} — fixture file out of sync with label file`);
             process.exit(4);
           }
           const result = cresciBotScore({
             account_age_days: fx.account_age_days,
             messages: fx.messages,
             hashtag_counts: fx.hashtag_counts,
           });
           const predicted_bot = result.is_bot;
           const actual_bot = row.label === 'bot';
           if (predicted_bot && actual_bot) { tp++; byReason[result.reason].tp++; }
           else if (predicted_bot && !actual_bot) { fp++; byReason[result.reason].fp++; }
           else if (!predicted_bot && !actual_bot) { tn++; }
           else { fn++; }
         }

         const n_human = tn + fp;
         const fp_rate = n_human === 0 ? 0 : fp / n_human;
         const precision = (tp + fp) === 0 ? 0 : tp / (tp + fp);
         const recall    = (tp + fn) === 0 ? 0 : tp / (tp + fn);

         const summary = `## eval-bot-fp run @ ${new Date().toISOString()}

         | metric | value |
         |---|---|
         | tp | ${tp} |
         | fp | ${fp} |
         | tn | ${tn} |
         | fn | ${fn} |
         | fp_rate | ${fp_rate.toFixed(4)} |
         | precision | ${precision.toFixed(4)} |
         | recall | ${recall.toFixed(4)} |

         FP by reason: ${JSON.stringify(byReason)}

         Gate: fp_rate ≤ ${FP_GATE} → ${fp_rate <= FP_GATE ? 'PASS' : 'FAIL'}
         `.replace(/^         /gm, '');

         console.log(summary);

         // Append to the model card spot-check log section.
         const cardPath = join(process.cwd(), 'docs/cards/MODEL-CARD-bot-filter.md');
         if (existsSync(cardPath)) {
           const card = readFileSync(cardPath, 'utf8');
           const marker = '<!-- SPOT-CHECK-LOG -->';
           if (card.includes(marker)) {
             const updated = card.replace(marker, `${marker}\n\n${summary}\n`);
             writeFileSync(cardPath, updated, 'utf8');
           }
         }

         if (fp_rate > FP_GATE) {
           console.error(`eval-bot-fp: FAIL — fp_rate=${fp_rate.toFixed(4)} > ${FP_GATE}`);
           process.exit(1);
         }
         console.log('eval-bot-fp: PASS');
       }

       main();
       ```

    2. Wire `package.json` scripts:
       ```json
       "eval-bot-fp": "tsx scripts/eval-bot-fp.ts"
       ```

    3. Operator MUST also commit `tests/golden-tickers/_bot_fixtures.json` (built alongside the labeled set in Task 7 — same 100 entries, with the message bag + hashtag counts + account_age_days captured at labeling time so the eval is deterministic and offline-runnable).

    4. Run the eval:
       ```bash
       npm run eval-bot-fp
       ```
       Must exit 0 (fp_rate ≤ 0.05). If it fails, the model card section will record the FAIL — and the cutover gate stays closed until the parameters are recalibrated (filed as 20-C-03-FOLLOWUP).
  </action>
  <acceptance_criteria>
    - `test -f scripts/eval-bot-fp.ts`
    - `grep -c '"eval-bot-fp"' package.json` returns `1`
    - `test -f tests/golden-tickers/_bot_fixtures.json` (operator deliverable per RUNBOOK)
    - `node -e "const a=require('./tests/golden-tickers/_bot_fixtures.json'); if(!Array.isArray(a)||a.length!==100){process.exit(1)}"` exits 0
    - `npm run eval-bot-fp` exits 0
    - `grep -c "## eval-bot-fp run @" docs/cards/MODEL-CARD-bot-filter.md` returns `>= 1` (script appended a run summary)
    - `npx tsc --noEmit` exits 0
  </acceptance_criteria>
  <verify>
    <automated>npm run eval-bot-fp</automated>
  </verify>
  <done>FP evaluation script in place; exits 0 on committed labeled set + fixtures; model card spot-check log appended; FP_GATE=0.05 enforced</done>
</task>

<task type="auto" id="20-C-03-09">
  <name>Task 9: Model card + HYPERPARAMETERS.md subsection + integration test + commit</name>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md Task 8 (precedent for dataset card stub + commit format)
    - .planning/phases/20-real-sentiment-analysis/20-A-01-PLAN.md (precedent for MODEL-CARD-* commit + HYPERPARAMETERS.md subsection)
    - docs/cards/ (existing model card directory if present)
    - HYPERPARAMETERS.md (existing; append a new subsection — do NOT modify existing entries)
    - tests/integration/ (existing test directory + convention from 20-Z-01 integration test)
  </read_first>
  <action>
    1. Create `docs/cards/MODEL-CARD-bot-filter.md` per 20-Z-02 template:

       ```markdown
       # MODEL CARD — bot-filter (Plan 20-C-03)

       **Format**: Mitchell-2019 model card.
       **Status**: shipped (shadow mode); cutover gated by FP ≤ 5% (this card) + 20-C-04 F1 ≥ 0.6.

       ## Intended use

       Down-weight (NOT silence) StockTwits messages from authors that match the
       Cresci-2019 bot-like profile pattern, and surface a `coordinated_posting`
       warning when MinHash + LSH detects a ≥50-message cluster with avg
       Jaccard ≥ 0.7 in a rolling 24h window.

       Flagged messages REMAIN displayed in the UI (T-20-C-03-05 weaponization
       defense); only their aggregation weight is reduced to zero when
       FEATURE_BOT_FILTER='on'.

       ## Training data + parameter origin

       - **Cresci et al. 2019** "Cashtag piggybacking: Uncovering spam and bot
         activity in stock microblogs on Twitter" — 41M tweets, ~6% bot rate.
         Source of the 4 heuristic thresholds: account age < 30d, cosine > 0.5,
         pump density > 0.1, hashtag count > 5.
       - **Nam & Yang 2023** "Detecting pump-and-dump schemes on financial
         social media" — F1 = 0.67 from posts alone, sensitivity 85% /
         specificity 99%. Source of the coordination-detection target metrics.
       - **PUMP_PHRASES (9 entries)** — derived from Cresci 2019 Table 2 +
         WSB slang corpus 2020-2024. Quarterly review procedure documented
         under §Maintenance.
       - **MinHash params (128 perm, 16 bands × 8 rows)** — Broder 1997 +
         Leskovec/Rajaraman/Ullman Ch. 3.4; threshold ≈ (1/16)^(1/8) ≈ 0.707
         matches the 0.7 detection target.

       ## Evaluation metrics

       <!-- SPOT-CHECK-LOG -->

       Latest `npm run eval-bot-fp` output is appended below this marker by
       scripts/eval-bot-fp.ts on every run. Target: fp_rate ≤ 0.05 on the
       100-author labeled set at tests/golden-tickers/_bot_labels.json.

       Forward-reference: 20-C-04 measures F1 of `detectCoordinatedPosting` on
       a broader synthetic eval set; target F1 ≥ 0.6.

       ## Intended out-of-distribution behavior

       - **Slang drift**: PUMP_PHRASES list ages out as community slang shifts.
         Quarterly review re-evaluates the list against the trailing 90d
         StockTwits sample. Updates require a new model_version in the
         20-Z-01 SentimentObservation store (S2 immutability).
       - **Re-quotes / news repetition**: a single high-cosine score on a
         non-pump-tagged human user MAY trigger 'high_self_similarity'.
         Documented as a known FP source; the 100-author FP eval gates this.
       - **Journalists / satire**: documented in §Known failure modes;
         appeal mechanism is the operator allow-list under 20-C-03-FOLLOWUP.

       ## Known failure modes

       1. Re-quoting / press-release citation can trip `high_self_similarity`.
          Mitigation: aggregator AFFECTS WEIGHT not VISIBILITY; appeal path documented.
       2. MinHash false matches at ≤0.10 empirical pair-collision rate.
          Mitigation: ≥50-message cluster requirement, not 2-3 duplicates.
       3. Slang drift on PUMP_PHRASES.
          Mitigation: quarterly review documented in §Maintenance.
       4. Cultural bias: WSB slang skews toward US-English retail.
          Mitigation: documented; non-US tickers will benefit from a separate
          PUMP_PHRASES corpus in a future phase (filed as backlog candidate).

       ## Appeal & override mechanism

       1. Operator manually inspects a flagged author via the StockTwits
          public profile URL.
       2. If FP confirmed, the operator files a 20-C-03-FOLLOWUP plan to:
          - add author_id_hash to a manual `allow_list_bot_filter` table
            (new table), AND
          - file the case in the spot-check log section below for
            quarterly review.
       3. Filter affects WEIGHT not VISIBILITY — even pre-appeal, the
          flagged message remains displayed in the UI.

       ## Maintenance

       - Quarterly: re-sample 25 of the 100-author labeled set; if FP on
         re-sampled subset > 0.07, file a new full labeling round and bump
         model_version.
       - Per-PR: `npm run eval-bot-fp` runs in CI; PR blocked if fp_rate > 0.05.
       - On HYPERPARAMETERS.md change: model_version bumps; existing
         BotFilterFlag rows remain valid under their old model_version
         (S2 immutability).

       ## Citations

       - Cresci, S., Lillo, F., Regoli, D., Tardelli, S., & Tesconi, M. (2019).
         "Cashtag piggybacking: Uncovering spam and bot activity in stock
         microblogs on Twitter." ACM TWEB 13(2).
       - Nam, S., & Yang, J. (2023). "Detecting pump-and-dump schemes on
         financial social media." Decision Support Systems 165.
       - Broder, A. (1997). "On the resemblance and containment of documents."
         IEEE SEQUENCES.
       - Leskovec, J., Rajaraman, A., & Ullman, J. (2014). "Mining of Massive
         Datasets" 2nd ed., Ch. 3 (Finding Similar Items).
       - Mitchell, M., et al. (2019). "Model Cards for Model Reporting."
         FAT* '19.
       ```

    2. Append to `HYPERPARAMETERS.md` (do NOT modify existing sections):

       ```markdown

       ## bot_filter (Plan 20-C-03)

       | param | value | source |
       |---|---|---|
       | MIN_ACCOUNT_AGE_DAYS | 30 | Cresci 2019 §3.2 |
       | MAX_SELF_SIMILARITY | 0.5 | Cresci 2019 §3.2 |
       | MAX_PUMP_DENSITY | 0.1 | Cresci 2019 Table 2 |
       | MAX_HASHTAG_COUNT | 5 | Cresci 2019 §3.2 |
       | MINHASH_NUM_PERM | 128 | Broder 1997 / LRU Ch. 3.4 |
       | LSH_BANDS | 16 | bands × rows = num_perm (16 × 8 = 128) |
       | LSH_ROWS | 8 | threshold ≈ (1/16)^(1/8) ≈ 0.707 |
       | COORDINATION_SIMILARITY | 0.7 | LRU Ch. 3.4 closed-form |
       | COORDINATION_MIN_CLUSTER_SIZE | 50 | T-20-C-03-04 mitigation (FP-protection) |
       | FP_GATE | 0.05 | Plan 20-C-03 acceptance criterion (CONTEXT.md line 126) |
       ```

    3. Create `tests/integration/bot-filter.integration.test.ts` (live-Neon):

       ```typescript
       import { describe, it, expect, beforeAll, afterAll } from 'vitest';
       import { prisma } from '@/lib/db';
       import { cresciBotScore } from '@/lib/sentiment/bot-filter';
       import { detectCoordinatedPosting } from '@/lib/sentiment/coordination';

       const TEST_TICKER = `TEST20C03_${Date.now()}`;
       const TEST_AUTHOR_PREFIX = `sha256:test20c03-${Date.now()}-`;

       beforeAll(async () => {
         if (!process.env.DATABASE_URL) throw new Error('Integration test requires DATABASE_URL');
       });

       afterAll(async () => {
         await prisma.botFilterFlag.deleteMany({ where: { ticker: TEST_TICKER } });
         await prisma.coordinationCluster.deleteMany({ where: { ticker: TEST_TICKER } });
         await prisma.$disconnect();
       });

       describe('BotFilterFlag — live-Neon writes', () => {
         it('persists a flag row from a synthetic young-account author', async () => {
           const result = cresciBotScore({
             account_age_days: 5,
             messages: ['nothing suspicious here'],
             hashtag_counts: [0],
           });
           expect(result.is_bot).toBe(true);
           expect(result.reason).toBe('young_account');
           const row = await prisma.botFilterFlag.create({
             data: {
               author_id: `${TEST_AUTHOR_PREFIX}young`,
               ticker: TEST_TICKER,
               account_age_days: 5,
               max_text_cosine_similarity: result.features.max_text_cosine_similarity,
               pump_phrase_density: result.features.pump_phrase_density,
               hashtag_count_max: result.features.hashtag_count_max,
               is_bot_flagged: true,
               bot_reason: 'young_account',
             },
           });
           expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
         });

         it('mixed 24h fixture flags correct subset', async () => {
           // 1 bot (young+pump) + 1 clean human → exactly 1 flagged
           const bot = cresciBotScore({ account_age_days: 5, messages: ['rocket to the moon 100x'], hashtag_counts: [9] });
           const human = cresciBotScore({ account_age_days: 1500, messages: ['I have been holding AAPL since 2010.'], hashtag_counts: [0] });
           expect(bot.is_bot).toBe(true);
           expect(human.is_bot).toBe(false);
         });
       });

       describe('CoordinationCluster — synthetic 50-message pump', () => {
         it('fires is_flagged=true on a 50-message near-duplicate pump fixture', async () => {
           const base = 'GME to the moon 100x rocket buy now ';
           const messages = Array.from({ length: 60 }, (_, i) => ({
             id: `synth-${i}`,
             text: `${base}variation${i % 4}`,
           }));
           const cluster = detectCoordinatedPosting(
             TEST_TICKER,
             new Date(Date.now() - 86_400_000),
             new Date(),
             messages,
           );
           expect(cluster).not.toBeNull();
           expect(cluster!.is_flagged).toBe(true);
           expect(cluster!.cluster_size).toBeGreaterThanOrEqual(50);
           const row = await prisma.coordinationCluster.create({
             data: {
               ticker: cluster!.ticker,
               window_start: cluster!.window_start,
               window_end: cluster!.window_end,
               n_messages: cluster!.n_messages,
               similarity_threshold: cluster!.similarity_threshold,
               cluster_size: cluster!.cluster_size,
               is_flagged: cluster!.is_flagged,
               member_ids: cluster!.member_ids,
             },
           });
           expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
         });

         it('returns null on 30 disjoint messages (below MIN_CLUSTER_SIZE)', async () => {
           const messages = Array.from({ length: 30 }, (_, i) => ({
             id: `nodup-${i}`,
             text: `unique message number ${i} discussing different stocks ${'xyz'.repeat(i % 5)}`,
           }));
           const cluster = detectCoordinatedPosting(
             TEST_TICKER,
             new Date(Date.now() - 86_400_000),
             new Date(),
             messages,
           );
           expect(cluster).toBeNull();
         });

         it('cron wall-clock budget — 1000-message detect finishes in < 5s (proxy for 3min full-watchlist budget)', async () => {
           const messages = Array.from({ length: 1000 }, (_, i) => ({
             id: `perf-${i}`,
             text: `perf test message ${i} ${Math.random()}`,
           }));
           const t0 = Date.now();
           detectCoordinatedPosting(TEST_TICKER, new Date(0), new Date(), messages);
           const elapsed = Date.now() - t0;
           expect(elapsed).toBeLessThan(5000);
         });
       });
       ```

    4. Run the full suite:
       ```bash
       npm test
       npm run test:integration -- bot-filter
       npm run eval-bot-fp
       npm run check-immutability   # confirms no SentimentObservation UPDATE was introduced
       npx tsc --noEmit
       ```

    5. Stage and commit. Commit message:
       ```
       feat(20-c-03): Cresci-2019 bot filter + MinHash coordination detection

       Adds per-author Cresci heuristics (account age, self-similarity, pump
       density, hashtag spam) and aggregate-level MinHash + banding LSH
       (128 perm, 16 bands × 8 rows, threshold 0.7, min cluster 50) to defend
       the sentiment aggregate against the bot/coordination patterns documented
       in Cresci et al. 2019 + Nam & Yang 2023.

       Two immutable Prisma models added (BotFilterFlag, CoordinationCluster).
       Persistence runs unconditionally; the consumer-side weight gate is
       behind FEATURE_BOT_FILTER three-mode flag (off|shadow|on) — cutover
       gated by this plan's FP ≤ 5% on a 100-author labeled set
       (`npm run eval-bot-fp`) AND 20-C-04's coordinated_posting F1 ≥ 0.6.

       Defenses shipped:
         - FP eval gate ≤ 0.05 on 100-author labeled set (T-20-C-03-01)
         - PUMP_PHRASES quarterly review documented (T-20-C-03-02)
         - Cosine threshold + cluster-size floor documented (T-20-C-03-03)
         - MinHash collision rate < 0.10 empirically (T-20-C-03-04)
         - Filter affects WEIGHT not VISIBILITY — flagged messages still
           render in UI; appeal mechanism documented in model card
           (T-20-C-03-05 weaponization defense)

       Maps to phase threat catalog T-28-001 (bot/coordination floods).

       Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
       ```

       Stage specifically:
       ```bash
       git add prisma/schema.prisma \
               src/lib/sentiment/bot-filter.ts \
               src/lib/sentiment/coordination.ts \
               src/lib/sentiment/aggregator.ts \
               src/app/api/cron/sentiment-scan/route.ts \
               src/components/ResearchReport.tsx \
               src/lib/features.ts \
               scripts/eval-bot-fp.ts \
               tests/golden-tickers/_bot_labels.json \
               tests/golden-tickers/_bot_labels.RUNBOOK.md \
               tests/golden-tickers/_bot_fixtures.json \
               HYPERPARAMETERS.md \
               docs/cards/MODEL-CARD-bot-filter.md \
               package.json \
               tests/sentiment/bot-filter.unit.test.ts \
               tests/sentiment/coordination.unit.test.ts \
               tests/sentiment/bot-filter-aggregator.unit.test.ts \
               tests/integration/bot-filter.integration.test.ts \
               tests/components/research-report-bot-filter.unit.test.tsx
       git commit -m "..."
       ```
  </action>
  <acceptance_criteria>
    - `test -f docs/cards/MODEL-CARD-bot-filter.md`
    - `grep -c "Cresci" docs/cards/MODEL-CARD-bot-filter.md` returns `>= 2`
    - `grep -c "Nam.*Yang" docs/cards/MODEL-CARD-bot-filter.md` returns `>= 1`
    - `grep -c "## bot_filter" HYPERPARAMETERS.md` returns `1`
    - `grep -c "MINHASH_NUM_PERM" HYPERPARAMETERS.md` returns `1`
    - `grep -c "FP_GATE" HYPERPARAMETERS.md` returns `1`
    - `grep -c "it(" tests/integration/bot-filter.integration.test.ts` returns `>= 5`
    - `npm run test:integration -- bot-filter` exits 0
    - `npm test` exits 0
    - `npm run eval-bot-fp` exits 0
    - `npm run check-immutability` exits 0
    - `npx tsc --noEmit` exits 0
    - `git log -1 --pretty=%s` matches `^feat\(20-c-03\):`
    - `git log -1 --pretty=%B | grep -c "T-20-C-03-"` returns `>= 5` (all five threats referenced)
  </acceptance_criteria>
  <verify>
    <automated>npm test && npm run test:integration -- bot-filter && npm run eval-bot-fp && npx tsc --noEmit && git log -1 --pretty=%s | grep -q "^feat(20-c-03)"</automated>
  </verify>
  <done>Model card + HYPERPARAMETERS.md subsection + integration test (≥5 cases) + commit landed referencing all five plan-level threats; full suite green</done>
</task>

</tasks>

<verification>

Plan-level numerical acceptance (rolls up the per-task `<acceptance_criteria>`):

- [ ] `npm run test:integration -- bot-filter` exits 0
- [ ] `npm run eval-bot-fp` exits 0 (fp_rate ≤ 0.05 on 100-author labeled set)
- [ ] `psql "$DATABASE_URL" -c 'SELECT COUNT(*) FROM "bot_filter_flags"'` returns `>= 0` immediately; `>= 100` after 7d of cron operation (recorded in 20-C-03-SUMMARY.md, not a CI gate)
- [ ] `psql "$DATABASE_URL" -c '\d "bot_filter_flags"' | grep -c "idx_botflag_"` returns `>= 2`
- [ ] `psql "$DATABASE_URL" -c '\d "coordination_clusters"' | grep -c "idx_coordcluster_"` returns `>= 1`
- [ ] `grep -c "// PIT-INVARIANT" prisma/schema.prisma` returns `>= 3` (2 new from 20-C-03 + ≥1 from 20-Z-01)
- [ ] `grep -c "prisma.botFilterFlag.update\|prisma.botFilterFlag.upsert\|prisma.coordinationCluster.update\|prisma.coordinationCluster.upsert" src/` returns `0` (insert-only invariant propagated from 20-Z-01)
- [ ] `grep -c "prisma.sentimentSnapshot.create" src/app/api/cron/sentiment-scan/route.ts` returns `1` (existing writer untouched)
- [ ] `grep -c "insertObservation(" src/app/api/cron/sentiment-scan/route.ts` returns `>= 1` (20-Z-01 writer untouched)
- [ ] `node -e "const a=require('./tests/golden-tickers/_bot_labels.json'); process.exit(a.length===100?0:1)"` exits 0
- [ ] `grep -c "MINHASH_NUM_PERM = 128" src/lib/sentiment/coordination.ts` returns `1`
- [ ] `grep -c "LSH_BANDS = 16" src/lib/sentiment/coordination.ts` returns `1`
- [ ] `grep -c "LSH_ROWS = 8" src/lib/sentiment/coordination.ts` returns `1`
- [ ] PUMP_PHRASES list deep-equal asserts EXACTLY 9 entries in unit test
- [ ] `npm test` exits 0
- [ ] `npm run test:e2e` exits 0
- [ ] Phase-20 cross-cutting standard S8 satisfied: zero adjectives in any DONE clause above

Cutover gates (held by the SHADOW lifecycle — NOT shipped in this plan, executed by 20-C-03-FOLLOWUP at cutover time):
- [ ] ≥7 calendar days of FEATURE_BOT_FILTER=shadow operation
- [ ] FP gate green: `npm run eval-bot-fp` exit 0 (this plan ships the gate)
- [ ] Coordinated_posting F1 ≥ 0.6 on synthetic eval (FORWARD-REFERENCE: 20-C-04 measures it; this plan ships the detector function 20-C-04 will measure)
- [ ] Per-source weight delta ≤ 30% mean absolute change vs naive aggregator on 14d shadow window

</verification>

<success_criteria>

1. **Detection live**: A real cron tick has written ≥1 `BotFilterFlag` row AND `bot_filter_flags` continues to accumulate at the watchlist cadence; an empty `coordination_clusters` table is acceptable on day 1 (no GME-class event in the trailing 24h) but the integration test confirms the path fires on the 50-message synthetic fixture.
2. **FP gate enforced**: `npm run eval-bot-fp` exits 0 on the committed 100-author labeled set (fp_rate ≤ 0.05). Model card spot-check log updated.
3. **PIT invariant codified**: Both new tables carry `// PIT-INVARIANT` markers on `computed_at`; 20-Z-07 reads them the same way it reads SentimentObservation.fetched_at.
4. **Immutability propagated**: `npm run check-immutability` still exits 0; no UPDATE/UPSERT call exists on the new tables either (the script's scan pattern is generalizable; 20-C-03-FOLLOWUP may extend its scope to the new tables, but the existing convention already prohibits the UPDATEs).
5. **Weaponization defense codified**: SentimentIntelligenceCard RTL test asserts flagged messages REMAIN in the rendered message list (T-20-C-03-05); aggregator affects WEIGHT not VISIBILITY.
6. **Existing paths untouched**: pre-existing `SentimentSnapshot` writer + 20-Z-01 `insertObservation` writer both unchanged (`grep -c "prisma.sentimentSnapshot.create" route.ts == 1` AND `grep -c "insertObservation(" route.ts >= 1`).
7. **Citations in place**: MODEL-CARD-bot-filter.md cites Cresci 2019 + Nam & Yang 2023 + Broder 1997 + LRU Ch. 3.4. HYPERPARAMETERS.md records all 10 literal hyperparameters with their source.
8. **Cutover ordering**: Shadow lifecycle is alive; cutover to 'on' is gated on (this plan's FP eval) AND (20-C-04's F1 ≥ 0.6) — the cutover ACT itself is filed as 20-C-03-FOLLOWUP at cutover time per the S3 hard-cleanup-gate ratchet.
9. **No scope creep**: This plan does NOT ship — pump-and-dump cluster detection at the aggregate level (20-C-04), per-source ICIR (20-C-01), fairness audit (20-C-06), per-aspect tagging (20-B-01/05), time decay (20-A-03), or anything outside per-author Cresci scoring + MinHash cluster detection + 100-author FP eval + UI subtext.

</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-C-03-SUMMARY.md` documenting:
- Final committed SHA + commit message
- `npm run eval-bot-fp` output (tp / fp / tn / fn / precision / recall / fp_rate)
- `psql` row counts for `bot_filter_flags` and `coordination_clusters` at t=0 (post-push) and t=7d (post-cron-soak)
- Empirical MinHash collision rate from the 10K-pair unit test
- Confirmation that 20-C-04 can build against `detectCoordinatedPosting` for its F1 ≥ 0.6 measurement
- Confirmation that 20-C-06 fairness audit can stratify by `bot_reason` enum on `bot_filter_flags`
- Any deviations from this plan (none expected — but record explicitly if any)
- Pointer to 20-C-03-FOLLOWUP (cutover plan, filed AT cutover time per S3 hard-cleanup-gate)
</output>
