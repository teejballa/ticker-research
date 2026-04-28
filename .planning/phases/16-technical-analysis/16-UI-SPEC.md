---
phase: 16
slug: technical-analysis
status: draft
shadcn_initialized: false
preset: not applicable
created: 2026-04-27
---

# Phase 16 — UI Design Contract: Technical Analysis as a Learning Signal

> Visual and interaction contract for the Phase 16 frontend surfaces. The phase **extends** the existing Cipher "Research Terminal" aesthetic — it does not introduce a new design system. Every new surface inherits Cipher's Material-3-derived dark palette, Inter prose / JetBrains Mono numerics typography, and 4-px spacing rhythm.
>
> **Brand-criticality: HIGH.** This is the headline feature for v1. A reader who sees `ALIGNED` + matching priors should feel conviction; `OPPOSED` should feel like a useful warning, not a glitch.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (project-native Tailwind v4 + `@theme` tokens in `globals.css`) |
| Preset | not applicable — pre-existing locked design system; no shadcn migration in this phase |
| Component library | none — bespoke React components in `src/components/` |
| Icon library | Material Symbols Outlined (already loaded; e.g. `psychology`, `check_circle`, `error`, `trending_up`) — Phase 16 adds `show_chart`, `bar_chart`, `compare_arrows`, `query_stats` |
| Font (prose) | Inter (`--font-headline` / `--font-body` / `--font-label`) |
| Font (numerics) | JetBrains Mono (`--font-mono`) — required wherever a number, ticker, code, or fixed-width data value renders |

**Inherited token namespace** (do not redefine; use as-is from `src/app/globals.css`):

- Surfaces: `bg-surface`, `bg-surface-container`, `bg-surface-container-low`, `bg-surface-container-high`, `bg-surface-container-highest`
- Text: `text-on-surface`, `text-on-surface-variant`, `text-outline`, `text-outline-variant`
- Brand: `text-primary` (Cipher blue `#b6c4ff`), `text-secondary` (teal `#66d9cc`, used for "good / bullish / aligned"), `text-tertiary` (amber `#ffb95f`, used for engine/warning), `text-error` (red `#ffb4ab`)
- Radii: `rounded` (2 px), `rounded-lg` (4 px), `rounded-xl` (8 px), `rounded-full` (12 px)

---

## Spacing Scale

Declared values — strict multiples of 4. Inherited from existing Cipher components; no new spacing tokens introduced.

| Token | Value | Phase 16 Usage |
|-------|-------|----------------|
| xs    | 4 px  | Icon-to-label gap; inline gauge segment gap (`gap-0.5` between RSI cells) |
| sm    | 8 px  | Compact metric row internal padding; horizon-row vertical padding (`py-2`) |
| md    | 16 px | Default card body padding; horizon-table cell padding (`p-4`); column gap inside dual-class panel |
| lg    | 24 px | Section padding inside `EngineCalibrationPanel`; gap between Technical Signals card and adjacent cards |
| xl    | 32 px | Layout gap between major report sections (`space-y-8` already in `<main>`) |
| 2xl   | 48 px | Hero / page-level breaks on `/insights` tabs |
| 3xl   | 64 px | Reserved — not used by Phase 16 |

**Exceptions:**
- RSI gauge bar segments may be `w-1 h-3` (4×12 px) — both multiples of 4, but tighter than `xs` because they are micro data-density elements, matching existing `DriftGauge` pattern in `EngineCalibrationPanel.tsx`.
- The horizon-table star marker (`★`) sits flush against the `30d` label with zero margin (typographic adjacency, not layout spacing).

---

## Typography

Phase 16 declares **4 sizes × 2 weights** within the existing Cipher type system. No new font files; no new weights beyond what the loaded Inter / JetBrains Mono variable axes already provide.

| Role | Size | Weight | Line Height | Family | Phase 16 Usage |
|------|------|--------|-------------|--------|----------------|
| Eyebrow / micro-label | 10 px (`text-[10px]`) | 700 (bold), tracking-widest, uppercase | 1.0 | Inter | Section headers ("HORIZON", "DIFFUSION", "TECHNICAL", "AGREEMENT"); status badges; pattern-library cell labels |
| Caption / data-row | 11 px (`text-[11px]`) | 400 (regular) | 1.4 | JetBrains Mono | Horizon-table cell values; RSI/MACD/MA numeric readouts; CI ranges `[0.51 – 0.73]`; sample size `n=47` |
| Body | 12 px (`text-xs`) | 400 (regular) | 1.5 | Inter | Engine alignment / disagreement prose; tooltip text; tab content paragraphs |
| Heading | 16 px (`text-base`) | 700 (bold) | 1.2 | Inter | Tab headings on `/insights` ("Technical Pattern Library", "Horizon Brier"); Technical Signals card title |
| Display (numeric) | 24 px (`text-2xl`) | 700 (bold), tabular-nums | 1.1 | JetBrains Mono | Headline metric values inside `MetricCard` (engine prior, technical posterior, RSI value) |

