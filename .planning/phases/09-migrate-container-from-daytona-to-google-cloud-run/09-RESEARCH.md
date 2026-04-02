# Phase 9: Migrate Container from Daytona to Google Cloud Run - Research

**Researched:** 2026-03-28
**Domain:** Google Cloud Run, Docker multi-stage builds, Playwright/Chromium on Linux, VNC over single-port HTTP
**Confidence:** HIGH (core Cloud Run facts from official docs; single-port constraint verified and solution path confirmed)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Region:** us-central1
- **Min-instances:** 1 (VNC session state lives in memory; scale-to-zero would terminate sessions mid-login)
- **Spec:** 1 CPU / 2GB RAM
- **VNC session timeout:** 5 minutes auto-cleanup
- **VNC concurrency:** One session at a time — reject second `/vnc-start` with a clear error
- **Env var rename:** `DAYTONA_CONTAINER_URL` → `CONTAINER_URL`, `DAYTONA_SECRET` → `CONTAINER_SECRET`, `DAYTONA_VNC_URL` → `CONTAINER_VNC_URL`; header `x-daytona-secret` → `x-container-secret`
- **Three route files updated:** `src/app/api/analysis/[ticker]/route.ts`, `src/app/api/setup/nbm-auth/route.ts`, `src/app/api/setup/nbm-auth/status/route.ts`
- **Tests updated:** `src/app/api/analysis/__tests__/route.test.ts` references `DAYTONA_CONTAINER_URL` — update to `CONTAINER_URL`
- **Deploy workflow:** Manual gcloud runbook — `docker build` → `docker push` to Artifact Registry → `gcloud run deploy`
- **Image registry:** Google Artifact Registry
- **Image tagging:** Git commit SHA (e.g., `us-central1-docker.pkg.dev/PROJECT/ticker-research/container:SHA`)
- **No CI/CD for container** — manual deploy only; add GitHub Actions later if needed
- **Dockerfile rename:** `Dockerfile.daytona` → `Dockerfile`
- **Multi-stage build:** Build stage (install deps) separate from runtime stage (smaller image)
- **Startup:** `entrypoint.sh` shell script — starts Xvfb, waits for display, then `exec`s FastAPI server
- **Health check:** `GET /health` returns 200 — FastAPI already has this route; container uses it as startup probe
- **Port:** Cloud Run injects `$PORT` (always 8080); FastAPI binds to `0.0.0.0:$PORT`

### Claude's Discretion

- Exact multi-stage Dockerfile structure (build vs. runtime stages, what gets copied)
- Xvfb display number and startup wait mechanism in entrypoint.sh
- Artifact Registry repository naming and path format
- Cloud Run service account permissions (minimal — no GCP services needed beyond running the container)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

## Summary

Phase 9 migrates the existing container from Daytona (AWS infrastructure) to Google Cloud Run (Google infrastructure) so `notebooklm.google.com` is reachable. The container carries the same FastAPI server, VNC session management, and `notebooklm-py` pipeline as Phase 8 — this is infrastructure migration, not feature development.

The most important research finding is a **single-port constraint on Cloud Run**: Cloud Run exposes exactly one port (8080) to the outside world. The existing architecture uses a separate port 6080 for the websockify WebSocket that the browser's `react-vnc` `VncScreen` component connects to. On Cloud Run, port 6080 is unreachable from the browser. The solution is to route VNC WebSocket traffic through the main FastAPI application on port 8080, either by having FastAPI proxy the WebSocket or by running websockify on a path prefix that Cloud Run routes through the single ingress port.

The practical resolution: the `CONTAINER_VNC_URL` env var (previously pointing directly at `https://container-host:6080`) must instead point to a WebSocket path on the same Cloud Run service URL (e.g., `wss://SERVICE.run.app/vnc-ws`). The FastAPI container server needs a WebSocket proxy route at `/vnc-ws` that bridges to the internal x11vnc on port 5900, replacing the separate websockify-on-6080 pattern.

