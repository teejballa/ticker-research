'use client';

// src/components/landing/sections.tsx
// Below-the-fold landing sections. Ported from the Claude Design handoff
// bundle (cipher/project/src/landing.jsx) and wired to live data.

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DocStack, SignalBrain, MemoIcon, TrendMountain, OrbitDots, Planet, SectorTile,
} from './illustrations';
import { useBurst } from './effects';

/* ─── Sparkline ─────────────────────────────────────────────────── */
function seedFor(sym: string) {
  let s = 0;
  for (let i = 0; i < sym.length; i++) s += sym.charCodeAt(i) * (i + 1);
  return (s % 90) / 10 + 1;
}
function sparkPath(seed: number, w = 80, h = 28, points = 24) {
  let v = 50;
  const ys: number[] = [];
  for (let i = 0; i < points; i++) {
    const s = Math.sin(seed * 9.31 + i * 0.7) * 4;
    const n = (Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453) % 1;
    v += s + (n - 0.5) * 6;
    v = Math.max(8, Math.min(92, v));
    ys.push(v);
  }
  return ys
    .map((y, i) => `${i === 0 ? 'M' : 'L'}${((i / (points - 1)) * w).toFixed(2)},${(h - (y / 100) * h).toFixed(2)}`)
    .join(' ');
}
function Spark({ seed, up }: { seed: number; up: boolean }) {
  return (
    <svg width="80" height="28" viewBox="0 0 80 28" fill="none">
      <path d={sparkPath(seed)} stroke={up ? 'var(--teal)' : 'var(--rose)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Pipeline ──────────────────────────────────────────────────── */
export function PipelineSection() {
  const phases = [
    {
      key: '01', id: 'p01', tag: 'Step · 01', label: 'Collect',
      desc: 'SEC filings, earnings transcripts, market data, news, and community discussion — pulled in parallel from six sources.',
      tokens: ['SEC_EDGAR', 'EARNINGS_CALLS', 'YAHOO_FINANCE', 'REUTERS', 'STOCKTWITS'],
      illust: <DocStack size={96} />,
    },
    {
      key: '02', id: 'p02', tag: 'Step · 02', label: 'Analyze',
      desc: 'A reasoning model reads the source pack and extracts the bull case, bear case, and risk factors — each tied to the document it came from.',
      tokens: ['CLAUDE', 'GEMINI', 'FINBERT', 'LOUGHRAN-MCDONALD'],
      illust: <SignalBrain size={96} />,
    },
    {
      key: '03', id: 'p03', tag: 'Step · 03', label: 'Report',
      desc: 'A structured memo: recommendation with confidence, forward outlook with price-target context, and every claim linked to its source.',
      tokens: ['CALIBRATION', 'VS_SPY', 'BACKTEST'],
      illust: <MemoIcon size={96} />,
    },
  ];
  return (
    <section className="section" id="pipeline">
      <div style={{ maxWidth: '640px' }}>
        <div className="eyebrow">How Cipher works</div>
        <h2 className="h-display">From a thousand pages of disclosure to <em>one cited memo.</em></h2>
        <p className="lede">Every report follows the same three steps — and the work is auditable end-to-end.</p>
      </div>
      <div className="pipeline">
        {phases.map((p) => (
          <div key={p.key} className={`pcard ${p.id}`}>
            <span className="pnum">{p.key}</span>
            <span className="ptag">{p.tag}</span>
            <div style={{ marginBottom: '18px' }}>{p.illust}</div>
            <h3>{p.label}</h3>
            <p>{p.desc}</p>
            <div className="psource">
              {p.tokens.map((t) => <span key={t} className="ptok">{t}</span>)}
            </div>
            <div className="ptrack">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <span key={i} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Sector coverage map ───────────────────────────────────────── */
interface SectorRow {
  label: string; hex: string; glyph: string;
  tickers: string[]; leadChange: number | null;
}
const FALLBACK_SECTORS: SectorRow[] = [
  { label: 'Semiconductors', hex: '#1B27A0', glyph: 'Σ', tickers: ['NVDA', 'AMD', 'TSM'], leadChange: null },
  { label: 'Consumer Tech',  hex: '#D97757', glyph: '↗', tickers: ['AAPL', 'SONY', 'DELL'], leadChange: null },
  { label: 'Enterprise SaaS',hex: '#0F8A5B', glyph: '▲', tickers: ['MSFT', 'CRM', 'NOW'], leadChange: null },
  { label: 'Energy',         hex: '#C76B2E', glyph: '◐', tickers: ['XOM', 'CVX', 'BP'], leadChange: null },
  { label: 'Biotech',        hex: '#7A5AE0', glyph: 'α', tickers: ['LLY', 'REGN', 'VRTX'], leadChange: null },
  { label: 'Banking',        hex: '#3D5C8E', glyph: '$', tickers: ['JPM', 'BAC', 'C'], leadChange: null },
];

export function SectorGrid() {
  const router = useRouter();
  const [sectors, setSectors] = useState<SectorRow[]>(FALLBACK_SECTORS);

  useEffect(() => {
    fetch('/api/sectors')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.sectors) && data.sectors.length) setSectors(data.sectors);
      })
      .catch(() => {/* keep fallback */});
  }, []);

  return (
    <section className="section" id="sectors">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '20px', marginBottom: '40px' }}>
        <div style={{ maxWidth: '560px' }}>
          <div className="eyebrow">Coverage map</div>
          <h2 className="h-display">A research memo for <em>every sector.</em></h2>
          <p className="lede" style={{ margin: 0 }}>Sentiment, drivers, and outlook calibrated per cap-class and signal class — not one-size-fits-all.</p>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.22em', color: 'var(--ink-3)', textTransform: 'uppercase', textAlign: 'right' }}>
          <div style={{ marginBottom: '6px' }}>Active coverage</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: '32px', fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.025em' }}>
            {sectors.length} sectors
          </div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: '14px' }}>
        {sectors.map((s) => (
          <div
            key={s.label}
            onClick={() => router.push(`/research/${s.tickers[0]}`)}
            style={{ cursor: 'pointer', transition: 'transform 0.18s ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-3px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <SectorTile label={s.label} hex={s.hex} glyph={s.glyph} />
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              {s.tickers.map((t) => (
                <span key={t} style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '2px', background: 'var(--bg)', border: '1px solid var(--rule)', color: 'var(--ink-2)', letterSpacing: '0.06em' }}>{t}</span>
              ))}
              {s.leadChange != null && (
                <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600, color: s.leadChange >= 0 ? 'var(--teal)' : 'var(--rose)' }}>
                  {s.leadChange >= 0 ? '▲ +' : '▼ '}{s.leadChange.toFixed(2)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Market snapshot ───────────────────────────────────────────── */
interface SnapItem { sym: string; name: string; price: string | null; chg: string | null; up: boolean; }

export function MarketSnapshot() {
  const router = useRouter();
  const [items, setItems] = useState<SnapItem[]>([]);
  const [at, setAt] = useState<string | null>(null);
  const [flashes, setFlashes] = useState<Record<string, 'up' | 'down'>>({});
  const prevPrices = useRef<Record<string, string | null>>({});

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/market-snapshot');
        const data = await res.json();
        if (!Array.isArray(data.items)) return;
        const flash: Record<string, 'up' | 'down'> = {};
        for (const it of data.items as SnapItem[]) {
          const prev = prevPrices.current[it.sym];
          if (prev != null && it.price != null && prev !== it.price) {
            flash[it.sym] = Number(it.price) >= Number(prev) ? 'up' : 'down';
          }
          prevPrices.current[it.sym] = it.price;
        }
        setItems(data.items);
        setAt(data.fetched_at ?? null);
        if (Object.keys(flash).length) {
          setFlashes(flash);
          setTimeout(() => setFlashes({}), 700);
        }
      } catch {/* non-fatal */}
    }
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="section" id="snapshot">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '40px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div className="eyebrow">Live feed</div>
          <h2 className="h-display" style={{ margin: 0 }}>The <em>tape</em> never sleeps.</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <div className="market-pill" style={{ background: 'var(--surface)', border: '1px solid var(--rule)', padding: '6px 10px', borderRadius: '999px' }}>
            <span className="live" />
            Regular session · NYSE / NASDAQ
          </div>
          {at && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--ink-3)' }}>
              updated {new Date(at).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
      <div className="snapshot-shell">
        <div className="snapshot-head">
          <span>Symbol</span>
          <span>Name</span>
          <span style={{ textAlign: 'right' }}>Last</span>
          <span style={{ textAlign: 'right' }}>Change</span>
          <span style={{ textAlign: 'right' }}>Trend</span>
        </div>
        {items.length === 0 ? (
          <div className="snapshot-row" style={{ cursor: 'default' }}>
            <span className="name" style={{ gridColumn: '1 / -1', fontFamily: 'var(--mono)', fontSize: '12px' }}>
              Loading market data…
            </span>
          </div>
        ) : items.map((r) => (
          <div
            key={r.sym}
            className={`snapshot-row ${flashes[r.sym] === 'up' ? 'flash-up' : ''} ${flashes[r.sym] === 'down' ? 'flash-down' : ''}`}
            onClick={() => router.push(`/research/${r.sym}`)}
          >
            <span className="sym">{r.sym}</span>
            <span className="name">{r.name}</span>
            <span className="price">{r.price != null ? `$${r.price}` : '—'}</span>
            <span className={`chg ${r.up ? 'up' : 'down'}`}>
              {r.up ? '▲ ' : '▼ '}{r.chg ?? '—'}
            </span>
            <span className="sparkline"><Spark seed={seedFor(r.sym)} up={r.up} /></span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Sample report teaser ──────────────────────────────────────── */
export function SampleReport() {
  const router = useRouter();
  const [aapl, setAapl] = useState<{ price: string | null; chg: string | null; up: boolean }>({
    price: '210.84', chg: '+1.32%', up: true,
  });

  useEffect(() => {
    fetch('/api/market-snapshot')
      .then((r) => r.json())
      .then((data) => {
        const hit = (data.items ?? []).find((i: SnapItem) => i.sym === 'AAPL');
        if (hit) setAapl({ price: hit.price, chg: hit.chg, up: hit.up });
      })
      .catch(() => {/* keep sample */});
  }, []);

  return (
    <section className="section" id="sample">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '60px', alignItems: 'center' }} className="sample-row">
        <div>
          <div className="eyebrow">An example</div>
          <h2 className="h-display">A report you can <em>actually act on.</em></h2>
          <p className="lede" style={{ marginBottom: '28px' }}>
            Every conclusion in a Cipher report links back to the filing, transcript, or article it came from. Click a citation, see the source.
          </p>
          <div style={{ margin: '0 0 24px', display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
            <TrendMountain width={280} height={120} />
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '4px' }}>12-mo vs SPY</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: '32px', fontWeight: 700, color: 'var(--teal)', letterSpacing: '-0.025em' }}>+4.8 pp</div>
            </div>
          </div>
          <button className="nav-cta" onClick={() => router.push('/research/AAPL')}>
            Open the AAPL sample <span style={{ fontSize: '14px' }}>→</span>
          </button>
        </div>

        <div className="report-card">
          <div className="report-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="ticker-tag">AAPL</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '12px', color: 'var(--ink-2)', fontWeight: 600 }}>APPLE INC.</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{aapl.price != null ? `$${aapl.price}` : '—'}</span>
              <span style={{ fontFamily: 'var(--mono)', color: aapl.up ? 'var(--teal)' : 'var(--rose)', fontSize: '12px' }}>{aapl.chg}</span>
            </div>
          </div>
          <div className="report-body">
            <div>
              <h2 style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 600, margin: '0 0 12px' }}>Thesis</h2>
              <div className="thesis">
                Services revenue continues to <em>insulate margins</em> from iPhone unit softness, but China remains the swing factor for the next two quarters.
              </div>
              <div className="bull-bear">
                <div className="bb-col bull">
                  <h5>Bull · 3</h5>
                  <ul>
                    <li>Services hit 30% of revenue, +14% YoY <span className="cite">10-Q · p.14</span></li>
                    <li>Gross margin held 46.2% despite mix shift <span className="cite">Q3 call</span></li>
                    <li>$26B buyback announced <span className="cite">8-K</span></li>
                  </ul>
                </div>
                <div className="bb-col bear">
                  <h5>Bear · 2</h5>
                  <ul>
                    <li>Greater China revenue −6.5% YoY <span className="cite">10-Q · p.22</span></li>
                    <li>AI feature rollout delayed in 4 markets <span className="cite">Reuters</span></li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="rec">
              <h2 style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 600, margin: '0 0 4px' }}>Recommendation</h2>
              <span className="rec-pill">▲ Constructive · 12mo</span>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '8px' }}>Confidence</div>
                <div className="conf">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                    <span key={i} className={`conf-block ${i <= 6 ? 'on' : ''}`} />
                  ))}
                  <span className="conf-label">6 / 8</span>
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '6px' }}>vs. S&amp;P 500 · 12mo</div>
                <div style={{ fontFamily: 'var(--display)', fontSize: '30px', color: 'var(--teal)' }}>+4.8 pp</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--ink-3)' }}>Back-tested · n=148</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── How it works ──────────────────────────────────────────────── */
