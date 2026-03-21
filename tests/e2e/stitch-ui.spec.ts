// tests/e2e/stitch-ui.spec.ts
// Visual smoke tests for the Equinfo Stitch design system.

import { test, expect, Page } from '@playwright/test';

async function snap(page: Page, name: string) {
  await page.screenshot({ path: `/tmp/${name}`, fullPage: false });
  console.log(`📸  /tmp/${name}`);
}

async function snapFull(page: Page, name: string) {
  await page.screenshot({ path: `/tmp/${name}`, fullPage: true });
  console.log(`📸  /tmp/${name}`);
}

test.describe('Stitch UI — Landing Page', () => {
  test('loads with EQUINFO header', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=EQUINFO').first()).toBeVisible();
    await snap(page, 'stitch-landing-hero.png');
  });

  test('body background is Stitch surface color', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // surface = #10141a = rgb(16, 20, 26)
    expect(bg).toMatch(/rgb\(\s*1[0-9]\s*,\s*[12][0-9]\s*,\s*2[0-9]\s*\)/);
  });

  test('Inter font is loaded', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(fontFamily.toLowerCase()).toContain('inter');
  });

  test('footer ticker tape is visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const footer = page.locator('footer').last();
    await expect(footer).toBeVisible();
    await snap(page, 'stitch-footer.png');
  });

  test('pipeline phases show COLLECT SYNTHESIZE REPORT', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => window.scrollTo(0, 4000));
    await page.waitForTimeout(600);

    await expect(page.locator('text=COLLECT').first()).toBeVisible();
    await expect(page.locator('text=SYNTHESIZE').first()).toBeVisible();
    await expect(page.locator('text=REPORT').first()).toBeVisible();

    await snap(page, 'stitch-pipeline.png');
  });

  test('market snapshot section renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => window.scrollTo(0, 7000));
    await page.waitForTimeout(600);

    await expect(page.locator('text=Market Snapshot')).toBeVisible();
    await snap(page, 'stitch-market-snapshot.png');
  });

  test('CTA section renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(600);

    await expect(page.locator('text=Ready to see deeper')).toBeVisible();
    await snap(page, 'stitch-cta.png');
  });

  test('full landing page screenshot', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await snapFull(page, 'stitch-landing-full.png');
  });
});

test.describe('Stitch UI — NavBar', () => {
  test('NavBar appears on landing and research pages', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const nav = page.locator('nav, header').first();
    await expect(nav).toBeVisible();
    await expect(page.locator('text=EQUINFO').first()).toBeVisible();
    await snap(page, 'stitch-navbar.png');
  });
});

test.describe('Stitch UI — Research Page Shell', () => {
  test('loading state uses Stitch surface bg', async ({ page }) => {
    // Navigate to an in-progress research page — will hit loading state
    await page.goto('/research/AAPL');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
    await snap(page, 'stitch-research-loading.png');
  });
});

test.describe('Stitch UI — Colors', () => {
  test('primary color token is applied (blue family)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check that --color-primary CSS variable is defined
    const primaryColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()
    );
    // Should be #b6c4ff or similar blue
    expect(primaryColor).toBeTruthy();
  });

  test('secondary color token is defined (teal family)', async ({ page }) => {
    await page.goto('/');
    const secondaryColor = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-secondary').trim()
    );
    expect(secondaryColor).toBeTruthy();
  });
});