All other aspects of the migration are mechanical: rename `Dockerfile.daytona` to `Dockerfile`, convert to multi-stage build, add `entrypoint.sh` for Xvfb startup, update three route files and one test file for env var renames, write a gcloud deploy runbook.

**Primary recommendation:** Route VNC WebSocket through FastAPI at `/vnc-ws` (WebSocket endpoint using websockets library or direct TCP bridge), eliminating the dependency on the separate port 6080 that worked in Daytona but is inaccessible in Cloud Run.

---

## Standard Stack

### Core
| Library / Tool | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| Google Cloud Run | N/A | Container hosting | Google infrastructure — can reach notebooklm.google.com |
| Google Artifact Registry | N/A | Container image registry | GCP-native, same project auth, no cross-registry token dance |
| gcloud CLI | latest | Build/push/deploy | Official GCP deployment toolchain |
| python:3.12-slim | debian/bookworm | Base image (runtime stage) | Same as existing Dockerfile.daytona; glibc required for Playwright |
| Xvfb | system package | Virtual display for headed Chromium | Required for non-headless browser in VNC flow |
| x11vnc | system package | Expose virtual display as VNC stream | Same as Phase 8 |
| websockify | 0.12.x (pip) | Already in requirements.txt | Bridges VNC TCP to WebSocket — but on internal port only in Cloud Run |

### Supporting
| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| FastAPI websockets | included in FastAPI | WebSocket endpoint for `/vnc-ws` proxy | Required: Cloud Run single-port constraint means websockify-on-6080 won't work externally |
| websockets (Python) | 12.x | Async WebSocket TCP bridge | Used inside FastAPI WebSocket handler to relay bytes between client and x11vnc:5900 |

**Installation (no new dependencies for Vercel side — container only):**
```bash
# No new pip deps needed beyond requirements.txt — websockets is a transitive dep of websockify
# Verify:
pip show websockets
```

---

## Architecture Patterns

### Cloud Run Single-Port Constraint — Critical

**What:** Cloud Run exposes exactly one port per service. The `$PORT` env var (default 8080) is the only externally reachable port. Internal ports (5900, 6080) are reachable within the container but not from the public internet.

**Impact on VNC:** The current architecture runs websockify on port 6080 and returns that URL as `streamUrl` to the frontend `VncScreen`. On Cloud Run, the browser cannot reach port 6080 — it is only accessible inside the container process.

**Resolution:** Add a WebSocket proxy endpoint to the FastAPI server at `/vnc-ws`. The FastAPI handler accepts the incoming WebSocket connection from `react-vnc` and relays bytes bidirectionally to the internal x11vnc TCP socket on `localhost:5900`. This replaces the external websockify-on-6080 pattern entirely.

```
Browser (react-vnc) → wss://SERVICE.run.app/vnc-ws (port 443, Cloud Run ingress)
    → FastAPI /vnc-ws handler → localhost:5900 (x11vnc inside container)
```

The `CONTAINER_VNC_URL` env var changes from `https://container-host:6080` (Daytona) to `wss://SERVICE.run.app/vnc-ws` (Cloud Run). Since Cloud Run terminates TLS at ingress, the internal path uses `ws://`, but the `VncScreen` `url` prop uses `wss://` for the public-facing URL.

### Recommended Project Structure (container side)

```
Dockerfile                # renamed from Dockerfile.daytona; multi-stage
entrypoint.sh             # Xvfb startup + exec uvicorn
scripts/
├── container_server.py   # FastAPI; add /vnc-ws WS proxy; rename DAYTONA_* → CONTAINER_*
├── notebooklm_research.py
└── requirements.txt
```

### Pattern 1: Multi-Stage Dockerfile

**What:** Separate dependency installation (heavy, rare changes) from runtime image (fast rebuilds for script changes).

**When to use:** Always for images with large binary deps like Playwright/Chromium.

