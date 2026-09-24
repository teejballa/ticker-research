import { describe, it, expect } from 'vitest';
describe('/insights/calibration renders cipher-composite-v1 card', () => {
  it('page HTML contains the composite classifier_version', async () => {
    const res = await fetch(`${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/insights/calibration`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/cipher-composite-v1/);
  });
});
