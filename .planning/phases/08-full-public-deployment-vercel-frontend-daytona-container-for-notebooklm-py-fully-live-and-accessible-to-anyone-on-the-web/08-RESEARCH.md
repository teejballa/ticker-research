# Phase 8: Full Public Deployment — Research

**Researched:** 2026-03-25
**Domain:** Daytona sandbox provisioning, FastAPI SSE container server, notebooklm-py per-user storage passthrough, Vercel–Daytona wiring, noVNC VNC-over-WebSocket, AES-256 credential encryption
**Confidence:** HIGH (core patterns verified from official docs and library source); MEDIUM (Daytona URL format and persistent workspace behavior — verified from official docs but Daytona is evolving fast)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Daytona Container Hosting**
- Provider: Daytona's cloud service — create a workspace from `devcontainer.json`; Daytona manages the VM, uptime, and access URL. No self-hosted server needed.
- Vercel to container protocol: HTTP — Vercel sends POST requests with the source package JSON + user NbLM cookies; container runs the Python script and streams PROGRESS/RESULT lines back. Extends the existing `DEPLOYMENT_MODE=cloud` proxy pattern.
- Container HTTP server: Minimal FastAPI (or Flask) server wrapping the existing `scripts/notebooklm_research.py`. Receives request, spawns script, streams stdout back. No new Python logic needed beyond the server wrapper.
- Endpoint auth: `DAYTONA_CONTAINER_URL` and `DAYTONA_SECRET` stored as Vercel env vars. Container validates the shared secret on every incoming request.

**User NotebookLM Authentication (Web Context)**
- Primary attempt: Try OAuth token passthrough — check whether `notebooklm-py 0.3.4` (or current version) supports authenticating via a Google OAuth access token from NextAuth. Phase 6 research found this didn't work, but researcher must re-verify at implementation time.
- Fallback (if OAuth passthrough fails): Daytona container launches a headless Chromium session and streams it to the user's browser via noVNC or lightweight VNC-over-WebSocket. User sees the Google login page in an iframe/embedded view, logs in, cookies are captured server-side.
- Onboarding UX: Full-page onboarding step — after Google OAuth login, a dedicated `/setup` page shows the live browser stream. App detects successful cookie capture and redirects to home.
- Credential storage: `storage_state.json` content encrypted and stored in Neon DB per `user_id` (matches Phase 6 decision). Persistent across container restarts.

**Go-Live Configuration**
- Domain: Vercel default domain (`ticker-research.vercel.app` or equivalent) for initial public launch. No custom domain needed.
- Runbook format: Ordered go-live checklist (see CONTEXT.md). Planner turns each item into a plan task.
- Smoke test: Manual — after deployment, enter a ticker (e.g., AAPL), confirm the chart, run analysis, verify the report page renders and PDF download works.

**Go-Live Checklist (for planner to task-ify)**
1. Neon production DB: run `prisma migrate deploy` against production DATABASE_URL
2. Google OAuth: add production redirect URIs in Google Cloud Console
3. Vercel env vars: all 11 variables set
4. Daytona workspace: create from `devcontainer.json`, install FastAPI server + `scripts/requirements.txt`, start server on port 8080
5. Wire `DAYTONA_CONTAINER_URL` in Vercel to the live Daytona workspace endpoint
6. Deploy to Vercel (push to main or manual deploy)
7. Manual smoke test: full ticker to analysis to report flow

**Multi-User Concurrency**
- Concurrent execution: FastAPI server handles each request in a separate async task/thread. Each user has their own NbLM cookies (separate Playwright sessions), runs don't interfere. No queue needed for v1.
- Analysis failure handling: Specific, human-readable error messages per failure type with retry button or re-auth prompt.
- Cookie re-authentication: An "Account" or "Settings" page with "Reconnect NotebookLM" button triggers the same onboarding flow.