```dockerfile
# Source: official Docker multi-stage documentation + Phase 8 decisions

# ---- Stage 1: dependency builder ----
FROM python:3.12-slim AS builder
WORKDIR /app
COPY scripts/requirements.txt ./
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt \
    && playwright install --with-deps chromium

# ---- Stage 2: runtime ----
FROM python:3.12-slim AS runtime
# Install system deps: Xvfb, x11vnc, Node.js 18 (already in container_server.py)
RUN apt-get update && apt-get install -y \
    curl gnupg ca-certificates \
    xvfb x11vnc \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy installed Python packages and Playwright browser from builder
COPY --from=builder /install /usr/local
COPY --from=builder /root/.cache/ms-playwright /root/.cache/ms-playwright

WORKDIR /app
COPY scripts/ ./scripts/
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Cloud Run injects PORT; default 8080
EXPOSE 8080

ENTRYPOINT ["./entrypoint.sh"]
```

**Note:** Multi-stage isolation for Playwright browser cache path. The Playwright browser is installed during build under `/root/.cache/ms-playwright` — this path must be copied to the runtime stage. Verify the exact path with `playwright install chromium && python3 -c "from playwright.sync_api import sync_playwright; print(sync_playwright().start().chromium.executable_path)"`.

### Pattern 2: entrypoint.sh — Xvfb Startup

**What:** Shell script that starts Xvfb on a virtual display, waits until the display is ready, then exec's uvicorn. Using `exec` is critical so uvicorn receives OS signals directly (not trapped by bash).

```bash
#!/bin/bash
set -e

# Start Xvfb on display :99
Xvfb :99 -screen 0 1280x960x24 &
XVFB_PID=$!

# Wait for display to be ready (poll for /tmp/.X99-lock)
for i in $(seq 1 20); do
  if [ -f /tmp/.X99-lock ]; then
    break
  fi
  sleep 0.5
done

export DISPLAY=:99
export PORT="${PORT:-8080}"

# exec replaces bash — uvicorn receives SIGTERM directly
exec python3 scripts/container_server.py
```

**Xvfb display choice:** `:99` avoids collision with `:0` (might be set in base image). The container_server.py `vnc-start` handler must use `Display(visible=False, size=(1280, 960), backend="xvfb")` from pyvirtualdisplay — pyvirtualdisplay allocates its own display number dynamically (not necessarily :99). The entrypoint Xvfb is used only to pre-warm the display subsystem; pyvirtualdisplay will start a fresh virtual display per VNC session.

**Alternative:** Skip the pre-warm Xvfb in entrypoint and rely entirely on pyvirtualdisplay in the `/vnc-start` handler. This is simpler but means the display subsystem only starts on first VNC request.

### Pattern 3: FastAPI WebSocket Proxy for VNC

**What:** FastAPI WebSocket endpoint that proxies bytes between the browser and the internal x11vnc TCP socket. This replaces the external websockify-on-6080 approach.

```python
# Source: FastAPI WebSocket docs + websockets library docs
import asyncio
import websockets
from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/vnc-ws")
async def vnc_ws_proxy(websocket: WebSocket):
    """Proxy WebSocket frames between react-vnc browser client and x11vnc on localhost:5900."""
    _check_secret(websocket.headers.get("x-container-secret"))
    # Only allow if VNC session is active
    if not _vnc_session.active:
        await websocket.close(code=1008)
        return

    await websocket.accept()
    try:
        reader, writer = await asyncio.open_connection("localhost", 5900)
        async def browser_to_vnc():
            try:
                while True:
                    data = await websocket.receive_bytes()
                    writer.write(data)
                    await writer.drain()
            except (WebSocketDisconnect, Exception):
                pass

        async def vnc_to_browser():
            try:
                while True:
                    data = await reader.read(4096)
                    if not data:
                        break
                    await websocket.send_bytes(data)
            except Exception:
                pass

        await asyncio.gather(browser_to_vnc(), vnc_to_browser())
    finally:
        try:
            writer.close()
        except Exception:
            pass
        try:
            await websocket.close()
        except Exception:
            pass
```

