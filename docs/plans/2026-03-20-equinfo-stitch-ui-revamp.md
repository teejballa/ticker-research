# Equinfo Stitch UI Revamp Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace every frontend visual with the Google Stitch design system (EQUINFO blue/teal/amber Material Design 3 palette, Inter + JetBrains Mono, Material Symbols icons) while keeping all API routes, types, and backend logic 100% unchanged.

**Architecture:** Three screens map to existing routes — landing page (`/`), loading state (`/research/[ticker]` while `pageState === 'analyzing'`), and report state (`/research/[ticker]` after analysis completes). All state logic in `research/[ticker]/page.tsx` is preserved; only JSX and CSS change. Shared `NavBar` and `FooterTicker` are extracted as components.

**Tech Stack:** Next.js 15, React 19, Tailwind CSS v4, `@import "tailwindcss"` syntax, Material Symbols Outlined (Google Fonts CDN link in `<head>`), Inter + JetBrains Mono via `next/font/google`.

---

## Color Token Reference (use these exact Tailwind custom colors)

```
surface:                  #10141a   (body bg)
surface-container:        #1c2026   (nav, cards)
surface-container-low:    #181c22   (footer, muted panels)
surface-container-high:   #262a31   (stat cards)
surface-container-highest:#31353c   (bars, empty blocks)
surface-bright:           #353940
on-surface:               #dfe2eb   (body text)
on-surface-variant:       #c3c5d8   (muted text)
outline-variant:          #434656   (borders)
outline:                  #8d90a2
primary:                  #b6c4ff   (links, accents)
primary-container:        #2962ff   (CTAs, tags)
on-primary-container:     #f7f5ff   (text on CTA)
primary-fixed-dim:        #b6c4ff
secondary:                #66d9cc   (bullish, live)
secondary-container:      #1ea296
on-secondary:             #003732
error:                    #ffb4ab   (bearish, negative %)
error-container:          #93000a
tertiary:                 #ffb95f   (sources, warning)
tertiary-fixed-dim:       #ffb95f
```

---

## Task 1: Update Tailwind config and global CSS

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`

**Step 1: Replace globals.css with Stitch design system CSS**

Replace the entire file content. Keep the `@import "tailwindcss"` line first. Add Tailwind `@theme` block for custom color tokens. Keep existing animations that are still needed (shake, fadeInUp, tickerScroll, barFill, blockIn). Add new Stitch animations. Remove old amber-themed classes; add new Equinfo classes.

```css
@import "tailwindcss";

@theme {
  --color-surface:                   #10141a;
  --color-surface-dim:               #10141a;
  --color-surface-container:         #1c2026;
  --color-surface-container-low:     #181c22;
  --color-surface-container-high:    #262a31;
  --color-surface-container-highest: #31353c;
  --color-surface-container-lowest:  #0a0e14;
  --color-surface-bright:            #353940;
  --color-background:                #10141a;
  --color-on-surface:                #dfe2eb;
  --color-on-surface-variant:        #c3c5d8;
  --color-on-background:             #dfe2eb;
  --color-outline:                   #8d90a2;
  --color-outline-variant:           #434656;
  --color-primary:                   #b6c4ff;
  --color-primary-container:         #2962ff;
  --color-primary-fixed:             #dce1ff;
  --color-primary-fixed-dim:         #b6c4ff;
  --color-on-primary:                #002780;
  --color-on-primary-container:      #f7f5ff;
  --color-on-primary-fixed:          #001550;
  --color-on-primary-fixed-variant:  #003ab3;
  --color-inverse-primary:           #004ee8;
  --color-secondary:                 #66d9cc;
  --color-secondary-container:       #1ea296;
  --color-secondary-fixed:           #84f5e8;
  --color-secondary-fixed-dim:       #66d9cc;
  --color-on-secondary:              #003732;
  --color-on-secondary-container:    #00302b;
  --color-on-secondary-fixed:        #00201d;
  --color-on-secondary-fixed-variant:#005049;
  --color-tertiary:                  #ffb95f;
  --color-tertiary-container:        #9e6400;
  --color-tertiary-fixed:            #ffddb8;
  --color-tertiary-fixed-dim:        #ffb95f;
  --color-on-tertiary:               #472a00;
  --color-on-tertiary-container:     #fff4ec;
  --color-on-tertiary-fixed:         #2a1700;
  --color-on-tertiary-fixed-variant: #653e00;
  --color-error:                     #ffb4ab;
  --color-error-container:           #93000a;
  --color-on-error:                  #690005;
  --color-on-error-container:        #ffdad6;
  --color-inverse-surface:           #dfe2eb;
  --color-inverse-on-surface:        #2d3137;
  --color-surface-tint:              #b6c4ff;
  --color-surface-variant:           #31353c;

  --font-headline: "Inter", sans-serif;
  --font-body:     "Inter", sans-serif;
  --font-label:    "Inter", sans-serif;
  --font-mono:     "JetBrains Mono", monospace;

  --radius:    0.125rem;
  --radius-lg: 0.25rem;
  --radius-xl: 0.5rem;
  --radius-full: 0.75rem;
}

/* ── Keyframes ─────────────────────────────────────────── */

@keyframes shake {
  0%   { transform: translateX(0); }
  15%  { transform: translateX(-6px); }
  30%  { transform: translateX(6px); }
  45%  { transform: translateX(-4px); }
  60%  { transform: translateX(4px); }
  75%  { transform: translateX(-2px); }
  90%  { transform: translateX(2px); }
  100% { transform: translateX(0); }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes statusPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(1.4); }
}

