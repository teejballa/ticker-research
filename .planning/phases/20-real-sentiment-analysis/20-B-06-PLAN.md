---
phase: 20
plan: 20-B-06
wave: B
type: execute
depends_on: ['20-Z-03']
files_modified:
  - data/lexicons/loughran-mcdonald.csv
  - data/lexicons/README.md
  - src/lib/sentiment/lm-classifier.ts
  - src/lib/sentiment/per-message-pass.ts
  - src/lib/telemetry/withTelemetry.ts
  - src/lib/telemetry/cost-estimators.ts
  - src/app/insights/sentiment-health/page.tsx
  - src/app/api/insights/sentiment-health/route.ts
  - src/app/api/cron/cost-budget-check/route.ts
  - docs/cards/MODEL-CARD-loughran-mcdonald.md
  - scripts/check-lm-lexicon-age.ts
  - package.json
  - tests/sentiment/lm-classifier.unit.test.ts
  - tests/integration/lm-fallback.integration.test.ts
autonomous: true
requirements: []
shadow_required: false
shadow_skip_reason: "Last-resort fallback — replaces a NULL sentinel return value with a low-confidence (0.4) score in the unique case where all upstream NLP paths (Gemini, FinBERT-HF, @xenova local) have already errored out. Pure additive: no upstream behavior is altered, no existing call site changes return type. The L&M score path is reachable ONLY when upstream ALL fail, so there is no parallel comparison surface to shadow against — the alternative IS null. Verdict criteria are the numerical gates in <verification>."
hard_cleanup_gate: true
must_haves:
  truths:
    - "data/lexicons/loughran-mcdonald.csv exists in repo with ≥80,000 rows from the Loughran & McDonald 2011 Master Dictionary (Notre Dame SRAF)"
    - "data/lexicons/README.md cites Loughran & McDonald 2011 verbatim with URL https://sraf.nd.edu/loughranmcdonald-master-dictionary/ and license attribution"
    - "src/lib/sentiment/lm-classifier.ts exists with the literal classifyByLM(text: string) signature in <interfaces>"
    - "classifyByLM returns confidence === 0.4 for ALL inputs (literature 'low confidence' floor — never elevates)"
    - "loadLMDictionary() is a lazy-loaded singleton — first call parses the CSV, subsequent calls return cached Map reference"
    - "src/lib/sentiment/per-message-pass.ts implements the fallback chain in literal order: FinBERT-HF → @xenova local → L&M lexicon → null sentinel"
    - "L&M classifier is wrapped in withTelemetry('lm-fallback', ...) per S6 — every L&M invocation produces a ProviderCallLog row with provider_id='lm-fallback' (T-20-Z-03 surface)"
    - "Negation handler implemented: within-3-token 'not'/'no'/'never' window flips polarity of next polarity-bearing word (literature footnote: L&M 2011 §III.D + Hutto-Gilbert 2014 VADER convention)"
    - "SentimentObservation rows from L&M path carry classifier_version='loughran-mcdonald-2011' (per 20-Z-01 schema)"
    - "/insights/sentiment-health renders an nlp_path breakdown tile showing degradation_rate_24h = count(provider_id='lm-fallback') / count(total) per 24h window"
    - "Cost-budget cron extended with degradation_alert block firing when degradation_rate_24h > 0.05 (5%) — sustained degradation = upstream system breakage signal"
    - "docs/cards/MODEL-CARD-loughran-mcdonald.md exists per 20-Z-02 template with sections: training data (L&M 2011 dictionary), intended use (emergency fallback only), OOD behavior (bag-of-words ignores syntax), known failure modes (negation, sarcasm, compound phrases)"
    - "scripts/check-lm-lexicon-age.ts warns if data/lexicons/loughran-mcdonald.csv mtime > 365 days (T-20-B-06-01: dictionary republished annually by Notre Dame)"
    - "Unit tests cover ≥6 cases: 3 canonical sentences (positive/negative/neutral) + tokenization (hyphens, contractions) + empty text + negation handler"
    - "Integration test: forced-fail FinBERT path (mock) + forced-fail @xenova path → assert L&M fires → assert ProviderCallLog row written with provider_id='lm-fallback'"
    - "Per T-20-B-06-03: 20-B-03 temperature scaling MUST NOT be applied to L&M scores — documented inline in lm-classifier.ts header; downstream gate is the responsibility of 20-B-03 (forward reference)"
    - "withTelemetry ProviderId enum extended with 'lm-fallback'; cost-estimators.ts COST_PER_CALL_USD includes 'lm-fallback': 0 (in-process, $0 marginal)"
  artifacts:
    - path: "data/lexicons/loughran-mcdonald.csv"
      provides: "Loughran & McDonald 2011 Master Dictionary — finance-specific sentiment word list with positive/negative/uncertainty/litigious/constraining/superfluous/modal columns"
      contains: "Negative,Positive,Uncertainty,Litigious"
      min_lines: 80000
    - path: "data/lexicons/README.md"
      provides: "Lexicon attribution + license + refresh procedure"
      contains: "Loughran & McDonald 2011"
    - path: "src/lib/sentiment/lm-classifier.ts"
      provides: "loadLMDictionary() singleton + classifyByLM() last-resort fallback classifier"
      contains: "export function classifyByLM"
    - path: "src/lib/sentiment/per-message-pass.ts"
      provides: "Per-message classification orchestrator — fallback chain FinBERT-HF → @xenova → L&M → null"
      contains: "classifyByLM"
    - path: "docs/cards/MODEL-CARD-loughran-mcdonald.md"
      provides: "Mitchell-2019 model card per 20-Z-02 template — covers L&M as emergency fallback"
      contains: "Loughran-McDonald"
    - path: "scripts/check-lm-lexicon-age.ts"
      provides: "CI/cron staleness check — warns if lexicon CSV is older than 365 days"
      contains: "365"
    - path: "tests/sentiment/lm-classifier.unit.test.ts"
      provides: "Unit tests covering canonical sentences, tokenization edge cases, empty text, negation handler"
      contains: "classifyByLM"
    - path: "tests/integration/lm-fallback.integration.test.ts"
      provides: "Integration test forcing upstream failures and asserting L&M fires + telemetry row written"
      contains: "lm-fallback"
  key_links:
    - from: "src/lib/sentiment/per-message-pass.ts (fallback chain)"
      to: "src/lib/sentiment/lm-classifier.ts classifyByLM()"
      via: "tertiary fallback after FinBERT-HF and @xenova local both null/throw"
      pattern: "classifyByLM\\("
    - from: "src/lib/sentiment/lm-classifier.ts (telemetry)"
      to: "src/lib/telemetry/withTelemetry.ts withTelemetry()"
      via: "wrap classifyByLM with provider_id='lm-fallback' so degradation_rate is measurable"
      pattern: "withTelemetry\\('lm-fallback'"
    - from: "src/app/api/insights/sentiment-health/route.ts (Z-03 endpoint)"
      to: "ProviderCallLog WHERE provider_id='lm-fallback'"
      via: "SELECT count(*) FILTER (WHERE provider_id='lm-fallback') / count(*) AS degradation_rate_24h"
      pattern: "lm-fallback"
    - from: "src/app/api/cron/cost-budget-check/route.ts (Z-03 alerter)"
      to: "degradation_rate_24h > 0.05 alert"
      via: "additional check block — emits 'degradation_alert' when sustained > 5%"
      pattern: "0\\.05"
---

# Plan 20-B-06: Loughran-McDonald lexicon-based last-resort fallback

<universal_preamble>

## Autonomous Execution Clause

This plan is fully autonomous. The L&M dictionary CSV is downloaded from the Notre Dame SRAF public URL, committed to the repo (open license, attribution required — no auth gate). All other tasks are pure code/tests/docs.

## Hard Cleanup Gate (Definition of Done)

