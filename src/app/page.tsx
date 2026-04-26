'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import TickerSearch from '@/components/TickerSearch';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';
import { getMarketStatus } from '@/lib/market-status';

interface SnapshotItem {
  sym: string;
  name: string;
  price: string | null;
  chg: string | null;
  up: boolean;
}

export default function Home() {
  const { data: session } = useSession();
  const [snapshot, setSnapshot]       = useState<SnapshotItem[]>([]);
  const [snapshotAt, setSnapshotAt]   = useState<string | null>(null);

  // ── Scroll animation state ─────────────────────────────────────
  // React fully owns these style values — no CSS-vs-inline conflicts.
  // Initial values match SSR output → zero hydration mismatch.
  const [anim, setAnim] = useState({
    heroAlpha:     1,
    letterSpacing: 0.18,
    subAlpha:      1,
    monPhase:      0,   // 0 = image hidden, 1 = image fully visible
    progress:      0,
  });

  const sceneRef = useRef<HTMLDivElement>(null);
  const rafRef   = useRef<number>(0);

  useEffect(() => {
    fetch('/api/market-snapshot')
      .then((r) => r.json())
      .then((data) => {
        if (data.items) {
          setSnapshot(data.items);
          setSnapshotAt(data.fetched_at ?? null);
        }
      })
      .catch(() => {/* non-fatal */});
  }, []);

  useEffect(() => {
    // ── Scroll handler ─────────────────────────────────────────
    function updateAnim() {
      if (!sceneRef.current) return;
      const rect       = sceneRef.current.getBoundingClientRect();
      const scrollable = sceneRef.current.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;

      const p = Math.max(0, Math.min(1, -rect.top / scrollable));

      // Wordmark: fades + expands across first 30% of scroll (matches Stitch)
      const wordmarkProgress = Math.min(1, p / 0.3);
      const heroAlpha        = 1 - wordmarkProgress;
      const letterSpacing    = 0.18 + wordmarkProgress * 2.62;
      const subAlpha         = Math.max(0, 1 - p * 4.0);
      const monPhase         = p; // pass raw progress; terminal range computed in render

      setAnim({ heroAlpha, letterSpacing, subAlpha, monPhase, progress: p });
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

  const isWebMode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'web';
  const market    = getMarketStatus();

  // ── Stitch cinematic animation — matches Stitch HTML exactly ──
  // Terminal animation lives in 20%–90% of total scroll progress
  const animStart = 0.2;
  const animEnd   = 0.9;
  const rawTerminal = anim.progress > animStart
    ? Math.min(1, Math.max(0, (anim.progress - animStart) / (animEnd - animStart)))
    : 0;
  // Smoothstep easing: t²(3-2t)
  const ep = rawTerminal * rawTerminal * (3 - 2 * rawTerminal);

  const monRotateX  = 20 * (1 - ep);       // 20deg → 0
  const monRotateY  = -20 * (1 - ep);      // -20deg → 0
  const monScale    = 0.6 + ep * 0.75;     // 0.6 → 1.35
  const monOpacity  = Math.min(1, rawTerminal * 4);  // fades in early
  const colorOpacity = ep;                 // grayscale layer → color layer crossfade
  const showLabels  = rawTerminal > 0.3 && rawTerminal < 0.85;
  const showSearch2 = rawTerminal > 0.8;

  return (
    <div className="bg-surface text-on-surface min-h-screen pb-8">
      <NavBar />

      {/* ── HERO: sticky scroll scene (400vh) ─── */}
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
              CIPHER
            </div>
            <p
              className="text-on-surface-variant font-bold text-lg md:text-xl max-w-2xl mx-auto text-center px-4"
              style={{ opacity: anim.subAlpha }}
            >
              Research before you trade. Institutional-grade equity synthesis powered by source-grounded intelligence.
            </p>
          </div>

          {/* Terminal scene — Stitch cinematic 3D reveal */}
          <div className="absolute inset-0 flex items-center justify-center z-10"
               style={{ perspective: '1500px' }}>
            <div className="monitor-glow" />

            {/* Frame: rotates + scales into view */}
            <div
              style={{
                position: 'relative',
                opacity: monOpacity,
                transform: `rotateX(${monRotateX}deg) rotateY(${monRotateY}deg) scale(${monScale})`,
                transformStyle: 'preserve-3d',
                willChange: 'transform',
              }}
            >
              {/* Grayscale base layer */}
              <img
                src="/cipher-start.jpg"
                alt="Cipher terminal"
                className="preview-screenshot grayscale"
                draggable={false}
                style={{ opacity: 1 - colorOpacity, backfaceVisibility: 'hidden' }}
              />
              {/* Full-color overlay layer */}
              <img
                src="/cipher-end.jpg"
                alt="Cipher terminal color"
                className="preview-screenshot absolute inset-0"
                draggable={false}
                style={{ opacity: colorOpacity, backfaceVisibility: 'hidden' }}
              />
            </div>

            {/* Floating status labels — appear mid-animation */}
            {showLabels && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[20%] left-[3%] bg-primary/10 border border-primary/20 backdrop-blur-sm p-4 rounded-lg font-mono text-[10px]">
                  <div className="text-primary font-bold">LENS_STABILIZED</div>
                  <div className="text-outline">SYNTHESIZING DATA...</div>
                </div>
                <div className="absolute bottom-[20%] right-[3%] bg-secondary/10 border border-secondary/20 backdrop-blur-sm p-4 rounded-lg font-mono text-[10px]">
                  <div className="text-secondary font-bold">COLOR_RESTORED</div>
                  <div className="text-outline">CALIBRATING INTERFACE...</div>
                </div>
              </div>
            )}
          </div>

          {/* Search bar — appears once terminal animation is ~80% done */}
          <div
            className="absolute bottom-20 left-1/2 -translate-x-1/2 w-full max-w-xl px-6 z-30 transition-opacity duration-300"
            style={{ opacity: showSearch2 ? 1 : 0, pointerEvents: showSearch2 ? 'auto' : 'none' }}
          >
            {isWebMode && !session ? (
              <Link
                href="/auth/signin"
                className="block w-full text-center bg-primary-container text-on-primary-container font-bold py-3 px-6 text-sm tracking-wider hover:opacity-90 transition-opacity rounded"
              >
                Sign In to Get Started →
              </Link>
            ) : isWebMode && session ? (
              <Link
                href="/dashboard"
                className="block w-full text-center bg-primary-container text-on-primary-container font-bold py-3 px-6 text-sm tracking-wider hover:opacity-90 transition-opacity rounded"
              >
                Go to Dashboard →
              </Link>
            ) : (
              <TickerSearch />
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

        {/* Pipeline Phases */}
        <section className="py-32 px-6 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                n: '01', phase: 'Phase_01', label: 'COLLECT',
                borderClass: 'border-primary-container', colorClass: 'text-primary', barColorClass: 'bg-primary', barWidthClass: 'w-2/3',
                desc: 'Aggregates real-time SEC filings, earnings call transcripts, Yahoo Finance data, and global news into a unified raw data stream.',
              },
              {
                n: '02', phase: 'Phase_02', label: 'SYNTHESIZE',
                borderClass: 'border-secondary', colorClass: 'text-secondary', barColorClass: 'bg-secondary', barWidthClass: 'w-1/2',
                desc: 'Multi-model intelligence extracts bull/bear theses, risk factors, and institutional sentiment shifts via advanced AI synthesis.',
              },
              {
                n: '03', phase: 'Phase_03', label: 'REPORT',
                borderClass: 'border-tertiary', colorClass: 'text-tertiary', barColorClass: 'bg-tertiary', barWidthClass: 'w-1/4',
                desc: 'Generates high-fidelity investment memos with Buy/Hold/Sell assessment, confidence level, and direct source citations.',
              },
            ].map((s) => (
              <div key={s.n} className={`bg-surface-container p-8 border-l-2 ${s.borderClass} relative group overflow-hidden`}>
                <div className="absolute -right-4 -top-4 text-8xl font-black text-outline/5 select-none transition-transform group-hover:scale-110">{s.n}</div>
                <div className={`text-[11px] font-mono ${s.colorClass} mb-4 tracking-tighter uppercase`}>{s.phase}</div>
                <h3 className="text-xl font-bold mb-4 tracking-tight">{s.label}</h3>
                <p className="text-on-surface-variant text-sm leading-relaxed">{s.desc}</p>
                <div className="mt-8">
                  <div className="h-1 w-full bg-outline-variant/20 rounded-full overflow-hidden">
                    <div className={`h-full ${s.barColorClass} ${s.barWidthClass}`} />
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
              <div className="flex flex-col items-end gap-1">
                <div className="font-mono text-xs text-outline bg-surface px-3 py-1 rounded flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${market.open ? 'bg-secondary status-dot-live' : 'bg-outline-variant'}`} />
                  {market.label}
                </div>
                {snapshotAt && (
                  <span className="font-mono text-[9px] text-outline-variant">
                    updated {new Date(snapshotAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
            <div className="market-grid rounded-lg overflow-hidden">
              <div className="market-grid-header">
                <span>SYMBOL</span>
                <span>NAME</span>
                <span className="text-right">LAST PRICE</span>
                <span className="text-right">CHANGE</span>
              </div>
              {snapshot.length === 0 ? (
                <div className="market-grid-row col-span-4">
                  <span className="text-outline-variant text-xs font-mono col-span-4">Loading market data...</span>
                </div>
              ) : snapshot.map((t) => (
                <div key={t.sym} className="market-grid-row">
                  <span className="font-bold text-on-surface font-mono">{t.sym}</span>
                  <span className="text-on-surface-variant text-xs">{t.name}</span>
                  <span className="text-right font-mono text-on-surface">{t.price ?? '—'}</span>
                  <span className={`text-right font-mono text-sm ${t.up ? 'text-secondary' : 'text-error'}`}>
                    {t.chg ?? '—'}
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
              {['CLAUDE', 'GEMINI', 'Yahoo! Finance'].map((name) => (
                <div key={name} className="font-black text-xl tracking-tighter">{name}</div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-32 px-6 max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-4xl font-black tracking-tight mb-4">A Professional Terminal for Everyone</h2>
            <p className="text-on-surface-variant max-w-xl mx-auto">Cipher bridges the gap between retail accessibility and institutional depth.</p>
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
                <span className="text-[10px] font-mono text-outline px-2 py-1 bg-surface-container rounded">GEMINI_AI</span>
                <span className="text-[10px] font-mono text-outline px-2 py-1 bg-surface-container rounded">CLAUDE_AI</span>
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
            {isWebMode && session ? (
              <Link
                href="/dashboard"
                className="bg-surface text-primary font-bold px-10 py-5 rounded shadow-xl hover:bg-surface-bright transition-all active:scale-95 inline-block"
              >
                Go to Dashboard →
              </Link>
            ) : isWebMode ? (
              <Link
                href="/auth/signin"
                className="bg-surface text-primary font-bold px-10 py-5 rounded shadow-xl hover:bg-surface-bright transition-all active:scale-95 inline-block"
              >
                Sign In to Get Started →
              </Link>
            ) : (
              <TickerSearch />
            )}
          </div>
        </section>

      </div>

      <FooterTicker />
    </div>
  );
}
