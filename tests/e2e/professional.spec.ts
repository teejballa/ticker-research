import { test, expect } from '@playwright/test';

const SHOTS = '/tmp/cipher-shots';

// Professionalization pass: legal pages, footer legal links, accessible
// tooltips, and the skeleton loader styling. Auth-gated surfaces (dashboard
// history skeleton + optimistic delete) are covered by unit/integration tests.

const LEGAL_PAGES: Array<{ path: string; heading: string }> = [
  { path: '/privacy', heading: 'Privacy Policy' },
  { path: '/terms', heading: 'Terms of Service' },
  { path: '/disclaimer', heading: 'Disclaimer' },
  { path: '/cookies', heading: 'Cookie Policy' },
];

test.describe('Legal pages', () => {
  for (const { path, heading } of LEGAL_PAGES) {
    test(`${path} renders with title, TOC, and last-updated`, async ({ page }) => {
      await page.goto(path);

      // Title
      await expect(page.locator('h1.legal-title')).toHaveText(heading);

      // "Last updated" stamp
      await expect(page.locator('.legal-updated')).toContainText('Last updated');

      // On-this-page TOC with at least a few anchors
      const tocLinks = page.locator('.legal-toc a');
      expect(await tocLinks.count()).toBeGreaterThanOrEqual(4);

      // First TOC anchor jumps to a real section
      const firstHref = await tocLinks.first().getAttribute('href');
      expect(firstHref).toMatch(/^#/);
      await expect(page.locator(firstHref as string)).toBeAttached();

      // Footer is present with the Legal column
      await expect(page.locator('footer.footer >> text=Legal')).toBeVisible();

      await page.screenshot({ path: `${SHOTS}${path.replace(/\//g, '-')}.png`, fullPage: true });
    });
  }
});

test('Footer exposes all four legal links and they navigate', async ({ page }) => {
  await page.goto('/disclaimer'); // legal layout renders the footer
  const footer = page.locator('footer.footer');
  for (const label of ['Disclaimer', 'Privacy policy', 'Terms of service', 'Cookie policy']) {
    await expect(footer.getByRole('link', { name: label, exact: true })).toBeVisible();
  }
  // "Not investment advice" in the footer meta is now a link to /disclaimer
  await expect(footer.getByRole('link', { name: 'Not investment advice' })).toHaveAttribute(
    'href',
    '/disclaimer',
  );
});

test('Sign-in page shows a Terms & Privacy consent line linking the policies', async ({ page }) => {
  await page.goto('/auth/signin');
  const consent = page.locator('.signin-consent');
  await expect(consent).toBeVisible();
  await expect(consent.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  await expect(consent.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  await page.screenshot({ path: `${SHOTS}/signin-consent.png` });
});

test.describe('Accessible tooltips on the NavBar', () => {
  test('theme toggle shows a role=tooltip on hover', async ({ page }) => {
    await page.goto('/disclaimer');
    const gear = page.locator('button.theme-gear');
    await expect(gear).toBeVisible();

    // The tooltip wrapper starts closed.
    const wrapper = page.locator('.tip', { has: gear });
    await expect(wrapper).toHaveAttribute('data-open', 'false');

    await gear.hover();
    await expect(wrapper).toHaveAttribute('data-open', 'true');

    const bubble = wrapper.getByRole('tooltip');
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText(/Switch to (dark|light) theme/);

    // aria-describedby wiring: the trigger points at the tooltip's id.
    const describedBy = await gear.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    await expect(bubble).toHaveAttribute('id', describedBy as string);

    // The gear is the leftmost nav item — the bubble must not clip off the
    // left viewport edge (align="start" keeps it on-screen).
    const box = await bubble.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);

    await page.screenshot({ path: `${SHOTS}/tooltip-theme.png` });
  });

  test('market-status pill shows session-hours tooltip on hover', async ({ page }) => {
    await page.goto('/disclaimer');
    const pill = page.locator('.market-pill');
    await expect(pill).toBeVisible();
    await pill.hover();
    const wrapper = page.locator('.tip', { has: pill });
    await expect(wrapper).toHaveAttribute('data-open', 'true');
    await expect(wrapper.getByRole('tooltip')).toContainText('ET');
  });
});

test('Skeleton loader styling is wired (shimmer animation)', async ({ page }) => {
  await page.goto('/disclaimer');
  // Inject a skeleton element and confirm the .skeleton class drives an animation.
  const animationName = await page.evaluate(() => {
    const el = document.createElement('span');
    el.className = 'skeleton';
    el.style.width = '120px';
    el.style.height = '16px';
    document.body.appendChild(el);
    const name = getComputedStyle(el).animationName;
    el.remove();
    return name;
  });
  // Either the shimmer sweep or the reduced-motion pulse fallback.
  expect(['skeleton-sweep', 'skeleton-pulse']).toContain(animationName);
});
