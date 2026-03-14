'use client';

import { useState, useEffect, useRef } from 'react';

// SSE event shapes from the setup API routes
interface SetupStatus {
  pythonOk: boolean;
  pythonVersion?: string;
  pythonPath?: string;
  notebooklmOk: boolean;
  authOk: boolean;
  allOk: boolean;
}

type StepState = 'pending' | 'active' | 'complete' | 'error';

// Detect OS from user agent for platform-specific Python install instructions
function detectOS(): 'mac' | 'windows' | 'linux' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  return 'unknown';
}

// Icon components
function CheckIcon() {
  return (
    <span className="text-green-600 text-lg font-bold leading-none select-none" aria-label="Complete">
      ✓
    </span>
  );
}

function SpinnerIcon() {
  return (
    <span
      className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
      aria-label="In progress"
    />
  );
}

function PendingIcon() {
  return (
    <span className="text-gray-300 text-lg leading-none select-none" aria-label="Pending">
      ○
    </span>
  );
}

function ErrorIcon() {
  return (
    <span className="text-red-500 text-lg font-bold leading-none select-none" aria-label="Error">
      ✗
    </span>
  );
}

function StepIcon({ state }: { state: StepState }) {
  if (state === 'complete') return <CheckIcon />;
  if (state === 'active') return <SpinnerIcon />;
  if (state === 'error') return <ErrorIcon />;
  return <PendingIcon />;
}

// Python install instructions per OS
function PythonInstallInstructions() {
  const os = detectOS();
  return (
    <div className="mt-2 ml-7 text-sm">
      <p className="text-gray-600 mb-1">Install Python 3.11:</p>
      {(os === 'mac' || os === 'unknown') && (
        <code className="block bg-gray-100 rounded px-2 py-1 text-xs font-mono text-gray-800 mb-1">
          brew install python@3.11
        </code>
      )}
      {(os === 'windows' || os === 'unknown') && (
        <code className="block bg-gray-100 rounded px-2 py-1 text-xs font-mono text-gray-800 mb-1">
          winget install Python.Python.3.11
        </code>
      )}
      {(os === 'linux' || os === 'unknown') && (
        <code className="block bg-gray-100 rounded px-2 py-1 text-xs font-mono text-gray-800 mb-1">
          sudo apt install python3.11
        </code>
      )}
      <p className="text-gray-500 text-xs mt-1">
        After installing, click Re-check below.
      </p>
    </div>
  );
}

interface SetupWizardProps {
  onSetupComplete?: () => void;
}

