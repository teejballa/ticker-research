# Phase 6: Full Web Deployment — Research

**Researched:** 2026-03-19
**Domain:** NextAuth.js, Neon PostgreSQL/Prisma, notebooklm-py multi-user, Vercel deployment
**Confidence:** HIGH on auth/db/Vercel stack. MEDIUM on notebooklm-py multi-user architecture (requires runtime workaround — see critical finding below).

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Auth provider:** NextAuth.js with Google OAuth — standard Next.js pattern
- **Identity model:** The Google account used for web app login IS the user's NotebookLM identity — one Google sign-in covers both
- **Unauthenticated access:** Redirect all unauthenticated visitors to the Google sign-in page — no public browsing
- **Open self-serve:** Anyone with a Google account can sign up immediately — no invite/waitlist
- **Token storage:** Google OAuth access token is stored in the NextAuth JWT session for server-side use (passing to Daytona container for NotebookLM operations)
- **Database:** Neon PostgreSQL (Vercel-native serverless Postgres, free tier)
- **ORM:** Prisma — type-safe schema, auto-migrations
- **Schema:** Single `reports` table with JSONB column (id UUID, user_id TEXT, ticker TEXT, company_name TEXT, analyzed_at TIMESTAMPTZ, market_sentiment TEXT, confidence_level TEXT, analysis JSONB)
- **Ownership:** Reports are private per-user — every query filters by `user_id`
- **Account model:** Each user's analysis runs under THEIR OWN Google account — their OAuth token from NextAuth is passed to the Daytona container at request time
- **Container topology:** One shared Daytona container controlled by the product owner — users authenticate via their Google token passed at runtime, not via pre-configured container auth
- **CRITICAL research dependency:** Must verify if `notebooklm-py` can accept a Google OAuth token programmatically
- **Local mode preserved:** All existing local-execution code is preserved throughout Phase 6 — not removed or broken
- **Web mode is additive:** Phase 6 adds new code; it does not delete or replace existing local-mode code
- **DEPLOYMENT_MODE=web:** This env var gates web-mode behavior; local mode always works
- **Cleanup deferred:** Remove local-mode code ONLY AFTER Phase 6 is confirmed working end-to-end in production
- **SetupWizard preserved:** Component stays in codebase; in web mode it is hidden/skipped but not deleted
- **Terminal aesthetic locked:** zinc-950 bg, amber-400 accents, IBM Plex Mono — NextAuth sign-in page must match (custom NextAuth pages, not default)

### Claude's Discretion
- Exact NextAuth session JWT structure and token refresh strategy
- Prisma migration workflow (initial migration naming, shadow database config for Neon)
- How `user_id` is stored (email string vs. NextAuth sub ID)
- Exact Daytona container API contract for passing Google tokens
- Middleware pattern for protecting all routes (NextAuth middleware vs. route-level checks)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 6 transforms the local-first app into a multi-user web product. The locked architecture adds three layers: Google OAuth authentication via NextAuth.js (v4 stable), Neon PostgreSQL via Prisma for cloud report persistence, and per-user NotebookLM analysis via the Daytona container.

**Critical finding on notebooklm-py multi-user:** `notebooklm-py` does NOT accept a standard Google OAuth access token. It uses browser-extracted session cookies (`storage_state.json`), not OAuth tokens. The `NOTEBOOKLM_AUTH_JSON` environment variable accepts these cookies as inline JSON — this is the mechanism for passing per-user credentials to the Daytona container. The architecture must be: when a user signs in, their `storage_state.json` cookie bundle (captured once at account-link time) is stored server-side per-user, then passed as `NOTEBOOKLM_AUTH_JSON` to the Daytona container subprocess at analysis time. The "Google OAuth access token from NextAuth" cannot be used directly for NotebookLM authentication — they are different credential types.

