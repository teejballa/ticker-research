// src/middleware.ts
// DEPLOYMENT_MODE-gated NextAuth middleware.
// In local mode (DEPLOYMENT_MODE unset): middleware is a complete no-op — local users unaffected.
// In web mode (DEPLOYMENT_MODE=web): all routes except auth callbacks and static assets require
// an active NextAuth session; unauthenticated requests receive HTTP 307 to /auth/signin.
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function middleware(req: NextRequest) {
  // Edge middleware only has access to NEXT_PUBLIC_ env vars at runtime.
  // DEPLOYMENT_MODE (non-public) is not available here — use NEXT_PUBLIC_DEPLOYMENT_MODE.
  if ((process.env.NEXT_PUBLIC_DEPLOYMENT_MODE ?? '').trim() !== 'web') {
    // Local mode: no auth gate — pass all requests through immediately
    return NextResponse.next();
  }
  // Landing page is public — no auth required. Everything else requires a session.
  if (req.nextUrl.pathname === '/') {
    return NextResponse.next();
  }
  // Cron endpoints authenticate via Bearer CRON_SECRET inside the route handler — bypass NextAuth.
  // Insights API is public (anonymized aggregate data) — bypass NextAuth.
  // market-snapshot + sectors serve public market data (Yahoo quotes, no user
  // data) and feed the public landing page — bypass NextAuth.
  // ticker/chart + ticker/search power the public landing-page search bar — bypass NextAuth.
  // AAPL is the public sample report — both the page and its supporting APIs
  // are reachable without a session. All other tickers require login.
  const path = req.nextUrl.pathname;
  if (
    path.startsWith('/api/cron') ||
    path.startsWith('/api/insights') ||
    path === '/insights' ||
    path === '/api/market-snapshot' ||
    path === '/api/sectors' ||
    path.startsWith('/api/ticker/') ||
    path === '/research/AAPL' ||
    path === '/api/research/AAPL' ||
    path === '/api/analysis/AAPL'
  ) {
    return NextResponse.next();
  }
  // Web mode: delegate to NextAuth middleware
  return (withAuth({
    pages: { signIn: '/auth/signin' },
  }) as (req: NextRequest) => Response | Promise<Response>)(req);
}

export const config = {
  matcher: [
    // Protect all routes except NextAuth callbacks, e2e test helpers, Next.js
    // internals, and anything in /public/ — public assets are detected by file
    // extension. Without the extension exclusion, signed-out visitors land on
    // /auth/signin instead of seeing the requested PNG/SVG/font/manifest, which
    // surfaces as broken-image icons on the landing hero animation.
    '/((?!api/auth|api/test|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|webmanifest|woff|woff2|ttf|otf|map|txt|xml)).*)',
  ],
};
