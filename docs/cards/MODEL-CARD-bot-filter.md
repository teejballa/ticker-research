---
model_name: bot-filter
model_version: cresci-2019-v1
card_format: mitchell-2019
last_validated: 2026-05-12
retrain_cadence: P90D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/sentiment/bot-filter.ts
  - src/lib/sentiment/coordination.ts
  - scripts/eval-bot-fp.ts
---

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

## eval-bot-fp run @ 2026-05-13T06:37:21.834Z

| metric | value |
|---|---|
| tp | 50 |
| fp | 0 |
| tn | 50 |
| fn | 0 |
| fp_rate | 0.0000 |
| precision | 1.0000 |
| recall | 1.0000 |

FP by reason: {"young_account":{"fp":0,"tp":13},"high_self_similarity":{"fp":0,"tp":13},"pump_density":{"fp":0,"tp":12},"hashtag_spam":{"fp":0,"tp":12},"clean":{"fp":0,"tp":0}}

Gate: fp_rate ≤ 0.05 → PASS



## eval-bot-fp run @ 2026-05-13T06:35:06.910Z

| metric | value |
|---|---|
| tp | 50 |
| fp | 0 |
| tn | 50 |
| fn | 0 |
| fp_rate | 0.0000 |
| precision | 1.0000 |
| recall | 1.0000 |

FP by reason: {"young_account":{"fp":0,"tp":13},"high_self_similarity":{"fp":0,"tp":13},"pump_density":{"fp":0,"tp":12},"hashtag_spam":{"fp":0,"tp":12},"clean":{"fp":0,"tp":0}}

Gate: fp_rate ≤ 0.05 → PASS



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
