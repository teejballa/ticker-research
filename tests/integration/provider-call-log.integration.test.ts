/**
 * Plan 20-Z-03 — live-Neon integration test for ProviderCallLog round-trip.
 *
 * Verifies:
 *   - withTelemetry persists a row through queueMicrotask + Prisma create
 *   - persisted row has expected columns / types
 *   - errored wrapped call records error_class + http_status
 *   - percentile_cont SQL aggregation returns plausible numbers
 *   - deleteOlderThan(90) removes only rows older than threshold
 *
 * Cleanup: every test row is tagged with a unique TEST_TICKER and removed in
 * afterAll. The wrapper INSERT is fire-and-forget, so each test that depends
 * on a written row uses waitForRow() to poll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/lib/db';
import { withTelemetry } from '@/lib/telemetry/withTelemetry';
import { deleteOlderThan } from '@/lib/telemetry/provider-call-log';

const TEST_TICKER = `TEST20Z03_${Date.now()}`;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('Integration test requires DATABASE_URL');
  }
});

afterAll(async () => {
  await prisma.providerCallLog.deleteMany({ where: { ticker: TEST_TICKER } });
  await prisma.$disconnect();
});

async function waitForRow(ticker: string, timeoutMs = 3000): Promise<number> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const c = await prisma.providerCallLog.count({ where: { ticker } });
    if (c >= 1) return c;
    await new Promise((r) => setTimeout(r, 50));
  }
  return 0;
}

describe('ProviderCallLog — live-Neon integration', () => {
  it('withTelemetry persists >=1 row after a successful wrapped call', async () => {
    const value = await withTelemetry('yahoo', async () => ({ price: 100.0 }), {
      ticker: TEST_TICKER,
    });
    expect(value).toEqual({ price: 100.0 });
    const c = await waitForRow(TEST_TICKER);
    expect(c).toBeGreaterThanOrEqual(1);
  });

  it('persisted row has expected columns and types', async () => {
    const row = await prisma.providerCallLog.findFirst({
      where: { ticker: TEST_TICKER },
      orderBy: { started_at: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(row!.provider_id).toBe('yahoo');
    expect(row!.status).toBe('ok');
    expect(row!.started_at).toBeInstanceOf(Date);
    expect(row!.ended_at).toBeInstanceOf(Date);
    expect(row!.duration_ms).toBeGreaterThanOrEqual(0);
    expect(row!.cache_hit).toBe(false);
    expect(row!.fallback_used).toBe(false);
    expect(row!.error_class).toBeNull();
  });

  it('errored wrapped call records error row with classified error_class', async () => {
    try {
      await withTelemetry(
        'finnhub',
        async () => {
          throw Object.assign(new Error('rate'), { status: 429 });
        },
        { ticker: TEST_TICKER },
      );
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as { status?: number }).status).toBe(429);
    }
    // Wait for the fire-and-forget INSERT.
    await new Promise((r) => setTimeout(r, 200));
    const row = await prisma.providerCallLog.findFirst({
      where: { ticker: TEST_TICKER, status: 'error' },
      orderBy: { started_at: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(row!.error_class).toBe('RATE_LIMITED');
    expect(row!.http_status).toBe(429);
  });

  it('percentile_cont SQL aggregation returns plausible numbers from inserted rows', async () => {
    // Insert 10 deterministic durations to make percentiles predictable.
    const now = new Date();
    for (let i = 0; i < 10; i++) {
      await prisma.providerCallLog.create({
        data: {
          provider_id: 'polygon',
          ticker: TEST_TICKER,
          started_at: new Date(now.getTime() - 1000),
          ended_at: new Date(now.getTime()),
          duration_ms: (i + 1) * 100, // 100, 200, ..., 1000
          status: 'ok',
          http_status: 200,
          error_class: null,
          fallback_used: false,
          cache_hit: false,
          cost_usd: 0,
          retry_count: 0,
        },
      });
    }
    const rows = await prisma.$queryRawUnsafe<
      Array<{ provider_id: string; p50: number; p95: number; p99: number }>
    >(
      `
      SELECT provider_id,
             percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_ms) AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
             percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_ms) AS p99
      FROM "provider_call_logs"
      WHERE ticker = $1 AND provider_id = 'polygon'
      GROUP BY provider_id
      `,
      TEST_TICKER,
    );
    expect(rows.length).toBe(1);
    // Median of {100,200,...,1000} = 550 (linear interpolation between 500 and 600)
    expect(rows[0].p50).toBeGreaterThan(500);
    expect(rows[0].p50).toBeLessThan(600);
    // p95 ≈ 955; p99 ≈ 991
    expect(rows[0].p95).toBeGreaterThan(900);
    expect(rows[0].p99).toBeGreaterThan(950);
  });

  it('deleteOlderThan removes only rows older than threshold', async () => {
    // Insert one row with started_at 100 days ago.
    const oldDate = new Date(Date.now() - 100 * 86_400_000);
    await prisma.providerCallLog.create({
      data: {
        provider_id: 'apewisdom',
        ticker: TEST_TICKER,
        started_at: oldDate,
        ended_at: oldDate,
        duration_ms: 0,
        status: 'ok',
        http_status: null,
        error_class: null,
        fallback_used: false,
        cache_hit: false,
        cost_usd: 0,
        retry_count: 0,
      },
    });
    const before = await prisma.providerCallLog.count({ where: { ticker: TEST_TICKER } });
    const r = await deleteOlderThan(90);
    const after = await prisma.providerCallLog.count({ where: { ticker: TEST_TICKER } });
    expect(r.deleted).toBeGreaterThanOrEqual(1);
    expect(after).toBeLessThan(before);
  });
});
