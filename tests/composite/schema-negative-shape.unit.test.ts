import { describe, it, expect, vi } from 'vitest';
// gemini-analysis imports @/lib/db (via engine-context). Stub prisma so the unit
// test does not require a live DATABASE_URL at import time.
vi.mock('@/lib/db', () => ({ prisma: {} }));
import { AnalysisResultSchema } from '@/lib/gemini-analysis';
describe('AnalysisResultSchema trust boundary (REASON-05, Pitfall 1)', () => {
  it('does NOT contain composite_* in Zod shape — LLM must never write composite fields', () => {
    // Wave 3 (Phase 24 D-05, REASON-05): the 7 composite_* fields are authored
    // by engine-context.ts and copied into analysis.engine_calibration by the
    // gemini-analysis.ts post-process overwrite (Task 24-03-04). They must
    // never appear inside the Zod schema — that would give the LLM a channel
    // to inject/override them, breaking the trust boundary.
    expect(AnalysisResultSchema.shape).not.toHaveProperty('composite_prob');
    expect(AnalysisResultSchema.shape).not.toHaveProperty('composite_ci_low');
    expect(AnalysisResultSchema.shape).not.toHaveProperty('composite_ci_high');
    expect(AnalysisResultSchema.shape).not.toHaveProperty('composite_class_count');
    expect(AnalysisResultSchema.shape).not.toHaveProperty('composite_gate_status');
    expect(AnalysisResultSchema.shape).not.toHaveProperty('composite_class_weights');
    expect(AnalysisResultSchema.shape).not.toHaveProperty('composite_per_class_calibrated');
  });
});
