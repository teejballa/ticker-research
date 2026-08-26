---
phase: 29
slug: magnitude-calibration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-08-25
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.0.9 |
| **Config file** | `vitest.config.ts` (root) |
| **Quick run command** | `npm test -- magnitude-calibration` |
| **Full suite command** | `npm test && npm run test:integration` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- magnitude-calibration`
- **After every plan wave:** Run `npm test && npm run test:e2e`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| DEMO-07 | `price_target_pct` Zod parse + post-process guard (invalid horizon → null both fields) | unit | `npm test -- magnitude-calibration` | ❌ W0 | ⬜ pending |
| DEMO-07 | Valid horizon passes through unchanged | unit | `npm test -- magnitude-calibration` | ❌ W0 | ⬜ pending |
| DEMO-08 | `expected_pct` written when `price_target_pct != null` inside price-followup | unit | `npm test -- magnitude-calibration` | ❌ W0 | ⬜ pending |
| DEMO-08 | `expected_pct` null for snapshot-originated rows (no report forecast) | unit | `npm test -- magnitude-calibration` | ❌ W0 | ⬜ pending |
| DEMO-09 | `magnitude_error = forward_return_raw - expected_pct` computed correctly | unit | `npm test -- magnitude-calibration` | ❌ W0 | ⬜ pending |
| DEMO-09 | `magnitude_error` null when `days_after != expected_horizon_days` | unit | `npm test -- magnitude-calibration` | ❌ W0 | ⬜ pending |
| DEMO-10 | Bucketing logic assigns correct bucket per `expected_pct` value | unit | `npm test -- magnitude-calibration` | ❌ W0 | ⬜ pending |
| DEMO-10 | Mean actual pct computed correctly per bucket | unit | `npm test -- magnitude-calibration` | ❌ W0 | ⬜ pending |
| DEMO-10 | ESS gate: bucket with N<20 excluded from output | unit | `npm test -- magnitude-calibration` | ❌ W0 | ⬜ pending |
| DEMO-11 | Chart hidden (shows "Insufficient data") when fewer than 3 buckets meet N≥20 | unit (component) | `npm test -- magnitude-calibration` | ❌ W0 | ⬜ pending |
| DEMO-11 | Playwright: `data-testid="magnitude-calibration-tile"` present in DOM | e2e | `npm run test:e2e -- magnitude` | ❌ W3 | ⬜ pending |
| DEMO-08 smoke | Integration: Report with `price_target_pct=5.0, price_target_horizon_days=14` → PriceOutcome `expected_pct=5.0` | integration | `npm run test:integration` | ❌ W2 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/__tests__/magnitude-calibration.test.ts` — RED stubs for DEMO-07 through DEMO-11
- [ ] Schema migration: `npx prisma db push` — blocking, must complete before Wave 1

*Existing Vitest + Playwright infrastructure is already installed — no new framework needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npx prisma db push` applies new columns | DEMO-07..11 (foundation) | Requires live Neon DB connection with DATABASE_URL | Run `npx prisma db push` in project root; verify exit 0 |
| EngineCalibrationPanel calibration tile renders | DEMO-11 | Requires live data with ≥3 buckets meeting N≥20 gate | Run app, navigate to `/research/[ticker]`, check EngineCalibrationPanel for calibration tile |

---

## Security Threat Model

| ASVS Category | Control |
|---------------|---------|
| V2 Authentication (cron) | `CRON_SECRET` Bearer header check — same pattern as all existing crons |
| V4 Access Control (insights endpoint) | No auth on `/api/insights/magnitude-calibration` — matches existing `/api/insights/*` pattern (aggregate-only data) |
| V5 Input Validation | Zod validates all Gemini output; bucket boundaries are hardcoded constants (no user input path) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING test references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter when all boxes checked

**Approval:** pending