A plan is **NOT complete** until:
1. **No shadow lifecycle to graduate** (S3 N/A — additive last-resort fallback that activates only when ALL upstream NLP paths have already failed; there is no parallel comparison path because the alternative is `null`. Documented in `shadow_skip_reason`.)
2. **No old code deleted** (additive only — extends the existing fallback chain in `per-message-pass.ts` from a 3-step chain ending in `null` to a 4-step chain ending in `null`).
3. **No feature flag introduced** (the L&M path always runs as the last fallback before null; gating it would just silently regress to the old null sentinel — defeats the purpose).
4. `npm test` (Vitest unit), `npm run test:integration` (live-Neon Vitest), and `npm run test:e2e` (Playwright) all green on `main` post-commit.
5. **Lexicon Gate**: `data/lexicons/loughran-mcdonald.csv` exists with `wc -l >= 80000`; `head -1` shows the L&M column header (Word + Negative + Positive + Uncertainty + Litigious + Strong_Modal + Weak_Modal + Constraining + Superfluous columns present).
6. **Telemetry Gate**: `grep -c "withTelemetry('lm-fallback'" src/lib/sentiment/lm-classifier.ts` returns ≥1.
7. **Fallback Order Gate**: `grep -nE "(classifyFinBERT|tryXenovaLocal|classifyByLM)" src/lib/sentiment/per-message-pass.ts` shows the three calls in literal source order: FinBERT-HF → @xenova → classifyByLM.
8. **Confidence Floor Gate**: `npx vitest run tests/sentiment/lm-classifier.unit.test.ts -t "confidence"` reports all confidence-floor tests pass with confidence === 0.4 for all input fixtures.
9. **Integration Gate**: `npx vitest run tests/integration/lm-fallback.integration.test.ts` — mocks force FinBERT throw + @xenova throw → asserts L&M result returned AND ProviderCallLog row inserted with provider_id='lm-fallback'.
10. **Model Card Gate**: `npm run check-model-cards` (Z-02) exits 0 with `MODEL-CARD-loughran-mcdonald.md` recognized as the card for `lm-classifier.ts`.
11. **Dashboard Gate**: After integration test inserts ≥1 row, `curl -fs http://localhost:3000/api/insights/sentiment-health` returns JSON containing a provider entry with `provider_id: "lm-fallback"` AND a top-level `degradation_rate_24h` field.
12. **Staleness Gate**: `npx tsx scripts/check-lm-lexicon-age.ts` exits 0 today (CSV is fresh); test fixture demonstrates the script EXITS 1 when given a 400-day-old mtime.

## Cross-cutting standards adherence (CONTEXT.md §S1-S10)

- **S1 (no hand-picked parameters)** — `confidence = 0.4` is the literature default per CONTEXT.md line 118 verbatim and L&M 2011 §IV; the `degradation_rate_24h > 0.05` alert threshold follows the operational default for "sustained NLP degradation = upstream breakage"; negation window = 3 tokens per L&M 2011 §III.D + Hutto-Gilbert 2014 VADER. All cited inline.
- **S2 (PIT discipline)** — L&M scores are computed at message ingest time, persisted into SentimentObservation (20-Z-01) with `fetched_at` = wall-clock at classification, never `published_at`. Lexicon itself is a versioned static asset (`classifier_version='loughran-mcdonald-2011'`); future republished dictionary bumps to `loughran-mcdonald-{year}` and creates new rows per 20-Z-01 immutable-snapshot rule.
- **S3 (shadow lifecycle)** — Skipped with documented reason. Alternative path IS null — no behavioral surface to compare.
- **S4 (model/dataset card)** — `docs/cards/MODEL-CARD-loughran-mcdonald.md` shipped per 20-Z-02 Mitchell-2019 template. `npm run check-model-cards` enforces presence + freshness.
- **S5 (pinned model+prompt versions)** — `classifier_version='loughran-mcdonald-2011'` pinned in source AND persisted on every observation row. CSV file is committed to the repo (not fetched at runtime), git-tracked.
- **S6 (telemetry on every external call)** — Every classifyByLM invocation wrapped in `withTelemetry('lm-fallback', ...)` from 20-Z-03. Dashboard surfaces `degradation_rate_24h`; cost-budget cron alerts at >5%.
- **S7 (threat model)** — Five plan-level threats T-20-B-06-{01..05}; T-20-B-06-01/02/03/04 mitigated, T-20-B-06-05 dispositioned `accept` (open-licensed published research data).
- **S8 (numerical acceptance)** — Every DONE criterion is `wc -l`, `grep -c`, test exit code, or row-count assertion. Zero adjectives.
- **S9 (failure-mode coverage)** — Negation, empty input, tokenization edge cases (hyphens, contractions, $-prices), forced-failure of upstream paths all explicitly tested.
- **S10 (regulatory hygiene)** — N/A; classifier ships sentiment scores to internal aggregator only, no user-facing report change.

</universal_preamble>

<objective>
Ship the Loughran-McDonald 2011 finance-specific lexicon as the **last-resort sentiment classifier** in the per-message NLP fallback chain. When all probabilistic NLP paths fail (FinBERT-HF endpoint down, @xenova local inference throws), instead of returning the current `null` sentinel that drops the message from aggregation, return a low-confidence (0.4) bag-of-words score with a `nlp_path='l&m-fallback'` telemetry tag. This (a) preserves message coverage during outages, (b) makes degradation observable via the 20-Z-03 dashboard, and (c) avoids the trap of the Harvard IV-4 generic dictionary which L&M 2011 showed misclassifies 75% of "negative" words in finance contexts (tax, cost, capital, liability, vice).

Purpose: the post-Phase-19 multi-source aggregator currently silently degrades when HF endpoints are unavailable. CONTEXT.md S6 mandates degradation be **measurable** — this plan provides the measurable degradation surface AND keeps the system useful (low-confidence score > null sentinel) during outages.

Scope guard: this plan ships **L&M lexicon load + bag-of-words classifier + fallback chain integration + telemetry tag + model card + staleness check ONLY**. Gemini per-document is 20-B-01, FinBERT-HF endpoint provisioning is 20-B-02, source-tier weighting is 20-B-04, per-aspect headline numbers are 20-B-05 — all OUT OF SCOPE. L&M scores are NOT calibrated via temperature scaling (20-B-03) because T-scaling assumes a probabilistic classifier; bag-of-words counts have no calibration target.

Output:
- 1 lexicon CSV (~80k rows) committed under `data/lexicons/`
- 1 classifier module (`lm-classifier.ts`) with `loadLMDictionary()` singleton + `classifyByLM()`
- 1 new orchestrator (`per-message-pass.ts`) wiring the 4-step fallback chain
- 2-line additive extension to 20-Z-03's withTelemetry ProviderId enum + cost-estimators table
- 1 dashboard tile addition + 1 cost-budget alerter extension (both in 20-Z-03 endpoints)
- 1 model card per 20-Z-02 template
- 1 staleness CI script
- 1 unit test file (≥6 cases) + 1 integration test file (forced-failure path)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/20-real-sentiment-analysis/CONTEXT.md
@.planning/phases/20-real-sentiment-analysis/20-Z-01-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md
@.planning/phases/20-real-sentiment-analysis/20-Z-03-PLAN.md
@src/lib/sentiment/finsentllm.ts
@src/lib/sentiment/aggregator.ts
@src/lib/sentiment/pipeline-providers.ts
@docs/templates/MODEL-CARD-template.md
@CLAUDE.md

<interfaces>
```typescript
// src/lib/sentiment/lm-classifier.ts — NEW
//
// Loughran-McDonald 2011 finance-specific bag-of-words classifier.
// LAST-RESORT fallback when Gemini, FinBERT-HF, and @xenova local all fail.
// Confidence is HARDCODED at 0.4 — literature "low confidence" floor for
// lexicon-only methods. T-20-B-06-03: downstream consumers MUST treat
// L&M-tagged observations as informational only; 20-B-03 temperature scaling
// is NOT applied (T-scaling assumes a calibrated probabilistic classifier).

export interface LMTags {
  positive: boolean;
  negative: boolean;
  uncertainty: boolean;
  litigious: boolean;
  constraining: boolean;
  superfluous: boolean;
  modal: 'strong' | 'moderate' | 'weak' | null;
}

export interface LMScore {
  /** [-1, +1] — (positive_count - negative_count) / max(total_word_count, 1). */
  score: number;
  /** Always 0.4. Hardcoded floor per L&M 2011 §IV; downstream skips T-scaling. */
  confidence: 0.4;
  /** Surfaces in ProviderCallLog telemetry tag and SentimentObservation.classifier_version. */
  nlp_path: 'l&m-fallback';
  /** Number of dictionary-matched words in input (informational; useful for low-coverage debug). */
  matched_words: number;
}

/** Pinned classifier version persisted on every SentimentObservation row from this path. */
export const LM_CLASSIFIER_VERSION = 'loughran-mcdonald-2011';

/**
 * Lazy-loaded singleton. First call parses the CSV (~80k rows) into a Map.
 * Subsequent calls return cached Map. Concurrent first calls share the same
 * loading promise. Throws if data/lexicons/loughran-mcdonald.csv missing or malformed.
 */
export function loadLMDictionary(): Promise<Map<string, LMTags>>;

/**
 * Classify text via L&M lexicon. ALWAYS wrapped in withTelemetry('lm-fallback', ...).
 * Tokenization: lowercase + strip punctuation (keep hyphens-within-words and
 * apostrophes-in-contractions) + split whitespace.
 * Negation: within-3-token 'not'/'no'/'never' window flips polarity of next
 * polarity-bearing word (per L&M 2011 §III.D + Hutto-Gilbert 2014 VADER convention).
 * Empty/whitespace input → { score: 0, confidence: 0.4, nlp_path: 'l&m-fallback', matched_words: 0 }.
 *
 * @example
 *   await classifyByLM('revenue beat earnings expectations')   // → { score: ~0.5, confidence: 0.4, ... }
 *   await classifyByLM('lawsuit costs increase liability')     // → { score: ~-0.5, confidence: 0.4, ... }
 *   await classifyByLM('the price is $50')                     // → { score: 0, confidence: 0.4, ... }
 *   await classifyByLM('not bullish on guidance')              // → { score: ~-0.33, confidence: 0.4, ... } (negation flip)
 */
export function classifyByLM(text: string): Promise<LMScore>;
```

