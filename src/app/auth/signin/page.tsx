// src/app/auth/signin/page.tsx
'use client';

import { Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import NavBar from '@/components/NavBar';
import FooterTicker from '@/components/FooterTicker';

const STEPS = [
  'Sign in with Google',
  'Generate your first report',
  'Review and export to PDF',
];

const RESEARCH_PATH_RE = /^\/research\/([A-Z0-9.\-^=]{1,20})/i;

function SignInInner() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard';

  // Detect that the user was redirected from a research page (e.g. /research/MSFT).
  // Show a ticker-specific gate so the prompt feels like a continuation of the
  // user's action rather than a generic sign-in screen.
  let gatedTicker: string | null = null;
  try {
    const parsed = new URL(callbackUrl, 'http://placeholder');
    const match = parsed.pathname.match(RESEARCH_PATH_RE);
    if (match && match[1].toUpperCase() !== 'AAPL') {
      gatedTicker = match[1].toUpperCase();
    }
  } catch {
    // bad callbackUrl — fall through to default copy
  }

  const heading = gatedTicker ? (
    <>Sign in to research <em style={{ color: 'var(--indigo)' }}>{gatedTicker}</em>.</>
  ) : (
    <>Welcome <em style={{ color: 'var(--indigo)' }}>back</em>.</>
  );

  const body = gatedTicker
    ? `Generating a Cipher report requires a free account. AAPL is open as a sample — every other ticker is behind sign-in. We'll bring you back to ${gatedTicker} right after.`
    : 'Sign in to generate research reports and keep your history. Free during early access — no credit card required.';

  return (
    <>
      <div className="paper-grain" />
      <NavBar />

      <main className="page">
        <div className="signin-wrap">
          <div className="glow" />
          <div className="signin-card fade-in" data-testid="signin-root">
            <div className="tag">
              {gatedTicker ? `Cipher / Locked: ${gatedTicker}` : 'Cipher / Sign in'}
            </div>
            <h1>{heading}</h1>
            <p>{body}</p>

            <button
              type="button"
              className="google-btn"
              aria-label="Sign in or create account with Google"
              onClick={() => signIn('google', { callbackUrl })}
            >
              <span className="g">G</span>
              Continue with Google
            </button>

            {gatedTicker && (
              <Link
                href="/research/AAPL"
                className="mt-3 inline-block text-[11px] tracking-[0.18em] uppercase"
                style={{ color: 'var(--ink-3)', textDecoration: 'underline' }}
              >
                Or open the AAPL sample first →
              </Link>
            )}

            <div className="signin-steps">
              {STEPS.map((s, i) => (
                <div key={i} className="signin-step">
                  <span className="num">0{i + 1}</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <FooterTicker />
    </>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={null}>
      <SignInInner />
    </Suspense>
  );
}
