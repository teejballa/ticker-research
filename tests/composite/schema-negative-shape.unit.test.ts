import { describe, it, expect } from 'vitest';
describe('analysisResultSchema trust boundary (REASON-05, Pitfall 1)', () => {
  it('does NOT contain composite_prob in Zod shape', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { analysisResultSchema } = require('@/lib/gemini-analysis');
    expect(analysisResultSchema.shape).not.toHaveProperty('composite_prob');
    expect(analysisResultSchema.shape).not.toHaveProperty('composite_ci_low');
    expect(analysisResultSchema.shape).not.toHaveProperty('composite_ci_high');
    expect(analysisResultSchema.shape).not.toHaveProperty('composite_class_count');
    expect(analysisResultSchema.shape).not.toHaveProperty('composite_gate_status');
    expect(analysisResultSchema.shape).not.toHaveProperty('composite_class_weights');
    expect(analysisResultSchema.shape).not.toHaveProperty('composite_per_class_calibrated');
  });
});