```typescript
// src/lib/sentiment/per-message-pass.ts — NEW (created by THIS plan; CONTEXT.md spec line 118 references it as the integration site)

export type NLPPath = 'finbert-hf' | 'xenova-local' | 'l&m-fallback' | 'null';

export interface PerMessageNLPResult {
  message_id: string;
  score: number | null;
  confidence: number | null;
  nlp_path: NLPPath;
  classifier_version: string;
}

/** Fallback chain (literal source order): FinBERT-HF → @xenova local → L&M → null sentinel. */
export function classifyMessages(
  messages: Array<{ id: string; text: string }>,
): Promise<PerMessageNLPResult[]>;
```

```csv
# data/lexicons/loughran-mcdonald.csv (header — full file ~80k rows)
Word,Sequence Number,Word Count,Word Proportion,Average Proportion,Std Dev,Doc Count,Negative,Positive,Uncertainty,Litigious,Strong_Modal,Weak_Modal,Constraining,Superfluous,Interesting,Modal,Syllables,Source
```

```typescript
// scripts/check-lm-lexicon-age.ts — NEW
// CI/cron staleness check per T-20-B-06-01.
// Exits 1 with warning if data/lexicons/loughran-mcdonald.csv mtime > 365 days.
export async function checkLexiconAge(maxAgeDays?: number): Promise<{ stale: boolean; ageDays: number }>;
```

```typescript
// src/lib/telemetry/withTelemetry.ts — 2-line additive change to 20-Z-03 contract
export type ProviderId =
  | 'yahoo' | 'polygon' | 'finnhub' | 'anthropic-search'
  | 'stocktwits' | 'firecrawl' | 'gemini' | 'finbert-hf' | 'apewisdom'
  | 'lm-fallback';   // NEW — added by Plan 20-B-06

// src/lib/telemetry/cost-estimators.ts — 1-line additive
export const COST_PER_CALL_USD: Record<ProviderId, number> = {
  // ... existing entries ...
  'lm-fallback': 0,  // NEW — in-process bag-of-words, $0 marginal cost
};
```
</interfaces>
</context>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| upstream NLP path → L&M fallback | Triggers only on upstream failure; L&M operates on already-fetched message text (no new external trust crossed) |
| L&M classifier → SentimentObservation persistence | Low-confidence (0.4) scores enter the same aggregation pipeline as high-confidence Gemini/FinBERT scores; downstream consumers MUST gate on confidence |
| L&M lexicon CSV → process memory | Static asset committed to repo; no runtime fetch; no untrusted deserialization |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-20-B-06-01 | Tampering / staleness | L&M dictionary republished annually by Notre Dame; committed CSV becomes outdated | mitigate | `scripts/check-lm-lexicon-age.ts` runs as a daily cron + CI gate; warns if mtime > 365 days. Refresh procedure documented in `data/lexicons/README.md` (download from https://sraf.nd.edu/loughranmcdonald-master-dictionary/, replace CSV, bump `classifier_version` to `loughran-mcdonald-{year}`). MODEL-CARD `last_validated` field enforced by `npm run check-model-cards` (20-Z-02). |
| T-20-B-06-02 | Information disclosure / accuracy regression | Bag-of-words ignores syntax — "not bullish" → "bullish" → wrongly positive | mitigate | Within-3-token negation handler implemented per L&M 2011 §III.D + Hutto-Gilbert 2014 VADER convention. Unit test covers "not bullish" → negative score. MODEL-CARD documents accuracy ceiling: bag-of-words misses irony, sarcasm, complex multi-clause sentences. Confidence=0.4 ceiling caps downstream impact. |
| T-20-B-06-03 | Tampering / silent overconfidence | Confidence=0.4 too high — downstream consumers may treat L&M scores as authoritative; 20-B-03 temperature scaling could amplify miscalibration | mitigate | (a) Confidence is HARDCODED at 0.4 in source — no input can elevate it. (b) Source-file header documents the rule "20-B-03 temperature scaling MUST NOT be applied to L&M scores"; the 20-B-03 implementation plan will gate T-scaling on `classifier_version !== 'loughran-mcdonald-2011'`. (c) Downstream consumer code (aggregator) inherits the 0.4 confidence as a weight — Beta-smoothed weighted-mean naturally down-weights low-confidence signals. |
| T-20-B-06-04 | DoS / silent system breakage | Sustained degradation rate > 5% = something upstream broken (HF endpoint outage, @xenova memory leak); no operator alert means silent quality degradation | mitigate | 20-Z-03 cost-budget cron extended with `degradation_alert` block firing when `count(provider_id='lm-fallback', last 24h) / count(*, last 24h) > 0.05`. Runbook in MODEL-CARD: "If degradation alert fires, check 20-Z-03 dashboard for which upstream is failing (HF endpoint health page, @xenova process memory)." |
| T-20-B-06-05 | Information disclosure / PII | L&M lexicon contains words that could be PII or trademarks | accept | L&M is open-licensed published research data from Notre Dame (peer-reviewed, 2011); contains only common English finance vocabulary. Zero PII risk. Documented in `data/lexicons/README.md` license section. |

</threat_model>

<tasks>

<task type="auto" id="20-B-06-01">
  <name>Task 1: Download + commit L&M Master Dictionary CSV with attribution</name>
  <files>data/lexicons/loughran-mcdonald.csv, data/lexicons/README.md</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 118 — verbatim 20-B-06 spec; line 49 — L&M 2011 finding)
    - CLAUDE.md (lexicon is REFERENCE data, not generated, so it IS committed)
  </read_first>
  <action>
    Create the directory `data/lexicons/` (does not exist as of plan creation).

    Download the latest Loughran & McDonald Master Dictionary from Notre Dame SRAF:

    ```bash
    mkdir -p data/lexicons
    # Auto-discover the latest CSV link from the SRAF page:
    LATEST_CSV=$(curl -fsSL https://sraf.nd.edu/loughranmcdonald-master-dictionary/ | grep -oE 'https://[^"]*MasterDictionary[^"]*\.csv' | head -1)
    [ -z "$LATEST_CSV" ] && { echo "FATAL: could not locate CSV link on SRAF page; fetch manually"; exit 1; }
    curl -fsSL -o data/lexicons/loughran-mcdonald.csv "$LATEST_CSV"
    wc -l data/lexicons/loughran-mcdonald.csv  # MUST be >= 80000
    head -1 data/lexicons/loughran-mcdonald.csv  # MUST contain Word,...,Negative,Positive,...
    ```

    If auto-discovery fails (page layout changed), implementer fetches the page manually, identifies the latest CSV link, downloads directly. Do NOT invent a URL — verify against the published SRAF page.

    Create `data/lexicons/README.md`:

    ```markdown
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

    **License**: Open for research and commercial use; attribution required. Cite
    the 2011 paper above in any publication or product that uses this data.

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
    1. Download the latest CSV from the SRAF page above.
    2. Replace `data/lexicons/loughran-mcdonald.csv`.
    3. Bump `LM_CLASSIFIER_VERSION` in `src/lib/sentiment/lm-classifier.ts` from
       `'loughran-mcdonald-2011'` to `'loughran-mcdonald-{year}'` matching the
       new dictionary's publication year.
    4. Update `last_validated` in `docs/cards/MODEL-CARD-loughran-mcdonald.md`.
    5. Run `npm test` and `npm run check-model-cards`; commit.

    **What is NOT here**: Reference data only — do NOT add generated research
    artifacts (PDFs, sample reports, scraped content) under data/. Per CLAUDE.md,
    only static reference data committed by maintainers belongs in data/.
    ```
  </action>
  <verify>
    <automated>[ -f data/lexicons/loughran-mcdonald.csv ] && [ "$(wc -l < data/lexicons/loughran-mcdonald.csv)" -ge 80000 ] && head -1 data/lexicons/loughran-mcdonald.csv | grep -qE "Word.*Negative.*Positive" && grep -q "Loughran.*McDonald.*2011" data/lexicons/README.md && grep -q "https://sraf.nd.edu/loughranmcdonald-master-dictionary/" data/lexicons/README.md</automated>
  </verify>
  <done>L&M lexicon committed under data/lexicons/ with attribution README; ≥80k entries verified</done>
</task>

