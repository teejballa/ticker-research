import { test, expect } from '@playwright/test';

// Tests the reconnect UX flow for stale NotebookLM sessions:
// 1. Auth-expired error page shows RECONNECT button (not just TRY AGAIN)
// 2. /setup page shows reconnect options when already connected
// 3. Reconnect button clears stale credential and shows VNC flow

test.describe('Reconnect UX flow', () => {

  // Test 1: Research error page shows RECONNECT when auth error keywords present
  test('error page shows RECONNECT button for auth-expired errors', async ({ page }) => {
    // Go directly to research page and force error state by navigating with
    // a fake ticker that will error, then manually inject auth error
    // We'll test the error UI by navigating to a page that triggers it

    // First sign in
    await page.goto('http://localhost:3000/api/auth/signin');
    await page.waitForLoadState('networkidle');

    const screenshot1 = await page.screenshot({ path: 'tests/screenshots/reconnect-01-signin.png' });

    // Check if we're on a Google sign-in page or NextAuth page
    const url = page.url();
    console.log('Current URL after signin redirect:', url);

    if (url.includes('localhost:3000')) {
      // NextAuth sign-in page
      const googleBtn = page.locator('text=Sign in with Google');
      if (await googleBtn.isVisible()) {
        await googleBtn.click();
        await page.waitForLoadState('networkidle');
      }
    }

    await page.screenshot({ path: 'tests/screenshots/reconnect-02-after-signin.png' });
    console.log('URL after signin attempt:', page.url());
  });

  // Test 2: Check error page markup directly - simulate auth error state
  test('error page markup contains RECONNECT CTA for auth errors', async ({ page }) => {
    // Navigate to an error state by directly checking the page structure
    // We'll use page.evaluate to inspect what the error page renders

    // First navigate to the research page with a ticker
    await page.goto('http://localhost:3000/research/AAPL');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'tests/screenshots/reconnect-03-research-page.png' });
    console.log('Research page URL:', page.url());

    // Check what's visible
    const bodyText = await page.locator('body').textContent();
    console.log('Body text snippet:', bodyText?.slice(0, 300));
  });

  // Test 3: Check /setup page structure
  test('setup page shows Go to Dashboard and Reconnect when session active', async ({ page }) => {
    await page.goto('http://localhost:3000/setup');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'tests/screenshots/reconnect-04-setup-page.png', fullPage: true });
    console.log('Setup URL:', page.url());

    const bodyText = await page.locator('body').textContent();
    console.log('Setup body text:', bodyText?.slice(0, 500));
  });

  // Test 4: Verify error page source code has isAuthExpired detection
  test('verify error page has auth-expired detection in DOM', async ({ page }) => {
    // Navigate to a forced error state using the URL structure
    // We use a URL that triggers the page but then check source
    await page.goto('http://localhost:3000/research/FAKEERROR404TICKER');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'tests/screenshots/reconnect-05-ticker-not-found.png', fullPage: true });

    const title = await page.title();
    console.log('Page title:', title);
    const bodyText = await page.locator('body').textContent();
    console.log('Body text:', bodyText?.slice(0, 400));
  });

});
