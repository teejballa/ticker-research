---
model_name: SentimentObservation
model_version: v1.0.0-20-Z-01
card_format: gebru-2018
last_validated: 2026-05-10
retrain_cadence: P180D
author: tjameswalsh@icloud.com
source_files:
  - prisma/schema.prisma
  - src/lib/sentiment/observation-store.ts
---

# Dataset Card: SentimentObservation

> **Schema**: Gebru et al. 2018 — *Datasheets for Datasets*. https://arxiv.org/abs/1803.09010
> **PII Policy**: redact handles, usernames, message bodies. Reference Plan 20-Z-01's author-features allowlist (`account_age_days`, `follower_count`, `is_verified`, `message_count_30d`). For any per-message sample, hash via `sha256Hex` per 20-Z-01's DAO. Examples MUST use synthetic or aggregated values only.

## 1. Motivation

- **For what purpose was the dataset created?**: To provide row-level immutable point-in-time (PIT) snapshots for Phase 20's calibration work — Plan 20-A-03 (exponential time decay), Plan 20-A-01 (dispersion / `crowded_consensus`), Plan 20-B-01 (Gemini per-document NLP), Plan 20-B-04 (source-tier weighting), and Plan 20-C-01 (per-source rolling ICIR). The vendor-tagged `bull_pct` from the pre-existing `SentimentSnapshot` table rolls up to too coarse a grain (ticker × cron-tick) for any of these tasks.
- **Who created the dataset and on behalf of which entity?**: Cipher project owner (TJ Walsh, tjameswalsh@icloud.com). The dataset is created BY the Cipher project, FOR the Cipher project — there is no external sponsor.
- **Who funded the creation of the dataset?**: the Cipher project itself (no external funding).

## 2. Composition

- **What do the instances represent?**: each instance is ONE upstream message (sourced from stocktwits / reddit / x / news / sec / apewisdom / firecrawl) classified under ONE `(classifier_version, model_version)` tuple. The dataset is append-only — re-classification under a new `model_version` creates a NEW row, never overwrites an existing row (S2 immutability invariant from Plan 20-Z-01).
- **How many instances?**: estimated ~4.5M rows per year at current production rate (50 tickers × ~100 messages/day across all sources × ~10 model_version retraining cycles per year). Steady-state row count grows monotonically — there is no deletion policy short of Phase-27 partitioning.
- **Does the dataset contain all possible instances or a sample?**: captures every message Cipher OBSERVES via its cron-driven sentiment scan; it is NOT a sample of all messages on the upstream platforms (StockTwits / Reddit / X all rate-limit and paginate). The dataset is the union of "messages Cipher has fetched and successfully classified at least once."
- **What data does each instance consist of?** (columns, from `prisma/schema.prisma`):
  - `id` — synthetic primary key.
  - `ticker` — ticker symbol (e.g., `AAPL`).
  - `source` — upstream platform identifier.
  - `message_id` — upstream-platform-scoped message ID (composite-unique with ticker + model_version).
  - `fetched_at` — **PIT-INVARIANT** timestamp; the ONLY backtest-safe join key (see §5 "should NOT be used").
  - `published_at` — informational only; upstream platforms may revise this field, so it MUST NOT be used as a backtest join key.
  - `raw_body_hash` — sha256 hex of the raw message body. Raw text NEVER persisted (T-20-Z-01-02).
  - `classifier_version` — pinned classifier identifier (e.g., `ProsusAI/finbert@<sha>` or `gemini-pro-1.5@<date>`).
  - `classifier_score` — model output score.
  - `decay_weight` — exponential time-decay weight (set later by Plan 20-A-03 via NEW model_version).
  - `author_id` — hashed handle: `sha256("{source}:{handle}")`.
  - `author_features_snapshot` — JSON containing ONLY the ALLOWLISTED keys per Plan 20-Z-01 T-20-Z-01-01: `account_age_days`, `follower_count`, `is_verified`, `message_count_30d`. Any non-allowlisted key throws at DAO entry.
  - `model_version` — re-classification version; part of the composite-unique key.
