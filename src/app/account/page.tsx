'use client';

// src/app/account/page.tsx
// Account settings page — shows connected email, NbLM session status, and sign-out.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import NavBar from '@/components/NavBar';

interface StatusResponse {
  userEmail: string | null;
  nbmSessionActive?: boolean;
}

export default function AccountPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    fetch('/api/setup/status')
      .then((r) => r.json())
      .then((d: StatusResponse) => setStatus(d))
      .catch(() => {});
  }, []);

  const userEmail = session?.user?.email ?? status?.userEmail ?? null;
  const nbmActive = status?.nbmSessionActive ?? false;

  return (
    <>
      <NavBar userEmail={userEmail} />
      <main className="pt-[44px]">
        <div className="max-w-lg mx-auto mt-24 p-6 bg-surface-container border border-outline-variant/20">

          {/* Section: Identity */}
          <div className="mb-6">
            <div className="text-[11px] text-primary/50 tracking-widest uppercase mb-1">
              CONNECTED ACCOUNT
            </div>
            <div className="text-xs font-mono text-on-surface">
              {userEmail ?? '—'}
            </div>
          </div>

          {/* Section: NbLM Session */}
          <div className="mb-6">
            <div className="text-[11px] text-primary/50 tracking-widest uppercase mb-1">
              NOTEBOOKLM SESSION
            </div>
            {nbmActive ? (
              <div className="text-[11px] font-mono text-secondary">SESSION ACTIVE</div>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px] font-mono" style={{ color: '#f59e0b' }}>
                  SESSION EXPIRED
                </div>
                <button
                  type="button"
                  onClick={() => router.push('/setup')}
                  className="bg-primary-container text-on-primary-container px-3 py-1 text-[10px] font-bold tracking-wider transition-opacity hover:opacity-90"
                >
                  RECONNECT NOTEBOOKLM →
                </button>
              </div>
            )}
          </div>

          {/* Section: Sign Out */}
          <div>
            <button
              type="button"
              data-testid="end-session-btn"
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              className="text-[10px] font-bold tracking-widest uppercase transition-colors px-3 py-1 border"
              style={{ borderColor: 'transparent', color: '#8d90a2' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,180,171,0.4)';
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,180,171,0.6)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = '#8d90a2';
              }}
            >
              END SESSION
            </button>
          </div>

        </div>
      </main>
    </>
  );
}
