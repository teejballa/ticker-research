// tests/e2e/source-mix-row.spec.ts
// Phase 22 Wave 5 (D-17, CORE-ML-27) — Playwright e2e for the Source-mix row
// rendered inside EngineCalibrationPanel per 22-UI-SPEC.md §Test Hooks.
//
// Pattern: derive fixtures in-place from the canonical quad-class fixture,
// inject engine_calibration.source_mix in various regime configurations,
// write to ~/.cipher/reports, and load via /research/AAPL?report=<file>
// (same approach as engine-calibration-conformal.spec.ts).
//
// Locked acceptance criteria (from 22-05-PLAN Task 3 + UI-SPEC §Test Hooks):
//   1. Source-mix row is visible on a report whose source_mix is populated.
//   2. Click the disclosure → the SourceMixExpanded panel becomes visible
//      and aria-expanded flips to "true".
//   3. Cold-start (regime='ALL') renders the REGIME-UNCONDITIONAL variant.
//   4. Legacy report (no source_mix) hides the row entirely (no regression).
//   5. Screenshot saved for manual review.

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const POPULATED_FIXTURE = 'mock-aapl-source-mix-report.json';
const COLD_START_FIXTURE = 'mock-aapl-source-mix-cold-start-report.json';
const LEGACY_FIXTURE = 'mock-aapl-source-mix-legacy-report.json';
const SOURCE_FIXTURE = 'mock-aapl-quad-class-report.json';

const POPULATED_URL = `/research/AAPL?report=${POPULATED_FIXTURE}`;
const COLD_START_URL = `/research/AAPL?report=${COLD_START_FIXTURE}`;
const LEGACY_URL = `/research/AAPL?report=${LEGACY_FIXTURE}`;

const SCREENSHOT_DIR = 'test-results';

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

function buildSourceMix(regime: string, coldStart: boolean) {
  return {
    regime,
    top_sources: [
      {
        source_id: 'stocktwits',
        weight: 0.34,
        weight_unconditional: 0.28,
        weight_drift_30d: Array.from({ length: 30 }, (_, i) => 0.28 + (i / 29) * 0.06),
        drift_direction: 'rising',
        delta_pp_30d: 6,
        is_cold_start_fallback: coldStart,
      },
      {
        source_id: 'options_term_structure',
        weight: 0.28,
        weight_unconditional: 0.30,
        weight_drift_30d: Array.from({ length: 30 }, () => 0.28),
        drift_direction: 'flat',
        delta_pp_30d: 0,
        is_cold_start_fallback: coldStart,
      },
      {
        source_id: 'reddit',
        weight: 0.19,
        weight_unconditional: 0.22,
        weight_drift_30d: Array.from({ length: 30 }, (_, i) => 0.22 - (i / 29) * 0.03),
        drift_direction: 'falling',
        delta_pp_30d: -3,
        is_cold_start_fallback: coldStart,
      },
      {
        source_id: 'hackernews',
        weight: 0.10,
        weight_unconditional: 0.10,
        weight_drift_30d: Array.from({ length: 30 }, () => 0.10),
        drift_direction: 'flat',
        delta_pp_30d: 0,
        is_cold_start_fallback: coldStart,
      },
    ],
  };
}