**Primary recommendation:** Use NextAuth v4 (stable 4.24.13, not v5 beta) with Google provider, Prisma 7 + Neon adapter for the database layer, and `NOTEBOOKLM_AUTH_JSON` environment variable injection for per-user notebooklm-py credential passing via Daytona.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-auth | 4.24.13 | Google OAuth, session management, middleware | v4 is stable; v5 is still beta (5.0.0-beta.30) — Next.js 15 + React 19 compatibility issues reported with v4 but workable; v5 has a migration-breaking API change not worth taking on |
| @prisma/client | 7.5.0 | Type-safe Neon PostgreSQL ORM | Standard for Next.js/Vercel; auto-generates types from schema |
| prisma | 7.5.0 | CLI for migrations and schema management | Same package, dev tool |
| @prisma/adapter-neon | 7.5.0 | Neon serverless driver adapter for Prisma | Required for Vercel serverless edge-compatible connections |
| @neondatabase/serverless | 1.0.2 | Neon WebSocket-based connection for serverless | Underlying driver for the Neon adapter |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @auth/prisma-adapter | 2.11.1 | Prisma adapter for NextAuth sessions/accounts tables | Only needed if using database sessions (not JWT strategy) — with JWT strategy this is NOT needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| next-auth v4 | next-auth v5 (Auth.js) | v5 has cleaner App Router API (`auth()` unified function), but is still beta — v4 is proven stable and has all needed features |
| Prisma + Neon | Drizzle + Neon | Drizzle is lighter but Prisma is more mature with better migration tooling; project uses TypeScript-first patterns that suit Prisma |
| JWT sessions | Database sessions | JWT is simpler — no `sessions` table needed, stateless, works with Vercel serverless without extra DB queries per request |

**Installation:**
```bash
npm install next-auth@4.24.13
npm install prisma@7.5.0 @prisma/client@7.5.0 @prisma/adapter-neon@7.5.0 @neondatabase/serverless@1.0.2
```

**Version verification (confirmed 2026-03-19):**
- `next-auth`: 4.24.13 (latest stable v4)
- `prisma` / `@prisma/client`: 7.5.0
- `@prisma/adapter-neon`: 7.5.0
- `@neondatabase/serverless`: 1.0.2

---

## CRITICAL FINDING: notebooklm-py Multi-User Authentication

**This is the most important research finding. It changes the architecture for multi-user NotebookLM access.**

### What Was Discovered

`notebooklm-py` does NOT use Google OAuth tokens. It uses browser-extracted session cookies via Playwright (`storage_state.json`). The `access_token` from NextAuth's Google OAuth flow is useless for authenticating NotebookLM — they are entirely different credential types.

**How `notebooklm-py` authentication actually works:**
1. `notebooklm login` runs Playwright/Chromium, the user logs into Google, Playwright captures the session cookies
2. Cookies are stored in `~/.notebooklm/storage_state.json`
3. Every `NotebookLMClient.from_storage()` call reads these cookies
4. The library uses Google's undocumented internal APIs (not public OAuth)

### Authentication Paths in notebooklm-py (precedence order)

1. `--storage /path/to/storage_state.json` — CLI flag, highest priority
2. `NOTEBOOKLM_AUTH_JSON` — inline JSON cookie bundle, ideal for CI/CD and server environments
3. `$NOTEBOOKLM_HOME/storage_state.json` — custom home directory
4. `~/.notebooklm/storage_state.json` — default location

### Multi-User Architecture Options

Given this constraint, Phase 6 has two viable paths for multi-user NotebookLM:

#### Option A: Single Owner Account (Recommended for MVP)
The product owner's `storage_state.json` is pre-loaded in the Daytona container. ALL users share this one Google account for NotebookLM analysis. This is the simplest path and matches Phase 4's cloud architecture.

**Implication:** Reports run under the product owner's NotebookLM account, not the user's. The "user's Google account IS their NotebookLM identity" locked decision is **not achievable with notebooklm-py 0.3.4** without the user also providing their own cookie bundle.

#### Option B: Per-User Cookie Bundle (Aligned with Locked Decisions)
Each user's NotebookLM session cookies are captured during account setup (via a one-time setup flow in the web app), stored encrypted in Neon per user_id, and injected as `NOTEBOOKLM_AUTH_JSON` environment variable when the Daytona container subprocess is spawned.

**Challenge:** Getting per-user cookie bundles requires the user to run a Playwright-based login flow in a browser that the Daytona container has access to — this is a non-trivial web flow. The product owner must decide if this complexity is warranted for MVP.

#### The NOTEBOOKLM_AUTH_JSON Mechanism (Enables Option B)

The environment variable accepts the entire `storage_state.json` contents as a JSON string:
```json
{
  "cookies": [
    { "name": "SID", "value": "...", "domain": ".google.com", ... },
    { "name": "HSID", "value": "...", ... },
    { "name": "__Secure-1PSID", "value": "...", ... }
  ],
  "origins": []
}
```