**Important caveat:** VNC uses a binary protocol. Standard websockify handles the `base64` or `binary` WebSocket subprotocol negotiation that noVNC/react-vnc expects. The raw TCP proxy above may not correctly handle the WebSocket subprotocol (`binary` or `base64`) that `react-vnc` uses. **Investigate whether react-vnc requires a specific WebSocket subprotocol header** — if it does, the FastAPI WS handler must accept and pass through the subprotocol. Use `await websocket.accept(subprotocol="binary")` if react-vnc sends `Sec-WebSocket-Protocol: binary`.

**Simpler alternative:** Keep websockify running internally on port 6080, then proxy it through FastAPI using an HTTP reverse proxy pattern on the `/vnc-ws` path. FastAPI's WebSocket handler connects as a WebSocket CLIENT to `ws://localhost:6080` and relays frames. This preserves websockify's protocol negotiation logic.

### Pattern 4: Env Var + Header Renames

**What:** Mechanical search-and-replace across three route files and one test file.

| File | Change |
|------|--------|
| `src/app/api/analysis/[ticker]/route.ts` | `DAYTONA_CONTAINER_URL` → `CONTAINER_URL`; `DAYTONA_SECRET` → `CONTAINER_SECRET`; header `x-daytona-secret` → `x-container-secret` |
| `src/app/api/setup/nbm-auth/route.ts` | Same renames; `DAYTONA_VNC_URL` → `CONTAINER_VNC_URL` |
| `src/app/api/setup/nbm-auth/status/route.ts` | `DAYTONA_CONTAINER_URL` → `CONTAINER_URL`; `DAYTONA_SECRET` → `CONTAINER_SECRET`; header `x-daytona-secret` → `x-container-secret` |
| `scripts/container_server.py` | `DAYTONA_SECRET` → `CONTAINER_SECRET`; `x-daytona-secret` → `x-container-secret` in `_check_secret()` |
| `src/app/api/analysis/__tests__/route.test.ts` | `DAYTONA_CONTAINER_URL` → `CONTAINER_URL`; `DEPLOYMENT_MODE=cloud` may also need updating if `web` mode is now the correct test path |

**Note on DEPLOYMENT_MODE:** The current route.ts uses `DEPLOYMENT_MODE === 'web'` for the cloud branch, not `cloud`. The test file sets `DEPLOYMENT_MODE = 'cloud'` — this test was written before the mode was renamed to `web`. Verify whether the test is currently passing by running `npm test` before making changes.

### Pattern 5: gcloud Deploy Runbook

**What:** Step-by-step commands for building, pushing, and deploying the container to Cloud Run.

```bash
# 0. Prerequisites (verified 2026-03-28: gcloud authenticated, project already set)
# Account: walshtj46@gmail.com | Project: cipher-491101 | No auth login needed
gcloud config set project cipher-491101
gcloud config set run/region us-central1

# 1. Enable APIs (one-time)
gcloud services enable run.googleapis.com artifactregistry.googleapis.com

# 2. Create Artifact Registry repository (one-time)
gcloud artifacts repositories create ticker-research \
  --repository-format=docker \
  --location=us-central1 \
  --description="Ticker research container images"

# 3. Configure Docker auth for Artifact Registry (one-time per machine)
gcloud auth configure-docker us-central1-docker.pkg.dev

# 4. Build and push (repeat for each deploy)
GIT_SHA=$(git rev-parse --short HEAD)
IMAGE="us-central1-docker.pkg.dev/cipher-491101/ticker-research/container:${GIT_SHA}"
docker build -t "${IMAGE}" .
docker push "${IMAGE}"

# 5. Deploy (first deploy — creates service)
gcloud run deploy ticker-research-container \
  --image="${IMAGE}" \
  --region=us-central1 \
  --min-instances=1 \
  --memory=2Gi \
  --cpu=1 \
  --timeout=3600 \
  --allow-unauthenticated \
  --set-env-vars="CONTAINER_SECRET=YOUR_SECRET,ALLOWED_ORIGIN=https://ticker-research.vercel.app" \
  --port=8080

# 6. Rollback (re-deploy with prior SHA)
PRIOR_SHA=abc1234
gcloud run deploy ticker-research-container \
  --image="us-central1-docker.pkg.dev/cipher-491101/ticker-research/container:${PRIOR_SHA}" \
  --region=us-central1
```

