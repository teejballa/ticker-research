# Phase 6: Full Web Deployment — Vercel, Database, Auth, Report & Account Persistence - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning (pending critical research on notebooklm-py token passthrough)

<domain>
## Phase Boundary

Transform the local-first app into a deployed multi-user web product. This phase adds: Google OAuth authentication via NextAuth.js, Neon PostgreSQL for cloud report persistence, and a shared Daytona container for server-side NotebookLM analysis using each user's own Google credentials. The existing local execution mode (DEPLOYMENT_MODE=local) is preserved intact throughout this phase and only removed after Phase 6 is confirmed working in production. Web mode is additive, not a replacement.

</domain>

<decisions>
## Implementation Decisions

### Authentication
- **Provider:** NextAuth.js with Google OAuth — standard Next.js pattern, fits naturally since users already have Google accounts
- **Identity model (Option C — Dual Login):** Users log in TWICE — first with Google OAuth via NextAuth (for app authentication and report ownership), then a separate NotebookLM login via the setup wizard (browser-based cookie capture via `notebooklm-py`) for their own NotebookLM account. The app clearly warns users about the two-step requirement in the UI.
  - **Rationale:** `notebooklm-py 0.3.4` authenticates via browser-extracted session cookies (`storage_state.json`), NOT Google OAuth tokens. The NextAuth `access_token` cannot authenticate `notebooklm-py` — they are entirely different credential systems. True per-user NotebookLM identity requires each user to complete a separate `notebooklm login` flow.
  - **Previous locked decision superseded:** The original decision ("one Google sign-in covers both") was invalidated by RESEARCH.md findings and replaced with Option C on 2026-03-21.
- **Unauthenticated access:** Redirect all unauthenticated visitors to the Google sign-in page — no public browsing; app is for authenticated users only
- **Open self-serve:** Anyone with a Google account can sign up and start immediately — no invite/waitlist
- **Token storage:** Google OAuth access token is stored in the NextAuth JWT session for server-side use; NotebookLM credentials stored separately per-user via the setup wizard flow
- **UX requirement:** Onboarding UI must clearly explain both login steps and why two logins are needed

### Database & Report Storage
- **Provider:** Neon PostgreSQL (Vercel-native serverless Postgres, free tier for early stage)
- **ORM:** Prisma — type-safe schema, auto-migrations, standard for Next.js/Vercel
- **Schema:** Single `reports` table with JSONB column:
  ```
  reports(
    id            UUID PRIMARY KEY,
    user_id       TEXT NOT NULL,         -- NextAuth session user ID / email
    ticker        TEXT NOT NULL,
    company_name  TEXT NOT NULL,
    analyzed_at   TIMESTAMPTZ NOT NULL,
    market_sentiment  TEXT NOT NULL,     -- 'bullish' | 'neutral' | 'bearish'
    confidence_level  TEXT NOT NULL,     -- 'Low' | 'Medium' | 'High'
    analysis      JSONB NOT NULL         -- full AnalysisResult JSON
  )
  ```
- **Ownership:** Reports are private per-user — every query filters by `user_id`; no public sharing in this phase

### NotebookLM Multi-User Cloud Execution
- **Account model (Option C):** Each user's analysis runs under THEIR OWN Google account — each user completes a one-time `notebooklm login` (browser-based cookie capture) via the setup wizard in the web app. Their `storage_state.json` cookies are stored per-user in Neon (encrypted) and sent to the Daytona container at request time.
- **Container topology:** One shared Daytona container controlled by the product owner — users authenticate via their own stored NotebookLM cookies passed at runtime, not via a single pre-configured container auth.
- **Credential storage:** Per-user NotebookLM `storage_state.json` content stored encrypted in Neon, tied to `user_id`. Sent to Daytona container on each analysis request.
- **UX:** Setup wizard shows both login steps with explanations: Step 1 (Google OAuth for app access) and Step 2 (NotebookLM browser login for analysis capability). Warning displayed that two logins are required.
- **Research finding:** RESEARCH.md (2026-03-21) confirmed `notebooklm-py 0.3.4` uses browser session cookies, not OAuth tokens. Per-user identity requires per-user cookie capture — implemented via Option C dual-login flow.

### Local Mode Coexistence (Safety Net)
- **Local mode stays intact:** All existing local-execution code (SetupWizard, filesystem `~/.equinfo/reports/`, Python/notebooklm-py checks) is preserved throughout Phase 6 development — not removed or broken
- **Web mode is additive:** Phase 6 adds new code; it does not delete or replace existing local-mode code
- **Gating:** `DEPLOYMENT_MODE` env var continues to control routing (existing pattern from Phase 4); web mode enabled via `DEPLOYMENT_MODE=web`
- **Cleanup deferred:** Remove local-mode code only AFTER Phase 6 is confirmed working end-to-end in production — not before
- **SetupWizard preserved:** Component stays in codebase; in web mode it is hidden/skipped but not deleted

