---
phase: 27
slug: historical-backfill
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-26
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Per-task map below is seeded from RESEARCH.md § Validation Architecture; the planner
> completes the Task ID / Wave / Command columns as plans are written.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npm run test:integration` (integration is live-Neon, RUN_LIVE_INTEGRATION-gated) |
| **Estimated runtime** | ~30–60s unit; integration variable (live DB) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run full suite (unit + live-Neon integration where applicable)
- **Before `/gsd-verify-work`:** Full suite green + `npx tsc --noEmit` clean
- **Max feedback latency:** ~60 seconds (unit)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | — | 0 | COVERAGE-09 | — | `SentimentSnapshot.source` column exists, default `'live'` | schema/unit | `npx prisma validate` + unit | ❌ W0 | ⬜ pending |
| TBD | — | — | COVERAGE-06 | — | universe ≥100 tickers × ≥5y; features deterministic from OHLCV | unit | `npm test` (universe + extractor) | ❌ W0 | ⬜ pending |
| TBD | — | — | COVERAGE-07 | — | `close` (not `adjclose`); `cap_class` as-of historical date | unit | `npm test` (PIT + cap-as-of) | ❌ W0 | ⬜ pending |
| TBD | — | — | COVERAGE-08 | — | single `computeTechnicalSnapshot` path for backfill + live | unit | `npm test` (no forked extractor grep) | ❌ W0 | ⬜ pending |
| TBD | — | — | COVERAGE-09 | — | backfill rows tagged `source='backfill'` end-to-end | integration | `npm run test:integration` | ❌ W0 | ⬜ pending |
| TBD | — | — | COVERAGE-10 | — | cell needs ≥10 live (non-backfill) outcomes before ACTIVE | unit | `npm test` (promotion gate) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stub files for COVERAGE-06..10 (TDD red phase) — planner assigns paths
- [ ] `[BLOCKING]` additive Prisma migration (`SentimentSnapshot.source`) + `npx prisma db push` + `prisma generate`
- [ ] Framework already present (vitest) — no install needed

*Existing vitest + live-Neon integration infrastructure covers the phase; only stubs + the schema migration are net-new for Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full backfill run produces correct row volume + completes in ~15–45 min | COVERAGE-06 | Long-running local CLI against live Yahoo; not a CI unit test | Operator runs `npx tsx scripts/backfill-historical.ts --dry-run` then live; confirm scanned/written counts |
| Survivorship-bias limitation documented | COVERAGE-07 (residual) | Documentation assertion (model card / `docs/paper/methodology.md`) | Confirm caveat text present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