**`--timeout=3600`:** Research runs take 5–15 minutes. VNC sessions can last up to 5 minutes. Set timeout to 60 minutes (Cloud Run maximum) to avoid 504 errors on long runs.

**`--allow-unauthenticated`:** Container is protected by `CONTAINER_SECRET` shared-secret header validation, not Cloud Run IAM. Setting `--allow-unauthenticated` is required so the Vercel function can call it without GCP service account credentials.

### Anti-Patterns to Avoid

- **Hardcoded port 8080 in uvicorn:** FastAPI must bind to `$PORT`. Cloud Run injects `$PORT=8080` but this may change. Use `os.environ.get("PORT", "8080")` in `container_server.py` when running uvicorn.
- **Exposing 6080 in gcloud deploy:** Cloud Run `--port` flag only registers one port with the load balancer. Multiple `--port` flags are not supported. Do not attempt to map port 6080 externally.
- **Using `CMD` instead of `ENTRYPOINT` + `exec`:** If Xvfb is backgrounded in a CMD shell, the shell becomes PID 1 and uvicorn won't receive SIGTERM correctly. Use `ENTRYPOINT ["./entrypoint.sh"]` and `exec` at the end of the script.
- **Listening on 127.0.0.1:** Cloud Run health checks and traffic arrive on `0.0.0.0`. The FastAPI server must bind to `0.0.0.0`, not localhost.
- **Using `if __name__ == "__main__"` for port binding without reading $PORT:** The existing `container_server.py` hardcodes port 8080 in the `__main__` block. This must read `os.environ.get("PORT", "8080")`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Container registry | Custom S3 or Docker Hub setup | Google Artifact Registry | Same GCP project, no cross-registry auth, integrated with Cloud Run |
| VNC protocol bytes framing | Custom binary parser | Let websockify or raw TCP relay handle it | VNC protocol negotiation is non-trivial; raw byte relay works for simple proxy |
| WebSocket subprotocol negotiation | Custom protocol parser | Use `websocket.accept(subprotocol=...)` + relay | react-vnc handles protocol details; server just needs to accept the right subprotocol |
| Health check endpoint | Complex readiness logic | `GET /health` returning `{"status": "ok"}` — already in container_server.py | Cloud Run only needs HTTP 200; complex readiness adds failure modes |
| Secrets management | Custom env var encryption | Cloud Run `--set-env-vars` + Vercel env vars | CONTAINER_SECRET does not need GCP Secret Manager for this workload scale |

---

## Common Pitfalls

### Pitfall 1: VNC WebSocket Blocked by Cloud Run Single-Port Constraint
**What goes wrong:** `CONTAINER_VNC_URL` is set to a URL on port 6080 (the websockify address). The browser's `VncScreen` component connects and immediately fails — Cloud Run only routes traffic to port 8080. The setup page shows a blank VNC panel or a connection refused error.
**Why it happens:** Daytona exposed port 6080 directly. Cloud Run's ingress is a managed load balancer that routes only to the single configured port.
**How to avoid:** The `CONTAINER_VNC_URL` / `streamUrl` returned from `/api/setup/nbm-auth` must be a `wss://SERVICE.run.app/vnc-ws` URL (path on port 443), not a port 6080 URL. This requires the FastAPI WebSocket proxy route.
**Warning signs:** VNC panel in setup page shows no video / connection error. `/vnc-start` returns 200 but browser WebSocket to `:6080` fails immediately.

### Pitfall 2: Cold Start Despite min-instances=1
**What goes wrong:** Cloud Run occasionally recycles the single warm instance during zero-traffic periods, causing VNC state loss and a cold start.
**Why it happens:** `min-instances=1` keeps an instance allocated but Cloud Run may still restart instances for maintenance. The VNC session (`_vnc_session` global) is in-memory only.
**How to avoid:** The 5-minute VNC session timeout and "reject second `/vnc-start`" concurrency control already handle this correctly. If a user's VNC session is lost mid-login, they start over. Document this in the setup page UX.
**Warning signs:** User reports setup page VNC panel goes blank during login; `GET /health` starts returning 200 again after a brief gap.

