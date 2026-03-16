'use client';

import { useState, useEffect, useRef } from 'react';

interface SetupStatus {
  pythonOk: boolean;
  pythonVersion?: string;
  pythonPath?: string;
  notebooklmOk: boolean;
  authOk: boolean;
  allOk: boolean;
}

type StepState = 'pending' | 'active' | 'complete' | 'error';

function detectOS(): 'mac' | 'windows' | 'linux' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac'))   return 'mac';
  if (ua.includes('win'))   return 'windows';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

function StepIndicator({ state }: { state: StepState }) {
  if (state === 'complete')
    return <span className="text-emerald-500/80 text-xs">✓</span>;
  if (state === 'active')
    return <span className="w-3 h-3 border border-[#f59e0b]/60 border-t-transparent rounded-full animate-spin inline-block" />;
  if (state === 'error')
    return <span className="text-red-500/60 text-xs">✗</span>;
  return <span className="text-[#0d1a27] text-xs">○</span>;
}

function PythonInstallInstructions() {
  const os = detectOS();
  return (
    <div className="mt-2 space-y-1">
      {(os === 'mac'     || os === 'unknown') && (
        <code className="block bg-[#080a0f] border border-[#0d1a27] px-2.5 py-1.5 text-[10px] text-[#f59e0b]/60">
          $ brew install python@3.11
        </code>
      )}
      {(os === 'windows' || os === 'unknown') && (
        <code className="block bg-[#080a0f] border border-[#0d1a27] px-2.5 py-1.5 text-[10px] text-[#f59e0b]/60">
          $ winget install Python.Python.3.11
        </code>
      )}
      {(os === 'linux'   || os === 'unknown') && (
        <code className="block bg-[#080a0f] border border-[#0d1a27] px-2.5 py-1.5 text-[10px] text-[#f59e0b]/60">
          $ sudo apt install python3.11
        </code>
      )}
    </div>
  );
}

interface SetupWizardProps {
  onSetupComplete?: () => void;
}

