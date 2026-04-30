---
phase: 17
slug: institutional-insider-intelligence
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-30
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Quad-class extension of Phase 16's signal-class architecture (institutional + insider added).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.0.9 (unit) + Vitest 3.0.9 (integration, separate config) + Playwright 1.58.2 (e2e) |
| **Config file** | `vitest.config.ts` (unit) · `vitest.integration.config.ts` (integration) · `playwright.config.ts` (e2e) |
| **Quick run command** | `npm test -- {single file}` |
| **Full suite command** | `npm test && npm run test:integration && npm run test:e2e` |
| **Estimated runtime** | unit ~30s · integration ~3-4 min (live Neon) · e2e ~2 min |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- {touched file}`
- **After every plan wave:** Run `npm test && npm run test:integration`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30s for unit, ~4 min for integration

---

## Per-Task Verification Map

> The map below mirrors the Phase Requirements → Test Map in 17-RESEARCH.md §13. Task IDs (`17-PP-TT`)
> are placeholders — real task IDs are assigned by `gsd-planner` during plan generation.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | DATA-V2-03 / 17-01 | — | Finnhub fetch returns parseable transactions or null on 4xx/5xx | unit | `npm test -- src/lib/data/insider.test.ts -t "finnhub"` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | 17-01 | — | Finnhub institutional fetch returns parseable ownership or null | unit | `npm test -- src/lib/data/institutional.test.ts -t "finnhub"` | ❌ W0 | ⬜ pending |
| 17-01-03 | 01 | 1 | 17-01 | — | EDGAR fallback returns null when Finnhub call succeeds | unit | `npm test -- src/lib/data/insider.test.ts -t "edgar fallback"` | ❌ W0 | ⬜ pending |
| 17-01-04 | 01 | 2 | 17-01 | — | Insider classifier maps cluster_buying / lone_buy / cluster_selling / planned_sell_10b5_1 / lone_sell / ceo_buy / cfo_buy / director_buy correctly | unit | `npm test -- src/lib/data/insider-classifier.test.ts` | ❌ W0 | ⬜ pending |
| 17-01-05 | 01 | 2 | 17-01 | — | Institutional classifier maps net_accumulation / net_distribution / new_initiation / complete_exit / smart_money_concentration / smart_money_dispersion / contrarian_inflow / contrarian_outflow correctly | unit | `npm test -- src/lib/data/institutional-classifier.test.ts` | ❌ W0 | ⬜ pending |
| 17-01-06 | 01 | 2 | 17-01 | — | Both classifiers return `null` on empty input (filings_count=0 / fund_count=0) | unit | (same files, separate `it()` blocks) | ❌ W0 | ⬜ pending |
| 17-02-01 | 02 | 1 | 17-02 | — | Migration adds insider_data, institutional_data to sentiment_snapshots | integration | `npm run test:integration -- tests/integration/schema-phase-17.test.ts -t "snapshot cols"` | ❌ W0 | ⬜ pending |
| 17-02-02 | 02 | 1 | 17-02 | — | Migration adds insider_at_report, institutional_at_report to reports | integration | (same file, separate `it()`) | ❌ W0 | ⬜ pending |
| 17-02-03 | 02 | 1 | 17-02 | — | LearnedPattern accepts new signal_class values 'insider' and 'institutional' | integration | (same file, separate `it()`) | ❌ W0 | ⬜ pending |
| 17-03-01 | 03 | 1 | 17-03 | — | sentiment-scan cron writes both new Json cols on every new snapshot | integration | `npm run test:integration -- tests/integration/sentiment-scan-smart-money.test.ts -t "writes"` | ❌ W0 | ⬜ pending |
| 17-03-02 | 03 | 1 | 17-03 / AC4 | — | sentiment-scan handles asymmetric coverage (insider populated, institutional null) gracefully | integration | (same file, separate `it()`) | ❌ W0 | ⬜ pending |
| 17-03-03 | 03 | 2 | 17-03 / AC2 | — | learn cron updates 4 cells per outcome (one per non-null class) | integration | `npm run test:integration -- tests/integration/learn-quad-class.test.ts -t "quad upsert"` | ❌ W0 | ⬜ pending |
| 17-03-04 | 03 | 2 | 17-03 / D-22 | — | learn cron logistic update remains 12-d, 30d-only (NOT extended to 24-d) | integration | (same file, separate `it()`) | ❌ W0 | ⬜ pending |
| 17-03-05 | 03 | 2 | 17-03 | — | Idempotent retry: same outcome processed twice creates only one LearningEvent | integration | (same file, separate `it()`) | ❌ W0 | ⬜ pending |
| 17-04-01 | 04 | 1 | 17-04 | — | engine-context.ts returns institutional_pattern, insider_pattern + their posterior/CI/status fields | unit | `npm test -- src/lib/engine-context.test.ts -t "smart money"` | ❌ W0 | ⬜ pending |
| 17-04-02 | 04 | 1 | 17-04 | — | computeAgreementNWay correctly classifies 4-class aligned/mixed/opposed/unknown | unit | `npm test -- src/lib/engine-context.test.ts -t "agreement n-way"` | ❌ W0 | ⬜ pending |
| 17-04-03 | 04 | 1 | 17-04 / D-04 | — | Numeric fields (institutional_posterior_mean, etc.) are post-process overwritten — LLM cannot influence them | unit | `npm test -- src/lib/gemini-analysis.test.ts -t "trust boundary"` | ❌ W0 | ⬜ pending |
| 17-04-04 | 04 | 1 | 17-04 | — | Gemini system prompt block contains "SMART MONEY CALIBRATION CONTEXT" and "30d" | unit | `npm test -- src/lib/gemini-analysis.test.ts -t "smart money block"` | ❌ W0 | ⬜ pending |
| 17-04-05 | 04 | 1 | 17-04 | — | AnalysisResultSchema accepts the 4 new prose fields | unit | `npm test -- src/lib/gemini-analysis.test.ts -t "schema extension"` | ❌ W0 | ⬜ pending |
| 17-04-06 | 04 | 2 | AC1 | — | EngineCalibrationPanel renders 4 columns when all 4 classes have data | e2e | `npm run test:e2e -- tests/e2e/engine-calibration-quad.spec.ts -t "4 col"` | ❌ W0 | ⬜ pending |
| 17-04-07 | 04 | 2 | AC1 | — | Panel degrades gracefully when institutional_at_report / insider_at_report absent (old reports) | e2e | (same file, separate `test()`) | ❌ W0 | ⬜ pending |
| 17-04-08 | 04 | 2 | AC4 | — | Smart Money Intelligence section renders correctly with one class null (asymmetric) | e2e | `npm run test:e2e -- tests/e2e/smart-money-asymmetric.spec.ts` | ❌ W0 | ⬜ pending |
| 17-05-01 | 05 | 1 | 17-05 / AC2 + AC5 | — | Same ticker pre/post `learn` cycle changes engine_calibration block (institutional + insider classes) | integration | `npm run test:integration -- tests/integration/smart-money-affects-reports.test.ts` | ❌ W0 | ⬜ pending |
| 17-05-02 | 05 | 1 | AC3 | — | After backfill, ≥25% of cells in most-traded `cap_class × horizon=30d` row are ACTIVE for both new classes | integration | `npm run test:integration -- tests/integration/backfill-smart-money-active-rate.test.ts` | ❌ W0 | ⬜ pending |
| 17-05-03 | 05 | 1 | AC5 | — | Brier 30d for ≥1 ACTIVE pattern in each new class is reported | integration | `npm run test:integration -- tests/integration/horizon-brier-smart-money.test.ts` | ❌ W0 | ⬜ pending |
| 17-05-04 | 05 | 2 | 17-05 | — | Insights tab "Institutional Pattern Library" renders 8 buckets × 3 cap_classes grid | e2e | `npm run test:e2e -- tests/e2e/insights-institutional.spec.ts` | ❌ W0 | ⬜ pending |
| 17-05-05 | 05 | 2 | 17-05 | — | Insights tab "Insider Pattern Library" renders 8 buckets × 3 cap_classes grid | e2e | `npm run test:e2e -- tests/e2e/insights-insider.spec.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/integration/schema-phase-17.test.ts` — schema/migration assertions
- [ ] `tests/integration/sentiment-scan-smart-money.test.ts` — snapshot writer + asymmetric handling
- [ ] `tests/integration/learn-quad-class.test.ts` — quad cell upsert + 30d logistic constraint + idempotent retry
- [ ] `tests/integration/smart-money-affects-reports.test.ts` — analog of `technical-affects-reports.test.ts` (load-bearing AC2 + AC5)
- [ ] `tests/integration/backfill-smart-money-active-rate.test.ts` — AC3 (≥25% ACTIVE in most-traded cap_class × 30d row)
- [ ] `tests/integration/horizon-brier-smart-money.test.ts` — AC5
- [ ] `src/lib/data/insider.test.ts` — Finnhub mock + EDGAR fallback
- [ ] `src/lib/data/institutional.test.ts` — Finnhub mock + EDGAR fallback
- [ ] `src/lib/data/insider-classifier.test.ts` — bucket-mapping table-tests + null on empty input
- [ ] `src/lib/data/institutional-classifier.test.ts` — bucket-mapping table-tests + null on empty input
- [ ] `src/lib/engine-context.test.ts` (extended) — new fields, N-way agreement
- [ ] `src/lib/gemini-analysis.test.ts` (extended) — system prompt block + schema extension + trust boundary
- [ ] `tests/e2e/engine-calibration-quad.spec.ts` — AC1 panel rendering at ≥1440px + degraded fallback
- [ ] `tests/e2e/smart-money-asymmetric.spec.ts` — AC4 asymmetric coverage rendering
- [ ] `tests/e2e/insights-institutional.spec.ts` — institutional library tab
- [ ] `tests/e2e/insights-insider.spec.ts` — insider library tab

Framework install: not needed — all three frameworks installed and configured by Phase 16.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Finnhub coverage validation on 200-ticker watchlist | 17-01 / D-09 | Live external API call; rate-limited; result determines whether `fast-xml-parser` install is required | Run `npx tsx scripts/validate-finnhub-coverage.ts` (one-shot validator created in plan 17-01 Wave 0). Confirm `insider coverage ≥95%` AND `13F coverage ≥95%`. If either is below, plan 17-01 escalates: install `fast-xml-parser@4.5.1` and flesh out `src/lib/data/edgar.ts`. |
| Bucket distribution histogram review | 17-05 / Pitfall 3 | Empirical threshold tuning needs human judgment | Run `npx tsx scripts/backfill-smart-money.ts --dry-run`, read the printed histogram. If any bucket has <5% population OR any bucket has >40%, retune classifier thresholds in §3.3 and re-run dry. |
| 10b5-1 indicator detection | 17-01 / Pitfall 7 | Verify a known 10b5-1 sale (e.g., recent CEO planned sale at AAPL/GOOG/NVDA) registers `planned_sell_10b5_1` in classifier output | Probe Finnhub for that ticker's recent transactions; manually confirm bucket assignment matches expectation. |
| 4-column panel responsive behavior | AC1 / Pitfall 6 | Visual layout audit at multiple viewports | After plan 17-04 deploys, inspect `EngineCalibrationPanel` at 1920×1080, 1440×900, 1280×720, 1024×768, 768×1024 in Chrome devtools. Confirm: 4-col at ≥1440, 2-row×2-col at 1024-1439, stacked at ≤1023; horizon table hides CI cols ≤1280. |
| Smart Money Intelligence section copy review | D-05 | Reader-facing copy needs editorial pass | Run two reports — one with both classes ACTIVE, one with only insider populated. Confirm sub-cards read naturally; "Latest 13F: Nd ago" / "Latest Form 4: Nd ago" surfaces prominently. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s for unit, < 4 min for integration
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
