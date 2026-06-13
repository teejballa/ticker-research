# Cipher Learning Ledger

**Owner:** TJ · **Purpose:** Independent Study (SFUHS, Spring 2027) · **Started:** 2026-05-27

This file is the single source of truth for *learning the math under Cipher* — not for
building features. Cipher already ships sophisticated methodology (Purged K-Fold CV,
Beta-Binomial priors, calibration, Brier scoring) that was implemented before I personally
understood it. This ledger exists to close that gap, one concept per morning, and to feed the
IS technical paper at `docs/paper/`.

It is read by my **Cowork daily briefing** every morning. The briefing teaches the concept;
this ledger tracks what's been learned and maps each concept to where it already lives in this
codebase.

---

## How it works

**Backfill mode (now → ~end of summer 2026):** Work through the curriculum below in order, one
concept per morning. The codebase is years ahead of my understanding; backfill catches me up
to what's already shipped.

**Forward mode (after backfill):** For each new Cipher phase, learn the relevant math *before*
implementing it, so code gets written with understanding instead of looked up afterward.

**The loop per concept:**
1. Cowork briefing teaches it (plain English → the math → where it lives here → a check question)
2. I answer the check question the next morning
3. When I can explain it unprompted, mark it ✅ and write the teaching-level version into
   `docs/paper/methodology.md`
4. Concept is "done" only when it's ✅ *and* 📝 (in the paper)

**Status legend:** ⬜ not started · 📖 learning · ✅ can explain it unprompted · 📝 written into paper

**Sources (cite by chapter, don't paraphrase from memory):**
- CS229 main notes — <https://cs229.stanford.edu/main_notes.pdf>
- An Introduction to Statistical Learning, 2nd ed. — <https://www.statlearning.com>

---

## Curriculum & code map

Order matches the backfill sequence. Each chapter spans several mornings.

| # | Concept | Source | Where it already lives in Cipher | Status |
|---|---------|--------|----------------------------------|--------|
| 1 | Train/val/test split, generalization, what overfitting *is* | ISL Ch. 2 | The whole EXPLORATORY→ACTIVE promotion gate exists to avoid overfitting sparse cells — `src/lib/learning.ts` (`enforceLiveOnlyGate`), `HYPERPARAMETERS.md` (`live_outcome_gate`) | ⬜ |
| 2 | Bias-variance tradeoff & regularization intuition | ISL Ch. 2 / CS229 "Bias-Variance and Regularization" | Why sparse-cell priors must regress to a base rate — `src/lib/learning.ts` | ⬜ |
| 3 | Resampling: why random k-fold leaks the future; walk-forward / time-series CV | ISL Ch. 5 | `src/lib/cv.ts`, `src/lib/__tests__/cv.purgedkfold.test.ts`, `src/lib/backtest/windowing.ts`, `docs/paper/methodology.md` §6 (CLAUDE.md Rule #1) | ⬜ |
| 4 | Purged K-Fold + embargo gap (the variant Cipher actually uses) | ISL Ch. 5 (extension) | `src/lib/cv.ts`, `cv.purgedkfold.test.ts`, methodology.md §6 | ⬜ |
| 5 | Bootstrap & confidence intervals on hit-rate / alpha | ISL Ch. 5 | **Verify coverage** — CLAUDE.md Rule #3 requires CIs on every reported number; confirm where computed | ⬜ |
| 6 | Classification: logistic regression, confusion matrix, ROC/AUC | ISL Ch. 4 | Buy/Hold/Sell framing; baseline (see #12) | ⬜ |
| 7 | Probability calibration: Platt, isotonic, reliability diagrams | ISL Ch. 4 + CS229 "Evaluation Metrics" | `src/lib/sentiment/calibration.ts`, `src/lib/sentiment/calibration-hyperparameters.ts`, `src/lib/evaluation/tier-calibration.ts`, `src/app/insights/calibration/` page | ⬜ |
| 8 | Proper scoring rules: log loss, **Brier**, why accuracy is gameable | ISL Ch. 4 + CS229 "Information Theory" | `src/app/insights/calibration/components/BrierTile.tsx`, Brier-lift in Phase 23, methodology.md §8 (Brier 1950) | ⬜ |
| 9 | Shrinkage: ridge/lasso → why few-observation cells shrink toward global base rate | ISL Ch. 6 | `src/lib/learning.ts` prior update, `src/lib/engine-context.ts` | ⬜ |
| 10 | Bayesian updating: MAP, conjugate priors, the **Beta-Binomial** update | CS229 "Bayesian Methods" | `src/lib/learning.ts`, `src/lib/engine-thesis.ts`, `src/lib/engine-context.ts` | ⬜ |
| 11 | Time-decay posterior (`w = exp(−days/60)`) — why old observations fade | CS229 Bayesian / Phase 18 | `src/lib/learning.ts`, `src/lib/reasoning/alpha-decay-monitor.ts`, `HYPERPARAMETERS.md` | ⬜ |
| 12 | Multiple-testing correction: Bonferroni, BH-FDR across regime cells | ISL Ch. 13 | ⚠️ **GAP** — CLAUDE.md Rule #5 mandates this before regime claims; not confirmed in code. Learn it, then audit whether it's implemented | ⬜ |
| 13 | Tree/ensemble baselines vs. the LLM (logistic + gradient-boosted tree) | ISL Ch. 8 + Ch. 4 | ⚠️ **GAP** — CLAUDE.md names `src/lib/backtest/baselines.ts`; does not exist yet. This is the "LLM beats logistic on Brier by X [CI]" claim for the paper | ⬜ |

⚠️ rows are honest gaps: methodology CLAUDE.md treats as load-bearing but that isn't shipped.
They are the highest-value summer build targets, because they're what the paper's central
claim depends on.

---

## Daily log

One row per morning. The "check answered?" column is filled the *next* morning.

| Date | Day | Concept | Check question | Answered correctly? |
|------|-----|---------|----------------|---------------------|
| _(first entry lands the morning after Cowork starts)_ | | | | |

---

## My-understanding notes

When a concept clicks, write a short note here in *my own words* (3–5 sentences). If I can't
write it without looking, I don't understand it yet. These notes become paragraphs in
`docs/paper/methodology.md`.

<!-- e.g.
### Purged K-Fold (Day N, 2026-06-xx)
In my own words: ...
-->
