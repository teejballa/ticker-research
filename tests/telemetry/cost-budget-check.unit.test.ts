/**
 * Plan 20-Z-03 — cost-budget-check cold-start unit test (T-20-Z-03-04).
 *
 * Stubs the raw SQL aggregation to verify two branches:
 *   - days_observed < 7 → status='insufficient_history' (cold-start no-op)
 *   - days_observed >= 7 AND today/baseline > 1.5 → status='alert'
 */
import { describe, it, expect, vi } from 'vitest';

// Mock prisma raw query — return one cold-start row + one alert row.
vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRawUnsafe: vi.fn().mockResolvedValue([
      { provider_id: 'yahoo', today_cost: 0.12, baseline_mean: 0.10, days_observed: BigInt(3) },
      { provider_id: 'gemini', today_cost: 1.20, baseline_mean: 0.50, days_observed: BigInt(7) },
    ]),
  },
}));

import { GET } from '@/app/api/cron/cost-budget-check/route';

describe('cost-budget-check — cold-start (T-20-Z-03-04)', () => {
  it('emits insufficient_history for providers with <7 days and alerts on ratio > 1.5x', async () => {
    // Build a Request with the Bearer header; when CRON_SECRET is unset, the
    // route allows the call through (guard short-circuits when env is unset).
    const req = new Request('http://localhost/api/cron/cost-budget-check', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      alerts: Array<{ provider_id: string; status: string; ratio: number }>;
    };

    const yahoo = body.alerts.find((a) => a.provider_id === 'yahoo');
    const gemini = body.alerts.find((a) => a.provider_id === 'gemini');
    expect(yahoo?.status).toBe('insufficient_history');
    expect(gemini?.status).toBe('alert'); // 1.20 / 0.50 = 2.4x > 1.5x
    expect(gemini?.ratio).toBeCloseTo(2.4, 2);
  });
});
