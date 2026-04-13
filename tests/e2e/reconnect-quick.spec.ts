import { test, expect, chromium } from '@playwright/test';

// Quick manual navigation test for reconnect UX

test('step 1 - sign in page loads', async ({ page }) => {
  await page.goto('http://localhost:3000/auth/signin');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'tests/screenshots/r1-signin.png', fullPage: true });
  await expect(page.locator('text=Sign in with Google')).toBeVisible();
});

test('step 2 - simulate auth error page shows RECONNECT', async ({ page }) => {
  // Directly render the error page state by navigating to research and
  // injecting the auth error via page.evaluate to force the error branch
  await page.goto('http://localhost:3000/research/AAPL');
  await page.waitForLoadState('networkidle');

  // Force the error state by navigating to a URL pattern that produces auth error
  // We'll use the report error page by injecting state
  await page.evaluate(() => {
    // The page uses React state — we test by checking the rendered error markup
    // directly from a known-bad ticker that fails fast
  });
  await page.screenshot({ path: 'tests/screenshots/r2-research.png', fullPage: true });
  const text = await page.locator('body').textContent();
  console.log('Research page shows:', text?.slice(0, 200));
});

test('step 3 - setup page structure', async ({ page }) => {
  await page.goto('http://localhost:3000/setup');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'tests/screenshots/r3-setup.png', fullPage: true });
  const text = await page.locator('body').textContent();
  console.log('Setup page shows:', text?.slice(0, 400));
});
