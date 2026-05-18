'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';
import TickerSearch from '@/components/TickerSearch';
import ReportHistory from '@/components/ReportHistory';
import type { StoredReport } from '@/lib/types';

interface SnapItem { sym: string; name: string; price: string | null; chg: string | null; up: boolean; }

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getFirstName(name?: string | null, email?: string | null): string {
  if (name) return name.split(' ')[0];
  if (email) return email.split('@')[0].split('.')[0];
  return 'there';
}

function getMarketStatus(): { open: boolean; label: string } {
  const ny = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = ny.getDay();
  const mins = ny.getHours() * 60 + ny.getMinutes();
  if (day < 1 || day > 5) return { open: false, label: 'Markets closed' };
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return { open: true, label: 'Regular session' };
  if (mins >= 16 * 60 && mins < 20 * 60) return { open: true, label: 'After-hours' };
  if (mins >= 4 * 60 && mins < 9 * 60 + 30) return { open: true, label: 'Pre-market' };
  return { open: false, label: 'Markets closed' };
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [watch, setWatch] = useState<SnapItem[]>([]);
  // Usage stats are derived in the fetch callback (an effect context) — never
  // during render — so Date.now() stays out of the render pass.
  const [usage, setUsage] = useState({ reports30d: 0, reportsTotal: 0, lastReport: '—' });

  useEffect(() => {
    fetch('/api/market-snapshot')
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d.items)) setWatch(d.items.slice(0, 5)); })
      .catch(() => {});
    fetch('/api/history')
      .then((r) => r.json())
      .then((d) => {
        const reps: StoredReport[] = Array.isArray(d.reports) ? d.reports : [];
        const now = Date.now();
        setUsage({
          reports30d: reps.filter((r) => now - new Date(r.analyzed_at).getTime() < 30 * 864e5).length,
          reportsTotal: reps.length,
          lastReport: reps.length > 0
            ? new Date(reps[0].analyzed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '—',
        });
      })
      .catch(() => {});
  }, []);

  const userEmail = session?.user?.email ?? null;
  const userName = getFirstName(session?.user?.name, userEmail);
  const market = getMarketStatus();
  const { reports30d, reportsTotal, lastReport } = usage;

  return (
    <>
      <div className="paper-grain" />
      <NavBar userEmail={userEmail} />

      <main className="page">
        <section className="dash-greet">
          <div>
            <div className="salute">{getGreeting()},</div>
            <h1>{userName} <em style={{ color: 'var(--indigo)' }}>—</em></h1>
            <p>Pick up where you left off, or research a new ticker.</p>
          </div>
          <div className="status">
            <span className="market-pill" style={{ background: 'var(--surface)', border: '1px solid var(--rule)', padding: '6px 10px', borderRadius: '999px' }}>
              <span className="live" style={{ background: market.open ? 'var(--teal)' : 'var(--ink-3)' }} />
              {market.label}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--ink-3)' }}>
              Connected as {userEmail ?? 'guest@cipher.io'}
            </span>
          </div>
        </section>

        <div className="dash-cols">
          {/* LEFT */}
          <div>
            <div className="panel" style={{ marginBottom: '4px' }}>
              <h3>Research a new ticker</h3>
              <TickerSearch cta="Decipher" />
            </div>
            <ReportHistory />
          </div>

          {/* RIGHT */}
          <div>
            <div className="panel">
              <h3>Watchlist <span style={{ color: 'var(--ink-3)' }}>{watch.length}</span></h3>
              {watch.length === 0 ? (
                <p style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--ink-3)' }}>Loading…</p>
              ) : watch.map((i) => (
                <div
                  key={i.sym}
                  onClick={() => router.push(`/research/${i.sym}`)}
                  style={{ display: 'grid', gridTemplateColumns: '64px 1fr 90px', padding: '10px 0', borderBottom: '1px dashed var(--rule)', alignItems: 'center', cursor: 'pointer', fontSize: '13px' }}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700 }}>{i.sym}</span>
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>{i.price != null ? `$${i.price}` : '—'}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, textAlign: 'right', color: i.up ? 'var(--teal)' : 'var(--rose)' }}>
                    {i.chg ?? '—'}
                  </span>
                </div>
              ))}
            </div>

            <div className="panel">
              <h3>Your usage</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '6px' }}>Reports · 30d</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: '38px', lineHeight: 1 }}>{reports30d}</div>
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '6px' }}>Reports · all-time</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: '38px', lineHeight: 1 }}>{reportsTotal}</div>
                </div>
                <div style={{ gridColumn: 'span 2', paddingTop: '8px', borderTop: '1px dashed var(--rule)' }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginBottom: '6px' }}>Most recent report</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: '24px' }}>{lastReport}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <FooterTicker />
    </>
  );
}