**Rules:**
1. Every numeric value renders in `font-mono` with `tabular-nums`. Mixing prose and numbers in the same span is forbidden — wrap the number in `<span className="font-mono tabular-nums">`.
2. Eyebrow micro-labels are uppercased and `tracking-widest` (`0.1em`) — this is the Cipher "research-terminal" tell and must be preserved on every new surface.
3. Headings never go above 24 px on Phase 16 surfaces. The Cipher report layout intentionally avoids hero typography — this is a research instrument, not a marketing page.
4. Line-height for the 11 px monospace caption is `1.4` (not 1.5) so dense horizon tables stay readable in a single screen-height.

---

## Color

Cipher's palette already encodes a 60 / 30 / 10 split. Phase 16 **does not introduce new colors** — it constrains how the existing palette communicates dual-signal agreement.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--color-surface` `#10141a` | Page background, default text canvas |
| Secondary surface (30%) | `--color-surface-container` `#1c2026` and `--color-surface-container-high` `#262a31` | All Phase 16 cards, the dual-class panel shell, horizon-table rows |
| Accent / brand (10%) | `--color-primary` `#b6c4ff` | Reserved per below |
| Positive / aligned | `--color-secondary` `#66d9cc` | Reserved per below |
| Engine-focus | `--color-tertiary` `#ffb95f` | Reserved per below |
| Destructive / opposed | `--color-error` `#ffb4ab` | Reserved per below |

**Accent reserved for** (explicit, never "all interactive elements"):

- `--color-primary` (Cipher blue)
  - The `30d★` row in the horizon table (primary horizon — driver of the logistic) gets a `text-primary` star and `border-l-2 border-primary` left rail
  - Active tab indicator on the new `/insights` tab strip
  - "Combined Logistic Score" headline value when present

- `--color-secondary` (teal)
  - `ALIGNED` agreement badge text + 1 px border
  - `ACTIVE` cell status text in pattern-library
  - Bullish RSI zone (RSI > 70 boundary marker line, NOT the gauge fill)
  - Volume-ratio bar fill when ratio > 1.5 (above-average volume)

- `--color-tertiary` (amber)
  - Engine-section eyebrow header (`ENGINE CALIBRATION`, matches existing usage)
  - `MIXED` agreement badge text + 1 px border
  - `EXPLORATORY` cell status (de-emphasized via `opacity-60` versus ACTIVE cells in pattern library)

- `--color-error` (red)
  - `OPPOSED` agreement badge text + 1 px border
  - Bearish RSI zone (RSI < 30 boundary marker line)
  - Volume-ratio bar fill when ratio < 0.5 (suspiciously low volume)
  - `DEPRECATED` cell status

- `--color-outline` / `--color-outline-variant` (neutrals)
  - `UNKNOWN` agreement badge — agreement cannot be computed (degraded mode, e.g. old report with no `horizon_calibrations`)
  - All gauge / chart axis lines, tick marks, dividers
  - `NO_DATA` and inactive horizon-row text

**Forbidden:**
- Do not use `bg-secondary` or `bg-error` as a fill on cards larger than 32 px tall — the panel already uses `bg-secondary/5` and `bg-error/5` for low-saturation tinted alignment blocks; preserve this convention.
- Do not introduce new hex values. Every Phase 16 element resolves to a CSS variable already in `@theme`.
- Do not encode bullishness in green-vs-red on RSI itself — the gauge value is shown numerically; the zones are merely annotated. (Color-blind safety: the agreement badge text label is the primary signal, color is reinforcement.)

---

## Component Inventory

This is the prescriptive list of every visual element Phase 16 introduces or modifies. Executor implements each exactly; checker validates each against this list.

### A. `EngineCalibrationPanel.tsx` — extended (NOT a new component)

The existing panel grows in place. Backwards compat: when `horizon_calibrations` is absent (old persisted reports) the panel renders the diffusion-only legacy view exactly as today.

**Layout, top to bottom inside the existing `<section>`:**

1. **Header row** (UNCHANGED): `psychology` icon + `ENGINE CALIBRATION` eyebrow on the left; `Cycle N · Xm ago` on the right.

