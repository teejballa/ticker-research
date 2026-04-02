# Phase 9: Migrate Container from Daytona to Google Cloud Run - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Swap the container host from Daytona to Google Cloud Run — same FastAPI server, same Dockerfile (adapted), same SSE protocol. The motivation is that Daytona/AWS IPs are blocked by Google's NotebookLM service; GCR runs on Google infrastructure and can reach `notebooklm.google.com`.

All application logic (VNC flow, auth crypto, Vercel analysis route, account page) was built in Phase 8 and carries forward unchanged. This phase is infrastructure migration and hardening only — no new features.

</domain>

<decisions>
## Implementation Decisions

### Cloud Run Instance Configuration
- **Region:** us-central1 — Google's primary datacenter, lowest latency to notebooklm.google.com
- **Min-instances:** 1 — VNC session state lives in memory; scale-to-zero would terminate sessions mid-login. One warm instance at minimum cost (~$20/month at 1CPU/2GB). Can revisit after launch.
- **Spec:** 1 CPU / 2GB RAM — minimum viable for Playwright + Chromium. Scale up if needed.
- **VNC session timeout:** 5 minutes — container auto-cleans abandoned sessions
- **VNC concurrency:** One session at a time. Reject a second `/vnc-start` request with a clear error while a session is active. Users retry in ~2 minutes. Simple, avoids Xvfb display contention.

### Environment Variable Rename
- `DAYTONA_CONTAINER_URL` → `CONTAINER_URL`
- `DAYTONA_SECRET` → `CONTAINER_SECRET`
- `DAYTONA_VNC_URL` → `CONTAINER_VNC_URL`
- HTTP header `x-daytona-secret` → `x-container-secret` (updated in both Vercel routes and container server)
- **All three routes** updated: `src/app/api/analysis/[ticker]/route.ts`, `src/app/api/setup/nbm-auth/route.ts`, `src/app/api/setup/nbm-auth/status/route.ts`
- **Tests** updated to use new env var names — tests that set `DAYTONA_CONTAINER_URL` won't exercise real code paths after the rename

### Deployment Workflow
- **Process:** Manual gcloud runbook — `docker build` → `docker push` to Artifact Registry → `gcloud run deploy`
- **Image registry:** Google Artifact Registry (GCP-native, same project as Cloud Run, no cross-registry auth)
- **Image tagging:** Tag by git commit SHA (e.g., `gcr.io/project/ticker-research-container:abc1234`). Rollback = re-run `gcloud run deploy` with the prior SHA tag (~60 seconds)
- **No CI/CD for container:** Manual deploy is right while the container changes rarely. Add GitHub Actions later if needed.

### Container Image (Dockerfile)
- **Rename:** `Dockerfile.daytona` → `Dockerfile` (Daytona is gone; single Dockerfile at repo root)
- **Multi-stage build:** Separate build stage (install deps, compile assets) from runtime stage. Reduces final image size — Playwright + Chromium make this image large (~2GB unoptimized). Smaller image = faster pulls on any cold start.
- **Startup:** `entrypoint.sh` shell script — starts Xvfb in background, waits for display to be ready, then `exec`s the FastAPI server. Standard pattern, easy to debug.
- **Health check:** `GET /health` returns 200. FastAPI route added to `container_server.py`. Cloud Run uses this as the startup probe before routing traffic.
- **Port:** Cloud Run injects `$PORT` (always 8080). FastAPI must bind to `0.0.0.0:$PORT`, not hardcoded 8080.
- **VNC ports:** Port 6080 (websockify/noVNC) exposed internally — Cloud Run doesn't expose it publicly but the frontend accesses it via the container URL.

### Go-Live Checklist (for planner)
1. Create GCP project (or reuse existing) + enable Cloud Run API, Artifact Registry API
2. Create service account for Cloud Run with minimal permissions
3. Build multi-stage Docker image locally, tag with git SHA
4. Push to Artifact Registry (`us-central1-docker.pkg.dev/PROJECT/ticker-research/container:SHA`)
5. Deploy: `gcloud run deploy ticker-research-container --image ... --region us-central1 --min-instances 1 --memory 2Gi --cpu 1 --allow-unauthenticated`
6. Set `CONTAINER_SECRET` env var on the Cloud Run service
7. Update Vercel env vars: `CONTAINER_URL` (Cloud Run service URL), `CONTAINER_SECRET`, `CONTAINER_VNC_URL`
8. Update Google OAuth redirect URIs if domain changed
9. Smoke test: full ticker → VNC login → analysis → report

