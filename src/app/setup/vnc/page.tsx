'use client';

// src/app/setup/vnc/page.tsx
// Popup window that starts the VNC session and shows the Chromium browser.
// Opened by /setup via window.open(). Polls for cookie capture, then self-closes.
import { useEffect, useRef, useState } from 'react';
import nextDynamic from 'next/dynamic';

const VncScreen = nextDynamic(() => import('react-vnc').then(m => m.VncScreen), { ssr: false });

type State = 'starting' | 'ready' | 'captured' | 'error';

export default function VncPopupPage() {
  const [state, setState] = useState<State>('starting');
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function start() {
      try {
        const res = await fetch('/api/setup/nbm-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'vnc' }),
        });
        if (!res.ok) {
          const text = await res.text();
          setErrorMsg(text || 'Failed to start browser session');
          setState('error');
          return;
        }
        const data = await res.json() as { streamUrl?: string; error?: string };
        if (!data.streamUrl) {
          setErrorMsg(data.error ?? 'No stream URL returned');
          setState('error');
          return;
        }
        setStreamUrl(data.streamUrl);
        setState('ready');

        // Poll for Google login capture
        pollingRef.current = setInterval(async () => {
          try {
            const r = await fetch('/api/setup/nbm-auth/status');
            if (!r.ok) return;
            const d = await r.json() as { captured?: boolean };
            if (d.captured) {
              clearInterval(pollingRef.current!);
              pollingRef.current = null;
              setState('captured');
              // Give user a moment to see the success state, then close
              setTimeout(() => window.close(), 1800);
            }
          } catch {
            // keep polling silently
          }
        }, 3000);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
        setState('error');
      }
    }

    void start();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  if (state === 'starting') {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0c10] font-mono">
        <div className="text-center space-y-4">
          <div
            className="w-8 h-8 rounded-full animate-spin mx-auto"
            style={{ border: '1px solid rgba(245,158,11,0.6)', borderTopColor: 'transparent' }}
          />
          <p
            className="text-[11px] uppercase tracking-widest"
            style={{ color: 'rgba(245,158,11,0.7)' }}
          >
            Starting secure browser...
          </p>
          <p
            className="text-[10px]"
            style={{ color: 'rgba(223,226,235,0.3)' }}
          >
            This may take up to 30 seconds on a cold start
          </p>
        </div>
      </div>
    );
  }

  if (state === 'captured') {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0c10] font-mono">
        <div className="text-center space-y-4">
          <div className="text-3xl" style={{ color: '#4ade80' }}>✓</div>
          <p
            className="text-[11px] uppercase tracking-widest"
            style={{ color: 'rgba(74,222,128,0.8)' }}
          >
            NotebookLM connected
          </p>
          <p
            className="text-[10px]"
            style={{ color: 'rgba(223,226,235,0.3)' }}
          >
            Closing window...
          </p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0c10] font-mono">
        <div className="text-center space-y-3 max-w-sm px-6">
          <p className="text-xs" style={{ color: 'rgba(255,180,171,0.8)' }}>
            Browser session failed to start
          </p>
          <p className="text-[10px]" style={{ color: 'rgba(255,180,171,0.5)' }}>
            {errorMsg}
          </p>
          <button
            onClick={() => window.close()}
            className="mt-4 text-[10px] font-mono uppercase tracking-widest px-4 py-2"
            style={{
              border: '1px solid rgba(255,180,171,0.3)',
              color: 'rgba(255,180,171,0.6)',
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // state === 'ready' — show VNC stream
  return (
    <div className="h-screen flex flex-col bg-[#0a0c10]">
      {/* Thin header bar */}
      <div
        className="shrink-0 flex items-center gap-3 px-4"
        style={{
          height: '36px',
          borderBottom: '1px solid rgba(245,158,11,0.12)',
          background: '#0a0c10',
        }}
      >
        <span
          className="text-[10px] font-mono uppercase tracking-widest"
          style={{ color: 'rgba(245,158,11,0.7)' }}
        >
          Log in with Google to connect NotebookLM
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ backgroundColor: 'rgba(245,158,11,0.6)' }}
          />
          <span
            className="text-[9px] font-mono uppercase tracking-widest"
            style={{ color: 'rgba(245,158,11,0.5)' }}
          >
            Waiting for login
          </span>
        </div>
      </div>

      {/* VNC fills the rest */}
      <div className="flex-1 overflow-hidden">
        <VncScreen
          url={streamUrl}
          scaleViewport
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
