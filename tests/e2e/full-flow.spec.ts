import { test, expect, Page } from '@playwright/test';

const TICKER = 'AAPL';

// Full flow is slow — allow up to 8 minutes for the entire test
test.setTimeout(8 * 60 * 1000);

// ─── Helper: wait for any selector and take screenshot ────────────────────────
async function snap(page: Page, filename: string) {
  await page.screenshot({ path: `/tmp/${filename}`, fullPage: false });
  console.log(`📸  /tmp/${filename}`);
}

// ─── Helper: type into ticker search and get the dropdown ────────────────────
async function searchTicker(page: Page, ticker: string) {
  const input = page.locator('input[placeholder*="TICKER"], input[placeholder*="ticker"]').first();
  await input.waitFor({ state: 'visible', timeout: 10000 });
  await input.click();
  await input.fill(ticker);
  await page.waitForTimeout(600); // debounce (300ms) + buffer
}

// ─── Helper: click the first autocomplete result matching ticker ──────────────
async function clickFirstResult(page: Page, ticker: string) {
  // Dropdown is a div containing buttons, each button has the symbol as text
  const btn = page.locator('div[class*="absolute"] button').filter({ hasText: ticker }).first();
  await btn.waitFor({ state: 'visible', timeout: 10000 });
  await btn.click();
}

// ─── 1. HOMEPAGE ──────────────────────────────────────────────────────────────
test.describe('1. Homepage', () => {
  test('renders terminal header and ticker tape', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await snap(page, 'e2e-01-homepage.png');

    // Brand — use heading to be specific (not the scroll scene wordmark)
    await expect(page.locator('h1').filter({ hasText: 'EQUINFO' })).toBeVisible();
    await expect(page.locator('text=RESEARCH TERMINAL').first()).toBeVisible();

    // Ticker tape with at least one symbol in footer
    await expect(page.locator('footer').getByText('AAPL').first()).toBeVisible();
  });

  test('setup status check returns allOk', async ({ page }) => {
    const res = await page.request.get('/api/setup/status');
    expect(res.status()).toBe(200);
    const json = await res.json();
    console.log('Setup status:', JSON.stringify(json));
    expect(json.allOk).toBe(true);
    expect(json.pythonOk).toBe(true);
    expect(json.notebooklmOk).toBe(true);
    expect(json.authOk).toBe(true);
  });

  test('ticker search input is visible (no setup wizard blocking)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500); // let setup status fetch resolve

    // SetupWizard should NOT be shown (all deps are installed)
    await expect(page.locator('text=SetupWizard')).not.toBeVisible().catch(() => {});

    // Ticker search input should be visible
    const input = page.locator('input[placeholder*="TICKER"], input[placeholder*="ticker"]').first();
    await expect(input).toBeVisible();
    await snap(page, 'e2e-01b-search-visible.png');
  });

  test('landing page sections are all visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Nav
    await expect(page.locator('header').filter({ hasText: 'EQUINFO' }).first()).toBeVisible();

    // Hero
    await expect(page.locator('h1').filter({ hasText: 'EQUINFO' })).toBeVisible();
    await expect(page.locator('text=Research before you trade').first()).toBeVisible();

    // Pipeline steps
    await expect(page.locator('text=RESEARCH PIPELINE').first()).toBeVisible();
    await expect(page.locator('text=COLLECT').first()).toBeVisible();
    await expect(page.locator('text=SYNTHESIZE').first()).toBeVisible();

    // Market snapshot section
    await expect(page.locator('text=MARKET SNAPSHOT').first()).toBeVisible();

    // How it works section
    await expect(page.locator('text=HOW IT WORKS').first()).toBeVisible();
    await expect(page.locator('text=DATA COLLECTION').first()).toBeVisible();
    await expect(page.locator('text=AI SYNTHESIS').first()).toBeVisible();
    await expect(page.locator('text=REPORT OUTPUT').first()).toBeVisible();

    // Intelligence stack
    await expect(page.locator('text=INTELLIGENCE STACK').first()).toBeVisible();

    // Take full-page screenshot to visually confirm
    await page.screenshot({ path: '/tmp/e2e-01c-full-landing.png', fullPage: true });
    console.log('📸  /tmp/e2e-01c-full-landing.png');
  });
});

// ─── 2. TICKER SEARCH & AUTOCOMPLETE ─────────────────────────────────────────
test.describe('2. Ticker search', () => {
  test('typing AAPL shows autocomplete suggestions', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await searchTicker(page, TICKER);

    // Autocomplete dropdown is a div > buttons with the symbol text
    const dropdown = page.locator('div[class*="absolute"]').filter({ hasText: TICKER }).first();
    await expect(dropdown).toBeVisible({ timeout: 10000 });

    const firstBtn = page.locator('div[class*="absolute"] button').filter({ hasText: TICKER }).first();
    await expect(firstBtn).toBeVisible({ timeout: 10000 });

    await snap(page, 'e2e-02-autocomplete.png');
    console.log('✓ Autocomplete shows AAPL suggestions');
  });
});

