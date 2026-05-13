// tests/playwright/research-manipulation-banner.spec.ts
//
// Plan 20-C-04 — Pump-and-dump manipulation warning banner spec.
//
// Strategy mirrors tests/e2e/engine-calibration-panel.spec.ts: write fixture
// JSON to ~/.cipher/reports/ (the local-mode persistence directory) and load
// each via the `?report=<filename>` URL param. No live network or DB needed.
//
// NEXT_PUBLIC_FEATURE_PUMP_DUMP_DETECTOR_UI must be 'on' at dev-server start
// for the banner to render. The spec sets it via a per-test process.env
// inheritance check (skipped with a helpful message when missing). Run as:
//
//   NEXT_PUBLIC_FEATURE_PUMP_DUMP_DETECTOR_UI=on \
//     npm run test:e2e -- research-manipulation-banner
//
// Locked acceptance (Plan 20-C-04 line 1156-1166):
//   - Banner visible when is_warning=true + flag=on
//   - role=alert + aria-live=polite
//   - Banner contains the exact fixed copy + methodology link
//   - Zero forbidden substrings: buy, sell, advise, recommend, should
//   - X-button click writes localStorage entry; reload hides banner
//   - is_warning=false → banner count = 0

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const TICKER_FIRE = 'SMALLCAPFIRE';
const TICKER_QUIET = 'SMALLCAPQUIET';

const FIXTURE_FIRE = `mock-${TICKER_FIRE.toLowerCase()}-pdd-report.json`;
const FIXTURE_QUIET = `mock-${TICKER_QUIET.toLowerCase()}-pdd-report.json`;

const FORBIDDEN_SUBSTRINGS = ['buy', 'sell', 'advise', 'recommend', 'should'];

function todayUtcYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildFixture(ticker: string, isWarning: boolean): unknown {
  return {
    ticker,
    company_name: `${ticker} Test Corp`,
    analyzed_at: '2026-05-13T00:00:00.000Z',
    market_sentiment: 'neutral',
    confidence_level: 'Medium',
    analysis: {
      ticker,
      company_name: `${ticker} Test Corp`,
      analyzed_at: '2026-05-13T00:00:00.000Z',
      market_sentiment: 'neutral',
      sentiment_reasoning: 'Synthetic fixture for 20-C-04 banner spec.',
      bullish_signals: [],
      bearish_signals: [],
      buy_hold_sell: 'Hold',
      assessment_reasoning: 'Synthetic fixture.',
      confidence_level: 'Medium',
      market_snapshot: null,
      sources_used: [],
      sentiment_intelligence: {
        stocktwits_bull_pct: 97,
        stocktwits_bear_pct: 3,
        stocktwits_message_count: 500,
        stocktwits_is_trending: true,
        put_call_ratio: null,
        put_call_interpretation: null,
        manipulation_warning: {
          is_warning: isWarning,
          matched_rules: isWarning
            ? ['account_age', 'bull_pct', 'cap_class', 'gini', 'mention_z']
            : [],
          rule_version: 'pdd-v1.0',
        },
      },
    },
  };
}

