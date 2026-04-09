'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import TickerSearch from '@/components/TickerSearch';
import ReportHistory from '@/components/ReportHistory';

interface SetupStatus {
  userEmail: string | null;
  nbmSessionActive?: boolean;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getFirstName(name: string | null | undefined, email: string | null | undefined): string {
  if (name) return name.split(' ')[0];
  if (email) return email.split('@')[0].split('.')[0];
  return 'there';
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<SetupStatus | null>(null);

  useEffect(() => {
    fetch('/api/setup/status')
      .then(r => r.json())
      .then((d: SetupStatus) => setStatus(d))
      .catch(() => {});
  }, []);

  const userEmail = session?.user?.email ?? status?.userEmail ?? null;
  const userName = getFirstName(session?.user?.name, userEmail);
  const nbmActive = status?.nbmSessionActive ?? false;
  const greeting = getGreeting();

  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <NavBar userEmail={userEmail} />

      <main className="pt-[44px]">
        {/* ── Greeting header ── */}
        <div className="border-b border-outline-variant/10 bg-surface-container-low/40">
          <div className="max-w-6xl mx-auto px-6 py-10">
            <p className="text-secondary text-sm font-medium mb-1 tracking-wide">
              {greeting},
            </p>
            <h1 className="text-4xl font-black text-on-surface tracking-tight mb-2">
              {userName} —
            </h1>
            <p className="text-on-surface-variant text-base">
              Here&apos;s your research workspace.
            </p>
          </div>
        </div>

        {/* ── Main content ── */}
        <div className="max-w-6xl mx-auto px-6 py-10">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">

            {/* LEFT: Search + quick actions */}
            <div className="space-y-6">
              <div>
                <h2 className="text-xs font-bold tracking-[0.3em] text-outline uppercase mb-4">
                  New Research
                </h2>
                <TickerSearch />
                <div className="mt-4 flex items-center gap-3">
                  <span className="text-[10px] font-mono text-outline tracking-widest">TRY</span>
                  {['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN'].map((sym) => (
                    <button
                      key={sym}
                      onClick={() => router.push(`/research/${sym}`)}
                      className="text-[10px] font-mono text-outline-variant px-2 py-0.5 border border-outline-variant/20 rounded hover:border-secondary/40 hover:text-secondary transition-colors"
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick links */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => router.push('/terminal')}
                  className="bg-surface-container border border-outline-variant/20 p-4 text-left hover:border-primary/30 hover:bg-surface-container-high transition-all group"
                >
                  <span className="material-symbols-outlined text-primary text-xl mb-2 block">terminal</span>
                  <div className="text-sm font-bold text-on-surface">Research Terminal</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">Focused analysis mode</div>
                </button>
                <button
                  onClick={() => router.push('/')}
                  className="bg-surface-container border border-outline-variant/20 p-4 text-left hover:border-secondary/30 hover:bg-surface-container-high transition-all group"
                >
                  <span className="material-symbols-outlined text-secondary text-xl mb-2 block">home</span>
                  <div className="text-sm font-bold text-on-surface">Home</div>
                  <div className="text-xs text-on-surface-variant mt-0.5">Marketing overview</div>
                </button>
              </div>
            </div>

            {/* RIGHT: Recent reports + account */}
            <div className="space-y-6">
              {/* Recent reports */}
              <div>
                <ReportHistory />
              </div>

              {/* Account card */}
              <div className="bg-surface-container border border-outline-variant/20 p-5 space-y-4">
                <div className="text-[10px] font-bold tracking-[0.3em] text-outline uppercase">
                  Account
                </div>

                {/* Email */}
                <div>
                  <div className="text-[10px] text-primary/50 tracking-widest uppercase mb-1">Connected as</div>
                  <div className="text-xs font-mono text-on-surface">{userEmail ?? '—'}</div>
                </div>

                {/* NbLM status */}
                <div>
                  <div className="text-[10px] text-primary/50 tracking-widest uppercase mb-1">Research Engine</div>
                  {nbmActive ? (
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                      <span className="text-[11px] font-mono text-secondary">Connected</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                        <span className="text-[11px] font-mono text-tertiary">Session expired</span>
                      </div>
                      <button
                        onClick={() => router.push('/setup')}
                        className="text-[10px] font-bold tracking-wider text-tertiary border border-tertiary/30 px-2 py-1 hover:bg-tertiary/10 transition-colors"
                      >
                        RECONNECT →
                      </button>
                    </div>
                  )}
                </div>

                {/* Sign out */}
                <button
                  onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                  className="text-[10px] font-bold tracking-widest uppercase text-outline hover:text-error/70 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