### Pitfall 3: Playwright Browser Not Found After Multi-Stage Build
**What goes wrong:** Container starts, `/health` returns 200, but `/vnc-start` fails with `Chromium launch failed: Executable not found`.
**Why it happens:** The Playwright browser binary is installed in the build stage under `/root/.cache/ms-playwright`. The multi-stage build must explicitly `COPY --from=builder /root/.cache/ms-playwright /root/.cache/ms-playwright` to the runtime stage.
**How to avoid:** Verify the Playwright cache path in the build stage before copying: `python3 -c "from playwright.sync_api import sync_playwright; p = sync_playwright().start(); print(p.chromium.executable_path); p.stop()"`. Also verify with `PLAYWRIGHT_BROWSERS_PATH` env var if path differs.
**Warning signs:** Health check passes but `/vnc-start` returns 503 `Chromium launch failed`.

### Pitfall 4: Xvfb Display Not Ready When pyvirtualdisplay Starts
**What goes wrong:** `/vnc-start` fails or Chromium crashes immediately after launch.
**Why it happens:** If the display subsystem isn't initialized before pyvirtualdisplay tries to allocate a display, the Xvfb startup in entrypoint.sh and pyvirtualdisplay both race to create `:99`. pyvirtualdisplay finds a display conflict.
**How to avoid:** pyvirtualdisplay allocates its own display number dynamically — it does not use `:99` unless told to. The entrypoint.sh Xvfb on `:99` is independent. They should not conflict as long as pyvirtualdisplay does not specify `display=99`.
**Warning signs:** `DISPLAY` env var conflict in logs; pyvirtualdisplay raises "could not open display" on startup.

### Pitfall 5: Request Timeout Killing Long Research Runs
**What goes wrong:** Ticker research takes 8–12 minutes. Cloud Run returns HTTP 504 before the analysis completes.
**Why it happens:** Cloud Run default timeout is 5 minutes (300 seconds). If not overridden, long research runs are killed.
**How to avoid:** Set `--timeout=3600` (60 minutes, Cloud Run maximum) on the `gcloud run deploy` command. The analysis route on Vercel has `maxDuration=300` — this controls the Vercel proxy timeout, not the container. If the Vercel route times out, the SSE stream is cut. For research runs over 5 minutes, the Vercel `maxDuration=300` may be the actual binding constraint.
**Warning signs:** SSE stream stops mid-analysis with no RESULT or ERROR line; Cloud Run logs show request cancelled after 300s.

### Pitfall 6: CORS Origin Mismatch After URL Change
**What goes wrong:** Container server rejects requests from Vercel frontend with CORS error.
**Why it happens:** `ALLOWED_ORIGIN` env var on the container is still set to `https://ticker-research.vercel.app` from Daytona. Cloud Run deployment requires re-setting this env var.
**How to avoid:** Include `ALLOWED_ORIGIN=https://ticker-research.vercel.app` in the `gcloud run deploy --set-env-vars` command.
**Warning signs:** Browser console shows CORS errors on calls to `/vnc-start`, `/analyze/{ticker}`.

---

## Code Examples

Verified patterns from existing codebase and official sources:

### FastAPI $PORT Binding (container_server.py main block)
```python
# Source: Cloud Run container contract docs — must bind to 0.0.0.0:$PORT
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run(app, host="0.0.0.0", port=port)
```

### Secret Header Rename (container_server.py)
```python
# Change from:
SECRET = os.environ.get("DAYTONA_SECRET", "")

def _check_secret(x_daytona_secret: str | None) -> None:
    if x_daytona_secret != SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

# To:
SECRET = os.environ.get("CONTAINER_SECRET", "")

def _check_secret(x_container_secret: str | None) -> None:
    if not SECRET:
        raise HTTPException(status_code=500, detail="CONTAINER_SECRET not configured")
    if x_container_secret != SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")
```