async function disableAnimations(page: Page) {
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }`,
  });
}

async function loadReport(page: Page, ticker: string, fixture: string) {
  await page.goto(`/research/${ticker}?report=${fixture}`);
  await disableAnimations(page);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(200);
}

const reportsDir = path.join(os.homedir(), '.cipher', 'reports');

test.beforeAll(async () => {
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportsDir, FIXTURE_FIRE),
    JSON.stringify(buildFixture(TICKER_FIRE, true), null, 2),
  );
  fs.writeFileSync(
    path.join(reportsDir, FIXTURE_QUIET),
    JSON.stringify(buildFixture(TICKER_QUIET, false), null, 2),
  );
});

test.afterAll(async () => {
  for (const fname of [FIXTURE_FIRE, FIXTURE_QUIET]) {
    const p = path.join(reportsDir, fname);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

// Each test clears localStorage before navigation so dismissals from a
// previous test do not leak across runs.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { window.localStorage.clear(); } catch { /* no-op */ }
  });
});

test.describe('Plan 20-C-04 — Pump-and-dump manipulation banner', () => {

  test.skip(
    process.env.NEXT_PUBLIC_FEATURE_PUMP_DUMP_DETECTOR_UI !== 'on',
    'NEXT_PUBLIC_FEATURE_PUMP_DUMP_DETECTOR_UI must be "on" for banner to render. '
    + 'Re-run with: NEXT_PUBLIC_FEATURE_PUMP_DUMP_DETECTOR_UI=on npm run test:e2e -- research-manipulation-banner',
  );

  test('banner renders when is_warning=true with role/aria + fixed copy', async ({ page }) => {
    await loadReport(page, TICKER_FIRE, FIXTURE_FIRE);

    const banner = page.locator('[data-banner="manipulation-warning"]');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('role', 'alert');
    await expect(banner).toHaveAttribute('aria-live', 'polite');

    // Exact fixed copy (T-20-C-04-01)
    await expect(banner).toContainText(
      'Possible market manipulation pattern detected (Nam/Yang 2023).',
    );
    await expect(banner).toContainText(
      'This warning does NOT constitute investment advice.',
    );

    // Methodology link href
    const link = banner.locator('a', { hasText: 'Methodology' });
    await expect(link).toHaveAttribute('href', '/docs/model-cards/pump-dump-detector');
  });

  test('banner subtree contains zero forbidden substrings', async ({ page }) => {
    await loadReport(page, TICKER_FIRE, FIXTURE_FIRE);

    const banner = page.locator('[data-banner="manipulation-warning"]');
    await expect(banner).toBeVisible();

    const text = (await banner.innerText()).toLowerCase();
    for (const forbidden of FORBIDDEN_SUBSTRINGS) {
      // "advise" is forbidden, but the fixed copy says "investment advice".
      // "advice" ⊂ "advise"? — no, "advise" is 6 chars; "advice" ends in -ice.
      // Substring check is strict — "advice" does NOT contain "advise".
      expect(
        text,
        `Banner copy must not contain forbidden substring '${forbidden}'`,
      ).not.toContain(forbidden);
    }
  });

  test('clicking X dismisses banner and persists 24h localStorage entry', async ({ page }) => {
    await loadReport(page, TICKER_FIRE, FIXTURE_FIRE);

    const banner = page.locator('[data-banner="manipulation-warning"]');
    await expect(banner).toBeVisible();

    const ymd = todayUtcYmd();
    const storageKey = `pump_dump_dismissed:${TICKER_FIRE}:${ymd}`;

    // Pre-condition: not yet dismissed
    const preValue = await page.evaluate((k) => window.localStorage.getItem(k), storageKey);
    expect(preValue).toBeNull();

    // Click the X button (aria-label is exact, decoupled from the visible "×")
    await page.locator(
      '[data-banner="manipulation-warning"] button[aria-label="Dismiss manipulation warning for 24 hours"]',
    ).click();

    // localStorage entry now populated with a finite numeric ms-since-epoch
    const postValue = await page.evaluate((k) => window.localStorage.getItem(k), storageKey);
    expect(postValue).not.toBeNull();
    expect(Number.isFinite(parseInt(postValue ?? '', 10))).toBe(true);

    // After dismissal click + state update, banner is removed from the DOM
    await expect(banner).toHaveCount(0);

    // Reload → banner remains hidden (24h TTL respects the localStorage entry)
    await page.reload();
    await disableAnimations(page);
    await page.waitForLoadState('networkidle');
    await expect(banner).toHaveCount(0);
  });

  test('banner is absent when is_warning=false (no default-on fire)', async ({ page }) => {
    await loadReport(page, TICKER_QUIET, FIXTURE_QUIET);
    await expect(page.locator('[data-banner="manipulation-warning"]')).toHaveCount(0);
  });
});
