import { describe, it, expect } from 'vitest';
describe('/api/insights/composite-calibration (REASON-04)', () => {
  it('returns latest snapshot with reliability_bins for cipher-composite-v1', async () => {
    const res = await fetch(`${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/api/insights/composite-calibration`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('classifier_version', 'cipher-composite-v1');
    expect(json).toHaveProperty('reliability_bins');
  });
});
