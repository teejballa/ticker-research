// src/app/auth/signin/page.tsx
'use client';
import { signIn } from 'next-auth/react';
import { Suspense } from 'react';

function SignInContent() {
  return (
    <div
      data-testid="signin-root"
      className="min-h-screen flex items-center justify-center font-mono"
      style={{ backgroundColor: '#080a0f' }}
    >
      <div
        className="w-96 max-sm:w-full max-sm:mx-4 p-8 space-y-6"
        style={{ border: '1px solid #1a2d42' }}
      >
        {/* Header */}
        <div>
          <div
            className="text-xs font-bold tracking-widest uppercase mb-3"
            style={{ color: '#f59e0b', fontSize: '11px', letterSpacing: '0.25em' }}
          >
            CIPHER // WELCOME
          </div>
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'rgba(223,226,235,0.55)', fontSize: '12px' }}
          >
            Create a free account or sign in to access your personal research workspace.
          </p>
        </div>

        {/* Sign-in button */}
        <button
          type="button"
          aria-label="Sign in or create account with Google"
          onClick={() => signIn('google', { callbackUrl: '/dashboard' })}
          className="w-full text-xs font-bold uppercase tracking-widest transition-colors duration-150"
          style={{
            minHeight: '44px',
            padding: '10px 16px',
            border: '1px solid rgba(245,158,11,0.5)',
            color: 'rgba(245,158,11,0.85)',
            background: 'transparent',
            fontSize: '11px',
            letterSpacing: '0.12em',
            cursor: 'pointer',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(245,158,11,0.08)';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.8)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(245,158,11,0.5)';
          }}
        >
          [ SIGN IN / CREATE ACCOUNT ]
        </button>

        {/* Social proof */}
        <p
          className="text-center text-[10px]"
          style={{ color: 'rgba(223,226,235,0.25)' }}
        >
          Takes 30 seconds · No credit card required
        </p>

        {/* Step preview */}
        <div className="space-y-2 pt-1" style={{ borderTop: '1px solid #1a2d42' }}>
          {[
            'Verify with Google',
            'Connect your research engine',
            'Access your dashboard',
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs tabular-nums" style={{ color: 'rgba(245,158,11,0.4)' }}>
                0{i + 1}
              </span>
              <span className="text-xs" style={{ color: 'rgba(223,226,235,0.35)', fontSize: '10px' }}>
                {step}
              </span>
            </div>
          ))}
        </div>
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
