'use client';
// src/app/setup/page.tsx
// Web-mode NbLM onboarding page.
// Shown to authenticated users who have no NbLM session stored.
// Flow: check status → attempt OAuth passthrough (will fail) → show VNC stream → poll until captured → redirect.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VncScreen } from 'react-vnc';

type SetupStep = 'oauth-checking' | 'oauth-attempting' | 'vnc-active' | 'complete' | 'error';
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
  const [step, setStep] = useState<SetupStep>('oauth-checking');
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flowStartedRef = useRef(false);

  // Derive step indicator states from current SetupStep
  const step1State: StepState = 'complete'; // user is already authenticated to reach this page
  const step2State: StepState =
    step === 'complete' ? 'complete' :
    step === 'error' ? 'error' :
    step === 'oauth-checking' || step === 'oauth-attempting' ? 'active' :
    step === 'vnc-active' ? 'active' :
    'pending';
  const step3State: StepState = step === 'complete' ? 'complete' : 'pending';

  function stopPolling() {
    if (pollingRef.current !== null) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  function startPolling() {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/setup/nbm-auth/status');
        if (!res.ok) return;
        const data = await res.json() as { captured?: boolean };
        if (data.captured) {
          stopPolling();
          setStep('complete');
          setTimeout(() => router.push('/'), 2000);
        }
      } catch {
        // silent — keep polling
      }
    }, 3000);
  }

  useEffect(() => {
    if (flowStartedRef.current) return;
    flowStartedRef.current = true;

    async function runFlow() {
      // Step 1: check if already captured
      try {
        const statusRes = await fetch('/api/setup/nbm-auth/status');
        if (statusRes.ok) {
          const statusData = await statusRes.json() as { captured?: boolean };
          if (statusData.captured) {
            setStep('complete');
            setTimeout(() => router.push('/'), 2000);
            return;
          }
        }
      } catch {
        // continue
      }

      // Step 2: attempt OAuth passthrough (expected to fail, 5s timeout)
      setStep('oauth-attempting');
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const oauthRes = await fetch('/api/setup/nbm-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'oauth' }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        if (oauthRes.ok) {
          const oauthData = await oauthRes.json() as { error?: string };
          if (!oauthData.error) {
            // OAuth worked (rare) — skip VNC
            setStep('complete');
            setTimeout(() => router.push('/'), 2000);
            return;
          }
        }
      } catch {
        // Expected: timeout or container error — fall through to VNC
      }

      // Step 3: trigger VNC session
      try {
        const vncRes = await fetch('/api/setup/nbm-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'vnc' }),
        });
        if (!vncRes.ok) {
          setErrorMsg('Failed to start VNC session. Check container configuration.');
          setStep('error');
          return;
        }
        const vncData = await vncRes.json() as { streamUrl?: string; error?: string };
        if (!vncData.streamUrl) {
          setErrorMsg(vncData.error ?? 'No stream URL returned from container.');
          setStep('error');
          return;
        }
        setStreamUrl(vncData.streamUrl);
        setStep('vnc-active');
        startPolling();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unknown error starting VNC session.');
        setStep('error');
      }
    }

    void runFlow();

    return () => {
      stopPolling();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isVncActive = step === 'vnc-active';

  // Step 2 body content
  let step2Body: React.ReactNode = null;
  if (step === 'oauth-checking') {
    step2Body = (
      <p className="mt-1 text-[10px] font-mono" style={{ color: 'rgba(223,226,235,0.5)' }}>
        CHECKING SESSION...
      </p>
    );
  } else if (step === 'oauth-attempting') {
    step2Body = (
      <p className="mt-1 text-[10px] font-mono" style={{ color: 'rgba(223,226,235,0.5)' }}>
        ATTEMPTING OAUTH PASSTHROUGH...
      </p>
    );
  } else if (step === 'vnc-active') {
    step2Body = (
      <div className="mt-3">
        <p
          className="mb-2"
          style={{
            color: '#f59e0b',
            fontSize: '11px',
            letterSpacing: '0.25em',
            fontWeight: 700,
            textTransform: 'uppercase',
          }}
        >
          COMPLETE GOOGLE LOGIN IN THE BROWSER BELOW
        </p>
        <div
          className="border border-outline-variant/20"
          style={{ width: '100%', height: '480px', background: '#0a0c10' }}
        >
          <VncScreen
            url={streamUrl}
            scaleViewport
            style={{ width: '100%', height: '480px' }}
          />
        </div>
      </div>
    );
  } else if (step === 'error') {
    step2Body = (
      <p className="mt-1 text-[10px]" style={{ color: 'rgba(255,180,171,0.7)' }}>
        {errorMsg || 'An error occurred. Please refresh and try again.'}
      </p>
    );
  }

  const steps = [
    {
      state: step1State,
      label: 'Google account verified',
      body: null,
    },
    {
      state: step2State,
      label: 'Connect NotebookLM account',
      body: step2Body,
    },
    {
      state: step3State,
      label: 'Research pipeline ready',
      body: null,
    },
  ];

  return (
    <div
      className="min-h-screen flex items-center justify-center font-mono"
      style={{ backgroundColor: '#10141a' }}
    >
      {/* Card width expands when VNC is active to accommodate the 480px stream */}
      <div
        className={isVncActive ? 'w-full max-w-xl max-sm:mx-4 p-8' : 'w-96 max-sm:w-full max-sm:mx-4 p-8'}
        style={{ border: '1px solid #1a2d42' }}
      >
        {/* Amber overline */}
        <div
          className="font-bold uppercase mb-6"
          style={{
            color: '#f59e0b',
            fontSize: '11px',
            letterSpacing: '0.25em',
            fontWeight: 700,
          }}
        >
          CIPHER // NOTEBOOKLM AUTHENTICATION REQUIRED
        </div>

        {/* Step list */}
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
