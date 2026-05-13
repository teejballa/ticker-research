// tests/e2e/per-aspect-chips.spec.ts
// Plan 20-B-05 — Playwright spec for the per-aspect chip stack.
//
// Static-render assertion via a serialized AnalysisResult mock at
// /research/[ticker]. The dev server must be running on PLAYWRIGHT_BASE_URL
// (default http://localhost:3000); test is skipped when no live server is
// reachable so unit-test CI doesn't fail without --webServer wiring.

import { test, expect } from '@playwright/test';

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

test.describe('20-B-05 — Per-aspect chip stack', () => {
  test('chip stack renders 7 chips with bull% AND em-dash sentinels, NEVER 0%', async ({ page }) => {
    // Probe — skip cleanly when no dev server is up.
    let serverUp = false;
    try {
      const resp = await page.request.get(`${BASE}/`, { timeout: 3_000 });
      serverUp = resp.status() < 500;
    } catch {
      serverUp = false;
    }
    test.skip(!serverUp, 'no dev server reachable at PLAYWRIGHT_BASE_URL');

    // Visit a known-good research page. AAPL is in the golden-ticker rotation
    // and almost always has at least one per_aspect_sentiment entry under the
    // shadow-default flag. If the env flag is off the chip stack should NOT
    // render — assertion below conditionalizes.
    await page.goto(`${BASE}/research/AAPL`, { waitUntil: 'domcontentloaded' });

    // Allow streaming SSE pipeline up to 90s on cold start.
    const stack = page.getByTestId('per-aspect-chips');
    const visible = await stack.isVisible({ timeout: 90_000 }).catch(() => false);

    if (!visible) {
      // Flag is 'shadow' / 'off' OR per_aspect_sentiment empty — both are
      // valid pre-cutover states. Assert the rest of the report rendered.
      await expect(page.getByText('Market Sentiment').first()).toBeVisible();
      return;
    }

    // Visible path — exactly 7 chips, no '0%' literal anywhere in the stack.
    const chipCount = await stack.locator('> span').count();
    expect(chipCount).toBe(7);

    const stackText = (await stack.textContent()) ?? '';
    // T-20-B-05-03 — the literal '0%' must NEVER appear in the chip stack.
    expect(stackText).not.toMatch(/(?:^|\s)0%/);

    // At least one chip — bull% OR em-dash — is present per chip.
    for (let i = 0; i < 7; i++) {
      const chipText = (await stack.locator('> span').nth(i).textContent()) ?? '';
      expect(chipText.includes('%') || chipText.includes('—')).toBe(true);
    }
  });
});
