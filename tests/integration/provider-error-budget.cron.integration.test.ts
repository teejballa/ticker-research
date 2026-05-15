// Phase: 30 — Provider Health Hardening
// Phase 30 D-17 — integration coverage for /api/cron/provider-error-budget.
//
// Runs under `npm run test:integration` against a live Neon connection.
// The ProviderHealthAlert Prisma model was migrated in Plan 30-02 Task 4;
// the original RED-state @ts-expect-error annotations are removed.
//
// Tests cover:
//   - Bearer CRON_SECRET auth gate (401 on missing/wrong header)
//   - insufficient_history short-circuit when total_count < 50
//   - INSERT on breach (error_rate > 0.10 AND total >= 50)
//   - Idempotency — no duplicate INSERT during sustained breach
//   - Resolution — UPDATE resolved_at when error_rate drops below threshold
//   - dominant_error_class derivation from most-frequent error_class column
//   - maxDuration export = 60

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';

const TEST_PROVIDER = `test30P04_${Date.now()}`;
const ORIG_SECRET = process.env.CRON_SECRET;
const TEST_SECRET = 'integration-test-secret';

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('Integration test requires DATABASE_URL');
  }
  process.env.CRON_SECRET = TEST_SECRET;
});

afterAll(async () => {
  process.env.CRON_SECRET = ORIG_SECRET;
  if (!process.env.DATABASE_URL) return;
  const { prisma } = await import('@/lib/db');
  await prisma.providerCallLog.deleteMany({ where: { provider_id: TEST_PROVIDER } });
  await prisma.providerHealthAlert.deleteMany({ where: { provider_id: TEST_PROVIDER } });
  await prisma.$disconnect();
});

beforeEach(async () => {
  const { prisma } = await import('@/lib/db');
  await prisma.providerCallLog.deleteMany({ where: { provider_id: TEST_PROVIDER } });
  await prisma.providerHealthAlert.deleteMany({ where: { provider_id: TEST_PROVIDER } });
});

interface SeedRow {
  status: 'ok' | 'error';
  error_class?: string | null;
  started_at?: Date;
}

async function seed(provider_id: string, rows: SeedRow[]): Promise<void> {
  const { prisma } = await import('@/lib/db');
  const now = new Date();
  await prisma.providerCallLog.createMany({
    data: rows.map((r, i) => ({
      provider_id,
      ticker: null,
      started_at: r.started_at ?? new Date(now.getTime() - i * 1000),
      ended_at: r.started_at ?? new Date(now.getTime() - i * 1000 + 100),
      duration_ms: 100,
      status: r.status,
      http_status: r.status === 'error' ? 500 : 200,
      error_class: r.status === 'error' ? r.error_class ?? 'UPSTREAM_5XX' : null,
      fallback_used: false,
      cache_hit: false,
      cost_usd: 0,
      retry_count: 0,
    })),
  });
}

async function callCron(authHeader?: string): Promise<Response> {
  const { GET } = await import('@/app/api/cron/provider-error-budget/route');
  const req = new Request('http://localhost/api/cron/provider-error-budget', {
    headers: authHeader ? { authorization: authHeader } : {},
  });
  return GET(req);
}