<task type="auto" tdd="true" id="20-B-06-02">
  <name>Task 2: Write failing unit tests for classifyByLM (canonical sentences + tokenization + negation + empty)</name>
  <files>tests/sentiment/lm-classifier.unit.test.ts</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/CONTEXT.md (line 118 — algorithm spec; line 49 — L&M 2011 finding)
    - data/lexicons/loughran-mcdonald.csv (header — confirm column order from Task 1)
  </read_first>
  <behavior>
    Tests for `classifyByLM(text: string): Promise<LMScore>` from `src/lib/sentiment/lm-classifier.ts`:

    **Confidence floor (always 0.4)** — 5 cases:
    - confidence === 0.4 for positive input
    - confidence === 0.4 for negative input
    - confidence === 0.4 for neutral input
    - confidence === 0.4 for empty input
    - confidence === 0.4 for input with zero matched dictionary words

    **Canonical sentences (CONTEXT.md spec)** — 3 cases:
    - 'revenue beat earnings expectations' → score > 0
    - 'lawsuit costs increase liability' → score < 0
    - 'the price is $50' → score === 0

    **Tokenization edge cases** — 4 cases:
    - hyphens within words preserved
    - apostrophes within contractions preserved (or stripped consistently with L&M dictionary form)
    - currency symbols stripped, numbers don't crash classifier
    - case insensitive: 'EARNINGS BEAT' === 'earnings beat'

    **Negation handler (within-3-token window)** — 5 cases:
    - 'not bullish on guidance' → score < 0
    - 'no improvement in revenue' → score < 0
    - 'never positive on margins' → score < 0
    - 'bullish but not on guidance' → mixed/negation only within window
    - 'not really bullish' → score < 0 (window reaches through 1 filler)

    **Empty / whitespace** — 3 cases:
    - '' → { score: 0, matched_words: 0 }
    - '   ' → same as empty
    - '$50' → { score: 0, matched_words: 0 }

    **Singleton behavior** — 1 case:
    - loadLMDictionary() returns same Map reference on repeated calls

    Total: ≥6 distinct `it()` blocks REQUIRED across the categories above (target: 16).
  </behavior>
  <action>
    Create `tests/sentiment/lm-classifier.unit.test.ts` with the above test cases.

    Skeleton:
    ```typescript
    import { describe, it, expect } from 'vitest';
    import { classifyByLM, loadLMDictionary } from '../../src/lib/sentiment/lm-classifier';

    describe('classifyByLM — confidence floor (T-20-B-06-03)', () => {
      it('returns confidence === 0.4 for positive input', async () => {
        const r = await classifyByLM('revenue beat earnings expectations');
        expect(r.confidence).toBe(0.4);
      });
      // ... 4 more
    });

    describe('classifyByLM — canonical sentences (CONTEXT.md line 118)', () => { /* 3 cases */ });
    describe('classifyByLM — tokenization', () => { /* 4 cases */ });
    describe('classifyByLM — negation handler (L&M 2011 §III.D)', () => { /* 5 cases */ });
    describe('classifyByLM — empty / whitespace', () => { /* 3 cases */ });
    describe('loadLMDictionary — singleton', () => {
      it('returns the same Map reference on repeated calls', async () => {
        const a = await loadLMDictionary();
        const b = await loadLMDictionary();
        expect(a).toBe(b);
      });
    });
    ```

    Run to confirm RED:
    ```bash
    npx vitest run tests/sentiment/lm-classifier.unit.test.ts
    ```
    Expect "Cannot find module" error (lm-classifier.ts not yet created).
  </action>
  <verify>
    <automated>[ -f tests/sentiment/lm-classifier.unit.test.ts ] && [ "$(grep -c 'it(' tests/sentiment/lm-classifier.unit.test.ts)" -ge 6 ] && npx vitest run tests/sentiment/lm-classifier.unit.test.ts 2>&1 | grep -qE "(Cannot find module|FAIL|fail)"</automated>
  </verify>
  <done>≥6 failing tests written across 5 behavior categories; verified RED</done>
</task>

<task type="auto" tdd="true" id="20-B-06-03">
  <name>Task 3: Implement loadLMDictionary + classifyByLM + extend telemetry enum (GREEN)</name>
  <files>src/lib/sentiment/lm-classifier.ts, src/lib/telemetry/withTelemetry.ts, src/lib/telemetry/cost-estimators.ts</files>
  <read_first>
    - data/lexicons/loughran-mcdonald.csv (header — column order critical for parser)
    - tests/sentiment/lm-classifier.unit.test.ts (Task 2 — tests must pass)
    - src/lib/telemetry/withTelemetry.ts (Z-03 ProviderId enum — must extend)
    - src/lib/telemetry/cost-estimators.ts (Z-03 cost table — must extend)
  </read_first>
  <action>
    **Step A — Extend 20-Z-03 telemetry enum (2-line additive)**:

    Edit `src/lib/telemetry/withTelemetry.ts`: add `| 'lm-fallback'` to the `ProviderId` union (alphabetical-ish position after `'apewisdom'` is fine).

    Edit `src/lib/telemetry/cost-estimators.ts`: add `'lm-fallback': 0,` to `COST_PER_CALL_USD` with comment `// in-process bag-of-words; $0 marginal cost (Plan 20-B-06)`.

    **Step B — Create `src/lib/sentiment/lm-classifier.ts`**:

    ```typescript
    // src/lib/sentiment/lm-classifier.ts
    //
    // Loughran-McDonald 2011 finance-specific bag-of-words classifier.
    // LAST-RESORT fallback in the per-message NLP chain (Plan 20-B-06).
    // Activates ONLY when classifyFinBERT (HF endpoint) AND @xenova local both null/throw.
    //
    // CONFIDENCE FLOOR: hardcoded 0.4 (literature default per L&M 2011 §IV reflecting
    // "lexicon-only, no probabilistic calibration possible"). T-20-B-06-03: downstream
    // 20-B-03 temperature scaling MUST NOT be applied to L&M scores — T-scaling assumes
    // a probabilistic classifier output; bag-of-words counts have no calibration target.
    //
    // NEGATION: within-3-token window for 'not'/'no'/'never' flips polarity of next
    // polarity-bearing word per L&M 2011 §III.D + Hutto-Gilbert 2014 VADER convention.
    // T-20-B-06-02 documents accuracy ceiling: bag-of-words misses irony, sarcasm,
    // multi-clause sentences, negation outside the 3-token window.
    //
    // STALENESS: T-20-B-06-01 — scripts/check-lm-lexicon-age.ts warns when CSV mtime > 365d.

    import { readFile } from 'node:fs/promises';
    import { join } from 'node:path';
    import { withTelemetry } from '../telemetry/withTelemetry';

    export interface LMTags {
      positive: boolean;
      negative: boolean;
      uncertainty: boolean;
      litigious: boolean;
      constraining: boolean;
      superfluous: boolean;
      modal: 'strong' | 'moderate' | 'weak' | null;
    }

    export interface LMScore {
      score: number;
      confidence: 0.4;
      nlp_path: 'l&m-fallback';
      matched_words: number;
    }

    export const LM_CLASSIFIER_VERSION = 'loughran-mcdonald-2011';

    const LEXICON_PATH = join(process.cwd(), 'data', 'lexicons', 'loughran-mcdonald.csv');

    let cachedDictionary: Map<string, LMTags> | null = null;
    let loadingPromise: Promise<Map<string, LMTags>> | null = null;

    export async function loadLMDictionary(): Promise<Map<string, LMTags>> {
      if (cachedDictionary) return cachedDictionary;
      if (loadingPromise) return loadingPromise;

      loadingPromise = (async () => {
        const csv = await readFile(LEXICON_PATH, 'utf-8');
        const lines = csv.split(/\r?\n/);
        const header = lines[0].split(',');

        const idx = {
          word: header.indexOf('Word'),
          negative: header.indexOf('Negative'),
          positive: header.indexOf('Positive'),
          uncertainty: header.indexOf('Uncertainty'),
          litigious: header.indexOf('Litigious'),
          strong_modal: header.indexOf('Strong_Modal'),
          weak_modal: header.indexOf('Weak_Modal'),
          constraining: header.indexOf('Constraining'),
          superfluous: header.indexOf('Superfluous'),
          modal: header.indexOf('Modal'),
        };
        if (idx.word < 0 || idx.negative < 0 || idx.positive < 0) {
          throw new Error(`L&M CSV missing required columns. Header: ${header.join(',')}`);
        }

        const dict = new Map<string, LMTags>();
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = line.split(',');
          const word = cols[idx.word]?.toLowerCase().trim();
          if (!word) continue;
          // L&M format: non-zero values indicate "year first flagged" (or just 1).
          // We collapse to boolean.
          const positive = (cols[idx.positive] ?? '0') !== '0';
          const negative = (cols[idx.negative] ?? '0') !== '0';
          const uncertainty = (cols[idx.uncertainty] ?? '0') !== '0';
          const litigious = (cols[idx.litigious] ?? '0') !== '0';
          const constraining = (cols[idx.constraining] ?? '0') !== '0';
          const superfluous = (cols[idx.superfluous] ?? '0') !== '0';
          const strongModal = idx.strong_modal >= 0 && (cols[idx.strong_modal] ?? '0') !== '0';
          const weakModal = idx.weak_modal >= 0 && (cols[idx.weak_modal] ?? '0') !== '0';
          const moderateModal = !strongModal && !weakModal && idx.modal >= 0 && (cols[idx.modal] ?? '0') !== '0';

          // Skip non-flagged words to keep Map small.
          if (!positive && !negative && !uncertainty && !litigious && !constraining && !superfluous && !strongModal && !weakModal && !moderateModal) {
            continue;
          }

          dict.set(word, {
            positive, negative, uncertainty, litigious, constraining, superfluous,
            modal: strongModal ? 'strong' : weakModal ? 'weak' : moderateModal ? 'moderate' : null,
          });
        }
        cachedDictionary = dict;
        return dict;
      })();

      try {
        return await loadingPromise;
      } finally {
        loadingPromise = null;
      }
    }

    /**
     * Tokenize text:
     *   - lowercase
     *   - strip punctuation EXCEPT internal hyphens and internal apostrophes
     *   - split on whitespace
     */
    function tokenize(text: string): string[] {
      return text
        .toLowerCase()
        .replace(/[^a-z0-9\s'-]/g, ' ')
        .split(/\s+/)
        .map(t => t.replace(/^[-']+|[-']+$/g, ''))
        .filter(Boolean);
    }

    const NEGATION_TOKENS = new Set(['not', 'no', 'never']);
    const NEGATION_WINDOW = 3;

    export async function classifyByLM(text: string): Promise<LMScore> {
      return withTelemetry('lm-fallback', async () => {
        const dict = await loadLMDictionary();
        const tokens = tokenize(text);
        if (tokens.length === 0) {
          return { score: 0, confidence: 0.4 as const, nlp_path: 'l&m-fallback' as const, matched_words: 0 };
        }

        let pos = 0;
        let neg = 0;
        let matched = 0;

        for (let i = 0; i < tokens.length; i++) {
          const tok = tokens[i];
          const tags = dict.get(tok);
          if (!tags) continue;
          if (!tags.positive && !tags.negative) {
            matched++;
            continue;
          }

          // Negation lookback within 3-token window
          let negated = false;
          for (let j = Math.max(0, i - NEGATION_WINDOW); j < i; j++) {
            if (NEGATION_TOKENS.has(tokens[j])) { negated = true; break; }
          }

          if (tags.positive) (negated ? neg : pos)++;
          else if (tags.negative) (negated ? pos : neg)++;
          matched++;
        }

        const score = (pos - neg) / Math.max(tokens.length, 1);
        return {
          score,
          confidence: 0.4 as const,
          nlp_path: 'l&m-fallback' as const,
          matched_words: matched,
        };
      });
    }
    ```

    **Step C — Run unit tests to confirm GREEN**:
    ```bash
    npx vitest run tests/sentiment/lm-classifier.unit.test.ts
    ```
    All ≥6 tests must pass. If a tokenization assumption (hyphen, apostrophe) differs from the L&M dictionary's actual word forms, update `tokenize()` to match — the dictionary is source of truth.

    **Step D — Type check**:
    ```bash
    npx tsc --noEmit
    ```
  </action>
  <verify>
    <automated>[ -f src/lib/sentiment/lm-classifier.ts ] && grep -q "export function classifyByLM" src/lib/sentiment/lm-classifier.ts && grep -q "export function loadLMDictionary" src/lib/sentiment/lm-classifier.ts && grep -q "LM_CLASSIFIER_VERSION = 'loughran-mcdonald-2011'" src/lib/sentiment/lm-classifier.ts && grep -q "withTelemetry('lm-fallback'" src/lib/sentiment/lm-classifier.ts && grep -q "'lm-fallback'" src/lib/telemetry/withTelemetry.ts && grep -q "'lm-fallback': 0" src/lib/telemetry/cost-estimators.ts && npx vitest run tests/sentiment/lm-classifier.unit.test.ts 2>&1 | grep -qE "(passed|✓)" && npx tsc --noEmit</automated>
  </verify>
  <done>classifyByLM + loadLMDictionary implemented; ≥6 unit tests GREEN; telemetry enum extended; tsc clean</done>
