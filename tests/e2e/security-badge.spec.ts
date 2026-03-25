import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Minimal StoredReport fixture factory for badge testing.
// security_type is set on the nested AnalysisResult.
function makeStoredReport(securityType: string) {
  return {
    ticker: 'TEST',
    company_name: 'Test Company',
    analyzed_at: new Date().toISOString(),
    market_sentiment: 'neutral' as const,
    confidence_level: 'Medium' as const,
    analysis: {
      ticker: 'TEST',
      company_name: 'Test Company',
      analyzed_at: new Date().toISOString(),
      market_sentiment: 'neutral' as const,
      sentiment_reasoning: 'Test reasoning for security type badge testing.',
      bullish_signals: [
        { signal: 'Signal 1', source_citation: 'Source 1' },
        { signal: 'Signal 2', source_citation: 'Source 2' },
        { signal: 'Signal 3', source_citation: 'Source 3' },
      ],
      bearish_signals: [
        { signal: 'Risk 1', source_citation: 'Source 1' },
        { signal: 'Risk 2', source_citation: 'Source 2' },
        { signal: 'Risk 3', source_citation: 'Source 3' },
      ],
      assessment: {
        buy_pct: 34,
        hold_pct: 33,
        sell_pct: 33,
        buy_rationale: 'Test buy rationale.',
        hold_rationale: 'Test hold rationale.',
        sell_rationale: 'Test sell rationale.',
      },
      confidence_level: 'Medium' as const,
      confidence_explanation: 'Test confidence explanation.',
      sources_used: [],
      source_warnings: [],
      security_type: securityType,
      market_snapshot: null,
    },
  };
}

const REPORTS_DIR = path.join(os.homedir(), '.cipher', 'reports');

function writeFixture(securityType: string): string {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const filename = `TEST-badge-fixture-${securityType}.json`;
  const filepath = path.join(REPORTS_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(makeStoredReport(securityType)));
  return filename;
}

test.beforeAll(() => {
  // Pre-write all fixtures so they're available when tests run
  ['spac', 'etf', 'equity', 'unknown'].forEach(writeFixture);
});

test.afterAll(() => {
  // Clean up fixture files after tests complete
  ['spac', 'etf', 'equity', 'unknown'].forEach((type) => {
    const filepath = path.join(REPORTS_DIR, `TEST-badge-fixture-${type}.json`);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  });
});

test.describe('security type badge', () => {

  test('SPAC badge shows when security_type is spac', async ({ page }) => {
    const filename = writeFixture('spac');
    await page.goto(`http://localhost:3000/research/TEST?report=${filename}`);

    // Wait for report to render — badge should appear in the sub-bar
    await page.waitForSelector('[data-testid="security-type-badge"]', { timeout: 15000 });

    const badge = page.locator('[data-testid="security-type-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('SPAC');

    await page.screenshot({ path: 'tests/screenshots/security-badge-spac.png', fullPage: false });
  });

  test('ETF badge shows when security_type is etf', async ({ page }) => {
    const filename = writeFixture('etf');
    await page.goto(`http://localhost:3000/research/TEST?report=${filename}`);

    await page.waitForSelector('[data-testid="security-type-badge"]', { timeout: 15000 });

    const badge = page.locator('[data-testid="security-type-badge"]');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText('ETF');

    await page.screenshot({ path: 'tests/screenshots/security-badge-etf.png', fullPage: false });
  });

  test('no badge for equity security_type', async ({ page }) => {
    const filename = writeFixture('equity');
    await page.goto(`http://localhost:3000/research/TEST?report=${filename}`);

    // Wait for the NavBar identity element to confirm the page has rendered
    await page.waitForSelector('[data-testid="nav-identity"]', { timeout: 15000 });

    const badge = page.locator('[data-testid="security-type-badge"]');
    await expect(badge).toHaveCount(0);

    await page.screenshot({ path: 'tests/screenshots/security-badge-equity-none.png', fullPage: false });
  });

  test('no badge for unknown security_type', async ({ page }) => {
    const filename = writeFixture('unknown');
    await page.goto(`http://localhost:3000/research/TEST?report=${filename}`);

    await page.waitForSelector('[data-testid="nav-identity"]', { timeout: 15000 });

    const badge = page.locator('[data-testid="security-type-badge"]');
    await expect(badge).toHaveCount(0);

    await page.screenshot({ path: 'tests/screenshots/security-badge-unknown-none.png', fullPage: false });
  });

});
