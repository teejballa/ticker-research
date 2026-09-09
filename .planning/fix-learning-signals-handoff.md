# Learning Signals Fix — Handoff for Fresh Session

**Written:** 2026-09-08  
**Status:** Partially complete. Original fixes shipped. Root cause deeper than the plan described. Continuation needed.

---

## What Was Already Fixed (commit cf3b4e8)

These 5 changes are on `main` and correct:

| File | Change |
|---|---|
| `src/lib/learning.ts:703` | `computeBrierOOS` now uses index-based dates (`new Date(i)`) for the 80/20 OOS split, not actual timestamps. Prevents <5-entry test sets when backfill data clusters in the distant past. |
| `src/lib/learning.ts:866,872` | `lambda_days` raised from 60→180 for `diffusion` and `technical` in `HYPERPARAMETERS`. |
| `src/lib/prompts/_v2/gemini-engine-context-block-active.md` | Signal strength tiers added: posterior >65% ACTIVE n≥50 → `confidence_level='High'` + "STRONG BUY SIGNAL" language. Posterior <35% → "STRONG SELL SIGNAL". |
| `src/lib/gemini-analysis.ts:~1185` | `engine_signal_strength` computed deterministically from `engineCtx` post-generation. Never from LLM output. |
| `src/lib/types.ts:600` | `engine_signal_strength` added to `EngineCalibration` interface. |
| `src/components/ResearchReport.tsx:~1084` | Green/red "Engine Confirmed: STRONG BUY/SELL" badge surfaces above recommendation bars when signal is strong. |

---

## The Deeper Root Cause (NOT in the original plan)

### What was believed (fix-learning-signals.md)
> "Blocker B — ESS ~5.7 for diffusion cells despite 400 raw samples"
> → fix: increase lambda_days 60→180

### What is actually true

Query this to verify:
```sql
SELECT COUNT(*) as total,
       MIN(occurred_at) as oldest,
       MAX(occurred_at) as newest
FROM learning_events
WHERE event_type='posterior_update'
  AND signal_class='diffusion'
  AND pattern_key='mainstream_first'
  AND cap_class='large_cap'
  AND horizon_days=7;
```

**Result: total = 1.** One LearningEvent. Despite `sample_size=384` on the cell.

**Why:** Phase 27's historical backfill (154,971 outcomes) incremented `alpha`/`beta`/`sample_size` directly in `learned_patterns` WITHOUT calling `processOneOutcome`. No LearningEvents were created. So `evaluateOneCell` fetches rawEvents, gets 1 row, builds `weightedObs` with 1 entry, computes ESS = 1.0. The ESS gate (≥30) can never pass. Brier OOS always null (needs ≥5 test entries). **All 5 ACTIVE gates fail permanently for all diffusion/technical cells regardless of lambda.**

### Current DB state (as of 2026-09-08)

```
ACTIVE | institutional | contrarian_inflow | large_cap | 30d  | n=225 | ESS=60.7 | p=0.557
ACTIVE | insider       | cluster_selling   | large_cap |  7d  | n=180 | ESS=96.4 | p=0.360
ACTIVE | insider       | cluster_buying    | large_cap | 30d  | n=105 | ESS=87.3 | p=0.402
ACTIVE | insider       | cluster_selling   | large_cap | 90d  | n=60  | ESS=57.5 | p=0.351
ACTIVE | insider       | lone_buy          | large_cap | 30d  | n=55  | ESS=32.4 | p=0.679  ← STRONG BUY
```

Diffusion: ALL EXPLORATORY, ESS=1.0, brier_oos=null.  
Technical: ALL EXPLORATORY, ESS=1.0-22, brier_oos=null for most.

The insider/lone_buy cell at p=0.679 (ACTIVE, n=55) WILL trigger a STRONG BUY badge now when it matches a report. Progress is real.

---

## The Fix Needed: LearningEvent Backfill

### Option A — Replay PriceOutcomes through processOneOutcome (clean, thorough)

`processOneOutcome` (in `src/app/api/cron/learn/route.ts`) is the function that:
1. Builds DiffusionTrace → checks pattern match → determines `diffusion_hit`
2. Writes a `LearningEvent` with `event_type='posterior_update'` and `delta: { diffusion_hit, hit, sector_relative_pct, ... }`