</task>

<task type="auto" id="20-B-06-04">
  <name>Task 4: Wire L&M into per-message-pass.ts fallback chain (FinBERT-HF → @xenova → L&M → null)</name>
  <files>src/lib/sentiment/per-message-pass.ts</files>
  <read_first>
    - src/lib/sentiment/finsentllm.ts (classifyFinBERT signature — primary backstop)
    - src/lib/sentiment/lm-classifier.ts (Task 3 — classifyByLM signature)
    - src/lib/sentiment/pipeline-providers.ts (graceful fallback if 20-B-02 has not yet exported classifyXenovaLocal)
    - prisma/schema.prisma (SentimentObservation from 20-Z-01 — classifier_version field shape)
  </read_first>
  <action>
    Create `src/lib/sentiment/per-message-pass.ts`:

    ```typescript
    // src/lib/sentiment/per-message-pass.ts
    //
    // Per-message NLP orchestrator. Plan 20-B-06 introduces this file and wires
    // the 4-step fallback chain. The L&M lexicon ALWAYS produces a score
    // (confidence floor = 0.4) before the final null sentinel — outage coverage.
    //
    // Fallback chain (literal source order):
    //   1. classifyFinBERT (HF Inference Endpoint, 20-B-02)
    //   2. tryXenovaLocal (@xenova/transformers in-process, 20-B-02)
    //   3. classifyByLM (THIS PLAN — lexicon-only, confidence=0.4)
    //   4. null sentinel (only reachable if classifyByLM throws — defensive)
    //
    // Telemetry: each step is wrapped in withTelemetry() with the appropriate
    // provider_id. The 20-Z-03 dashboard reads degradation_rate_24h =
    // count(provider_id='lm-fallback') / count(total) per 24h window.

    import { classifyFinBERT, type SentimentScore } from './finsentllm';
    import { classifyByLM, LM_CLASSIFIER_VERSION } from './lm-classifier';

    export type NLPPath = 'finbert-hf' | 'xenova-local' | 'l&m-fallback' | 'null';

    export interface PerMessageNLPResult {
      message_id: string;
      score: number | null;
      confidence: number | null;
      nlp_path: NLPPath;
      classifier_version: string;
    }

    /**
     * Lazy-load @xenova local pipeline. If 20-B-02 has not yet exported
     * classifyXenovaLocal from pipeline-providers.ts, this returns null and
     * the chain falls through to L&M — desired safety property.
     */
    let xenovaPipeline: ((text: string) => Promise<SentimentScore>) | null | undefined;

    async function tryXenovaLocal(text: string): Promise<SentimentScore | null> {
      try {
        if (xenovaPipeline === undefined) {
          const mod = await import('./pipeline-providers');
          const fn = (mod as { classifyXenovaLocal?: (t: string) => Promise<SentimentScore> }).classifyXenovaLocal;
          xenovaPipeline = fn ?? null;
        }
        if (!xenovaPipeline) return null;
        return await xenovaPipeline(text);
      } catch {
        return null;
      }
    }

    async function classifyOne(message_id: string, text: string): Promise<PerMessageNLPResult> {
      // Step 1: FinBERT HF endpoint
      const finbert = await classifyFinBERT(text);
      if (finbert.score !== null && finbert.confidence !== null) {
        return {
          message_id,
          score: finbert.score,
          confidence: finbert.confidence,
          nlp_path: 'finbert-hf',
          classifier_version: 'finbert@hf-pinned-sha',
        };
      }

      // Step 2: @xenova local
      const xenova = await tryXenovaLocal(text);
      if (xenova && xenova.score !== null && xenova.confidence !== null) {
        return {
          message_id,
          score: xenova.score,
          confidence: xenova.confidence,
          nlp_path: 'xenova-local',
          classifier_version: 'xenova-finbert@local',
        };
      }

      // Step 3: L&M lexicon (THIS PLAN — always produces a score)
      try {
        const lm = await classifyByLM(text);
        return {
          message_id,
          score: lm.score,
          confidence: lm.confidence,
          nlp_path: 'l&m-fallback',
          classifier_version: LM_CLASSIFIER_VERSION,
        };
      } catch {
        // Step 4: null sentinel (defensive)
        return {
          message_id,
          score: null,
          confidence: null,
          nlp_path: 'null',
          classifier_version: 'none',
        };
      }
    }

    /** Classify N messages through the fallback chain. Order preserved. */
    export async function classifyMessages(
      messages: Array<{ id: string; text: string }>,
    ): Promise<PerMessageNLPResult[]> {
      return Promise.all(messages.map(m => classifyOne(m.id, m.text)));
    }
    ```

    NOTE: This task assumes 20-B-02 (FinBERT-HF endpoint provisioning) ships separately. The dependency on `pipeline-providers.ts` for `classifyXenovaLocal` is graceful: if 20-B-02 has not yet exported that function, `tryXenovaLocal` returns null and the chain falls through to L&M.

    The wave dependency is `depends_on: ['20-Z-03']` only — the @xenova path being absent is handled gracefully because L&M is the catch-all. If 20-B-02 ships later in the same wave, both paths coexist.
  </action>
  <verify>
    <automated>[ -f src/lib/sentiment/per-message-pass.ts ] && grep -q "classifyByLM" src/lib/sentiment/per-message-pass.ts && grep -q "classifyFinBERT" src/lib/sentiment/per-message-pass.ts && grep -q "tryXenovaLocal" src/lib/sentiment/per-message-pass.ts && node -e "const s=require('fs').readFileSync('src/lib/sentiment/per-message-pass.ts','utf-8'); const a=s.indexOf('await classifyFinBERT'); const b=s.indexOf('await tryXenovaLocal'); const c=s.indexOf('await classifyByLM'); if(!(a>0 && b>a && c>b)) { console.error('order:',a,b,c); process.exit(1) }" && npx tsc --noEmit</automated>
  </verify>
  <done>per-message-pass.ts created; fallback chain in literal order FinBERT→@xenova→L&M→null; tsc clean</done>
