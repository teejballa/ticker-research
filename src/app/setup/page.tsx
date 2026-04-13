'use client';

export const dynamic = 'force-dynamic';

// src/app/setup/page.tsx
// NotebookLM onboarding. Reached after Google OAuth (auth/signin always redirects here).
// Flow: check if already captured → idle (show connect button) → waiting (VNC popup open) → complete → /
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type SetupStep = 'checking' | 'idle' | 'waiting' | 'complete' | 'error';

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<SetupStep>('checking');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupRef = useRef<Window | null>(null);
  const checkedRef = useRef(false);
  const msgHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);

  function stopPolling() {
    if (pollingRef.current !== null) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  // After VNC capture is detected, confirm the credential landed in the DB before navigating.
  // This prevents the bounce where terminal sees nbmSessionActive=false (DB cold-start lag)
  // and immediately redirects back to setup.
  async function confirmAndNavigate() {
    setStep('complete');
    // Poll /api/setup/status (checks DB) for up to ~8s before giving up.
    for (let i = 0; i < 8; i++) {
      try {
        const res = await fetch('/api/setup/status');
        if (res.ok) {
          const data = await res.json() as { nbmSessionActive?: boolean };
          if (data.nbmSessionActive) {
            router.push('/dashboard');
            return;
          }
        }
      } catch { /* ignore */ }
      await new Promise<void>(r => setTimeout(r, 1000));
    }
    // DB didn't confirm within ~8s — navigate anyway; terminal has its own retry.
    router.push('/dashboard');
  }

  function startPolling() {
    // Do NOT poll captured status while the popup is open.
    // The VNC page calls /vnc-start first (resetting container's captured state),
    // then polls for capture itself, then self-closes.
    // If we poll here too, we race against /vnc-start and may detect STALE
    // captured=true cookies before the container resets them — saving bad
    // credentials back to DB and trapping the user in a loop.
    // Instead: just watch for the popup to close, then check DB status.
    pollingRef.current = setInterval(() => {
      if (!popupRef.current?.closed) return; // popup still open — wait
      stopPolling();
      popupRef.current = null;
      // Popup closed (either user dismissed or VNC page detected capture+closed).
      // Check DB to see if a fresh credential was actually saved.
      void (async () => {
        try {
          const res = await fetch('/api/setup/status');
          if (res.ok) {
            const data = await res.json() as { nbmSessionActive?: boolean };
            if (data.nbmSessionActive) {
              await confirmAndNavigate();
              return;
            }
          }
        } catch { /* ignore */ }
        setStep('idle');
      })();
    }, 500);
  }

  // On mount: check if already captured
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;

    async function checkExisting() {
      // Use DB state (not container state) so this check is consistent with the
      // terminal page's nbmSessionActive check. Using container state caused a loop:
      // container said "captured" but DB was empty → terminal redirected back here.
      try {
        const res = await fetch('/api/setup/status');
        if (res.ok) {
          const data = await res.json() as { nbmSessionActive?: boolean };
          if (data.nbmSessionActive) {
            setStep('complete');
            return;
          }
        }
      } catch {
        // continue to idle
      }
      setStep('idle');
    }

    void checkExisting();
    return () => {
      stopPolling();
      if (msgHandlerRef.current) {
        window.removeEventListener('message', msgHandlerRef.current);
        msgHandlerRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleConnect() {
    // Open a standard Google OAuth popup in the user's browser (their residential IP,
    // not the GCP container). After auth, /setup/nbm-oauth-complete exchanges the
    // fresh Google access_token for session cookies on Vercel's servers and stores them.
    const callbackUrl = encodeURIComponent('/setup/nbm-oauth-complete');
    const popup = window.open(
      `/api/auth/signin/google?callbackUrl=${callbackUrl}`,
      'nbm-google-auth',
      'width=500,height=650,resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no',
    );
    if (!popup) {
      setErrorMsg('Popup was blocked. Please allow popups for this site and try again.');
      setStep('error');
      return;
    }
    popupRef.current = popup;
    setStep('waiting');

    // Clean up any previous message listener before adding a new one
    if (msgHandlerRef.current) {
      window.removeEventListener('message', msgHandlerRef.current);
    }

    // Fast path: listen for postMessage from the complete page
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      if (e.data === 'nbm-auth-success') {
        window.removeEventListener('message', onMessage);
        msgHandlerRef.current = null;
        stopPolling();
        popupRef.current = null;
        void confirmAndNavigate();
      }
    };
    msgHandlerRef.current = onMessage;
    window.addEventListener('message', onMessage);

    startPolling();
  }

  // ── Checking ──────────────────────────────────────────────────────────────
  if (step === 'checking') {
    return (
      <Shell>
        <div className="flex items-center gap-3">
          <span
            className="w-3 h-3 rounded-full animate-spin inline-block shrink-0"
            style={{ border: '1px solid rgba(245,158,11,0.6)', borderTopColor: 'transparent' }}
          />
          <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(245,158,11,0.5)', fontSize: '10px' }}>
            Checking session...
          </span>
        </div>
      </Shell>
    );
  }

  // ── Complete (redirect in-flight) ─────────────────────────────────────────
  if (step === 'complete') {
    return (
      <Shell>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span style={{ color: '#4ade80' }}>✓</span>
            <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(74,222,128,0.8)', fontSize: '10px' }}>
              Research engine connected
            </span>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-xs uppercase tracking-widest"
              style={{ color: 'rgba(74,222,128,0.5)', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Go to Dashboard →
            </button>
            <button
              onClick={() => {
                // Fire DELETE without awaiting — preserves user gesture context
                // so window.open() inside handleConnect() is not blocked as a popup.
                // The 2s delay before VNC polling gives DELETE time to complete
                // and set the stale token in memory before status checks start.
                void fetch('/api/setup/nbm-auth', { method: 'DELETE' }).catch(() => {});
                handleConnect();
              }}
              className="text-xs uppercase tracking-widest"
              style={{ color: 'rgba(223,226,235,0.2)', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Reconnect
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Waiting (VNC popup open) ───────────────────────────────────────────────
  if (step === 'waiting') {
    return (
      <Shell>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span
              className="w-3 h-3 rounded-full animate-pulse inline-block shrink-0"
              style={{ backgroundColor: 'rgba(245,158,11,0.6)' }}
            />
            <span className="text-xs uppercase tracking-widest" style={{ color: 'rgba(245,158,11,0.7)', fontSize: '10px' }}>
              Waiting for login in popup window
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(223,226,235,0.35)', fontSize: '10px' }}>
            Complete Google sign-in in the popup window. This page will update automatically once connected.
          </p>
          <button
            onClick={() => {
              stopPolling();
              try { popupRef.current?.close(); } catch { /* ignore */ }
              popupRef.current = null;
              setStep('idle');
            }}
            className="text-xs uppercase tracking-widest"
            style={{ color: 'rgba(223,226,235,0.25)', fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Cancel
          </button>
        </div>
      </Shell>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <Shell onClose={() => router.push('/dashboard')}>
        <div className="space-y-4">
          <p className="text-xs" style={{ color: 'rgba(255,180,171,0.8)', fontSize: '11px' }}>
            {errorMsg || 'Something went wrong. Please try again.'}
          </p>
          <button
            onClick={() => { setErrorMsg(''); setStep('idle'); }}
            className="text-xs font-mono uppercase tracking-widest px-4 py-2"
            style={{ border: '1px solid rgba(255,180,171,0.3)', color: 'rgba(255,180,171,0.6)', background: 'none', cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  // ── Idle — show connect button ─────────────────────────────────────────────
  return (
    <Shell onClose={() => router.push('/dashboard')}>
      <div className="space-y-5">
        <div>
          <div
            className="text-xs font-bold tracking-widest uppercase mb-2"
            style={{ color: '#f59e0b', fontSize: '11px', letterSpacing: '0.25em' }}
          >
            CIPHER // ONE MORE STEP
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(223,226,235,0.45)', fontSize: '11px' }}>
            Connect your NotebookLM account to power the research engine.
            A Google sign-in window will open — use the same Google account you signed in with.
          </p>
        </div>

        <button
          onClick={handleConnect}
          className="w-full text-xs font-bold uppercase tracking-widest transition-colors duration-150"
          style={{
            minHeight: '40px',
            padding: '8px 16px',
            border: '1px solid rgba(245,158,11,0.5)',
            color: 'rgba(245,158,11,0.85)',
            background: 'transparent',
            fontSize: '11px',
            letterSpacing: '0.12em',
            cursor: 'pointer',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,158,11,0.08)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.8)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.5)';
          }}
        >
          [ CONNECT RESEARCH ENGINE ]
        </button>

        <div className="flex items-center gap-2 pt-1">
          <span style={{ color: '#4ade80', fontSize: '10px' }}>✓</span>
          <span className="text-xs" style={{ color: 'rgba(223,226,235,0.25)', fontSize: '10px' }}>
            Google account verified
          </span>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center font-mono"
      style={{ backgroundColor: '#080a0f' }}
    >
      <div
        className="w-96 max-sm:w-full max-sm:mx-4 p-8 relative"
        style={{ border: '1px solid #1a2d42' }}
      >
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-[#3a5070] hover:text-[#8d90a2] transition-colors"
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', lineHeight: 1 }}
          >
            ✕
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
