// src/components/landing/illustrations.tsx
// Bright decorative SVGs for the light-mode landing page. Ported from the
// Claude Design handoff bundle (cipher/project/src/illustrations.jsx).

import React from 'react';

export function Planet({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <ellipse cx="60" cy="60" rx="58" ry="14" fill="none" stroke="#2F44D6" strokeWidth="2" opacity="0.5" />
      <circle cx="60" cy="60" r="32" fill="#D97757" />
      <ellipse cx="48" cy="50" rx="10" ry="6" fill="#FFFFFF" opacity="0.25" />
      <ellipse cx="70" cy="70" rx="8" ry="4" fill="#FFFFFF" opacity="0.2" />
      <ellipse cx="60" cy="60" rx="58" ry="14" fill="none" stroke="#1B1A17" strokeWidth="2" />
    </svg>
  );
}

export function Constellation({
  width = 240,
  height = 140,
  color = '#2F44D6',
}: { width?: number; height?: number; color?: string }) {
  const stars: [number, number][] = [
    [20, 110], [50, 80], [80, 100], [110, 60], [140, 78], [170, 40], [200, 60], [220, 30],
  ];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={stars.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.4"
      />
      {stars.map(([x, y], i) => {
        const r = i % 3 === 0 ? 5 : 3;
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={r} fill={color} />
            <circle cx={x} cy={y} r={r} fill="none" stroke={color} strokeWidth="1" opacity="0.3">
              <animate attributeName="r" values={`${r};${r + 6};${r}`} dur={`${3 + i * 0.3}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.4;0;0.4" dur={`${3 + i * 0.3}s`} repeatCount="indefinite" />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

export function DocStack({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <rect x="20" y="34" width="62" height="78" rx="2" fill="#1B27A0" />
      <rect x="28" y="26" width="62" height="78" rx="2" fill="#2F44D6" />
      <rect x="36" y="18" width="62" height="78" rx="2" fill="#FFFFFF" stroke="#1B1A17" strokeWidth="2" />
      {[30, 40, 50, 60, 70].map((y, i) => (
        <rect key={i} x="44" y={y} width={i === 0 ? 40 : i === 4 ? 26 : 46} height="3" fill="#1B1A17" opacity={i === 0 ? 1 : 0.18} />
      ))}
      <rect x="44" y="84" width="20" height="6" fill="#0F8A5B" />
    </svg>
  );
}

export function SignalBrain({ size = 120 }: { size?: number }) {
  const nodes: [number, number][] = [
    [40, 40], [80, 36], [30, 72], [82, 80], [60, 60], [55, 95], [95, 56],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="46" fill="#E4E5FF" />
      {nodes.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" fill="#2F44D6" />)}
      <g stroke="#2F44D6" strokeWidth="1.5" fill="none" opacity="0.6">
        <line x1="40" y1="40" x2="60" y2="60" />
        <line x1="80" y1="36" x2="60" y2="60" />
        <line x1="30" y1="72" x2="60" y2="60" />
        <line x1="82" y1="80" x2="60" y2="60" />
        <line x1="95" y1="56" x2="80" y2="36" />
        <line x1="55" y1="95" x2="60" y2="60" />
        <line x1="55" y1="95" x2="30" y2="72" />
      </g>
      <circle cx="60" cy="60" r="9" fill="#1B27A0" />
    </svg>
  );
}

export function MemoIcon({ size = 120 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120">
      <rect x="22" y="14" width="78" height="92" rx="4" fill="#FFFFFF" stroke="#1B1A17" strokeWidth="2" />
      <rect x="22" y="14" width="78" height="14" fill="#0F8A5B" />
      <text x="61" y="25" fontFamily="var(--mono)" fontSize="10" fontWeight="700" fill="#FFFFFF" textAnchor="middle">▲ BULL</text>
      {[40, 50, 60, 72, 82].map((y, i) => (
        <rect key={i} x="32" y={y} width={i === 3 ? 36 : 58} height="3" fill="#1B1A17" opacity="0.2" />
      ))}
      <polyline points="32,98 44,90 56,94 70,84 80,86 92,76" fill="none" stroke="#D97757" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function TrendMountain({ width = 320, height = 140 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F8A5B" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#0F8A5B" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M0 ${height} L40 100 L80 110 L120 70 L160 80 L200 40 L240 60 L280 30 L${width} 20 L${width} ${height} Z`} fill="url(#trend-fill)" />
      <path d={`M0 ${height} L40 100 L80 110 L120 70 L160 80 L200 40 L240 60 L280 30 L${width} 20`} fill="none" stroke="#0F8A5B" strokeWidth="2.5" strokeLinejoin="round" />
      {([[120, 70], [200, 40], [280, 30]] as [number, number][]).map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill="#FFFFFF" stroke="#0F8A5B" strokeWidth="2" />
      ))}
    </svg>
  );
}

export function OrbitDots({ size = 360 }: { size?: number }) {
  const dots = [
    { r: 80,  speed: 18, color: '#D97757', size: 7, phase: 0 },
    { r: 130, speed: 26, color: '#0F8A5B', size: 9, phase: 0 },
    { r: 180, speed: 36, color: '#7A5AE0', size: 6, phase: 0 },
    { r: 130, speed: 22, color: '#E6B453', size: 5, phase: 180 },
    { r: 80,  speed: 14, color: '#5C8AC4', size: 5, phase: 90 },
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 360 360" style={{ overflow: 'visible' }}>
      {[80, 130, 180].map((r) => (
        <circle key={r} cx="180" cy="180" r={r} fill="none" stroke="var(--rule)" strokeWidth="1" strokeDasharray="2 6" />
      ))}
      <circle cx="180" cy="180" r="14" fill="#2F44D6" />
      <circle cx="180" cy="180" r="22" fill="none" stroke="#2F44D6" strokeWidth="1.5" opacity="0.3" />
      {dots.map((d, i) => (
        <g key={i}>
          <circle cx="180" cy={180 - d.r} r={d.size} fill={d.color}>
            <animateTransform
              attributeName="transform" type="rotate"
              from={`${d.phase} 180 180`} to={`${d.phase + 360} 180 180`}
              dur={`${d.speed}s`} repeatCount="indefinite"
            />
          </circle>
        </g>
      ))}
    </svg>
  );
}

export function SectorTile({ label, hex, glyph }: { label: string; hex: string; glyph: string }) {
  return (
    <div style={{ background: hex, color: '#FFFFFF', padding: '20px', borderRadius: '12px', position: 'relative', overflow: 'hidden', aspectRatio: '1.2' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.22em', textTransform: 'uppercase', opacity: 0.7 }}>Sector</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: '26px', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, marginTop: '8px' }}>{label}</div>
      <div style={{ position: 'absolute', right: '-20px', bottom: '-20px', fontSize: '120px', lineHeight: 1, opacity: 0.18, fontFamily: 'var(--display)', fontWeight: 800 }}>{glyph}</div>
    </div>
  );
}

interface OrbitRing {
  label: string;
  r: number;
  color: string;
  dur: number;
  planets: { size: number; color: string; phase: number; label: string }[];
}

export function SentimentOrbits({ size = 460, rings }: { size?: number; rings?: OrbitRing[] }) {
  const cx = size / 2;
  const cy = size / 2;
  const defaultRings: OrbitRing[] = [
    {
      label: 'Niche', r: size * 0.16, color: '#D97757', dur: 16,
      planets: [
        { size: 8, color: '#D97757', phase: 0,   label: 'r/wallstreetbets' },
        { size: 5, color: '#FFB78E', phase: 180, label: 'earnings whispers' },
      ],
    },
    {
      label: 'Transitional', r: size * 0.30, color: '#7A5AE0', dur: 28,
      planets: [
        { size: 9, color: '#7A5AE0', phase: 35,  label: 'Bloomberg terminals' },
        { size: 6, color: '#A38AFF', phase: 170, label: 'FactSet alerts' },
        { size: 4, color: '#E6B453', phase: 270, label: 'sell-side notes' },
      ],
    },
    {
      label: 'Mainstream', r: size * 0.44, color: '#2F44D6', dur: 44,
      planets: [
        { size: 11, color: '#2F44D6', phase: 60,  label: 'WSJ · NYT' },
        { size: 7,  color: '#5C8AC4', phase: 200, label: 'CNBC tickers' },
        { size: 5,  color: '#0F8A5B', phase: 320, label: 'sector ETF flow' },
      ],
    },
  ];
  const data = rings ?? defaultRings;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: 'visible', display: 'block' }}>
      <circle cx={cx} cy={cy} r="24" fill="var(--ink)" />
      <text x={cx} y={cy + 4} fontFamily="var(--mono)" fontWeight="700" fontSize="10" fill="var(--bg)" textAnchor="middle" letterSpacing="0.12em">TICKER</text>
      <circle cx={cx} cy={cy} r="32" fill="none" stroke="var(--ink)" strokeWidth="1" opacity="0.18" />
      {data.map((ring, i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={ring.r} fill="none" stroke={ring.color} strokeWidth="1" strokeDasharray="3 6" opacity="0.6" />
          <g transform={`translate(${cx + ring.r * 0.72}, ${cy - ring.r * 0.72})`}>
            <line x1="0" y1="0" x2="22" y2="-14" stroke={ring.color} strokeWidth="1" opacity="0.7" />
            <line x1="22" y1="-14" x2="68" y2="-14" stroke={ring.color} strokeWidth="1" opacity="0.7" />
            <text x="72" y="-18" fontFamily="var(--mono)" fontWeight="700" fontSize="10" letterSpacing="0.22em" fill={ring.color}>
              {ring.label.toUpperCase()}
            </text>
            <text x="72" y="-4" fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)" letterSpacing="0.06em">
              tier 0{i + 1} · {ring.planets.length} signals
            </text>
          </g>
          {ring.planets.map((p, j) => (
            <g
              key={j}
              style={{
                transformOrigin: `${cx}px ${cy}px`,
                transformBox: 'view-box',
                animation: `orbit ${ring.dur}s linear infinite`,
                animationDelay: `${-(p.phase / 360) * ring.dur}s`,
              }}
            >
              <circle cx={cx + ring.r} cy={cy} r={p.size} fill={p.color}>
                <title>{p.label}</title>
              </circle>
              <circle cx={cx + ring.r} cy={cy} r={p.size + 4} fill="none" stroke={p.color} strokeWidth="1" opacity="0.35">
                <animate attributeName="r" values={`${p.size + 4};${p.size + 9};${p.size + 4}`} dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0;0.4" dur="3s" repeatCount="indefinite" />
              </circle>
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}