### Vercel Route Env Var Rename (analysis/route.ts snippet)
```typescript
// Change from:
const containerUrl = process.env.DAYTONA_CONTAINER_URL;
// ...
'x-daytona-secret': process.env.DAYTONA_SECRET!,

// To:
const containerUrl = process.env.CONTAINER_URL;
// ...
'x-container-secret': process.env.CONTAINER_SECRET!,
```

### Cloud Run gcloud deploy (full flags)
```bash
# Source: Cloud Run docs — verified flags
gcloud run deploy ticker-research-container \
  --image="us-central1-docker.pkg.dev/cipher-491101/ticker-research/container:${GIT_SHA}" \
  --region=us-central1 \
  --min-instances=1 \
  --memory=2Gi \
  --cpu=1 \
  --timeout=3600 \
  --allow-unauthenticated \
  --port=8080 \
  --set-env-vars="CONTAINER_SECRET=...,ALLOWED_ORIGIN=https://ticker-research.vercel.app"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Daytona workspace (AWS IPs) | Google Cloud Run (Google IPs) | Phase 9 | notebooklm.google.com becomes reachable |
| Separate websockify on port 6080 | FastAPI WebSocket proxy at `/vnc-ws` on port 8080 | Phase 9 | Required by Cloud Run single-port constraint |
| `DAYTONA_VNC_URL` → direct port 6080 URL | `CONTAINER_VNC_URL` → `wss://SERVICE.run.app/vnc-ws` | Phase 9 | VNC stream works through Cloud Run HTTPS ingress |
| `DAYTONA_*` env vars and `x-daytona-secret` header | `CONTAINER_*` env vars and `x-container-secret` header | Phase 9 | Clean naming, no Daytona references |
| Single-stage Dockerfile | Multi-stage Dockerfile | Phase 9 | Smaller image, faster rebuilds when only scripts change |

**No longer needed:**
- websockify running on port 6080 as an externally-exposed service (websockify may still be useful internally if the FastAPI WS proxy connects to websockify on localhost:6080 rather than directly to x11vnc:5900)

---

## Open Questions

1. **react-vnc WebSocket subprotocol requirement**
   - What we know: VNC-over-WebSocket requires a specific WebSocket subprotocol (`binary` or `base64`). websockify handles this. A raw asyncio TCP relay may or may not correctly negotiate the subprotocol.
   - What's unclear: Does `react-vnc` / `noVNC` require the server to acknowledge a specific `Sec-WebSocket-Protocol` header? If yes, the FastAPI WebSocket handler must `await websocket.accept(subprotocol="binary")`.
   - Recommendation: Test with a simple relay first. If VNC screen shows corruption or the connection handshake fails, add websockify as an internal proxy (FastAPI WS → websockify on localhost:6080 → x11vnc on localhost:5900) to preserve protocol negotiation.

2. **Vercel maxDuration vs. Cloud Run timeout for long analysis runs**
   - What we know: Cloud Run timeout can be set to 3600s. Vercel Hobby maxDuration cap is 300s. The analysis route has `maxDuration=300`.
   - What's unclear: If a research run takes 10 minutes, the Vercel SSE proxy will time out before the analysis completes. This was a pre-existing issue with the Daytona architecture.
   - Recommendation: Document this constraint in the runbook. Phase 9 does not need to solve it. The SSE stream from Cloud Run can be extended; the Vercel proxy is the binding constraint.

3. **Multi-stage Playwright browser cache path**
   - What we know: `playwright install chromium` places binaries under `~/.cache/ms-playwright` by default on Linux.
   - What's unclear: When pip install is done with `--prefix=/install`, does Playwright's install CLI still write to `/root/.cache/ms-playwright` or to a path relative to the prefix?
   - Recommendation: Run `playwright install chromium` as a separate RUN step without the `--prefix` flag, directly in the builder stage as root. This places the binary at `/root/.cache/ms-playwright` reliably.

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit), Playwright (e2e) |
| Config file | `vitest.config.ts` (unit), `playwright.config.ts` (e2e) |
| Quick run command | `npm test` |
| Full suite command | `npm test && npx playwright test` |

