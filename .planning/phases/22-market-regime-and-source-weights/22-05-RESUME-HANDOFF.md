# Phase 22 Wave 5 — Fresh Session Resume Handoff

**Written:** 2026-08-20
**For:** the next Claude session that opens this repo
**Prerequisite state:** origin/main at `a65f46b`

---

## Where Wave 5 is

4 of 7 tasks shipped. Landing commits (on origin/main):

| Task | Deliverable | Commit |
|------|-------------|--------|
| 0 | Soak-gate verified (ack flipped) | `ec46ea5` |
| 1 | `src/lib/evaluation/regime-done-gate.ts` — D-14 done-gate | `232f28d` |
| 2 | `scripts/phase-22-status.ts` composite gate + `npm run phase-22-status` | `232f28d` |
| 3 | `engine-context.ts` `source_mix` reader | `b1bf700` |
| 4 (partial) | `SourceMix` type contract in `EngineCalibration` | `c3dde7f` |

**Deferred items** (pre-existing, out of scope): `.planning/phases/22-market-regime-and-source-weights/deferred-items.md`

---

## What's left (in order)

### Task 4 (remaining): Source-mix UI row + tests

Follow `22-UI-SPEC.md` verbatim. Files to create/edit:

- `src/components/EngineCalibrationPanel.tsx` — insert Source-mix row between Concept Drift (L1004-1017) and AlignmentDisagreementBlocks (L1020). Row shell: `mt-3 bg-surface-container-high p-3 rounded-lg flex items-center justify-between`. Hard cap 44px height.
- `src/components/SourceMixExpanded.tsx` — NEW client island. Full 8-source ranking table + 30d weight-drift sparkline per source. Hand-rolled SVG sparkline (no chart library) — mirror the existing `Sparkline` primitive at `EngineCalibrationPanel.tsx:233-250`.
- `src/components/__tests__/EngineCalibrationPanel.test.tsx` — extend with regime pill render + top-3 sources render + click-expand assertions.
- `tests/e2e/source-mix-row.spec.ts` — turn Wave 0 Playwright RED stub GREEN.

Visual contract highlights from UI-SPEC:
- Regime pill: 4-bucket color/saturation. bull=teal (`--secondary`), bear=rose (`--error`). high-vol = `/25` fill, low-vol = `/10` fill. `ALL` = neutral grey `REGIME-UNCONDITIONAL` pill.
- #1 leading source: `★` glyph + `border-l-2 border-primary` stripe (indigo — the ONE accent reserved for this element).
- Cold-start (`regime='ALL'`): show `REGIME-UNCONDITIONAL` variant per UI-SPEC §Empty states.
- Zero math in the component — reads pre-computed `source_mix` from engine-context (already shipped Task 3).

### Task 5: Constraint-flip schema edit (operator-gated)

Edit `prisma/schema.prisma`:

```prisma
model LearnedPattern {
  // ...
  @@unique([signal_class, pattern_key, cap_class, horizon_days, regime])
}

model PerSourceIC {
  // ...
  @@unique([source_id, computed_at, forward_horizon_days, model_version, regime])
}

model SourceTier {
  // ...
  @@unique([source_id, computed_at, model_version, regime])
}
```

Then: `npx prisma format && npx prisma validate`. Commit as `feat(22-05): constraint-flip migration — add regime to unique keys`. Return a `checkpoint:human-action` — operator runs Task 6.

### Task 6: `npx prisma db push` (operator runs)

**Destructive-adjacent** (irreversible unique-constraint tightening). MUST be operator-gated.

```bash
npx prisma db push
# Verify:
npx prisma db pull --print | grep -E "@@unique.*regime"
```

### Task 7: Bookkeeping

Update:
- `.planning/REQUIREMENTS.md` — mark `[x]` on CORE-ML-06, 07, 08, 09, 10, 26, 27, 28
- `.planning/ROADMAP.md` — Phase 22 detail section `**Status:** Complete YYYY-MM-DD`
- `HYPERPARAMETERS.md` — append `## Phase 22` section: D-14 done-gate threshold (0.005 Brier-lift + BCa n=10000 + CI-excludes-0), reference to P21.1 `BRIER_LIFT_THRESHOLD`
- `docs/paper/methodology.md` — append §"Phase 22 — Regime-Conditional Bayesian Learning" with Hamilton 1989, Ang-Bekaert 2002, Benjamini-Bogomolov 2014 citations

Write `22-05-SUMMARY.md` per template.

---

## Post-Phase-22 next steps (do NOT touch during Wave 5)

1. **Update GSD `MODEL_ALIAS_MAP` to Fabel model** — see `[[reminder-update-models-after-p22]]` memory. Edit at `~/.claude/get-shit-done/bin/lib/core.cjs:1294-1298`.
2. **Discuss Phase 23.5 (Macro Regime Shift Detection)** — ROADMAP entry landed `a65f46b`. Run `/gsd-discuss-phase 23.5` in a fresh session AFTER P22 fully ships. Draft scope covers transition detector + VIX term structure + sector momentum + correlation regime + macro calendar + Macro Context UI tile + engine-context macro vars.

---

## Load-bearing deploy knowledge (learned from Waves 2/3 failures)

- Next.js App Router routes CANNOT export arbitrary names. If you add anything to `route.ts` beyond `GET/POST/runtime/dynamic/maxDuration/...`, put it in a sibling file.
- Vercel Hobby plan caps `maxDuration` at 300s. `next build` fails deploy if higher.
- ESLint blocks the build on `any` casts + `let` where const works + React Compiler impurity in server components.
- `npx next lint --max-warnings=999` must exit 0 errors OR deploy fails silently (the vercel.json build script `prisma migrate deploy && next build` returns 1).
- `prisma db push` reads `DIRECT_URL` (loaded from `.env.local` via `prisma.config.ts` — that's the 2026-06-14 fix).
- Neon serverless WebSocket adapter drops on long-running scripts. Wrap in retry loop that reconnects via fresh `PrismaClient` and resumes from cursor. See `scripts/backfill-regime-local.ts` for the pattern.

---

## Quick verification the session picks up correctly

```bash
git log --oneline -6
# Should show: a65f46b Phase 23.5 ROADMAP, c3dde7f SourceMix type,
# b1bf700 engine-context, 232f28d regimeDoneGate, ec46ea5 ack flip,
# 5a069ac remote-agent no-go
grep "relearn_complete_ack" .planning/phases/22-market-regime-and-source-weights/22-04-SOAK.md
# Should show: relearn_complete_ack: true
```

If both match, resume at Task 4.
