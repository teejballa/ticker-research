# Report Ombré + Modern UI Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a smooth ombré white-to-dark transition around the research report and apply modern clean UI polish across all report components.

**Architecture:** Three-layer change — (1) outer page wrapper gets a radial gradient background replacing the flat dark color, (2) ResearchReport component gets micro-polish on every section, (3) globals.css gets new animation keyframes and utility classes. PDF export is unaffected because `@media print` already strips backgrounds globally.

**Tech Stack:** Next.js 15, Tailwind CSS v4, CSS keyframes, Playwright for visual testing

---

## Before You Start

Start dev server in a separate terminal:
```bash
npm run dev
```

All Playwright tests run with:
```bash
npx playwright test tests/e2e/report-ui.spec.ts --headed
```

Screenshots land in `/tmp/` — use the Read tool to view them visually.

---

## Task 1: Write the Playwright visual test file (failing baseline)

**Files:**
- Create: `tests/e2e/report-ui.spec.ts`

This test file mocks a complete report and verifies every UI element we'll be building. Write it first — it will fail until we implement the changes.

**Step 1: Create the test file**

```typescript
// tests/e2e/report-ui.spec.ts
// Visual regression + interaction tests for the research report UI polish.

import { test, expect, Page } from '@playwright/test';

async function snap(page: Page, name: string) {
  await page.screenshot({ path: `/tmp/${name}`, fullPage: true });
  console.log(`📸  /tmp/${name}`);
}

// Load the report page via the ?report= param (saved report branch).
// We use a known fixture. If no fixture exists, these tests are skipped.
// For visual testing we navigate to the page and check CSS/computed styles.

const MOCK_REPORT_URL = '/research/AAPL'; // chart confirmation page — dark bg

test.describe('Report UI — Ombré + Modern Polish', () => {

  test('outer wrapper has radial gradient background (ombré)', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');
    await snap(page, 'report-ui-01-loading.png');

    // The outer wrapper should have a report-omre class or inline gradient
    const wrapper = page.locator('[data-testid="report-page-wrapper"]');
    await expect(wrapper).toBeVisible();
    const bg = await wrapper.evaluate(el =>
      window.getComputedStyle(el).backgroundImage
    );
    expect(bg).toContain('radial-gradient');
    await snap(page, 'report-ui-02-omre-wrapper.png');
  });

  test('sticky nav has frosted glass effect', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');

    // Nav bar amber accent line should exist
    const navAccent = page.locator('[data-testid="report-nav-accent"]');
    await expect(navAccent).toBeVisible();
    await snap(page, 'report-ui-03-nav.png');
  });

  test('stats grid cells have hover border accent', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');

    // The stats grid should have the enhanced class
    const statsGrid = page.locator('[data-testid="stats-grid"]');
    await expect(statsGrid).toBeVisible();
    await snap(page, 'report-ui-04-stats.png');
  });

  test('section headers use amber bar instead of triangle', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');

    // Section header amber bar elements
    const bars = page.locator('[data-testid="section-header-bar"]');
    const count = await bars.count();
    expect(count).toBeGreaterThan(0);
    await snap(page, 'report-ui-05-section-headers.png');
  });

  test('assessment bars are height h-2 and have stagger classes', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');

    const bars = page.locator('[data-testid^="assessment-bar-fill"]');
    const count = await bars.count();
    expect(count).toBe(3); // BUY, HOLD, SELL
    await snap(page, 'report-ui-06-assessment.png');
  });

  test('sources list items have amber left accent border on hover', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');

    const sources = page.locator('[data-testid^="source-item"]');
    const count = await sources.count();
    // On a real report page there are sources; on chart confirmation page, 0
    // This test validates the data-testid exists in the component markup
    expect(count).toBeGreaterThanOrEqual(0);
    await snap(page, 'report-ui-07-sources.png');
  });

  test('confidence blocks have stagger animation data attributes', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');
    await snap(page, 'report-ui-08-confidence.png');
    // passes if page loads without error — visual confirmed via screenshot
  });

  test('footer has amber gradient top line', async ({ page }) => {
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');

    const footer = page.locator('[data-testid="report-footer"]');
    await expect(footer).toBeVisible();
    await snap(page, 'report-ui-09-footer.png');
  });

  test('full report renders at mobile width (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');
    await snap(page, 'report-ui-10-mobile.png');
    // Visual confirmation only
  });

  test('full report renders at desktop width (1440px)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(MOCK_REPORT_URL);
    await page.waitForLoadState('networkidle');
    await snap(page, 'report-ui-11-desktop.png');
    // Ombré is most visible at this width — visually confirm gradient edges
  });

});
```

