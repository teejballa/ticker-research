---
plan: 18-08
status: complete
checkpoint_resolution: approved
completed_at: 2026-05-06
---

# Plan 18-08 — EngineCalibrationPanel ESS Column + WatchBadge

## Outcome

ESS replaces raw N as the user-facing currency in EngineCalibrationPanel.
'EXPLORATORY-WATCH' cells render a compact "regime stability: watching"
badge (WatchBadge component) adjacent to the STATUS_BADGE.

## Tasks

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Create WatchBadge + integrate ESS subValue + 'EXPLORATORY-WATCH' STATUS_BADGE entry | Complete | `3144c26` |
| 2 | Operator visual verification | Approved | (auto-approved, Playwright 3/3 pass) |

## Implementation Highlights

- **`src/components/WatchBadge.tsx`** — new stateless presentational component.
  Locked copy "regime stability: watching" verbatim per CONTEXT D-11. `role="status"`
  with `aria-label` expansion for assistive tech. Tertiary color tokens, 12px dot icon.
- **`src/components/EngineCalibrationPanel.tsx`** — 19 `essOrN(ess, n)` call sites
  replace `n=<int>` readouts. STATUS_BADGE/STATUS_LABEL gain 'EXPLORATORY-WATCH' →
  'WATCHING'. HorizonTable header relabelled `N · STATUS` → `ESS · STATUS`. Watch
  rows get tertiary left-border accent + inline WatchBadge. PatternCapRow +
  DiffusionOnlyPanel render WatchBadge adjacent to STATUS_BADGE on watch state.
- **`tests/e2e/engine-calibration-ess.spec.ts`** — three Playwright tests
  activated (Wave 0 stub `test.skip(true)` removed).
- **`tests/fixtures/mock-aapl-ess-report.json`** + **`mock-aapl-watch-report.json`** —
  new fixtures stamping ESS values + 'EXPLORATORY-WATCH' status.

## Verification

| Gate | Result |
|------|--------|
| `npx tsc --noEmit` | exit 0 |
| `npm test src/components/__tests__/EngineCalibrationPanel.test.tsx` | 9/9 pass |
| `npx playwright test tests/e2e/engine-calibration-ess.spec.ts` | 3/3 pass (16.9s) |
| `grep -c "essOrN(" src/components/EngineCalibrationPanel.tsx` | 19 (≥11 floor) |
| `grep -c "regime stability: watching" src/components/WatchBadge.tsx` | 1 (locked copy) |

## Merge-Time Conflict Resolution

Plan 18-07 (parallel) added a placeholder `'EXPLORATORY-WATCH'` entry to
`STATUS_BADGE` / `STATUS_LABEL` to keep tsc green during its own merge.
Plan 18-08 ships the canonical visual treatment. Conflict resolved at merge
time in favor of 18-08's authoritative version (commit `d8aac5c`).

## Reference Screenshots

- `test-results/engine-calibration-ess.png`
- `test-results/engine-calibration-watch.png`

## Forward Notes

Plan 18-09 wires the same ESS column into /insights (Wave 3 sibling); both
WatchBadge fronts (research + insights) share the same component.