export function SetupWizard({ onSetupComplete }: SetupWizardProps) {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [installProgress, setInstallProgress] = useState<string[]>([]);
  const [installState, setInstallState] = useState<StepState>('pending');
  const [authState, setAuthState] = useState<StepState>('pending');
  const [authMessage, setAuthMessage] = useState<string>('');
  const [dots, setDots] = useState('');
  const installStartedRef = useRef(false);
  const authStartedRef = useRef(false);

  // Animated dots for the "waiting for login" state
  useEffect(() => {
    if (authState !== 'active') return;
    const interval = setInterval(() => {
      setDots(d => (d.length >= 3 ? '' : d + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, [authState]);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/setup/status');
      if (!res.ok) return;
      const data: SetupStatus = await res.json();
      setStatus(data);
      return data;
    } catch {
      return null;
    }
  }

  async function startInstall() {
    if (installStartedRef.current) return;
    installStartedRef.current = true;
    setInstallState('active');

    try {
      const res = await fetch('/api/setup/install', { method: 'POST' });
      if (!res.ok || !res.body) {
        setInstallState('error');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
            if (event.type === 'progress') {
              setInstallProgress(prev => [...prev.slice(-10), event.message]);
            } else if (event.type === 'complete') {
              setInstallState('complete');
              // Refresh status to confirm notebooklmOk
              await fetchStatus();
            } else if (event.type === 'error') {
              setInstallState('error');
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch {
      setInstallState('error');
    }
  }

  async function startAuth() {
    if (authStartedRef.current) return;
    authStartedRef.current = true;
    setAuthState('active');
    setAuthMessage('A browser window has opened — log in to your Google account to continue');

    try {
      const res = await fetch('/api/setup/auth', { method: 'POST' });
      if (!res.ok || !res.body) {
        setAuthState('error');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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
              // Already showing spinner + message
            } else if (event.type === 'complete') {
              setAuthState('complete');
              setAuthMessage('');
              // Trigger re-render of parent
              if (onSetupComplete) {
                onSetupComplete();
              } else {
                window.location.reload();
              }
            } else if (event.type === 'error') {
              setAuthState('error');
              setAuthMessage(event.message ?? 'Login failed');
            }
          } catch {
            // ignore malformed lines
          }
        }
      }
    } catch {
      setAuthState('error');
    }
  }

  // On mount: fetch status, then trigger install automatically if needed
  useEffect(() => {
    fetchStatus().then(data => {
      if (!data) return;

      // Sync install state
      if (data.notebooklmOk) {
        setInstallState('complete');
        installStartedRef.current = true;
      } else if (data.pythonOk && !installStartedRef.current) {
        // Auto-trigger install
        startInstall();
      }

      // Sync auth state
      if (data.authOk) {
        setAuthState('complete');
        authStartedRef.current = true;
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When install completes and auth is not yet done, auth step becomes available
  // Auth is NOT auto-triggered — user must click "Connect Account"
  const pythonState: StepState = !status
    ? 'pending'
    : status.pythonOk
    ? 'complete'
    : 'error';

  const showPythonInstructions = status && !status.pythonOk;
  const installEnabled = status?.pythonOk && !status.notebooklmOk;
  const authEnabled = installState === 'complete' && authState === 'pending';

  return (
    <div className="bg-white rounded-xl border border-amber-200 p-5 mb-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-800">Before you start</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          A few one-time setup steps are needed to run NotebookLM research.
        </p>
      </div>

      <ol className="space-y-3">
        {/* Step 1: Python 3.10+ */}
        <li className="flex items-start gap-3">
          <div className="mt-0.5 w-5 flex-shrink-0 flex items-center justify-center">
            <StepIcon state={pythonState} />
          </div>
          <div className="flex-1">
            <span className={`text-sm font-medium ${pythonState === 'error' ? 'text-red-700' : 'text-gray-800'}`}>
              Python 3.10+ installed
              {status?.pythonVersion && (
                <span className="ml-1 text-gray-400 font-normal text-xs">v{status.pythonVersion}</span>
              )}
            </span>
            {showPythonInstructions && <PythonInstallInstructions />}
            {showPythonInstructions && (
              <button
                type="button"
                onClick={() => fetchStatus()}
                className="mt-2 ml-7 text-xs text-blue-600 underline hover:text-blue-800"
              >
                Re-check
              </button>
            )}
          </div>
        </li>

        {/* Step 2: NotebookLM tools installed */}
        <li className="flex items-start gap-3">
          <div className="mt-0.5 w-5 flex-shrink-0 flex items-center justify-center">
            <StepIcon state={installState} />
          </div>
          <div className="flex-1">
            <span className={`text-sm font-medium ${installEnabled || installState === 'active' ? 'text-gray-800' : 'text-gray-400'}`}>
              NotebookLM tools installed
            </span>
            {installState === 'active' && installProgress.length > 0 && (
              <p className="mt-1 text-xs text-gray-500 font-mono truncate">
                {installProgress[installProgress.length - 1]}
              </p>
            )}
            {installState === 'error' && (
              <p className="mt-1 text-xs text-red-600">
                Install failed. Check that pip3 is available and try restarting the app.
              </p>
            )}
          </div>
        </li>

        {/* Step 3: Connect Google account */}
        <li className="flex items-start gap-3">
          <div className="mt-0.5 w-5 flex-shrink-0 flex items-center justify-center">
            <StepIcon state={authState} />
          </div>
          <div className="flex-1">
            <span className={`text-sm font-medium ${authState === 'pending' && !authEnabled ? 'text-gray-400' : 'text-gray-800'}`}>
              Connect Google account
            </span>
            {authEnabled && (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={startAuth}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded font-medium transition-colors"
                >
                  Connect Account
                </button>
                <p className="mt-1 text-xs text-gray-500">
                  Opens your browser for a one-time Google login.
                </p>
              </div>
            )}
            {authState === 'active' && (
              <p className="mt-1 text-xs text-gray-600">
                {authMessage}{dots}
              </p>
            )}
            {authState === 'error' && (
              <p className="mt-1 text-xs text-red-600">
                {authMessage || 'Login failed. Please try again.'}
              </p>
            )}
          </div>
        </li>
      </ol>
    </div>
  );
}

export default SetupWizard;
