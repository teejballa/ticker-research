---
model_name: citation-coverage
model_version: hybrid-regex-llm-v1
card_format: mitchell-2019
last_validated: 2026-05-13
retrain_cadence: P30D
author: tjameswalsh@icloud.com
source_files:
  - src/lib/eval/citation-coverage.ts
  - src/lib/eval/citation-coverage.types.ts
  - src/lib/eval/claim-extraction-regex.ts
  - src/lib/eval/claim-extraction-llm.ts
  - src/lib/eval/claim-merge.ts
  - src/lib/eval/cohens-kappa.ts
  - scripts/eval-citation-coverage.ts
  - src/app/api/cron/eval-citation-coverage/route.ts
---

# MODEL CARD — citation-coverage (Plan 20-D-02)

**Format**: Mitchell-2019 model card.
**Status**: shipped (audit-only); the build-blocking gate runs against
fixtures that have `citations_v2` populated. Bootstrapped fixtures pre-19-C-07
are skipped (see Known limitations).

## Intended use

Build-blocking audit of report claim → citation linkage. For every
qualitative sentence in a rendered `AnalysisResult` (executive_summary,
investment_thesis, bullish_signals, bearish_signals, key_risks,
valuation_context, future_projection, sentiment_intelligence,
community_intelligence, engine_calibration), the metric checks whether at
least one entry in `citations_v2` (from Plan 19-C-07) supports the claim.

The metric is computed by `scripts/eval-citation-coverage.ts` over the 8
golden tickers (`tests/golden-tickers/_reports/`). A weekly Vercel cron
(`/api/cron/eval-citation-coverage`, schedule `0 9 * * 0`) regenerates the
breakdown for the future `/insights/citation-coverage` page.

The metric is OUT OF SCOPE for:

- Numeric grounding — Plan 20-D-01.
- Per-claim NLI verification (CoVe Pass-2) — Plan 19-C-07 / 20-D-03.
- URL liveness — Plan 19-C-07's existing verification path.

## Architecture

Hybrid claim extractor:

1. **Algorithm A — regex** (`src/lib/eval/claim-extraction-regex.ts`).
   Sentence-split on `/(?<=[.!?])\s+(?=[A-Z])/`, drop boilerplate via
   `EXCLUSION` regex, retain sentences matching `CLAIM_LANGUAGE` (modal
   verbs + claim-language verbs like *announced*, *expects*, *forecasts*).
   Deterministic, fast, zero-token cost.

2. **Algorithm B — LLM-judge** (`src/lib/eval/claim-extraction-llm.ts`).
   Claude Opus 4.7 via the `eval-claim-extraction-v1` prompt registered in
   the 20-Z-04 registry. `temperature: 0`, `max_tokens: 4000`, no cache
   headers. Cost-disciplined: ONE call per (section_text, prompt_version)
   tuple, opt-in via `RUN_LLM_CLAIM_EXTRACTION=true`.

3. **Merge** (`src/lib/eval/claim-merge.ts`). Deduplicate the union by
   bag-of-words cosine > `COSINE_DEDUPE_THRESHOLD` (0.85). On collision,
   the lower `start_char` wins; both-method survivors are tagged
   `source_method: 'merged'`.

Citation matching (`citationCoverage`):

- **Rule A — anchor proximity**: any citation whose URL/domain substring
  is within `±ANCHOR_WINDOW_CHARS` (50) of the claim's `start_char`
  marks the claim SUPPORTED.
- **Rule B — keyword overlap**: bag-of-words cosine between the claim
  text and the citation's `url + ' ' + (title ?? '')` ≥
  `KEYWORD_OVERLAP_MIN` (0.5) marks the claim SUPPORTED.
- Rules are tried in order; first hit wins. If neither fires, the claim
  is added to `unsupported`.

## Training data + parameter origin

- **No training step.** The metric is rule-based; the LLM-judge is
  zero-shot. Parameters are spec absolutes (`COVERAGE_OVERALL_MIN`,
  `COVERAGE_SECTION_MIN`) or heuristic constants documented inline in
  `src/lib/eval/citation-coverage.types.ts`.
