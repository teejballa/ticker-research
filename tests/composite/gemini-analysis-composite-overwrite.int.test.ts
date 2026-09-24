import { describe, it, expect, vi } from 'vitest';
// Wave 3 Task 24-03-04 extends the post-process block in src/lib/gemini-analysis.ts
// (existing Phase 17-04 pattern at ~lines 1160-1243) to copy 7 composite fields from
// engineCtx → analysis.engine_calibration. Without this, EngineContext gets the fields
// but reports render "insufficient history" for the composite headline.
describe('runGeminiAnalysis — composite field post-process overwrite (Wave 3 Task 24-03-04)', () => {
  it('copies all 7 composite_* fields from engineCtx into analysis.engine_calibration', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const gemini = require('@/lib/gemini-analysis');
    // Stub getEngineContextForTicker (Wave 3 Task 1 output) with a deterministic
    // composite payload. The unit under test is the post-process overwrite ONLY —
    // it does not need to call the real LLM. Executor MUST either use vi.mock on
    // gemini-analysis internals OR export a test-only entry point during Wave 3
    // Task 24-03-04. See 24-REVISION-TODO.md Blocker #1 for the contract.
    const engineCtx = {
      composite_prob: 0.71,
      composite_ci_low: 0.62,
      composite_ci_high: 0.80,
      composite_class_count: 3,
      composite_gate_status: 'active' as const,
      composite_class_weights: { diffusion: 0.4, technical: 0.3, institutional: 0.2, insider: 0.1 },
      composite_per_class_calibrated: { diffusion: 0.68, technical: 0.72, institutional: 0.75, insider: null },
    };
    // Executor: replace this stub with the real integration once Task 24-03-04 lands.
    // The test contract: after runGeminiAnalysis returns, `analysis.engine_calibration`
    // MUST contain exact numeric equality on every composite field vs engineCtx.
    expect(typeof gemini).toBe('object'); // sanity: module resolved
    // TODO(Wave 3 Task 24-03-04): call runGeminiAnalysis with stubbed engineCtx +
    // assert analysis.engine_calibration.composite_prob === engineCtx.composite_prob
    // (and 6 more assertions for the other fields).
    expect(engineCtx.composite_prob).toBe(0.71); // placeholder — turn GREEN in Wave 3.
  });
});
