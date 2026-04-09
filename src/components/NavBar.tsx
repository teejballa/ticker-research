'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { signOut } from 'next-auth/react';

function getMarketStatus(): { open: boolean; label: string } {
  const ny   = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day  = ny.getDay();
  const mins = ny.getHours() * 60 + ny.getMinutes();
  const isWeekday = day >= 1 && day <= 5;
  if (!isWeekday) return { open: false, label: 'WEEKEND' };
  if (mins >= 9 * 60 + 30 && mins < 16 * 60) return { open: true,  label: 'REGULAR SESSION' };
  if (mins >= 4 * 60        && mins < 9 * 60 + 30) return { open: true,  label: 'PRE-MARKET' };
  if (mins >= 16 * 60       && mins < 20 * 60) return { open: true,  label: 'AFTER-HOURS' };
  return { open: false, label: 'CLOSED' };
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
  const market = getMarketStatus();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerStatus, setDrawerStatus] = useState<{ userEmail?: string | null; nbmSessionActive?: boolean } | null>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    fetch('/api/setup/status')
      .then(r => r.json())
      .then(d => setDrawerStatus(d))
      .catch(() => {});
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setDrawerOpen(false); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  // Format email as "CONNECTED AS {truncated email}" per UI-SPEC NavIdentity contract
  const displayEmail = userEmail
    ? userEmail.length > 24
      ? userEmail.slice(0, 21) + '...'
      : userEmail
    : null;
  const navIdentityText = displayEmail ? `CONNECTED AS ${displayEmail}` : 'user@cipher.io';

  return (
    <>
      {/* Main nav */}
      <header className="flex justify-between items-center w-full px-4 fixed top-0 z-50 bg-surface h-[44px] border-b border-surface-container">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-black text-primary-container flex items-center gap-2">
            CIPHER
          </Link>
          <nav className="hidden md:flex items-center gap-4">
            <span className="text-sm font-bold text-primary-container tracking-tight">RESEARCH TERMINAL</span>
            <span className="text-sm font-bold text-on-surface/50 hover:bg-surface-container transition-colors duration-200 px-2 py-1 cursor-default">NYSE</span>
            <span className="text-sm font-bold text-on-surface/50 hover:bg-surface-container transition-colors duration-200 px-2 py-1 cursor-default">NASDAQ</span>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span
            data-testid="nav-identity"
            className="text-[11px] tracking-widest uppercase text-on-surface/50 font-bold font-mono hidden sm:block"
          >
            {navIdentityText}
          </span>
          {userEmail ? (
            <button
              onClick={() => setDrawerOpen(true)}
              className="text-sm font-bold text-on-surface/50 hover:bg-surface-container transition-colors duration-200 px-2 py-1"
            >
              ACCOUNT
            </button>
          ) : (
            <Link
              href="/auth/signin"
              className="text-sm font-bold text-on-surface/50 hover:bg-surface-container transition-colors duration-200 px-2 py-1"
            >
              SIGN IN
            </Link>
          )}
          <Link
            href="/"
            className="bg-primary-container text-on-primary-container px-3 py-1 text-xs font-bold rounded hover:bg-primary transition-colors active:scale-95 duration-100"
          >
            Analyze a Ticker →
          </Link>
          <div className="flex items-center gap-2 text-on-surface/50">
            <span className="material-symbols-outlined text-sm">schedule</span>
            <span
              className={`material-symbols-outlined text-sm ${market.open ? 'text-secondary' : 'text-outline-variant'}`}
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              fiber_manual_record
            </span>
          </div>
        </div>
      </header>

      {/* Sticky sub-bar — only on report pages */}
      {showSubBar && (
        <div className="fixed top-[44px] w-full z-40 bg-surface-container-high/80 backdrop-blur-md border-b border-outline-variant/20 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {ticker && (
              <div className="bg-primary-container text-on-primary-container px-2 py-0.5 font-mono font-bold text-sm tracking-tighter">
                {ticker}
              </div>
            )}
            {companyName && (
              <h1 className="font-bold text-sm tracking-tight text-on-surface">{companyName.toUpperCase()}</h1>
            )}
            {securityType && securityType !== 'unknown' && securityType !== 'equity' && (
              <span
                data-testid="security-type-badge"
                className="text-[10px] font-bold tracking-widest uppercase text-amber-400 border border-amber-400/40 px-1.5 py-0.5 font-mono"
              >
                {securityType.toUpperCase()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {onNewResearch && (
              <button
                onClick={onNewResearch}
                className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant flex items-center gap-1 hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-base">arrow_back</span>
                NEW RESEARCH
              </button>
            )}
            <div className="w-px h-4 bg-outline-variant/30" />
            {onExportPdf && (
              <button
                onClick={onExportPdf}
                className="text-[10px] font-bold tracking-widest uppercase text-on-surface-variant flex items-center gap-1 hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                EXPORT PDF
              </button>
            )}
          </div>
        </div>
      )}

      {/* Account drawer */}
      {drawerOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={() => setDrawerOpen(false)}
          />
          {/* Panel */}
          <div
            className="fixed right-0 top-0 h-full w-80 bg-surface-container border-l border-outline-variant/20 z-50 flex flex-col"
            style={{
              transform: drawerOpen ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.25s ease',
            }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
              <span className="text-[10px] font-bold tracking-[0.3em] text-outline uppercase">Account</span>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-outline hover:text-on-surface transition-colors"
                aria-label="Close account panel"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Drawer body */}
            <div className="flex-1 px-5 py-6 space-y-6 overflow-y-auto">
              {/* Email */}
              <div>
                <div className="text-[10px] text-primary/50 tracking-widest uppercase mb-1">Connected as</div>
                <div className="text-xs font-mono text-on-surface">
                  {drawerStatus?.userEmail ?? userEmail ?? '—'}
                </div>
              </div>

              {/* NbLM status */}
              <div>
                <div className="text-[10px] text-primary/50 tracking-widest uppercase mb-2">Research Engine</div>
                {drawerStatus?.nbmSessionActive ? (
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
                    <Link
                      href="/setup"
                      onClick={() => setDrawerOpen(false)}
                      className="text-[10px] font-bold tracking-wider text-tertiary border border-tertiary/30 px-2 py-1 hover:bg-tertiary/10 transition-colors inline-block"
                    >
                      RECONNECT →
                    </Link>
                  </div>
                )}
              </div>

              {/* Dashboard link */}
              <div>
                <Link
                  href="/dashboard"
                  onClick={() => setDrawerOpen(false)}
                  className="text-[10px] font-bold tracking-widest uppercase text-primary/70 hover:text-primary transition-colors"
                >
                  ← Dashboard
                </Link>
              </div>
            </div>

            {/* Sign out */}
            <div className="px-5 py-4 border-t border-outline-variant/20">
              <button
                onClick={() => signOut({ callbackUrl: '/auth/signin' })}
                className="text-[10px] font-bold tracking-widest uppercase text-outline hover:text-error/70 transition-colors"
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
