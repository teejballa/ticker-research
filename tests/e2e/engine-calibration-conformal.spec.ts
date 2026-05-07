// tests/e2e/engine-calibration-conformal.spec.ts
// Phase 19 Plan 19-A-03 (D-19) — Playwright e2e for the Vovk-Romano conformal
// CI rendered side-by-side with the Bayesian credible interval in
// EngineCalibrationPanel. ADDITIVE — Bayesian display still rendered
// (no UI regression).
//
// Pattern: derive a fixture in-place from the existing quad-class fixture,
// inject conformal_low/conformal_high into the engine_calibration block,
// write to ~/.cipher/reports, and load via /research/AAPL?report=<file>
// (same approach as engine-calibration-panel.spec.ts).
//
// Locked acceptance criteria from 19-A-03 Task 5:
//   - Test 1: "Conformal CI" label appears in the DOM
//   - Test 2: Bayesian CI / credible interval still present (no regression)
//   - Test 3: Pending state renders when conformal_low/high are null
//   - Screenshot saved to test-results/conformal-ci.png for manual review

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const CONFORMAL_FIXTURE = 'mock-aapl-conformal-report.json';
const PENDING_FIXTURE = 'mock-aapl-conformal-pending-report.json';
const SOURCE_FIXTURE = 'mock-aapl-quad-class-report.json';

const CONFORMAL_URL = `/research/AAPL?report=${CONFORMAL_FIXTURE}`;
const PENDING_URL = `/research/AAPL?report=${PENDING_FIXTURE}`;

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

test.beforeAll(async () => {
  const reportsDir = path.join(os.homedir(), '.cipher', 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });

  // Derive both fixtures from the canonical quad-class fixture so any future
  // schema additions to the quad fixture flow through automatically.
  const sourceText = fs.readFileSync(
    path.join(__dirname, '../fixtures', SOURCE_FIXTURE),
    'utf8',
  );
  const sourceReport = JSON.parse(sourceText);

  // Fixture 1: conformal_low + conformal_high populated (post-cron state).
  // 30d horizon prior 0.62 with conformal half-width 0.18 → [0.44, 0.80].
  const populated = JSON.parse(JSON.stringify(sourceReport));
  populated.analysis.engine_calibration.conformal_low = 0.44;
  populated.analysis.engine_calibration.conformal_high = 0.80;
  fs.writeFileSync(
    path.join(reportsDir, CONFORMAL_FIXTURE),
    JSON.stringify(populated, null, 2),
  );

  // Fixture 2: conformal fields null (pre-cron / cold-start state). UI must
  // render the "pending (n_calibration < 10)" placeholder.
  const pending = JSON.parse(JSON.stringify(sourceReport));
  pending.analysis.engine_calibration.conformal_low = null;
  pending.analysis.engine_calibration.conformal_high = null;
  fs.writeFileSync(
    path.join(reportsDir, PENDING_FIXTURE),
    JSON.stringify(pending, null, 2),
  );

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.afterAll(async () => {
  const reportsDir = path.join(os.homedir(), '.cipher', 'reports');
  for (const fname of [CONFORMAL_FIXTURE, PENDING_FIXTURE]) {
    const p = path.join(reportsDir, fname);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test.describe('EngineCalibrationPanel — Phase 19-A-03 conformal CI', () => {

  test('renders Conformal CI row alongside Bayesian Engine Prior', async ({ page }) => {
    await loadReport(page, CONFORMAL_URL);

    // Engine Calibration panel visible
    const panel = page.locator('[data-testid="engine-calibration-panel"]');
    await expect(panel).toBeVisible();

    // Conformal CI row present (the new dedicated row added by 19-A-03)
    const conformalRow = page.locator('[data-testid="conformal-ci-row"]').first();
    await expect(conformalRow).toBeVisible();
    await expect(conformalRow).toContainText('Conformal CI');

    // Specific bracketed values [44%–80%] (formatPct rounds 0.44/0.80)
    await expect(conformalRow).toContainText('44%');
    await expect(conformalRow).toContainText('80%');

    await page.screenshot({ path: `${SCREENSHOT_DIR}/conformal-ci.png`, fullPage: false });
  });

  test('Bayesian credible interval still present (no UI regression)', async ({ page }) => {
    await loadReport(page, CONFORMAL_URL);

    // Engine Prior MetricCard renders the Bayesian CI in its subValue text
    // ([52% – 72%] from the fixture's ci_low / ci_high). Both formats appear
    // in the codebase ("[52%–72%]" in QuadClassPanel and "[52% – 72%]" in
    // DiffusionOnlyPanel) — match either by checking the panel for the
    // boundary percentages.
    const panel = page.locator('[data-testid="engine-calibration-panel"]');
    await expect(panel).toContainText('52%');
    await expect(panel).toContainText('72%');

    // The Engine Prior label is the anchor for the Bayesian display
    await expect(panel).toContainText('Engine Prior');
  });

  test('renders pending state when conformal_low/high are null', async ({ page }) => {
    await loadReport(page, PENDING_URL);

    const panel = page.locator('[data-testid="engine-calibration-panel"]');
    await expect(panel).toBeVisible();

    const conformalRow = page.locator('[data-testid="conformal-ci-row"]').first();
    await expect(conformalRow).toBeVisible();
    await expect(conformalRow).toContainText('Conformal CI');
    // Pending placeholder uses the literal "pending" word (locked copy)
    await expect(conformalRow).toContainText('pending');

    // Bayesian CI is STILL rendered even when conformal is pending — no
    // regression on the existing Engine Prior path.
    await expect(panel).toContainText('Engine Prior');
    await expect(panel).toContainText('52%');
    await expect(panel).toContainText('72%');
  });
});