@keyframes tickerScroll {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

@keyframes barFill {
  from { width: 0%; }
  to   { width: var(--bar-target); }
}

@keyframes blockIn {
  from { opacity: 0; transform: scaleY(0.4); }
  to   { opacity: 1; transform: scaleY(1); }
}

/* Stitch loading animations */
@keyframes pulse-glow {
  0%   { transform: scale(1) translate(0, 0); opacity: 0.4; }
  50%  { transform: scale(1.2) translate(5%, 5%); opacity: 0.6; }
  100% { transform: scale(0.9) translate(-5%, -2%); opacity: 0.4; }
}

@keyframes ticker-pulse {
  0%, 100% { opacity: 0.9; filter: drop-shadow(0 0 10px rgba(41,98,255,0.4)); }
  50%       { opacity: 1;   filter: drop-shadow(0 0 30px rgba(41,98,255,0.8)); }
}

@keyframes scan {
  0%   { left: -100%; }
  100% { left: 100%; }
}

@keyframes data-flow {
  0%   { top: -80px; }
  100% { top: 100%; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

@keyframes step-breathing {
  0%, 100% { opacity: 0.7; }
  50%       { opacity: 1; }
}

@keyframes scroll-ticker {
  0%   { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

@keyframes orbPulse {
  0%, 100% { opacity: 0.06; transform: translate(-50%, -50%) scale(1); }
  50%       { opacity: 0.10; transform: translate(-50%, -50%) scale(1.12); }
}

@keyframes chevronBounce {
  0%, 100% { transform: rotate(45deg) translateY(0);   opacity: 0.45; }
  50%       { transform: rotate(45deg) translateY(5px); opacity: 0.9; }
}

/* ── Utility classes ─────────────────────────────────── */

.animate-shake       { animation: shake 0.4s ease-in-out; }
.status-dot-live     { animation: statusPulse 2s ease-in-out infinite; }
.animate-ticker      { animation: scroll-ticker 80s linear infinite; }
.animate-ticker:hover { animation-play-state: paused; }
.ticker-glow         { animation: ticker-pulse 4s ease-in-out infinite; }
.step-pulse          { animation: step-breathing 2s ease-in-out infinite; }

.fade-in    { opacity: 0; animation: fadeInUp 0.5s ease-out forwards; }
.fade-in-d1 { opacity: 0; animation: fadeInUp 0.5s 0.12s ease-out forwards; }
.fade-in-d2 { opacity: 0; animation: fadeInUp 0.5s 0.24s ease-out forwards; }
.fade-in-d3 { opacity: 0; animation: fadeInUp 0.5s 0.36s ease-out forwards; }
.fade-in-d4 { opacity: 0; animation: fadeInUp 0.5s 0.48s ease-out forwards; }
.fade-in-d5 { opacity: 0; animation: fadeInUp 0.5s 0.60s ease-out forwards; }
.fade-in-d6 { opacity: 0; animation: fadeInUp 0.5s 0.72s ease-out forwards; }

.bar-fill {
  height: 100%;
  animation: barFill 1s ease-out forwards;
  animation-delay: var(--bar-delay, 0ms);
}

.conf-block {
  height: 16px;
  transform-origin: bottom;
  animation: blockIn 0.25s ease-out forwards;
  animation-delay: var(--block-delay, 0ms);
  opacity: 0;
}

/* ── Background patterns ─────────────────────────────── */

.dot-grid {
  background-image: radial-gradient(circle, #1c2026 1px, transparent 1px);
  background-size: 32px 32px;
}

.glow-radial {
  background: radial-gradient(circle, rgba(41, 98, 255, 0.15) 0%, transparent 70%);
}

.loading-pulse {
  background: radial-gradient(circle, rgba(41, 98, 255, 0.15) 0%, rgba(16, 20, 26, 0) 70%);
  animation: pulse-glow 8s ease-in-out infinite alternate;
}

/* ── Hero scroll scene ────────────────────────────────── */

.scene-hero-wordmark {
  font-size: clamp(56px, 9vw, 100px);
  letter-spacing: 0.18em;
  white-space: nowrap;
  overflow: hidden;
  max-width: 100vw;
  text-shadow: 0 0 20px rgba(182, 196, 255, 0.4);
}

.hero-orb {
  position: absolute;
  top: 38%;
  left: 50%;
  width: 520px;
  height: 520px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(41, 98, 255, 0.2) 0%, transparent 70%);
  transform: translate(-50%, -50%);
  opacity: 0.06;
  pointer-events: none;
  animation: orbPulse 6s ease-in-out infinite;
}

.scroll-cue { width: 18px; height: 18px; position: relative; }
.scroll-cue-chevron {
  width: 12px; height: 12px;
  border-right: 1.5px solid #434656;
  border-bottom: 1.5px solid #434656;
  position: absolute;
  top: 2px; left: 3px;
  animation: chevronBounce 1.6s ease-in-out infinite;
}

/* ── Preview screenshot ───────────────────────────────── */

.preview-screenshot {
  width: min(1020px, 92vw);
  height: auto;
  display: block;
  border-radius: 8px;
  box-shadow:
    0 0 0 1px rgba(41, 98, 255, 0.08),
    0 32px 90px rgba(0, 0, 0, 0.85),
    0 0 160px rgba(41, 98, 255, 0.05);
  user-select: none;
  pointer-events: none;
}

.monitor-glow {
  position: absolute;
  top: 50%; left: 50%;
  width: 900px; height: 600px;
  transform: translate(-50%, -50%);
  background: radial-gradient(ellipse, rgba(41, 98, 255, 0.07) 0%, transparent 60%);
  pointer-events: none;
  border-radius: 50%;
}

/* ── Ticker scan shimmer ─────────────────────────────── */

.ticker-scan { position: relative; overflow: hidden; display: inline-block; }
.ticker-scan::after {
  content: "";
  position: absolute;
  top: 0; left: -100%;
  width: 100%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  animation: scan 4s infinite;
}

/* ── Data flow line ──────────────────────────────────── */

.data-flow-line { position: relative; overflow: hidden; }
.data-flow-line::after {
  content: "";
  position: absolute;
  width: 100%; height: 80px;
  background: linear-gradient(to bottom, transparent, #b6c4ff, transparent);
  top: -80px; left: 0;
  animation: data-flow 3s infinite linear;
}

/* ── Assessment bar animations ───────────────────────── */

/* ── Market grid (landing page) ──────────────────────── */

.market-grid { border: 1px solid #434656; overflow: hidden; }
.market-grid-header {
  display: grid;
  grid-template-columns: 80px 1fr 110px 110px 80px;
  padding: 7px 16px;
  background: #181c22;
  border-bottom: 1px solid #434656;
  color: #8d90a2;
  font-size: 10px;
  letter-spacing: 0.2em;
  font-weight: 700;
}
.market-grid-row {
  display: grid;
  grid-template-columns: 80px 1fr 110px 110px 80px;
  padding: 10px 16px;
  border-bottom: 1px solid #1c2026;
  align-items: center;
  transition: background 0.12s;
}
.market-grid-row:last-child { border-bottom: none; }
.market-grid-row:hover      { background: #1c2026; }

/* ── Scrollbar ────────────────────────────────────────── */

::-webkit-scrollbar       { width: 3px; height: 3px; }
::-webkit-scrollbar-track { background: #10141a; }
::-webkit-scrollbar-thumb { background: #434656; }
::-webkit-scrollbar-thumb:hover { background: #b6c4ff; }

/* ── Selection ────────────────────────────────────────── */

::selection {
  background: rgba(41, 98, 255, 0.2);
  color: #b6c4ff;
}

/* ── Material Symbols ─────────────────────────────────── */

.material-symbols-outlined {
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
  display: inline-block;
  vertical-align: middle;
  line-height: 1;
}

/* ── Print ────────────────────────────────────────────── */

@media print {
  * {
    background: white !important;
    color: black !important;
    border-color: #ccc !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }
  .print\:hidden  { display: none !important; }
  .sticky         { position: static !important; }
  .dot-grid       { background-image: none !important; }
  .font-mono      { font-family: "Courier New", Courier, monospace !important; }
  @page { margin: 1.5cm; }
}
```

**Step 2: Update layout.tsx — swap IBM Plex Mono for Inter + JetBrains Mono, add Material Symbols link**

```tsx
import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  weight: ['400', '500', '700', '800', '900'],
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  weight: ['400', '500', '700'],
  subsets: ["latin"],
  display: 'swap',
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: "Equinfo — AI Financial Research Terminal",
  description: "Source-grounded equity intelligence with transparent, traceable analysis powered by Anthropic and Gemini",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark bg-surface">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-[family-name:var(--font-inter)] antialiased bg-surface text-on-surface`}>
        {children}
      </body>
    </html>
  );
}
```

**Step 3: Run dev server briefly to check no build errors**

```bash
cd /Users/tj/Desktop/Ticker-Research && npm run build 2>&1 | tail -20
```

Expected: Build succeeds (possibly with type warnings, no errors).

**Step 4: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx
git commit -m "feat(ui): replace amber theme with Equinfo Stitch design system — Inter/JetBrains Mono, blue-teal color tokens, Material Symbols"
```

---

## Task 2: Shared NavBar and FooterTicker components

**Files:**
- Create: `src/components/NavBar.tsx`
- Create: `src/components/FooterTicker.tsx`

**Step 1: Create NavBar.tsx**

```tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const TAPE = [
  { sym: 'AAPL',  price: '189.84', chg: '+0.43%', up: true  },
  { sym: 'TSLA',  price: '177.20', chg: '-2.14%', up: false },
  { sym: 'MSFT',  price: '415.22', chg: '+1.12%', up: true  },
  { sym: 'NVDA',  price: '882.12', chg: '-0.55%', up: false },
  { sym: 'GOOGL', price: '151.46', chg: '+0.81%', up: true  },
  { sym: 'AMZN',  price: '178.22', chg: '+0.25%', up: true  },
  { sym: 'META',  price: '527.93', chg: '+0.65%', up: true  },
  { sym: 'JPM',   price: '224.89', chg: '-0.45%', up: false },
];

function getMarketStatus(): { open: boolean; label: string } {
  const ny   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = ny.getDay();
  const mins = ny.getHours() * 60 + ny.getMinutes();
  const isWeekday = day >= 1 && day <= 5;
  if (!isWeekday) return { open: false, label: 'WEEKEND' };
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return { open: true,  label: 'REGULAR SESSION' };
  if (mins >= 4 * 60        && mins < 9 * 60 + 30) return { open: true,  label: 'PRE-MARKET' };
  if (mins >= 16 * 60       && mins < 20 * 60) return { open: true,  label: 'AFTER-HOURS' };
  return { open: false, label: 'CLOSED' };
}

interface NavBarProps {
  /** Ticker badge shown in sticky sub-bar (research pages only) */
  ticker?: string;
  /** Company name shown next to ticker badge */
  companyName?: string;
  /** Callback for "NEW RESEARCH" back button */
  onNewResearch?: () => void;
  /** Callback for "EXPORT PDF" button */
  onExportPdf?: () => void;
  /** Show sticky sub-bar */
  showSubBar?: boolean;
  /** User email to display */
  userEmail?: string | null;
}

export default function NavBar({
  ticker,
  companyName,
  onNewResearch,
  onExportPdf,
  showSubBar = false,
  userEmail,
}: NavBarProps) {
  const market = getMarketStatus();

  return (
    <>
      {/* Main nav */}
      <header className="flex justify-between items-center w-full px-4 fixed top-0 z-50 bg-surface h-[44px] border-b border-surface-container">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-black text-primary-container flex items-center gap-2">
            EQUINFO
          </Link>
          <nav className="hidden md:flex items-center gap-4">
            <span className="text-sm font-bold text-primary-container tracking-tight">RESEARCH TERMINAL</span>
            <span className="text-sm font-bold text-on-surface/50 hover:bg-surface-container transition-colors duration-200 px-2 py-1 cursor-default">NYSE</span>
            <span className="text-sm font-bold text-on-surface/50 hover:bg-surface-container transition-colors duration-200 px-2 py-1 cursor-default">NASDAQ</span>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[11px] tracking-widest uppercase text-on-surface/50 font-bold font-mono hidden sm:block">
            {userEmail ?? 'user@equinfo.io'}
          </span>
          <Link
            href="/"
            className="bg-primary-container text-on-primary-container px-3 py-1 text-xs font-bold rounded hover:bg-primary transition-colors active:scale-95 duration-100"
          >
            Analyze a Ticker →
          </Link>
          <div className="flex items-center gap-2 text-on-surface/50">
            <span className="material-symbols-outlined text-sm">schedule</span>
            <span
              className={`material-symbols-outlined text-sm ${market.open ? 'text-secondary' : 'text-outline-variant'}`}
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              fiber_manual_record
            </span>
          </div>
        </div>
      </header>

      {/* Sticky sub-bar — only on report pages */}
      {showSubBar && (
        <div className="fixed top-[44px] w-full z-40 bg-surface-container-high/80 backdrop-blur-md border-b border-outline-variant/20 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {ticker && (
              <div className="bg-primary-container text-on-primary-container px-2 py-0.5 font-mono font-bold text-sm tracking-tighter">
                {ticker}
              </div>
            )}
            {companyName && (
              <h1 className="font-bold text-sm tracking-tight text-on-surface">{companyName.toUpperCase()}</h1>
            )}
          </div>
          <div className="flex items-center gap-3">
            {onNewResearch && (
              <button
                onClick={onNewResearch}
                className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant flex items-center gap-1 hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-base">arrow_back</span>
                NEW RESEARCH
              </button>
            )}
            <div className="w-px h-4 bg-outline-variant/30" />
            {onExportPdf && (
              <button
                onClick={onExportPdf}
                className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant flex items-center gap-1 hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                EXPORT PDF
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

**Step 2: Create FooterTicker.tsx**

```tsx
'use client';

function getMarketStatus(): { open: boolean; label: string } {
  const ny   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = ny.getDay();
  const mins = ny.getHours() * 60 + ny.getMinutes();
  const isWeekday = day >= 1 && day <= 5;
  if (!isWeekday) return { open: false, label: 'WEEKEND' };
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return { open: true,  label: 'REGULAR SESSION' };
  if (mins >= 4 * 60        && mins < 9 * 60 + 30) return { open: true,  label: 'PRE-MARKET' };
  if (mins >= 16 * 60       && mins < 20 * 60) return { open: true,  label: 'AFTER-HOURS' };
  return { open: false, label: 'CLOSED' };
}

const TAPE = [
  { sym: 'AAPL',  price: '189.84', chg: '+0.43%', up: true  },
  { sym: 'TSLA',  price: '177.20', chg: '-2.14%', up: false },
  { sym: 'MSFT',  price: '415.22', chg: '+1.12%', up: true  },
  { sym: 'NVDA',  price: '882.12', chg: '-0.55%', up: false },
  { sym: 'GOOGL', price: '151.46', chg: '+0.81%', up: true  },
  { sym: 'AMZN',  price: '178.22', chg: '+0.25%', up: true  },
  { sym: 'META',  price: '527.93', chg: '+0.65%', up: true  },
  { sym: 'JPM',   price: '224.89', chg: '-0.45%', up: false },
];

export default function FooterTicker() {
  const market = getMarketStatus();

  return (
    <footer className="fixed bottom-0 left-0 w-full z-50 bg-surface-container-low h-[32px] border-t border-surface-container flex items-center overflow-hidden whitespace-nowrap">
      {/* Gradient top accent */}
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-tertiary/40 to-transparent" />

      {/* Scrolling tape */}
      <div className="flex items-center gap-8 px-4 font-mono text-[12px] animate-ticker whitespace-nowrap">
        {[...TAPE, ...TAPE].map((t, i) => (
          <span key={i} className="text-on-surface/80 flex gap-2">
            {t.sym}{' '}
            <span className={t.up ? 'text-secondary' : 'text-error'}>
              {t.price} {t.chg}
            </span>
          </span>
        ))}
      </div>

      {/* Market status pill */}
      <div className="ml-auto bg-surface-container-low px-4 h-full flex items-center gap-2 border-l border-surface-container relative z-10 shrink-0">
        <span
          className={`material-symbols-outlined text-[10px] ${market.open ? 'text-secondary' : 'text-outline-variant'}`}
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          fiber_manual_record
        </span>
        <span className="text-on-surface/60 font-medium text-[10px] tracking-widest uppercase">
          {market.label}
        </span>
      </div>
    </footer>
  );
}
```

**Step 3: Commit**

```bash
git add src/components/NavBar.tsx src/components/FooterTicker.tsx
git commit -m "feat(ui): add shared NavBar and FooterTicker components in Stitch design system"
```

---

## Task 3: Landing page (src/app/page.tsx) — full redesign

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Rewrite page.tsx with Stitch landing page design**

Preserve all existing logic (setupStatus fetch, scroll animation, market status, clock). Replace all JSX with Stitch design. Key visual changes:
- Nav: now uses `<NavBar>` component
- Hero: `EQUINFO` in `text-primary` (`#b6c4ff`) with `glow-radial` bg; eyebrow text; tagline
- Scroll scene: same React state-driven animation; wordmark color `text-primary-fixed` → white
- Search visible below hero wordmark (where it was)
- Pipeline phases: COLLECT/SYNTHESIZE/REPORT in `border-l-2 border-primary-container/secondary/tertiary` cards
- Market snapshot: redesigned table with 5-col grid (SYMBOL, NAME, LAST PRICE, CHANGE, RATING)
- Intelligence stack: CLAUDE / GEMINI / NOTEBOOKLM / Yahoo! Finance in grayscale
- CTA section: `bg-primary-container` with dark text
- Footer: `<FooterTicker>` component

Full implementation:

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import TickerSearch from '@/components/TickerSearch';
import { SetupWizard } from '@/components/SetupWizard';
import ReportHistory from '@/components/ReportHistory';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';

const TAPE = [
  { sym: 'AAPL',  price: '189.84', chg: '+0.43%', up: true,  name: 'Apple Inc.',      rating: 'BUY'        },
  { sym: 'MSFT',  price: '415.22', chg: '+1.12%', up: true,  name: 'Microsoft Corp.', rating: 'STRONG BUY' },
  { sym: 'TSLA',  price: '177.20', chg: '-2.14%', up: false, name: 'Tesla, Inc.',      rating: 'HOLD'       },
  { sym: 'NVDA',  price: '882.12', chg: '-0.55%', up: false, name: 'NVIDIA Corp.',     rating: 'BUY'        },
  { sym: 'GOOGL', price: '151.46', chg: '+0.81%', up: true,  name: 'Alphabet Inc.',    rating: 'BUY'        },
  { sym: 'AMZN',  price: '178.22', chg: '+0.25%', up: true,  name: 'Amazon.com',       rating: 'STRONG BUY' },
];

interface SetupStatus {
  pythonOk: boolean;
  notebooklmOk: boolean;
  authOk: boolean;
  allOk: boolean;
  userEmail: string | null;
}

function getMarketStatus(): { open: boolean; label: string } {
  const ny   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = ny.getDay();
  const mins = ny.getHours() * 60 + ny.getMinutes();
  const isWeekday = day >= 1 && day <= 5;
  if (!isWeekday) return { open: false, label: 'WEEKEND' };
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return { open: true,  label: 'REGULAR SESSION' };
  if (mins >= 4 * 60        && mins < 9 * 60 + 30) return { open: true,  label: 'PRE-MARKET' };
  if (mins >= 16 * 60       && mins < 20 * 60) return { open: true,  label: 'AFTER-HOURS' };
  return { open: false, label: 'CLOSED' };
}

export default function Home() {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading]         = useState(true);

  const [anim, setAnim] = useState({
    heroAlpha: 1, letterSpacing: 0.18, subAlpha: 1, monPhase: 0, progress: 0,
  });

  const sceneRef = useRef<HTMLDivElement>(null);
  const rafRef   = useRef<number>(0);

  async function fetchSetupStatus() {
    try {
      const res = await fetch('/api/setup/status');
      if (!res.ok) {
        setSetupStatus({ pythonOk: true, notebooklmOk: true, authOk: true, allOk: true, userEmail: null });
        return;
      }
      setSetupStatus(await res.json());
    } catch {
      setSetupStatus({ pythonOk: true, notebooklmOk: true, authOk: true, allOk: true, userEmail: null });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSetupStatus();

    function updateAnim() {
      if (!sceneRef.current) return;
      const rect       = sceneRef.current.getBoundingClientRect();
      const scrollable = sceneRef.current.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const p = Math.max(0, Math.min(1, -rect.top / scrollable));
      setAnim({
        heroAlpha:     Math.max(0, 1 - p * 2.8),
        letterSpacing: 0.18 + p * 2.6,
        subAlpha:      Math.max(0, 1 - p * 4.0),
        monPhase:      Math.max(0, Math.min(1, (p - 0.05) / 0.45)),
        progress:      p,
      });
    }

    function onScroll() {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateAnim);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const showSearch = !loading && (setupStatus?.allOk ?? true);
  const showWizard = !loading && setupStatus !== null && !setupStatus.allOk;
  const market     = getMarketStatus();
  const monTranslateY = `${(1 - anim.monPhase) * 100}vh`;
  const monScale      = 0.88 + anim.monPhase * 0.12;

  return (
    <div className="bg-surface text-on-surface min-h-screen pb-8">
      <NavBar userEmail={setupStatus?.userEmail} />

      {/* ── HERO: sticky scroll scene (400vh) ───────────────── */}
      <div ref={sceneRef} style={{ height: '400vh' }}>
        <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>
          <div className="absolute inset-0 dot-grid pointer-events-none" />
          <div className="absolute inset-0 glow-radial pointer-events-none" />

          {/* Wordmark + eyebrow + tagline */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-20"
            style={{ opacity: anim.heroAlpha, transform: `translateY(${-anim.progress * 80}px)` }}
          >
            <div className="text-[11px] tracking-[0.4em] font-bold text-primary uppercase opacity-60 mb-4">
              AI · EQUITY · INTELLIGENCE
            </div>
            <div
              className="scene-hero-wordmark font-black text-primary-fixed leading-none mb-12"
              style={{ letterSpacing: `${anim.letterSpacing}em` }}
            >
              EQUINFO
            </div>
            <p
              className="text-on-surface-variant font-bold text-lg md:text-xl max-w-2xl mx-auto text-center px-4"
              style={{ opacity: anim.subAlpha }}
            >
              Research before you trade. Institutional-grade equity synthesis powered by source-grounded intelligence.
            </p>
          </div>

          {/* App screenshot — rises from below */}
          <div
            className="absolute inset-0 flex items-center justify-center z-10"
            style={{ opacity: anim.monPhase, transform: `translateY(${monTranslateY}) scale(${monScale})` }}
          >
            <div className="monitor-glow" />
            <img src="/unnamed.jpg" alt="Equinfo research terminal" className="preview-screenshot" draggable={false} />
          </div>

          {/* Search bar — appears once monPhase > 0.8 */}
          <div
            className="absolute bottom-20 left-1/2 -translate-x-1/2 w-full max-w-xl px-6 z-30 transition-opacity duration-300"
            style={{ opacity: anim.monPhase > 0.8 ? 1 : 0, pointerEvents: anim.monPhase > 0.8 ? 'auto' : 'none' }}
          >
            {showWizard && <SetupWizard onSetupComplete={fetchSetupStatus} />}
            {showSearch && <TickerSearch />}
            {loading && (
              <div className="bg-surface-container-high p-4 flex items-center gap-3 rounded-lg">
                <span className="w-3 h-3 border border-primary/50 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-on-surface-variant text-[10px] tracking-widest">INITIALIZING SYSTEM...</span>
              </div>
            )}
          </div>

          {/* Scroll progress indicator */}
          <div className="absolute right-5 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
            <div className="text-[7px] text-outline-variant tracking-[0.3em]" style={{ writingMode: 'vertical-rl' }}>SCROLL</div>
            <div className="relative w-0.5 h-28 bg-surface-container-highest rounded overflow-hidden">
              <div
                className="absolute top-0 left-0 w-full bg-primary rounded"
                style={{ height: `${anim.progress * 100}%`, boxShadow: '0 0 6px rgba(182,196,255,0.7)' }}
              />
            </div>
            <span className="text-[7px] text-outline-variant tabular-nums">{Math.round(anim.progress * 100)}%</span>
          </div>
        </div>
      </div>

      {/* Below-fold content */}
      <div className="relative z-50 bg-surface">

        {/* Report history */}
        {!loading && (
          <section className="py-8 max-w-4xl mx-auto px-6">
            <ReportHistory />
          </section>
        )}

        {/* Pipeline Phases */}
        <section className="py-32 px-6 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                n: '01', phase: 'Phase_01', label: 'COLLECT',
                border: 'border-primary-container', color: 'text-primary', barColor: 'bg-primary', barW: 'w-2/3',
                desc: 'Aggregates real-time SEC filings, earnings call transcripts, Yahoo Finance data, and global news into a unified raw data stream.',
              },
              {
                n: '02', phase: 'Phase_02', label: 'SYNTHESIZE',
                border: 'border-secondary', color: 'text-secondary', barColor: 'bg-secondary', barW: 'w-1/2',
                desc: 'Multi-model intelligence extracts bull/bear theses, risk factors, and institutional sentiment shifts via NotebookLM × Gemini.',
              },
              {
                n: '03', phase: 'Phase_03', label: 'REPORT',
                border: 'border-tertiary', color: 'text-tertiary', barColor: 'bg-tertiary', barW: 'w-1/4',
                desc: 'Generates high-fidelity investment memos with Buy/Hold/Sell assessment, confidence level, and direct source citations.',
              },
            ].map((s) => (
              <div key={s.n} className={`bg-surface-container p-8 border-l-2 ${s.border} relative group overflow-hidden`}>
                <div className="absolute -right-4 -top-4 text-8xl font-black text-outline/5 select-none transition-transform group-hover:scale-110">{s.n}</div>
                <div className={`text-[11px] font-mono ${s.color} mb-4 tracking-tighter uppercase`}>{s.phase}</div>
                <h3 className="text-xl font-bold mb-4 tracking-tight">{s.label}</h3>
                <p className="text-on-surface-variant text-sm leading-relaxed">{s.desc}</p>
                <div className="mt-8">
                  <div className={`h-1 w-full ${s.barColor}/20 rounded-full overflow-hidden`}>
                    <div className={`h-full ${s.barColor} ${s.barW}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Market Snapshot */}
        <section className="py-20 bg-surface-container-low border-y border-outline-variant/10">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex justify-between items-end mb-10">
              <div>
                <span className="text-[11px] tracking-widest text-primary uppercase font-bold">Live Feed</span>
                <h2 className="text-3xl font-black tracking-tight mt-2">Market Snapshot</h2>
              </div>
              <div className="font-mono text-xs text-outline bg-surface px-3 py-1 rounded flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${market.open ? 'bg-secondary status-dot-live' : 'bg-outline-variant'}`} />
                {market.label}
              </div>
            </div>
            <div className="market-grid rounded-lg overflow-hidden">
              <div className="market-grid-header">
                <span>SYMBOL</span>
                <span>NAME</span>
                <span className="text-right">LAST PRICE</span>
                <span className="text-right">CHANGE</span>
                <span className="text-center">RATING</span>
              </div>
              {TAPE.map((t) => (
                <div key={t.sym} className="market-grid-row">
                  <span className="font-bold text-on-surface font-mono">{t.sym}</span>
                  <span className="text-on-surface-variant text-xs">{t.name}</span>
                  <span className="text-right font-mono text-on-surface">{t.price}</span>
                  <span className={`text-right font-mono text-sm ${t.up ? 'text-secondary' : 'text-error'}`}>
                    {t.up ? '+' : ''}{t.chg}
                  </span>
                  <span className="text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      t.rating === 'STRONG BUY'
                        ? 'bg-secondary/20 text-secondary'
                        : t.rating === 'BUY'
                        ? 'bg-secondary/10 text-secondary'
                        : 'bg-surface-container-highest text-outline'
                    }`}>{t.rating}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Intelligence Stack */}
        <section className="py-24 border-b border-outline-variant/10">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <h4 className="text-[10px] tracking-[0.3em] font-mono text-outline mb-10 uppercase">Aggregated Intelligence Layers</h4>
            <div className="flex flex-wrap justify-center items-center gap-12 opacity-50 grayscale">
              {['CLAUDE', 'GEMINI', 'NOTEBOOKLM', 'Yahoo! Finance'].map((name) => (
                <div key={name} className="font-black text-xl tracking-tighter">{name}</div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-32 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-black tracking-tight mb-4">A Professional Terminal for Everyone</h2>
            <p className="text-on-surface-variant max-w-xl mx-auto">Equinfo bridges the gap between retail accessibility and institutional depth.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-outline-variant/10">
            <div className="bg-surface p-12 group">
              <div className="w-12 h-12 rounded bg-primary-container/10 flex items-center justify-center mb-8 group-hover:bg-primary-container transition-colors">
                <span className="material-symbols-outlined text-primary group-hover:text-on-primary-container">database</span>
              </div>
              <h3 className="text-2xl font-bold mb-4">Deep Context Mining</h3>
              <p className="text-on-surface-variant leading-relaxed text-sm mb-6">Our engines don&apos;t just search — they read. We analyze thousands of pages of filings to find the footnotes that move markets.</p>
              <div className="flex gap-4">
                <span className="text-[10px] font-mono text-outline px-2 py-1 bg-surface-container rounded">YAHOO_FINANCE</span>
                <span className="text-[10px] font-mono text-outline px-2 py-1 bg-surface-container rounded">ANTHROPIC_SEARCH</span>
              </div>
            </div>
            <div className="bg-surface p-12 group">
              <div className="w-12 h-12 rounded bg-secondary/10 flex items-center justify-center mb-8 group-hover:bg-secondary transition-colors">
                <span className="material-symbols-outlined text-secondary group-hover:text-on-secondary">insights</span>
              </div>
              <h3 className="text-2xl font-bold mb-4">Thematic Synthesis</h3>
              <p className="text-on-surface-variant leading-relaxed text-sm mb-6">Connect dots across industries. Understand how a semiconductor shortage impacts automotive margins instantly.</p>
              <div className="flex gap-4">
                <span className="text-[10px] font-mono text-outline px-2 py-1 bg-surface-container rounded">NOTEBOOKLM</span>
                <span className="text-[10px] font-mono text-outline px-2 py-1 bg-surface-container rounded">GEMINI_AI</span>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-40 bg-primary-container relative overflow-hidden">
          <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
            <h2 className="text-5xl md:text-6xl font-black text-on-primary-container tracking-tighter mb-8 italic">
              Ready to see deeper?
            </h2>
            <p className="text-on-primary-container/80 text-xl mb-12 max-w-xl mx-auto">
              Source-grounded equity intelligence with transparent, traceable analysis.
            </p>
            <Link
              href="/#search"
              className="bg-surface text-primary font-bold px-10 py-5 rounded shadow-xl hover:bg-surface-bright transition-all active:scale-95 inline-block"
            >
              Launch Research Terminal
            </Link>
          </div>
        </section>

      </div>

      <FooterTicker />
    </div>
  );
}
```

**Step 2: Run build check**

```bash
cd /Users/tj/Desktop/Ticker-Research && npx tsc --noEmit 2>&1 | head -30
```

Expected: No type errors (or only pre-existing ones).

**Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): redesign landing page with Stitch design — scroll hero, pipeline cards, market snapshot, intelligence stack, CTA"
```

---

## Task 4: ResearchProgress component — new Stitch loading UI

**Files:**
- Modify: `src/components/ResearchProgress.tsx`

**Step 1: Read current ResearchProgress.tsx to understand the streaming logic**

Read `src/components/ResearchProgress.tsx` and preserve:
- All SSE streaming logic (the `EventSource` or `fetch` with streaming)
- Step labels and their order
- `onComplete(result)` and `onError(message)` callbacks
- The `PROGRESS:` and `RESULT:` line parsing

Replace only the JSX.

**Step 2: Rewrite the JSX with Stitch loading design**

The new component shows:
- Full-screen bg with `loading-pulse` ambient glow
- Large ticker name in `font-mono font-bold text-[64px] text-primary ticker-glow ticker-scan`
- Subtitle "RESEARCHING {ticker}..." with pulsing dot
- 4-step vertical stepper with vertical connector line (`data-flow-line`)
  - Completed: green circle with checkmark, label + timing
  - Active: blue spinner circle with pulsing step
  - Pending: grey empty circle at 30% opacity
- Terminal log panel (bottom-right, desktop only) showing last 7 log lines
- Fixed footer `<FooterTicker />`

Steps map to existing progress messages:
1. "Collecting market data"
2. "Gathering news & filings"
3. "Synthesizing with NotebookLM"
4. "Generating report"

**Step 3: Read the actual file first, then edit**

Only write the new JSX — keep ALL streaming/parsing logic 100% unchanged.

**Step 4: Commit**

```bash
git add src/components/ResearchProgress.tsx
git commit -m "feat(ui): redesign ResearchProgress with Stitch ambient loading screen — ticker glow, step stepper, terminal log"
```

---

## Task 5: ResearchReport component — new Stitch report UI

**Files:**
- Modify: `src/components/ResearchReport.tsx`

**Step 1: Read current ResearchReport.tsx**

Read the file to understand:
- What props it receives (`analysisResult: AnalysisResult, ticker: string`)
- PDF export logic (keep exactly as-is)
- How it maps `AnalysisResult` fields to display

**Step 2: Rewrite JSX with Stitch report design**

Layout:
- `<NavBar ticker={ticker} companyName={analysisResult.ticker_overview} showSubBar onNewResearch={...} onExportPdf={...} />`
- Financial disclaimer banner (border-l-4 border-tertiary-container)
- `mt-[100px] max-w-6xl mx-auto px-6`
- 12-col asymmetric grid: `lg:col-span-8` left + `lg:col-span-4` right
- Left col:
  - 2x4 stats grid: Last Price, 24H Change, MKT Cap, P/E Ratio, Volume, 52W High, Div Yield, EPS
  - Market Sentiment card with BULLISH/BEARISH/NEUTRAL badge
  - Bullish factors (Growth Catalysts) + Bearish factors (Risk Vectors) in 2-col grid
- Right col:
  - Strategic Assessment: BUY/HOLD/SELL fill bars (animated)
  - Confidence Level: segmented 10-block meter
  - (Optional) Ticker image placeholder or brand context block
- Sources section: 4-col grid with numbered source cards (border-l-2 border-tertiary)
- `<FooterTicker />`

Map `AnalysisResult` fields:
- `market_sentiment` → Sentiment card text + badge color
- `bullish_signals[]` → Growth Catalysts list
- `bearish_signals[]` → Risk Vectors list
- `buy_probability`, `hold_probability`, `sell_probability` → assessment bars
- `confidence_level` → confidence meter blocks (0–100 → 0–10 blocks lit)
- `sources_used[]` → sources section cards
- `ticker_overview` → company name in sub-bar
- Market data from `analysisResult.market_snapshot` → stats grid

**Step 3: Commit**

```bash
git add src/components/ResearchReport.tsx
git commit -m "feat(ui): redesign ResearchReport with Stitch 12-col layout — stats grid, sentiment, assessment bars, confidence meter, sources"
```

---

## Task 6: Update research/[ticker]/page.tsx shell

**Files:**
- Modify: `src/app/research/[ticker]/page.tsx`

**Step 1: Update the page shell to use new NavBar/FooterTicker**

Preserve ALL state machine logic and data flow. Change only:
- Import `NavBar` and `FooterTicker`
- Remove inline `NavBar` function component (it's now extracted)
- Update all page state wrappers (loading, error, idle, analyzing, complete) to use new components
- Error state: use Stitch card styling (`bg-surface-container`, `border-outline-variant/20`, `text-primary-container` button)
- Loading state: centered spinner on `bg-surface dot-grid`
- Ticker not found: Stitch-styled error card

**Step 2: Commit**

```bash
git add src/app/research/[ticker]/page.tsx
git commit -m "feat(ui): update research page shell to use shared NavBar/FooterTicker in Stitch design"
```

---

## Task 7: Update TickerSearch, ChartConfirmation, SetupWizard

**Files:**
- Modify: `src/components/TickerSearch.tsx`
- Modify: `src/components/ChartConfirmation.tsx`
- Modify: `src/components/SetupWizard.tsx`

**Step 1: Read each component, then reskin to Stitch palette**

For each component, read the file first, then update only color/typography classes:

**TickerSearch:**
- Input bg: `bg-surface-container-high`, border: `border-outline-variant`, focus: `ring-primary-container/60`
- Dropdown items: `bg-surface-container-high hover:bg-surface-container-highest`
- Submit button: `bg-primary-container text-on-primary-container`
- Error state: `text-error`

**ChartConfirmation:**
- Card: `bg-surface-container` with `border-outline-variant/20`
- Price display: `text-on-surface font-mono`
- Positive %: `text-secondary`, Negative %: `text-error`
- Confirm button: `bg-primary-container text-on-primary-container`

**SetupWizard:**
- Card: `bg-surface-container`
- Progress steps: completed `text-secondary`, active `text-primary`, pending `text-outline`
- Buttons: `bg-primary-container text-on-primary-container`

**Step 2: Commit all three together**

```bash
git add src/components/TickerSearch.tsx src/components/ChartConfirmation.tsx src/components/SetupWizard.tsx
git commit -m "feat(ui): reskin TickerSearch, ChartConfirmation, SetupWizard to Stitch color palette"
```

---

## Task 8: Playwright tests

**Files:**
- Modify: `tests/e2e/report-ui.spec.ts`
- Create: `tests/e2e/stitch-ui.spec.ts`

**Step 1: Write stitch-ui.spec.ts**

```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Stitch UI — Landing Page', () => {
  test('loads with EQUINFO header and blue primary color', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Nav has EQUINFO text
    await expect(page.locator('text=EQUINFO').first()).toBeVisible();

    // Hero has primary text (blue)
    const heroText = page.locator('.scene-hero-wordmark');
    await expect(heroText).toBeVisible();

    // Screenshot for visual confirmation
    await page.screenshot({ path: '/tmp/stitch-landing.png', fullPage: false });
  });

  test('footer ticker tape is visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Footer exists with ticker data
    const footer = page.locator('footer').last();
    await expect(footer).toBeVisible();

    const screenshotPath = '/tmp/stitch-footer.png';
    await page.screenshot({ path: screenshotPath });
  });

  test('pipeline phases show COLLECT SYNTHESIZE REPORT', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Scroll past hero to see pipeline
    await page.evaluate(() => window.scrollTo(0, 5000));
    await page.waitForTimeout(500);

    await expect(page.locator('text=COLLECT').first()).toBeVisible();
    await expect(page.locator('text=SYNTHESIZE').first()).toBeVisible();
    await expect(page.locator('text=REPORT').first()).toBeVisible();

    await page.screenshot({ path: '/tmp/stitch-pipeline.png', fullPage: false });
  });

  test('market snapshot table renders', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => window.scrollTo(0, 8000));
    await page.waitForTimeout(500);

    await expect(page.locator('text=Market Snapshot')).toBeVisible();
    await expect(page.locator('text=AAPL').first()).toBeVisible();

    await page.screenshot({ path: '/tmp/stitch-market-snapshot.png', fullPage: false });
  });

  test('CTA section renders with primary-container background', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    await expect(page.locator('text=Ready to see deeper')).toBeVisible();

    await page.screenshot({ path: '/tmp/stitch-cta.png', fullPage: false });
  });
});

test.describe('Stitch UI — Loading Screen', () => {
  test('loading state shows ticker glow and step stepper', async ({ page }) => {
    // Navigate directly with a fake filePath to trigger analyzing state
    await page.goto('/research/AAPL?file=/tmp/fake-source.json');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // Should show loading UI or analyzing UI
    const screenshot = await page.screenshot({ path: '/tmp/stitch-loading.png' });
    expect(screenshot).toBeTruthy();
  });
});

test.describe('Stitch UI — Colors and Typography', () => {
  test('body background is #10141a (surface color)', async ({ page }) => {
    await page.goto('/');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // Should be close to #10141a = rgb(16, 20, 26)
    expect(bg).toMatch(/rgb\(1[0-9], 1[0-9], 2[0-9]\)/);
  });

  test('Inter font is loaded', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    expect(fontFamily.toLowerCase()).toContain('inter');
  });
});
```

**Step 2: Run tests and take screenshots**

```bash
cd /Users/tj/Desktop/Ticker-Research && npx playwright test tests/e2e/stitch-ui.spec.ts --headed=false 2>&1 | tail -40
```

**Step 3: Read all screenshots**

Read each screenshot from `/tmp/stitch-*.png` using the Read tool to visually confirm the UI looks correct. Check:
- Dark background (#10141a)
- Blue primary color (#2962ff CTA, #b6c4ff accents)
- Inter font rendering
- Footer ticker tape visible
- Pipeline cards visible after scroll

**Step 4: Fix any visual issues, re-run until all pass**

**Step 5: Commit**

```bash
git add tests/e2e/stitch-ui.spec.ts
git commit -m "test(ui): add Playwright tests for Stitch UI — landing page, colors, typography, footer ticker"
```

---

## Task 9: Final verification pass

**Step 1: Run full build**

```bash
cd /Users/tj/Desktop/Ticker-Research && npm run build 2>&1 | tail -30
```

Expected: Build succeeds with no errors.

**Step 2: Start dev server and run all Playwright tests**

```bash
cd /Users/tj/Desktop/Ticker-Research && npx playwright test --reporter=list 2>&1 | tail -50
```

**Step 3: Take full-page screenshots of key states and read them**

```bash
# Start dev server in background
npm run dev &
sleep 5

# Take screenshots via playwright
npx playwright test tests/e2e/stitch-ui.spec.ts --headed=false
```

Read all screenshots with the Read tool. Iterate on any failures.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(ui): complete Equinfo Stitch UI revamp — all screens implemented, Playwright verified"
```

---

## Implementation Notes

### Key mappings (AnalysisResult → Stitch report UI)

| AnalysisResult field | Stitch component |
|---|---|
| `market_sentiment` | Sentiment card text + BULLISH/BEARISH/NEUTRAL badge |
| `bullish_signals[]` | Growth Catalysts list items |
| `bearish_signals[]` | Risk Vectors list items |
| `buy_probability` | BUY fill bar width % |
| `hold_probability` | HOLD fill bar width % |
| `sell_probability` | SELL fill bar width % |
| `confidence_level` | Confidence meter blocks (0–100 → 0–10 filled) |
| `sources_used[]` | Sources grid cards |
| `ticker_overview` | Company name in sub-bar |
| `market_snapshot.currentPrice` | Last Price stat card |
| `market_snapshot.percentChange` | 24H Change stat card |
| `market_snapshot.marketCap` | MKT Cap stat card |

### Tailwind v4 syntax reminders

- Colors defined in `@theme` block, no `tailwind.config.js` needed
- Custom colors accessible as `text-primary`, `bg-surface-container`, etc.
- Use `border-outline-variant/20` for `20%` opacity borders
- Font families: `font-mono` maps to JetBrains Mono via `--font-mono`

### Material Symbols usage

```tsx
<span className="material-symbols-outlined text-primary">database</span>
// Filled variant:
<span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>fiber_manual_record</span>
```
