'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { useTheme } from '@/lib/use-theme';

function getMarketStatus(): { open: boolean; label: string } {
  const ny   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = ny.getDay();
  const mins = ny.getHours() * 60 + ny.getMinutes();
  const isWeekday = day >= 1 && day <= 5;
  if (!isWeekday) return { open: false, label: 'Markets closed · Weekend' };
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return { open: true,  label: 'Live · Regular session' };
  if (mins >= 4 * 60        && mins < 9 * 60 + 30) return { open: true,  label: 'Live · Pre-market' };
  if (mins >= 16 * 60       && mins < 20 * 60) return { open: true,  label: 'Live · After-hours' };
  return { open: false, label: 'Markets closed' };
}

interface NavBarProps {
  ticker?: string;
  companyName?: string;
  onNewResearch?: () => void;
  onExportPdf?: () => void;
  showSubBar?: boolean;
  userEmail?: string | null;
  securityType?: string | null;
}

export default function NavBar({
  ticker,
  companyName,
  onNewResearch,
  onExportPdf,
  showSubBar = false,
  userEmail,
  securityType,
}: NavBarProps) {
  const market   = getMarketStatus();
  const pathname = usePathname();
  const { dark, toggle } = useTheme();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setDrawerOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // "CONNECTED AS {truncated email}" per UI-SPEC NavIdentity contract
  const displayEmail = userEmail
    ? userEmail.length > 24 ? userEmail.slice(0, 21) + '…' : userEmail
    : null;

  const links = [
    { to: '/terminal', label: 'Research' },
    { to: '/insights', label: 'Insights' },
  ];

  return (
    <>
      {/* Main nav */}
      <header className="nav">
        <div className="nav-left">
          <button
            type="button"
            className="theme-gear"
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggle}
          >
            {dark ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4.2" />
                <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="2.6" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            )}
          </button>

          <Link href="/" className="nav-brand">
            <span className="dot" />
            CIPHER
          </Link>

          <nav className="nav-links">
            {links.map((l) => {
              const active = pathname === l.to || pathname.startsWith(l.to + '/');
              return (
                <Link key={l.to} href={l.to} className={`nav-link${active ? ' active' : ''}`}>
                  {l.label}
                </Link>
              );
            })}
            <span className="nav-link muted">NYSE</span>
            <span className="nav-link muted">NASDAQ</span>
          </nav>
        </div>

        <div className="nav-right">
          <span className="market-pill">
            <span className="live" style={{ background: market.open ? 'var(--teal)' : 'var(--ink-3)' }} />
            {market.label}
          </span>

          {displayEmail && (
            <span data-testid="nav-identity" className="nav-identity hidden sm:block">
              Connected as {displayEmail}
            </span>
          )}

          {userEmail ? (
            <button className="nav-link" onClick={() => setDrawerOpen(true)}>
              Account
            </button>
          ) : (
            <Link href="/auth/signin" className="nav-link">
              Sign in
            </Link>
          )}

          <Link href="/terminal" className="nav-cta">
            Analyze a ticker
            <span style={{ fontSize: '14px' }}>→</span>
          </Link>
        </div>
      </header>

      {/* Sticky sub-bar — report pages only */}
      {showSubBar && (
        <div
          className="fixed top-[56px] w-full z-40 px-4 py-2 flex items-center justify-between border-b"
          style={{
            background: 'color-mix(in srgb, var(--surface) 85%, transparent)',
            borderColor: 'var(--rule)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <div className="flex items-center gap-4">
            {ticker && (
              <div className="bg-primary-container text-on-primary-container px-2 py-0.5 font-mono font-bold text-sm tracking-tight rounded-[3px]">
                {ticker}
              </div>
            )}
            {companyName && (
              <h1 className="font-bold text-sm tracking-tight text-on-surface">{companyName.toUpperCase()}</h1>
            )}
            {securityType && securityType !== 'unknown' && securityType !== 'equity' && (
              <span
                data-testid="security-type-badge"
                className="text-[10px] font-bold tracking-widest uppercase text-tertiary border border-tertiary/40 px-1.5 py-0.5 font-mono rounded-[3px]"
              >
                {securityType.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {onNewResearch && (
              <button
                onClick={onNewResearch}
                className="text-[11px] font-semibold text-on-surface-variant flex items-center gap-1 hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-base">arrow_back</span>
                New report
              </button>
            )}
            <div className="w-px h-4 bg-outline-variant" />
            {onExportPdf && (
              <button
                onClick={onExportPdf}
                className="text-[11px] font-semibold text-on-surface-variant flex items-center gap-1 hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                Export PDF
              </button>
            )}
          </div>
        </div>
      )}

      {/* Account drawer */}
      {drawerOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            className="fixed right-0 top-0 h-full w-80 bg-surface border-l border-outline-variant z-50 flex flex-col"
            style={{ transform: 'translateX(0)', transition: 'transform 0.25s ease' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
              <span className="text-[10px] font-bold tracking-[0.3em] text-outline uppercase">Account</span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-outline hover:text-on-surface transition-colors"
                aria-label="Close account panel"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="flex-1 px-5 py-6 space-y-6 overflow-y-auto">
              <div>
                <div className="text-[10px] text-primary/60 tracking-widest uppercase mb-1">Connected as</div>
                <div className="text-xs font-mono text-on-surface break-all">{userEmail ?? '—'}</div>
              </div>
              <div>
                <Link
                  href="/dashboard"
                  onClick={() => setDrawerOpen(false)}
                  className="text-[10px] font-bold tracking-widest uppercase text-primary hover:opacity-70 transition-opacity"
                >
                  → Dashboard
                </Link>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-outline-variant">
              <button
                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                className="text-[10px] font-bold tracking-widest uppercase text-outline hover:text-error transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