### Claude's Discretion
- Exact FastAPI server implementation details (routing, error response format, streaming mechanism)
- noVNC vs. alternative WebSocket VNC library if OAuth passthrough fails
- Encryption algorithm for NbLM cookie storage in Neon (AES-256-GCM or similar)
- Exact Neon schema additions for credential storage (separate `credentials` table vs. column on existing users table)
- Settings page design and placement within the app navigation

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 8 is a wiring-and-go-live phase, not a feature phase. All application logic exists in Phases 1–7; this phase connects the pieces into a publicly accessible product. The three distinct technical problems to solve are: (1) building a FastAPI HTTP server inside the Daytona container that wraps the existing `notebooklm_research.py` script and streams its stdout as SSE back to Vercel; (2) solving the per-user NotebookLM authentication UX — OAuth passthrough is still not supported by `notebooklm-py` (browser session cookies are the only mechanism), so the VNC stream path using noVNC is required; and (3) executing the go-live checklist to provision, connect, and smoke-test the live deployment.

The key architectural facts are confirmed: `notebooklm-py` `from_storage()` accepts an optional `path` parameter, meaning per-user `storage_state.json` content can be written to a temp file path and loaded at runtime without touching `~/.notebooklm/`. Daytona exposes running ports as `https://{port}-{sandboxId}.proxy.daytona.works`, and a sandbox with `auto_stop_interval=0` runs persistently (no auto-stop). FastAPI's native `EventSourceResponse` from `fastapi.sse` makes streaming subprocess stdout straightforward. The Vercel analysis route already has a cloud proxy branch — Phase 8 extends it to inject per-user cookies from Neon before forwarding.

**Primary recommendation:** Build `scripts/container_server.py` as a thin FastAPI wrapper, write per-user `storage_state.json` to a temp path on the Daytona container, pass that path via the request body, and stream results back as SSE. Do not attempt OAuth passthrough — it is confirmed to not work. Use noVNC (`@novnc/novnc` npm package or the `react-vnc` React wrapper) for the browser-stream auth UX.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fastapi | 0.115.x (latest) | Container HTTP server + SSE streaming | Built-in `EventSourceResponse`; async-native; minimal boilerplate |
| uvicorn | 0.34.x (latest) | ASGI server for FastAPI | Required FastAPI production server; supports async subprocess streaming |
| cryptography | 44.x (latest) | Fernet encryption for NbLM credentials in Neon | Python stdlib for symmetric encryption; `Fernet` is simple and correct |
| notebooklm-py[browser] | 0.3.4 | NotebookLM automation | Already installed in requirements.txt; no change |
| @novnc/novnc | 1.5.0 (latest) | Browser VNC stream for NbLM login UX | Official noVNC package; WebSocket VNC client runs in-browser |
| react-vnc | 0.x (latest) | React wrapper around noVNC | Simplifies embedding VNC stream as a React component |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-multipart | 0.0.20 | FastAPI form/body parsing | Required by FastAPI for request body handling |
| x11vnc | system package | VNC server on Daytona container | Required for noVNC fallback — exposes Chromium session as VNC |
| websockify | 0.12.x (PyPI) | WebSocket-to-TCP proxy | Bridges browser WebSocket to x11vnc TCP; required by noVNC |
| pyvirtualdisplay | 3.0 | Virtual display for headless Chromium VNC session | Required if container has no physical display |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| FastAPI | Flask | Flask lacks native async SSE; more boilerplate for streaming |
| @novnc/novnc | websockify embedded client | noVNC npm gives React component control; websockify is server-side only |
| Fernet (AES-CBC-HMAC) | AES-256-GCM (hazmat) | Fernet is safe and simple; GCM adds complexity with no practical gain for this threat model |
| react-vnc | raw @novnc/novnc | react-vnc is a thin wrapper; saves 50 lines of useEffect integration code |

**Installation (requirements.txt additions):**
```bash
fastapi==0.115.x
uvicorn[standard]==0.34.x
cryptography==44.x
websockify==0.12.x
pyvirtualdisplay==3.0
```

**NPM additions (package.json):**
```bash
npm install react-vnc @novnc/novnc
```

**Version verification:** Checked against PyPI and npm registry. Exact patch versions should be verified with `npm view react-vnc version` and `pip index versions fastapi` at implementation time.

---

## Architecture Patterns