test.beforeAll(async () => {
  const reportsDir = path.join(os.homedir(), '.cipher', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  const sourceText = fs.readFileSync(
    path.join(__dirname, '../fixtures', SOURCE_FIXTURE),
    'utf8',
  );
  const sourceReport = JSON.parse(sourceText);

  // Fixture 1: populated source_mix with a non-cold-start bear-high-vol regime.
  const populated = JSON.parse(JSON.stringify(sourceReport));
  populated.analysis.engine_calibration.source_mix = buildSourceMix(
    'bear-high-vol',
    false,
  );
  fs.writeFileSync(
    path.join(reportsDir, POPULATED_FIXTURE),
    JSON.stringify(populated, null, 2),
  );

  // Fixture 2: cold-start regime='ALL' — every source falls back to (source, 'ALL')
  // weights per D-09; UI shows REGIME-UNCONDITIONAL variant.
  const coldStart = JSON.parse(JSON.stringify(sourceReport));
  coldStart.analysis.engine_calibration.source_mix = buildSourceMix('ALL', true);
  fs.writeFileSync(
    path.join(reportsDir, COLD_START_FIXTURE),
    JSON.stringify(coldStart, null, 2),
  );

  // Fixture 3: legacy report — source_mix omitted entirely (old persisted
  // reports). UI must hide the row without breaking the rest of the panel.
  const legacy = JSON.parse(JSON.stringify(sourceReport));
  delete legacy.analysis.engine_calibration.source_mix;
  fs.writeFileSync(
    path.join(reportsDir, LEGACY_FIXTURE),
    JSON.stringify(legacy, null, 2),
  );

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.afterAll(async () => {
  const reportsDir = path.join(os.homedir(), '.cipher', 'reports');
  for (const fname of [POPULATED_FIXTURE, COLD_START_FIXTURE, LEGACY_FIXTURE]) {
    const p = path.join(reportsDir, fname);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test.describe('EngineCalibrationPanel — Phase 22 source-mix row', () => {

  test('renders source-mix row with regime pill and top-3 pills (populated)', async ({ page }) => {
    await loadReport(page, POPULATED_URL);

    const panel = page.locator('[data-testid="engine-calibration-panel"]');
    await expect(panel).toBeVisible();

    const row = page.locator('[data-testid="source-mix-row"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText('SOURCE MIX');
    await expect(row).toContainText('BEAR · HIGH-VOL');

    // Top-3 source pills — DOM order = sorted DESC by weight.
    await expect(page.locator('[data-testid="source-mix-pill-1"]')).toContainText('STOCKTWITS');
    await expect(page.locator('[data-testid="source-mix-pill-1"]')).toContainText('34%');
    await expect(page.locator('[data-testid="source-mix-pill-2"]')).toContainText('OPTIONS-TS');
    await expect(page.locator('[data-testid="source-mix-pill-3"]')).toContainText('REDDIT');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/source-mix-row.png`, fullPage: false });
  });

  test('disclosure toggles the SourceMixExpanded panel', async ({ page }) => {
    await loadReport(page, POPULATED_URL);

    const disclosure = page.locator('[data-testid="source-mix-disclosure"]');
    await expect(disclosure).toBeVisible();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await expect(disclosure).toContainText('Show full ranking');

    await disclosure.click();

    await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
    await expect(disclosure).toContainText('Hide full ranking');

    const expanded = page.locator('[data-testid="source-mix-expanded"]');
    await expect(expanded).toBeVisible();
    // Full ranking table renders every source (rank 1..8 up to top_sources.length).
    await expect(expanded).toContainText('STOCKTWITS');
    await expect(expanded).toContainText('OPTIONS-TS');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/source-mix-expanded.png`, fullPage: false });
  });

  test('renders REGIME-UNCONDITIONAL variant when regime is cold-start ALL', async ({ page }) => {
    await loadReport(page, COLD_START_URL);

    const row = page.locator('[data-testid="source-mix-row"]');
    await expect(row).toBeVisible();
    await expect(row).toContainText('REGIME-UNCONDITIONAL');

    const coldStartMarker = page.locator('[data-testid="source-mix-cold-start-banner"]');
    await expect(coldStartMarker).toBeAttached();
  });

  test('legacy report without source_mix hides the row entirely (no regression)', async ({ page }) => {
    await loadReport(page, LEGACY_URL);

    // The panel itself must still render — only the source-mix row is gated.
    const panel = page.locator('[data-testid="engine-calibration-panel"]');
    await expect(panel).toBeVisible();

    // Source-mix row must NOT be in the DOM at all (graceful back-compat).
    const row = page.locator('[data-testid="source-mix-row"]');
    await expect(row).toHaveCount(0);
  });
});
