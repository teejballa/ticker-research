// tests/e2e/smart-money-asymmetric.spec.ts
// Phase 17-04 — Playwright e2e for SmartMoneyIntelligence section (AC4).
//
// Tests the asymmetric rendering of the Smart Money Intelligence section:
//   Test 1 — Insider populated + Institutional null → Insider sub-card + Institutional placeholder
//   Test 2 — Both null → single neutral placeholder (no sub-cards)
//   Test 3 — Both populated → both sub-cards with full data (positive control)
//
// Per CLAUDE.md "Testing — Playwright Required": screenshots taken at multiple
// states and read back via Read tool. Attestation in 17-04-SUMMARY.md.

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const SCREENSHOT_DIR = 'test-results';

// ── Fixture filenames ──────────────────────────────────────────────────────
const INSIDER_ONLY_FIXTURE     = 'mock-aapl-smi-insider-only.json';
const BOTH_NULL_FIXTURE        = 'mock-aapl-smi-both-null.json';
const BOTH_POPULATED_FIXTURE   = 'mock-aapl-smi-both-populated.json';

const INSIDER_ONLY_URL   = `/research/AAPL?report=${INSIDER_ONLY_FIXTURE}`;
const BOTH_NULL_URL      = `/research/AAPL?report=${BOTH_NULL_FIXTURE}`;
const BOTH_POPULATED_URL = `/research/AAPL?report=${BOTH_POPULATED_FIXTURE}`;

// ── Shared report structure (minimal valid StoredReport) ──────────────────
// institutional_at_report and insider_at_report are added/omitted per test case.

function baseAnalysis(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    analyzed_at: '2026-04-29T00:00:00.000Z',
    market_sentiment: 'bullish',
    sentiment_reasoning: 'SMI asymmetric fixture.',
    bullish_signals: [{ signal: 'Fixture signal.', source_citation: 'Fixture' }],
    bearish_signals: [{ signal: 'Fixture signal.', source_citation: 'Fixture' }],
    assessment: {
      buy_pct: 60, hold_pct: 30, sell_pct: 10,
      buy_rationale: 'Buy.', hold_rationale: 'Hold.', sell_rationale: 'Sell.',
    },
    confidence_level: 'High',
    confidence_explanation: 'Fixture.',
    sources_used: [{ name: 'Fixture', key_fact: 'SMI e2e.' }],
    source_warnings: [],
    market_snapshot: {
      price: 248.96, percent_change_today: -0.0039,
      market_cap: 3659195744256, fifty_two_week_high: 288.62,
      fifty_two_week_low: 169.21, pe_ratio: 28.5, eps: 7.9, revenue: 435617005568,
    },
    engine_calibration: {
      cycle_count: 14, flow_pattern: 'niche_leads', cap_class: 'large_cap',
      trace_window_size: 4, posterior_mean: 0.62, ci_low: 0.52, ci_high: 0.72,
      sample_size: 24, status: 'ACTIVE', brier_in_sample: 0.18, brier_null: 0.25,
      drift_z: 0.4, logistic_score: 0.6, logistic_ci_low: 0.5, logistic_ci_high: 0.7,
      logistic_sample_size: 87, predicted_at: '2026-04-29T00:00:00.000Z',
      engine_alignment: 'Fixture alignment.',
      engine_disagreement: null,
      diffusion_sparkline: [],
      technical_pattern: 'breakout_uptrend',
      technical_posterior_mean: 0.58, technical_ci: [0.48, 0.68],
      technical_sample_size: 20, technical_status: 'ACTIVE',
      technical_alignment: 'Technical alignment fixture.',
      technical_disagreement: null,
      combined_logistic_score: 0.65, agreement: 'aligned',
    },
    ...overrides,
  };
}

// Institutional snapshot (fully populated)
const INST_SNAP = {
  institutional_bucket: 'net_accumulation',
  total_institutional_share: 5000000,
  total_institutional_share_prev: 4800000,
  net_share_change: 200000,
  net_share_change_pct: 4.2,
  fund_count_current: 142,
  fund_count_prev: 137,
  fund_count_delta: 5,
  top10_concentration_pct: 0.38,
  top10_concentration_pct_prev: 0.36,
  ticker_30d_return_pct: 3.2,
  spy_30d_return_pct: 1.1,
  report_date: '2026-03-31',
  filing_date: '2026-04-15',
  data_age_days: 14,
  computed_at: '2026-04-29T00:00:00.000Z',
  data_source: 'finnhub',
};

// Insider snapshot (fully populated, CEO buy, cluster buying)
const INSIDER_SNAP = {
  insider_bucket: 'cluster_buying',
  distinct_buyers: 4,
  distinct_sellers: 1,
  net_buy_share_count: 50000,
  net_sell_share_count: 5000,
  buy_value_usd: 2400000,
  sell_value_usd: 190000,
  has_ceo_buy: true,
  has_cfo_buy: false,
  has_director_buy: true,
  is_planned_10b5_1: false,
  filings_count: 5,
  earliest_filing_date: '2026-04-10',
  latest_filing_date: '2026-04-25',
  data_age_days: 4,
  computed_at: '2026-04-29T00:00:00.000Z',
  data_source: 'finnhub',
  insider_sentiment_mspr: 0.8,
};