To inject per-user credentials at subprocess spawn time in Node.js:
```typescript
const proc = spawn('python3', ['scripts/notebooklm_research.py', filePath], {
  env: {
    ...process.env,
    NOTEBOOKLM_AUTH_JSON: userCookieBundle,  // from DB, per user
  }
});
```

**This mechanism works.** The subprocess gets an isolated environment with that user's cookies. It does NOT require changing `NOTEBOOKLM_HOME` — `NOTEBOOKLM_AUTH_JSON` takes precedence over all file paths.

### Recommendation for Planner

**For Phase 6 MVP:** Use Option A (single owner account in Daytona container). This matches Phase 4's existing cloud path and avoids a complex per-user cookie capture flow. The CONTEXT.md locked decision about "user's own Google account" should be treated as aspirational for v2. The planner should note this constraint in the plan and defer Option B to a future phase.

**If Option B is required by locked decisions:** The plan must include a "notebooklm account linking" wave where the user completes a browser-based login in the web app context (e.g., a dedicated OAuth-like flow that drives Playwright in the Daytona container to capture their cookies). This is a significant additional scope.

---

## Architecture Patterns

### Recommended Project Structure (new files only)
```
src/
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/
│   │   │       └── route.ts        # NextAuth route handler
│   │   ├── history/
│   │   │   └── route.ts            # DEPLOYMENT_MODE switch: web→Neon, local→filesystem
│   │   └── analysis/[ticker]/
│   │       └── route.ts            # Extend: web mode persists to Neon after result
│   ├── auth/
│   │   └── signin/
│   │       └── page.tsx            # Custom sign-in page (terminal aesthetic)
│   └── page.tsx                    # Extend: web mode reads history from Neon API
├── lib/
│   ├── auth.ts                     # NextAuth config (authOptions export)
│   ├── db.ts                       # Prisma client singleton
│   └── reports-db.ts               # Neon-backed writeReport/listReports/readReport
├── middleware.ts                   # NextAuth middleware (protects all routes in web mode)
└── types/next-auth.d.ts            # Session type augmentation for accessToken

prisma/
├── schema.prisma                   # reports table
└── migrations/                     # auto-generated by prisma migrate dev
```

### Pattern 1: NextAuth Route Handler (v4 App Router)
**What:** NextAuth v4 with App Router requires a route file at `app/api/auth/[...nextauth]/route.ts`
**When to use:** Always — this is the handler for all auth callbacks

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';
const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

```typescript
// src/lib/auth.ts
import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/signin',  // custom sign-in page
  },
  callbacks: {
    async jwt({ token, account }) {
      // Persist access_token on first sign-in (account is only present then)
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose accessToken server-side for Daytona proxy requests
      (session as any).accessToken = token.accessToken;
      return session;
    },
  },
};
```

### Pattern 2: NextAuth Middleware (protect all routes)
**What:** A single `middleware.ts` at the project root gates every page
**When to use:** `DEPLOYMENT_MODE=web` — protects all routes except auth callbacks and static assets

```typescript
// src/middleware.ts
import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/auth/signin',
  },
});

export const config = {
  matcher: [
    // Protect everything except NextAuth API routes, static files, and favicon
    '/((?!api/auth|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

**IMPORTANT:** This middleware must only activate in web mode. Since Vercel env vars are evaluated at request time with `force-dynamic`, use `DEPLOYMENT_MODE=web` as the Vercel project setting. The middleware will run for all deployments unless gated. To gate it:

```typescript
// src/middleware.ts
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export default function middleware(req: NextRequest) {
  if (process.env.DEPLOYMENT_MODE !== 'web') {
    return NextResponse.next();
  }
  return withAuth({
    pages: { signIn: '/auth/signin' },
  })(req as any, {} as any);
}
```

### Pattern 3: Prisma Client Singleton
**What:** Prevent multiple PrismaClient instances during Next.js hot reload
**When to use:** Always when using Prisma in Next.js

```typescript
// src/lib/db.ts
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const adapter = new PrismaNeon({
    connectionString: process.env.DATABASE_URL!,
  });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

### Pattern 4: Prisma Schema
**What:** The `reports` table as specified in CONTEXT.md, matching `StoredReport` type

