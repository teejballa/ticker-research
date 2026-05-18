'use client';

// src/components/landing/effects.tsx
// Interactive flourishes for the landing page. Ported from the Claude Design
// handoff bundle (cipher/project/src/effects.jsx).

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

// ─── Twinkling starfield (dark-mode hero) ────────────────────────────
export function Starfield({ count = 60 }: { count?: number }) {
  const stars = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const seed = (i * 9301 + 49297) % 233280;
      const r = seed / 233280;
      const r2 = ((seed * 7) % 233280) / 233280;
      return {
        left: r * 100,
        top: r2 * 100,
        size: 1 + (i % 4) * 0.6,
        delay: (i % 7) * 0.5,
        dur: 2.5 + (i % 5) * 0.6,
      };
    });
  }, [count]);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }} aria-hidden>
      {stars.map((s, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            borderRadius: '50%',
            background: 'var(--ink)',
            opacity: 0.35,
            animation: `twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

// ─── Animated number counter ─────────────────────────────────────────
export function CountUp({
  to,
  decimals = 0,
  duration = 1400,
  suffix = '',
  prefix = '',
}: {
  to: number;
  decimals?: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
}) {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    let start: number | null = null;
    const target = Number(to);
    function step(t: number) {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setV(target * eased);
      if (p < 1) raf.current = requestAnimationFrame(step);
    }
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [to, duration]);
  return <>{prefix}{v.toFixed(decimals)}{suffix}</>;
}

// ─── Click burst — small SVG sparkles ────────────────────────────────
interface Burst { id: number; x: number; y: number; }

export function useBurst(): [(e: React.MouseEvent) => void, React.ReactNode] {
  const [bursts, setBursts] = useState<Burst[]>([]);
  const trigger = useCallback((e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now() + Math.random();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setBursts((b) => [...b, { id, x, y }]);
    setTimeout(() => setBursts((b) => b.filter((b2) => b2.id !== id)), 800);
  }, []);

  const flakes: [string, number, number, number][] = [
    ['#D97757', 0, -22, 0.0],
    ['#2F44D6', 18, -10, 0.05],
    ['#0F8A5B', 18, 12, 0.1],
    ['#E6B453', 0, 22, 0.15],
    ['#7A5AE0', -18, 12, 0.2],
    ['#5C8AC4', -18, -10, 0.25],
  ];

  const layer = (
    <span style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
      {bursts.map((b) => (
        <span key={b.id} style={{ position: 'absolute', left: b.x, top: b.y, transform: 'translate(-50%, -50%)' }}>
          {flakes.map(([c, dx, dy, d], i) => (
            <span
              key={i}
              style={{
                position: 'absolute',
                width: '6px', height: '6px',
                borderRadius: '50%',
                background: c,
                left: 0, top: 0,
                transform: 'translate(-50%, -50%)',
                animation: `burst-fly 0.7s ease-out ${d}s forwards`,
                ['--dx' as string]: `${dx}px`,
                ['--dy' as string]: `${dy}px`,
              }}
            />
          ))}
        </span>
      ))}
    </span>
  );
  return [trigger, layer];
}

// ─── Mouse parallax ──────────────────────────────────────────────────
export function useParallax() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const x = (e.clientX / window.innerWidth - 0.5) * 2;
      const y = (e.clientY / window.innerHeight - 0.5) * 2;
      setPos({ x, y });
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);
  return pos;
}