2. **Dual-class column header** (NEW). Two-column flex, 24 px gap, separated by a 1 px vertical divider in `border-outline-variant/30`.
   - Left column eyebrow: `DIFFUSION` (`text-[10px] tracking-widest text-on-surface-variant`)
   - Right column eyebrow: `TECHNICAL`
   - Centered between them: the **Agreement Badge** (see C below). Positioned via flex centering, never absolute.

3. **Pattern × cap class row, twice** (one per column). Reuses the existing "Pattern detected" pill pattern. Diffusion side: existing flow_pattern × cap label. Technical side: tech_pattern (mapped to label) × cap. STATUS badge per column.

4. **Three-card metric grid, twice** (one per column). Existing `MetricCard` is reused unchanged. Diffusion column: Engine Prior / Logistic Score / Adversarial Null. Technical column: Tech Prior / [empty slot — see note] / Tech Adversarial Null. The middle slot of the technical column is reserved for future "Combined 12-d Logistic Score" when present; if absent, render an empty placeholder card with `text-on-surface-variant` "—" and `subValue: 30d-trained, n=N` explanation. **Do not collapse the grid** — visual symmetry between columns is the trust signal.

5. **Horizon Table** (NEW). Full-width table beneath both columns, separated by `pt-4 mt-4 border-t border-surface-container-high`.

   - 5 rows: `7d`, `14d`, `30d★`, `60d`, `90d`. (3d is omitted from the table — too noisy for thesis horizons; backend still stores it.)
   - 6 columns: `HORIZON | DIFFUSION POST. | DIFFUSION CI | TECHNICAL POST. | TECHNICAL CI | N · STATUS`
   - Header row: 10 px uppercase eyebrow, `text-on-surface-variant`, `bg-surface-container-low`
   - Data rows: 11 px JetBrains Mono, `bg-surface-container-high`
   - The `30d★` row is the **primary horizon** — render with:
     - Star prefix (`★`) in `text-primary`
     - `border-l-2 border-primary` on the row's left edge (extends 2 px beyond row padding)
     - `bg-primary/5` row tint
     - The N · STATUS column shows the cell status badge for whichever cell drove the logistic
   - When a horizon cell is `NO_DATA`: render `—` in `text-on-surface-variant` for posterior and CI; show `n=0 · NO DATA` in the status column
   - When a horizon cell is `EXPLORATORY`: posterior renders normally but at `opacity-60`; status column shows the `EXPLORATORY` badge (existing tertiary tint)

6. **Drift gauge** (UNCHANGED — diffusion only). Continues to render below the horizon table. Phase 16 does NOT add a technical drift gauge in v1; that lands in v2 if drift becomes interesting.

7. **Alignment / disagreement prose blocks** (EXTENDED).
   - Existing `engine_alignment` / `engine_disagreement` blocks render in their existing colors (secondary green for aligned, error red for disagreement).
   - NEW: `technical_alignment` / `technical_disagreement` blocks render directly beneath, using identical visual treatment (left rail, eyebrow, prose).
   - When both diffusion and technical agree: only `engine_alignment` renders, label updated to "Dual-Class Engine Alignment".
   - When they disagree: BOTH `engine_alignment` and `technical_disagreement` may render simultaneously — this is a feature, not a bug. The reader sees "diffusion says X, technical says ¬X" explicitly.

8. **Footer note** (REPLACED).
   - Old: "This prediction will be auto-verified at 3, 7, and 14 days."
   - New: "↳ This prediction will be auto-verified at 3, 7, 14, 30, 60, and 90 days. The engine's posterior updates online — re-running this report after the next learning cycle may show different numbers. **30 days is the primary horizon.**"

**Degraded-mode rendering rule:** if `horizon_calibrations` is absent OR length < 1, skip steps 2, 4-right-column, and 5; render the panel as it does today (diffusion-only, single column). The dual-class layout never partially renders.

### B. `ResearchReport.tsx` — Technical Signals card (NEW)

Insert this card into the existing report flow, immediately **after** the Sentiment Intelligence section and **before** the Engine Calibration panel. This adjacency teaches the reader: "here are the technical readings → here is what the engine has learned about them".

**Card shell:** `bg-surface-container border border-surface-container-high p-6 rounded-lg` — exact match to other report cards.

**Card header:** `show_chart` Material icon (Cipher blue `text-primary`) + heading `TECHNICAL SIGNALS` (10 px uppercase eyebrow, tracking-widest). Right side: data-source attribution `via Yahoo · {bar_count} daily bars` (10 px mono, `text-on-surface-variant`). When `bar_count < 200`: render the entire card with `opacity-50` and a centered `INSUFFICIENT DATA — need 200+ bars for SMA(200)` message instead of indicators.