```prisma
// prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model Report {
  id               String   @id @default(uuid())
  user_id          String
  ticker           String
  company_name     String
  analyzed_at      DateTime @db.Timestamptz
  market_sentiment String
  confidence_level String
  analysis         Json

  @@index([user_id, analyzed_at(sort: Desc)])
  @@map("reports")
}
```

**Note on `user_id`:** Use the user's email from `session.user.email` — this is stable, human-readable, and easy to query. NextAuth sub IDs are provider-specific and less readable. Email is the right choice.

### Pattern 5: Neon Connection Strings
**What:** Two separate connection strings are required for Neon + Prisma
**Why:** Serverless functions use pooled connections; Prisma CLI migrations need direct connections

```bash
# .env.local (never commit)
DATABASE_URL="postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
DIRECT_URL="postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require"
```

The pooled URL has `-pooler` in the hostname. Vercel + Neon integration auto-provides both when using the Neon Vercel integration.

### Pattern 6: DEPLOYMENT_MODE Switching in API Routes
**What:** Existing pattern extended to `web` mode — must remain backward compatible

```typescript
// In src/app/api/history/route.ts
if (process.env.DEPLOYMENT_MODE === 'web') {
  // Neon path — read from DB
  const reports = await listReportsFromDb(userId);
  return NextResponse.json({ reports });
}
// Local path — existing filesystem behavior unchanged
const reports = await listReports();
return NextResponse.json({ reports });
```

### Anti-Patterns to Avoid
- **Using NextAuth v5 beta:** The `auth()` unified function pattern is cleaner but v5 is still beta with React 19 compatibility warnings. Use v4 stable.
- **Database sessions with JWT strategy:** Do not use `@auth/prisma-adapter` for user/session tables — they are only needed for database session strategy. JWT strategy requires zero DB tables for auth.
- **Single global DATABASE_URL for migrations:** Always set `directUrl` in `schema.prisma` pointing to the non-pooled Neon connection — Prisma CLI migrations fail through the pooler.
- **Deleting local mode code before web mode is confirmed:** The CONTEXT.md explicitly forbids this. Any plan that removes SetupWizard or local filesystem code before web-mode production confirmation is wrong.
- **Storing notebooklm cookies in JWT session:** Google OAuth cookies are large (~2-3KB per user), and NextAuth JWT has a ~4KB default limit. Store them in Neon, not the JWT.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth session management | Custom JWT encoding/signing | NextAuth JWT strategy | Edge cases: token rotation, CSRF, cookie security, SameSite handling |
| Route protection | Manual session check in every page/API | NextAuth middleware.ts | Runs at edge before the request reaches any route |
| Database connection pooling | Manual pg pool | Neon serverless adapter + Prisma | PgBouncer-style pooling built in to Neon; prevents connection exhaustion on Vercel |
| Schema migrations | SQL files manually | `prisma migrate dev` / `prisma migrate deploy` | Type-safe, version-controlled, auto-applied on Vercel build |
| JSONB queries | Raw SQL | Prisma `Json` field type | Prisma handles serialization/deserialization automatically |
| Token refresh | Manual OAuth refresh logic | NextAuth handles it | NextAuth manages refresh token rotation automatically |

---

## Common Pitfalls

### Pitfall 1: Prisma Client Generated at Wrong Time on Vercel
**What goes wrong:** Vercel builds fail with "Cannot find module '@prisma/client'" or runtime errors because the generated client isn't included in the deployment bundle.
**Why it happens:** Prisma generates client code that must exist before `next build` runs. Vercel's default build doesn't run `prisma generate` automatically.
**How to avoid:** Add a `postinstall` script to `package.json`:
```json
{ "scripts": { "postinstall": "prisma generate" } }
```
Also use a custom Vercel build command: `prisma migrate deploy && next build`
**Warning signs:** Build error mentioning `@prisma/client` or `PrismaClientInitializationError` on cold starts.

### Pitfall 2: Neon Scale-to-Zero Connection Timeout
**What goes wrong:** First query after idle period (5+ minutes) times out with a connection error.
**Why it happens:** Neon's free tier scales compute to zero after inactivity. The first connection has ~5s startup latency.
**How to avoid:** Add `connect_timeout=10` to `DATABASE_URL`. The Neon serverless adapter handles this gracefully, but the connection string should allow extra time:
```
postgresql://...?sslmode=require&connect_timeout=10
```
**Warning signs:** `connection timeout` errors on first daily access.

