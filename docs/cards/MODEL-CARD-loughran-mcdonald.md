---
model_name: loughran-mcdonald
model_version: loughran-mcdonald-2011
card_format: mitchell-2019
last_validated: 2026-05-13
retrain_cadence: P365D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/sentiment/lm-classifier.ts
---

# Model Card: loughran-mcdonald

> **Schema**: Mitchell et al. 2019 — *Model Cards for Model Reporting*, FAT* '19. https://arxiv.org/abs/1810.03993
> **PII Policy**: redact handles, usernames, message bodies. Reference Plan 20-Z-01's author-features allowlist (`account_age_days`, `follower_count`, `is_verified`, `message_count_30d`). For any per-message sample, hash via `sha256Hex` per 20-Z-01's DAO. Examples MUST use synthetic or aggregated values only.

## 1. Model Details

- **Person or organization developing the model**: Tim Loughran and Bill McDonald, University of Notre Dame. Distributed via the Software Repository for Accounting and Finance (SRAF). Cipher operates the dictionary as a pure-function bag-of-words classifier in `src/lib/sentiment/lm-classifier.ts`.
- **Model date**: original 2011; dictionary republished annually. Current revision shipped in `data/lexicons/loughran-mcdonald.csv` is the 1993-2025 master, downloaded 2026-05-13 from the SRAF page.
- **Model version**: `loughran-mcdonald-2011`. The pinned constant `LM_CLASSIFIER_VERSION` is bumped to `loughran-mcdonald-{year}` only when refreshing the CSV per `data/lexicons/README.md` refresh procedure.
- **Model type**: finance-specific sentiment lexicon (bag-of-words). No probabilistic training. Cipher's classifier counts positive vs. negative dictionary matches with within-3-token negation handling.
- **Training algorithms, parameters, fairness constraints**: N/A — lexicon, not a learned model. Authors curated the word lists by hand-coding the 10-K corpus 1994-2008 (L&M 2011 §III).
- **Paper or other resource**: Loughran, Tim and Bill McDonald. 2011. "When is a Liability not a Liability? Textual Analysis, Dictionaries, and 10-Ks." *Journal of Finance* 66(1): 35-65. https://doi.org/10.1111/j.1540-6261.2010.01625.x
- **Citation details**: Loughran, T. and McDonald, B. (2011). When is a Liability not a Liability? Textual Analysis, Dictionaries, and 10-Ks. *Journal of Finance*, 66(1), 35-65.
- **License**: Free for academic research; commercial licensing requires contacting `loughranmcdonald@gmail.com`. See `data/lexicons/README.md` for full attribution.
- **Where to send questions or comments**: Cipher project owner `tjameswalsh@icloud.com`; SRAF for upstream lexicon questions.

## 2. Intended Use

- **Primary intended uses**: **EMERGENCY FALLBACK ONLY** — last-resort sentiment classifier in the per-message NLP chain when Gemini per-document classification, the FinBERT-HF endpoint, AND @xenova/transformers local inference all fail. Activates as tier 3 of the 4-tier fallback chain in `src/lib/sentiment/per-message-pass.ts` (FinBERT-HF → @xenova → L&M → null).
- **Primary intended users**: Cipher internal sentiment-aggregation pipeline (20-B-04 source-tier weighting consumes the scores). End-users see L&M scores only via the aggregated AnalysisResult sentiment block; the `nlp_path='l&m-fallback'` tag surfaces on `/insights/sentiment-health` for operators.
- **Out-of-scope use cases**: Not for primary sentiment classification — confidence floor (0.4) is below the threshold most downstream consumers gate on. Not for non-finance text (Twitter slang, emoji, non-English). Not for sentence-level NLP where syntax matters (irony, sarcasm, complex multi-clause).

## 3. Factors

- **Relevant factors**: English-language only; finance/business text; 10-K filing vocabulary (formal corporate prose). Social-media slang, emoji, hashtags, and non-finance terms are out-of-distribution.
- **Evaluation factors**: confidence floor invariance (all inputs); polarity contracts (positive / negative / neutral); tokenization edge cases (hyphens, contractions, currency); negation handler within 3-token window.

## 4. Metrics

- **Model performance measures**: N/A — bag-of-words classifier has no probabilistic outputs to calibrate. Confidence is HARDCODED at 0.4 (literature default per L&M 2011 §IV reflecting "lexicon-only, no probabilistic calibration possible"). The score itself is `(positive_matches - negative_matches) / max(token_count, 1) ∈ [-1, +1]`.
- **Decision thresholds**: none — Cipher's downstream aggregator (20-B-04) weights by confidence, so the 0.4 floor naturally down-weights L&M signals relative to higher-confidence Gemini / FinBERT scores.
- **Variation approaches** (CIs, bootstrap): N/A — deterministic bag-of-words; identical input always yields identical output.

## 5. Evaluation Data

- **Datasets**: 23 canonical fixtures in `tests/sentiment/lm-classifier.unit.test.ts` covering five behavior categories (confidence floor, polarity, tokenization, negation, empty). Integration test in `tests/integration/lm-fallback.integration.test.ts` exercises the full fallback chain against live Neon.
- **Motivation**: numeric acceptance per CONTEXT.md §S8 — no adjective-based criteria. Each fixture asserts an exact equality, inequality, or range.
- **Preprocessing**: lowercase; strip punctuation except internal hyphens and apostrophes; split on whitespace.

