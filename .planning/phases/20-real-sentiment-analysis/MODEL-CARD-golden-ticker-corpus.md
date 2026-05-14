# Model Card — Golden Ticker Corpus (20-D-04)

> Mitchell-2019 model card for the 8-ticker golden corpus that anchors
> Phase-20 report-generation regression coverage.

## Overview

The Golden Ticker Corpus is a curated set of 8 `SourcePackage` + frozen
`AnalysisResult` pairs spanning 8 security-type categories. It is the
regression-test substrate for every report-touching change in Phase 20+.

- **Curation date:** 2026-05-11
- **Owner plan:** 20-D-04
- **Catalog:** `tests/golden-tickers/_manifest.json`
- **Fixtures:** `tests/golden-tickers/_sources/`, `tests/golden-tickers/_reports/`
- **Exemplars:** `tests/golden-tickers/_human_labels/` (32 + 5 starter pairs = 37)
- **Rotation pool:** `tests/golden-tickers/_micro_cap_pool.json` (21 candidates)

## Intended use

- Regression coverage for report-generation changes — numeric grounding,
  citation coverage (soft-ref to 20-D-02), per-claim verification (20-D-03),
  word-count, no-5xx-sentinel.
- Calibration corpus for 20-Z-05's LLM-as-judge harness via the 32-exemplar
  human-label set (unlocks the `n ≥ 30` Pearson ship-gate).
- CI gate via `.github/workflows/golden-ticker-suite.yml` — required-for-merge
  on PRs touching the report-generation surface.

## Out-of-scope use

- **Not a backtest dataset.** The corpus does not generate alpha; it
  regression-tests report quality.
- **Not a public benchmark.** Corpus is internal; 7 of 8 tickers are
  US-listed public companies; no privacy concerns; but the snapshots reflect
  a specific point-in-time data state and are not suitable for cross-team
  benchmarking outside Cipher.
- **Not a sentiment-classifier training set.** Exemplars exist for LLM-judge
  calibration only — not as supervised training data.

## Category boundaries (CONTEXT.md §S9 + line 140)

| Category | Symbol | Boundary criterion |
|---|---|---|
| large-cap-equity | AAPL | market_cap > $1T |
| mid-cap-equity | DKNG | $5B < market_cap < $25B |
| meme-echo-chamber | GME | non-negotiable; originating-bug ticker |
| recently-public | SOFI | IPO within last 36 months |
| ETF | SPY | security_type='etf' |
| SPAC | DWAC | security_type='spac' or documented |
| ADR | TSM | foreign primary listing |
| micro-cap-low-coverage | ROTATING | market_cap < $300M; daily_avg_volume_30d < 500k; analyst_count ≤ 1 |

Micro-cap eligibility thresholds (300M / 500k / 1) are the operational
definition of "low-coverage micro-cap" used by `scripts/rotate-micro-cap.ts`.
Any future change to these thresholds is an explicit recalibration and must
update this card alongside the rotation script.

## Known limitations

- **8 US-listed tickers** — no foreign-only primary listings (TSM is the only
  ADR proxy for that category).
- **No closed-end funds, preferred shares, or convertible bonds** — these
  security types have separate quirks that are not exercised by the corpus.
- **Static curation date 2026-05** — corpus refresh required if a category
  boundary breaks (e.g., SOFI ages out of recently-public by mid-2027).
- **Single-rater labeling** — the 32-exemplar set is labeled by a single
  operator. Inter-rater reliability is not measured; cross-rater calibration
  is deferred to Phase 24+.
- **Micro-cap pool from a single 2026-05-01 snapshot** — pool refresh is
  operator-driven via the follow-up `scripts/snapshot-microcap-pool.ts`.
- **Bootstrap fixtures < 500 words** — the initial `_reports/` payloads are
  placeholder demo reports. The regression suite detects bootstrap fixtures
  via `__recording.gemini_model_revision` prefix `bootstrap-*` and relaxes
  the word-count floor from 500 to 50 with a WARN. Operator-recorded
  fixtures via `scripts/record-frozen-report.ts` flip this back to strict
  500 automatically.

## Failure modes / known biases

- **Curation bias** (T-20-D-04-03) — operator unconsciously picks "easy"
  tickers. Mitigated by the pre-specified 8-category boundary, by GME's
  non-negotiable adversarial role, and by the synthetic-injection test
  proving the gates fire on bad data.
- **Staleness** (T-20-D-04-01) — manifest `version` field surfaces freshness;
  `check-golden-tickers` WARNs at >180 days. Quarterly review per
  `RUNBOOK-CURATION.md`.
- **Prompt-bump invalidation** (T-20-D-04-02) — 20-D-01's recording manifest
  pins prompt versions per fixture; the `check-numeric-grounding` CLI
  cross-validates the pins against 20-Z-04's registry, surfacing a precise
  re-record message when a fixture goes stale.
- **Fixture flake** (T-20-D-04-04) — per-ticker `describe` blocks in the
  regression suite name the broken fixture explicitly so a single flake
  doesn't mask the others.
- **Exemplar count attrition** (T-20-D-04-05) — `check-golden-tickers`
  asserts `_human_labels/*.json` count ≥30; CI workflow blocks merge on
  shortfall.

## Retrain / refresh cadence

- **Monthly** — micro-cap slot rotation via Vercel cron at
  `/api/cron/rotate-micro-cap` (`0 9 1 * *`).
- **Quarterly** — full corpus health review per RUNBOOK-CURATION.md.
- **On prompt bump** — re-record affected frozen reports via 20-D-01's
  `record-frozen-report.ts`.
- **On regression** — per-ticker pass/fail in the suite output names the
  broken fixture.

## Dependencies

- **20-D-01** — owns the `SourcePackage` + frozen-report fixture format +
  `scripts/record-frozen-report.ts` + `numericGroundingCheck`.
- **20-D-02** — citation-coverage gate (soft-ref; no-op when `anchors`
  payload not yet populated on the report shape).
- **20-D-03** — per-claim verifier (`verifyClaimsBatch`); composed by the
  orchestrated suite under `RUN_LIVE_VERIFIER=true`.
- **20-Z-04** — prompt registry; bumps trigger re-record cycles via the
  pin-validation cross-check.
- **20-Z-05** — eval harness consumer of the 32-exemplar set; unlocks the
  `n ≥ 30` Pearson ship-gate.

## Operator handoffs

See `tests/golden-tickers/RUNBOOK-CURATION.md` for:

- Adding exemplars (4-pair structure, clean vs. degraded)
- Monthly rotation review (eligibility re-check, recording, exemplar adds)
- Quarterly corpus health review
- Prompt-bump re-record handoff to 20-D-01's RUNBOOK
- Fixture-flake bypass (≤7-day operator override)

## Ethical considerations

- All tickers are **public companies**; no PII or proprietary data.
- Human-label exemplars contain **synthetic** baseline/candidate texts
  authored by the operator — not extracted from any user's actual research
  output.
- The corpus does NOT publish externally; it lives only in the repo + CI.
- Phase 20 explicitly does NOT publish per-user calibration data
  (CONTEXT.md §S10) — public publication is gated to Phase 29 with
  legal-counsel review.

## Status

- 2026-05-11 — Plan 20-D-04 committed. Manifest, 32-exemplar set, rotation
  script, orchestrated suite, synthetic-injection proof-of-realness, CI
  workflow, CLI runner, model card all landed. Bootstrap fixtures in place;
  strict word-count enforcement awaits operator re-record.