- **Is there a label or target?**: there is no explicit human label. The implicit target — for downstream calibration — is forward N-day alpha-vs-SPY (joined from `LearnedPattern` via `fetched_at` and ticker).
- **Is any information missing from individual instances?**: raw message body is INTENTIONALLY missing (PII / ToS-redistribution-safety per T-20-Z-01-02); only its sha256 hash is retained. Author handle is INTENTIONALLY hashed.
- **Are relationships between instances made explicit?**: yes — the composite unique constraint `(ticker, message_id, model_version)` makes the relationship explicit. Two rows that share `(ticker, message_id)` but differ in `model_version` represent the SAME upstream message re-classified under different model versions.
- **Are there recommended data splits?**: chronological split by `fetched_at` — train/validation/test ordered in time. Random k-fold cross-validation is FORBIDDEN because it leaks future information into the training fold (lookahead bias). Plan 20-Z-07 will land a regression test that flags any backtest joining on `published_at` instead of `fetched_at`.
- **Are there errors, sources of noise, or redundancies?**:
  - Vendor tag-semantics drift (see `MODEL-CARD-stocktwits-naive.md` §11).
  - Bot accounts (Cresci 2019 reports ~6% bot-share on StockTwits low-caps).
  - Duplicate message_ids across sources are possible (a Reddit post copied to X). The composite unique constraint does NOT collapse these — each `(source, message_id)` pair stands alone, and downstream consumers must dedup at query time if they want cross-source unique messages.
  - These are OBSERVABLE BIAS in the upstream platforms, NOT correctable noise in Cipher's pipeline.
- **Is the dataset self-contained or does it link to external resources?**: self-contained — no foreign-key links to third-party datasets. The only external dependency is the upstream platform (StockTwits / Reddit / X / etc.) that produced each message, and we store the hash + author_id only, not a URL pointer.
- **Does the dataset contain confidential or PII data?**: **NO RAW PII**. Per Plan 20-Z-01 T-20-Z-01-01 / T-20-Z-01-02:
  - Raw message bodies are NEVER persisted (only sha256 hash).
  - Author handles are hashed before storage (irreversible).
  - Author features are ALLOWLIST-filtered at the DAO entry point; any non-allowlisted key throws (`account_age_days`, `follower_count`, `is_verified`, `message_count_30d` are the only allowed keys).

## 3. Collection Process

- **How was the data acquired?**: via Phase 12+ cron jobs (`/api/cron/sentiment-scan`) that call third-party APIs (StockTwits public messages stream, Reddit via Firecrawl, X via Firecrawl, ApeWisdom public endpoint, Anthropic web search, Polygon, Finnhub).
- **What mechanisms or procedures were used?**: HTTPS API requests respecting each upstream's published rate-limit policy. Failed requests are retried with `withRetry` (Plan 19-B-02). Failed-after-retry requests drop the snapshot for that ticker × source × tick.
- **If the dataset is a sample from a larger set, what was the sampling strategy?**: rolling watchlist of 50 tickers; round-robin scan every cron tick. The watchlist itself rotates per Phase 9 multi-cap strategy. There is no probabilistic sampling — the dataset captures every message Cipher successfully fetches within rate-limit and pagination bounds.
- **Who was involved in the data collection process and how were they compensated?**: N/A — no human-subject collection. All data is collected via automated cron over public APIs.
- **Over what timeframe was the data collected?**: continuous from the date Plan 20-Z-01 ships its observation-store DAO (estimated 2026-05 onward). Cron cadence is configured per `vercel.json`.
- **Were ethical review processes conducted?**: No IRB review was sought. Public posts only; all upstream platforms have public-by-default ToS for the API endpoints used; no consent process is applicable. Per CONTEXT §S10, the dataset is NEVER published — it stays in production Neon Postgres scoped to the Cipher deployment.

## 4. Preprocessing / Cleaning / Labeling

- **Was any preprocessing/cleaning/labeling done?**: yes —
  - **Hashing**: raw body sha256 computed at DAO entry via `sha256Hex` in `src/lib/sentiment/observation-store.ts`; raw text is then discarded.
  - **Author handle hashing**: `sha256("{source}:{handle}")` → `author_id`. Source-prefix prevents cross-platform handle collisions.
  - **Allowlist filter**: author features are filtered through the four-key ALLOWLIST at DAO entry (T-20-Z-01-01). Non-allowlisted keys throw.
  - **Classifier pinning**: every row carries the exact `classifier_version` string (e.g., `ProsusAI/finbert@<sha>`) — no implicit "latest model" semantics.
