'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';
import TickerSearch from '@/components/TickerSearch';

const TRY = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'META'];

export default function Terminal() {
  const { data: session } = useSession();

  return (
    <>
      <div className="paper-grain" />
      <NavBar userEmail={session?.user?.email} />

      <main className="page">
        <div className="terminal-wrap">
          <div className="glow" />
          <div className="terminal-card fade-in">
            <div
              style={{
                fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.3em',
                textTransform: 'uppercase', color: 'var(--indigo)', fontWeight: 600, marginBottom: '12px',
              }}
            >
              · Research terminal ·
            </div>
            <h1>
              Decipher any <em style={{ color: 'var(--indigo)' }}>ticker</em>.
            </h1>
            <p className="sub">
              Enter a symbol to generate a cited research report. Coverage spans NYSE, NASDAQ, and major ETFs.
            </p>

            <TickerSearch cta="Decipher" autoFocus />

            <div className="try-row">
              <span className="lbl">Try</span>
              {TRY.map((s) => (
                <Link key={s} href={`/research/${s}`} className="pill">{s}</Link>
              ))}
            </div>
          </div>
        </div>
      </main>

      <FooterTicker />
    </>
  );
}
