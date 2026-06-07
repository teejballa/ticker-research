import { test, expect } from '@playwright/test';

test.describe('/insights/baselines (Phase 21.1 D-28)', () => {
  test('page renders with H1 "Baselines" and methodology blurb', async ({ page }) => {
    await page.goto('/insights/baselines');
    await expect(page.getByRole('heading', { level: 1, name: 'Baselines' })).toBeVisible();
    await expect(page.getByText(/Benjamini.{0,3}Yekutieli/i)).toBeVisible();
  });

  test('three-way comparison table shows LLM / Logistic-24 / Logistic-canonical / Null columns', async ({ page }) => {
    await page.goto('/insights/baselines');
    await expect(page.getByText('LLM')).toBeVisible();
    await expect(page.getByText('Logistic-24')).toBeVisible();
    await expect(page.getByText('Logistic-canonical')).toBeVisible();
    await expect(page.getByText('Null')).toBeVisible();
  });

  test('horizon tab strip has 3d / 7d / 14d / 30d with 7d default selected', async ({ page }) => {
    await page.goto('/insights/baselines');
    const tab7d = page.getByRole('tab', { name: '7d' });
    await expect(tab7d).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('/insights rolling-LLM-IC tile (Phase 21.1 D-10)', () => {
  test('tile renders headline number with BCa 95% CI metadata', async ({ page }) => {
    await page.goto('/insights');
    await expect(page.getByText(/LLM rolling IC.*last 30 days/i)).toBeVisible();
    await expect(page.getByText(/BCa 95% CI/i)).toBeVisible();
  });
});