### Pitfall 3: NextAuth Middleware Breaking Local Mode
**What goes wrong:** After adding `middleware.ts`, local development stops working because the middleware redirects all routes to the sign-in page.
**Why it happens:** Middleware runs in both local and deployed environments unless explicitly gated.
**How to avoid:** Gate the middleware on `DEPLOYMENT_MODE=web`. Local mode does not set this variable, so middleware is a no-op. Verify this is working before all other tests.
**Warning signs:** Local `npm start` immediately redirects to `/auth/signin`.

### Pitfall 4: notebooklm-py Multi-User Credential Confusion
**What goes wrong:** Assuming the Google OAuth `access_token` from NextAuth can be used to authenticate `notebooklm-py`. It cannot. They use completely different credential types.
**Why it happens:** The CONTEXT.md mentions "Google OAuth token passthrough to Daytona container" — this assumes OAuth tokens work. They don't with notebooklm-py.
**How to avoid:** For MVP, use a single owner `storage_state.json` pre-baked into the Daytona container. If per-user NotebookLM is required, build a separate cookie-capture flow and store the JSON bundle in Neon encrypted.
**Warning signs:** `notebooklm-py` authentication errors in Daytona container when passing NextAuth `access_token`.

### Pitfall 5: History API Route Not Gated by DEPLOYMENT_MODE
**What goes wrong:** Web-mode history (Neon queries) accidentally activates in local mode, causing DB connection errors for local users with no Neon credentials.
**Why it happens:** Forgetting the `DEPLOYMENT_MODE` guard in updated API routes.
**How to avoid:** Every route that touches Prisma/Neon must check `process.env.DEPLOYMENT_MODE === 'web'` first and fall through to local behavior otherwise.
**Warning signs:** `DATABASE_URL is not set` errors in local mode after Phase 6 changes.

### Pitfall 6: DIRECT_URL Missing for Migrations
**What goes wrong:** `prisma migrate deploy` on Vercel fails with a connection error through the pooler.
**Why it happens:** PgBouncer/Neon's pooler does not support all PostgreSQL protocol messages needed for migrations.
**How to avoid:** Always configure both `DATABASE_URL` (pooled) and `DIRECT_URL` (direct) in both local `.env` and Vercel environment variables. The `directUrl` field in `schema.prisma` tells Prisma CLI to use the direct connection.

### Pitfall 7: User ID Instability
**What goes wrong:** Reports become inaccessible after a user reconnects their Google account because the `user_id` value changed.
**Why it happens:** Using `token.sub` (provider sub-ID) which can differ between auth flows.
**How to avoid:** Use `session.user.email` as `user_id`. Email is stable, human-readable, and consistent across sessions. Even if Google issues different sub IDs in edge cases, the email remains constant.

---

## Code Examples

### Verified Pattern: Custom Sign-In Page (terminal aesthetic)
```typescript
// src/app/auth/signin/page.tsx
'use client';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

export default function SignIn() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center font-mono">
      <div className="border border-zinc-800 p-8 w-96">
        <div className="text-amber-400 tracking-widest text-xs mb-6">
          TICKER RESEARCH // AUTHENTICATION REQUIRED
        </div>
        <button
          onClick={() => signIn('google', { callbackUrl })}
          className="w-full border border-zinc-700 text-zinc-300 px-4 py-2 text-sm
                     hover:border-amber-400 hover:text-amber-400 transition-colors"
        >
          [ CONNECT GOOGLE ACCOUNT ]
        </button>
      </div>
    </div>
  );
}
```

### Verified Pattern: TypeScript Session Type Augmentation
NextAuth session type must be extended to include `accessToken`:
```typescript
// src/types/next-auth.d.ts
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    accessToken?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
  }
}
```

