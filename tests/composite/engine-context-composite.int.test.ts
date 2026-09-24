import { describe, it, expect } from 'vitest';
// Integration test — requires live Neon connection. Run via `npm run test:integration`.
describe('getEngineContextForTicker — composite fields (Wave 3)', () => {
  it('populates 7 composite fields when snapshot exists for cell', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getEngineContextForTicker } = require('@/lib/engine-context');
    const ctx = await getEngineContextForTicker('AAPL');
    expect(ctx).toHaveProperty('composite_prob');
    expect(ctx).toHaveProperty('composite_ci_low');
    expect(ctx).toHaveProperty('composite_ci_high');
    expect(ctx).toHaveProperty('composite_class_count');
    expect(ctx).toHaveProperty('composite_gate_status');
    expect(ctx).toHaveProperty('composite_class_weights');
    expect(ctx).toHaveProperty('composite_per_class_calibrated');
  });
});