**Body grid:** 4 columns on desktop (`grid-cols-2 md:grid-cols-4 gap-4`).

1. **RSI(14) gauge.**
   - Eyebrow: `RSI(14)`
   - Value: 24 px JetBrains Mono, color `text-on-surface` (always neutral — the zones provide context, the value does not)
   - Below value: a horizontal segmented bar, 10 segments × 4 px tall, spanning the card width
   - Segments below 30: tinted `bg-error/30` background with the RSI position marked by a 2 px vertical line in `text-error`
   - Segments above 70: tinted `bg-secondary/30` with marker in `text-secondary`
   - Segments 30–70: neutral `bg-surface-container-highest`, marker in `text-on-surface`
   - Subtext (11 px mono): `30 ─── 70` aligned beneath the bar (boundary annotations)
   - Tooltip: "RSI(14): 14-day Relative Strength Index. <30 = oversold, >70 = overbought."

2. **MACD direction.**
   - Eyebrow: `MACD`
   - Top line: arrow icon (`trending_up` `text-secondary` if histogram > 0; `trending_down` `text-error` if histogram < 0; `trending_flat` `text-on-surface-variant` if within ±0.05) followed by 11 px mono histogram value (signed: `+0.42` / `-0.18`)
   - Bottom line (11 px mono, `text-on-surface-variant`): `line: {macd_line} · sig: {macd_signal}` — both 2-decimal precision
   - Tooltip: "MACD(12,26,9). Positive histogram = MACD line above signal line (bullish momentum). Negative = bearish momentum."

