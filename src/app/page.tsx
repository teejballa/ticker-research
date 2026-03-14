'use client';

import { useState, useEffect } from 'react';
import TickerSearch from '@/components/TickerSearch';
import { SetupWizard } from '@/components/SetupWizard';

interface SetupStatus {
  pythonOk: boolean;
  notebooklmOk: boolean;
  authOk: boolean;
  allOk: boolean;
}

export default function Home() {
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchSetupStatus() {
    try {
      const res = await fetch('/api/setup/status');
      if (!res.ok) {
        // If setup route fails, assume all OK so we don't block the user
        setSetupStatus({ pythonOk: true, notebooklmOk: true, authOk: true, allOk: true });
        return;
      }
      const data: SetupStatus = await res.json();
      setSetupStatus(data);
    } catch {
      // On error, assume all OK (setup route may not be deployed yet)
      setSetupStatus({ pythonOk: true, notebooklmOk: true, authOk: true, allOk: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSetupStatus();
  }, []);

  const showSearch = !loading && (setupStatus?.allOk ?? true);
  const showWizard = !loading && setupStatus !== null && !setupStatus.allOk;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
            Ticker Research
          </h1>
          <p className="mt-2 text-gray-500 text-base">
            Evidence-backed financial analysis with traceable sources
          </p>
        </div>

        {/* Loading state — small placeholder so layout doesn't jump */}
        {loading && (
          <div className="flex justify-center mb-6">
            <span className="inline-block w-5 h-5 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" />
          </div>
        )}

        {/* Setup Wizard — shown when setup is incomplete */}
        {showWizard && (
          <SetupWizard onSetupComplete={fetchSetupStatus} />
        )}

        {/* Search — shown when setup is complete */}
        {showSearch && <TickerSearch />}
      </div>
    </main>
  );
}
