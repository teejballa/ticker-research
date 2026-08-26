---
phase: "22-market-regime-and-source-weights"
plan: "22-05"
subsystem: "diffusion-learning-engine"
tags: [source-mix-ui, constraint-flip, done-gate, bookkeeping, wave-5]
dependency_graph:
  requires:
    - "22-00 through 22-04 — all prior waves shipped"
    - "22-04-SOAK.md — soak_start_iso 2026-06-13, relearn_complete_ack: true"
  provides:
    - "src/components/SourceMixExpanded.tsx — client island: 8-source ranking table + SVG sparklines + disclosure toggle"
    - "src/components/EngineCalibrationPanel.tsx — SourceMixRow inserted (D-17, CORE-ML-27)"
    - "Prisma schema: regime added to unique keys on learned_patterns, per_source_ic, source_tiers (D-11 step 4)"
    - "DB: npx prisma db push applied 2026-08-26 — constraints live in Neon"
    - "REQUIREMENTS.md: CORE-ML-06..10 + CORE-ML-26..28 marked complete"
    - "ROADMAP.md: Phase 22 marked complete 2026-08-26"
    - "HYPERPARAMETERS.md: Phase 22 section appended"
    - "docs/paper/methodology.md: Phase 22 section appended (Hamilton 1989, Ang-Bekaert 2002, Benjamini-Bogomolov 2014)"
  affects:
    - "Phase 23.5 (Macro Regime Shift Detection) — now eligible for /gsd-discuss-phase 23.5"
    - "GSD MODEL_ALIAS_MAP — see [[reminder-update-models-after-p22]] memory"
---

# Phase 22 Wave 5 — Done

**Completed:** 2026-08-26

## What shipped in Wave 5

| Task | Deliverable | Commit |
|------|-------------|--------|
| 0 | Soak-gate verified (ack flipped) | `ec46ea5` |
| 1 | `src/lib/evaluation/regime-done-gate.ts` | `232f28d` |
| 2 | `scripts/phase-22-status.ts` composite gate | `232f28d` |
| 3 | `engine-context.ts` `source_mix` reader | `b1bf700` |
| 4 (partial) | `SourceMix` type contract | `c3dde7f` |
| fix | Analysis retry re-uses source package | `d847eaa` |
| 4 (complete) | `SourceMixExpanded` + panel row + tests | `4ff4268` |
| 5 | Schema constraint-flip (regime in unique keys) | `ea043d3` |
| 6 | `npx prisma db push` (operator, 2026-08-26) | — |
| 7 | Bookkeeping (this commit) | TBD |

## Phase 22 — Full done-gate (9/9)

All acceptance criteria from 22-VALIDATION.md confirmed:

- [x] CORE-ML-06: LearnedPattern regime constraint live in Neon
- [x] CORE-ML-07: 4-bucket classifier in `classify.ts`
- [x] CORE-ML-08: SentimentSnapshot.regime written at scan time + backfilled
- [x] CORE-ML-09: Regime label in EngineCalibration block
- [x] CORE-ML-10: Transition-zone exclusion in learn cron (D-05)
- [x] CORE-ML-26: Regime-conditional SourceTier weights + EB shrinkage
- [x] CORE-ML-27: Source-mix UI row in EngineCalibrationPanel
- [x] CORE-ML-28: Hierarchical BY-FDR (Benjamini-Bogomolov 2014)
- [x] Done-gate: Brier-lift ≥ 0.005 with BCa 95% CI excluding 0 (regime-done-gate.ts)

## Post-Phase-22 actions

1. **Update GSD MODEL_ALIAS_MAP** — see `[[reminder-update-models-after-p22]]` memory. Edit at `~/.claude/get-shit-done/bin/lib/core.cjs:1294-1298`.
2. **Discuss Phase 23.5** — `/gsd-discuss-phase 23.5` in a fresh session. Macro Regime Shift Detection: transition detector, VIX term structure, sector momentum, correlation regime, macro calendar, Macro Context UI tile.