### Verified Pattern: Neon-backed report persistence
```typescript
// src/lib/reports-db.ts
import { prisma } from '@/lib/db';
import type { AnalysisResult, StoredReport } from '@/lib/types';

export async function writeReportToDb(
  result: AnalysisResult,
  userId: string
): Promise<string> {
  const report = await prisma.report.create({
    data: {
      user_id: userId,
      ticker: result.ticker,
      company_name: result.company_name,
      analyzed_at: new Date(result.analyzed_at),
      market_sentiment: result.market_sentiment,
      confidence_level: result.confidence_level,
      analysis: result as any,
    },
  });
  return report.id;
}

export async function listReportsFromDb(userId: string): Promise<StoredReport[]> {
  const rows = await prisma.report.findMany({
    where: { user_id: userId },
    orderBy: { analyzed_at: 'desc' },
  });
  return rows.map(r => ({
    ticker: r.ticker,
    company_name: r.company_name,
    analyzed_at: r.analyzed_at.toISOString(),
    market_sentiment: r.market_sentiment as StoredReport['market_sentiment'],
    confidence_level: r.confidence_level as StoredReport['confidence_level'],
    analysis: r.analysis as unknown as AnalysisResult,
  }));
}
```

### Verified Pattern: Session access in API route (v4 App Router)
```typescript
// In any API route
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response('Unauthorized', { status: 401 });
  }
  const userId = session.user.email;
  // ... proceed
}
```

### Verified Pattern: NOTEBOOKLM_AUTH_JSON injection for multi-user (Option B)
```typescript
// In analysis API route (web mode, per-user credentials)
const userCookieBundle = await getUserNotebooklmCookies(userId); // from Neon
const proc = spawn('python3', ['scripts/notebooklm_research.py', filePath], {
  env: {
    ...process.env,
    NOTEBOOKLM_AUTH_JSON: userCookieBundle,
    // NOTEBOOKLM_HOME intentionally NOT set — NOTEBOOKLM_AUTH_JSON takes precedence
  }
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `pages/api/auth/[...nextauth].ts` | `app/api/auth/[...nextauth]/route.ts` with `export { handler as GET, handler as POST }` | Next.js 13+ App Router | Route handler export pattern required |
| `NEXTAUTH_URL` + `NEXTAUTH_SECRET` | Auth.js v5 uses `AUTH_SECRET`, `AUTH_GOOGLE_ID` etc. | v5 beta | v4 still uses `NEXTAUTH_*` — don't apply v5 env var naming to v4 |
| PrismaClient without adapter | PrismaClient with `@prisma/adapter-neon` | Prisma 5+ | Neon serverless requires the adapter for WebSocket connections in edge environments |
| `schema.prisma` only config | Prisma 7+ can use `prisma.config.ts` | Prisma 7.0 | Both patterns work; `schema.prisma` config is still valid and simpler |
| Manual connection pooling | Neon pooler URL (`-pooler` hostname) | 2024 | Neon manages pooling via PgBouncer at the connection string level — no pgbouncer setup required |

**Deprecated/outdated:**
- `getSession()` client-side: Use `useSession()` hook instead (already deprecated in v4)
- `unstable_getServerSession`: Renamed to `getServerSession` — use the stable name
- Prisma `datasource` without `directUrl`: Always include `directUrl` for Neon to avoid migration failures

---

## Open Questions

1. **notebooklm-py multi-user: Option A vs Option B**
   - What we know: Option A (single owner account) is much simpler to implement; Option B (per-user cookies) requires a separate cookie-capture setup flow that adds significant scope
   - What's unclear: Whether the product owner is willing to defer per-user NotebookLM identity to v2, or wants it in v6
   - Recommendation: The planner should default to Option A (single Daytona container auth) and note Option B as a future milestone. The locked decision about "user's own Google account" cannot be implemented simply with notebooklm-py's current API.

2. **Google OAuth Client ID for Web**
   - What we know: A Google Cloud Console OAuth app must be created with `https://yourdomain.vercel.app/api/auth/callback/google` as an authorized redirect URI
   - What's unclear: Whether the Vercel domain is known at planning time
   - Recommendation: Plan a Wave 0 task for Google Cloud Console setup with localhost + production redirect URIs

3. **Neon free tier capacity**
   - What we know: Neon free tier has 0.5 GB storage, 1 project, auto-suspend after 5 minutes idle
   - What's unclear: Whether the JSONB analysis column (avg ~5KB each) stays within limits for MVP usage
   - Recommendation: Acceptable for MVP — 0.5GB supports ~100,000 reports. Not a concern at this stage.

