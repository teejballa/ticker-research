'use client';

// src/components/landing/Hero.tsx
// Scroll-driven CIPHER letter-split hero. Ported from the Claude Design
// handoff bundle (cipher/project/src/hero.jsx). The 6 letters split apart and
// rise (no colour change); a rocket launches straight up and fades; floating
// ticker chips ride in — wired to live /api/market-snapshot data.

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import TickerSearch from '@/components/TickerSearch';
import { Starfield, useParallax } from './effects';
import { Constellation } from './illustrations';

const LETTERS = ['C', 'I', 'P', 'H', 'E', 'R'];

function smoothstep(t: number) { return t * t * (3 - 2 * t); }
function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

interface ChipSlot { top: number; left: number; color: string; }
const CHIP_SLOTS: ChipSlot[] = [
  { top: 18, left: 8,  color: '#4C7BFF' },
  { top: 30, left: 88, color: '#76B900' },
  { top: 64, left: 6,  color: '#E82127' },
  { top: 74, left: 84, color: '#0067B8' },
  { top: 84, left: 38, color: '#1877F2' },
  { top: 12, left: 42, color: '#FF9900' },
];

const FALLBACK_CHIPS = [
  { sym: 'AAPL', px: '210.84', chg: '+1.32%', up: true },
  { sym: 'NVDA', px: '182.40', chg: '+0.84%', up: true },
  { sym: 'TSLA', px: '346.65', chg: '-1.75%', up: false },
  { sym: 'MSFT', px: '372.29', chg: '-0.16%', up: false },
  { sym: 'META', px: '575.05', chg: '+0.35%', up: true },
  { sym: 'AMZN', px: '213.77', chg: '+0.46%', up: true },
];

interface ChipData { sym: string; px: string; chg: string; up: boolean; }