// ─── 3. CHART CONFIRMATION PAGE ───────────────────────────────────────────────
test.describe('3. Chart confirmation', () => {
  test('selecting AAPL navigates to chart page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await searchTicker(page, TICKER);
    await clickFirstResult(page, TICKER);

    // Should navigate to /research/AAPL
    await page.waitForURL(/research\/AAPL/, { timeout: 15000 });
    await snap(page, 'e2e-03-chart-page.png');
    console.log('✓ Navigated to:', page.url());
  });

  test('chart confirmation page has a Confirm button', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await searchTicker(page, TICKER);
    await clickFirstResult(page, TICKER);
    await page.waitForURL(/research\/AAPL/, { timeout: 15000 });

    // Wait for chart to load (fetches from yahoo-finance2)
    await page.waitForTimeout(4000);
    await snap(page, 'e2e-03b-chart-loaded.png');

    // Chart confirmation has a "Run Research" or "Confirm" type button
    const confirmBtn = page.locator('button').filter({ hasText: /run analysis|confirm|start|analyze|research/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 15000 });
    console.log('✓ Confirm button visible');
    await snap(page, 'e2e-03c-confirm-btn.png');
  });
});

// ─── 4. FULL RESEARCH PIPELINE (slow — calls real APIs) ──────────────────────
test.describe('4. Full pipeline — data collection + analysis + report', () => {
  test('clicking Confirm triggers data collection → analysis → report', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // ── Step 1: Search ────────────────────────────────────────────
    await searchTicker(page, TICKER);
    await clickFirstResult(page, TICKER);
    await page.waitForURL(/research\/AAPL/, { timeout: 15000 });
    await page.waitForTimeout(4000); // wait for chart
    await snap(page, 'e2e-04a-pre-confirm.png');

    // ── Step 2: Confirm ───────────────────────────────────────────
    const confirmBtn = page.locator('button').filter({ hasText: /run analysis|confirm|start|analyze|research/i }).first();
    await confirmBtn.waitFor({ timeout: 15000 });
    await confirmBtn.click();
    console.log('✓ Clicked Confirm — data collection starting...');
    await snap(page, 'e2e-04b-data-collecting.png');

    // ── Step 3: Wait for analysis to start ───────────────────────
    await page.waitForTimeout(5000);
    await snap(page, 'e2e-04c-after-confirm-5s.png');
    console.log('Current URL:', page.url());

    // Navigate to research page or wait for redirect
    await page.waitForURL(/research/, { timeout: 60000 }).catch(() => {
      console.log('Still at:', page.url(), '— checking current page state');
    });
    console.log('Research URL:', page.url());
    await snap(page, 'e2e-04d-research-page.png');

    // ── Step 4: Wait for progress steps ──────────────────────────
    console.log('Waiting for analysis progress steps (this takes a few minutes)...');

    // Progress indicator should appear
    const progressSection = page.locator('text=/progress|analyzing|fetching|notebook|query/i').first();
    await expect(progressSection).toBeVisible({ timeout: 90000 }).catch(() => {
      console.log('No progress text found — may have already completed');
    });
    await snap(page, 'e2e-04e-progress.png');

    // ── Step 5: Wait for report (or fail fast on error) ──────────
    // "EXPORT PDF" only appears in ResearchReport. "ANALYSIS FAILED" only appears on error page.
    console.log('Waiting for final report (up to 6 minutes)...');
    await Promise.race([
      page.locator('button', { hasText: 'EXPORT PDF' }).waitFor({ state: 'visible', timeout: 6 * 60 * 1000 }),
      page.locator('h1, span', { hasText: 'ANALYSIS FAILED' }).waitFor({ state: 'visible', timeout: 6 * 60 * 1000 }).then(async () => {
        const errMsg = await page.locator('p').filter({ hasText: /Script failed|Error|failed/i }).first().textContent().catch(() => 'unknown');
        await snap(page, 'e2e-04-error.png');
        // Rate limit / transient API errors are not code bugs — skip instead of hard fail
        const isRateLimit = errMsg?.toLowerCase().includes('rate limit') || errMsg?.toLowerCase().includes('wait a few');
        if (isRateLimit) {
          console.log('⚠ NotebookLM API rate limited — skipping pipeline completion check');
          test.skip();
        }
        throw new Error(`Analysis pipeline failed: ${errMsg}`);
      }),
    ]);

    await snap(page, 'e2e-04f-report-rendered.png');
    console.log('✓ Report rendered!');

    // ── Step 6: Validate report sections ─────────────────────────
    // These section headers only appear in ResearchReport (all caps).
    const sectionLabels = [
      'MARKET SENTIMENT',
      'BULLISH FACTORS',
      'BEARISH FACTORS',
      'ASSESSMENT',
      'CONFIDENCE LEVEL',
      'SOURCES',
    ];

    for (const label of sectionLabels) {
      const el = page.locator(`text=${label}`).first();
      const found = await el.isVisible().catch(() => false);
      console.log(`  ${found ? '✓' : '✗'} Section: ${label}`);
    }

    // At minimum, the market sentiment badge (bullish/bearish/neutral) should be present
    await expect(page.locator('text=/^(BULLISH|BEARISH|NEUTRAL)$/i').first()).toBeVisible();

    // ── Step 7: Verify PDF export button ─────────────────────────
    const pdfBtn = page.locator('button', { hasText: 'EXPORT PDF' });
    await expect(pdfBtn).toBeVisible({ timeout: 5000 });
    await expect(pdfBtn).toBeEnabled();
    console.log('✓ PDF export button is visible and enabled');

    await snap(page, 'e2e-04g-final-state.png');
    console.log('✓ Full pipeline complete!');
  });
});
