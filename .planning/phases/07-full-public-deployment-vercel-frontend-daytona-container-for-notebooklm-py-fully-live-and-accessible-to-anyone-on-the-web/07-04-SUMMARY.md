---
phase: 07-research-quality-special-situation-coverage
plan: "04"
subsystem: ui
tags: [navbar, security-type, badge, playwright, react, typescript]

# Dependency graph
requires:
  - phase: 07-01
    provides: security_type field added to AnalysisResult schema
  - phase: 07-02
    provides: security_type threaded through SourcePackage and detectSecurityType wired in route
  - phase: 07-03
    provides: preamble injection for NotebookLM queries based on security type

provides:
  - NavBar securityType prop with conditional badge render in sub-bar (data-testid="security-type-badge")
  - ResearchReport wires analysisResult.security_type to NavBar
  - 4 Playwright e2e tests covering SPAC badge, ETF badge, equity no-badge, unknown no-badge

affects: [report-page, ui-components, e2e-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "data-testid convention for Playwright targeting on conditional render elements"
    - "Terminal badge styling: text-amber-400, border border-amber-400/40, font-mono, no rounded corners"
    - "Conditional badge: renders for spac/etf/adr/preferred/crypto, suppressed for equity and unknown"

key-files:
  created:
    - tests/e2e/security-badge.spec.ts
  modified:
    - src/components/NavBar.tsx
    - src/components/ResearchReport.tsx

key-decisions:
  - "Badge suppressed for equity (no label needed for default instrument type) and unknown (detection failed — UI identical to pre-phase)"
  - "data-testid='security-type-badge' on badge span enables reliable Playwright targeting without fragile CSS selectors"
  - "Badge uses text-[10px] font-mono uppercase tracking-widest — consistent with terminal sub-bar secondary label aesthetic"

patterns-established:
  - "NavBar badge pattern: optional prop + conditional render inside showSubBar block + data-testid for test targeting"
  - "Playwright fixture pattern: write StoredReport JSON to ~/.cipher/reports/, load via ?report= URL param"

requirements-completed:
  - RQ-04

# Metrics
duration: ~15min
completed: "2026-03-25"
---

# Phase 07 Plan 04: Security Type Badge Summary

**Amber terminal badge in NavBar sub-bar renders SPAC/ETF/ADR label from AnalysisResult.security_type, with 4 Playwright e2e tests covering badge presence and absence cases**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-25T21:00:00Z
- **Completed:** 2026-03-25T21:06:36Z
- **Tasks:** 4 (3 auto + 1 checkpoint)
- **Files modified:** 3

## Accomplishments

- NavBar sub-bar conditionally renders an amber security type badge (SPAC, ETF, ADR, etc.) when security_type is not equity, unknown, or absent
- ResearchReport passes analysisResult.security_type through to NavBar via the new securityType prop
- 4 Playwright e2e tests written using the StoredReport fixture pattern (write JSON to ~/.cipher/reports/, load via ?report= URL param) with screenshots and badge presence/absence assertions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add securityType prop to NavBar and render conditional badge in sub-bar** - `f3b6e7a` (feat)
2. **Task 2: Wire security_type from AnalysisResult into NavBar via ResearchReport** - `6a9d454` (feat)
3. **Task 3: Expand Playwright e2e badge tests with real assertions and screenshots** - `b5013ef` (test)
4. **Task 4: Human verify checkpoint** - approved by user

## Files Created/Modified

- `src/components/NavBar.tsx` - Added securityType?: string | null prop; badge render in sub-bar left cluster for spac/etf/adr/preferred/crypto
- `src/components/ResearchReport.tsx` - Added securityType={analysisResult?.security_type ?? null} to NavBar JSX
- `tests/e2e/security-badge.spec.ts` - 4 Playwright tests: SPAC badge shows, ETF badge shows, equity no badge, unknown no badge; screenshots taken

## Decisions Made

- Badge suppressed for equity (the default instrument — no label adds noise) and unknown (type detection failed, preserves pre-phase appearance)
- Terminal aesthetic enforced: text-amber-400, border border-amber-400/40, font-mono, text-[10px], no rounded corners
- data-testid="security-type-badge" on the span for reliable Playwright targeting

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 07 complete: all 4 plans executed
- Security type detection (Plan 01), branching research prompts (Plans 02-03), and UI badge (Plan 04) form a complete special-situation coverage system
- RQ-04 satisfied: security type is visible in the report header for all non-equity instrument types

---
*Phase: 07-research-quality-special-situation-coverage*
*Completed: 2026-03-25*
