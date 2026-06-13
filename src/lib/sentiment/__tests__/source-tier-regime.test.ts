/**
 * PHASE 22 Wave 3 GREEN — D-06 (extend SourceTier with regime) +
 *                         D-09 (3-step cold-start chain).
 *
 * Wave 0 left this file as `it.todo` placeholders + a module-level arity guard.
 * Wave 3 (this file, after edit) replaces the placeholders with real assertions.
 *
 * Contract under test (22-RESEARCH.md §F):
 *   export async function getWeightForSource(
 *     source_id: string,
 *     regime: RegimeLabel,
 *     asOf: Date
 *   ): Promise<number>
 *
 * Cold-start chain (D-09):
 *   1. query (source_id, regime, computed_at <= asOf)         — regime-specific row
 *   2. fall through to (source_id, 'ALL', computed_at <= asOf) — unconditional row
 *   3. fall through to 1.0                                     — full cold start
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock factory has to be hoisted, so we declare the inner findFirst mock
// outside via `vi.hoisted` so the factory can reference it.
const { findFirstMock } = vi.hoisted(() => {
  return { findFirstMock: vi.fn() };
});

vi.mock('@/lib/db', () => ({
  prisma: {
    sourceTier: {
      findFirst: findFirstMock,
    },
  },
}));

import { getWeightForSource, shrinkSourceIcEmpiricalBayes } from '../source-tier';

describe('getWeightForSource arity — Wave 3 GREEN (D-06)', () => {
  it('Wave 3 extends getWeightForSource to (source_id, regime, asOf) — arity 3', () => {
    // `.length` reports declared formal-parameter count, which is 3 after Wave 3.
    expect((getWeightForSource as (...args: unknown[]) => unknown).length).toBe(
      3,
    );
  });
});

describe('shrinkSourceIcEmpiricalBayes export — Wave 3 GREEN (D-07 sentinel)', () => {
  it('Wave 3 exports shrinkSourceIcEmpiricalBayes from source-tier.ts', () => {
    expect(typeof shrinkSourceIcEmpiricalBayes).toBe('function');
  });
});

describe('getWeightForSource(source_id, regime, asOf) — Wave 3 contract (D-06 + D-09)', () => {
  beforeEach(() => {
    findFirstMock.mockReset();
  });

  it('D-09 step 1 — returns regime-specific weight when (source_id, regime) row exists', async () => {
    findFirstMock.mockImplementation((args: { where: { regime: string } }) => {
      if (args.where.regime === 'bull-low-vol') {
        return Promise.resolve({ weight: 3.14 });
      }
      return Promise.resolve(null);
    });

    const w = await getWeightForSource(
      'stocktwits',
      'bull-low-vol',
      new Date('2026-06-10T00:00:00Z'),
    );
    expect(w).toBe(3.14);
    // Only the regime-specific lookup should fire — no extra round-trip for 'ALL'.
    expect(findFirstMock).toHaveBeenCalledTimes(1);
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source_id: 'stocktwits',
          regime: 'bull-low-vol',
        }),
      }),
    );
  });

  it('D-09 step 2 — falls back to (source_id, "ALL") weight when no (source_id, regime) row exists', async () => {
    findFirstMock.mockImplementation((args: { where: { regime: string } }) => {
      if (args.where.regime === 'ALL') {
        return Promise.resolve({ weight: 1.5 });
      }
      return Promise.resolve(null);
    });

    const w = await getWeightForSource(
      'stocktwits',
      'bear-high-vol',
      new Date('2026-06-10T00:00:00Z'),
    );
    expect(w).toBe(1.5);
    // Both calls fired: regime-specific (miss) → 'ALL' (hit).
    expect(findFirstMock).toHaveBeenCalledTimes(2);
    expect(findFirstMock.mock.calls[0][0].where.regime).toBe('bear-high-vol');
    expect(findFirstMock.mock.calls[1][0].where.regime).toBe('ALL');
  });

  it('D-09 step 3 — falls back to 1.0 when neither (source_id, regime) nor (source_id, "ALL") exists', async () => {
    findFirstMock.mockResolvedValue(null);

    const w = await getWeightForSource(
      'reddit',
      'bull-low-vol',
      new Date('2026-06-10T00:00:00Z'),
    );
    expect(w).toBe(1.0);
    // Two calls: regime (miss) + 'ALL' (miss).
    expect(findFirstMock).toHaveBeenCalledTimes(2);
  });

  it('regime === "ALL" — skips redundant first-step query and goes straight to the unconditional row', async () => {
    findFirstMock.mockResolvedValue({ weight: 2.0 });

    const w = await getWeightForSource(
      'stocktwits',
      'ALL',
      new Date('2026-06-10T00:00:00Z'),
    );
    expect(w).toBe(2.0);
    // ONE call only — the chain short-circuits step 1 when caller already
    // supplied 'ALL' (avoids a wasted duplicate round-trip).
    expect(findFirstMock).toHaveBeenCalledTimes(1);
    expect(findFirstMock.mock.calls[0][0].where.regime).toBe('ALL');
  });

  it('returns LATEST row by computed_at when multiple rows for same (source_id, regime) exist — orderBy desc + limit 1', async () => {
    // Prisma's findFirst({orderBy: {computed_at: 'desc'}, take: 1 implied})
    // returns the latest matching row.  We assert the query shape includes
    // the desc ordering so the latest semantics is structurally enforced.
    findFirstMock.mockResolvedValue({ weight: 2.7 });

    await getWeightForSource(
      'stocktwits',
      'bull-low-vol',
      new Date('2026-06-10T00:00:00Z'),
    );
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { computed_at: 'desc' },
        select: { weight: true },
      }),
    );
  });

  it('PIT-correct — query uses computed_at <= asOf so rows after asOf are filtered out', async () => {
    const asOf = new Date('2026-05-01T00:00:00Z');
    findFirstMock.mockResolvedValue({ weight: 0.75 });

    await getWeightForSource('stocktwits', 'bull-low-vol', asOf);
    expect(findFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          computed_at: { lte: asOf },
        }),
      }),
    );
  });

  it('treats unknown source_id as cold-start (1.0) without spuriously matching a different source', async () => {
    findFirstMock.mockImplementation((args: { where: { source_id: string } }) => {
      // Only "stocktwits" rows in DB; a query for "unknown" returns nothing.
      if (args.where.source_id === 'stocktwits') {
        return Promise.resolve({ weight: 4.0 });
      }
      return Promise.resolve(null);
    });

    const w = await getWeightForSource(
      'unknown',
      'bull-low-vol',
      new Date('2026-06-10T00:00:00Z'),
    );
    expect(w).toBe(1.0);
    // Two misses (regime + 'ALL') for source_id='unknown' — no spurious match
    // against the populated 'stocktwits' rows.
    expect(findFirstMock).toHaveBeenCalledTimes(2);
    for (const call of findFirstMock.mock.calls) {
      expect(call[0].where.source_id).toBe('unknown');
    }
  });

  it('DB unreachable → defensive fall-through to 1.0 (NEVER throws to caller)', async () => {
    findFirstMock.mockRejectedValue(new Error('Neon unreachable'));

    const w = await getWeightForSource(
      'stocktwits',
      'bull-low-vol',
      new Date('2026-06-10T00:00:00Z'),
    );
    expect(w).toBe(1.0);
  });
});