- **Future labeled set**: a 100-claim human-labeled corpus at
  `tests/golden-tickers/_claim_labels.json` is planned (Plan 20-D-02
  Tasks 5/7) for the Cohen's kappa (regex vs LLM) ship-gate. Deferred
  to a follow-up plan since the label-curation work was out of scope
  for the current execution slice.

## Evaluation metrics

| Metric                   | Floor | Source                              |
| ------------------------ | ----- | ----------------------------------- |
| `coverage_pct` (overall) | 80    | CONTEXT.md §S8                      |
| `per_section[s]` floor   | 60    | CONTEXT.md §S9                      |
| Cohen's kappa (regex↔LLM)| 0.7   | Future ship gate — labeled set TBD  |

The CI gate (`npm run check-citation-coverage`) trips when ANY fixture-
with-citations falls below either floor. Fixtures lacking `citations_v2`
are skipped, not failed (see Known limitations).

## Known failure modes

- **Regex misses passive-voice claims.** ("Should management deliver on
  guidance, the shares appear poised to re-rate.") Mitigation: the LLM-
  judge complements regex; their disagreement on the planned 100-claim
  labeled set is the future kappa ship-gate.
- **Rule B over-credits common-vocabulary claims.** Generic phrases like
  "the company will" risk matching unrelated citations. Mitigation:
  stopword drop in `bagOfWords` (~50-word inline list) + rule ordering
  (Rule A wins when both fire). Synthetic-injection integration test
  (`tests/integration/citation-coverage.integration.test.ts`) injects 3
  fabricated unsupported claims with disjoint vocab and asserts the
  matcher does NOT vacuously pass them.
- **Sparse-source segments hover near 80%.** Micro-cap and SPAC tickers
  have fewer total citations available; the 60% per-section floor is
  the safety valve. Per-segment expectations:

| Ticker class    | Target `coverage_pct` |
| --------------- | --------------------- |
| AAPL / SPY / TSM | ≥ 90%                 |
| DKNG / SOFI      | ≥ 85%                 |
| GME / DWAC / micro-cap | ≥ 80%           |

## Known limitations

- The 8 frozen fixtures bootstrapped by 20-D-01 (`tests/golden-tickers/
  _reports/*.report.json`) do NOT yet carry `citations_v2`. The CLI
  treats those fixtures as SKIPPED (gate not enforced) so the ship gate
  does not fail vacuously on missing data. The gate begins enforcing
  once 20-D-04 re-records the fixtures with citations populated, OR once
  Plan 20-D-02's follow-up tasks (labeled set + golden-citation injection)
  land.
- The Cohen's kappa script (`scripts/eval-claim-extraction-kappa.ts`),
  100-claim labeled set, and `/insights/citation-coverage` page are
  PLANNED but not yet shipped — see SUMMARY.md follow-ups.
- The `extractClaimsLLM` path emits cost-per-call to stdout only;
  ProviderCallLog telemetry waits on Plan 20-Z-03's wrapper extension
  for non-Gemini eval calls.

## Out of scope

- Numeric span grounding (Plan 20-D-01).
- Per-claim NLI verification (Plan 20-D-03).
- URL liveness re-verification (Plan 19-C-07's verifier).

## Maintenance

- **Recalibration cadence**: monthly. Re-run `npm run eval-citation-coverage`
  after every meaningful change to `src/lib/research-brief.ts`,
  `src/lib/gemini-analysis.ts`, `src/components/ResearchReport.tsx`, or
  any prompt under `src/lib/prompts/_v*/`.
- **Weekly cron**: `/api/cron/eval-citation-coverage` writes
  `reports/citation-coverage-{YYYY-MM-DD}.{json,md}` every Sunday 09:00
  UTC. Operator review on Mondays.
- **Snapshot refresh** (future): `npm run refresh-llm-claim-snapshot`
  (planned) regenerates the LLM-method snapshot when prompts change.

## References

- Mitchell, M. et al. 2019. "Model Cards for Model Reporting." *FAT\* '19*.
- CONTEXT.md §S8/§S9 (Phase 20) — citation-coverage ship gates.
- Plan 19-C-07 — `citations_v2` schema + URL sanitization.
- Plan 20-Z-04 — prompt registry + `eval-claim-extraction-v1` registration.
- Plan 20-Z-05 — judge.ts SDK pattern (lazy client, `_resetClientForTests`).
