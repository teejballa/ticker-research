/**
 * Unit tests for scripts/migrations/30.1-resolve-firecrawl-alert.ts.
 *
 * Validates:
 *  - Idempotency — re-run with zero open alerts is a no-op (count=0).
 *  - updateMany is called exactly once per invocation.
 *  - Filter targets provider_id='firecrawl' AND resolved_at=null.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    providerHealthAlert: {
      count: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

interface MockPrisma {
  providerHealthAlert: {
    count: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
}

describe('resolveOpenAlerts (30.1 firecrawl alert resolver)', () => {
  it('returns {before, resolved, after} with after=0 in the steady state', async () => {
    const { resolveOpenAlerts } = await import(
      '@/../scripts/migrations/30.1-resolve-firecrawl-alert'
    );
    const { prisma } = (await import('@/lib/db')) as unknown as { prisma: MockPrisma };
    prisma.providerHealthAlert.count
      .mockResolvedValueOnce(2) // before
      .mockResolvedValueOnce(0); // after
    prisma.providerHealthAlert.updateMany.mockResolvedValueOnce({ count: 2 });

    const out = await resolveOpenAlerts(prisma as unknown as Parameters<typeof resolveOpenAlerts>[0]);

    expect(out).toEqual({ before: 2, resolved: 2, after: 0 });
    expect(prisma.providerHealthAlert.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.providerHealthAlert.updateMany.mock.calls[0][0]).toMatchObject({
      where: { provider_id: 'firecrawl', resolved_at: null },
    });
    expect(prisma.providerHealthAlert.updateMany.mock.calls[0][0].data).toHaveProperty(
      'resolved_at',
    );
  });

  it('is idempotent — second run with zero open alerts is a no-op (count=0)', async () => {
    const { resolveOpenAlerts } = await import(
      '@/../scripts/migrations/30.1-resolve-firecrawl-alert'
    );
    const { prisma } = (await import('@/lib/db')) as unknown as { prisma: MockPrisma };
    prisma.providerHealthAlert.count.mockReset();
    prisma.providerHealthAlert.updateMany.mockReset();
    prisma.providerHealthAlert.count
      .mockResolvedValueOnce(0) // before
      .mockResolvedValueOnce(0); // after
    prisma.providerHealthAlert.updateMany.mockResolvedValueOnce({ count: 0 });

    const out = await resolveOpenAlerts(prisma as unknown as Parameters<typeof resolveOpenAlerts>[0]);

    expect(out).toEqual({ before: 0, resolved: 0, after: 0 });
    expect(prisma.providerHealthAlert.updateMany).toHaveBeenCalledTimes(1);
  });

  it('reports after>0 to the caller — main() will exit 1 on this state', async () => {
    const { resolveOpenAlerts } = await import(
      '@/../scripts/migrations/30.1-resolve-firecrawl-alert'
    );
    const { prisma } = (await import('@/lib/db')) as unknown as { prisma: MockPrisma };
    prisma.providerHealthAlert.count.mockReset();
    prisma.providerHealthAlert.updateMany.mockReset();
    prisma.providerHealthAlert.count
      .mockResolvedValueOnce(3) // before
      .mockResolvedValueOnce(1); // after — race condition / new alert raced in
    prisma.providerHealthAlert.updateMany.mockResolvedValueOnce({ count: 2 });

    const out = await resolveOpenAlerts(prisma as unknown as Parameters<typeof resolveOpenAlerts>[0]);

    expect(out.after).toBe(1);
    // (main() inspects `after`; the unit test asserts the helper returns it
    // truthfully — the exit-code branch is tested via behavior, not invocation.)
  });
});