### Recommended Project Structure (new files only)
```
scripts/
├── container_server.py       # FastAPI server wrapping notebooklm_research.py
├── requirements.txt          # Add: fastapi, uvicorn, cryptography, websockify, pyvirtualdisplay
src/app/
├── setup/
│   └── page.tsx              # Web-mode onboarding: OAuth passthrough check → VNC stream
├── account/
│   └── page.tsx              # Settings page with "Reconnect NotebookLM" button
├── api/
│   ├── setup/
│   │   └── nbm-auth/
│   │       └── route.ts      # Triggers Daytona VNC session, returns stream URL
│   └── analysis/
│       └── [ticker]/
│           └── route.ts      # EXTEND: inject user's NbLM cookies from Neon before proxying
prisma/
└── schema.prisma             # EXTEND: add UserCredential model
```

### Pattern 1: FastAPI SSE Container Server

**What:** A FastAPI endpoint receives the source package JSON + user's storage_state JSON, writes the storage_state to a temp file, spawns `notebooklm_research.py` with that path, and streams stdout lines as SSE events.

**When to use:** The only implementation approach — mirrors what Next.js analysis route does in local mode, but over HTTP.

**Key implementation detail:** `notebooklm-py`'s `from_storage(path=...)` accepts an explicit path, so the container server writes the user's per-user `storage_state.json` to a temp file, sets `NOTEBOOKLM_AUTH_JSON` env var (or passes via modified Python call), and the script loads the correct user's session.

**Stdout format:** The existing `notebooklm_research.py` prints `PROGRESS: msg` and `RESULT: json` — the FastAPI server must mirror this as SSE `data:` lines so the existing Next.js SSE parsing requires zero changes.

```python
# Source: FastAPI official docs (fastapi.tiangolo.com/tutorial/server-sent-events/)
# scripts/container_server.py — key pattern (Claude's Discretion for full implementation)
from fastapi import FastAPI, Header, HTTPException
from fastapi.sse import EventSourceResponse
from fastapi.responses import StreamingResponse
import asyncio, subprocess, tempfile, json, os

app = FastAPI()

SECRET = os.environ.get("DAYTONA_SECRET", "")

@app.post("/analyze/{ticker}")
async def analyze(ticker: str, body: dict, x_daytona_secret: str = Header(None)):
    if x_daytona_secret != SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    source_package = body.get("sourcePackage")
    storage_state = body.get("storageState")  # decrypted per-user cookies JSON

    # Write storage_state to temp file — notebooklm-py loads from path
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(storage_state, f)
        storage_path = f.name

    # Write source package to temp file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(source_package, f)
        pkg_path = f.name

    async def stream():
        env = {**os.environ, "NOTEBOOKLM_AUTH_JSON": storage_path}
        proc = await asyncio.create_subprocess_exec(
            "python3", "scripts/notebooklm_research.py", pkg_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        async for line in proc.stdout:
            decoded = line.decode().rstrip()
            yield f"data: {decoded}\n\n"
        await proc.wait()
        # Cleanup temp files
        os.unlink(storage_path)
        os.unlink(pkg_path)

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
```

### Pattern 2: Per-User Credential Storage in Neon

**What:** The user's `storage_state.json` content (Playwright session cookies) is encrypted with Fernet (AES-128-CBC + HMAC-SHA256) using a server-side secret key, stored as a `TEXT` column per `user_id` in a new `UserCredential` Prisma model.

**When to use:** On every analysis request in web mode — decrypt, pass to Daytona, discard temp file.

**Schema addition:**
```prisma
// prisma/schema.prisma — add after existing Report model
model UserCredential {
  id               String   @id @default(uuid())
  user_id          String   @unique   // email, matches Report.user_id
  encrypted_state  String             // Fernet-encrypted storage_state.json content
  updated_at       DateTime @updatedAt @db.Timestamptz

  @@map("user_credentials")
}
```

