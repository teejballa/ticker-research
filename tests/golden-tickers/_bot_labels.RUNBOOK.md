# 100-Author Bot Labeling Runbook (Plan 20-C-03)

Operator runbook for curating `_bot_labels.json` + `_bot_fixtures.json`.
See `docs/cards/MODEL-CARD-bot-filter.md` for the model card that this
labeling exercise feeds.

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

## Fixture capture

For each labeled author, capture (and commit to `_bot_fixtures.json`):

- `author_id_hash` — same as label row
- `messages` — array of recent message bodies (last 5-20)
- `hashtag_counts` — per-message hashtag count, same length as messages
- `account_age_days` — derived from profile `created_at`

This ensures `scripts/eval-bot-fp.ts` runs deterministically offline.

## Appeal mechanism

Any author later identified as a false-positive can be added to a manual
allow-list (filed as a 20-C-03-FOLLOWUP plan). The labeling set itself
is immutable once committed (S2) — appeals create new labeled samples
with `labeled_at` post-dating the original.

## Quarterly review

Re-sample 25 of the 100 every quarter to detect drift; if FP rate
observed on the re-sampled subset exceeds 0.07, file a new labeling
round and bump model_version.

## Bootstrap fixture caveat

The initial 100-author set committed alongside 20-C-03 is a
SYNTHETIC bootstrap fixture generated from the Cresci-2019 paper's
canonical bot/human profile archetypes. It is **NOT** a production-data
sample. It exists ONLY to make `npm run eval-bot-fp` reproducible
offline before live `bot_filter_flags` rows accumulate.

Cutover from synthetic → live data is the FIRST operator action of the
shadow lifecycle (≥7 days into shadow operation, see frontmatter
`cutover_criteria`). Until then, the synthetic FP rate is an
infrastructure smoke test, not a calibration verdict.
