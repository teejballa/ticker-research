// Phase: 30 — Provider Health Hardening
// Phase 30 D-17 — unit-style smoke tests for /api/cron/provider-error-budget.
//
// Real DB integration coverage lives in tests/integration/provider-error-budget.cron.integration.test.ts.
// These smoke tests run under `npm test` and only verify the bearer-auth gate
// and the no-rows path. Both are exercised without a live DATABASE_URL via
// vi.mock('@/lib/db', ...) so the route module loads cleanly.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the prisma singleton BEFORE importing the route module so the import
// chain resolves to the fake. The route module reads CRON_SECRET at request
// time (inside GET), so we can set/unset it per test without re-importing.
const queryRawUnsafeMock = vi.fn();
const findFirstMock = vi.fn();
const createMock = vi.fn();
const updateManyMock = vi.fn();

vi.mock('@/lib/db', () => ({
  prisma: {
    $queryRawUnsafe: (...args: unknown[]) => queryRawUnsafeMock(...args),
    providerHealthAlert: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      create: (...args: unknown[]) => createMock(...args),
      updateMany: (...args: unknown[]) => updateManyMock(...args),
    },
  },
}));

describe('Phase 30 D-17 / /api/cron/provider-error-budget — smoke tests', () => {
  beforeEach(() => {
    queryRawUnsafeMock.mockReset();
    findFirstMock.mockReset();
    createMock.mockReset();
    updateManyMock.mockReset();
  });

  it('rejects 401 without Bearer CRON_SECRET', async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-secret';
    try {
      const { GET } = await import('../route');
      const req = new Request('http://localhost/api/cron/provider-error-budget');
      const res = await GET(req);
      expect(res.status).toBe(401);
      expect(queryRawUnsafeMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
    } finally {
      process.env.CRON_SECRET = prev;
    }
  });

  it('returns alerts:[] when no rows in 24h and does NOT write to ProviderHealthAlert', async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-secret';
    queryRawUnsafeMock.mockResolvedValueOnce([]);
    try {
      const { GET } = await import('../route');
      const req = new Request('http://localhost/api/cron/provider-error-budget', {
        headers: { authorization: 'Bearer unit-test-secret' },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.alerts)).toBe(true);
      expect(body.alerts.length).toBe(0);
      expect(body.error_rate_threshold).toBe(0.10);
      expect(body.min_calls_for_gate).toBe(50);
      expect(typeof body.generated_at).toBe('string');
      expect(createMock).not.toHaveBeenCalled();
      expect(updateManyMock).not.toHaveBeenCalled();
    } finally {
      process.env.CRON_SECRET = prev;
    }
  });

  it('reports insufficient_history (no DB write) when total_count < 50', async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-secret';
    queryRawUnsafeMock.mockResolvedValueOnce([
      {
        provider_id: 'gemini',
        total_count: BigInt(10),
        error_count: BigInt(5),
        dominant_error_class: null,
      },
    ]);
    try {
      const { GET } = await import('../route');
      const req = new Request('http://localhost/api/cron/provider-error-budget', {
        headers: { authorization: 'Bearer unit-test-secret' },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alerts).toHaveLength(1);
      expect(body.alerts[0].status).toBe('insufficient_history');
      expect(body.alerts[0].provider_id).toBe('gemini');
      expect(createMock).not.toHaveBeenCalled();
      expect(updateManyMock).not.toHaveBeenCalled();
    } finally {
      process.env.CRON_SECRET = prev;
    }
  });

  it('INSERTs alert when error_rate > 0.10 and no existing unresolved alert', async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-secret';
    queryRawUnsafeMock.mockResolvedValueOnce([
      {
        provider_id: 'yahoo',
        total_count: BigInt(200),
        error_count: BigInt(25), // 12.5% > 10%
        dominant_error_class: 'RATE_LIMITED',
      },
    ]);
    findFirstMock.mockResolvedValueOnce(null);
    createMock.mockResolvedValueOnce({ id: 'new-id' });
    try {
      const { GET } = await import('../route');
      const req = new Request('http://localhost/api/cron/provider-error-budget', {
        headers: { authorization: 'Bearer unit-test-secret' },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alerts[0].status).toBe('alert');
      expect(body.alerts[0].error_rate).toBeCloseTo(0.125, 5);
      expect(findFirstMock).toHaveBeenCalledTimes(1);
      expect(createMock).toHaveBeenCalledTimes(1);
      expect(updateManyMock).not.toHaveBeenCalled();
      const createArg = createMock.mock.calls[0][0];
      expect(createArg.data.provider_id).toBe('yahoo');
      expect(createArg.data.dominant_error_class).toBe('RATE_LIMITED');
      expect(createArg.data.total_count).toBe(200);
      expect(createArg.data.error_count).toBe(25);
    } finally {
      process.env.CRON_SECRET = prev;
    }
  });

  it('skips duplicate INSERT when an unresolved alert already exists', async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-secret';
    queryRawUnsafeMock.mockResolvedValueOnce([
      {
        provider_id: 'yahoo',
        total_count: BigInt(200),
        error_count: BigInt(25),
        dominant_error_class: 'RATE_LIMITED',
      },
    ]);
    findFirstMock.mockResolvedValueOnce({ id: 'pre-existing-id' });
    try {
      const { GET } = await import('../route');
      const req = new Request('http://localhost/api/cron/provider-error-budget', {
        headers: { authorization: 'Bearer unit-test-secret' },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
      expect(findFirstMock).toHaveBeenCalledTimes(1);
      expect(createMock).not.toHaveBeenCalled();
    } finally {
      process.env.CRON_SECRET = prev;
    }
  });

  it('UPDATEs resolved_at when error_rate drops below threshold', async () => {
    const prev = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'unit-test-secret';
    queryRawUnsafeMock.mockResolvedValueOnce([
      {
        provider_id: 'yahoo',
        total_count: BigInt(200),
        error_count: BigInt(5), // 2.5% < 10%
        dominant_error_class: null,
      },
    ]);
    updateManyMock.mockResolvedValueOnce({ count: 1 });
    try {
      const { GET } = await import('../route');
      const req = new Request('http://localhost/api/cron/provider-error-budget', {
        headers: { authorization: 'Bearer unit-test-secret' },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alerts[0].status).toBe('ok');
      expect(createMock).not.toHaveBeenCalled();
      expect(updateManyMock).toHaveBeenCalledTimes(1);
      const updArg = updateManyMock.mock.calls[0][0];
      expect(updArg.where.provider_id).toBe('yahoo');
      expect(updArg.where.resolved_at).toBeNull();
      expect(updArg.data.resolved_at).toBeInstanceOf(Date);
    } finally {
      process.env.CRON_SECRET = prev;
    }
  });
});