## 6. Training Data

- **Datasets**: L&M 2011 Master Dictionary (Notre Dame SRAF), `Loughran-McDonald_MasterDictionary_1993-2025.csv`, 86,553 rows. Originally hand-coded by Loughran & McDonald against the 10-K filing corpus 1994-2008 then maintained annually.
- **Distribution / demographics**: US-listed public-company 10-K filings. Vocabulary is formal corporate prose. Underrepresents international, non-corporate, and casual-register text.

## 7. Quantitative Analyses

- **Unitary results** (per-factor):
  - Confidence floor: 0.4 for every input length, polarity, and matched-words count (asserted across 5 fixture cases).
  - Polarity: positive L&M words (strong, improvement, profitable, gains) → score > 0; negative L&M words (weak, losses, hurt, decline) → score < 0; non-flagged inputs → score = 0.
  - Tokenization: case-insensitive; currency symbols stripped; internal hyphens / apostrophes preserved.
  - Negation: within-3-token window for `not`/`no`/`never` flips polarity of next polarity-bearing word.
- **Intersectional results**: N/A — no demographic factors.

## 8. Ethical Considerations

- **Data sensitivity**: zero PII. L&M lexicon is open-licensed published research data from a peer-reviewed Notre Dame source; contains only common English finance vocabulary.
- **Risks and harms**: low — confidence floor (0.4) caps downstream impact; the classifier ships only to the internal aggregator, never directly to user-facing reports.
- **Use cases that raise concern**: applying T-scaling (20-B-03 temperature calibration) would silently re-weight a non-probabilistic score and is explicitly forbidden — see §9.

## 9. Caveats and Recommendations

- **Known limitations**:
  - Confidence is HARDCODED at 0.4 — never elevates regardless of input.
  - 20-B-03 temperature scaling MUST NOT be applied (T-scaling assumes probabilistic classifier; bag-of-words has no calibration target).
  - Bag-of-words misses irony, sarcasm, multi-clause sentences, and negation outside the 3-token window.
  - L&M deliberately excludes generic words like `revenue`, `beat`, `lawsuit`, `liability` because in 10-K context they are domain-neutral (the paper's central finding). So inputs that mention these terms without other L&M-flagged words score 0, not "positive" or "negative".
- **Recommendations for future work**:
  - When degradation_rate_24h > 5% sustained → investigate failing upstream (HF endpoint, @xenova process memory). See §11 runbook.
  - Refresh annually when SRAF republishes — see `data/lexicons/README.md`.
  - Consider per-aspect L&M extensions (uncertainty / litigious / constraining columns are loaded but unused by `classifyByLM`; could power a separate "uncertainty score" classifier in a future plan).

## 10. Out-of-Distribution (OOD) Behavior — *Cipher extension*

- **Known OOD inputs that degrade the score**: emoji-heavy social-media text; non-English; pure-numeric / currency-only inputs (score = 0, matched_words = 0); inputs with negation outside the 3-token window; sarcastic statements where surface words conflict with intent.
- **Detection mechanism**: `matched_words` field on the return shape — if `matched_words == 0` on a non-empty input, the score is mechanically 0 and downstream consumers can treat it as a low-information signal independent of the 0.4 confidence floor.

## 11. Known Failure Modes — *Cipher extension*

- **Failure mode 1: Negation outside the 3-token window.** "Margins are not what they should be — we are seeing genuinely deteriorating performance, but the language used by management is not bullish overall." Here "not bullish" is more than 3 tokens past "bullish"; the negation handler will not catch it. Documented as accepted limitation (T-20-B-06-02 mitigation: 3-token window per L&M 2011 §III.D + Hutto-Gilbert 2014 VADER convention).
- **Failure mode 2: Sustained upstream outage.** If both FinBERT-HF and @xenova local fail for >5% of NLP calls over 24h, L&M takes the load and the system silently degrades to lexicon-only signals. The cost-budget cron (`/api/cron/cost-budget-check`) emits `degradation_alert` when this happens; runbook below.

### Failure Mode Runbook (T-20-B-06-04)

1. Open `/insights/sentiment-health`. The top-of-page `DegradationRateTile` shows the current 24h rate; tile is red when > 5%.
2. Inspect per-provider rows for the failing upstream:
   - If `finbert-hf` shows elevated `error_rate` → check HF status page; if endpoint cold-started, wait 5min and retry.
   - If `xenova-local` (when 20-B-02 ships) shows latency or OOM → restart the server process; the @xenova model is ~440MB lazy-loaded.
3. If both upstreams look healthy but L&M still fires → trace `src/lib/sentiment/per-message-pass.ts` call graph (likely a recent code change shifted the tier-1 / tier-2 routing).
4. After upstream recovers, the rate naturally decays back below 5% over the next 24h window.

## 12. Retrain Cadence — *Cipher extension*

- **Cadence**: P365D (matches frontmatter `retrain_cadence`). Notre Dame SRAF republishes the Master Dictionary annually.
- **Trigger conditions**:
  - `scripts/check-lm-lexicon-age.ts` exits 1 (CSV mtime > 365 days).
  - SRAF publishes a new revision year (manual check at https://sraf.nd.edu/loughranmcdonald-master-dictionary/).
  - Manual refresh on demand if a known important word is missing.
- **Owner**: Cipher project owner `tjameswalsh@icloud.com`. Refresh procedure documented step-by-step in `data/lexicons/README.md`.