### Phase Requirements → Test Map

This phase is pure infrastructure migration (no new routes, no new user-facing behavior). The test surface is narrow:

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| Env var rename: CONTAINER_URL used (not DAYTONA_CONTAINER_URL) in analysis route | unit | `npm test -- src/app/api/analysis/__tests__/route.test.ts` | Yes — needs update |
| container-server auth stub test references correct header name | unit | `npm test -- tests/unit/container-server-auth.test.ts` | Yes — stub only |
| Smoke test: `GET /health` returns 200 from deployed Cloud Run service | manual | N/A — requires live container | N/A |
| Smoke test: full ticker → VNC login → analysis → report end-to-end | manual | N/A — requires live container + Google login | N/A |

### Sampling Rate
- **Per task commit:** `npm test` (unit tests only — ~10s)
- **Per wave merge:** `npm test` — full unit suite
- **Phase gate:** `npm test` green + manual smoke test on deployed Cloud Run service before `/gsd:verify-work`

### Wave 0 Gaps

- No new test files needed — this phase updates existing tests, not creates new ones
- `tests/unit/container-server-auth.test.ts` has `it.todo` stubs referencing `x-daytona-secret` — update to `x-container-secret` when expanding the stubs

---

## Sources

### Primary (HIGH confidence)
- Cloud Run container contract docs (`https://docs.cloud.google.com/run/docs/container-contract`) — PORT injection, single port constraint, 0.0.0.0 binding requirement
- Cloud Run request timeout docs (`https://docs.cloud.google.com/run/docs/configuring/request-timeout`) — 60 minute maximum, SSE streaming behavior
- Cloud Run WebSockets docs (`https://docs.cloud.google.com/run/docs/triggering/websockets`) — WebSocket support confirmed, timeout constraints
- Cloud Run browser automation docs (`https://docs.cloud.google.com/run/docs/browser-automation`) — Playwright/Chromium support confirmed on Cloud Run
- Cloud Run min-instances docs (`https://docs.cloud.google.com/run/docs/configuring/min-instances`) — billing implications, gcloud flag syntax
- Artifact Registry authentication docs (`https://docs.cloud.google.com/artifact-registry/docs/docker/authentication`) — `gcloud auth configure-docker` pattern
- Existing codebase: `scripts/container_server.py`, `Dockerfile.daytona`, `scripts/requirements.txt`, all three Vercel route files, test file

### Secondary (MEDIUM confidence)
- Cloud Run pricing estimates (~$75/month for 1 CPU / 2GB always-on) — verified against Cloud Run pricing page formula; actual cost depends on GCP free tier and committed use discounts
- `gcloud run deploy` flag syntax (`--min-instances`, `--memory=2Gi`, `--cpu=1`, `--timeout`) — verified from multiple Cloud Run deployment guides and official docs

### Tertiary (LOW confidence)
- FastAPI WebSocket proxy pattern for VNC relay — pattern is standard async Python; VNC subprotocol negotiation behavior with react-vnc is unverified without live testing
- Multi-stage Dockerfile Playwright cache path behavior with `--prefix` install — needs verification during implementation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Cloud Run, Artifact Registry, gcloud CLI all official GCP tooling; no alternatives needed
- Architecture: HIGH for env var renames, gcloud runbook, multi-stage Dockerfile; MEDIUM for FastAPI WS proxy (pattern is sound but subprotocol details need implementation testing)
- Pitfalls: HIGH for port constraint and timeout pitfalls (from official docs); MEDIUM for Playwright cache path (common pattern, unverified for `--prefix` install variant)

**Research date:** 2026-03-28
**Valid until:** 2026-05-28 (Cloud Run APIs are stable; min-instances billing model unlikely to change)
