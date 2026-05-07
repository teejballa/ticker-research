---
phase: 19
slug: cipher-v2-0-excellence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Phase 19 is brownfield additive — every test added is incremental to the existing Phase 18 suite (which must NOT regress per D-54).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) + Playwright (e2e) + custom live-DB integration runner |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` (existing) |
| **Quick run command** | `npx vitest run --bail 1` |
| **Full suite command** | `npm test && npm run test:integration && npm run test:e2e` |
| **Estimated runtime** | ~120s unit, ~300s integration, ~180s e2e (full ~10min) |

Per-plan additions to runtime: each new unit test file adds ~1-3s. Cumulative impact ~30-60s by phase end.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed-file>.test.ts`
- **After every plan wave:** Run `npx vitest run` (full unit suite)
- **Before any cutover PR (per Hard Cleanup Gate D-06):** Run `npm test && npm run test:integration && npm run test:e2e` — ALL must be green
- **Before `npm run model-card-status` exits zero (D-08 composite gate):** Full suite + 7-day rollback hatch clean
- **Max feedback latency:** ≤ 120s for unit-test feedback; ≤ 600s for full-suite confirmation

---

## Per-Task Verification Map

This map will be populated as each plan is created by `/gsd-planner`. The seed entries below show the validation pathway for each plan's primary task; sub-task entries are added during plan generation.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-Z-01-01 | 19-Z-01 | Z | — | — | env-var injection rejected with descriptive error | unit | `npx vitest run tests/lib/features.test.ts` | ❌ W0 | ⬜ pending |
| 19-Z-02-01 | 19-Z-02 | Z | — | T-19-Z-02 (additive schema poisoning) | nullable defaults preserved on existing rows | integration | `npx vitest run tests/integration/shadow-comparison.live.test.ts` | ❌ W0 | ⬜ pending |
| 19-Z-03-01 | 19-Z-03 | Z | — | — | shadow-runner returns old result even when newFn throws | unit | `npx vitest run tests/lib/shadow/shadow-runner.test.ts` | ❌ W0 | ⬜ pending |
| 19-Z-04-01 | 19-Z-04 | Z | — | — | model-card-status exits non-zero with punch list when conditions unmet | unit | `npx vitest run tests/scripts/model-card-status.test.ts` | ❌ W0 | ⬜ pending |
| 19-A-01-01 | 19-A-01 | A | — | — | decayWeights throws on lambda<=0 | unit | `npx vitest run tests/learning.unit.bugs.test.ts` | ❌ W0 | ⬜ pending |
| 19-A-01-02 | 19-A-01 | A | — | — | HYPERPARAMETERS Zod validation rejects malformed | unit | `npx vitest run tests/learning.unit.bugs.test.ts` | ❌ W0 | ⬜ pending |
| 19-A-02-01 | 19-A-02 | A | — | — | Brier OOS split honors chronological order at n<16 | unit | `npx vitest run tests/cron-learn.unit.bugs.test.ts` | ❌ W0 | ⬜ pending |
| 19-A-03-01 | 19-A-03 | A | — | — | conformal coverage within ±2% of nominal at n=10000 | unit | `npx vitest run tests/learning.conformal.test.ts` | ❌ W0 | ⬜ pending |
| 19-A-04-01 | 19-A-04 | A | — | — | DSR golden-master matches Bailey-Lopez de Prado §4 | unit | `npx vitest run tests/learning.dsr-pbo.test.ts` | ❌ W0 | ⬜ pending |
| 19-A-04-02 | 19-A-04 | A | — | — | PBO golden-master matches pypbo reference | unit | `npx vitest run tests/learning.dsr-pbo.test.ts` | ❌ W0 | ⬜ pending |
| 19-A-04-03 | 19-A-04 | A | — | — | CPCV (N=6, k=2) produces 15 splits, 5 paths | unit | `npx vitest run tests/learning.cpcv.test.ts` | ❌ W0 | ⬜ pending |
| 19-A-05-01 | 19-A-05 | A | — | — | rolling rank-IC computed correctly on seeded outcomes | integration | `npx vitest run tests/integration/alpha-decay-watch.live.test.ts` | ❌ W0 | ⬜ pending |
| 19-A-06-01 | 19-A-06 | A | — | — | reliability diagram bins synthetic data correctly | unit | `npx vitest run tests/scripts/calibration-report.test.ts` | ❌ W0 | ⬜ pending |
| 19-A-07-01 | 19-A-07 | A | CORE-ML-11..14 | — | hierarchical pooling ≥30% faster convergence on n_local<10 cells vs no-pool control | integration | `npx vitest run tests/integration/hierarchical-pooling.live.test.ts` | ❌ W0 | ⬜ pending |
| 19-B-01-01 | 19-B-01 | B | — | T-19-B-01 (cache poisoning) | Redis outage falls through to fetcher; key namespace prevents collision | unit | `npx vitest run tests/lib/data/cache/upstash.test.ts` | ❌ W0 | ⬜ pending |
| 19-B-02-01 | 19-B-02 | B | — | — | retries only on 5xx + network, NOT 4xx | unit | `npx vitest run tests/lib/data/retry.test.ts` | ❌ W0 | ⬜ pending |
| 19-B-03-01 | 19-B-03 | B | — | T-19-B-03 (API key in logs) | API key never logged; PII redacted | unit | `npx vitest run tests/lib/data/adapters/tiingo.test.ts` | ❌ W0 | ⬜ pending |
| 19-B-04-01 | 19-B-04 | B | — | T-19-B-04 (API key in logs) | API key never logged | unit | `npx vitest run tests/lib/data/adapters/twelve-data.test.ts` | ❌ W0 | ⬜ pending |
| 19-B-05-01 | 19-B-05 | B | — | T-19-B-05 (API key in logs) | API key never logged; auto-fallback to anthropic-search on Exa null | unit | `npx vitest run tests/lib/data/adapters/exa-search.test.ts` | ❌ W0 | ⬜ pending |
| 19-B-06-01 | 19-B-06 | B | — | — | shadow Jaccard ≥95% over N≥200 SourcePackage comparisons | shadow-verdict | `npm run shadow-verdict 19-B-06` | ❌ W0 | ⬜ pending |
| 19-B-07-01 | 19-B-07 | B | — | — | Runtime Cache hit rate ≥70% on warm production traffic | integration | manual smoke + `vercel logs` | ❌ W0 | ⬜ pending |
| 19-B-08-01 | 19-B-08 | B | — | — | dual-write verification: old SourcePackage ≡ new SourcePackage in shadow window | shadow-verdict | `npm run shadow-verdict 19-B-08` | ❌ W0 | ⬜ pending |
| 19-C-01-01 | 19-C-01 | C | — | — | FinSentLLM returns null sentinel on API error (no throw) | unit | `npx vitest run tests/lib/sentiment/finsentllm.test.ts` | ❌ W0 | ⬜ pending |
| 19-C-02-01 | 19-C-02 | C | — | — | ensemble Pearson correlation ≥0.85 with single-model in shadow | shadow-verdict | `npm run shadow-verdict 19-C-02` | ❌ W0 | ⬜ pending |
| 19-C-03-01 | 19-C-03 | C | — | — | reputation-weighted Brier ≤ naive Brier on resolved tickers | shadow-verdict | `npm run shadow-verdict 19-C-03` | ❌ W0 | ⬜ pending |
| 19-C-04-01 | 19-C-04 | C | — | — | term-structure put/call vs nearest-only Brier non-regression | shadow-verdict | `npm run shadow-verdict 19-C-04` | ❌ W0 | ⬜ pending |
| 19-C-05-01 | 19-C-05 | C | — | T-19-C-05 (rate limit poisoning) | rate limit doesn't crash primary Firecrawl path | unit | `npx vitest run tests/lib/data/adapters/swaggystocks.test.ts tests/lib/data/adapters/apewisdom.test.ts` | ❌ W0 | ⬜ pending |
| 19-C-06-01 | 19-C-06 | C | — | — | Quiver opt-in fully gated by QUIVER_API_KEY env presence | unit | `npx vitest run tests/lib/data/adapters/quiver.test.ts` | ❌ W0 | ⬜ pending |
| 19-C-07-01 | 19-C-07 | C | — | T-19-C-07 (citation injection) | URL coverage ≥90% AND old URL set ⊆ new on shadow | shadow-verdict | `npm run shadow-verdict 19-C-07` | ❌ W0 | ⬜ pending |
| 19-C-08-01 | 19-C-08 | C | — | — | CoVe hallucination rate < pre-CoVe baseline on manual sample | shadow-verdict | `npm run shadow-verdict 19-C-08` | ❌ W0 | ⬜ pending |
| 19-C-09-01 | 19-C-09 | C | — | — | router decision agreement ≥70% with Flash-only baseline AND cost reduction | shadow-verdict | `npm run shadow-verdict 19-C-09` | ❌ W0 | ⬜ pending |
| 19-C-10-01 | 19-C-10 | C | — | — | contradiction detector flags ≥1 historical case in backfill (validates detector) | integration | `npx vitest run tests/integration/contradiction-detector.live.test.ts` | ❌ W0 | ⬜ pending |
| 19-C-11-01 | 19-C-11 | C | — | T-19-C-11 (raw user content) | scraped Reddit text sanitized before LLM ingestion | integration | `npx vitest run tests/integration/arctic-shift-backfill.live.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Phase 19 Wave 0 = **Wave Z** (4 infra plans). All test-stub creation lives within Wave Z:

- [ ] `tests/lib/features.test.ts` — flag-matrix unit tests (Plan 19-Z-01)
- [ ] `tests/integration/shadow-comparison.live.test.ts` — Prisma model + index assertions (Plan 19-Z-02)
- [ ] `tests/lib/shadow/shadow-runner.test.ts` + `tests/lib/shadow/verdict.test.ts` — shadow harness primitives (Plan 19-Z-03)
- [ ] `tests/scripts/model-card-status.test.ts` — composite gate assertions (Plan 19-Z-04)

After Wave Z lands, each Wave A/B/C plan creates its own test file as the FIRST step of its TDD cycle (per the universal preamble in the implementation plan). No additional cross-cutting Wave 0 fixtures required — each plan is self-contained.

Existing infrastructure covers cross-cutting needs:
- `tests/learning.hyperparameters.test.ts` (Plan 18-10 sanity test, must NOT regress per D-54)
- `vitest.config.ts` (already configured)
- `playwright.config.ts` (already configured)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| EngineCalibrationPanel renders conformal CI alongside Bayesian CI without UI regression | — | Visual rendering | `npm run dev` → /research/AAPL → screenshot panel → diff vs pre-Phase-19 baseline |
| `/insights` shows model router decisions + cost telemetry | — | Visual rendering | `npm run dev` → /insights → confirm new "Model Router" section visible |
| Generated research report citations all clickable + lead to live pages | — | Network calls + visual | Generate one report → click each citation URL → confirm 200 OK |
| Hierarchical pooling acceptance criterion (≥30% faster convergence) reproduces on production data | CORE-ML-11..14 | Time-series analysis | Run `scripts/hierarchical-pooling-audit.ts` against last 90 days of outcomes; compare median convergence times pooled vs non-pooled |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave Z dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave Z covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 600s for full-suite confirmation
- [ ] `nyquist_compliant: true` set in frontmatter (after planner expands per-task verify on every plan)

**Approval:** pending — flips to approved YYYY-MM-DD after planner generates all 30 plans with per-task `<automated>` blocks
