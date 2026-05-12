/**
 * Plan 20-Z-03 — live-Neon integration test for /api/insights/sentiment-health.
 *
 * Seeds 5 deterministic rows for a TEST_TICKER, invokes the route GET handler,
 * and asserts:
 *   - 200 response
 *   - elapsed < 2s (acceptance criterion in plan Task 12)
 *   - body.providers non-empty
 *   - the seeded 'gemini' provider appears with count_24h >= 5
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { GET } from '@/app/api/insights/sentiment-health/route';

const TEST_TICKER = `TEST20Z03H_${Date.now()}`;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('Integration test requires DATABASE_URL');
  }
  const now = new Date();
  for (let i = 0; i < 5; i++) {
    await prisma.providerCallLog.create({
      data: {
        provider_id: 'gemini',
        ticker: TEST_TICKER,
        started_at: new Date(now.getTime() - 1000),
        ended_at: new Date(now.getTime()),
        duration_ms: 200 + i * 50,
        status: i === 4 ? 'error' : 'ok',
        http_status: i === 4 ? 500 : 200,
        error_class: i === 4 ? 'UPSTREAM_5XX' : null,
        fallback_used: i === 3,
        cache_hit: i === 0,
        cost_usd: 0.1,
        retry_count: 0,
      },
    });
  }
});

afterAll(async () => {
  await prisma.providerCallLog.deleteMany({ where: { ticker: TEST_TICKER } });
  await prisma.$disconnect();
});

describe('/api/insights/sentiment-health — endpoint integration', () => {
  it('returns 200 with non-empty providers within 2s', async () => {
    const t0 = Date.now();
    const res = await GET();
    const elapsed = Date.now() - t0;
    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(2000);

    const body = (await res.json()) as {
      generated_at: string;
      window_hours: number;
      providers: Array<{
        provider_id: string;
        count_24h: number;
        latency_p50_ms: number;
        latency_p95_ms: number;
        latency_p99_ms: number;
        error_rate: number;
        cache_hit_rate: number;
        fallback_rate: number;
        total_cost_usd_24h: number;
        cost_per_call_usd_24h: number;
      }>;
    };
    expect(body.window_hours).toBe(24);
    expect(body.providers.length).toBeGreaterThanOrEqual(1);

    const gemini = body.providers.find((p) => p.provider_id === 'gemini');
    expect(gemini).toBeDefined();
    expect(gemini!.count_24h).toBeGreaterThanOrEqual(5);
    expect(gemini!.latency_p50_ms).toBeGreaterThan(0);
    expect(gemini!.error_rate).toBeGreaterThanOrEqual(0);
    expect(gemini!.error_rate).toBeLessThanOrEqual(1);
  });
});