The historical PriceOutcomes already have `resolved=true` and their prices set. We need to mark them as "unprocessed" and let the cron replay them — OR write a targeted backfill route that:
- Walks all `PriceOutcome` rows WHERE `resolved=true`
- For each: finds the matching `DiffusionTrace`, computes `diffusion_hit`, writes a LearningEvent with `occurred_at = price_outcome.recorded_at` (the OUTCOME date, not today)
- Skips if LearningEvent already exists for this outcome

The key: `occurred_at` must be set to the **outcome's recorded_at**, not now. Otherwise all 154k events get timestamp = today, and ESS = N (all weights ≈ 1.0).

**Files involved:**
- Look at how `processOneOutcome` computes diffusion_hit: `src/app/api/cron/learn/route.ts` (search for `processOneOutcome`)
- The backfill route should go in `src/app/api/cron/backfill-learning-events/route.ts`
- Guard with `ENABLE_BACKFILL_LEARNING_EVENTS=1` env var (same pattern as `backfill-ess`)
- Idempotent marker: `LearningEvent` with `event_type='learning_event_backfill_complete'`

### Option B — Patch evaluateOneCell to fall back to PriceOutcome-based ESS

In `evaluateOneCell` (`src/app/api/cron/learn/route.ts:754`):
- After fetching rawEvents, if `rawEvents.length < 5`:
  - Query PriceOutcomes that match this cell's pattern
  - Build weightedObs from those (using `price_outcome.recorded_at` as timestamp)
  - Use those for ESS + Brier OOS computation
  - Still use LearningEvents for alpha/beta/posterior if available

**Pro:** No large backfill operation.  
**Con:** Doesn't create LearningEvents so brier_oos may still be sparse; the two code paths diverge.

### Recommendation: Option A

Option A is the right fix. The LearningEvents are the authoritative record of what the engine has "seen." Having 154k missing events is a data integrity gap. Once the backfill runs, every subsequent nightly cron picks up naturally from there.

---

## Implementation Notes for Option A

### How processOneOutcome works (key logic to replicate)

At a high level, for each PriceOutcome:
1. Find matching DiffusionTrace: `signal_class='diffusion'`, ticker matches, scanned_at < outcome.recorded_at
2. Determine cap_class from the trace
3. Compute `diffusion_hit = (sector_relative_pct > ALPHA_THRESHOLD)` 
   - `ALPHA_THRESHOLD` is defined in `src/lib/learning.ts` (look for `classifyHit`)
4. Write `LearningEvent`: `{ event_type: 'posterior_update', signal_class: 'diffusion', pattern_key: trace.flow_pattern, cap_class, horizon_days, occurred_at: outcome.recorded_at, delta: { diffusion_hit, hit: diffusion_hit, source: 'backfill', ... } }`
5. Increment cell alpha/beta (skip for backfill since alpha/beta was already updated)

**IMPORTANT:** The backfill should create LearningEvents but NOT re-update alpha/beta — those are already correct from Phase 27. Only the events are missing.

### Vercel env var needed
```
ENABLE_BACKFILL_LEARNING_EVENTS=1
```
Add to `.env.local` for local run, then Vercel dashboard for prod.

---

## Verification Checklist (after backfill runs)

```sql
-- Should show 100+ events per high-sample cell
SELECT signal_class, pattern_key, cap_class, horizon_days, COUNT(*) as event_count
FROM learning_events
WHERE event_type='posterior_update' AND signal_class='diffusion'
GROUP BY 1,2,3,4 ORDER BY 4 DESC LIMIT 10;

-- Should show ESS ≥ 30 for high-sample diffusion cells
SELECT signal_class, pattern_key, cap_class, horizon_days, sample_size,
       ROUND(CAST(effective_sample_size AS numeric),1) as ess,
       ROUND(CAST(alpha AS numeric)/CAST(alpha+beta AS numeric),3) as posterior,
       status, brier_out_sample
FROM learned_patterns
WHERE regime='ALL' AND signal_class='diffusion'
ORDER BY sample_size DESC LIMIT 10;

-- After next learn cron: should show diffusion cells ACTIVE
SELECT status, COUNT(*) FROM learned_patterns WHERE regime='ALL' GROUP BY status;
```

---

## Context: Why the Original Plan Was Incomplete

`fix-learning-signals.md` correctly identified the symptoms (ESS≈5.7, brier_oos=null) and had the right fixes (lambda, index-based split, prompt tiers). It was wrong about the root cause: it assumed 400 raw samples = 400 LearningEvents. They're not. The `sample_size` column counts Bayesian update operations (which Phase 27 did directly), not LearningEvents.

The lambda=180 and index-based OOS fixes are still correct and should be left in place — they will help once the LearningEvents exist.
