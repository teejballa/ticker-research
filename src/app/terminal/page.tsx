'use client';

import { useState, useEffect } from 'react';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';
import TickerSearch from '@/components/TickerSearch';

export default function Terminal() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col">
      <NavBar />

      {/* Centered content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-[44px] relative overflow-hidden">

        {/* Dot grid background — same as landing hero */}
        <div className="absolute inset-0 dot-grid pointer-events-none opacity-60" />

        {/* Ambient glow */}
        <div
          className="absolute pointer-events-none"
          style={{
            width: '600px',
            height: '400px',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -60%)',
            background: 'radial-gradient(ellipse at center, rgba(182,196,255,0.06) 0%, transparent 70%)',
          }}
        />

        {/* Stagger-in content block */}
        <div
          className="relative z-10 w-full max-w-xl flex flex-col items-center text-center"
          style={{
            transition: 'opacity 0.5s ease, transform 0.5s ease',
            opacity: ready ? 1 : 0,
            transform: ready ? 'translateY(0)' : 'translateY(12px)',
          }}
        >
          {/* Eyebrow */}
          <div
            className="text-[10px] tracking-[0.45em] font-bold text-primary uppercase opacity-50 mb-6"
            style={{
              transition: 'opacity 0.5s ease 0.05s, transform 0.5s ease 0.05s',
              opacity: ready ? undefined : 0,
            }}
          >
            AI · EQUITY · INTELLIGENCE
          </div>

          {/* Wordmark */}
          <div
            className="font-black text-primary-fixed tracking-tight mb-3 select-none"
            style={{
              fontSize: 'clamp(2.5rem, 8vw, 4.5rem)',
              letterSpacing: '0.04em',
              transition: 'opacity 0.5s ease 0.1s',
            }}
          >
            CIPHER
          </div>

          {/* Headline */}
          <h1
            className="text-2xl md:text-3xl font-bold text-on-surface tracking-tight mb-3"
            style={{
              transition: 'opacity 0.5s ease 0.15s',
            }}
          >
            Research Now
          </h1>

          {/* Subtitle */}
          <p
            className="text-on-surface-variant text-sm mb-10 max-w-xs"
            style={{
              transition: 'opacity 0.5s ease 0.2s',
            }}
          >
            Enter a ticker symbol to begin source-grounded equity analysis.
          </p>

          {/* Search */}
          <div
            className="w-full"
            style={{
              transition: 'opacity 0.5s ease 0.25s',
            }}
          >
            <TickerSearch />
          </div>

          {/* Example tickers hint */}
          <div
            className="mt-6 flex items-center gap-3"
            style={{
              transition: 'opacity 0.5s ease 0.35s',
              opacity: ready ? 0.4 : 0,
            }}
          >
            <span className="text-[10px] font-mono text-outline tracking-widest">TRY</span>
            {['AAPL', 'NVDA', 'TSLA', 'MSFT'].map((sym) => (
              <span key={sym} className="text-[10px] font-mono text-outline-variant px-2 py-0.5 border border-outline-variant/20 rounded">
                {sym}
              </span>
            ))}
          </div>
        </div>

        {/* Corner decorations — fine terminal lines */}
        <div className="absolute top-[54px] left-6 w-8 h-8 border-l border-t border-outline-variant/20 pointer-events-none" />
        <div className="absolute top-[54px] right-6 w-8 h-8 border-r border-t border-outline-variant/20 pointer-events-none" />
        <div className="absolute bottom-12 left-6 w-8 h-8 border-l border-b border-outline-variant/20 pointer-events-none" />
        <div className="absolute bottom-12 right-6 w-8 h-8 border-r border-b border-outline-variant/20 pointer-events-none" />
      </main>

      <FooterTicker />
    </div>
  );
}