### Claude's Discretion
- Exact NextAuth session JWT structure and token refresh strategy
- Prisma migration workflow (initial migration naming, shadow database config for Neon)
- How `user_id` is stored (email string vs. NextAuth sub ID) — pick what's cleanest for Neon queries
- Exact Daytona container API contract for passing Google tokens
- Middleware pattern for protecting all routes (NextAuth middleware vs. route-level checks)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Critical Research (must be resolved before planning)
- *No file yet* — Researcher must investigate: **Can `notebooklm-py` accept a Google OAuth access token programmatically?** Check `notebooklm-py` (teng-lin, PyPI `notebooklm-py==0.3.4`) source code, issues, and docs. This determines the entire NotebookLM multi-user architecture.

### Existing architecture (must not be broken)
- `src/app/api/analysis/[ticker]/route.ts` — Cloud proxy branch already exists (`DEPLOYMENT_MODE=cloud`). Phase 6 extends this pattern; do not replace.
- `src/app/api/setup/status/route.ts` — Returns `userEmail`, `authOk`, `allOk`. In web mode, these checks become irrelevant; route may need a DEPLOYMENT_MODE guard.
- `src/lib/reports.ts` — Local filesystem report persistence. Preserved. Web mode adds a parallel Neon-based persistence path; does not replace this.
- `src/lib/types.ts` — `StoredReport` and `AnalysisResult` are canonical. Prisma schema must match `StoredReport` shape.

### Phase 4 deployment architecture
- `.planning/phases/04-deployment/` — Daytona container design, DEPLOYMENT_MODE pattern, vercel.json maxDuration decisions. Phase 6 builds on this.

### Phase 5 report history
- `.planning/phases/05-user-identity-report-history/05-CONTEXT.md` — Local report storage decisions (`~/.equinfo/reports/`, `StoredReport` schema, `userEmail` from notebooklm auth). Phase 6 replaces the storage mechanism for web mode; local mode storage unchanged.

### NextAuth.js
- Research the `jwt` callback for storing Google `access_token` in the session token, and the `session` callback for exposing it to the server

### Neon PostgreSQL
- Neon serverless driver (`@neondatabase/serverless`) — use with Prisma for Vercel edge compatibility

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/api/analysis/[ticker]/route.ts`: DEPLOYMENT_MODE branch already exists. Extend: in web mode, read user identity from NextAuth session and pass Google token to Daytona container.
- `src/lib/reports.ts` `writeReport()`: Local write function. Parallel `writeReportToDb()` function follows the same interface for web mode.
- `src/lib/types.ts` `StoredReport`: Prisma schema maps directly to this type — no new type needed for DB storage.
- `src/app/page.tsx`: Home page is `'use client'`. In web mode, conditionally render history from Neon API instead of filesystem API. DEPLOYMENT_MODE check controls which data source.

### Established Patterns
- `DEPLOYMENT_MODE` env var gates local vs. cloud behavior — Phase 4 pattern. Phase 6 extends this with `DEPLOYMENT_MODE=web`.
- API routes use `export const dynamic = 'force-dynamic'` for runtime env var evaluation on Vercel — already present on analysis and research routes.
- `export const maxDuration = 300` on analysis route — proxy-only on Vercel; already in place.
- Terminal aesthetic locked: zinc-950 bg, amber-400 accents, IBM Plex Mono — NextAuth sign-in page must match this aesthetic (custom NextAuth pages, not default).

### Integration Points
- **New:** `src/app/api/auth/[...nextauth]/route.ts` — NextAuth route handler
- **New:** `prisma/schema.prisma` — reports table + Neon provider
- **New:** `src/lib/db.ts` — Prisma client singleton
- **New:** `src/app/api/history/route.ts` — currently reads filesystem; web mode version reads from Neon (or DEPLOYMENT_MODE switch in existing route)
- **Extend:** `src/app/api/analysis/[ticker]/route.ts` — web mode path persists to Neon after successful AnalysisResult
- **Extend:** `src/middleware.ts` (new) — NextAuth middleware to protect all routes in web mode

</code_context>

<specifics>
## Specific Ideas

- NextAuth sign-in page should be fully custom — terminal aesthetic must be maintained (zinc-950, amber accents, monospace). Default NextAuth pages are generic and would break the visual identity.
- The `DEPLOYMENT_MODE` env var is the toggle — `web` enables auth + Neon; anything else (or unset) falls back to local behavior. This is the safety net: local mode always works.
- Per the user: "What if Phase 6 fails? Then I cannot run it locally on my computer." — This is the explicit reason local mode is preserved. No local code is touched until web deployment is confirmed working.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-full-web-deployment-vercel-database-auth-report-account-persistence*
*Context gathered: 2026-03-19*
