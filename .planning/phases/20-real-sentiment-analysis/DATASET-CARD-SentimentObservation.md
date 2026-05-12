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

---

**Moved to: docs/cards/DATASET-CARD-SentimentObservation.md**

The full Gebru-2018 datasheet for `SentimentObservation` lives at `docs/cards/DATASET-CARD-SentimentObservation.md` per Plan 20-Z-02. This stub is preserved for traceability — it satisfies the 20-Z-01 frontmatter `must_haves` reference. All future updates land in the canonical card under `docs/cards/`.