4. **NextAuth v4 + React 19 compatibility**
   - What we know: There are reported issues with `SessionProvider` in React 19 / Next.js 15 with next-auth v4.24.x
   - What's unclear: Whether the specific issue affects this project (which uses App Router server components primarily)
   - Recommendation: Use server-side `getServerSession()` instead of client-side `SessionProvider`/`useSession()` where possible. For client components that need session data, pass it as props from server components.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 3.0.9 (unit) + Playwright 1.58.2 (e2e) |
| Config file | `vitest.config.ts` (exists) / `playwright.config.ts` (exists) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test && npx playwright test` |

### Phase Requirements → Test Map

| ID | Behavior | Test Type | Automated Command | File Exists? |
|----|----------|-----------|-------------------|-------------|
| WEB-01 | Unauthenticated request redirects to /auth/signin | e2e | `npx playwright test tests/e2e/auth.spec.ts` | Wave 0 |
| WEB-02 | Authenticated user can access home page | e2e | `npx playwright test tests/e2e/auth.spec.ts` | Wave 0 |
| WEB-03 | writeReportToDb persists report with correct user_id | unit | `npm run test -- reports-db` | Wave 0 |
| WEB-04 | listReportsFromDb returns only current user's reports | unit | `npm run test -- reports-db` | Wave 0 |
| WEB-05 | DEPLOYMENT_MODE=local falls through to filesystem in history route | unit | `npm run test -- history-route` | Wave 0 |
| WEB-06 | Prisma schema matches StoredReport TypeScript type | type | `npx tsc --noEmit` | Existing |
| WEB-07 | Custom sign-in page renders terminal aesthetic (zinc-950, amber accent) | e2e | `npx playwright test tests/e2e/signin.spec.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test && npx playwright test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/e2e/auth.spec.ts` — covers WEB-01, WEB-02, WEB-07
- [ ] `tests/unit/reports-db.test.ts` — covers WEB-03, WEB-04 (mock Prisma client)
- [ ] `tests/unit/history-route.test.ts` — covers WEB-05 (DEPLOYMENT_MODE guard)
- [ ] Google Cloud Console OAuth app configuration (manual, no automated test)
- [ ] Neon project + DATABASE_URL + DIRECT_URL provisioned (manual, before any DB work)

---

## Sources

### Primary (HIGH confidence)
- [GitHub: teng-lin/notebooklm-py](https://github.com/teng-lin/notebooklm-py) — authentication methods, NOTEBOOKLM_AUTH_JSON format, multi-user docs
- [notebooklm-py configuration docs](https://github.com/teng-lin/notebooklm-py/blob/main/docs/configuration.md) — credential precedence, environment variables, per-user paths
- [NextAuth.js Callbacks docs](https://next-auth.js.org/configuration/callbacks) — jwt/session callback patterns
- [NextAuth.js Next.js middleware docs](https://next-auth.js.org/configuration/nextjs) — middleware.ts protect all routes
- [NextAuth.js Custom Pages docs](https://next-auth.js.org/configuration/pages) — custom sign-in page
- [Neon Prisma connection guide](https://neon.com/docs/guides/prisma) — DATABASE_URL, DIRECT_URL, adapter setup
- [Prisma Vercel deployment docs](https://www.prisma.io/docs/orm/prisma-client/deployment/serverless/deploy-to-vercel) — postinstall, build command

### Secondary (MEDIUM confidence)
- [Auth.js v5 Next.js reference](https://authjs.dev/reference/nextjs) — v5 API for comparison/future reference
- [DeepWiki: notebooklm-py installation and setup](https://deepwiki.com/teng-lin/notebooklm-py/1.2-installation-and-setup) — auth flow overview

### Tertiary (LOW confidence)
- npm registry version checks (verified 2026-03-19 via `npm view`)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified via npm registry and official docs
- NextAuth auth patterns: HIGH — verified via official nextauth.js.org docs
- Prisma/Neon setup: HIGH — verified via Neon official docs and Prisma Vercel guide
- notebooklm-py multi-user: MEDIUM — verified via GitHub README and configuration docs; the NOTEBOOKLM_AUTH_JSON mechanism works but per-user cookie capture is an unsolved UX problem
- notebooklm-py + NextAuth token incompatibility: HIGH — confirmed; OAuth tokens ≠ browser session cookies

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable stack — NextAuth v4 and Prisma 7 change slowly; notebooklm-py 0.3.4 is the pinned version)