- **Was the raw data saved in addition?**: **NO** — raw body is INTENTIONALLY discarded per T-20-Z-01-02. The sha256 hash is the only retained derivative.
- **Is the software used to preprocess available?**: yes — `src/lib/sentiment/observation-store.ts` (DAO) is open in this Cipher repo. The Prisma schema (`prisma/schema.prisma → model SentimentObservation`) defines the storage shape.

## 5. Uses

- **Has the dataset been used for any tasks already?**: as of 2026-05-10 the dataset is brand-new (Plan 20-Z-01 just shipped). The first uses will be Plans 20-A-03, 20-B-01, 20-B-04, 20-C-01, and 20-A-01 in Phase 20.
- **Is there a repository linking to all uses?**: yes — `.planning/phases/20-real-sentiment-analysis/` and especially `CONTEXT.md` enumerate every plan that consumes this dataset.
- **What other tasks could the dataset be used for?**: research on retail-sentiment dispersion across cap classes; replication of Cookson-Engelberg "Echo Chambers in Investor Information" (2023) on production data; per-source historical IC studies; bot-share epidemiology (Cresci 2019 replication).
- **Is there anything about the composition or collection that might bias future uses?**: yes — upstream platforms skew US-retail and bullish. Any tactical use of the dataset must be guarded by §6 of the per-classifier model cards (e.g., `MODEL-CARD-stocktwits-naive.md` §8 ethical-considerations block).
- **Are there tasks for which the dataset should NOT be used?**:
  - **Any per-handle or per-message PII analysis** — handles are hashed (irreversibly) for a reason; do not attempt to de-anonymize.
  - **Any backtest joining on `published_at`** — upstream sources may REVISE `published_at` retroactively (StockTwits is known to backfill timestamps when threads are re-categorized). Only `fetched_at` is PIT-INVARIANT. Plan 20-Z-07 lookahead-bias regression test enforces this.

## 6. Distribution

- **Will the dataset be distributed to third parties?**: **NO**. The dataset lives in production Neon Postgres scoped to the Cipher deployment.
- **How will the dataset be distributed?**: not distributed. Per CLAUDE.md "Research Output Storage", generated research artifacts (PDFs, sample reports) MUST NOT be committed to the repo; this dataset card describes a dataset that is similarly internal-only.
- **When will the dataset be distributed?**: not distributed. Per CONTEXT §S10 regulatory hygiene: Phase 20 does NOT publish public-per-user calibration data — that lives behind Phase 29's legal-counsel gate.
- **License or ToS**: project-internal. No external license applies because the dataset is not distributed.
- **Have any third parties imposed IP-based or other restrictions?**: yes — StockTwits / Reddit / X all impose ToS restrictions on bulk redistribution of raw content. Cipher mitigates by storing ONLY hashes + scores + features, NEVER raw text or handles.
- **Do any export controls or regulatory restrictions apply?**: none currently identified. Phase 29's legal-counsel review (CONTEXT §S10) will determine whether any per-user calibration output requires regulatory disclosure before publication.

## 7. Maintenance

- **Who is supporting/hosting/maintaining the dataset?**: Cipher project owner (TJ Walsh).
- **How can the maintainer be contacted?**: tjameswalsh@icloud.com.
- **Is there an erratum?**: yes — the erratum mechanism is "append-only schema migrations." Schema corrections create new `model_version` rows (per S2 immutability invariant); existing rows are NEVER mutated. The Prisma migration history in `prisma/migrations/` is the audit log.
- **Will the dataset be updated?**: continuously via `/api/cron/sentiment-scan`. Per the frontmatter `retrain_cadence: P180D`, the datasheet itself is re-validated every 180 days (next: 2026-11-06). The dataset content updates with every cron tick.
- **If others want to extend/augment/build on/contribute, is there a mechanism?**: yes — future plans (20-A-03, 20-B-01, 20-B-04, etc.) add new `model_version` values, and the composite unique on `(ticker, message_id, model_version)` enforces no overwrites. Schema changes go through normal Prisma migration review.
