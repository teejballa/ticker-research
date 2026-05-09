// Phase 19 Plan 19-A-07 — e2e visual check on /insights for hierarchical pooling.
//
// CORE-ML-13: differential CI widths visible on /insights with pooling enabled.
//
// Two seeded cells share identical local α/β + ESS — the only difference is
// whether parent_α/β/λ is populated:
//   - "pooled":  parent_α=10, parent_β=6, λ=16 → read-time pulls posterior
//                toward the parent mean ~0.625, narrowing the CI
//   - "no-pool": parent_α=null, parent_β=null, λ=null → posterior stays
//                at the local α/β; CI matches Phase 18 behaviour
//
// With FEATURES.hierarchical_pooling_enabled=true at server start, the
// pooled cell's CI must be strictly narrower than the no-pool cell's.
// Test runs only when both TEST_CLEANUP_SECRET and the flag are configured.

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { test, expect } from '@playwright/test';

const CLEANUP_SECRET = process.env.TEST_CLEANUP_SECRET ?? '';
const HIERARCHICAL_ON =
  process.env.FEATURE_HIERARCHICAL_POOLING === 'on' ||
  process.env.FEATURE_HIERARCHICAL_POOLING === 'true';

const TEST_CAP = 'TESTP19POOL';
const POOLED_PATTERN = 'breakout_uptrend';
const NOPOOL_PATTERN = 'pullback_in_uptrend';
const SIGNAL_CLASS = 'technical';
const HORIZON = 30;

test.describe('[e2e] /insights — pooled CI is narrower than no-pool CI (Plan 19-A-07)', () => {
  test.skip(
    !CLEANUP_SECRET || !HIERARCHICAL_ON,
    'requires TEST_CLEANUP_SECRET + FEATURE_HIERARCHICAL_POOLING=on'
  );

  test.beforeAll(async ({ request }) => {
    await request.delete('/api/test/cleanup', {
      headers: { 'x-test-cleanup-secret': CLEANUP_SECRET },
      data: { capClass: TEST_CAP },
    });

    const seed = await request.post('/api/test/cleanup', {
      headers: { 'x-test-cleanup-secret': CLEANUP_SECRET },
      data: {
        learnedPatterns: [
          {
            signal_class: SIGNAL_CLASS,
            pattern_key: POOLED_PATTERN,
            cap_class: TEST_CAP,
            horizon_days: HORIZON,
            alpha: 3,
            beta: 3,
            sample_size: 4,
            effective_sample_size: 6.0,
            hits: 2,
            status: 'EXPLORATORY',
            parent_alpha: 10,
            parent_beta: 6,
            shrinkage_strength: 16,
          },
          {
            signal_class: SIGNAL_CLASS,
            pattern_key: NOPOOL_PATTERN,
            cap_class: TEST_CAP,
            horizon_days: HORIZON,
            alpha: 3,
            beta: 3,
            sample_size: 4,
            effective_sample_size: 6.0,
            hits: 2,
            status: 'EXPLORATORY',
          },
        ],
      },
    });
    expect(seed.ok()).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    if (!CLEANUP_SECRET) return;
    await request.delete('/api/test/cleanup', {
      headers: { 'x-test-cleanup-secret': CLEANUP_SECRET },
      data: { capClass: TEST_CAP },
    });
  });

  test('pooled cell renders strictly narrower 95% CI than no-pool cell', async ({ page }) => {
    await page.goto('/insights');
    await page.waitForSelector('[data-testid="ess-patterns-table"]', {
      timeout: 30_000,
    });

    const pooledRow = page.locator(
      `[data-testid="ess-row-${SIGNAL_CLASS}-${POOLED_PATTERN}-${TEST_CAP}-${HORIZON}"]`
    );
    const nopoolRow = page.locator(
      `[data-testid="ess-row-${SIGNAL_CLASS}-${NOPOOL_PATTERN}-${TEST_CAP}-${HORIZON}"]`
    );

    await expect(pooledRow).toBeVisible();
    await expect(nopoolRow).toBeVisible();

    const pooledLow = parseFloat(
      await pooledRow.locator('[data-testid="ess-ci-low"]').innerText()
    );
    const pooledHigh = parseFloat(
      await pooledRow.locator('[data-testid="ess-ci-high"]').innerText()
    );
    const nopoolLow = parseFloat(
      await nopoolRow.locator('[data-testid="ess-ci-low"]').innerText()
    );
    const nopoolHigh = parseFloat(
      await nopoolRow.locator('[data-testid="ess-ci-high"]').innerText()
    );
    const pooledWidth = pooledHigh - pooledLow;
    const nopoolWidth = nopoolHigh - nopoolLow;

    // CORE-ML-13: pooled cell's CI must be strictly narrower — sparse
    // posterior absorbs parent mass at READ time.
    expect(pooledWidth).toBeLessThan(nopoolWidth);

    await page.screenshot({
      path: 'tests/screenshots/insights-pooling.png',
      fullPage: true,
    });
  });
});