**Encryption pattern (TypeScript side — encrypt on write, decrypt on read):**
```typescript
// src/lib/credentials.ts — Claude's Discretion for exact implementation
// Use Node.js native crypto: AES-256-GCM with a CREDENTIAL_ENCRYPTION_KEY env var
import crypto from 'crypto';

const KEY = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY!, 'hex'); // 32-byte hex key

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(b => b.toString('base64')).join('.');
}

export function decrypt(ciphertext: string): string {
  const [iv, tag, encrypted] = ciphertext.split('.').map(s => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
```

Note: `CREDENTIAL_ENCRYPTION_KEY` is a 64-character hex string (32 bytes) generated once with `openssl rand -hex 32` and stored as a Vercel env var. Never regenerate — existing stored credentials would become unreadable.

### Pattern 3: noVNC Browser Stream for NbLM Login

**What:** When a user completes Step 1 (Google OAuth), the `/setup` page needs to show them a live browser session so they can log into Google for NotebookLM. The Daytona container runs x11vnc over a virtual display showing Chromium pointed at `notebooklm.google.com`. noVNC in the browser connects via WebSocket and streams the visual.

**When to use:** Only when OAuth passthrough fails (confirmed: it does not work — see findings below).

**Stack on the container:**
1. `Xvfb :99` — virtual display (pyvirtualdisplay manages this)
2. `chromium-browser --display=:99 https://notebooklm.google.com` — opens browser on virtual display
3. `x11vnc -display :99 -nopw -listen localhost -xkb` — exposes virtual display as VNC on port 5900
4. `websockify --web /path/to/novnc 6080 localhost:5900` — bridges VNC port to WebSocket on port 6080

**Stack on the frontend (`/setup` page):**
```typescript
// React component using react-vnc
import { VncScreen } from 'react-vnc';

<VncScreen
  url={`wss://${daytonaContainerHost}/novnc-ws`}  // websockify WebSocket proxy
  scaleViewport
  style={{ width: '100%', height: '500px' }}
