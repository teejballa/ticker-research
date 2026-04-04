'use client';

export const dynamic = 'force-dynamic';

// src/app/setup/page.tsx
// Web-mode NbLM onboarding page.
// Flow: check if already captured → show "Connect" button → open popup window →
//       poll until captured → redirect home.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type SetupStep = 'checking' | 'idle' | 'waiting' | 'complete' | 'error';
type StepState = 'pending' | 'active' | 'complete' | 'error';

function StepIndicator({ state }: { state: StepState }) {
  if (state === 'complete')
    return <span className="text-secondary text-xs">✓</span>;
  if (state === 'active')
    return <span className="w-3 h-3 border border-primary/60 border-t-transparent rounded-full animate-spin inline-block" />;
  if (state === 'error')
    return <span className="text-error/60 text-xs">✗</span>;
  return <span className="text-outline/40 text-xs">○</span>;
}

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>('checking');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupRef = useRef<Window | null>(null);
  const checkedRef = useRef(false);

  function stopPolling() {
    if (pollingRef.current !== null) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  function startPolling() {
    pollingRef.current = setInterval(async () => {
      // If user closed the popup without logging in, stop and reset
      if (popupRef.current?.closed) {
        stopPolling();
        popupRef.current = null;
        setStep('idle');
        return;
      }
      try {
        const res = await fetch('/api/setup/nbm-auth/status');
        if (!res.ok) return;
        const data = await res.json() as { captured?: boolean };
        if (data.captured) {
          stopPolling();
          try { popupRef.current?.close(); } catch { /* ignore */ }
          popupRef.current = null;
          setStep('complete');
          setTimeout(() => router.push('/'), 1800);
        }
      } catch {
        // keep polling silently
      }
    }, 3000);
  }

  // On mount: check if already captured
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    async function checkExisting() {
      try {
        const res = await fetch('/api/setup/nbm-auth/status');
        if (res.ok) {
          const data = await res.json() as { captured?: boolean };
          if (data.captured) {
            setStep('complete');
            setTimeout(() => router.push('/'), 1500);
            return;
          }
        }
      } catch {
        // continue to idle
      }
      setStep('idle');
    }

    void checkExisting();
    return () => stopPolling();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleConnect() {
    const popup = window.open(
      '/setup/vnc',
      'nbm-vnc',
      'width=1300,height=880,resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no',
    );
    if (!popup) {
      setErrorMsg('Popup was blocked. Please allow popups for this site and try again.');
      setStep('error');
      return;
    }
    popupRef.current = popup;
    setStep('waiting');
    startPolling();
  }

  function handleRetry() {
    setErrorMsg('');
    setStep('idle');
  }

  // Derive per-step indicator states
  const step1State: StepState = 'complete'; // already authenticated to reach this page
  const step2State: StepState =
    step === 'complete' ? 'complete' :
    step === 'error'   ? 'error' :
    step === 'waiting' ? 'active' :
    step === 'checking'? 'active' :
    'pending';
  const step3State: StepState = step === 'complete' ? 'complete' : 'pending';

  // Step 2 body
  let step2Body: React.ReactNode = null;

  if (step === 'checking') {
    step2Body = (
      <p className="mt-1 text-[10px] font-mono" style={{ color: 'rgba(223,226,235,0.4)' }}>
        CHECKING SESSION...
      </p>
    );
  } else if (step === 'idle') {
    step2Body = (
      <div className="mt-3">
        <p className="mb-3 text-[10px] font-mono leading-relaxed" style={{ color: 'rgba(223,226,235,0.45)' }}>
          A browser window will open. Log in with your Google account to connect NotebookLM.
        </p>
        <button
          onClick={handleConnect}
          className="font-mono text-[10px] uppercase tracking-widest px-4 py-2 transition-colors"
          style={{
            border: '1px solid rgba(245,158,11,0.5)',
            color: 'rgba(245,158,11,0.85)',
            background: 'transparent',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,158,11,0.08)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          Connect NotebookLM Account →
        </button>
      </div>
    );
  } else if (step === 'waiting') {
    step2Body = (
      <div className="mt-2 space-y-2">
        <p className="text-[10px] font-mono uppercase tracking-widest" style={{ color: 'rgba(245,158,11,0.7)' }}>
          Complete Google login in the popup window
        </p>
        <p className="text-[10px] font-mono" style={{ color: 'rgba(223,226,235,0.35)' }}>
          Waiting for login detection...
        </p>
      </div>
    );
  } else if (step === 'error') {
    step2Body = (
      <div className="mt-2 space-y-2">
        <p className="text-[10px]" style={{ color: 'rgba(255,180,171,0.7)' }}>
          {errorMsg || 'An error occurred. Please try again.'}
        </p>
        <button
          onClick={handleRetry}
          className="font-mono text-[10px] uppercase tracking-widest px-3 py-1"
          style={{ border: '1px solid rgba(255,180,171,0.3)', color: 'rgba(255,180,171,0.6)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  const steps = [
    { state: step1State, label: 'Google account verified', body: null },
    { state: step2State, label: 'Connect NotebookLM account', body: step2Body },
    { state: step3State, label: 'Research pipeline ready', body: null },
  ];

  return (
    <div
      className="min-h-screen flex items-center justify-center font-mono"
      style={{ backgroundColor: '#10141a' }}
    >
      <div
        className="w-96 max-sm:w-full max-sm:mx-4 p-8"
        style={{ border: '1px solid #1a2d42' }}
      >
        <div
          className="font-bold uppercase mb-6"
          style={{ color: '#f59e0b', fontSize: '11px', letterSpacing: '0.25em', fontWeight: 700 }}
        >
          CIPHER // NOTEBOOKLM AUTHENTICATION REQUIRED
        </div>

        <div className="space-y-4">
          {steps.map((s, idx) => {
            const labelColor =
              s.state === 'complete' ? 'text-secondary' :
              s.state === 'active'   ? 'text-on-surface' :
              s.state === 'error'    ? 'text-error/70' :
              'text-outline/40';
            return (
              <div key={idx} className="flex items-start gap-3">
                <div className="w-4 shrink-0 flex justify-center mt-0.5">
                  <StepIndicator state={s.state} />
                </div>
                <div className="flex-1">
                  <div className={`text-xs font-medium ${labelColor}`}>{s.label}</div>
                  {s.body}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
