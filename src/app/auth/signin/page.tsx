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
            className="text-xs font-bold tracking-widest uppercase mb-2"
            style={{ color: '#f59e0b', fontSize: '11px', letterSpacing: '0.25em' }}
          >
            CIPHER // AI RESEARCH TERMINAL
          </div>
          <p
            className="text-xs leading-relaxed"
            style={{ color: 'rgba(223,226,235,0.45)', fontSize: '11px' }}
          >
            Sign in with Google to access the research engine.
            You&apos;ll connect your NotebookLM account on the next screen.
          </p>
        </div>

        {/* Sign-in button */}
        <button
          type="button"
          aria-label="Sign in with Google to access Cipher Research"
          onClick={() => signIn('google', { callbackUrl: '/setup' })}
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
          [ SIGN IN TO AUTHENTICATION AND RESEARCH ]
        </button>

        {/* Step preview */}
        <div className="space-y-2 pt-2" style={{ borderTop: '1px solid #1a2d42' }}>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'rgba(245,158,11,0.5)' }}>01</span>
            <span className="text-xs" style={{ color: 'rgba(223,226,235,0.35)', fontSize: '10px' }}>
              Verify Google account
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: 'rgba(245,158,11,0.5)' }}>02</span>
            <span className="text-xs" style={{ color: 'rgba(223,226,235,0.35)', fontSize: '10px' }}>
              Connect NotebookLM research engine
            </span>
          </div>
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
