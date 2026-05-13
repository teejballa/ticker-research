# Lexicons

Static, license-attributed reference data used by Cipher's sentiment classifiers.
Versioned in git rather than fetched at runtime so `classifier_version` is
reproducible from a commit SHA.

## loughran-mcdonald.csv

**Source**: Loughran, Tim and Bill McDonald. 2011. "When is a Liability not a
Liability? Textual Analysis, Dictionaries, and 10-Ks." *Journal of Finance*
66(1): 35-65. https://doi.org/10.1111/j.1540-6261.2010.01625.x

**Distribution**: Notre Dame Software Repository for Accounting and Finance
(SRAF). Master Dictionary download:
https://sraf.nd.edu/loughranmcdonald-master-dictionary/

Current revision: `Loughran-McDonald_MasterDictionary_1993-2025.csv` (~86,554
rows including header). Downloaded 2026-05-13 from the SRAF page above.

**License**: Free for use in academic research. Commercial licensing requires
contacting `loughranmcdonald@gmail.com`. Cite the 2011 paper above in any
publication or product that uses this data. Cipher's use is documented in
`docs/cards/MODEL-CARD-loughran-mcdonald.md` (per 20-Z-02 model-card scaffold).

**Why this lexicon**: L&M 2011 demonstrated that ~75% of "negative" words in
the generic Harvard IV-4 dictionary (tax, cost, capital, liability, vice) are
NOT negative in finance contexts. The L&M lexicon is the finance-specific
replacement and is the standard for academic financial-text sentiment analysis.

**How Cipher uses it**: Last-resort sentiment fallback in the per-message NLP
chain (Plan 20-B-06). Activates ONLY when Gemini per-document classification,
the FinBERT-HF endpoint, AND @xenova/transformers local inference all fail.
Surfaces as `nlp_path = 'l&m-fallback'` in telemetry; downstream consumers
treat L&M-tagged observations as informational (confidence floor = 0.4).

**Refresh procedure** (when `scripts/check-lm-lexicon-age.ts` warns or annually):

1. Download the latest CSV from the SRAF page above (link is "CSV Format" near
   the top — currently routed through a Google Drive share, file ID
   `1iq2RUf8qGFEAk1g8wQntP3habOnR3fXF` as of 2026-05).
2. Replace `data/lexicons/loughran-mcdonald.csv`.
3. Bump `LM_CLASSIFIER_VERSION` in `src/lib/sentiment/lm-classifier.ts` from
   `'loughran-mcdonald-2011'` to `'loughran-mcdonald-{year}'` matching the
   new dictionary's publication year.
4. Update `last_validated` in `docs/cards/MODEL-CARD-loughran-mcdonald.md`.
5. Run `npm test` and `npm run check-model-cards`; commit.

**What is NOT here**: Reference data only — do NOT add generated research
artifacts (PDFs, sample reports, scraped content) under data/. Per CLAUDE.md,
only static reference data committed by maintainers belongs in data/.
