import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Mock runAblation BEFORE importing the route under test.
vi.mock('@/../scripts/ablate-joint-features', () => ({
  DEFAULT_ABLATION_CONFIG: {
    cpcvN: 6,
    cpcvK: 2,
    cpcvEmbargo: 5,
    lookbackDays: 365,
    blockBootstrapSize: 7,
    nResamples: 1000,
    seed: 20260510,
  },
  runAblation: vi.fn(),
}));

import { GET } from '@/app/api/cron/joint-feature-ablation/route';
import { runAblation } from '@/../scripts/ablate-joint-features';

describe('GET /api/cron/joint-feature-ablation (plan 20-C-05)', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    vi.mocked(runAblation).mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it('route file exists at src/app/api/cron/joint-feature-ablation/route.ts', () => {
    const routePath = path.resolve(
      __dirname,
      '..',
      'src/app/api/cron/joint-feature-ablation/route.ts',
    );
    expect(fs.existsSync(routePath)).toBe(true);
  });

  it('returns 401 when Authorization header is missing or wrong', async () => {
    const res = await GET(new Request('http://localhost/'));
    expect(res.status).toBe(401);
    const res2 = await GET(
      new Request('http://localhost/', {
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    );
    expect(res2.status).toBe(401);
  });

  it('imports runAblation from scripts/ablate-joint-features', () => {
    // The route source must reference the script — verify by grep.
    const routePath = path.resolve(
      __dirname,
      '..',
      'src/app/api/cron/joint-feature-ablation/route.ts',
    );
    const src = fs.readFileSync(routePath, 'utf8');
    expect(src).toMatch(/scripts\/ablate-joint-features/);
    expect(src).toMatch(/runAblation/);
  });

  it("refuses promote_to_on after only 1 positive month (decision='remain_shadow')", async () => {
    vi.mocked(runAblation).mockResolvedValue({
      asOfDate: '2026-05-12',
      config: {} as never,
      sentimentAloneSharpe: [],
      jointFeatureSharpe: [],
      bootstrap: {} as never,
      verdict: 'uplift',
      decision: 'remain_shadow',
      rollingMonthsAgreeing: 1,
      monthsNeededForPromotion: 3,
      reportPath: '/tmp/x.md',
    });
    const res = await GET(
      new Request('http://localhost/', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    const body = await res.json();
    expect(body.decision).toBe('remain_shadow');
    expect(body.verdict).toBe('uplift');
  });

  it("ALLOWS promote_to_on after 3 positive months (decision='promote_to_on')", async () => {
    vi.mocked(runAblation).mockResolvedValue({
      asOfDate: '2026-05-12',
      config: {} as never,
      sentimentAloneSharpe: [],
      jointFeatureSharpe: [],
      bootstrap: {} as never,
      verdict: 'uplift',
      decision: 'promote_to_on',
      rollingMonthsAgreeing: 3,
      monthsNeededForPromotion: 3,
      reportPath: '/tmp/x.md',
    });
    const res = await GET(
      new Request('http://localhost/', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    const body = await res.json();
    expect(body.decision).toBe('promote_to_on');
    expect(body.rollingMonthsAgreeing).toBe(3);
  });

  it('response body includes runtimeMs telemetry field', async () => {
    vi.mocked(runAblation).mockResolvedValue({
      asOfDate: '2026-05-12',
      config: {} as never,
      sentimentAloneSharpe: [],
      jointFeatureSharpe: [],
      bootstrap: {} as never,
      verdict: 'inconclusive',
      decision: 'remain_shadow',
      rollingMonthsAgreeing: 0,
      monthsNeededForPromotion: 3,
      reportPath: '/tmp/x.md',
    });
    const res = await GET(
      new Request('http://localhost/', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    const body = await res.json();
    expect(typeof body.runtimeMs).toBe('number');
    expect(body.runtimeMsAlert).toBe(false);
  });

  it("vercel.json crons array contains exactly one entry for joint-feature-ablation with schedule '0 6 1 * *'", () => {
    const vercel = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', 'vercel.json'), 'utf8'),
    );
    const found = vercel.crons.filter(
      (c: { path: string }) => c.path === '/api/cron/joint-feature-ablation',
    );
    expect(found).toHaveLength(1);
    expect(found[0].schedule).toBe('0 6 1 * *');
  });
});
