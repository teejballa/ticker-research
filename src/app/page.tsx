'use client';

import { useState, useEffect, useRef } from 'react';
import TickerSearch from '@/components/TickerSearch';
import { SetupWizard } from '@/components/SetupWizard';
import ReportHistory from '@/components/ReportHistory';

const TAPE = [
  { sym: 'AAPL',  price: '189.84', chg: '+0.43%', up: true  },
  { sym: 'MSFT',  price: '415.32', chg: '+1.12%', up: true  },
  { sym: 'GOOGL', price: '175.68', chg: '-0.28%', up: false },
  { sym: 'AMZN',  price: '228.45', chg: '+0.87%', up: true  },
  { sym: 'TSLA',  price: '177.20', chg: '-2.14%', up: false },
  { sym: 'NVDA',  price: '924.76', chg: '+3.28%', up: true  },
  { sym: 'META',  price: '527.93', chg: '+0.65%', up: true  },
  { sym: 'JPM',   price: '224.89', chg: '-0.45%', up: false },
  { sym: 'V',     price: '289.34', chg: '+0.33%', up: true  },
  { sym: 'SPY',   price: '528.43', chg: '+0.18%', up: true  },
  { sym: 'QQQ',   price: '451.72', chg: '+0.32%', up: true  },
  { sym: 'LLY',   price: '892.15', chg: '+2.11%', up: true  },
  { sym: 'XOM',   price: '121.78', chg: '-0.92%', up: false },
  { sym: 'BRK.B', price: '404.12', chg: '+0.21%', up: true  },
];

interface SetupStatus {
  pythonOk: boolean;
  notebooklmOk: boolean;
  authOk: boolean;
  allOk: boolean;
  userEmail: string | null;  // null = not connected or extraction failed
}

function truncateEmail(email: string, maxLen = 24): string {
  if (email.length <= maxLen) return email;
  return email.slice(0, 21) + '\u2026'; // Unicode ellipsis
}