export default function Hero() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [chips, setChips] = useState<ChipData[]>(FALLBACK_CHIPS);
  const [rocketLoaded, setRocketLoaded] = useState(false);
  const mouse = useParallax();

  // Live ticker chips from the market snapshot endpoint.
  useEffect(() => {
    fetch('/api/market-snapshot')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.items) && data.items.length) {
          const live = data.items
            .filter((it: { price: string | null }) => it.price)
            .slice(0, 6)
            .map((it: { sym: string; price: string; chg: string | null; up: boolean }) => ({
              sym: it.sym,
              px: it.price,
              chg: it.chg ?? '',
              up: it.up,
            }));
          if (live.length) setChips(live);
        }
      })
      .catch(() => {/* keep fallback */});
  }, []);

  useEffect(() => {
    function update() {
      if (!sceneRef.current) return;
      const rect = sceneRef.current.getBoundingClientRect();
      const scrollable = sceneRef.current.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;
      setProgress(clamp01(-rect.top / scrollable));
    }
    function onScroll() {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    }
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const spread = clamp01((progress - 0.08) / 0.27);
  const fly    = clamp01((progress - 0.28) / 0.32);
  const reveal = clamp01((progress - 0.40) / 0.40);
  const spreadE = smoothstep(spread);
  const flyE    = smoothstep(fly);
  const revealE = smoothstep(reveal);

  const subAlpha     = 1 - clamp01(progress / 0.18);
  const eyebrowAlpha = 1 - clamp01(progress / 0.25);
  const baseSpacing  = 0.10 + spreadE * 0.5;
  const chipAlpha    = revealE;

  return (
    <div ref={sceneRef} className="scene">
      <div className="scene-sticky">
        <div className="hero-bg" />
        <div className="hero-stars"><Starfield count={70} /></div>

        {/* Technical corner readouts */}
        <div className="hero-corner tl"><span className="vlbl">Coverage</span><span className="vval">NYSE · NASDAQ</span></div>
        <div className="hero-corner tr"><span className="vlbl">Tickers · μ</span><span className="vval">8 412 indexed</span></div>
        <div className="hero-corner bl"><span className="vlbl">Brier · OOS</span><span className="vval">σ = 0.196</span></div>
        <div className="hero-corner br"><span className="vlbl">Hit rate · 90d</span><span className="vval">58.3% ± 2.1</span></div>

        {/* Eyebrow */}
        <div
          className="hero-eyebrow"
          style={{ opacity: eyebrowAlpha, transform: `translate(-50%, ${-progress * 60}px)` }}
        >
          <span className="pip" />
          Equity research · Cited
          <span className="pip" />
        </div>

        {/* Floating ticker chips */}
        {chips.map((c, i) => {
          const slot = CHIP_SLOTS[i];
          if (!slot) return null;
          const drift = Math.sin(progress * Math.PI * 2 + i) * 8;
          const xOff = (slot.left < 50 ? -20 : 20) * (1 - revealE);
          return (
            <div
              key={c.sym}
              className="chip"
              style={{
                top: `${slot.top}%`,
                left: `${slot.left}%`,
                opacity: chipAlpha * (1 - flyE * 0.3),
                transform: `translate(${xOff}px, ${drift}px) scale(${0.7 + revealE * 0.3})`,
                zIndex: 5,
              }}
            >
              <span className="sym-dot" style={{ background: slot.color }}>{c.sym[0]}</span>
              <span>{c.sym}</span>
              <span style={{ color: 'var(--ink-3)' }}>{c.px}</span>
              <span className={c.up ? 'delta-up' : 'delta-down'}>{c.chg}</span>
            </div>
          );
        })}

        {/* Rocket — launches straight up, then fades. Gated on image
            decode so the browser never paints a broken-image placeholder
            during the animation kick-off. */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: `${-25 + progress * 130}%`,
            transform: 'translateX(-50%)',
            opacity: rocketLoaded
              ? Math.min(1, progress * 6) * (1 - clamp01((progress - 0.55) / 0.18))
              : 0,
            zIndex: 4,
            pointerEvents: 'none',
            height: 'min(38vh, 340px)',
            aspectRatio: '206 / 535',
            filter: 'drop-shadow(0 12px 24px rgba(217,119,87,0.16))',
          }}
        >
          <Image
            src="/rocketship.png"
            alt=""
            fill
            priority
            sizes="140px"
            draggable={false}
            onLoad={() => setRocketLoaded(true)}
            style={{ objectFit: 'contain', userSelect: 'none' }}
          />
        </div>

        {/* Vertical exhaust trail */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 0,
            width: '2px',
            height: `${progress * 130}%`,
            transform: 'translateX(-50%)',
            background: 'repeating-linear-gradient(to top, rgba(217,119,87,0.7) 0 4px, transparent 4px 10px)',
            opacity: Math.min(1, progress * 5) * (1 - clamp01((progress - 0.55) / 0.20)) * 0.7,
            zIndex: 2,
            pointerEvents: 'none',
          }}
        />

        {/* Decorative constellation */}
        <div style={{ position: 'absolute', left: '-80px', bottom: '-80px', opacity: 0.6 * (1 - revealE * 0.6), pointerEvents: 'none', zIndex: 1 }}>
          <Constellation width={320} height={180} color="#2F44D6" />
        </div>

        {/* CIPHER wordmark — letters split outward & rise */}
        <div className="wordmark" style={{ letterSpacing: `${baseSpacing}em` }}>
          {LETTERS.map((ch, i) => {
            const offset = i - 2.5;
            const dir = Math.sign(offset);
            const mag = Math.abs(offset);
            const earlyDx = dir * mag * spreadE * 1.4;
            const flyDx = dir * mag * flyE * 10;
            const flyDy = -flyE * (24 + mag * 6);
            const flyScale = 1 + flyE * 0.15;
            const flyAlpha = 1 - flyE * 0.95;
            const parallaxFade = 1 - clamp01(progress / 0.12);
            const px = mouse.x * (4 + mag * 2) * parallaxFade;
            const py = mouse.y * (3 + mag * 1.5) * parallaxFade;
            return (
              <span
                key={ch}
                className="letter"
                style={{
                  transform: `translate(calc(${earlyDx + flyDx}vw + ${px}px), calc(${flyDy}vh + ${py}px)) scale(${flyScale})`,
                  opacity: Math.max(0, flyAlpha),
                  color: 'var(--ink)',
                }}
              >
                {ch}
              </span>
            );
          })}
        </div>

        {/* Sub-tagline */}
        <div className="hero-sub" style={{ opacity: subAlpha, transform: `translate(-50%, ${progress * 30}px)` }}>
          <em>Source-cited research on any ticker.</em>
          <br />
          Sentiment, drivers, outlook, and a recommendation calibrated against the S&amp;P 500.
        </div>

        {/* Reveal: ticker search panel */}
        <div
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: `translate(-50%, calc(-50% + ${(1 - revealE) * 60}px))`,
            opacity: revealE,
            pointerEvents: revealE > 0.6 ? 'auto' : 'none',
            width: 'min(560px, 92vw)',
            zIndex: 6,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius-lg)',
              padding: '28px',
              boxShadow: '0 20px 50px rgba(36,30,18,0.08)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.3em', color: 'var(--ink-3)', textTransform: 'uppercase', marginBottom: '14px' }}>
              · ready when you are ·
            </div>
            <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: '32px', margin: '0 0 22px', letterSpacing: '-0.03em', color: 'var(--ink)' }}>
              Decipher any <em style={{ color: 'var(--indigo)' }}>ticker</em>.
            </h2>
            <TickerSearch />
          </div>
        </div>

        {/* Scroll rail */}
        <div className="scroll-rail">
          <div style={{ fontFamily: 'var(--mono)', fontSize: '9px', letterSpacing: '0.3em', color: 'var(--ink-3)', writingMode: 'vertical-rl' }}>SCROLL</div>
          <div className="rail">
            <div className="rail-fill" style={{ height: `${progress * 100}%` }} />
          </div>
          <div className="pct">{Math.round(progress * 100).toString().padStart(2, '0')}%</div>
        </div>
      </div>
    </div>
  );
}