export function HowItWorks() {
  const features = [
    { k: 'f1', icon: 'S/E', h: 'Primary sources, not summaries.', p: 'Cipher reads 10-Ks, 10-Qs, 8-Ks, and earnings transcripts directly. Bull and bear points cite the exact filing they came from.', toks: ['SEC_EDGAR', 'YAHOO_FINANCE'] },
    { k: 'f2', icon: '± / σ', h: 'Calibrated against the market.', p: 'Each recommendation carries a confidence level back-tested against the S&P 500 — so a "bullish" call comes with its historical hit rate.', toks: ['CALIBRATION', 'VS_SPY'] },
    { k: 'f3', icon: 'Δ /∇', h: 'Sentiment with receipts.', p: "We don't just count positive words. Cipher applies FinBERT and Loughran-McDonald to filings and call transcripts, with per-aspect aggregation.", toks: ['FINBERT', 'L-M', 'PER_ASPECT'] },
    { k: 'f4', icon: '</>', h: 'Auditable end-to-end.', p: 'Every model card, every dataset card, every calibration cron — published. Read the math, not just the recommendation.', toks: ['MODEL_CARDS', 'DATASET_CARDS'] },
  ];
  return (
    <section className="section" id="features">
      <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto' }}>
        <div className="eyebrow" style={{ marginLeft: 'auto', marginRight: 'auto' }}>The principles</div>
        <h2 className="h-display">Research that <em>shows its work.</em></h2>
        <p className="lede" style={{ margin: '0 auto' }}>Four ideas that make Cipher reports trustworthy.</p>
      </div>
      <div className="feature-grid">
        {features.map((f) => (
          <div key={f.k} className={`feature ${f.k}`}>
            <span className="ficon">{f.icon}</span>
            <h3>{f.h}</h3>
            <p>{f.p}</p>
            <div className="ftoks">
              {f.toks.map((t) => <span key={t} className="ftok">{t}</span>)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─── Stack strip ───────────────────────────────────────────────── */
export function StackStrip() {
  return (
    <section className="section-tight" style={{ maxWidth: '1280px', margin: '0 auto', padding: '60px 32px', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.32em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '28px', fontWeight: 600 }}>
        Built on · Data and model stack
      </div>
      <div className="stack">
        {['Claude', 'Gemini', 'Yahoo! Finance', 'SEC EDGAR', 'FinBERT'].map((n) => (
          <span key={n} className="stack-item">{n}</span>
        ))}
      </div>
    </section>
  );
}

/* ─── CTA ───────────────────────────────────────────────────────── */
export function CTASection() {
  const router = useRouter();
  const [v, setV] = useState('');
  const [trigger, burstLayer] = useBurst();
  return (
    <section style={{ maxWidth: '1280px', margin: '100px auto', padding: '0 32px' }}>
      <div className="cta">
        <div style={{ position: 'absolute', right: '-120px', top: '50%', transform: 'translateY(-50%)', opacity: 0.7, pointerEvents: 'none' }}>
          <OrbitDots size={460} />
        </div>
        <div style={{ position: 'absolute', left: '40px', top: '40px', opacity: 0.85, pointerEvents: 'none' }}>
          <Planet size={84} />
        </div>
        <h2 style={{ position: 'relative', zIndex: 1 }}>Research a <em>ticker.</em></h2>
        <p style={{ position: 'relative', zIndex: 1 }}>A structured memo with sources, drivers, outlook, and a calibrated recommendation — in under a minute.</p>
        <div className="row" style={{ position: 'relative', zIndex: 2 }}>
          <form
            className="cta-input"
            onSubmit={(e) => { e.preventDefault(); if (v.trim()) router.push(`/research/${v.toUpperCase().trim()}`); }}
          >
            <input
              value={v}
              onChange={(e) => setV(e.target.value.toUpperCase())}
              placeholder="AAPL · NVDA · TSLA …"
              aria-label="Ticker symbol"
            />
            <button type="submit" style={{ position: 'relative' }} onClick={trigger}>
              Decipher <span>→</span>
              {burstLayer}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ────────────────────────────────────────────────────── */
export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <div style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: '14px', letterSpacing: '0.18em', color: 'var(--indigo)', marginBottom: '20px' }}>CIPHER</div>
          <div className="h-display" style={{ fontSize: '32px', margin: 0 }}>Source-cited <em>equity research,</em> for everyone.</div>
          <div className="footer-meta" style={{ marginTop: '20px' }}>
            <span>© 2026 Cipher Research</span>
            <span>Not investment advice</span>
            <span>Educational use only</span>
          </div>
        </div>
        <div>
          <h6>Product</h6>
          <ul>
            <li><Link href="/terminal">Research terminal</Link></li>
            <li><Link href="/insights">Insights</Link></li>
            <li><Link href="/dashboard">Dashboard</Link></li>
            <li><Link href="/auth/signin">Sign in</Link></li>
          </ul>
        </div>
        <div>
          <h6>Methods</h6>
          <ul>
            <li><Link href="/insights/calibration">Calibration</Link></li>
            <li><Link href="/insights/sentiment-sources">Sentiment sources</Link></li>
            <li><Link href="/insights/sentiment-health">Pipeline health</Link></li>
            <li><Link href="/insights">Backtests</Link></li>
          </ul>
        </div>
        <div>
          <h6>Coverage</h6>
          <ul>
            <li><Link href="/research/SPY">S&amp;P 500 · SPY</Link></li>
            <li><Link href="/research/QQQ">Nasdaq 100 · QQQ</Link></li>
            <li><Link href="/terminal">Search a ticker</Link></li>
            <li><Link href="/insights">Methodology</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