</task>

<task type="auto" id="20-B-06-05">
  <name>Task 5: Extend 20-Z-03 dashboard + cost-budget cron with degradation_rate_24h tile + alert</name>
  <files>src/app/api/insights/sentiment-health/route.ts, src/app/insights/sentiment-health/page.tsx, src/app/api/cron/cost-budget-check/route.ts</files>
  <read_first>
    - .planning/phases/20-real-sentiment-analysis/20-Z-03-PLAN.md (SentimentHealthResponse shape, cost-budget-check route)
    - src/app/api/insights/sentiment-health/route.ts (existing per-provider aggregation SQL)
    - src/app/api/cron/cost-budget-check/route.ts (existing 1.5× alert pattern)
    - src/app/insights/sentiment-health/page.tsx (existing tile rendering)
  </read_first>
  <action>
    **Step A — Extend the JSON endpoint** `src/app/api/insights/sentiment-health/route.ts`:

    Add a top-level `degradation_rate_24h` field to `SentimentHealthResponse`. Compute it via raw SQL:

    ```sql
    SELECT
      COUNT(*) FILTER (WHERE provider_id = 'lm-fallback')::float
        / NULLIF(COUNT(*), 0) AS degradation_rate_24h
    FROM provider_call_logs
    WHERE started_at > NOW() - INTERVAL '24 hours'
      AND provider_id IN ('finbert-hf', 'xenova-local', 'lm-fallback')
      AND status = 'ok';
    ```

    The denominator restricts to NLP-classifier providers so a quiet day for `yahoo` doesn't dilute the rate. Add the literal field to the response interface comment block in this file.

    **Step B — Extend the dashboard tile** `src/app/insights/sentiment-health/page.tsx`:

    Add a new top-of-page tile `<DegradationRateTile rate={data.degradation_rate_24h} />` rendering:
    - Big number: `(rate * 100).toFixed(1) + '%'`
    - Sub-text: "NLP fallback rate (last 24h)"
    - Color: green if ≤ 1%, amber if ≤ 5%, red if > 5%
    - Below: a per-provider breakdown row showing count + percentage of `finbert-hf`, `xenova-local`, `lm-fallback` from the same 24h window

    Reuse the existing `ProviderTile` component pattern from 20-Z-03 — do not introduce new component files unless necessary.

    **Step C — Extend the cost-budget cron** `src/app/api/cron/cost-budget-check/route.ts`:

    Add a `degradation_alert` block AFTER the existing 1.5× cost-budget block:

    ```typescript
    // Degradation alert (Plan 20-B-06, T-20-B-06-04)
    // Sustained NLP fallback rate > 5% over last 24h indicates upstream system breakage.
    const degradationResult = await prisma.$queryRaw<Array<{ rate: number | null }>>`
      SELECT COUNT(*) FILTER (WHERE provider_id = 'lm-fallback')::float
             / NULLIF(COUNT(*), 0) AS rate
      FROM provider_call_logs
      WHERE started_at > NOW() - INTERVAL '24 hours'
        AND provider_id IN ('finbert-hf', 'xenova-local', 'lm-fallback')
        AND status = 'ok'
    `;
    const degradationRate = degradationResult[0]?.rate ?? 0;
    const DEGRADATION_THRESHOLD = 0.05; // CONTEXT.md spec — 5%
    if (degradationRate > DEGRADATION_THRESHOLD) {
      alerts.push({
        type: 'degradation_alert',
        message: `NLP fallback rate ${(degradationRate * 100).toFixed(1)}% exceeds ${(DEGRADATION_THRESHOLD * 100).toFixed(0)}% threshold over last 24h. Check 20-Z-03 dashboard for failing upstream (HF endpoint, @xenova).`,
        severity: 'warning',
        rate: degradationRate,
        threshold: DEGRADATION_THRESHOLD,
      });
    }
    ```

    Cron auth: same Bearer CRON_SECRET pattern as the existing route — do not duplicate auth logic; this block runs inside the existing handler after the cost-budget block.
  </action>
  <verify>
    <automated>grep -q "degradation_rate_24h" src/app/api/insights/sentiment-health/route.ts && grep -q "lm-fallback" src/app/api/insights/sentiment-health/route.ts && grep -q "degradation_rate_24h\|DegradationRateTile" src/app/insights/sentiment-health/page.tsx && grep -q "degradation_alert" src/app/api/cron/cost-budget-check/route.ts && grep -q "0\.05" src/app/api/cron/cost-budget-check/route.ts && npx tsc --noEmit</automated>
  </verify>
  <done>Dashboard tile renders degradation_rate_24h; cost-budget cron alerts when > 5%; tsc clean</done>
</task>

<task type="auto" id="20-B-06-06">
  <name>Task 6: Write integration test — forced upstream failure → L&M fires + ProviderCallLog row</name>
  <files>tests/integration/lm-fallback.integration.test.ts</files>
  <read_first>
    - tests/integration/ (existing integration test conventions; live Neon)
    - .planning/phases/20-Z-03-PLAN.md (recordCallAsync + ProviderCallLog row shape)
    - src/lib/sentiment/per-message-pass.ts (Task 4 — fallback chain target)
  </read_first>
  <action>
    Create `tests/integration/lm-fallback.integration.test.ts`:

    ```typescript
    import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
    import { prisma } from '../../src/lib/db';

    // Mock the upstream classifiers BEFORE importing per-message-pass.
    vi.mock('../../src/lib/sentiment/finsentllm', () => ({
      classifyFinBERT: vi.fn().mockResolvedValue({
        score: null, confidence: null, model: 'finbert', error: 'mocked HF outage',
      }),
    }));
    vi.mock('../../src/lib/sentiment/pipeline-providers', () => ({
      classifyXenovaLocal: vi.fn().mockRejectedValue(new Error('mocked @xenova OOM')),
    }));

    import { classifyMessages } from '../../src/lib/sentiment/per-message-pass';

    describe('20-B-06 integration — L&M fallback fires when upstream paths fail', () => {
      let beforeCount = 0;

      beforeAll(async () => {
        const r = await prisma.providerCallLog.count({ where: { provider_id: 'lm-fallback' } });
        beforeCount = r;
      });

      it('returns L&M result when FinBERT throws AND @xenova throws', async () => {
        const results = await classifyMessages([
          { id: 'msg-test-1', text: 'revenue beat earnings expectations strongly' },
          { id: 'msg-test-2', text: 'lawsuit costs increase liability sharply' },
        ]);

        expect(results).toHaveLength(2);

        for (const r of results) {
          expect(r.nlp_path).toBe('l&m-fallback');
          expect(r.confidence).toBe(0.4);
          expect(r.classifier_version).toBe('loughran-mcdonald-2011');
          expect(r.score).not.toBeNull();
        }

        // Positive sentence should score > 0
        expect(results[0].score).toBeGreaterThan(0);
        // Negative sentence should score < 0
        expect(results[1].score).toBeLessThan(0);
      });

      it('writes ProviderCallLog row with provider_id="lm-fallback"', async () => {
        // withTelemetry fires async — give the microtask queue a tick.
        await new Promise(r => setTimeout(r, 200));

        const after = await prisma.providerCallLog.count({
          where: { provider_id: 'lm-fallback' },
        });
        expect(after).toBeGreaterThan(beforeCount);

        const recent = await prisma.providerCallLog.findFirst({
          where: { provider_id: 'lm-fallback' },
          orderBy: { started_at: 'desc' },
        });
        expect(recent).not.toBeNull();
        expect(recent?.status).toBe('ok');
        expect(recent?.cost_usd).toBe(0); // free per cost-estimators.ts
      });

      afterAll(async () => {
        // Cleanup: delete the test rows we inserted.
        await prisma.providerCallLog.deleteMany({
          where: { provider_id: 'lm-fallback', started_at: { gt: new Date(Date.now() - 60_000) } },
        });
      });
    });
    ```

    Run:
    ```bash
    npm run test:integration -- tests/integration/lm-fallback.integration.test.ts
    ```
    Both tests must pass against live Neon.
  </action>
  <verify>
    <automated>[ -f tests/integration/lm-fallback.integration.test.ts ] && grep -q "lm-fallback" tests/integration/lm-fallback.integration.test.ts && grep -q "providerCallLog" tests/integration/lm-fallback.integration.test.ts && npm run test:integration -- tests/integration/lm-fallback.integration.test.ts 2>&1 | grep -qE "(passed|✓ 2)"</automated>
  </verify>
  <done>Integration test green: forced upstream failure → L&M fires → ProviderCallLog row written</done>
