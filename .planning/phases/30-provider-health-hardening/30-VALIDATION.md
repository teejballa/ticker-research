---
phase: 30
slug: provider-health-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-14
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run && npm run test:integration` |
| **Estimated runtime** | ~90 seconds quick, ~300 seconds full |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run && npm run test:integration`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

> Plans will fill this table during planning. Seed below derived from 30-RESEARCH.md Validation Architecture section.

| Decision | Validation Type | Test Target | Notes |
|----------|----------------|-------------|-------|
| D-01 (Yahoo demotion) | unit | `merge.test.ts` | Verify Polygon→Finnhub→Yahoo order for merge-eligible fields |
| D-02 (Yahoo cache) | unit + integration | Mocked Upstash | TTL window, key pattern |
| D-04/05/06/07/08 (breaker) | unit | `circuit-breaker.test.ts` | Trip, open, half-open probe, BreakerOpenError surface, enum widening |
| D-09 (fallback_summary) | unit | `source-package.test.ts` | Shape extension, no regression on existing fields |
| D-10 (heatmap tile) | integration | `/insights/sentiment-health` snapshot | Renders without errors |
| D-11 (FieldOrigin 'unavailable') | unit | `merge.test.ts` + renderer tests | Downstream `'—'` rendering |
| D-12/13 (cron resilience) | integration | Mocked failing provider | Cron returns 200, counters incremented |
| D-14 (model pinning) | unit | `gemini-analysis.test.ts` + audit grep | Every generateObject/generateText has explicit model |
| D-15 (cost ceiling) | unit | Mocked Upstash counter | Trip at 3 anomalies/h, decay |
| D-16 (done-gate SQL) | manual | SQL probe documented | Live DB query result |
| D-17 (error-budget cron) | unit + integration | New cron route | Bearer auth, insufficient_history, INSERT shape |
| D-18 (ProviderHealthAlert) | migration test | Prisma migrate diff | Additive schema |
| D-19 (active alerts tile) | integration | `/insights/sentiment-health` | Renders alert rows |
| D-21/22/23 (Firecrawl) | manual + integration | Live `ProviderCallLog` row after rotation | Firecrawl returns `status='ok'` |
| D-24/25 (done-gate measurement) | manual | `reports/provider-health-{date}.md` exists | Per-provider verdict written |

---

## Wave 0 Requirements

- [ ] `src/lib/data/__tests__/circuit-breaker.test.ts` — new file, breaker primitive coverage
- [ ] `src/lib/data/__tests__/merge.test.ts` — extend with D-01 ordering + D-11 'unavailable' fixtures
- [ ] `src/app/api/cron/provider-error-budget/__tests__/route.test.ts` — new cron route test
- [ ] Vitest fixtures for mocked Upstash REST (`src/lib/data/cache/__mocks__/upstash.ts`)

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Firecrawl key rotation success | D-21 | Requires external dashboard + Vercel env push | Pull old key, rotate via Firecrawl UI, `vercel env add FIRECRAWL_API_KEY`, deploy, verify `ProviderCallLog` next run shows `status='ok'` |
| Done-gate SQL probe | D-16, D-24 | Live Neon query against prod DB | Run SELECT AVG(cost_usd) / error_rate SQL queries against prod; write results to `reports/provider-health-{date}.md` |
| Vercel deploy succeeds with new cron #22 | D-17 | Deploy gate | `vercel --prod` returns success; new cron visible in dashboard |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or are explicitly listed in Manual-Only above
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 fixtures created before downstream waves
- [ ] No watch-mode flags in test commands
- [ ] Feedback latency < 90s on quick run
- [ ] `nyquist_compliant: true` set in frontmatter after planner fills task-level table

**Approval:** pending