export function SetupWizard({ onSetupComplete }: SetupWizardProps) {
  const [status, setStatus]               = useState<SetupStatus | null>(null);
  const [installProgress, setInstallProgress] = useState<string[]>([]);
  const [installState, setInstallState]   = useState<StepState>('pending');
  const [authState, setAuthState]         = useState<StepState>('pending');
  const [authMessage, setAuthMessage]     = useState('');
  const [dots, setDots]                   = useState('');
  const installStartedRef                 = useRef(false);
  const authStartedRef                    = useRef(false);

  useEffect(() => {
    if (authState !== 'active') return;
    const id = setInterval(() => setDots((d) => (d.length >= 3 ? '' : d + '.')), 500);
    return () => clearInterval(id);
  }, [authState]);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/setup/status');
      if (!res.ok) return null;
      const data: SetupStatus = await res.json();
      setStatus(data);
      return data;
    } catch { return null; }
  }

  async function startInstall() {
    if (installStartedRef.current) return;
    installStartedRef.current = true;
    setInstallState('active');
    try {
      const res = await fetch('/api/setup/install', { method: 'POST' });
      if (!res.ok || !res.body) { setInstallState('error'); return; }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice('data: '.length));
            if      (event.type === 'progress') setInstallProgress((p) => [...p.slice(-8), event.message]);
            else if (event.type === 'complete') { setInstallState('complete'); await fetchStatus(); }
            else if (event.type === 'error')    setInstallState('error');
          } catch { /* skip */ }
        }
      }
    } catch { setInstallState('error'); }
  }

  async function startAuth() {
    if (authStartedRef.current) return;
    authStartedRef.current = true;
    setAuthState('active');
    setAuthMessage('Opening browser...');
    try {
      const res = await fetch('/api/setup/auth', { method: 'POST' });
      if (!res.ok || !res.body) { setAuthState('error'); return; }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice('data: '.length));
            if (event.type === 'waiting') {
              if (event.message) setAuthMessage(event.message as string);
            } else if (event.type === 'complete') {
              setAuthState('complete');
              setAuthMessage('');
              if (onSetupComplete) onSetupComplete();
              else window.location.reload();
            } else if (event.type === 'error') {
              setAuthState('error');
              setAuthMessage(event.message ?? 'Login failed');
              authStartedRef.current = false;
            }
          } catch { /* skip */ }
        }
      }
    } catch {
      setAuthState('error');
      authStartedRef.current = false;
    }
  }

  useEffect(() => {
    fetchStatus().then((data) => {
      if (!data) return;
      if (data.notebooklmOk) {
        setInstallState('complete');
        installStartedRef.current = true;
      } else if (data.pythonOk && !installStartedRef.current) {
        startInstall();
      }
      if (data.authOk) {
        setAuthState('complete');
        authStartedRef.current = true;
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pythonState: StepState = !status ? 'pending' : status.pythonOk ? 'complete' : 'error';
  const showPythonInstructions  = status && !status.pythonOk;
  const authEnabled             = installState === 'complete' && authState === 'pending';

  const steps = [
    {
      state: pythonState,
      title: (
        <span>
          Python 3.10+ installed
          {status?.pythonVersion && (
            <span className="ml-2 text-[#1a2a3a] font-normal text-[10px]">
              v{status.pythonVersion}
            </span>
          )}
        </span>
      ),
      body: showPythonInstructions ? (
        <>
          <PythonInstallInstructions />
          <button
            type="button"
            onClick={() => fetchStatus()}
            className="mt-2 text-[10px] text-[#f59e0b]/50 hover:text-[#f59e0b] tracking-wider transition-colors"
          >
            RE-CHECK →
          </button>
        </>
      ) : null,
    },
    {
      state: installState,
      title: 'NotebookLM tools installed',
      body: installState === 'active' && installProgress.length > 0 ? (
        <div className="mt-1.5 space-y-0.5">
          {installProgress.slice(-3).map((msg, i) => (
            <p key={i} className="text-[9px] text-[#1a2a3a] truncate">{msg}</p>
          ))}
        </div>
      ) : installState === 'error' ? (
        <p className="mt-1 text-[10px] text-red-400/60">
          Install failed — check pip3 is available
        </p>
      ) : null,
    },
    {
      state: authState,
      title: 'Connect Google account',
      body: authEnabled ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={startAuth}
            className="text-[10px] bg-[#f59e0b] hover:bg-[#fbbf24] text-black px-3 py-1 font-bold tracking-wider transition-colors"
          >
            CONNECT ACCOUNT →
          </button>
          <p className="mt-1 text-[9px] text-[#0d1a27]">
            Opens your browser for a one-time Google login
          </p>
        </div>
      ) : authState === 'active' ? (
        <p className="mt-1 text-[10px] text-[#2a3d52]">{authMessage}{dots}</p>
      ) : authState === 'error' ? (
        <div className="mt-1">
          <p className="text-[10px] text-red-400/60 mb-1">
            {authMessage || 'Login failed. Please try again.'}
          </p>
          <button
            type="button"
            onClick={startAuth}
            className="text-[10px] bg-[#f59e0b] hover:bg-[#fbbf24] text-black px-3 py-1 font-bold tracking-wider transition-colors"
          >
            TRY AGAIN →
          </button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="panel">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#0a1520]">
        <div className="text-[9px] text-[#f59e0b]/50 tracking-[0.4em] mb-0.5">SYSTEM INITIALIZATION</div>
        <div className="text-xs text-[#1e2d3d]">
          One-time setup required to enable NotebookLM research pipeline
        </div>
      </div>

      <div className="p-4 space-y-4">
        {steps.map((step, idx) => {
          const labelColor =
            step.state === 'complete' ? 'text-[#2a4a3a]' :
            step.state === 'active'   ? 'text-[#c9d4e0]' :
            step.state === 'error'    ? 'text-red-400/70' :
            'text-[#131e2b]';

          return (
            <div key={idx} className="flex items-start gap-3">
              <div className="w-4 shrink-0 flex justify-center mt-0.5">
                <StepIndicator state={step.state} />
              </div>
              <div className="flex-1">
                <div className={`text-xs font-medium ${labelColor}`}>{step.title}</div>
                {step.body}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SetupWizard;