### Claude's Discretion
- Exact multi-stage Dockerfile structure (build vs. runtime stages, what gets copied)
- Xvfb display number and startup wait mechanism in entrypoint.sh
- Artifact Registry repository naming and path format
- Cloud Run service account permissions (minimal — no GCP services needed beyond running the container)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing container server
- `scripts/container_server.py` — FastAPI server with VNC session management; carries forward unchanged except env var / header name updates and adding `GET /health`
- `Dockerfile.daytona` — Current Dockerfile; rename to `Dockerfile` and adapt for multi-stage build + entrypoint.sh
- `scripts/requirements.txt` — Python deps; no changes needed

### Vercel routes that reference container
- `src/app/api/analysis/[ticker]/route.ts` — DAYTONA_CONTAINER_URL + DAYTONA_SECRET → CONTAINER_URL + CONTAINER_SECRET; header `x-daytona-secret` → `x-container-secret`
- `src/app/api/setup/nbm-auth/route.ts` — Same DAYTONA_* → CONTAINER_* rename
- `src/app/api/setup/nbm-auth/status/route.ts` — Same DAYTONA_* → CONTAINER_* rename

### Tests to update
- `src/app/api/analysis/__tests__/route.test.ts` — References DAYTONA_CONTAINER_URL and Daytona test URLs; update to CONTAINER_URL

### Phase 8 context (decisions that carry forward)
- `.planning/phases/08-full-public-deployment-vercel-frontend-daytona-container-for-notebooklm-py-fully-live-and-accessible-to-anyone-on-the-web/08-CONTEXT.md` — HTTP SSE protocol, AES-256-GCM credential storage, VNC session flow design, shared-secret auth pattern

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/container_server.py`: FastAPI server is production-ready. Only changes: rename `DAYTONA_SECRET` → `CONTAINER_SECRET` env var reference, rename `x-daytona-secret` → `x-container-secret` header validation, add `GET /health` route, bind to `$PORT` instead of hardcoded 8080.
- `Dockerfile.daytona`: Solid foundation. Needs: rename, multi-stage split, entrypoint.sh for Xvfb, $PORT binding.
- `src/app/api/analysis/[ticker]/route.ts`: DEPLOYMENT_MODE=cloud proxy branch is fully working. Only change: env var and header names.

### Established Patterns
- `DEPLOYMENT_MODE` env var gates local vs. cloud behavior — already `web` in Vercel production
- `export const dynamic = 'force-dynamic'` on container-calling routes — already applied
- Terminal aesthetic — no UI changes in this phase

### Integration Points
- **Rename:** `DAYTONA_*` → `CONTAINER_*` in 3 route files + tests + Vercel env config
- **Extend:** `container_server.py` — add `/health` route, fix port binding
- **Replace:** `Dockerfile.daytona` → `Dockerfile` with multi-stage build + `entrypoint.sh`
- **New:** `entrypoint.sh` — Xvfb startup script

</code_context>

<specifics>
## Specific Ideas

- The multi-stage build should separate the Playwright/Chromium install (heavy, rarely changes) from the Python scripts (light, changes more often) so rebuilds are fast for script-only changes.
- The `/health` endpoint should verify that FastAPI is up — not that Xvfb or Chromium are ready. Those start on demand per VNC session.
- The runbook should include the exact `gcloud run deploy` flags (region, memory, cpu, min-instances, allow-unauthenticated) so there's no guesswork at deploy time.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

---

<pre_execution_state>
## GCP State (verified 2026-03-28)

**gcloud CLI:** v562.0.0 at `/opt/homebrew/bin/gcloud` — already installed and authenticated
**Account:** walshtj46@gmail.com (already logged in — no `gcloud auth login` needed)
**Project:** `cipher-491101` (name: "Cipher") — already set as default project
**Default region:** set `gcloud config set run/region us-central1` before first deploy

**NOT yet done (must do before Plan 03 deploy):**
- [ ] `gcloud services enable run.googleapis.com artifactregistry.googleapis.com` — APIs not enabled
- [ ] `gcloud artifacts repositories create ticker-research ...` — repo does not exist yet
- [ ] `gcloud auth configure-docker us-central1-docker.pkg.dev` — Docker auth not configured

**Exact image path to use:**
```
us-central1-docker.pkg.dev/cipher-491101/ticker-research/container:GIT_SHA
```

**No `YOUR_PROJECT_ID` placeholder needed — use `cipher-491101` throughout.**
</pre_execution_state>

---

*Phase: 09-migrate-container-from-daytona-to-google-cloud-run*
*Context gathered: 2026-03-28*
