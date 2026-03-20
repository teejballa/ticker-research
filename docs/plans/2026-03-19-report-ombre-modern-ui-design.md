# Design: Report Ombré + Modern UI Polish

**Date:** 2026-03-19
**Scope:** ResearchReport page visual refresh — ombré background, modern clean UI
**PDF safety:** All improvements use `@media print` guards; PDF output stays pure white

---

## 1. Ombré Background (Option A)

**Approach:** Radial gradient on the `min-h-screen` outer wrapper in `research/[ticker]/page.tsx`.

Change `bg-[#080a0f]` to a CSS radial gradient:
- Center: `#12100e` (very dark warm, near-black, slightly warmer than current cold black)
- Edge: `#080a0f` (existing dark)
- The report's `bg-white` card sits naturally in the center zone and dissolves outward

The `max-w-4xl` report card is centered, so the radial gradient naturally aligns the warm center with the card.

Print: `background-image: none !important` already applied globally in `globals.css` — ombré disappears in PDF.

---

## 2. Modern UI Polish — Specific Changes

### Sticky Nav (ResearchReport top bar)
- Frosted glass: `backdrop-blur-md` + semi-transparent bg instead of near-opaque solid
- Add a 1px amber bottom accent line that glows softly (`shadow` or gradient)
- Ticker label gets slightly larger tracking

### Report Entry Animation
- Staggered `fadeInUp` on each major section (sentiment, bullish, bearish, assessment, confidence, sources)
- Use `fade-in-d1` through `fade-in-d4` classes already in `globals.css`, add more delay steps
- Each section appears 80ms after the previous

### Stats Grid
- Hover state on each `StatCell`: subtle amber left-border accent on hover
- Slight background tint on hover (`#fafafa` → `#fffdf7` warm)
- Active price cell gets a persistent warm background tint

### Section Headers
- Replace plain `▶` triangle with a short horizontal amber bar (2px × 16px)
- Increase label tracking very slightly
- Header divider line gets a gradient fade (full opacity left → transparent right)

### Bullish / Bearish Signal Rows
- Add `group` hover state: entire row gets a very subtle green/red background tint
- Arrow icon scales up slightly on hover
- Source citation becomes more visible on row hover

### Assessment Bars
- Increase bar height from `h-1.5` to `h-2`
- Add a trailing glow on the fill end (already partially done, strengthen it)
- Stagger bar fill animations so BUY fills first, then HOLD, then SELL

### Confidence Meter
- Blocks animate in one by one (stagger 60ms per block) on mount
- Active blocks get a subtle top highlight (lighter top edge)

### Sources List
- Add left-side colored accent border per source (amber)
- Source number changes to amber on hover
- Slight lift (`translateY(-1px)`) on hover

### Typography
- Body text `text-[#374151]` → `text-[#2d3748]` (slightly richer)
- Section label tracking increased from `0.4em` to `0.45em`

### Footer
- Add a thin amber gradient line above footer
- Slightly brighter text

---

## 3. Testing

- Playwright e2e: screenshot the report at multiple viewport widths (mobile/tablet/desktop)
- Visual confirmation that ombré gradient renders correctly
- Confirm PDF export (print media) strips all backgrounds — screenshot print preview
- Check all hover states via Playwright hover interactions
- Verify stagger animations complete correctly

---

## 4. Files Changed

- `src/app/research/[ticker]/page.tsx` — ombré wrapper bg
- `src/components/ResearchReport.tsx` — all component-level polish
- `src/app/globals.css` — new animation keyframes + utility classes
