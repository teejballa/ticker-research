'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';
import TickerSearch from '@/components/TickerSearch';
import { SetupWizard } from '@/components/SetupWizard';

interface SetupStatus {
  pythonOk: boolean;
  notebooklmOk: boolean;
  authOk: boolean;
  allOk: boolean;
  userEmail: string | null;
  nbmSessionActive?: boolean;
}

export default function Terminal() {
  const router = useRouter();
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  const isWebMode = process.env.NEXT_PUBLIC_DEPLOYMENT_MODE === 'web';

  async function fetchSetupStatus() {
    // In web mode, retry up to 4 times (with 1.5s delay) before concluding
    // nbmSessionActive=false. This handles Neon cold-start DB lag that can
    // cause a false miss immediately after VNC capture completes.
    const maxRetries = isWebMode ? 4 : 1;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const res = await fetch('/api/setup/status');
        if (!res.ok) {
          setSetupStatus({ pythonOk: true, notebooklmOk: true, authOk: true, allOk: true, userEmail: null, nbmSessionActive: true });
          setLoading(false);
          return;
        }
        const data: SetupStatus = await res.json();
        // Credential found — stay on terminal
        if (!isWebMode || data.nbmSessionActive !== false) {
          setSetupStatus(data);
          setLoading(false);
          return;
        }
        // nbmSessionActive is false — retry after a short delay before redirecting
        if (attempt < maxRetries - 1) {
          await new Promise<void>(r => setTimeout(r, 1500));
          continue;
        }
        // All retries exhausted — send to setup
        setSetupStatus(data);
        setLoading(false);
        router.replace('/setup');
        return;
      } catch {
        setSetupStatus({ pythonOk: true, notebooklmOk: true, authOk: true, allOk: true, userEmail: null, nbmSessionActive: true });
        setLoading(false);
        return;
      }
    }
  }

  useEffect(() => {
    fetchSetupStatus();
    // Stagger-in animation trigger
    const t = setTimeout(() => setReady(true), 60);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // In web mode: ready = Google auth + NbLM connected. In local mode: use allOk.
  const fullyReady = isWebMode
    ? (setupStatus?.nbmSessionActive ?? false)
    : (setupStatus?.allOk ?? true);
  const showSearch = !loading && fullyReady;
  const showWizard = !isWebMode && !loading && setupStatus !== null && !setupStatus.allOk;

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col">
      <NavBar userEmail={setupStatus?.userEmail} />

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

          {/* Search / Setup */}
          <div
            className="w-full"
            style={{
              transition: 'opacity 0.5s ease 0.25s',
            }}
          >
            {loading && (
              <div className="bg-surface-container-high p-4 flex items-center gap-3 rounded-lg">
                <span className="w-3 h-3 border border-primary/50 border-t-transparent rounded-full animate-spin shrink-0" />
                <span className="text-on-surface-variant text-[10px] tracking-widest">INITIALIZING SYSTEM...</span>
              </div>
            )}
            {showWizard && <SetupWizard onSetupComplete={fetchSetupStatus} />}
            {showSearch && <TickerSearch />}
          </div>

          {/* Example tickers hint */}
          {showSearch && (
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
          )}
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