3. **Moving-Average stack.**
   - Eyebrow: `MA STACK`
   - A vertical 3-row stack visualizing price relative to SMA50 and SMA200. Each row is a labeled tick on a vertical axis, ordered by value:
     - Highest → lowest: 11 px mono labels `PRICE`, `SMA50`, `SMA200`, in their actual price order (e.g. if price > SMA50 > SMA200 — bullish stack — that's the order top-to-bottom)
     - Each tick is a 2 px tall horizontal bar (`w-12`) colored by row identity: PRICE in `text-on-surface`, SMA50 in `text-primary`, SMA200 in `text-tertiary`
     - To the right of each tick: the value (11 px mono, JetBrains)
   - Bottom subtext (10 px eyebrow): one of `BULLISH STACK`, `BEARISH STACK`, `MIXED` — derived from the row order
   - Tooltip: "Price > SMA50 > SMA200 = bullish trend regime. Reverse = bearish. Mixed = transitional."

4. **Volume ratio.**
   - Eyebrow: `VOLUME RATIO`
   - Value: 24 px JetBrains Mono with explicit `×` suffix in `text-on-surface-variant` — e.g. `1.8×` (read aloud: "one-point-eight times average")
   - Below value: a horizontal bar, 100% wide. The bar fills from the center anchored at 1.0× (the "neutral" volume level). Fill direction:
     - Ratio > 1.0: fill rightward, fill color `bg-secondary` (above-average volume), max-out at 3.0×
     - Ratio < 1.0: fill leftward from center, fill color `bg-error/60` (below-average), max-out at 0.0×
     - Center anchor: 2 px vertical divider in `text-outline`
   - Subtext (10 px mono): `vs 20-day avg`
   - Tooltip: "Today's volume / 20-day average volume. Confirming volume on a breakout = >1.5×. <0.5× on a price move is suspicious."

**Card footer (full width, separator `border-t border-surface-container-high pt-4 mt-4`):**

- The **TechPattern label**, large (16 px Inter bold) on the left: e.g. `BREAKOUT UPTREND`, `OVERBOUGHT UPTREND`, etc. (uppercase, tracking-widest)
- One-line explanation on the right (12 px Inter regular, `text-on-surface-variant`): humanized for each of 8 buckets — see Copywriting Contract below

### C. Agreement Badge (NEW shared element)

A small pill-shape rendered in `EngineCalibrationPanel`'s dual-column header AND optionally in a hover-tooltip on the Technical Signals card.

**Visual:**
- Shape: rounded-full pill, `px-3 py-1`
- Border: 1 px, color matches text
- Text: 10 px Inter, `font-black` (900), `tracking-widest`, uppercase
- Optional leading icon (Material Symbols, 12 px): `check_circle` for ALIGNED, `compare_arrows` for MIXED, `error` for OPPOSED, `help` for UNKNOWN

**4 states:**

| State | Text | Border / Text Color | Background | Tooltip |
|-------|------|--------------------|-----------:|---------|
| ALIGNED | `ALIGNED` | `text-secondary border-secondary/40` | `bg-secondary/10` | "Diffusion and technical priors agree on direction at 30d. Conviction compounds." |
| MIXED | `MIXED` | `text-tertiary border-tertiary/40` | `bg-tertiary/10` | "Signal classes lean the same direction but differ in magnitude. Read both columns." |
| OPPOSED | `OPPOSED` | `text-error border-error/40` | `bg-error/10` | "Diffusion and technical priors point opposite directions at 30d. This is intentional surfacing — read engine_alignment AND technical_disagreement." |
| UNKNOWN | `UNKNOWN` | `text-outline border-outline-variant` | `bg-surface-container-highest` | "Engine has insufficient data on one or both signal classes. Treat the calibration block as exploratory." |

### D. `/insights` — Tab Strip (extended)

The existing `InsightsDashboard` becomes the "Diffusion" world. Phase 16 adds a tab strip at the top of `InsightsDashboard` with 4 tabs:

| Tab | Position | Status |
|-----|----------|--------|
| Diffusion Library | 1st (default) | EXISTING — current pattern library lives here |
| Live Diffusion Map | 2nd | EXISTING — current live map |
| **Technical Pattern Library** | 3rd | NEW (Phase 16) |
| **Horizon Brier** | 4th | NEW (Phase 16) |

**Tab strip visual:**
- Sticky to top (`sticky top-[44px]` — sits flush against existing 44 px navbar)
- Background: `bg-surface-container/95 backdrop-blur` (slightly translucent for the dot-grid backdrop)
- Tabs as horizontal flex, 32 px gap (`gap-8`), `px-6 py-3`
- Inactive tab: 11 px Inter uppercase `tracking-widest`, `text-on-surface-variant`, hover `text-on-surface`
- Active tab: same, but `text-on-surface` plus a 2 px `bg-primary` underline (`border-b-2 border-primary`) extending the full label width plus 4 px on each side
- The two NEW tabs render with a small `· NEW` 9 px label in `text-primary` to their right for the first 30 days post-launch (controlled via a `data-new-until` attribute to make removal trivial)

### E. `/insights` — Technical Pattern Library tab (NEW)

Mirrors the existing diffusion Pattern Library exactly in pattern, never in pixel. Reuse helpers and styling from the existing pattern-library renderer.

**Layout:**

- A 3D grid surfaced as a tabbed sub-view: 8 patterns × 4 cap classes × 6 horizons = 192 cells
- Top sub-control: a **horizon selector** — segmented control with 6 buttons (`3d / 7d / 14d / 30d★ / 60d / 90d`), default selected `30d★`. Active button: `bg-primary text-on-primary rounded`. Buttons render in JetBrains Mono.
- Below the horizon selector: an **8 × 4 grid** (rows = TechPatterns, columns = cap classes). Identical visual structure to existing diffusion pattern-library cells.
- Cell content (per cell):
  - Top-left eyebrow: `posterior_mean` as percent (e.g. `61%`), 16 px JetBrains bold
  - Below: `[ci_low%–ci_high%]` 11 px mono `text-on-surface-variant`
  - Bottom-left: `n=N` 10 px mono
  - Bottom-right: status badge (ACTIVE / EXPLORATORY / DEPRECATED / NO_DATA) reusing existing badge styles
  - **EXPLORATORY cells render with `opacity-60` AND a 1 px dashed border** — visually de-emphasized vs ACTIVE cells which use a 1 px solid `border-secondary/30` border. NO_DATA cells render at `opacity-30` with `text-outline` em-dashes.
- Empty rows / columns (e.g. small_cap × death_cross has no data yet): render as a single thin placeholder cell with `NO DATA` centered, never collapse the grid layout.

**Header strip above grid:** "Technical Pattern Library — {selectedHorizon} horizon" (16 px Inter bold) + brief subtitle "Bayesian posterior P(alpha vs SPY > 1%) per (technical pattern × cap class). 30d is the primary horizon for the engine logistic." (12 px Inter `text-on-surface-variant`).

### F. `/insights` — Horizon Brier tab (NEW)

A single chart canvas plus a legend. Tests the multi-horizon thesis ("does prediction quality decay with horizon?").

**Chart:**
- X-axis: 6 horizon values (`3 7 14 30 60 90`), evenly spaced, JetBrains 11 px mono ticks. The `30` tick gets a `★` superscript and `text-primary` color
- Y-axis: Brier score (`0.0` at top, `0.5` at bottom — lower is better; chart is "inverted" so a downward line means quality DECAYS with horizon, an upward line means quality IMPROVES). Y-tick labels JetBrains 11 px mono
- One line per ACTIVE TechPattern (max 8 lines). Each line:
  - 1.5 px stroke
  - Color: cycle through Cipher's tonal accents in this order: `secondary`, `primary`, `tertiary`, `secondary` lighter, `primary` lighter, etc. (Phase 16 launches with at most 4–5 ACTIVE patterns; the palette has headroom.)
  - Line is rendered only across horizons where `status === 'ACTIVE'` for that pattern. Where status is EXPLORATORY/NO_DATA the line dashes (`stroke-dasharray: 4 4`) at `opacity-50`.
- Adversarial null reference: a single dashed horizontal line at `brier_null` for context, in `text-outline`, labeled `null baseline` at the right edge

**Legend (right side, vertical):**
- One row per visible TechPattern: a 12 px color swatch + the pattern label (11 px Inter, `tracking-widest`) + sample size (10 px JetBrains Mono in `text-on-surface-variant`)
- Hovering a legend row highlights its line and dims others to `opacity-30` (interaction is optional for v1; if not implemented, legend is pure read-only)

**Empty state:** if no pattern has `status === 'ACTIVE'` at any horizon yet, render the chart axes plus a centered message:

```
No ACTIVE technical patterns yet.
Engine needs ~30–60 days of post-Phase-16 data to mark cells ACTIVE.
Until then, the diffusion library is the primary signal.
```

### G. Loading / Error / Skeleton states

Phase 16 surfaces inherit the existing patterns from `InsightsDashboard`:

- **Loading**: a centered card with a `text-[10px] tracking-[0.4em] text-outline uppercase font-mono` eyebrow ("Loading technical pattern library…") and an animate-pulse caption. Match the `Initializing Research Layer` block at line 150 of `InsightsDashboard.tsx`.
- **Error**: a `border-error/30 bg-error/5 p-6 text-error text-sm font-mono` block with the literal error message.
- **Per-cell loading** (rare — cells should arrive whole from `/api/insights`): use the existing skeleton shimmer if introduced; otherwise render the cell as NO_DATA.

---

## Copywriting Contract

Phase 16 introduces several new strings. Every string is locked here — executor copies verbatim.

### Eyebrows / labels

| Element | Copy |
|---------|------|
| Dual-class column header (left) | `DIFFUSION` |
| Dual-class column header (right) | `TECHNICAL` |
| Horizon table header — horizon | `HORIZON` |
| Horizon table header — diffusion posterior | `DIFFUSION POST.` |
| Horizon table header — diffusion CI | `DIFFUSION CI` |
| Horizon table header — technical posterior | `TECHNICAL POST.` |
| Horizon table header — technical CI | `TECHNICAL CI` |
| Horizon table header — sample / status | `N · STATUS` |
| Horizon table primary-row marker | `30d★` |
| Technical Signals card heading | `TECHNICAL SIGNALS` |
| Technical Signals data-source line | `via Yahoo · {bar_count} daily bars` |
| RSI eyebrow | `RSI(14)` |
| MACD eyebrow | `MACD` |
| MA Stack eyebrow | `MA STACK` |
| Volume Ratio eyebrow | `VOLUME RATIO` |
| MA stack regime — bullish | `BULLISH STACK` |
| MA stack regime — bearish | `BEARISH STACK` |
| MA stack regime — mixed | `MIXED` |
| Volume subtext | `vs 20-day avg` |
| Tab — Technical Pattern Library | `Technical Pattern Library` |
| Tab — Horizon Brier | `Horizon Brier` |
| New-tab marker | `· NEW` |

### TechPattern labels (8 buckets — verbatim)

| Internal key | Display label | One-line explainer (renders right of label in card footer) |
|--------------|---------------|------------------------------------------------------------|
| `breakout_uptrend` | `BREAKOUT UPTREND` | Price punching through resistance with confirming volume. |
| `overbought_uptrend` | `OVERBOUGHT UPTREND` | Trend intact but RSI elevated — reversal risk rising. |
| `pullback_in_uptrend` | `PULLBACK IN UPTREND` | Healthy retracement in a longer-term uptrend. |
| `consolidation` | `CONSOLIDATION` | Price compressing in a range; awaiting catalyst. |
| `breakdown` | `BREAKDOWN` | Price falling through support with confirming volume. |
| `oversold_downtrend` | `OVERSOLD DOWNTREND` | Trend intact but RSI depressed — bounce risk rising. |
| `death_cross` | `DEATH CROSS` | SMA50 just crossed below SMA200 — long-term momentum flip. |
| `golden_cross` | `GOLDEN CROSS` | SMA50 just crossed above SMA200 — long-term momentum flip. |

### Agreement badge tooltips (verbatim — see component C above)

| Badge | Tooltip |
|-------|---------|
| ALIGNED | "Diffusion and technical priors agree on direction at 30d. Conviction compounds." |
| MIXED | "Signal classes lean the same direction but differ in magnitude. Read both columns." |
| OPPOSED | "Diffusion and technical priors point opposite directions at 30d. This is intentional surfacing — read engine_alignment AND technical_disagreement." |
| UNKNOWN | "Engine has insufficient data on one or both signal classes. Treat the calibration block as exploratory." |

### Empty / degraded states

| Element | Copy |
|---------|------|
| Tech card insufficient bars | `INSUFFICIENT DATA — need 200+ bars for SMA(200)` |
| Tech card no Yahoo response | `No technical data available — Yahoo Finance returned no daily bars for this ticker.` |
| Horizon table NO_DATA cell | `—` (em-dash; never empty string) |
| Horizon Brier — no ACTIVE | (see component F above; full string locked) |
| Pattern Library — no data in cell | `NO DATA` (10 px mono, centered) |
| Pattern Library — first-30-days notice (top of tab) | `Technical priors mature in ~30–60 days post-launch. Most cells will read EXPLORATORY until then — that is the engine learning, not a bug.` |

### Updated existing strings

| Element | Old | New |
|---------|-----|-----|
| EngineCalibrationPanel footer note | "↳ This prediction will be auto-verified at 3, 7, and 14 days. The engine's posterior updates online — re-running this report after the next learning cycle may show different numbers." | "↳ This prediction will be auto-verified at 3, 7, 14, 30, 60, and 90 days. The engine's posterior updates online — re-running this report after the next learning cycle may show different numbers. **30 days is the primary horizon.**" |
| EngineCalibrationPanel "Engine Alignment" label (when both signal classes agree) | `Engine Alignment` | `Dual-Class Engine Alignment` |

### Required CTAs / interactions

Phase 16 surfaces are **read-only research displays**. There are NO destructive actions, NO write CTAs, NO confirmations.

| Element | Copy |
|---------|------|
| Primary CTA | not applicable — Phase 16 introduces no buttons |
| Empty state heading | "No ACTIVE technical patterns yet." |
| Empty state body | "Engine needs ~30–60 days of post-Phase-16 data to mark cells ACTIVE. Until then, the diffusion library is the primary signal." |
| Error state | "Failed to load technical insights — {error}. Try refreshing." |
| Destructive confirmation | not applicable |

---

## Interaction Contract

| Surface | Interaction | Behavior |
|---------|-------------|----------|
| Horizon table primary row (`30d★`) | hover | tooltip "Primary horizon — drives the 12-feature Bayesian logistic and the engine's headline conviction." |
| Agreement badge | hover | tooltip per state (locked above) |
| Tech card RSI gauge | hover | tooltip "RSI(14): 14-day Relative Strength Index. <30 = oversold, >70 = overbought." |
| Tech card MACD | hover | tooltip "MACD(12,26,9). Positive histogram = bullish momentum. Negative = bearish momentum." |
| Tech card MA stack | hover | tooltip "Price > SMA50 > SMA200 = bullish trend regime. Reverse = bearish. Mixed = transitional." |
| Tech card Volume ratio | hover | tooltip "Today's volume / 20-day average. Confirming volume on a breakout = >1.5×. <0.5× on a price move is suspicious." |
| `/insights` tabs | click | swap tab content; update URL hash to `#technical-library` / `#horizon-brier` so links are shareable |
| `/insights` tabs | keyboard | left/right arrow navigate, Enter activates — match existing `role="tab"` semantics (or introduce them if absent) |
| Horizon selector inside Technical Pattern Library | click | swap visible cell layer; default `30d★`; selection persists in URL query `?h=30` so refresh keeps state |
| Horizon Brier legend row | hover (optional v1) | dim other lines to `opacity-30`; if not implemented, legend is read-only |

**Animations:** all new elements honor existing `fade-in-d{1..6}` utility classes from `globals.css`. The horizon table rows fade in with a 60 ms stagger top-to-bottom (use `fade-in-d1` through `fade-in-d5`). The pattern-library grid uses no entrance animation — too many cells, too distracting.

**Print styles:** Phase 16 surfaces inherit the existing `@media print` rules. Specifically:
- Tab strip must include `print:hidden`
- Pattern Library and Horizon Brier are NOT included in PDF exports (they're operational dashboards, not reports)
- The Technical Signals card and the dual-class EngineCalibrationPanel ARE included in PDF — they're report content. The horizon table specifically must render legibly in monochrome (no color-only signal — the `★` marker and uppercase status text carry the meaning).

**Responsive:** all Phase 16 surfaces are desktop-first (this matches Cipher's "research terminal" positioning — mobile is out of scope for v1).

- ≥ 1024 px (`lg:`): full layouts as specified
- 768–1023 px (`md:`): EngineCalibrationPanel collapses dual-class columns to vertical stack (DIFFUSION above TECHNICAL); horizon table scrolls horizontally inside its card; pattern library grid becomes 2 columns of cells
- < 768 px: components remain functional but visual density drops; horizon table still scrollable; tabs become a select dropdown

---

## Accessibility

- Color contrast: all 11 px JetBrains text on `bg-surface-container-high` (`#262a31`) must meet WCAG AA (4.5:1) — verified against `--color-on-surface` (`#dfe2eb`, ratio ~12:1) ✓ and `--color-on-surface-variant` (`#c3c5d8`, ratio ~9:1) ✓. Status badge text colors verified at the existing `bg-{token}/20` opacity levels (existing project convention).
- The agreement badge state must be **redundantly encoded**: text label + color + (optional) icon. A user reading in monochrome (print) can still tell ALIGNED from OPPOSED from the word.
- Tab strip: `role="tablist"`, each tab `role="tab"` with `aria-selected` and `aria-controls`. Tab panel `role="tabpanel"` with `aria-labelledby`.
- Horizon table: native `<table>` with `<thead>` / `<tbody>` / scope-attributed `<th>` cells. The primary-row star is `aria-label="primary horizon"` to avoid screen-reader confusion.
- All Material Symbols are decorative (`aria-hidden="true"`); their semantic meaning is duplicated by adjacent text.
- Tooltips must be reachable via keyboard focus, not hover-only. Use `<button>` or `<span tabIndex={0}>` with appropriate ARIA attributes for the gauge legends.

---

## Registry Safety

Phase 16 introduces NO new third-party UI components. All elements are bespoke, composed from existing Cipher tokens and primitives.

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not applicable — Cipher does not use shadcn |
| Third-party | none | not applicable |
| `technicalindicators@3.1.0` | n/a — math-only, headless library | not a UI component; safety vetted in 16-RESEARCH.md §3 |
| Material Symbols Outlined | `psychology`, `check_circle`, `error`, `show_chart`, `bar_chart`, `compare_arrows`, `query_stats`, `trending_up`, `trending_down`, `trending_flat`, `help` | already loaded by NavBar; no new font fetches |

---

## Pre-Population Sources

| Field | Source | Confidence |
|-------|--------|------------|
| Color palette, surface tokens, typography stack | `src/app/globals.css` `@theme` block | LOCKED — do not redefine |
| Card pattern (rounded-lg + bg-surface-container + border + p-6) | existing `EngineCalibrationPanel.tsx` and report cards | LOCKED |
| Eyebrow style (10 px tracking-widest uppercase) | existing project convention across NavBar, EngineCalibrationPanel, InsightsDashboard | LOCKED |
| Status badge styles (ACTIVE / EXPLORATORY / DEPRECATED / NO_DATA) | `STATUS_BADGE` map in `EngineCalibrationPanel.tsx` lines 16-21 | LOCKED — reuse exact classes |
| TechPattern bucket count = 8 + names | 16-CONTEXT.md "Locked Decisions" | LOCKED |
| Horizon set `[3, 7, 14, 30, 60, 90]` + 30d primary | 16-CONTEXT.md "Locked Decisions" | LOCKED |
| Agreement label set `aligned/mixed/opposed/unknown` | 16-CONTEXT.md UI section + 16-RESEARCH.md `EngineContext` interface | LOCKED |
| 4-tab structure on `/insights` | additional_context block + existing `InsightsDashboard` | LOCKED |
| RSI gauge / MACD direction / MA stack / volume ratio (4 elements) | additional_context block ("Technical Signals card") | LOCKED |
| TechPattern label copy + explainers | Claude's discretion (within Cipher voice) | NEW — drafted here |
| Agreement badge tooltip copy | Claude's discretion (within Cipher voice) | NEW — drafted here |
| Tab `· NEW` marker (30-day temporary) | Claude's discretion | NEW — drafted here |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
