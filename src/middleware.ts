// src/middleware.ts
// DEPLOYMENT_MODE-gated NextAuth middleware.
// In local mode (DEPLOYMENT_MODE unset): middleware is a complete no-op — local users unaffected.
// In web mode (DEPLOYMENT_MODE=web): all routes except auth callbacks and static assets require
// an active NextAuth session; unauthenticated requests receive HTTP 307 to /auth/signin.
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function middleware(req: NextRequest) {
  if (process.env.DEPLOYMENT_MODE !== 'web') {
    // Local mode: no auth gate — pass all requests through immediately
    return NextResponse.next();
  }
  // Web mode: delegate to NextAuth middleware
  return (withAuth({
    pages: { signIn: '/auth/signin' },
  }) as (req: NextRequest) => Response | Promise<Response>)(req);
}

export const config = {
  matcher: [
    // Protect all routes except NextAuth callbacks, static assets, and favicon
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
