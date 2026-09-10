# Fix: Learning Engine → Meaningful Strong Buy / Sell Signals

**Written:** 2026-09-03  
**Context:** Fresh investigation confirmed the engine accumulates data and runs correctly,
but diffusion/technical cells never reach ACTIVE status, so every report sees
"treat prior as weak" and the AI overrides it. Insider cells (2) are ACTIVE but
not enough to drive strong output signals. This plan fixes the root causes and
wires the engine output into a real signal tier.

---

## Root Cause Diagnosis (do NOT re-investigate — already confirmed)

### Problem 1: Diffusion cells never reach ACTIVE (two independent blockers)

**Blocker A — `brier_out_sample` is NULL for ALL diffusion cells**
- Location: `src/app/api/cron/learn/route.ts:889`
- `computeBrierOOS(predictions, weightedObs, 0.2)` returns null for every diffusion cell
- This blocks gate (c): Brier lift = brier_null − brier_out_sample → can't compute → fails
- Insider cells have non-null brier_out_sample and DO get promoted → the bug is diffusion-specific
- Confirmed: 4,285 of 6,600 posterior_update events carry `diffusion_hit` (data IS there)
- Most likely cause: `computeBrierOOS` has a minimum test-set-size guard that fails when
  decay-weighted OOS slice is effectively empty (ESS ~5 → almost no weight on held-out 20%)

**Blocker B — ESS ~5.7 for diffusion cells despite 400 raw samples**
- `lambda_days = 60` for all signal classes (bootstrap default, never re-tuned — see learning.ts:866)
- Phase 27 backfilled 154,971 historical outcomes from years ago
- 60-day exponential decay makes those old observations near-zero weight
- Kish ESS = (Σwᵢ)² / Σwᵢ² collapses to ~5.7 → gate (a) requires ESS ≥ 30 → fails
- Insider cells are ACTIVE because insider data is recent (Phase 17, May 2026 onward) —
  all 58 observations within ~150 days → ESS ≈ 40-55

**Note on Blocker B:** Even if Blocker A is fixed, cells still can't reach ACTIVE while
ESS < 30. Both must be fixed.

### Problem 2: Even ACTIVE cells don't produce "Strong" signals

- The Gemini prompt for ACTIVE status says investment_thesis "MUST be consistent with engine prior"
  but gives no signal strength mapping — AI still produces generic "Buy" at any posterior level
- Schema has `confidence_level: 'high' | 'medium' | 'low'` set freely by Gemini — engine doesn't enforce it
- No "Strong Buy / Strong Sell" tier exists in the output schema
- The report UI does not surface engine posterior as a recommendation intensifier

---

## The Fix — Four Tasks

### Task 1: Fix `brier_out_sample` null for diffusion cells
**File:** `src/app/api/cron/learn/route.ts`

1. Find `computeBrierOOS` implementation (likely in `src/lib/learning.ts` or evaluation module)
2. Add a `console.log` on a single cron run to print `weightedObs.length`, `predictions.length`,
   and the OOS result for the `diffusion/mainstream_first/large_cap/7d/ALL` cell
3. Identify whether it returns null due to: (a) empty predictions, (b) min test-set guard,
   (c) all-zero weights in OOS slice, or (d) something else
4. Fix the guard so Brier OOS is computed whenever there are ≥ 5 held-out observations
   (do NOT require the OOS slice to have meaningful decay weight — weight is used for
   training, not for deciding whether to compute OOS at all)
5. After fix: re-run the learn cron locally (`curl -H "Authorization: Bearer $CRON_SECRET" /api/cron/learn`)
   and verify `brier_out_sample` is non-null for `mainstream_first/large_cap/7d/ALL`

### Task 2: Fix ESS starvation for diffusion and technical cells
**File:** `src/lib/learning.ts` (HYPERPARAMETERS object, lines 864–892)

The fix: increase `lambda_days` for diffusion and technical from 60 → 180.

**Rationale:**
- Diffusion (community sentiment spread) and technical (chart patterns) are slower-moving
  signals than insider activity or institutional flows. A 60-day half-life was chosen when
  N=87 and the system was new. With 154k+ outcomes now, the signal deserves a longer memory.
- 180 days = 6-month half-life. An observation from 180 days ago gets 50% weight (vs 37%
  at 60 days for 60d-old data). An observation from 1 year ago gets 25% weight — still visible.
- Insider and institutional should stay at 60 days (those signals are flow-based and stale faster).

```typescript
// learning.ts HYPERPARAMETERS — change diffusion and technical only:
diffusion: {
  lambda_days: 180,   // was 60 — increased because diffusion uses historical backfill
  ...
},
technical: {
  lambda_days: 180,   // was 60 — same reason
  ...
},
```

After changing lambda, the next cron run will recompute ESS for all cells from their
LearningEvents. Expect ESS for `mainstream_first/large_cap/7d/ALL` to jump from ~5.7 to ~50-150
(depends on event age distribution). Gate (a) should then pass for the high-sample cells.

