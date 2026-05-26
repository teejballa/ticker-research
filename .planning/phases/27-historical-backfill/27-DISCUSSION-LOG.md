# Phase 27: Historical Backfill - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 27-historical-backfill
**Areas discussed:** Decay vs. backfill tension, Vendor + survivorship, Universe selection, Promotion gate + runbook

---

## Decay vs. backfill tension

| Option | Description | Selected |
|--------|-------------|----------|
| CV pool only, live posterior stays decayed | Backfill populates the Purged-CV lift-gate pool (raw); live posterior keeps Phase-18 decay | ✓ |
| Seed an undecayed bootstrap prior | Backfill computes per-cell Beta prior that seeds live posterior, washes out over time | |
| Exempt backfill from decay entirely | Full-weight backfill alongside live data | |

**User's choice:** CV pool only, live posterior stays decayed (→ D-01)
**Notes:** Since backfill rows are old, Phase-18 decay drives their live-posterior weight to ≈0 naturally — no special exclusion filter needed in the learn cron; only the lift-gate CV query reads raw outcome membership.

---

## Vendor + survivorship

| Option | Description | Selected |
|--------|-------------|----------|
| Tiingo (PIT EOD) | Unadjusted EOD, some delisted coverage — initially selected | ✓ → reversed |
| Yahoo (free, reuse existing) | What backfill-technical.ts uses; adjusted prices, no delisted | ✓ (final) |
| Polygon | Delisted via reference API on paid tiers | |

| Survivorship option | Description | Selected |
|--------|-------------|----------|
| Best-effort + documented residual | Include delisted where vendor serves them; document residual bias | ✓ |
| Strict: delisted required | Provably include delisted (paid/static dataset) | |
| Accept survivorship bias for v1 | Current-universe only | |

**User's choice:** Initially Tiingo + best-effort delisted; **reversed to Yahoo** after Claude discovered no Tiingo adapter exists in the codebase (ROADMAP 19-B-03 claim unverified) and user is on Tiingo free tier. (→ D-02, D-03, D-07)
**Notes:** Yahoo can't serve delisted tickers, so survivorship bias is larger and is recorded as a documented known limitation (model card + paper). Use Yahoo `close` (split-adjusted) not `adjclose`. Polygon/paid delisted coverage parked as deferred.

---

## Universe selection

| Option | Description | Selected |
|--------|-------------|----------|
| Curated cap-balanced static list | Versioned ~120-ticker file, deterministic | ✓ |
| Expand existing watchlist | Reuse live roster | |
| Point-in-time index snapshots | Reconstruct historical membership | |

| Cap-spread option | Description | Selected |
|--------|-------------|----------|
| Roughly even across 4 cap-classes | ~30 each large/mid/small/micro | ✓ |
| Weight toward liquid large/mid | Better data quality, leaves micro/small sparse | |

**User's choice:** Curated cap-balanced static list, ~even across 4 cap-classes (→ D-04, D-05, D-08)
**Notes:** Even spread ensures historically-starved micro/small cells get bootstrapped — the cells that most need N for the lift-gate.

---

## Promotion gate + runbook

| Option | Description | Selected |
|--------|-------------|----------|
| Hard gate: ≥10 live outcomes for ACTIVE | Count non-backfill outcomes; backfill never alone graduates a cell | ✓ |
| Gate on live ESS threshold | Use live ESS instead of raw count | |

| Execution option | Description | Selected |
|--------|-------------|----------|
| Local one-shot CLI (tsx) | Mirror backfill-technical.ts, resumable, off-Vercel | ✓ |
| Chunked resumable Vercel cron | Fit cron infra, chunk around 300s ceiling | |

**User's choice:** ≥10 live-outcome hard gate + local one-shot CLI (→ D-10, D-06)
**Notes:** User explicitly confirmed "one shot" and free-tier vendor. CLI caches raw OHLCV to disk + light throttle so a single command suffices without rate-window waiting. Wall-clock ≈ 15–45 min batched.

## Claude's Discretion

- Snapshot cadence: weekly default, planner may revisit to daily if CV folds too sparse.
- Disk-cache format/location, batch sizes, throttle interval, exact ticker picks, resume-checkpoint mechanism.

## Deferred Ideas

- True delisted/survivorship-free universe via Polygon/paid data (if bias proves material).
- Building a real Tiingo EOD adapter to reconcile the ROADMAP 19-B-03 claim.
- Daily-cadence backfill as a tuning pass.
- Backfilling non-technical signal classes (out of COVERAGE-06 scope).