/>
```

**Cookie capture trigger:** After user logs into Google in the VNC stream, the Daytona container detects authentication by checking `storage_state.json` is populated (via `notebooklm login` or a custom Playwright script that waits for session cookies). The container sends a webhook or the `/setup` page polls `/api/setup/nbm-auth/status` every 5 seconds.

### Pattern 4: Vercel Analysis Route Extension

**What:** In web mode, the existing cloud proxy branch in `src/app/api/analysis/[ticker]/route.ts` must be extended to: (1) retrieve the authenticated user's session from NextAuth, (2) look up their encrypted `storage_state.json` from Neon, (3) decrypt it, (4) include it in the POST body to the Daytona container alongside the source package.

**The source package is already on disk at `filePath`** (written by the research route). The container server needs both the source package content AND the per-user storage state.

```typescript
// Extend the existing cloud branch in route.ts
if (process.env.DEPLOYMENT_MODE === 'web') {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response(JSON.stringify({ type: 'error', message: 'Not authenticated' }), { status: 401 });
  }

  // Read source package from disk (existing behavior)
  const sourcePackage = JSON.parse(await fs.readFile(filePath, 'utf-8'));

  // Load and decrypt user's NbLM credentials from Neon
  const cred = await prisma.userCredential.findUnique({ where: { user_id: session.user.email } });
  if (!cred) {
    return new Response(JSON.stringify({ type: 'error', message: 'NotebookLM account not connected.' }), { status: 400 });
  }
  const storageState = JSON.parse(decrypt(cred.encrypted_state));

  // Forward to Daytona container
  const upstream = await fetch(`${containerUrl}/analyze/${ticker}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-daytona-secret': process.env.DAYTONA_SECRET!,
    },
    body: JSON.stringify({ sourcePackage, storageState }),
  });
  return new Response(upstream.body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}
```

### Anti-Patterns to Avoid

- **Writing `storage_state.json` to the Daytona container's `~/.notebooklm/` directly:** Multiple concurrent users would collide on the same file. Always use per-request temp files via `NOTEBOOKLM_AUTH_JSON` env var.
- **Passing source package as a file path from Vercel to Daytona:** The `/tmp` path only exists on the Vercel function's ephemeral filesystem. Always pass content (JSON body), not paths, across the network boundary.
- **Using Daytona sandbox for ephemeral per-request use:** Daytona sandboxes take seconds to start. The container must be long-lived (auto_stop_interval=0) and the FastAPI server must be running persistently inside it.
- **Blocking the Vercel function while waiting for Daytona:** The Vercel function is already a 300s proxy. Use streaming (SSE) from Daytona back to Vercel back to the browser — never buffer the full response.
- **Storing the encryption key in the database:** `CREDENTIAL_ENCRYPTION_KEY` must be a Vercel env var only, never persisted to Neon.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE from FastAPI | Manual `yield "data: ...\n\n"` string formatting | `fastapi.sse.EventSourceResponse` | Official pattern handles keep-alive, headers, reconnect |
| VNC-to-browser bridge | Custom WebSocket proxy | `websockify` + `@novnc/novnc` | Battle-tested VNC over WebSocket; noVNC is the de-facto standard |
| Symmetric credential encryption | AES from scratch | Node.js `crypto.createCipheriv('aes-256-gcm')` | stdlib; no extra dependency |
| Daytona workspace URL discovery | Hardcoding or parsing HTML | Daytona preview URL pattern `https://{port}-{sandboxId}.proxy.daytona.works` | Documented format; stable once workspace is created |
| Per-user storage_state isolation | Shared `~/.notebooklm/` dir | `NOTEBOOKLM_AUTH_JSON` env var per request | Supported by `notebooklm-py`; avoids user collision |

**Key insight:** The container server has zero business logic — it is a thin HTTP adapter over an existing shell script. Every line of custom logic added to it is a liability. Keep it under 100 lines.

---

## Common Pitfalls

### Pitfall 1: OAuth Passthrough Is Confirmed Non-Working
**What goes wrong:** Attempting to pass the Google OAuth `access_token` from NextAuth to `notebooklm-py` as authentication.
**Why it happens:** `notebooklm-py` uses browser session cookies (`SID`, `HSID`, `SSID`, `APISID`, `SAPISID`, `__Secure-1PSID`, `__Secure-3PSID`) extracted via Playwright's `storage_state.json`. These are completely separate from OAuth access tokens. There is no mechanism to convert an OAuth token into these cookies.
**How to avoid:** Never attempt OAuth passthrough. Go directly to the VNC stream onboarding path.
**Warning signs:** Any attempt to pass `session.accessToken` to the container for NotebookLM auth will silently fail with auth errors from the NotebookLM RPC layer.

### Pitfall 2: Source Package File Path Not Accessible Across Network Boundary
**What goes wrong:** Forwarding `filePath` (a `/tmp` path on the Vercel function's filesystem) to the Daytona container in the request body.
**Why it happens:** The existing local-mode analysis route passes `filePath` to Python directly (same process). In cloud mode, the source package must be serialized as JSON in the request body — the Daytona container has no access to Vercel's ephemeral `/tmp`.
**How to avoid:** Read the source package from disk in the Vercel route handler, include its content (not path) in the Daytona POST body.
**Warning signs:** `FileNotFoundError` on the container side; 404 or empty source package.

### Pitfall 3: Daytona Sandbox Auto-Stop Kills the FastAPI Server
**What goes wrong:** The Daytona sandbox stops after 15 minutes of inactivity (default), causing `DAYTONA_CONTAINER_URL` requests to fail.
**Why it happens:** Daytona's default `auto_stop_interval` is 15 minutes of inactivity.
**How to avoid:** Create the sandbox with `auto_stop_interval=0` (never auto-stop). Monitor via Daytona dashboard; consider a health check endpoint pinged periodically.
**Warning signs:** Vercel analysis route receives connection refused or 502 from the container URL.

### Pitfall 4: Concurrent Users Collide on Storage State
**What goes wrong:** User A's analysis overwrites `~/.notebooklm/storage_state.json` with their cookies while User B's analysis is running, causing B's NotebookLM session to fail mid-run.
**Why it happens:** `notebooklm-py` defaults to a single path for storage state.
**How to avoid:** Always use `NOTEBOOKLM_AUTH_JSON` env var pointing to a per-request temp file. Temp file is created before subprocess spawn and deleted after.
**Warning signs:** Intermittent NbLM auth failures under concurrent load; failures correlate to multiple simultaneous users.

### Pitfall 5: Daytona Container Preview URL Requires Authentication Header
**What goes wrong:** Vercel sends requests to the Daytona preview URL and receives 401 or redirect to Daytona login.
**Why it happens:** Daytona preview URLs for non-public sandboxes require `x-daytona-preview-token` header. The application-level `DAYTONA_SECRET` is separate from the Daytona platform preview token.
**How to avoid:** Either: (a) set the sandbox to `public=True` (no Daytona-level auth needed, app-level secret provides security); or (b) include the Daytona preview token in every upstream request. Option (a) is simpler since `DAYTONA_SECRET` already gates access at the application layer.
**Warning signs:** Requests to `DAYTONA_CONTAINER_URL` return HTML (Daytona login page) instead of JSON/SSE.

### Pitfall 6: Vercel 300s Timeout on Long Analysis Runs
**What goes wrong:** NotebookLM analysis takes more than 300 seconds (includes notebook creation, source indexing, 6 queries). Vercel drops the SSE connection.
**Why it happens:** Vercel Hobby plan hard cap is 300 seconds per function invocation. The analysis route is already set to `maxDuration=300` — this is the maximum available.
**How to avoid:** The existing `asyncio.sleep(15)` and `asyncio.sleep(20)` waits in `notebooklm_research.py` already consume 35 seconds. Track total wall time; if analysis regularly exceeds ~240 seconds, consider reducing the indexing sleep times or the URL count.
**Warning signs:** SSE stream terminates mid-run with no RESULT event; Vercel function logs show timeout.

### Pitfall 7: noVNC WebSocket Requires Same-Origin or CORS
**What goes wrong:** Browser refuses to open a WebSocket connection from `ticker-research.vercel.app` to the Daytona container's websockify endpoint.
**Why it happens:** Browser CORS/WebSocket origin restrictions. The websockify server must be configured to allow the Vercel origin.
**How to avoid:** Start websockify with `--web` and configure allowed origins, or route the WebSocket through a Next.js API route proxy. Alternatively, use the Daytona preview URL (which handles HTTPS/WSS termination) as the websockify endpoint.
**Warning signs:** Browser console shows `WebSocket connection failed` or CORS error when loading the VNC screen.

---

## Code Examples

Verified patterns from official sources:

### FastAPI SSE with async subprocess (official FastAPI docs pattern)
```python
# Source: fastapi.tiangolo.com/tutorial/server-sent-events/
from fastapi import FastAPI
from fastapi.sse import EventSourceResponse
from collections.abc import AsyncIterable

app = FastAPI()

@app.get("/stream", response_class=EventSourceResponse)
async def stream() -> AsyncIterable[str]:
    proc = await asyncio.create_subprocess_exec(
        "python3", "scripts/notebooklm_research.py", pkg_path,
        stdout=asyncio.subprocess.PIPE,
        env=env,
    )
    async for line in proc.stdout:
        yield line.decode().rstrip()
    await proc.wait()
```

### notebooklm-py from_storage with custom path
```python
# Source: teng-lin/notebooklm-py docs/python-api.md
# Path precedence: explicit arg > NOTEBOOKLM_AUTH_JSON env var > ~/.notebooklm/storage_state.json
async with await NotebookLMClient.from_storage(path="/tmp/user123-state.json") as client:
    nb = await client.notebooks.create("AAPL Research")

# Alternative: set env var before spawning the script
import os
env = {**os.environ, "NOTEBOOKLM_AUTH_JSON": "/tmp/user123-state.json"}
```

### Daytona sandbox creation with persistent settings (Python SDK)
```python
# Source: daytona.io/docs/en/getting-started/
from daytona import Daytona, CreateSandboxFromSnapshotParams
daytona = Daytona()  # reads DAYTONA_API_KEY from env
sandbox = daytona.create(CreateSandboxFromSnapshotParams(
    ephemeral=False,
    auto_stop_interval=0,  # 0 = never auto-stop
    public=True,            # preview URLs publicly accessible
))
url = sandbox.get_preview_link(8080)  # https://8080-{sandboxId}.proxy.daytona.works
```

### Node.js AES-256-GCM encryption (stdlib only)
```typescript
// Source: Node.js crypto docs — no external dependency
import crypto from 'crypto';
const KEY = Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY!, 'hex'); // 32 bytes

function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}

function decrypt(blob: string): string {
  const [iv, tag, enc] = blob.split('.').map(s => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
```

### Prisma UserCredential model (extends existing schema)
```prisma
// Source: Prisma 7 docs — prisma.io/docs
model UserCredential {
  id               String   @id @default(uuid())
  user_id          String   @unique
  encrypted_state  String   @db.Text
  updated_at       DateTime @updatedAt @db.Timestamptz

  @@map("user_credentials")
}
```

### react-vnc component (VNC stream in browser)
```typescript
// Source: npm react-vnc package
import { VncScreen } from 'react-vnc';

<VncScreen
  url="wss://6080-SANDBOX_ID.proxy.daytona.works"
  scaleViewport
  style={{ width: '100%', height: '500px', background: '#000' }}
  onConnect={() => console.log('VNC connected')}
  onDisconnect={() => console.log('VNC disconnected')}
/>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `flask` for Python servers | `fastapi` with native async | 2022+ | FastAPI SSE support built-in via `EventSourceResponse`; no third-party sse-starlette needed |
| notebooklm-py `auth.json` | notebooklm-py `storage_state.json` | Phase 2 (2026) | Known in this codebase — `from_storage()` path, not `~/.notebooklm/auth.json` |
| Daytona workspace (dev tool) | Daytona sandbox (AI infra product) | 2025 | API terminology changed; SDK is `daytona` on PyPI; workspace = sandbox in new API |
| noVNC manual setup | `react-vnc` npm component | 2023+ | React wrapper eliminates boilerplate; works with Daytona's WSS endpoint |

**Deprecated/outdated:**
- `sse-starlette` PyPI package: Was previously needed for FastAPI SSE; FastAPI now has `fastapi.sse` built in (FastAPI 0.115+). Do not add `sse-starlette` as a dependency.
- `flask-sse`: Flask-based SSE; not applicable given FastAPI decision.

---

## Open Questions

1. **Does the Daytona preview URL support WSS (WebSocket Secure)?**
   - What we know: Preview URLs are HTTPS (`https://`). noVNC requires WSS when the client page is served over HTTPS.
   - What's unclear: Whether Daytona's preview proxy transparently supports WSS upgrades on the same port.
   - Recommendation: Test with a websockify server on port 6080 in the Daytona container and attempt a WebSocket connection from the Vercel-hosted page. If WSS fails, route the WebSocket through a Next.js API route as a proxy.

2. **Daytona sandbox startup time after creation**
   - What we know: Daytona sandboxes with `auto_stop_interval=0` run persistently. But first creation from `devcontainer.json` runs `postCreateCommand` (pip install + playwright install), which takes several minutes.
   - What's unclear: Whether there is a snapshot/image mechanism to pre-bake dependencies and skip the install step on subsequent starts.
   - Recommendation: Create the sandbox once during go-live setup. Pre-bake requirements by running `postCreateCommand` manually and saving as a snapshot if Daytona offers that feature. Otherwise accept the one-time install time.

3. **x11vnc availability in the Daytona Python 3.12 container image**
   - What we know: The container image is `mcr.microsoft.com/devcontainers/python:3.12` (Debian/Ubuntu-based, glibc). x11vnc and Xvfb are available via `apt-get`.
   - What's unclear: Whether `postCreateCommand` in `devcontainer.json` is the right place to install x11vnc and Xvfb, or if they should be part of the container_server.py startup sequence.
   - Recommendation: Add x11vnc, Xvfb to `postCreateCommand` in `devcontainer.json`. Start them on-demand only when a VNC session is requested (not on every container start).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (e2e) + Vitest (unit) |
| Config file | `playwright.config.ts` / `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/` |
| Full suite command | `npx playwright test && npx vitest run` |

### Phase Requirements to Test Map
| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| Credential encrypt/decrypt roundtrip | unit | `npx vitest run tests/unit/credentials.test.ts` | No — Wave 0 |
| UserCredential Prisma CRUD | unit | `npx vitest run tests/unit/user-credential-db.test.ts` | No — Wave 0 |
| Container server `/analyze` endpoint streams SSE | e2e/integration | Manual (Daytona container required) | No |
| `/setup` page shows VNC stream after Google OAuth | e2e | Manual (requires Daytona + VNC session) | No |
| Analysis route (web mode) injects credentials from Neon | unit (mocked) | `npx vitest run tests/unit/analysis-web-mode.test.ts` | No — Wave 0 |
| Full flow: ticker to analysis to report (smoke test) | manual | Manual — enter AAPL, confirm, wait for report | N/A |
| Auth route rejects missing/invalid DAYTONA_SECRET | unit | `npx vitest run tests/unit/container-server-auth.test.ts` | No — Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/`
- **Per wave merge:** `npx playwright test && npx vitest run`
- **Phase gate:** Full suite green + manual smoke test before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/credentials.test.ts` — encrypt/decrypt roundtrip, wrong key fails, tampered ciphertext throws
- [ ] `tests/unit/user-credential-db.test.ts` — Prisma UserCredential model CRUD (mocked)
- [ ] `tests/unit/analysis-web-mode.test.ts` — analysis route web mode branch (NextAuth session mocked, Neon mocked, Daytona fetch mocked)
- [ ] Migration file for `user_credentials` table — `prisma migrate dev --name add_user_credentials`

---

## Sources

### Primary (HIGH confidence)
- `github.com/teng-lin/notebooklm-py/blob/main/docs/python-api.md` — `from_storage(path=...)` signature confirmed; path precedence order documented
- `github.com/teng-lin/notebooklm-py/blob/main/docs/configuration.md` — `NOTEBOOKLM_AUTH_JSON` env var documented; default path `~/.notebooklm/storage_state.json`
- `fastapi.tiangolo.com/tutorial/server-sent-events/` — `EventSourceResponse` pattern confirmed; async subprocess streaming supported natively
- `daytona.io/docs/en/preview-and-authentication/` — Preview URL format `https://{port}-{sandboxId}.proxy.daytona.works` confirmed; `public=True` removes platform-level auth
- `daytona.io/docs/en/limits/` — Tier 1 limits: 10 vCPU, 10GiB RAM, 30GiB storage; sandbox creation 300/min
- `daytona.io/docs/en/sandbox-management/` — `auto_stop_interval=0` confirmed for never-auto-stop; default 15 min inactivity
- `daytona.io/docs/en/getting-started/` — Python SDK sandbox creation with `auto_stop_interval`, `public` params confirmed
- `vercel.com/docs/functions/limitations` — Hobby plan maxDuration 300s confirmed; SSE streaming supported up to 300s

### Secondary (MEDIUM confidence)
- `novnc.com/noVNC/` + `npmjs.com/package/@novnc/novnc` — noVNC official package, WebSocket bridging via websockify confirmed
- `npmjs.com/package/react-vnc` — React wrapper for noVNC confirmed; active package

### Tertiary (LOW confidence)
- `daytona.io/docs/en/preview/` via WebFetch — URL format consistent with official docs but page loaded via redirect; double-checked against sandbox-management page
- Daytona Python SDK `get_preview_link(port)` method — confirmed in search results and SDK docs snippets; full method signature not directly verified from source code

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — FastAPI, uvicorn, cryptography are verified official packages; noVNC/react-vnc confirmed on npm
- Architecture: HIGH — notebooklm-py path/env var mechanism verified from source docs; Daytona URL format verified from official docs; encryption pattern is Node.js stdlib
- Pitfalls: HIGH — OAuth passthrough non-working confirmed by Phase 6 research + re-verified; other pitfalls derive from documented behavior
- Daytona URL/preview details: MEDIUM — documented in Daytona official docs but product is evolving; URL format should be re-verified at workspace creation time

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (Daytona is fast-moving; re-verify preview URL format and SDK API before implementation)
