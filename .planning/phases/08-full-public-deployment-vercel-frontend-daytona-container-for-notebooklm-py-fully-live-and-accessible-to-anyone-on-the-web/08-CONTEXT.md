# Phase 8: Full Public Deployment — Context

**Gathered:** 2026-03-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire together the built app (Vercel frontend + Daytona container) and make it fully accessible to anyone on the web. This phase is about actual go-live: provisioning infrastructure, solving the web-context NotebookLM auth UX, and shipping a working multi-user deployment. All code was built in Phases 1–7; this phase makes it real and public.

Adding new features, improving research quality, or changing the report format are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Daytona Container Hosting
- **Provider:** Daytona's cloud service — create a workspace from `devcontainer.json`; Daytona manages the VM, uptime, and access URL. No self-hosted server needed.
- **Vercel ↔ Container protocol:** HTTP — Vercel sends POST requests with the source package JSON + user NbLM cookies; container runs the Python script and streams PROGRESS/RESULT lines back. Extends the existing `DEPLOYMENT_MODE=cloud` proxy pattern.
- **Container HTTP server:** Minimal FastAPI (or Flask) server wrapping the existing `scripts/notebooklm_research.py`. Receives request, spawns script, streams stdout back. No new Python logic needed beyond the server wrapper.
- **Endpoint auth:** `DAYTONA_CONTAINER_URL` and `DAYTONA_SECRET` stored as Vercel env vars. Container validates the shared secret on every incoming request.

### User NotebookLM Authentication (Web Context)
- **Primary attempt:** Try OAuth token passthrough — check whether `notebooklm-py 0.3.4` (or the current version at implementation time) supports authenticating via a Google OAuth access token from NextAuth. Phase 6 research found this didn't work, but researcher must re-verify at implementation time.
- **Fallback (if OAuth passthrough fails):** Daytona container launches a headless Chromium session and streams it to the user's browser via noVNC or a lightweight VNC-over-WebSocket. User sees the Google login page in an iframe/embedded view, logs in, cookies are captured server-side.
- **Onboarding UX:** Full-page onboarding step — after Google OAuth login, a dedicated `/setup` page shows the live browser stream. App detects successful cookie capture and redirects to home.
- **Credential storage:** `storage_state.json` content encrypted and stored in Neon DB per `user_id` (matches Phase 6 decision). Persistent across container restarts.

### Go-Live Configuration
- **Domain:** Vercel default domain (`ticker-research.vercel.app` or equivalent) for initial public launch. No custom domain needed at this stage.
- **Runbook format:** Ordered go-live checklist captured in this CONTEXT.md (see below). Planner turns each item into a plan task.
- **Smoke test:** Manual — after deployment, enter a ticker (e.g., AAPL), confirm the chart, run analysis, verify the report page renders and PDF download works.

#### Go-Live Checklist (for planner)
1. Neon production DB: run `prisma migrate deploy` against production DATABASE_URL
2. Google OAuth: add production redirect URIs (`https://ticker-research.vercel.app/api/auth/callback/google`) in Google Cloud Console
3. Vercel env vars: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `DEPLOYMENT_MODE=web`, `NEXT_PUBLIC_DEPLOYMENT_MODE=web`, `DAYTONA_CONTAINER_URL`, `DAYTONA_SECRET`
4. Daytona workspace: create from `devcontainer.json`, install FastAPI server + `scripts/requirements.txt`, start server on port 8080
5. Wire `DAYTONA_CONTAINER_URL` in Vercel to the live Daytona workspace endpoint
6. Deploy to Vercel (push to main or manual deploy)
7. Manual smoke test: full ticker → analysis → report flow

### Multi-User Concurrency
- **Concurrent execution:** FastAPI server handles each request in a separate async task/thread. Since each user has their own NbLM cookies (separate Playwright sessions), runs don't interfere. No queue needed — ship concurrent, add a queue only if contention issues appear in production.
- **Analysis failure handling:** Show specific, human-readable error messages per failure type (e.g., "NotebookLM session expired — please reconnect your account" vs. "Analysis server unreachable — try again in a moment"). Each error state includes a retry button or a re-auth prompt as appropriate.
- **Cookie re-authentication:** An "Account" or "Settings" page includes a "Reconnect NotebookLM" button. Clicking it triggers the same onboarding flow (OAuth passthrough or VNC stream) used during initial setup. Consistent UX — user never needs to navigate differently.

