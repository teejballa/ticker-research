'use client';
import { SessionProvider } from 'next-auth/react';

// `refetchOnWindowFocus={false}` + `refetchInterval={0}` disable the
// background session poll. In dev this sidesteps a known next-auth + Next.js
// HMR race where an in-flight `fetch('/api/auth/session')` is cancelled by
// hot-reload and surfaces as a noisy
// `[next-auth][error][CLIENT_FETCH_ERROR] "Failed to fetch"` in the console.
// The error is dev-only and harmless (the next render restores session state).
// Production is unaffected — `useSession()` still hydrates from the JWT cookie
// on each route load.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      {children}
    </SessionProvider>
  );
}