</task>

<task type="auto" id="20-B-06-07">
  <name>Task 7: Ship MODEL-CARD-loughran-mcdonald.md per 20-Z-02 template + staleness CI script</name>
  <files>docs/cards/MODEL-CARD-loughran-mcdonald.md, scripts/check-lm-lexicon-age.ts, src/lib/sentiment/lm-classifier.ts, package.json</files>
  <read_first>
    - docs/templates/MODEL-CARD-template.md (20-Z-02 Mitchell-2019 template — all sections)
    - .planning/phases/20-real-sentiment-analysis/20-Z-02-PLAN.md (check-model-cards script behavior — frontmatter requirements)
    - data/lexicons/loughran-mcdonald.csv (Task 1 — for last_validated date)
    - src/lib/sentiment/lm-classifier.ts (Task 3 — for @model-card annotation)
  </read_first>
  <action>
    **Step A — Create `docs/cards/MODEL-CARD-loughran-mcdonald.md`** following the 20-Z-02 Mitchell-2019 template. Required sections (no `<<TODO>>` placeholders left):

    - **Frontmatter**: `last_validated: 2026-05-10`, `retrain_cadence: 365d`, `model_version: loughran-mcdonald-2011`, `author: Cipher maintainers`
    - **Model Details**: Loughran & McDonald 2011 finance-specific sentiment lexicon, ~80k words, finance domain (10-K filings)
    - **Intended Use**: EMERGENCY FALLBACK ONLY — last-resort classifier in per-message NLP chain when Gemini per-doc, FinBERT-HF endpoint, AND @xenova local all fail. Not for primary sentiment classification.
    - **Factors**: English-language only; finance/business text; no training on social media slang or emoji
    - **Metrics**: N/A — bag-of-words classifier has no probabilistic outputs to calibrate; confidence hardcoded at 0.4 floor (literature default per L&M 2011 §IV)
    - **Evaluation Data**: Validated against the 6 canonical sentences in unit test fixture (3 polarities × 2 sentence forms)
    - **Training Data**: Loughran & McDonald 2011 Master Dictionary (Notre Dame SRAF). License: open for research and commercial use, attribution required.
    - **Quantitative Analyses / OOD Behavior**: Bag-of-words ignores syntax, irony, sarcasm. Negation handled within 3-token window for 'not'/'no'/'never' (L&M 2011 §III.D + Hutto-Gilbert 2014 VADER convention). Multi-clause sentences with mixed polarity average out. Numeric/currency tokens ignored.
    - **Ethical Considerations**: Lexicon trained on US corporate 10-K filings — may underrepresent international or non-corporate vocabulary. Confidence floor (0.4) prevents downstream consumers from treating this as authoritative.
    - **Caveats / Recommendations**:
      - Confidence is HARDCODED at 0.4 — never elevates regardless of input
      - 20-B-03 temperature scaling MUST NOT be applied (T-scaling assumes probabilistic classifier; bag-of-words has no calibration target)
      - If degradation_rate_24h > 5% sustained → check 20-Z-03 dashboard for failing upstream (HF endpoint health page, @xenova process memory)
      - Refresh annually when SRAF republishes (see `data/lexicons/README.md` refresh procedure)
    - **Failure Mode Runbook** (T-20-B-06-04):
      1. Open `/insights/sentiment-health`, identify failing upstream from per-provider error_rate
      2. If FinBERT-HF: check HF status page; if endpoint cold-started, wait 5min and retry
      3. If @xenova local: check process memory (lazy-loaded model is ~440MB); restart server if OOM
      4. If both upstream healthy but L&M still firing: investigate per-message-pass.ts call graph

    **Step B — Add `// @model-card:` annotation** to `src/lib/sentiment/lm-classifier.ts` top JSDoc block:

    ```typescript
    // @model-card: docs/cards/MODEL-CARD-loughran-mcdonald.md
    ```

    Place it as the first line of the file or in the existing top header comment. This satisfies the 20-Z-02 `check-model-cards` static analysis.

    **Step C — Create `scripts/check-lm-lexicon-age.ts`**:

    ```typescript
    #!/usr/bin/env node
    // scripts/check-lm-lexicon-age.ts
    //
    // T-20-B-06-01 mitigation: Notre Dame republishes the L&M Master Dictionary
    // annually. Warn if the committed CSV mtime is > 365 days old.
    //
    // Exit codes:
    //   0 — fresh (mtime within MAX_AGE_DAYS)
    //   1 — stale; refresh per data/lexicons/README.md procedure
    //
    // Run as a daily cron OR as a CI gate before deploy.

    import { stat } from 'node:fs/promises';
    import { join } from 'node:path';

    const LEXICON_PATH = join(process.cwd(), 'data', 'lexicons', 'loughran-mcdonald.csv');
    const MAX_AGE_DAYS = 365;

    export async function checkLexiconAge(maxAgeDays = MAX_AGE_DAYS): Promise<{ stale: boolean; ageDays: number }> {
      const stats = await stat(LEXICON_PATH);
      const ageMs = Date.now() - stats.mtime.getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);
      return { stale: ageDays > maxAgeDays, ageDays };
    }

    // Run when invoked as a script
    if (import.meta.url === `file://${process.argv[1]}`) {
      checkLexiconAge().then(({ stale, ageDays }) => {
        if (stale) {
          console.error(`L&M lexicon is ${ageDays.toFixed(0)} days old (max ${MAX_AGE_DAYS}). Refresh per data/lexicons/README.md.`);
          process.exit(1);
        } else {
          console.log(`L&M lexicon age: ${ageDays.toFixed(0)} days (within ${MAX_AGE_DAYS} threshold).`);
          process.exit(0);
        }
      }).catch(err => {
        console.error(`Failed to stat lexicon: ${err.message}`);
        process.exit(2);
      });
    }
    ```

    **Step D — Wire `package.json` script**:
    ```json
    "scripts": {
      "check-lm-lexicon-age": "tsx scripts/check-lm-lexicon-age.ts"
    }
    ```

    **Step E — Verify 20-Z-02 check-model-cards picks it up**:
    ```bash
    npm run check-model-cards   # exit 0 — card recognized
    npm run check-lm-lexicon-age # exit 0 — fresh CSV
    ```
  </action>
  <verify>
    <automated>[ -f docs/cards/MODEL-CARD-loughran-mcdonald.md ] && grep -q "Loughran" docs/cards/MODEL-CARD-loughran-mcdonald.md && grep -q "last_validated" docs/cards/MODEL-CARD-loughran-mcdonald.md && grep -q "retrain_cadence" docs/cards/MODEL-CARD-loughran-mcdonald.md && ! grep -q "<<TODO>>" docs/cards/MODEL-CARD-loughran-mcdonald.md && grep -q "@model-card: docs/cards/MODEL-CARD-loughran-mcdonald.md" src/lib/sentiment/lm-classifier.ts && [ -f scripts/check-lm-lexicon-age.ts ] && grep -q "365" scripts/check-lm-lexicon-age.ts && grep -q "check-lm-lexicon-age" package.json && npm run check-lm-lexicon-age 2>&1 | grep -qv "stale" && npm run check-model-cards</automated>
  </verify>
  <done>MODEL-CARD shipped per 20-Z-02 template; lm-classifier.ts annotated; staleness script exits 0 today; check-model-cards passes</done>
</task>

<task type="auto" id="20-B-06-08">
  <name>Task 8: Final composite gate — run full test suites + grep verifications + commit</name>
  <files>(no new files; runs test suites + commits all prior task outputs)</files>
  <read_first>
    - All files modified by Tasks 1-7
    - .planning/phases/20-real-sentiment-analysis/20-Z-06-PLAN.md (composite Phase-20 done gate — this plan must not regress it)
  </read_first>
  <action>
    Run all verification suites:

    ```bash
    # Unit tests (Vitest)
    npm test

    # Integration tests (live Neon)
    npm run test:integration

    # E2E (Playwright)
    npm run test:e2e

    # Static gates
    npm run check-model-cards
    npm run check-lm-lexicon-age
    npm run check-telemetry-coverage  # from 20-Z-03; should still pass
    npx tsc --noEmit

    # Manual greps that the Hard Cleanup Gate enforces
    grep -c "withTelemetry('lm-fallback'" src/lib/sentiment/lm-classifier.ts  # >= 1
    wc -l data/lexicons/loughran-mcdonald.csv                                 # >= 80000
    grep -c "classifyByLM" src/lib/sentiment/per-message-pass.ts              # >= 1

    # Composite Phase-20 gate (from 20-Z-06)
    npm run phase-20-status  # should still exit non-zero overall (other plans incomplete) but the lm-fallback contributions should not regress it
    ```

    All must pass / exit 0 (except `phase-20-status` which is allowed to be non-zero pending other plans). If anything fails, fix before commit — the Hard Cleanup Gate is mandatory.

    Commit (one commit per the project convention):

    ```bash
    git add data/lexicons/ \
            src/lib/sentiment/lm-classifier.ts \
            src/lib/sentiment/per-message-pass.ts \
            src/lib/telemetry/withTelemetry.ts \
            src/lib/telemetry/cost-estimators.ts \
            src/app/insights/sentiment-health/page.tsx \
            src/app/api/insights/sentiment-health/route.ts \
            src/app/api/cron/cost-budget-check/route.ts \
            docs/cards/MODEL-CARD-loughran-mcdonald.md \
            scripts/check-lm-lexicon-age.ts \
            package.json \
            tests/sentiment/lm-classifier.unit.test.ts \
            tests/integration/lm-fallback.integration.test.ts

    git commit -m "$(cat <<'EOF'
    feat(20-B-06): Loughran-McDonald lexicon last-resort sentiment fallback

    Add L&M 2011 finance-specific bag-of-words classifier as the tertiary
    fallback in the per-message NLP chain (FinBERT-HF → @xenova → L&M → null).
    Confidence hardcoded at 0.4 (literature floor); negation handled within
    3-token window per L&M 2011 §III.D. Wraps in withTelemetry('lm-fallback')
    so 20-Z-03 dashboard surfaces degradation_rate_24h; cost-budget cron
    alerts when sustained > 5%. MODEL-CARD shipped per 20-Z-02 template;
    staleness CI gate warns if dictionary CSV > 365 days old.

    Per CONTEXT.md line 118 (verbatim spec) + S6 (telemetry) + S4 (model card).
    EOF
    )"
    ```

    Then write `.planning/phases/20-real-sentiment-analysis/20-B-06-SUMMARY.md` per `$HOME/.claude/get-shit-done/templates/summary.md`.
  </action>
  <verify>
    <automated>npm test && npm run test:integration && npm run check-model-cards && npm run check-lm-lexicon-age && npx tsc --noEmit && [ "$(grep -c "withTelemetry('lm-fallback'" src/lib/sentiment/lm-classifier.ts)" -ge 1 ] && [ "$(wc -l < data/lexicons/loughran-mcdonald.csv)" -ge 80000 ] && git log -1 --pretty=%B | grep -q "20-B-06"</automated>
  </verify>
  <done>All test suites green; static gates pass; Hard Cleanup Gate satisfied; commit landed; SUMMARY written</done>
</task>

</tasks>

<verification>

## Numerical Acceptance (S8)

| Gate | Command | Pass Criterion |
|------|---------|----------------|
| Lexicon size | `wc -l data/lexicons/loughran-mcdonald.csv` | ≥ 80000 |
| Lexicon header | `head -1 data/lexicons/loughran-mcdonald.csv` | contains `Word`, `Negative`, `Positive`, `Uncertainty`, `Litigious` |
| Attribution | `grep -c "Loughran.*McDonald.*2011" data/lexicons/README.md` | ≥ 1 |
| Source URL | `grep -c "https://sraf.nd.edu/loughranmcdonald-master-dictionary/" data/lexicons/README.md` | ≥ 1 |
| Classifier signature | `grep -c "export function classifyByLM" src/lib/sentiment/lm-classifier.ts` | === 1 |
| Singleton signature | `grep -c "export function loadLMDictionary" src/lib/sentiment/lm-classifier.ts` | === 1 |
| Pinned version | `grep -c "LM_CLASSIFIER_VERSION = 'loughran-mcdonald-2011'" src/lib/sentiment/lm-classifier.ts` | === 1 |
| Telemetry wrapping | `grep -c "withTelemetry('lm-fallback'" src/lib/sentiment/lm-classifier.ts` | ≥ 1 |
| Telemetry enum extended | `grep -c "'lm-fallback'" src/lib/telemetry/withTelemetry.ts` | ≥ 1 |
| Cost table extended | `grep -c "'lm-fallback': 0" src/lib/telemetry/cost-estimators.ts` | ≥ 1 |
| Fallback chain order | inline node script (Task 4 verify) | FinBERT < @xenova < L&M positions |
| Model card present | `[ -f docs/cards/MODEL-CARD-loughran-mcdonald.md ]` | true |
| Model card no placeholders | `! grep -q "<<TODO>>" docs/cards/MODEL-CARD-loughran-mcdonald.md` | true |
| Model card annotation | `grep -c "@model-card: docs/cards/MODEL-CARD-loughran-mcdonald.md" src/lib/sentiment/lm-classifier.ts` | === 1 |
| Staleness threshold | `grep -c "365" scripts/check-lm-lexicon-age.ts` | ≥ 1 |
| Staleness exits 0 today | `npm run check-lm-lexicon-age` | exit 0 |
| Unit tests | `npx vitest run tests/sentiment/lm-classifier.unit.test.ts` | all green, ≥ 6 cases |
| Integration test | `npm run test:integration -- tests/integration/lm-fallback.integration.test.ts` | both tests green |
| Dashboard tile | `grep -c "degradation_rate_24h" src/app/api/insights/sentiment-health/route.ts` | ≥ 1 |
| Dashboard tile UI | `grep -cE "degradation_rate_24h\|DegradationRateTile" src/app/insights/sentiment-health/page.tsx` | ≥ 1 |
| Alert threshold | `grep -c "0\.05" src/app/api/cron/cost-budget-check/route.ts` | ≥ 1 |
| Alert block | `grep -c "degradation_alert" src/app/api/cron/cost-budget-check/route.ts` | ≥ 1 |
| Type check | `npx tsc --noEmit` | exit 0 |
| Test suites | `npm test && npm run test:integration && npm run test:e2e` | all exit 0 |
| Model card scaffold | `npm run check-model-cards` | exit 0 |
| Telemetry coverage (Z-03) | `npm run check-telemetry-coverage` | exit 0 (lm-fallback covered) |

</verification>

<success_criteria>
1. **Coverage during outages**: When FinBERT-HF endpoint and @xenova local both fail (mocked or real), `classifyMessages()` returns L&M-tagged results for 100% of input messages instead of null sentinels — verified by integration test.
2. **Confidence floor invariant**: Every L&M result carries `confidence === 0.4` regardless of input length, polarity, or matched_words count — verified by unit tests across all categories.
3. **Telemetry observability**: Every `classifyByLM()` invocation produces a `provider_call_logs` row with `provider_id='lm-fallback'`, `cost_usd=0`, `status` in {'ok','error'} — verified by integration test row count + 20-Z-03 dashboard tile rendering non-null `degradation_rate_24h`.
4. **Degradation alert active**: When `count(provider_id='lm-fallback', last 24h) / count(NLP-classifier providers, last 24h) > 0.05`, the daily cost-budget cron emits a `degradation_alert` — verified by inline cron handler logic + grep.
5. **Pinned classifier version**: Every SentimentObservation row from this path carries `classifier_version='loughran-mcdonald-2011'` — verified by integration test reading back the row.
6. **Refresh procedure documented**: A future maintainer can refresh the dictionary by following the 5-step procedure in `data/lexicons/README.md` without reading any source code — verified by README content.
7. **No T-scaling regression**: 20-B-03 temperature scaling, when shipped, MUST NOT be applied to L&M scores. This plan documents the rule in `lm-classifier.ts` header AND in MODEL-CARD; the actual gate code lives in 20-B-03 (forward reference). Tracked as a known integration point.
8. **Hard Cleanup Gate**: All 12 gates in the universal_preamble pass before commit; commit is single, atomic, and includes the SUMMARY.md.
</success_criteria>

<output>
After completion, create `.planning/phases/20-real-sentiment-analysis/20-B-06-SUMMARY.md` per `$HOME/.claude/get-shit-done/templates/summary.md` with:
- Phase / Plan / Date / Commit SHA
- What was built (lexicon + classifier + integration + telemetry tile + alert + model card + staleness script)
- Numerical results (lexicon row count, test pass count, dashboard render confirmation)
- Hand-off notes for 20-B-03 (T-scaling MUST exclude `classifier_version='loughran-mcdonald-2011'`)
- Hand-off notes for ongoing operations (run `npm run check-lm-lexicon-age` annually; refresh per `data/lexicons/README.md`)
- Threats mitigated vs accepted (T-20-B-06-{01..05} status table)
</output>