### Claude's Discretion
- Exact FastAPI server implementation details (routing, error response format, streaming mechanism)
- noVNC vs. alternative WebSocket VNC library if OAuth passthrough fails
- Encryption algorithm for NbLM cookie storage in Neon (AES-256-GCM or similar)
- Exact Neon schema additions for credential storage (separate `credentials` table vs. column on existing users table)
- Settings page design and placement within the app navigation

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing deployment architecture
- `src/app/api/analysis/[ticker]/route.ts` — Cloud proxy branch (`DEPLOYMENT_MODE=cloud`) already exists; Phase 8 extends this to call the Daytona FastAPI server
- `.devcontainer/devcontainer.json` — Container image and dependency spec; Daytona workspace is created from this
- `vercel.json` — Build command, maxDuration settings; may need DAYTONA_CONTAINER_URL wired in

### Auth & database (Phase 6 implementation)
- `src/app/api/auth/` — NextAuth route handler; Google OAuth already wired
- `src/lib/db.ts` — Prisma client singleton; credentials table additions go here
- `prisma/schema.prisma` — Current schema; needs credentials table for encrypted NbLM storage
- `.planning/phases/06-full-web-deployment-vercel-database-auth-report-account-persistence/06-CONTEXT.md` — Dual-login architecture decisions, Option C rationale, credential storage decision

### Python analysis script
- `scripts/notebooklm_research.py` — Existing script; FastAPI server wraps this unchanged
- `scripts/requirements.txt` — Python deps; FastAPI/Flask must be added here

### Phase 4 deployment patterns
- `.planning/phases/04-deployment/` — DEPLOYMENT_MODE pattern origin, maxDuration decisions, Daytona container design

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/api/analysis/[ticker]/route.ts`: DEPLOYMENT_MODE=cloud branch already proxies to an external URL. Phase 8 just needs to point `DAYTONA_CONTAINER_URL` at the live Daytona FastAPI server and pass NbLM cookies from Neon.
- `scripts/notebooklm_research.py`: Runs as-is inside the container. FastAPI server is a thin wrapper that receives request body, writes temp file, spawns the script, and streams stdout.
- `src/app/setup/` (SetupWizard): Existing multi-step setup UX. Web-mode onboarding page is a new route (`/setup`) but can share styling/step patterns.
- `src/lib/db.ts` + Prisma: Add a `credentials` table (or `notebooklm_token` column on a users table) for encrypted cookie storage.

### Established Patterns
- `DEPLOYMENT_MODE` env var gates local vs. cloud behavior — Phase 8 sets `DEPLOYMENT_MODE=web` in Vercel.
- `export const dynamic = 'force-dynamic'` on routes that read env vars at request time — already applied to analysis route.
- Terminal aesthetic (zinc-950, amber-400, IBM Plex Mono) — onboarding and settings pages must match.
- Streaming via SSE: analysis route already streams PROGRESS/RESULT lines — container FastAPI server mirrors this output format.

### Integration Points
- **New:** `scripts/container_server.py` — FastAPI server; receives POST /analyze, spawns `notebooklm_research.py`, streams stdout as SSE
- **Extend:** `src/app/api/analysis/[ticker]/route.ts` — In web mode, read user's NbLM cookies from Neon, include in POST to Daytona container
- **New:** `src/app/setup/page.tsx` — Web-mode onboarding: OAuth passthrough attempt → VNC stream fallback → success redirect
- **New:** `src/app/api/setup/nbm-auth/route.ts` — Server route that triggers Daytona container to start VNC session and returns stream URL
- **Extend:** `prisma/schema.prisma` — Add credentials storage for NbLM cookies per user
- **New:** `src/app/account/page.tsx` — Settings page with "Reconnect NotebookLM" button

</code_context>

<specifics>
## Specific Ideas

- The OAuth passthrough check is the first thing researcher should verify — if `notebooklm-py` now supports it, the entire VNC stream fallback is unnecessary and Phase 8 becomes much simpler.
- The FastAPI container server should mirror the existing stdout format (`PROGRESS: ...` / `RESULT: ...`) so the existing SSE parsing in the Next.js analysis route works unchanged.
- Error messages should be specific enough to be self-serviceable: "NotebookLM session expired" should always include a direct link to the reconnect flow, not just text.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-full-public-deployment-vercel-frontend-daytona-container-for-notebooklm-py-fully-live-and-accessible-to-anyone-on-the-web*
*Context gathered: 2026-03-25*
