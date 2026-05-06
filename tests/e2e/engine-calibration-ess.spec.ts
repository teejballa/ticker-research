// tests/e2e/engine-calibration-ess.spec.ts
//
// Phase 18 (Plan 18-08) — Wave 0 stub now activated. Covers CORE-ML-05:
//   1. ESS=<float> renders in EngineCalibrationPanel (D-10) — replaces n=<int>
//   2. WatchBadge "regime stability: watching" renders for EXPLORATORY-WATCH cells (D-11)
//   3. ESS appears at >= 4 sites (one per signal-class card in QuadClassPanel)
//
// Strategy mirrors engine-calibration-quad.spec.ts: ship two fixture reports
// to ~/.cipher/reports and load each via the `?report=<filename>` URL param.
// No live network or DB required.
//
// Plan 18-07 (parallel) extends EngineContext with ESS — at runtime new reports
// will pick up these fields naturally. The fixture pre-stamps them so the panel
// renders against frozen data identical in shape to the post-merge runtime.

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const ESS_FIXTURE   = 'mock-aapl-ess-report.json';
const WATCH_FIXTURE = 'mock-aapl-watch-report.json';

const ESS_URL   = `/research/AAPL?report=${ESS_FIXTURE}`;
const WATCH_URL = `/research/AAPL?report=${WATCH_FIXTURE}`;

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
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  for (const fname of [ESS_FIXTURE, WATCH_FIXTURE]) {
    const fixturePath = path.join(__dirname, '../fixtures', fname);
    if (fs.existsSync(fixturePath)) {
      const content = fs.readFileSync(fixturePath, 'utf8');
      fs.writeFileSync(path.join(reportsDir, fname), content);
    }
  }
});

test.afterAll(async () => {
  const reportsDir = path.join(os.homedir(), '.cipher', 'reports');
  for (const fname of [ESS_FIXTURE, WATCH_FIXTURE]) {
    const p = path.join(reportsDir, fname);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test.describe('[e2e] EngineCalibrationPanel — ESS column + EXPLORATORY-WATCH badge', () => {
  test('research/AAPL renders ESS=<number> instead of n=<number> in calibration panel', async ({ page }) => {
    await loadReport(page, ESS_URL);

    // Engine calibration panel present
    await expect(page.locator('[data-testid="engine-calibration-panel"]')).toBeVisible();

    // At least one ESS=<float> readout is visible in the panel
    const ess = page.locator('[data-testid="engine-calibration-panel"]').getByText(/ESS=\d+\.\d/).first();
    await expect(ess).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/engine-calibration-ess.png`, fullPage: false });
  });

  test('research/AAPL — cell with status=EXPLORATORY-WATCH renders "regime stability: watching" badge', async ({ page }) => {
    await loadReport(page, WATCH_URL);

    // Engine calibration panel present
    await expect(page.locator('[data-testid="engine-calibration-panel"]')).toBeVisible();

    // WatchBadge copy is locked verbatim per CONTEXT D-11
    await expect(
      page.locator('[data-testid="engine-calibration-panel"]').getByText('regime stability: watching').first()
    ).toBeVisible();

    // STATUS_LABEL maps EXPLORATORY-WATCH → "WATCHING" (Plan 18-08 Step 2c)
    await expect(
      page.locator('[data-testid="engine-calibration-panel"]').getByText('WATCHING').first()
    ).toBeVisible();

    await page.screenshot({ path: `${SCREENSHOT_DIR}/engine-calibration-watch.png`, fullPage: false });
  });

  test('research/AAPL — DOM contains literal "ESS=" at least 4 times (one per signal class card)', async ({ page }) => {
    await loadReport(page, ESS_URL);

    // Engine calibration panel present
    const panel = page.locator('[data-testid="engine-calibration-panel"]');
    await expect(panel).toBeVisible();

    // Count ESS= occurrences inside the panel — expect ≥ 4 (one per signal-class card)
    const matches = await panel.getByText(/ESS=/).count();
    expect(matches).toBeGreaterThanOrEqual(4);
  });
});
