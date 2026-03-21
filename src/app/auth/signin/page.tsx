// src/app/auth/signin/page.tsx
'use client';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';
  const error = searchParams.get('error');

  return (
    <div
      data-testid="signin-root"
      className="min-h-screen flex items-center justify-center font-mono"
      style={{ backgroundColor: '#080a0f' }}
    >
      {/* Responsive container: w-96 desktop, full-width with mx-4 mobile */}
      <div
        className="w-96 max-sm:w-full max-sm:mx-4 p-8"
        style={{ border: '1px solid #1a2d42' }}
      >
        {/* Authentication header — amber-400, overline style */}
        <div
          className="text-xs font-bold tracking-widest uppercase mb-6"
          style={{ color: '#f59e0b', fontSize: '11px', letterSpacing: '0.25em' }}
        >
          TICKER RESEARCH // AUTHENTICATION REQUIRED
        </div>

        {/* Sign-in button — ghost outline default, amber hover, 40px min-height */}
        <button
          type="button"
          aria-label="Sign in with Google"
          onClick={() => signIn('google', { callbackUrl })}
          className="w-full text-xs font-bold uppercase tracking-widest transition-colors duration-150"
          style={{
            minHeight: '40px',
            padding: '8px 16px',
            border: '1px solid #3f3f46',
            color: '#c9d4e0',
            background: 'transparent',
            fontSize: '11px',
            letterSpacing: '0.12em',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#f59e0b';
            (e.currentTarget as HTMLButtonElement).style.color = '#f59e0b';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#3f3f46';
            (e.currentTarget as HTMLButtonElement).style.color = '#c9d4e0';
          }}
        >
          [ CONNECT GOOGLE ACCOUNT ]
        </button>

        {/* Error state — only shown when ?error= param present */}
        {error && (
          <p
            className="mt-4 text-xs"
            style={{ color: '#4a6a8a', fontSize: '11px' }}
          >
            Authentication failed. Return to sign-in.
          </p>
        )}
      </div>
    </div>
  );
}

export default function SignIn() {
  return (
    <Suspense fallback={null}>
      <SignInContent />
    </Suspense>
  );
}
