---
phase: 13-deep-sentiment-intelligence
plan: 03
status: complete
---

# Plan 03 Summary

## What Was Done

Audited `ResearchReport.tsx` against the `13-UI-SPEC.md` design contract. Two sections existed as incomplete/incorrect implementations. Replaced both with spec-compliant versions:

1. **Sentiment Intelligence Card** — rewrote the existing partial implementation to match the spec exactly (chip anatomy, colors, icon, padding, annotation row, conditional render logic).
2. **Forward Outlook Section** — removed the misplaced pre-Sources implementation and replaced it with a spec-compliant version positioned after the Sources section (final section before FooterTicker).

No new imports added. No new CSS classes introduced. The `getPutCallColor()` helper (already present in the file) was left intact but is no longer used by the Sentiment Intelligence card — the spec assigns amber (`text-tertiary`) to the P/C chip unconditionally, not conditionally based on interpretation.

## Sections Added

### Sentiment Intelligence Card
- Positioned inside the left column (`lg:col-span-8`), after the Market Sentiment card
- Conditional render: `{(sentiment_intelligence != null) && (...)}`
- Card: `bg-surface-container p-4 rounded-lg` (compact 16px padding per spec)
- Header: `monitoring` Material Symbol icon (`text-tertiary`) + `text-[10px] font-bold tracking-widest uppercase text-on-surface-variant` label + optional `TRENDING` badge in `text-tertiary`
- Three chips in a flex row, each `bg-surface-container-highest px-4 py-2 rounded flex flex-col items-center gap-1`:
  - **BULL** chip: value in `text-secondary` (teal) or `text-on-surface-variant` if null
  - **BEAR** chip: value in `text-error` (red) or `text-on-surface-variant` if null
  - **P/C RATIO** chip: value in `text-tertiary` (amber) or `text-on-surface-variant` if null; interpretation sub-label in `text-tertiary` when both ratio and interpretation are non-null
- Annotation row separated by `border-t border-surface-container-highest pt-2 mt-2`; shows community sources count or "Community sources unavailable"

### Forward Outlook Section
- Positioned as the **final section** in `<main>`, after the Sources section and before `<FooterTicker />`
- Conditional render: `{future_projection && future_projection.length > 0 && (...)}`
- Card: `bg-surface-container p-6 rounded-lg border-l-4 border-primary relative overflow-hidden` — mirrors Executive Summary pattern (bookend treatment)
- Glow: `absolute top-0 right-0 w-48 h-48 bg-primary/5 blur-[100px]` — identical to Executive Summary
- Header: `auto_awesome` Material Symbol icon (`text-primary text-base`, filled) + `text-[11px] font-bold tracking-widest uppercase text-primary` label
- Body: `text-sm text-on-surface leading-relaxed max-w-4xl` rendered via `<Md>` for bold support

## Build Status

`npm run build`: PASS — compiled successfully, all 17 routes generated, no TypeScript errors. Pre-existing ESLint circular structure warning is unrelated to this change.