describe('Phase 30 / D-17: provider-error-budget cron', () => {
  it('D-17: rejects requests without Bearer CRON_SECRET with 401', async () => {
    const res = await callCron(undefined);
    expect(res.status).toBe(401);
    const { prisma } = await import('@/lib/db');
    const count = await prisma.providerHealthAlert.count({ where: { provider_id: TEST_PROVIDER } });
    expect(count).toBe(0);
  });

  it('D-17: returns insufficient_history and does NOT insert when total_calls < 50', async () => {
    await seed(TEST_PROVIDER, Array.from({ length: 10 }, () => ({ status: 'error' as const })));
    const res = await callCron(`Bearer ${TEST_SECRET}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ours = (body.alerts as Array<{ provider_id: string; status: string }>).find(
      (a) => a.provider_id === TEST_PROVIDER,
    );
    expect(ours).toBeDefined();
    expect(ours!.status).toBe('insufficient_history');
    const { prisma } = await import('@/lib/db');
    const count = await prisma.providerHealthAlert.count({ where: { provider_id: TEST_PROVIDER } });
    expect(count).toBe(0);
  });

  it('D-17: INSERTs a ProviderHealthAlert row when error_rate > 0.10 and total >= 50', async () => {
    // 25 errors + 175 ok = 200 total, error_rate = 0.125 > 0.10.
    const rows: SeedRow[] = [
      ...Array.from({ length: 25 }, () => ({
        status: 'error' as const,
        error_class: 'UPSTREAM_5XX',
      })),
      ...Array.from({ length: 175 }, () => ({ status: 'ok' as const })),
    ];
    await seed(TEST_PROVIDER, rows);
    const res = await callCron(`Bearer ${TEST_SECRET}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ours = (body.alerts as Array<{ provider_id: string; status: string; error_rate: number; error_count: number; total_count: number }>).find(
      (a) => a.provider_id === TEST_PROVIDER,
    );
    expect(ours).toBeDefined();
    expect(ours!.status).toBe('alert');
    expect(ours!.error_rate).toBeCloseTo(0.125, 5);
    expect(ours!.error_count).toBe(25);
    expect(ours!.total_count).toBe(200);
    const { prisma } = await import('@/lib/db');
    const inserted = await prisma.providerHealthAlert.findMany({
      where: { provider_id: TEST_PROVIDER },
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0].error_count).toBe(25);
    expect(inserted[0].total_count).toBe(200);
    expect(inserted[0].resolved_at).toBeNull();
  });

  it('D-17: does NOT insert a duplicate when an unresolved alert exists', async () => {
    await seed(TEST_PROVIDER, [
      ...Array.from({ length: 25 }, () => ({ status: 'error' as const })),
      ...Array.from({ length: 175 }, () => ({ status: 'ok' as const })),
    ]);
    const { prisma } = await import('@/lib/db');
    await prisma.providerHealthAlert.create({
      data: {
        provider_id: TEST_PROVIDER,
        breached_at: new Date(),
        error_rate: 0.15,
        error_count: 30,
        total_count: 200,
        dominant_error_class: 'UPSTREAM_5XX',
        // resolved_at intentionally null = unresolved
      },
    });
    const res = await callCron(`Bearer ${TEST_SECRET}`);
    expect(res.status).toBe(200);
    const count = await prisma.providerHealthAlert.count({
      where: { provider_id: TEST_PROVIDER },
    });
    expect(count).toBe(1); // still 1, no duplicate
  });

  it('D-17: UPDATEs resolved_at on existing alerts when error_rate drops below threshold', async () => {
    // Only 2 errors + 200 ok = 202 total; error_rate = ~0.0099 < 0.10.
    await seed(TEST_PROVIDER, [
      ...Array.from({ length: 2 }, () => ({ status: 'error' as const })),
      ...Array.from({ length: 200 }, () => ({ status: 'ok' as const })),
    ]);
    const { prisma } = await import('@/lib/db');
    const existing = await prisma.providerHealthAlert.create({
      data: {
        provider_id: TEST_PROVIDER,
        breached_at: new Date(),
        error_rate: 0.15,
        error_count: 30,
        total_count: 200,
        dominant_error_class: 'UPSTREAM_5XX',
      },
    });
    const res = await callCron(`Bearer ${TEST_SECRET}`);
    expect(res.status).toBe(200);
    const updated = await prisma.providerHealthAlert.findUnique({ where: { id: existing.id } });
    expect(updated).not.toBeNull();
    expect(updated!.resolved_at).not.toBeNull();
  });

  it('D-17: writes dominant_error_class derived from most-frequent error_class column', async () => {
    // 35 RATE_LIMITED + 15 TIMEOUT + 150 ok = 200 total; error_rate = 0.25 > 0.10
    const rows: SeedRow[] = [
      ...Array.from({ length: 35 }, () => ({
        status: 'error' as const,
        error_class: 'RATE_LIMITED',
      })),
      ...Array.from({ length: 15 }, () => ({
        status: 'error' as const,
        error_class: 'TIMEOUT',
      })),
      ...Array.from({ length: 150 }, () => ({ status: 'ok' as const })),
    ];
    await seed(TEST_PROVIDER, rows);
    const res = await callCron(`Bearer ${TEST_SECRET}`);
    expect(res.status).toBe(200);
    const { prisma } = await import('@/lib/db');
    const inserted = await prisma.providerHealthAlert.findFirst({
      where: { provider_id: TEST_PROVIDER },
    });
    expect(inserted).not.toBeNull();
    expect(inserted!.dominant_error_class).toBe('RATE_LIMITED');
  });

  it('D-17: maxDuration is set to 60 (mirrors cost-budget-check), not 300', async () => {
    const mod = await import('@/app/api/cron/provider-error-budget/route');
    expect(mod.maxDuration).toBe(60);
    expect(mod.dynamic).toBe('force-dynamic');
  });
});
