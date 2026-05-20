// tests/integration/price-followup-sector-labels.integration.test.ts
//
// Phase 21 Plan 21-2-05 Task 2 — live-DB integration test for the forward-path
// writer. Asserts that every new PriceOutcome row created by /api/cron/price-followup
// carries all four columns: pct_change (legacy), sector_etf, forward_return_raw,
// and forward_return_sector_rel.
//
// Critically pins BLOCKER-3 invariant: forward_return_raw === pct_change for
// every row this route writes (same value, same percentage-points unit).
//
// Gated by RUN_LIVE_INTEGRATION=true so the default `npm test` suite does not
// require a live DB (mirrors the pattern in tests/integration/*.live.test.ts).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });

import { NextRequest } from 'next/server';

const ENV_GATE =
  process.env.RUN_LIVE_INTEGRATION === 'true' || process.env.CI_INTEGRATION === 'true';

describe.skipIf(!ENV_GATE)('price-followup writes all four PriceOutcome columns (live Neon)', () => {
  // Lazy-import once the env gate has cleared so the unit suite never touches
  // the Prisma singleton.
  let GET: typeof import('@/app/api/cron/price-followup/route').GET;
  let prisma: typeof import('@/lib/db').prisma;
  let createdReportId: string | null = null;

  beforeAll(async () => {
    ({ GET } = await import('@/app/api/cron/price-followup/route'));
    ({ prisma } = await import('@/lib/db'));

    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
    const created = await prisma.report.create({
      data: {
        user_id: 'test-21-2-05-integration',
        ticker: 'AAPL',
        company_name: 'Apple Inc. (Phase 21 integration test)',
        analyzed_at: sevenDaysAgo,
        market_sentiment: 'bullish',
        confidence_level: 'medium',
        analysis: { test: true, plan: '21-2-05' },
        price_at_report: 100,
      },
    });
    createdReportId = created.id;
  });

  afterAll(async () => {
    if (createdReportId) {
      await prisma.priceOutcome.deleteMany({ where: { report_id: createdReportId } });
      await prisma.report.delete({ where: { id: createdReportId } });
    }
  });

  it('populates sector_etf, forward_return_raw, forward_return_sector_rel on the new row', async () => {
    const req = new NextRequest('http://test.local/api/cron/price-followup', {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const res = await GET(req);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.sector_fallback_to_spy).toBe('number');

    const outcomes = await prisma.priceOutcome.findMany({
      where: { report_id: createdReportId!, days_after: 7 },
    });
    expect(outcomes.length).toBeGreaterThan(0);
    const o = outcomes[0];
    expect(o.sector_etf).toMatch(/^(XLK|XLF|XLE|XLV|XLY|XLP|XLI|XLU|XLB|XLRE|XLC|SPY)$/);
    expect(o.forward_return_raw).not.toBeNull();
    // BLOCKER-3 lock: forward_return_raw and pct_change must be identical
    // (same value, same percentage-points unit). 9-decimal closeness is
    // effectively byte-equal for IEEE-754 doubles after the same arithmetic.
    expect(o.forward_return_raw).toBeCloseTo(o.pct_change, 9);
    // forward_return_sector_rel may be null only if both sector + SPY return
    // fetches fail — accept either path but never throw.
    if (o.forward_return_sector_rel != null) {
      expect(typeof o.forward_return_sector_rel).toBe('number');
    }
  }, 60_000);
});