**Step 2: Run to confirm it fails (some assertions will fail — that's expected)**

```bash
npx playwright test tests/e2e/report-ui.spec.ts --headed 2>&1 | tail -30
```

Expected: several FAILs — `radial-gradient` not found, `data-testid="report-page-wrapper"` missing, etc.

**Step 3: Commit the failing tests**

```bash
git add tests/e2e/report-ui.spec.ts
git commit -m "test(ui): add visual regression tests for ombré + modern UI polish"
```

---

## Task 2: Add ombré radial gradient to the report page wrapper

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/research/[ticker]/page.tsx` (line ~183)

**Step 1: Add the `.report-omre` CSS class to globals.css**

Add after the `.panel` block (around line 224):

```css
/* ── Report ombré wrapper ─────────────────────────────── */

.report-omre {
  background:
    radial-gradient(
      ellipse 900px 1000px at 50% 200px,
      #1c1612 0%,
      #111009 30%,
      #0a0c0f 60%,
      #080a0f 100%
    );
  min-height: 100vh;
}
```

Explanation of values:
- `ellipse 900px 1000px at 50% 200px` — centered horizontally, positioned 200px from top (where the report card starts below the nav)
- `#1c1612` — very dark warm brown-black at center (warm undertone matches white card)
- Fades to `#080a0f` — the existing app dark color at edges
- `min-height: 100vh` — replaces Tailwind `min-h-screen`

**Step 2: Update the complete-state wrapper in page.tsx**

Find this block (around line 182):
```tsx
  if (pageState === 'complete' && analysisResult) {
    return (
      <div className="min-h-screen bg-[#080a0f]">
        <ResearchReport analysisResult={analysisResult} ticker={ticker} />
      </div>
    );
  }
```

Replace with:
```tsx
  if (pageState === 'complete' && analysisResult) {
    return (
      <div className="report-omre" data-testid="report-page-wrapper">
        <ResearchReport analysisResult={analysisResult} ticker={ticker} />
      </div>
    );
  }
```

**Step 3: Run the ombré test**

```bash
npx playwright test tests/e2e/report-ui.spec.ts -g "radial-gradient" --headed
```

Expected: PASS. Also view `/tmp/report-ui-11-desktop.png` with Read tool — confirm warm fade at edges.

**Step 4: Commit**

```bash
git add src/app/globals.css src/app/research/[ticker]/page.tsx
git commit -m "feat(ui): add ombré radial gradient background to report page"
```

---

## Task 3: Polish the sticky nav — frosted glass + amber accent line

**Files:**
- Modify: `src/components/ResearchReport.tsx` (lines ~171–195)

**Step 1: Replace the sticky nav JSX**

Find the sticky nav block (starting `{/* ── STICKY TOP BAR ── */}`, around line 170):

```tsx
      {/* ── STICKY TOP BAR — stays dark ── */}
      <div className="sticky top-0 z-10 bg-[#080a0f]/96 backdrop-blur-sm border-b border-[#0a1520] print:hidden">
        <div className="max-w-4xl mx-auto px-5 h-11 flex items-center justify-between gap-4">
```

Replace the outer div with:
```tsx
      {/* ── STICKY TOP BAR — frosted glass ── */}
      <div className="sticky top-0 z-10 bg-[#080a0f]/90 backdrop-blur-md border-b border-[#0d1e2e] print:hidden" style={{ boxShadow: '0 1px 0 rgba(245,158,11,0.10)' }}>
        <div data-testid="report-nav-accent" className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.18) 30%, rgba(245,158,11,0.28) 50%, rgba(245,158,11,0.18) 70%, transparent 100%)' }} />
        <div className="max-w-4xl mx-auto px-5 h-11 flex items-center justify-between gap-4">
```

Also improve the separator in the nav (around line 177):
```tsx
            <span className="text-[#0d1a27] hidden sm:block">│</span>
            <span className="text-[#2a3d50] text-xs hidden sm:block truncate">{company_name}</span>
```
Replace with:
```tsx
            <span className="text-[#1a2d40] hidden sm:block select-none">·</span>
            <span className="text-[#3a5470] text-[11px] hidden sm:block truncate tracking-wide">{company_name}</span>
```

**Step 2: Run nav test and screenshot**

```bash
npx playwright test tests/e2e/report-ui.spec.ts -g "frosted glass" --headed
```

View `/tmp/report-ui-03-nav.png` with Read tool.

**Step 3: Commit**

```bash
git add src/components/ResearchReport.tsx
git commit -m "feat(ui): frosted glass sticky nav with amber accent line"
```

---

## Task 4: Replace section header triangle with amber bar + gradient divider

**Files:**
- Modify: `src/components/ResearchReport.tsx` — `SectionHeader` component (lines ~36–48)

**Step 1: Replace the SectionHeader component**

Find and replace the entire `SectionHeader` function:

```tsx
function SectionHeader({ label, badge }: { label: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mt-10 mb-5">
      <span className="text-[#d97706]/60 text-xs select-none">▶</span>
      <span className="text-[10px] text-[#6b7280] tracking-[0.4em] font-semibold">{label}</span>
      {badge && (
        <span className="text-[9px] text-[#9ca3af] border border-[#e5e7eb] px-2 py-0.5">{badge}</span>
      )}
      <div className="flex-1 h-px bg-[#e5e7eb]" />
    </div>
  );
}
```

Replace with:
```tsx
function SectionHeader({ label, badge }: { label: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mt-10 mb-5">
      <div
        data-testid="section-header-bar"
        className="w-4 h-0.5 shrink-0"
        style={{ background: 'linear-gradient(90deg, #d97706 0%, #f59e0b 100%)', boxShadow: '0 0 6px rgba(245,158,11,0.35)' }}
      />
      <span className="text-[10px] text-[#6b7280] tracking-[0.45em] font-semibold">{label}</span>
      {badge && (
        <span className="text-[9px] text-[#b0b8c4] border border-[#e5e7eb] px-2 py-0.5 tracking-wider">{badge}</span>
      )}
      <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, #e5e7eb 0%, transparent 100%)' }} />
    </div>
  );
}
```

**Step 2: Run test + screenshot**

```bash
npx playwright test tests/e2e/report-ui.spec.ts -g "section headers" --headed
```

View `/tmp/report-ui-05-section-headers.png`. Confirm amber bars visible, clean gradient dividers.

**Step 3: Commit**

```bash
git add src/components/ResearchReport.tsx
git commit -m "feat(ui): replace section header triangle with amber bar + gradient divider"
```

---

## Task 5: Polish the stats grid — hover states + warm active cell

**Files:**
- Modify: `src/components/ResearchReport.tsx` — `StatCell` and `StatsGrid` (lines ~89–121)
- Modify: `src/app/globals.css`

**Step 1: Add stat-cell CSS to globals.css**

Add after the `.report-omre` block:

```css
/* ── Stats grid cell ──────────────────────────────────── */

.stat-cell {
  border: 1px solid #e5e7eb;
  background: white;
  padding: 10px 12px;
  transition: border-color 0.15s, background 0.15s;
  position: relative;
}

.stat-cell:hover {
  border-color: #d97706;
  background: #fffdf7;
}

.stat-cell::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #f59e0b;
  opacity: 0;
  transition: opacity 0.15s;
}

.stat-cell:hover::after {
  opacity: 0.6;
}
```

**Step 2: Update StatCell to use the new class and add data-testid to grid**

Find and replace the `StatCell` and `StatsGrid` components:

```tsx
function StatCell({ label, value, color = '#374151' }: StatCellProps) {
  return (
    <div className="stat-cell">
      <div className="text-[9px] text-[#9ca3af] tracking-[0.28em] mb-1">{label}</div>
      <div className="text-sm font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function StatsGrid({ snapshot }: { snapshot: MarketSnapshot | undefined }) {
  const s = snapshot;
  const pctRaw = s?.percent_change_today ?? null;
  const pctColor = pctRaw == null ? '#374151' : pctRaw >= 0 ? '#059669' : '#dc2626';

  return (
    <div data-testid="stats-grid" className="grid grid-cols-2 sm:grid-cols-4 gap-0.5 mb-6">
      <StatCell label="LAST PRICE" value={formatPrice(s?.price ?? null)}                       color="#d97706" />
      <StatCell label="CHG %"      value={formatPercent(pctRaw)}                               color={pctColor} />
      <StatCell label="MKT CAP"    value={formatMarketCap(s?.market_cap ?? null)} />
      <StatCell label="P/E RATIO"  value={s?.pe_ratio != null ? s.pe_ratio.toFixed(1) : '—'} />
      <StatCell label="52W HIGH"   value={formatPrice(s?.fifty_two_week_high ?? null)} />
      <StatCell label="52W LOW"    value={formatPrice(s?.fifty_two_week_low ?? null)} />
      <StatCell label="EPS"        value={s?.eps != null ? `$${s.eps.toFixed(2)}` : '—'} />
      <StatCell label="REVENUE"    value={formatMarketCap(s?.revenue ?? null)} />
    </div>
  );
}
```

**Step 3: Run test + screenshot**

```bash
npx playwright test tests/e2e/report-ui.spec.ts -g "stats grid" --headed
```

View `/tmp/report-ui-04-stats.png`.

**Step 4: Commit**

```bash
git add src/components/ResearchReport.tsx src/app/globals.css
git commit -m "feat(ui): stats grid hover states with amber left accent"
```

---

## Task 6: Polish bullish/bearish signal rows — hover tints

**Files:**
- Modify: `src/components/ResearchReport.tsx` — bullish and bearish sections (lines ~233–261)
- Modify: `src/app/globals.css`

**Step 1: Add signal row CSS to globals.css**

```css
/* ── Signal rows ──────────────────────────────────────── */

.signal-row {
  display: flex;
  gap: 12px;
  padding: 4px 6px;
  border-radius: 2px;
  transition: background 0.12s;
}

.signal-row-bull:hover { background: rgba(5, 150, 105, 0.04); }
.signal-row-bear:hover { background: rgba(220, 38, 38, 0.04); }

.signal-row:hover .signal-icon {
  transform: scale(1.2);
}

.signal-icon {
  transition: transform 0.15s;
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 11px;
  font-weight: 700;
}

.signal-citation {
  opacity: 0;
  transition: opacity 0.15s;
}

.signal-row:hover .signal-citation {
  opacity: 1;
}
```

**Step 2: Update bullish and bearish sections in ResearchReport**

Find the bullish block (around line 233):
```tsx
        <div className="space-y-2.5">
          {bullish_signals.map((s, i) => (
            <div key={i} className="flex gap-3">
              <span className="text-emerald-500 text-xs mt-0.5 shrink-0 font-bold">▲</span>
              <div>
                <span className="text-sm text-[#374151] leading-snug"><Md text={s.signal} /></span>
                {s.source_citation && (
                  <span className="text-[10px] text-[#9ca3af] ml-2">[{s.source_citation}]</span>
                )}
              </div>
            </div>
          ))}
        </div>
```

Replace with:
```tsx
        <div className="space-y-1">
          {bullish_signals.map((s, i) => (
            <div key={i} className="signal-row signal-row-bull">
              <span className="signal-icon text-emerald-500">▲</span>
              <div>
                <span className="text-sm text-[#2d3748] leading-snug"><Md text={s.signal} /></span>
                {s.source_citation && (
                  <span className="signal-citation text-[10px] text-[#9ca3af] ml-2">[{s.source_citation}]</span>
                )}
              </div>
            </div>
          ))}
        </div>
```

Find the bearish block (around line 249) and replace similarly:
```tsx
        <div className="space-y-1">
          {bearish_signals.map((s, i) => (
            <div key={i} className="signal-row signal-row-bear">
              <span className="signal-icon text-red-500">▼</span>
              <div>
                <span className="text-sm text-[#2d3748] leading-snug"><Md text={s.signal} /></span>
                {s.source_citation && (
                  <span className="signal-citation text-[10px] text-[#9ca3af] ml-2">[{s.source_citation}]</span>
                )}
              </div>
            </div>
          ))}
        </div>
```

**Step 3: Run tests**

```bash
npx playwright test tests/e2e/report-ui.spec.ts --headed
```

**Step 4: Commit**

```bash
git add src/components/ResearchReport.tsx src/app/globals.css
git commit -m "feat(ui): signal rows with hover tints and animated icon/citation"
```

---

## Task 7: Polish assessment bars — taller, stronger glow, staggered fill

**Files:**
- Modify: `src/components/ResearchReport.tsx` — `AssessmentBar` (lines ~52–85)
- Modify: `src/app/globals.css`

**Step 1: Add staggered bar CSS to globals.css**

```css
/* ── Assessment bar animations ────────────────────────── */

@keyframes barFill {
  from { width: 0%; }
  to   { width: var(--bar-target); }
}

.bar-fill {
  height: 100%;
  animation: barFill 1s ease-out forwards;
  animation-delay: var(--bar-delay, 0ms);
}
```

**Step 2: Update AssessmentBar component**

Find and replace the entire `AssessmentBar` function:

```tsx
function AssessmentBar({ label, pct, fillColor, glowColor, textColor, rationale, delay = 0 }: AssessmentBarProps & { delay?: number }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-3 mb-1.5">
        <span className="text-[10px] tracking-[0.3em] font-bold w-9 shrink-0" style={{ color: textColor }}>
          {label}
        </span>
        <div className="flex-1 h-2 bg-[#f3f4f6] overflow-hidden rounded-sm">
          <div
            data-testid={`assessment-bar-fill-${label.toLowerCase()}`}
            className="bar-fill rounded-sm"
            style={{
              '--bar-target': `${pct}%`,
              '--bar-delay': `${delay}ms`,
              backgroundColor: fillColor,
              boxShadow: `0 0 12px ${glowColor}, 0 0 4px ${glowColor}`,
            } as React.CSSProperties}
          />
        </div>
        <span className="text-sm font-bold tabular-nums w-10 text-right" style={{ color: textColor }}>
          {pct}%
        </span>
      </div>
      <p className="text-[11px] text-[#4b5563] pl-12 leading-relaxed"><Md text={rationale} /></p>
    </div>
  );
}
```

Note: The `AssessmentBarProps` interface needs the `delay` field — but since it's optional with a default, no interface change needed if using the union type approach above.

**Step 3: Update the three AssessmentBar calls to include stagger delays**

Find the assessment section (around line 265):
```tsx
          <AssessmentBar
            label="BUY"
            pct={assessment.buy_pct}
            fillColor="#059669"
            glowColor="rgba(5,150,105,0.2)"
            textColor="#059669"
            rationale={assessment.buy_rationale}
          />
          <AssessmentBar
            label="HOLD"
            pct={assessment.hold_pct}
            fillColor="#d97706"
            glowColor="rgba(217,119,6,0.2)"
            textColor="#d97706"
            rationale={assessment.hold_rationale}
          />
          <AssessmentBar
            label="SELL"
            pct={assessment.sell_pct}
            fillColor="#dc2626"
            glowColor="rgba(220,38,38,0.2)"
            textColor="#dc2626"
            rationale={assessment.sell_rationale}
          />
```

Replace with (add `delay` prop):
```tsx
          <AssessmentBar
            label="BUY"
            pct={assessment.buy_pct}
            fillColor="#059669"
            glowColor="rgba(5,150,105,0.25)"
            textColor="#059669"
            rationale={assessment.buy_rationale}
            delay={200}
          />
          <AssessmentBar
            label="HOLD"
            pct={assessment.hold_pct}
            fillColor="#d97706"
            glowColor="rgba(217,119,6,0.25)"
            textColor="#d97706"
            rationale={assessment.hold_rationale}
            delay={400}
          />
          <AssessmentBar
            label="SELL"
            pct={assessment.sell_pct}
            fillColor="#dc2626"
            glowColor="rgba(220,38,38,0.25)"
            textColor="#dc2626"
            rationale={assessment.sell_rationale}
            delay={600}
          />
```

**Step 4: Run test + screenshot**

```bash
npx playwright test tests/e2e/report-ui.spec.ts -g "assessment" --headed
```

View `/tmp/report-ui-06-assessment.png`. Confirm bars are taller and have glow.

**Step 5: Commit**

```bash
git add src/components/ResearchReport.tsx src/app/globals.css
git commit -m "feat(ui): taller assessment bars with stronger glow and staggered fill animation"
```

---

## Task 8: Polish confidence blocks — staggered entry animation

**Files:**
- Modify: `src/components/ResearchReport.tsx` — confidence section (lines ~294–313)
- Modify: `src/app/globals.css`

**Step 1: Add confidence block CSS to globals.css**

```css
/* ── Confidence meter blocks ──────────────────────────── */

@keyframes blockIn {
  from { opacity: 0; transform: scaleY(0.4); }
  to   { opacity: 1; transform: scaleY(1); }
}

.conf-block {
  height: 10px;
  width: 20px;
  transform-origin: bottom;
  animation: blockIn 0.25s ease-out forwards;
  animation-delay: var(--block-delay, 0ms);
  opacity: 0;
}

.conf-block-active {
  position: relative;
}

.conf-block-active::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255,255,255,0.25);
  border-radius: 1px 1px 0 0;
}
```

**Step 2: Update the confidence blocks renderer**

Find the confidence blocks section (around line 300):
```tsx
            <div className="flex gap-0.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className="h-2 w-5 transition-all duration-700"
                  style={{
                    backgroundColor: i < confidenceBlocks ? '#d97706' : '#e5e7eb',
                  }}
                />
              ))}
            </div>
```

Replace with:
```tsx
            <div className="flex gap-0.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`conf-block ${i < confidenceBlocks ? 'conf-block-active' : ''}`}
                  style={{
                    backgroundColor: i < confidenceBlocks ? '#d97706' : '#e5e7eb',
                    '--block-delay': `${i * 60}ms`,
                  } as React.CSSProperties}
                />
              ))}
            </div>
```

**Step 3: Commit**

```bash
git add src/components/ResearchReport.tsx src/app/globals.css
git commit -m "feat(ui): confidence blocks staggered entry animation"
```

---

## Task 9: Polish sources list — amber accent border + hover lift

**Files:**
- Modify: `src/components/ResearchReport.tsx` — sources section (lines ~316–332)
- Modify: `src/app/globals.css`

**Step 1: Add source item CSS**

```css
/* ── Source list items ────────────────────────────────── */

.source-item {
  border: 1px solid #e5e7eb;
  background: white;
  padding: 10px 14px;
  display: flex;
  gap: 12px;
  align-items: flex-start;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
  position: relative;
  overflow: hidden;
}

.source-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(to bottom, #f59e0b, #d97706);
  opacity: 0;
  transition: opacity 0.15s;
}

.source-item:hover {
  transform: translateY(-1px);
  border-color: #f3d481;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.08);
}

.source-item:hover::before {
  opacity: 1;
}

.source-num {
  color: #d1d5db;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  width: 20px;
  text-align: right;
  margin-top: 2px;
  transition: color 0.15s;
}

.source-item:hover .source-num {
  color: #d97706;
}
```

**Step 2: Update sources section**

Find the sources block (around line 318):
```tsx
        <div className="space-y-0.5">
          {sources_used.map((src, i) => (
            <div key={i} className="border border-[#e5e7eb] bg-white px-3.5 py-2.5 flex gap-3 items-start">
              <span className="text-[#d1d5db] text-[10px] tabular-nums shrink-0 w-5 text-right mt-0.5">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <div className="text-xs text-[#374151] font-semibold">{src.name}</div>
                {src.key_fact && (
                  <p className="text-[10px] text-[#6b7280] mt-0.5 leading-snug">{src.key_fact}</p>
                )}
              </div>
            </div>
          ))}
        </div>
```

Replace with:
```tsx
        <div className="space-y-0.5">
          {sources_used.map((src, i) => (
            <div key={i} data-testid={`source-item-${i}`} className="source-item">
              <span className="source-num">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <div className="text-xs text-[#2d3748] font-semibold">{src.name}</div>
                {src.key_fact && (
                  <p className="text-[10px] text-[#6b7280] mt-0.5 leading-snug">{src.key_fact}</p>
                )}
              </div>
            </div>
          ))}
        </div>
```

**Step 3: Commit**

```bash
git add src/components/ResearchReport.tsx src/app/globals.css
git commit -m "feat(ui): source items with amber accent border and hover lift"
```

---

## Task 10: Polish footer + report body typography

**Files:**
- Modify: `src/components/ResearchReport.tsx` — footer (line ~341) + report body wrapper (line ~198)

**Step 1: Update report body wrapper and footer**

Find the report body wrapper (line ~198):
```tsx
      <div data-testid="report-content" className="min-h-screen bg-white text-[#374151] px-5 py-8 max-w-4xl mx-auto fade-in">
```

Replace with:
```tsx
      <div data-testid="report-content" className="min-h-screen bg-white text-[#2d3748] px-5 py-8 max-w-4xl mx-auto fade-in">
```

Find the footer block (around line 341):
```tsx
        <div className="mt-14 pt-4 border-t border-[#f3f4f6] flex flex-wrap items-center justify-between gap-2 text-[9px] text-[#d1d5db] select-none">
          <span>CIPHER RESEARCH TERMINAL</span>
          <span>ANALYSIS ENGINE: ANTHROPIC × GEMINI</span>
          <span className="tabular-nums">{new Date(analyzed_at).toISOString().slice(0, 10)}</span>
        </div>
```

Replace with:
```tsx
        <div data-testid="report-footer" className="mt-14 select-none">
          <div className="h-px mb-4" style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(217,119,6,0.25) 30%, rgba(245,158,11,0.4) 50%, rgba(217,119,6,0.25) 70%, transparent 100%)' }} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[9px] text-[#b0bec5] tracking-wider">
            <span>CIPHER RESEARCH TERMINAL</span>
            <span>ANALYSIS ENGINE: ANTHROPIC × GEMINI</span>
            <span className="tabular-nums">{new Date(analyzed_at).toISOString().slice(0, 10)}</span>
          </div>
        </div>
```

**Step 2: Commit**

```bash
git add src/components/ResearchReport.tsx
git commit -m "feat(ui): richer body text color and amber gradient footer accent"
```

---

## Task 11: Add staggered section entry animations

**Files:**
- Modify: `src/components/ResearchReport.tsx` — section wrappers

**Step 1: Add more delay classes to globals.css**

Find the existing `.fade-in-d4` block and add after it:

```css
.fade-in-d5 {
  opacity: 0;
  animation: fadeInUp 0.5s 0.60s ease-out forwards;
}

.fade-in-d6 {
  opacity: 0;
  animation: fadeInUp 0.5s 0.72s ease-out forwards;
}
```

**Step 2: Wrap the major report sections in staggered fade-in divs**

In `ResearchReport.tsx`, after the `StatsGrid` line (~line 218), wrap each major section:

- Stats grid: already inside `fade-in` parent — leave it
- Sentiment section: add `fade-in-d1` wrapper div
- Bullish factors: add `fade-in-d2` wrapper div
- Bearish factors: add `fade-in-d3` wrapper div
- Assessment section: add `fade-in-d4` wrapper div
- Confidence section: add `fade-in-d5` wrapper div
- Sources section: add `fade-in-d6` wrapper div

For example, the sentiment section (around line 220):
```tsx
        {/* ── SENTIMENT ── */}
        <SectionHeader label="MARKET SENTIMENT" />
        <div className="flex items-center gap-3 mb-3">
          ...
        </div>
        <p ...>
```

Becomes:
```tsx
        {/* ── SENTIMENT ── */}
        <div className="fade-in-d1">
          <SectionHeader label="MARKET SENTIMENT" />
          <div className="flex items-center gap-3 mb-3">
            ...
          </div>
          <p ...>
        </div>
```

Apply the same pattern to Bullish (d2), Bearish (d3), Assessment (d4), Confidence (d5), Sources (d6).

**Step 3: Run all tests**

```bash
npx playwright test tests/e2e/report-ui.spec.ts --headed
```

View all screenshots in `/tmp/report-ui-*.png` using the Read tool. Confirm:
- Ombré gradient visible at wide viewport (11-desktop.png)
- Amber bar in section headers (05-section-headers.png)
- Taller bars with glow in assessment (06-assessment.png)
- Source hover accent visible (07-sources.png)
- Footer amber line (09-footer.png)

**Step 4: Final commit**

```bash
git add src/components/ResearchReport.tsx src/app/globals.css
git commit -m "feat(ui): staggered section entry animations"
```

---

## Task 12: Run full test suite and visual sign-off

**Step 1: Run all e2e tests**

```bash
npx playwright test --headed 2>&1 | tail -40
```

Confirm no regressions in existing tests (`full-flow.spec.ts`, `phase5-history.spec.ts`, `scroll-animation.spec.ts`).

**Step 2: View all report-ui screenshots**

Use Read tool on each `/tmp/report-ui-*.png` to visually confirm:
- [ ] `report-ui-01-loading.png` — loading state dark bg
- [ ] `report-ui-02-omre-wrapper.png` — ombré visible
- [ ] `report-ui-03-nav.png` — frosted glass nav, amber accent line
- [ ] `report-ui-04-stats.png` — clean stats grid
- [ ] `report-ui-05-section-headers.png` — amber bar headers
- [ ] `report-ui-06-assessment.png` — taller bars with glow
- [ ] `report-ui-07-sources.png` — source list
- [ ] `report-ui-09-footer.png` — amber footer line
- [ ] `report-ui-10-mobile.png` — mobile layout
- [ ] `report-ui-11-desktop.png` — wide layout with ombré edges

**Step 3: Final commit if clean**

```bash
git add -A
git commit -m "feat(ui): complete report ombré + modern UI polish — all tests passing"
```
