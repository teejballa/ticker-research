---
phase: 05-user-identity-report-history
plan: "03"
subsystem: frontend-ui
tags: [history, nav-identity, report-history, ui]
dependency_graph:
  requires: [05-01, 05-02]
  provides: [ReportHistory component, NavIdentity on all pages]
  affects: [src/components/ReportHistory.tsx, src/app/page.tsx, src/app/research/[ticker]/page.tsx]
tech_stack:
  added: []
  patterns: [useEffect fetch pattern, conditional Tailwind classes, inline style hover]
key_files:
  created:
    - src/components/ReportHistory.tsx
  modified:
    - src/app/page.tsx
    - src/app/research/[ticker]/page.tsx
decisions:
  - "NavBar on research page fetches /api/setup/status independently — no shared context needed at this scale"
  - "NOT CONNECTED on research page is plain muted text (no link) — user is already mid-research flow"
metrics:
  duration: 54s
  completed: "2026-03-20"
  tasks: 3
  files: 3
---

# Phase 05 Plan 03: Report History UI and NavIdentity on All Pages Summary

**One-liner:** Terminal-style report history table with sentiment chips, action buttons, and NavIdentity email/NOT CONNECTED indicator wired into both home page and research page navbars.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/components/ReportHistory.tsx | 44e728d | src/components/ReportHistory.tsx |
| 2 | Wire ReportHistory and NavIdentity into src/app/page.tsx | 7895d07 | src/app/page.tsx |
| 3 | Add NavIdentity to research page NavBar | 6fe080c | src/app/research/[ticker]/page.tsx |

## What Was Built

**ReportHistory component** (`src/components/ReportHistory.tsx`):
- 7-column terminal grid: SYMBOL (80px) / COMPANY (flex-1) / DATE (110px) / SENTIMENT (90px) / CONFIDENCE (80px) / OPEN (48px) / REGEN (56px)
- Four states: loading (3 skeleton rows at opacity-30), empty (terminal message), error (HISTORY UNAVAILABLE), loaded (data rows)
- Sentiment chips with exact UI-SPEC colors: bullish #10b981/#064e3b, bearish #ef4444/#2d0a0a, neutral #3d5e7a/#0a1520
- [OPEN] navigates to `/research/[ticker]?report=[filename]`; [REGEN] navigates to `/research/[ticker]`
- data-testid attributes: history-row, history-open-btn, history-regen-btn

**Home page NavIdentity** (`src/app/page.tsx`):
- SetupStatus interface extended with `userEmail: string | null`
- truncateEmail helper (24 char max, Unicode ellipsis)
- data-testid="nav-identity" in nav right cluster — amber when connected, muted+underline when NOT CONNECTED

**Research page NavIdentity** (`src/app/research/[ticker]/page.tsx`):
- NavBar extended with useState/useEffect to fetch /api/setup/status on mount
- justify-between on header for left brand / right identity layout
- data-testid="nav-identity" shows email (amber) or NOT CONNECTED (muted)

## Deviations from Plan

None — Tasks 1 and 2 were already implemented in a prior partial execution. Task 3 executed cleanly in this run.

## Self-Check: PASSED

- FOUND: src/components/ReportHistory.tsx
- FOUND: src/app/page.tsx
- FOUND: src/app/research/[ticker]/page.tsx
- FOUND commit: 6fe080c (Task 3)
