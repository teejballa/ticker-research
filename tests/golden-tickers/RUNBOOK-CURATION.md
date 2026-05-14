# Golden-Ticker Corpus — Curation Runbook (20-D-04)

This runbook is the **operator's manual** for maintaining the 8-ticker golden
corpus. 20-D-01's `RUNBOOK.md` covers the *recording* mechanics (script
invocation, `--temperature=0`, `--pin-prompts`). This runbook covers *which*
tickers and exemplars to record and *how* to rotate the micro-cap slot.

## When to use this runbook

- Adding a new exemplar to `_human_labels/`
- Reviewing the monthly micro-cap rotation PR
- Quarterly corpus health review (every 90 days)
- Responding to a `WARN: manifest age >180 days` from `check-golden-tickers`
- Replacing a stale ticker (e.g., SOFI no longer "recently-public" by 2027)

## Per-category curation rubric

| Category | Symbol (initial) | Rubric criteria |
|---|---|---|
| large-cap-equity | AAPL | market_cap > $1T; dense analyst coverage; multi-source `FieldOrigin` |
| mid-cap-equity | DKNG | $5B < market_cap < $25B; volatility profile; retail-heavy StockTwits |
| meme-echo-chamber | GME | non-negotiable; originating-bug ticker; high `stocktwits_bull_pct`; low author diversity |
| recently-public | SOFI | IPO date within last 36 months; sparse historical SEC filings |
| ETF | SPY | `security_type='etf'`; fundamentals MOSTLY null; market_data present |
| SPAC | DWAC | `security_type='spac'` or documented in `sec_filings`; thin fundamentals |
| ADR | TSM | foreign primary listing; ADR-specific disclosures from `anthropic-search` |
| micro-cap-low-coverage | ROTATING | market_cap < $300M; daily_avg_volume_30d < 500k; analyst_count ≤ 1 |

## Human-label exemplar procedure (4 pairs per ticker, 32 total)

For each ticker, commit 4 baseline-vs-candidate pairs across two tiers:

- **2 'clean' pairs** — baseline and candidate are both well-grounded; candidate
  may add an extra citation or improve hedging. Expected `human_scores` cluster
  ≥4 on first 3 dimensions.
- **2 'degraded' pairs** — candidate introduces a quality regression on ≥2
  dimensions (unsourced numbers, dropped citations, unhedged claims, ignored
  contradictions). Expected `human_scores` ≤2 on the regressed dimensions.

**GME is special**: `gme-crowded-degraded.json` MUST simulate the originating
bug (100% bullish single-source vendor tag → thesis), with
`contradiction_handling=0`. This is non-negotiable adversarial coverage.

Per-dimension std dev across the 32-corpus must stay > 0.5 on all 5
`JudgeDimensions` so 20-Z-05's Pearson denominator is well-defined.
`check-golden-tickers` fails the build if std drops below 0.5 on any dimension.

### Naming convention

`{symbol}-{pair-descriptor}.json` where `pair-descriptor` is one of:

- `{bullish|bearish|neutral|mixed|crowded}-{clean|degraded}`

E.g., `aapl-bullish-clean.json`, `gme-crowded-degraded.json`,
`spy-neutral-clean.json`, `dwac-mixed-degraded.json`.

## Monthly micro-cap rotation

The `/api/cron/rotate-micro-cap` cron runs on the 1st of each month at 09:00
UTC. It writes the proposed symbol into `tests/golden-tickers/_manifest.json`
and updates `tests/golden-tickers/_micro_cap_pool.json` history atomically.
Operator review of the resulting PR:

1. Verify the symbol still meets eligibility — `scripts/rotate-micro-cap.ts`
   checks the pool entry but does not re-fetch live data. Re-fetch via the
   Cipher production pipeline to confirm before approving.
2. Record the SourcePackage + frozen report via 20-D-01's
   `record-frozen-report.ts`.
3. Add 4 human-label exemplars for the new symbol — total exemplar count must
   stay ≥30.
4. Merge the PR.

**Pool exhaustion** (every candidate selected within 12 months) — refresh
`_micro_cap_pool.json` via a follow-up snapshot script
(`scripts/snapshot-microcap-pool.ts`; out of scope for 20-D-04).

## Quarterly corpus health review (every 90 days)

1. Re-confirm each of the 7 static tickers still represents its category.
2. Re-confirm GME's role as the adversarial meme/echo-chamber ticker
   (replace **only** if the crowded-consensus dynamic disappears — unlikely).
3. SOFI specifically — if IPO date > 36 months at review time, replace with a
   more recent IPO from the recently-public pool.
4. Update `_manifest.json` `version` to today's ISO date.
5. Run `npm run check-golden-tickers` to confirm green.

## Prompt-bump re-record handoff (20-Z-04 → 20-D-01)

When 20-Z-04's prompt registry bumps a version that affects any fixture:

1. `check-golden-tickers` (via 20-D-01's `check-numeric-grounding`) fails with
   the precise remediation message naming the fixture.
2. Follow 20-D-01's `RUNBOOK.md` to re-record the affected reports:
   ```bash
   npm run record-frozen-report -- --ticker <sym> --pin-prompts latest
   ```
3. Commit the new `_reports/{sym}.report.json` + updated
   `_meta/recording-manifest.json`.

## Operator-only bypass for fixture flake (T-20-D-04-04 mitigation)

If one fixture breaks blocking, the operator may temporarily skip its
`manifest.tickers` entry by commenting it out — JSON does not permit comments
natively, so prefer wrapping the entry in a `_bypass` sibling object:

```json
{
  "_bypass_dkng": {
    "until": "2026-06-01",
    "ticket": "#1234",
    "entry": { "symbol": "DKNG", "category": "mid-cap-equity", ... }
  }
}
```

Bypass is bounded to ≤7 days; longer bypasses require an explicit operator ack
in the PR description. `check-golden-tickers` should emit a WARN when any
`_bypass_*` key persists for >7 days (follow-up to formalize).

## Soft-reference cutover (20-D-02)

The orchestrated suite at
`tests/integration/golden-ticker-suite.regression.test.ts` includes a
soft-ref to `@/lib/eval/citation-coverage`. When 20-D-02 stabilizes the
report `anchors[]` payload to the point where the gate can run on all 8
fixtures, replace the `try { await import(...) }` no-op with a direct import
+ hard expectation `expect(coverage).toBeGreaterThanOrEqual(0.8)`.

## Bootstrap fixtures vs. operator-recorded fixtures

The fixtures shipped under `_sources/` and `_reports/` are currently
**bootstrap stand-ins** — the `_meta/recording-manifest.json` lists
`gemini_model_revision: "bootstrap-*"` for each. The regression suite
detects this via prefix and relaxes the word-count floor from 500 to 50
with a WARN log. Operator-recorded fixtures (via `record-frozen-report.ts`
+ `GEMINI_API_KEY`) flip this back to the strict 500 floor automatically.

## Cross-references

- `tests/golden-tickers/RUNBOOK.md` — 20-D-01 recording mechanics
- `.planning/phases/20-real-sentiment-analysis/20-D-03-PLAN.md` — per-claim verifier consumed by the suite
- `.planning/phases/20-real-sentiment-analysis/20-Z-05-PLAN.md` — eval-judge consumer of the 32-exemplar set
- `.planning/phases/20-real-sentiment-analysis/20-Z-06-PLAN.md` — composite phase done-gate
- `.planning/phases/20-real-sentiment-analysis/MODEL-CARD-golden-ticker-corpus.md` — Mitchell-2019 model card
