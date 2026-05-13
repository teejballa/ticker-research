'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import NavBar from '@/components/NavBar';
import TickerSearch from '@/components/TickerSearch';
import ReportHistory from '@/components/ReportHistory';
import { getMarketStatus } from '@/lib/market-status';

interface SnapshotItem {
  sym: string;
  name: string;
  price: string | null;
  chg: string | null;
  up: boolean;
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
  const [snapshot, setSnapshot] = useState<SnapshotItem[]>([]);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);

  useEffect(() => {
    fetch('/api/market-snapshot')
      .then(r => r.json())
      .then((data: { items?: SnapshotItem[]; fetched_at?: string }) => {
        if (data.items) {
          setSnapshot(data.items);
          setSnapshotAt(data.fetched_at ?? null);
        }
      })
      .catch(() => {})
      .finally(() => setSnapshotLoading(false));
  }, []);

  const userEmail = session?.user?.email ?? null;
  const userName = getFirstName(session?.user?.name, userEmail);
  const greeting = getGreeting();
  const market = getMarketStatus();

  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <NavBar userEmail={userEmail} />

      <main className="pt-[44px]">

        {/* ── Greeting header ── */}
        <div className="border-b border-outline-variant/10 bg-surface-container-low/40">
          <div className="max-w-6xl mx-auto px-6 py-8 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-secondary text-sm font-medium mb-1 tracking-wide">
                {greeting},
              </p>
              <h1 className="text-4xl font-black text-on-surface tracking-tight mb-2">
                {userName} —
              </h1>
              <p className="text-on-surface-variant text-sm">
                Pick up where you left off, or research a new ticker below.
              </p>
            </div>
            {/* Market status badge */}
            <div className="flex flex-col items-end gap-2 mt-1">
              <div className="font-mono text-xs text-outline bg-surface-container border border-outline-variant/20 px-3 py-1.5 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${market.open ? 'bg-secondary animate-pulse' : 'bg-outline-variant'}`} />
                <span className={market.open ? 'text-secondary' : 'text-outline'}>{market.label}</span>
              </div>
              {snapshotAt && (
                <span className="font-mono text-[9px] text-outline-variant">
                  data updated {new Date(snapshotAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Search bar — full width, prominent ── */}
        <div className="border-b border-outline-variant/10 bg-surface-container/30">
          <div className="max-w-6xl mx-auto px-6 py-6">
            <div className="text-[10px] font-bold tracking-[0.35em] text-outline uppercase mb-3">
              New report
            </div>
            <TickerSearch />
            <div className="mt-3 flex items-center gap-3 flex-wrap">
              <span className="text-[10px] font-mono text-outline tracking-widest">TRY</span>
              {['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'GOOGL', 'META'].map((sym) => (
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
        </div>

        {/* ── Main two-column content ── */}
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8">

            {/* LEFT: Report history — the star */}
            <div>
              <ReportHistory />
            </div>

            {/* RIGHT: Account + quick nav */}
            <div className="space-y-4">

              {/* Account card */}
              <div className="bg-surface-container border border-outline-variant/20 p-5 space-y-4">
                <div className="text-[10px] font-bold tracking-[0.3em] text-outline uppercase">
                  Account
                </div>

                <div>
                  <div className="text-[10px] text-primary/50 tracking-widest uppercase mb-1">Connected as</div>
                  <div className="text-xs font-mono text-on-surface truncate">{userEmail ?? '—'}</div>
                </div>

                <button
                  onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                  className="text-[10px] font-bold tracking-widest uppercase text-outline hover:text-error/70 transition-colors"
                >
                  Sign out
                </button>
              </div>

              {/* Quick nav */}
              <div className="grid grid-cols-2 gap-2">
                <Link
                  href="/terminal"
                  className="bg-surface-container border border-outline-variant/20 p-4 text-left hover:border-primary/30 hover:bg-surface-container-high transition-all block"
                >
                  <span className="material-symbols-outlined text-primary text-xl mb-2 block">terminal</span>
                  <div className="text-xs font-bold text-on-surface">Terminal</div>
                  <div className="text-[10px] text-on-surface-variant mt-0.5">Focused mode</div>
                </Link>
                <Link
                  href="/"
                  className="bg-surface-container border border-outline-variant/20 p-4 text-left hover:border-secondary/30 hover:bg-surface-container-high transition-all block"
                >
                  <span className="material-symbols-outlined text-secondary text-xl mb-2 block">home</span>
                  <div className="text-xs font-bold text-on-surface">Home</div>
                  <div className="text-[10px] text-on-surface-variant mt-0.5">Marketing page</div>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── Market Snapshot — full width bottom ── */}
        <div className="border-t border-outline-variant/10 bg-surface-container-low/30">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-[10px] font-bold tracking-[0.35em] text-outline uppercase mb-1">Live Market</div>
                <div className="text-lg font-black tracking-tight text-on-surface">Market Snapshot</div>
              </div>
              <div className="font-mono text-xs text-outline bg-surface-container border border-outline-variant/20 px-3 py-1 flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${market.open ? 'bg-secondary animate-pulse' : 'bg-outline-variant'}`} />
                {market.label}
              </div>
            </div>

            {snapshotLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="bg-surface-container border border-outline-variant/10 p-3 animate-pulse">
                    <div className="h-2 bg-outline-variant/20 rounded mb-2 w-12" />
                    <div className="h-4 bg-outline-variant/10 rounded w-16" />
                  </div>
                ))}
              </div>
            ) : snapshot.length === 0 ? (
              <p className="text-[11px] text-outline font-mono">Market data unavailable</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {snapshot.map((item) => (
                  <button
                    key={item.sym}
                    onClick={() => router.push(`/research/${item.sym}`)}
                    className="bg-surface-container border border-outline-variant/10 p-3 text-left hover:border-outline-variant/30 hover:bg-surface-container-high transition-all group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-bold text-sm text-on-surface group-hover:text-primary transition-colors">
                        {item.sym}
                      </span>
                      <span className={`text-[10px] font-mono font-bold ${item.up ? 'text-secondary' : 'text-error'}`}>
                        {item.chg ?? '—'}
                      </span>
                    </div>
                    <div className="text-[10px] text-on-surface-variant truncate">{item.name}</div>
                    <div className="text-xs font-mono text-on-surface mt-1">{item.price ?? '—'}</div>
                  </button>
                ))}
              </div>
            )}

            {snapshot.length > 0 && (
              <p className="text-[9px] text-outline-variant font-mono mt-3">
                Click any ticker to run a research report. Data from Yahoo Finance.
              </p>
            )}
          </div>
        </div>

      </main>
    </div>
  );
}