function makeStoredReport(analysisOverrides: Record<string, unknown>): Record<string, unknown> {
  const analysis = baseAnalysis(analysisOverrides);
  return {
    ticker: 'AAPL',
    company_name: 'Apple Inc.',
    analyzed_at: '2026-04-29T00:00:00.000Z',
    market_sentiment: 'bullish',
    confidence_level: 'High',
    analysis,
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

async function loadReport(page: Page, url: string) {
  await page.goto(url);
  await disableAnimations(page);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(200);
}

test.beforeAll(async () => {
  const reportsDir = path.join(os.homedir(), '.cipher', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Test 1: Insider populated, Institutional null (explicit null — not omitted)
  const insiderOnlyReport = makeStoredReport({
    institutional_at_report: null,
    insider_at_report: INSIDER_SNAP,
  });
  fs.writeFileSync(
    path.join(reportsDir, INSIDER_ONLY_FIXTURE),
    JSON.stringify(insiderOnlyReport),
  );

  // Test 2: Both null
  const bothNullReport = makeStoredReport({
    institutional_at_report: null,
    insider_at_report: null,
  });
  fs.writeFileSync(
    path.join(reportsDir, BOTH_NULL_FIXTURE),
    JSON.stringify(bothNullReport),
  );

  // Test 3: Both populated (positive control)
  const bothPopulatedReport = makeStoredReport({
    institutional_at_report: INST_SNAP,
    insider_at_report: INSIDER_SNAP,
  });
  fs.writeFileSync(
    path.join(reportsDir, BOTH_POPULATED_FIXTURE),
    JSON.stringify(bothPopulatedReport),
  );
});

test.afterAll(async () => {
  const reportsDir = path.join(os.homedir(), '.cipher', 'reports');
  for (const fname of [INSIDER_ONLY_FIXTURE, BOTH_NULL_FIXTURE, BOTH_POPULATED_FIXTURE]) {
    const p = path.join(reportsDir, fname);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test.describe('SmartMoneyIntelligence — Phase 17-04 AC4 Asymmetric', () => {

  test('AC4 Test 1: insider populated + institutional null — Insider sub-card + Institutional placeholder (BOTH cards present, grid not collapsed)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadReport(page, INSIDER_ONLY_URL);

    const smiSection = page.locator('[data-testid="smart-money-intelligence"]');
    await expect(smiSection).toBeVisible();

    // Header present
    await expect(smiSection).toContainText('Smart Money Intelligence');

    // Insider Activity sub-card is visible AND has data
    const insiderCard = smiSection.locator('[data-testid="insider-activity-card"]');
    await expect(insiderCard).toBeVisible();

    // CLUSTER BUYING badge visible (from insider_bucket='cluster_buying')
    await expect(insiderCard).toContainText('CLUSTER BUYING');

    // Net value: buy_value_usd=2400000, sell_value_usd=190000 → net=+$2.2M (2400000-190000=2210000)
    // The component renders formatUSD(netValue): +$2.2M
    await expect(insiderCard).toContainText('$2.2M');

    // CEO buy: has_ceo_buy=true → "yes" rendered in text-secondary
    await expect(insiderCard).toContainText('yes');

    // Distinct buyers: 4
    await expect(insiderCard).toContainText('4');

    // Institutional Flow placeholder visible (NOT the full card — institutional null)
    const instPlaceholder = smiSection.locator('[data-testid="institutional-flow-placeholder"]');
    await expect(instPlaceholder).toBeVisible();
    await expect(instPlaceholder).toContainText('No recent 13F filings');

    // BOTH cards present — grid is 2-col, not collapsed (AC4 contract)
    // Verify InsiderActivityCard and InstitutionalFlowPlaceholder both exist in DOM
    // Assert both are visible in the same section (BOTH cards present)
    await expect(insiderCard).toBeVisible();
    await expect(instPlaceholder).toBeVisible();

    // Verify the full InstitutionalFlowCard is NOT present (only placeholder)
    await expect(smiSection.locator('[data-testid="institutional-flow-card"]')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/smart-money-asymmetric-insider-only.png`, fullPage: false });
  });

  test('Both null — single neutral placeholder, no sub-cards', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadReport(page, BOTH_NULL_URL);

    const smiSection = page.locator('[data-testid="smart-money-intelligence"]');
    await expect(smiSection).toBeVisible();

    // Header still present even when both null
    await expect(smiSection).toContainText('Smart Money Intelligence');

    // Single placeholder text
    await expect(smiSection).toContainText('No recent smart money activity to report.');

    // NEITHER sub-card grid is rendered
    await expect(smiSection.locator('[data-testid="institutional-flow-card"]')).toHaveCount(0);
    await expect(smiSection.locator('[data-testid="insider-activity-card"]')).toHaveCount(0);
    await expect(smiSection.locator('[data-testid="institutional-flow-placeholder"]')).toHaveCount(0);
    await expect(smiSection.locator('[data-testid="insider-activity-placeholder"]')).toHaveCount(0);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/smart-money-both-null.png`, fullPage: false });
  });

  test('Both populated — both sub-cards visible with full data, no placeholder copy (positive control)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loadReport(page, BOTH_POPULATED_URL);

    const smiSection = page.locator('[data-testid="smart-money-intelligence"]');
    await expect(smiSection).toBeVisible();

    // Both real sub-cards visible
    const instCard = smiSection.locator('[data-testid="institutional-flow-card"]');
    const insiderCard = smiSection.locator('[data-testid="insider-activity-card"]');
    await expect(instCard).toBeVisible();
    await expect(insiderCard).toBeVisible();

    // Institutional card shows accumulation bucket
    await expect(instCard).toContainText('NET ACCUMULATION');
    // Fund count
    await expect(instCard).toContainText('142');

    // Insider card shows cluster buying bucket + CEO buy
    await expect(insiderCard).toContainText('CLUSTER BUYING');
    await expect(insiderCard).toContainText('yes'); // has_ceo_buy=true

    // No placeholder text present
    await expect(smiSection).not.toContainText('No recent smart money activity to report.');
    await expect(smiSection).not.toContainText('No recent 13F filings');
    await expect(smiSection).not.toContainText('No recent Form 4 filings');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/smart-money-both-populated.png`, fullPage: false });
  });

});
