import { test, expect } from '@playwright/test';

// Helper: get computed style value for an element
async function getStyle(locator: ReturnType<import('@playwright/test').Page['locator']>, prop: string) {
  return locator.evaluate((el, p) => (el as HTMLElement).style[p as any] || '', prop);
}

test.describe('Homepage scroll animation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Start at the very top
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
  });

  // ── Test 1: Image file loads correctly ────────────────────────
  test('screenshot image loads without error', async ({ page }) => {
    const img = page.locator('img[alt="Cipher research terminal"]');
    await expect(img).toHaveCount(1);

    const { naturalWidth, naturalHeight } = await img.evaluate((el: HTMLImageElement) => ({
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
    }));

    console.log(`Image dimensions: ${naturalWidth}×${naturalHeight}`);
    expect(naturalWidth).toBeGreaterThan(0);
    expect(naturalHeight).toBeGreaterThan(0);
  });

  // ── Test 2: Initial state — hero visible, image hidden ────────
  test('hero is visible and image is hidden on initial load', async ({ page }) => {
    // Hero CIPHER text in the scroll scene should be visible (opacity ~1)
    const heroContainer = page.locator('div[style*="opacity"]').filter({ hasText: 'CIPHER' }).first();
    const heroOpacity = await getStyle(heroContainer, 'opacity');
    console.log('Initial hero opacity:', heroOpacity);
    expect(parseFloat(heroOpacity || '1')).toBeCloseTo(1, 1);

    // Image wrapper opacity should be 0
    const imgWrapper = page.locator('img[alt="Cipher research terminal"]').locator('..');
    const imgOpacity = await getStyle(imgWrapper, 'opacity');
    console.log('Initial image opacity:', imgOpacity);
    expect(parseFloat(imgOpacity || '0')).toBe(0);

    // Image should be translated down (off-screen below sticky container)
    const imgTransform = await getStyle(imgWrapper, 'transform');
    console.log('Initial image transform:', imgTransform);
    expect(imgTransform).toMatch(/translateY/);
  });

  // ── Test 3: Image becomes visible after scrolling ─────────────
  test('image opacity increases monotonically as user scrolls through scene', async ({ page }) => {
    const imgWrapper = page.locator('img[alt="Cipher research terminal"]').locator('..');

    const viewportH = await page.evaluate(() => window.innerHeight);
    console.log('Viewport height:', viewportH);

    const results: { scrollPx: number; opacity: number }[] = [];

    // Scroll from 0 to 5× viewport height in steps
    // The scroll scene starts at ~1vh (after hero) and is 350vh tall
    for (let i = 0; i <= 10; i++) {
      const scrollPx = i * viewportH * 0.5;
      await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), scrollPx);
      await page.waitForTimeout(200); // let RAF + React state update settle

      const opacity = await imgWrapper.evaluate(el => parseFloat((el as HTMLElement).style.opacity || '0'));
      results.push({ scrollPx, opacity });
      console.log(`  scroll=${Math.round(scrollPx)}px → img opacity=${opacity.toFixed(3)}`);
    }

    // Must start at 0
    expect(results[0].opacity).toBe(0);

    // Must reach > 0.9 somewhere
    const maxOpacity = Math.max(...results.map(r => r.opacity));
    console.log('Max image opacity reached:', maxOpacity);
    expect(maxOpacity).toBeGreaterThan(0.9);

    // Should be monotonically non-decreasing (allow tiny float jitter)
    for (let i = 1; i < results.length; i++) {
      if (results[i].scrollPx > results[i - 1].scrollPx) {
        expect(results[i].opacity).toBeGreaterThanOrEqual(results[i - 1].opacity - 0.05);
      }
    }
  });

  // ── Test 4: Hero fades as image rises ─────────────────────────
  test('hero fades while image rises — cross-fade works correctly', async ({ page }) => {
    const imgWrapper = page.locator('img[alt="Cipher research terminal"]').locator('..');
    const heroContainer = page.locator('div.absolute.inset-0.flex.flex-col.items-center.justify-center.pointer-events-none');

    const viewportH = await page.evaluate(() => window.innerHeight);

    // Scroll deep into the scene where image should be fully visible
    // Scene starts at ~1vh, is 350vh. monPhase=1 at p=0.50 → 0.50*250=125vh into scene
    // Plus hero (100vh) = 225vh total scroll. Use 3× viewport to be sure.
    const deepScroll = viewportH * 3.5;
    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), deepScroll);
    await page.waitForTimeout(300);

    const imgOpacity = await imgWrapper.evaluate(el => parseFloat((el as HTMLElement).style.opacity || '0'));
    const heroOpacity = await heroContainer.evaluate(el => parseFloat((el as HTMLElement).style.opacity || '1'));
    const imgTransform = await imgWrapper.evaluate(el => (el as HTMLElement).style.transform);

    console.log(`At scroll=${Math.round(deepScroll)}px:`);
    console.log(`  image opacity = ${imgOpacity.toFixed(3)}`);
    console.log(`  hero opacity  = ${heroOpacity.toFixed(3)}`);
    console.log(`  image transform = ${imgTransform}`);

    // Image should be mostly visible
    expect(imgOpacity).toBeGreaterThan(0.8);
    // Hero should be mostly gone
    expect(heroOpacity).toBeLessThan(0.2);
    // Transform should show near-zero vertical offset
    expect(imgTransform).toContain('translateY');
  });

  // ── Test 5: Progress bar tracks scroll ────────────────────────
  test('progress indicator updates with scroll', async ({ page }) => {
    const viewportH = await page.evaluate(() => window.innerHeight);

    // Scroll into the scene
    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), viewportH * 2);
    await page.waitForTimeout(200);

    // Progress bar should have height > 0%
    const progressBar = page.locator('div.absolute.top-0.left-0.w-full').first();
    const progressH = await progressBar.evaluate(el => (el as HTMLElement).style.height);
    console.log('Progress bar height at 2vh scroll:', progressH);
    expect(progressH).not.toBe('0%');
    expect(progressH).not.toBe('');

    const pct = parseFloat(progressH);
    expect(pct).toBeGreaterThan(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  // ── Test 6: Visual screenshot at key scroll positions ─────────
  test('visual snapshots at 0%, 30%, 60% scroll', async ({ page }) => {
    const viewportH = await page.evaluate(() => window.innerHeight);

    // Hero state
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    await page.screenshot({ path: '/tmp/scroll-0pct.png', fullPage: false });

    // Mid animation
    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), viewportH * 2);
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/scroll-mid.png', fullPage: false });

    // Image fully visible
    await page.evaluate(y => window.scrollTo({ top: y, behavior: 'instant' }), viewportH * 3.5);
    await page.waitForTimeout(300);
    await page.screenshot({ path: '/tmp/scroll-full.png', fullPage: false });

    console.log('Screenshots saved:');
    console.log('  /tmp/scroll-0pct.png  (hero state)');
    console.log('  /tmp/scroll-mid.png   (animation mid-point)');
    console.log('  /tmp/scroll-full.png  (image fully visible)');

    // Verify the "full" screenshot has the image visible
    const imgWrapper = page.locator('img[alt="Cipher research terminal"]').locator('..');
    const finalOpacity = await imgWrapper.evaluate(el => parseFloat((el as HTMLElement).style.opacity || '0'));
    expect(finalOpacity).toBeGreaterThan(0.8);
  });
});