function getMarketStatus(): { open: boolean; label: string } {
  const ny = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
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
  const [time, setTime]       = useState('');
  const [dateStr, setDateStr] = useState('');

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

  async function fetchSetupStatus() {
    try {
      const res = await fetch('/api/setup/status');
      if (!res.ok) {
        setSetupStatus({ pythonOk: true, notebooklmOk: true, authOk: true, allOk: true, userEmail: null });
        return;
      }
      const data: SetupStatus = await res.json();
      setSetupStatus(data);
    } catch {
      setSetupStatus({ pythonOk: true, notebooklmOk: true, authOk: true, allOk: true, userEmail: null });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSetupStatus();

    // Clock — client-only; suppressHydrationWarning handles first-render diff
    function tick() {
      const ny = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
      setTime(ny.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ET');
      setDateStr(ny.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase());
    }
    tick();
    const clockId = setInterval(tick, 1000);

    // ── Scroll handler ─────────────────────────────────────────
    function updateAnim() {
      if (!sceneRef.current) return;
      const rect       = sceneRef.current.getBoundingClientRect();
      const scrollable = sceneRef.current.offsetHeight - window.innerHeight;
      if (scrollable <= 0) return;

      const p = Math.max(0, Math.min(1, -rect.top / scrollable));

      // Hero fades + spreads across first ~36% of scroll
      const heroAlpha     = Math.max(0, 1 - p * 2.8);
      const letterSpacing = 0.18 + p * 2.6;
      const subAlpha      = Math.max(0, 1 - p * 4.0);

      // Image rises starting at 5% scroll, fully visible by 50%
      // This gives user clear feedback very early in the scroll scene
      const monPhase = Math.max(0, Math.min(1, (p - 0.05) / 0.45));

      setAnim({ heroAlpha, letterSpacing, subAlpha, monPhase, progress: p });
    }

    function onScroll() {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(updateAnim);
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      clearInterval(clockId);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const showSearch = !loading && (setupStatus?.allOk ?? true);
  const showWizard = !loading && setupStatus !== null && !setupStatus.allOk;
  const market     = getMarketStatus();

  // Derived transform values
  const monTranslateY = `${(1 - anim.monPhase) * 100}vh`;
  const monScale      = 0.88 + anim.monPhase * 0.12;

  return (
    <div className="bg-[#080a0f]">

      {/* ── FIXED NAV ──────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#1a2d42] bg-[#080a0f]/95 backdrop-blur-md">
        <div className="max-w-screen-xl mx-auto px-5 h-11 flex items-center justify-between gap-4">

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-[#f59e0b] font-bold text-base tracking-[0.22em] glow-amber-text">EQUINFO</span>
            <span className="hidden sm:block text-[#2a3d52]">│</span>
            <span className="hidden sm:block text-[#4a6a8a] text-[10px] tracking-[0.28em]">RESEARCH TERMINAL</span>
          </div>

          <div className="hidden md:flex items-center gap-5 text-[10px] text-[#3d5e7a] tracking-[0.2em]">
            <span>NYSE</span><span>NASDAQ</span><span>AMEX</span><span>OTC</span>
          </div>

          <div className="flex items-center gap-4 text-[10px] shrink-0">
            <span suppressHydrationWarning className="text-[#3a5a78] hidden sm:block">{dateStr}</span>
            <span suppressHydrationWarning className="text-[#4d6f8a] tabular-nums hidden sm:block">{time}</span>
            <div className="hidden md:flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${market.open ? 'bg-emerald-500 status-dot-live' : 'bg-[#2a3d52]'}`} />
              <span className={`tracking-wider ${market.open ? 'text-emerald-400' : 'text-[#3a5a78]'}`}>{market.label}</span>
            </div>
            {/* NavIdentity — email or NOT CONNECTED */}
            {setupStatus && (
              <span
                data-testid="nav-identity"
                className={`hidden sm:block tracking-[0.2em] text-[10px] ${
                  setupStatus.userEmail
                    ? 'text-[#f59e0b]'
                    : 'text-[#3a5a78] underline cursor-pointer hover:text-[#5a7a98]'
                }`}
              >
                {setupStatus.userEmail
                  ? truncateEmail(setupStatus.userEmail)
                  : 'NOT CONNECTED'
                }
              </span>
            )}
            <button className="nav-cta-btn">Analyze a Ticker →</button>
          </div>

        </div>
      </header>

      {/* ── HERO SECTION ──────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 pt-11 overflow-hidden">
        <div className="absolute inset-0 dot-grid pointer-events-none" />
        <div className="hero-orb" />

        <div className="absolute inset-0 flex justify-between pointer-events-none overflow-hidden select-none">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-px bg-[#1a2d42]/50 h-full" />
          ))}
        </div>

        <span className="absolute top-16 left-5 text-[9px] text-[#2a4560] tracking-widest select-none hidden sm:block">SYS:EQI-001 / R2.0</span>
        <span className="absolute top-16 right-5 text-[9px] text-[#2a4560] tracking-widest select-none hidden md:block">NODE:ANTHROPIC×GEMINI</span>
        <span className="absolute bottom-14 left-5 text-[9px] text-[#2a4560] tracking-widest select-none hidden sm:block">LOC:US-EAST / LIVE</span>
        <span className="absolute bottom-14 right-5 text-[9px] text-[#2a4560] tracking-widest select-none hidden md:block">ENG:NOTEBOOKLM×CLAUDE</span>

        <div className="w-full max-w-lg relative z-10 py-14">

          <div className="text-center mb-10 fade-in">
            <h1 className="text-[64px] sm:text-[80px] font-bold tracking-[0.18em] leading-none text-[#f59e0b] glow-amber-text">
              EQUINFO
            </h1>
            <div className="mt-4 flex items-center justify-center gap-3 text-[11px] text-[#5a7a9a] tracking-[0.45em]">
              <span>AI</span>
              <span className="text-[#2a4560]">·</span>
              <span>EQUITY</span>
              <span className="text-[#2a4560]">·</span>
              <span>INTELLIGENCE</span>
            </div>
            <p className="mt-5 text-[18px] sm:text-[22px] font-semibold text-white/80 tracking-wide leading-snug hero-tagline">
              Research before you trade.
            </p>
          </div>

          <div className="fade-in-d1 relative z-50">
            <div className="mb-1.5 flex items-center gap-2 text-[10px] select-none">
              <span className="text-[#f59e0b]/60">$</span>
              <span className="text-[#3d5e7a] tracking-wider">equinfo search --mode=live --depth=full</span>
            </div>
            {loading && (
              <div className="panel p-4 flex items-center gap-3">
                <span className="w-3 h-3 border border-[#f59e0b]/50 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-[#4d6f8a] text-[10px] tracking-widest">INITIALIZING SYSTEM...</span>
              </div>
            )}
            {showWizard && <SetupWizard onSetupComplete={fetchSetupStatus} />}
            {showSearch && <TickerSearch />}
          </div>

          {/* Report history — shown when setup status has loaded */}
          {!loading && <ReportHistory />}

          {/* Stats trust bar */}
          <div className="mt-6 fade-in-d2">
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {[
                { val: '6', label: 'AI QUERIES' },
                { val: '2', label: 'MODELS' },
                { val: '100%', label: 'SOURCE-GROUNDED' },
                { val: 'PDF', label: 'EXPORT' },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-[#1a2d42] hidden sm:block">·</span>}
                  <span className="text-[#f59e0b] text-[11px] font-bold tabular-nums">{s.val}</span>
                  <span className="text-[#3d5e7a] text-[9px] tracking-[0.25em]">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 fade-in-d3">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-[#1a2d42]" />
              <span className="text-[9px] text-[#3d5e7a] tracking-[0.4em] select-none">RESEARCH PIPELINE</span>
              <div className="flex-1 h-px bg-[#1a2d42]" />
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { n: '01', label: 'COLLECT',    desc: 'Yahoo Finance + Anthropic web search' },
                { n: '02', label: 'SYNTHESIZE', desc: 'NotebookLM × Gemini AI analysis' },
                { n: '03', label: 'REPORT',     desc: 'Structured, source-grounded output' },
              ].map((s) => (
                <div key={s.n} className="panel p-2.5 hover:border-[#2a3d52] transition-colors duration-200 group cursor-default">
                  <div className="text-[#f59e0b]/30 text-[9px] mb-1 group-hover:text-[#f59e0b]/60 transition-colors">{s.n}</div>
                  <div className="text-[#4d6f8a] text-[9px] tracking-[0.2em] mb-0.5">{s.label}</div>
                  <div className="text-[#3d5e7a] text-[8px] leading-snug">{s.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-14 flex flex-col items-center gap-2 fade-in-d4">
            <span className="text-[9px] text-[#3a5a78] tracking-[0.5em]">SCROLL</span>
            <div className="scroll-cue">
              <div className="scroll-cue-chevron" />
            </div>
          </div>

        </div>
      </section>

      {/* ── SCROLL SCENE: 350vh pinned animation ──────────────────
          Outer div: 350vh tall, scrolls normally.
          Inner div: sticky, pins to top, 100vh tall, overflow hidden
            → clips the image when it's translated below the viewport.
          Animation is 100% state-driven: React owns every style prop,
            no CSS-vs-inline conflicts, no compositing layer surprises.
      */}
      <div ref={sceneRef} style={{ height: '350vh' }}>
        <div style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'hidden' }}>

          <div className="absolute inset-0 dot-grid pointer-events-none" />

          {/* ── Hero text — fades + spreads as user scrolls ── */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
            style={{ opacity: anim.heroAlpha }}
          >
            <div
              className="scene-hero-wordmark font-bold text-[#f59e0b]"
              style={{ letterSpacing: `${anim.letterSpacing}em` }}
            >
              EQUINFO
            </div>
            <div
              className="mt-4 text-[11px] text-[#5a7a9a]"
              style={{ opacity: anim.subAlpha, letterSpacing: '0.5em' }}
            >
              AI · EQUITY · INTELLIGENCE
            </div>
          </div>

          {/* ── App screenshot — rises from below as hero fades ── */}
          {/*
            translateY goes from 100vh (off-screen below, clipped) → 0vh (centered).
            opacity goes from 0 → 1 in sync.
            No will-change here — CPU-composited, guaranteed to be clipped by parent overflow:hidden.
          */}
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              opacity:   anim.monPhase,
              transform: `translateY(${monTranslateY}) scale(${monScale})`,
            }}
          >
            <div className="monitor-glow" />
            <img
              src="/unnamed.jpg"
              alt="Equinfo research terminal"
              className="preview-screenshot"
              draggable={false}
            />
          </div>

          {/* ── Scroll progress indicator ── */}
          <div className="absolute right-5 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
            <div className="text-[7px] text-[#2a4560] tracking-[0.3em]" style={{ writingMode: 'vertical-rl' }}>SCROLL</div>
            <div className="relative w-0.5 h-28 bg-[#1a2d42] rounded overflow-hidden">
              <div
                className="absolute top-0 left-0 w-full bg-[#f59e0b] rounded"
                style={{
                  height:    `${anim.progress * 100}%`,
                  boxShadow: '0 0 6px rgba(245,158,11,0.7)',
                }}
              />
            </div>
            <span className="text-[7px] text-[#2a4560] tabular-nums">{Math.round(anim.progress * 100)}%</span>
          </div>

        </div>
      </div>

      {/* ── MARKET SNAPSHOT ──────────────────────────────────── */}
      <section className="py-16 px-4 border-t border-[#1a2d42] relative overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />
        <div className="max-w-screen-lg mx-auto relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <span className="text-[9px] text-[#3d5e7a] tracking-[0.5em]">MARKET SNAPSHOT</span>
              <span className="text-[9px] text-[#2a4560]">—</span>
              <span className="text-[9px] text-[#2a4560] tracking-widest">SAMPLE COVERAGE</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${market.open ? 'bg-[#26a69a] status-dot-live' : 'bg-[#2a3d52]'}`} />
              <span className={`text-[9px] tracking-wider ${market.open ? 'text-[#26a69a]' : 'text-[#3a5a78]'}`}>{market.label}</span>
            </div>
          </div>
          <div className="market-grid">
            <div className="market-grid-header">
              <span>SYMBOL</span><span>NAME</span><span className="text-right">PRICE</span><span className="text-right">CHANGE</span>
            </div>
            {TAPE.map((t) => (
              <div key={t.sym} className="market-grid-row">
                <span className="market-sym">{t.sym}</span>
                <span className="market-name">{
                  ({ AAPL:'Apple','MSFT':'Microsoft','GOOGL':'Alphabet','AMZN':'Amazon','TSLA':'Tesla','NVDA':'NVIDIA','META':'Meta','JPM':'JPMorgan','V':'Visa','SPY':'S&P 500 ETF','QQQ':'Nasdaq ETF','LLY':'Eli Lilly','XOM':'ExxonMobil','BRK.B':'Berkshire B' } as Record<string,string>)[t.sym] ?? t.sym
                }</span>
                <span className="market-price">${t.price}</span>
                <span className={`market-chg ${t.up ? 'market-chg-up' : 'market-chg-dn'}`}>
                  {t.up ? '▲' : '▼'} {t.chg}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="py-28 px-4 border-t border-[#1a2d42] relative overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-40 pointer-events-none" />
        <div className="max-w-screen-lg mx-auto relative z-10">
          <div className="text-center mb-16">
            <div className="text-[9px] text-[#3d5e7a] tracking-[0.6em] mb-4">HOW IT WORKS</div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#7a9ab8] tracking-[0.15em]">RESEARCH IN THREE STEPS</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-px bg-[#1a2d42]">
            {[
              { n: '01', label: 'DATA COLLECTION', accent: '#f59e0b', desc: 'Yahoo Finance delivers real-time price, volume, fundamentals, and 52-week metrics. Anthropic web search retrieves financial news, SEC filing summaries, and analyst consensus.' },
              { n: '02', label: 'AI SYNTHESIS',    accent: '#8b5cf6', desc: 'NotebookLM creates a private notebook per run, ingests all sources, and fires 6 structured Gemini queries — buy signals, bear risks, valuation, sentiment, momentum, and conviction.' },
              { n: '03', label: 'REPORT OUTPUT',   accent: '#34d399', desc: 'A structured research report with Buy/Hold/Sell assessment, confidence level, bullish/bearish factor breakdown, and full source attribution. Downloadable as PDF.' },
            ].map((step) => (
              <div key={step.n} className="how-step" style={{ '--step-accent': step.accent } as React.CSSProperties}>
                <div className="how-step-number" style={{ color: step.accent }}>{step.n}</div>
                <div className="how-step-bar" style={{ background: step.accent }} />
                <h3 className="how-step-title">{step.label}</h3>
                <p className="how-step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INTELLIGENCE STACK ───────────────────────────────── */}
      <section className="py-16 px-4 border-t border-[#1a2d42]">
        <div className="max-w-screen-lg mx-auto text-center">
          <div className="text-[8px] text-[#2a4560] tracking-[0.6em] mb-8">INTELLIGENCE STACK</div>
          <div className="flex flex-wrap justify-center gap-x-14 gap-y-6">
            {[
              { name: 'CLAUDE',        sub: 'ANTHROPIC',      accent: '#f59e0b' },
              { name: 'GEMINI',        sub: 'GOOGLE DEEPMIND', accent: '#8b5cf6' },
              { name: 'NOTEBOOKLM',   sub: 'RESEARCH AI',     accent: '#8b5cf6' },
              { name: 'YAHOO FINANCE', sub: 'MARKET DATA',     accent: '#26a69a' },
            ].map((p) => (
              <div key={p.name} className="text-center">
                <div className="text-[11px] tracking-[0.25em] font-bold" style={{ color: p.accent }}>{p.name}</div>
                <div className="text-[#2a4560] text-[8px] tracking-[0.35em] mt-1">{p.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TICKER TAPE ──────────────────────────────────────── */}
      <footer className="border-t border-[#1a2d42] bg-[#080a0f] overflow-hidden py-1.5">
        <div className="flex animate-ticker whitespace-nowrap">
          {[...TAPE, ...TAPE].map((t, i) => (
            <span key={i} className="inline-flex items-center gap-2 px-5 text-[10px] shrink-0 select-none">
              <span className="text-[#4d6f8a] tracking-wider">{t.sym}</span>
              <span className="text-[#3d5e7a] tabular-nums">{t.price}</span>
              <span className={`tabular-nums ${t.up ? 'text-[#26a69a]' : 'text-[#ef5350]'}`}>{t.chg}</span>
              <span className="text-[#2a4560]">╱</span>
            </span>
          ))}
        </div>
      </footer>

    </div>
  );
}