**After both Task 1 and Task 2:** The high-sample diffusion cells (mainstream_first, breakdown,
consolidation × large_cap) should pass all 5 gates and flip to ACTIVE within the next nightly
cron run. Verify by querying:
```sql
SELECT signal_class, pattern_key, status, effective_sample_size, brier_out_sample
FROM learned_patterns WHERE regime = 'ALL' ORDER BY sample_size DESC LIMIT 20;
```

### Task 3: Strengthen the Gemini prompt when ACTIVE cells agree
**File:** `src/lib/prompts/_v1/gemini-engine-context-block-active.md`

Currently, ACTIVE status says "MUST be consistent with engine prior" but doesn't give the AI
a signal strength mapping. Add explicit tiers:

Replace the INSTRUCTIONS block with:

```
INSTRUCTIONS for engine_calibration:

SIGNAL STRENGTH TIERS (use these to set confidence_level):
  - posterior > 65% AND status = ACTIVE AND sample_size ≥ 50:
      → confidence_level MUST be 'high'. Use language like "the engine strongly signals..."
      → If your qualitative read agrees: write "STRONG BUY SIGNAL" in engine_alignment
  - posterior < 35% AND status = ACTIVE AND sample_size ≥ 50:
      → confidence_level MUST be 'high' (for bearish). Use "the engine strongly signals caution"
      → If your qualitative read agrees: write "STRONG SELL SIGNAL" in engine_alignment
  - posterior 55–65% or 35–45%, status = ACTIVE:
      → confidence_level SHOULD be 'medium' unless other evidence overrides
  - status = EXPLORATORY: treat as weak prior, weight qualitative read more heavily

1. Numeric fields will be overwritten post-generation — do not invent numbers.
2. In engine_alignment: affirm alignment when posterior and qualitative read agree.
   For ACTIVE HIGH-CONVICTION cells (>65% or <35%), use "STRONG BUY/SELL SIGNAL" explicitly.
3. In engine_disagreement: if your read CONTRADICTS an ACTIVE prior with sample_size ≥ 10,
   explain specifically why. Otherwise leave null.
4. investment_thesis, key_risks, and confidence_level MUST match the engine tier above.
5. If status = EXPLORATORY, the prior is weak — your qualitative judgment dominates.
```

### Task 4: Add `engine_signal_strength` to the output schema
**File:** `src/lib/gemini-analysis.ts`

1. Add to the `AnalysisResult` Zod schema:
```typescript
engine_signal_strength: z.enum(['strong_buy', 'buy', 'neutral', 'sell', 'strong_sell', 'insufficient_data']).optional(),
```

2. After generating the result, compute this deterministically in the post-process step
   (NOT from Gemini output — from `engineCtx` directly):
```typescript
function computeSignalStrength(ctx: EngineContext): string {
  if (ctx.status !== 'ACTIVE' || ctx.posterior_mean == null || ctx.sample_size < 10) {
    return 'insufficient_data';
  }
  const p = ctx.posterior_mean;
  if (p > 0.65) return 'strong_buy';
  if (p > 0.55) return 'buy';
  if (p < 0.35) return 'strong_sell';
  if (p < 0.45) return 'sell';
  return 'neutral';
}
```

3. Overwrite the field post-generation (same trust-boundary pattern used for
   `posterior_mean`, `technical_posterior_mean`, etc. at lines 1114–1155).

4. Surface in the ResearchReport component: when `engine_signal_strength` is
   `strong_buy` or `strong_sell`, show a highlighted badge above the Buy/Hold/Sell
   assessment: "ENGINE CONFIRMED: STRONG BUY" (green) or "ENGINE CONFIRMED: STRONG SELL" (red).

---

## Execution Order

1. Task 1 first (fix brier_out_sample null) — must diagnose before touching lambda
2. Task 2 second (increase lambda_days) — only after confirming brier_out_sample will populate
3. Run the learn cron and verify ACTIVE cells appear for diffusion
4. Task 3 (strengthen prompt) — only after diffusion cells are ACTIVE, otherwise the
   stronger prompt fires against EXPLORATORY cells and produces overconfident output
5. Task 4 (engine_signal_strength field) — can run in parallel with Task 3

## Verification checklist

- [ ] `brier_out_sample` non-null for diffusion/mainstream_first/large_cap/7d/ALL
- [ ] ESS ≥ 30 for at least 5 high-sample diffusion cells
- [ ] At least 3 diffusion cells show status = 'ACTIVE'
- [ ] `cell_promoted` events appear in learning_events for diffusion signal_class
- [ ] A report on AAPL or MSFT shows `engine_signal_strength` badge (not 'insufficient_data')
- [ ] When posterior > 65% ACTIVE: report confidence_level = 'high' and engine_alignment
      contains "STRONG" language

## Files touched

| File | Change |
|---|---|
| `src/lib/learning.ts` | lambda_days: 60 → 180 for diffusion + technical |
| `src/app/api/cron/learn/route.ts` | Fix computeBrierOOS null for diffusion (Task 1 diagnosis first) |
| `src/lib/prompts/_v1/gemini-engine-context-block-active.md` | Add signal strength tiers |
| `src/lib/gemini-analysis.ts` | Add engine_signal_strength, compute post-generation |
| Report UI component (find via grep for `engine_calibration`) | Surface strong signal badge |
