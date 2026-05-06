// Phase 18-09 — covers CORE-ML-03 (CI widths reflect ESS, not raw N).
// Seeds two LearnedPattern cells with identical raw N=20:
//   - "recent" cell: weighted α/β consistent with ESS≈19 (all events <7d old)
//   - "old"    cell: weighted α/β consistent with ESS≈3  (all events 90d+ old)
// Asserts width(recent CI) < width(old CI) on the rendered /insights page.
// LOOKS-DONE-BUT-ISN'T defence per 18-RESEARCH.md §"Pitfalls Defended".

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { test, expect } from '@playwright/test';

const CLEANUP_SECRET = process.env.TEST_CLEANUP_SECRET ?? '';
const TEST_CAP = 'TESTP18CI';

// Both cells share the same identifying coordinates EXCEPT pattern_key, so
// /insights renders two distinct rows whose CI widths can be compared.
const RECENT_PATTERN = 'breakout_uptrend';
const OLD_PATTERN = 'pullback_in_uptrend';
const SIGNAL_CLASS = 'technical';
const HORIZON = 30;

test.describe('[e2e] /insights — credible interval widths reflect ESS, not raw N', () => {
  test.beforeAll(async ({ request }) => {
    if (!CLEANUP_SECRET) throw new Error('TEST_CLEANUP_SECRET not set — check .env.local');
    // Pre-clean any leftover rows.
    await request.delete('/api/test/cleanup', {
      headers: { 'x-test-cleanup-secret': CLEANUP_SECRET },
      data: { capClass: TEST_CAP },
    });

    // Cell A — RECENT: high ESS. With Kish ESS at λ=60d and 20 events all
    // within 7 days, weights ≈ {0.89..0.98}, ESS ≈ 19.5. Weighted α/β scale
    // with ESS, so for a 50/50 hit pattern: α ≈ β ≈ ESS/2 + 1 ≈ 10.75.
    // CI width via normal approx ≈ 2 · 1.96 · sqrt(p(1-p)/(n+1)) ≈ 0.42 → ~42%.
    //
    // Cell B — OLD: low ESS. 20 events spread 60..420 days with λ=60 collapse
    // to ESS ≈ 3. α ≈ β ≈ ESS/2 + 1 ≈ 2.5. CI width ≈ 2·1.96·sqrt(0.25/6) ≈ 0.80 → ~80%.
    const seed = await request.post('/api/test/cleanup', {
      headers: { 'x-test-cleanup-secret': CLEANUP_SECRET },
      data: {
        learnedPatterns: [
          {
            signal_class: SIGNAL_CLASS,
            pattern_key: RECENT_PATTERN,
            cap_class: TEST_CAP,
            horizon_days: HORIZON,
            alpha: 10.75,
            beta: 10.75,
            sample_size: 20,
            effective_sample_size: 19.5,
            hits: 10,
            status: 'ACTIVE',
          },
          {
            signal_class: SIGNAL_CLASS,
            pattern_key: OLD_PATTERN,
            cap_class: TEST_CAP,
            horizon_days: HORIZON,
            alpha: 2.5,
            beta: 2.5,
            sample_size: 20,
            effective_sample_size: 3.0,
            hits: 10,
            status: 'ACTIVE',
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

  test('two seeded cells with identical raw N=20 — sparse-recent CI is narrower than sparse-old CI', async ({ page }) => {
    await page.goto('/insights');
    await page.waitForSelector('[data-testid="ess-patterns-table"]', { timeout: 30_000 });

    const recentRow = page.locator(`[data-testid="ess-row-${SIGNAL_CLASS}-${RECENT_PATTERN}-${TEST_CAP}-${HORIZON}"]`);
    const oldRow = page.locator(`[data-testid="ess-row-${SIGNAL_CLASS}-${OLD_PATTERN}-${TEST_CAP}-${HORIZON}"]`);

    await expect(recentRow).toBeVisible();
    await expect(oldRow).toBeVisible();

    const recentLow = parseFloat(await recentRow.locator('[data-testid="ess-ci-low"]').innerText());
    const recentHigh = parseFloat(await recentRow.locator('[data-testid="ess-ci-high"]').innerText());
    const oldLow = parseFloat(await oldRow.locator('[data-testid="ess-ci-low"]').innerText());
    const oldHigh = parseFloat(await oldRow.locator('[data-testid="ess-ci-high"]').innerText());

    const recentWidth = recentHigh - recentLow;
    const oldWidth = oldHigh - oldLow;

    // CORE-ML-03: with identical raw N=20, the recent (high-ESS) cell must
    // have a strictly narrower CI than the old (low-ESS) cell.
    expect(recentWidth).toBeLessThan(oldWidth);

    // Sanity: ESS column shows the seeded values.
    await expect(recentRow.locator('[data-testid="ess-value"]')).toHaveText(/19\.[0-9]/);
    await expect(oldRow.locator('[data-testid="ess-value"]')).toHaveText(/3\.[0-9]/);

    // D-12: raw N debug column is still visible alongside ESS.
    await expect(recentRow.locator('[data-testid="ess-raw-n"]')).toContainText('N=20');
    await expect(oldRow.locator('[data-testid="ess-raw-n"]')).toContainText('N=20');
  });
});
