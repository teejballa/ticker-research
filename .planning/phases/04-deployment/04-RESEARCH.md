# Phase 4: Deployment - Research

**Researched:** 2026-03-15
**Domain:** Local packaging, Daytona devcontainer, Vercel deployment, SSE proxy, env-var routing
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEPLOY-01 | System runs locally on a user's device (local execution mode) | npm start requires `next build` first — packaging must run build step; Python 3.10+ and ANTHROPIC_API_KEY pre-flight checks already implemented in `/api/setup/status` |
| DEPLOY-02 | System is deployable as a web application (web mode) | Vercel handles Next.js frontend; `notebooklm-py` requires Daytona container (Playwright/Chromium cannot run in Vercel Functions); DEPLOYMENT_MODE env var switches routing in API routes |
</phase_requirements>

---

## Summary

Phase 4 has two distinct delivery targets: a frictionless local install and a cloud-deployed web application. Both targets share the same Next.js codebase; a single `DEPLOYMENT_MODE` environment variable determines which execution path the API routes take.

**Local delivery** is straightforward. The app already has the setup wizard (Phase 2) that installs `notebooklm-py` and handles Google auth. The only missing piece is ensuring `npm start` builds the app before serving it, plus a `setup.sh` or pre-start npm script that validates Node and Python versions and prints a helpful error when `ANTHROPIC_API_KEY` is missing.

**Cloud delivery** is architecturally constrained. Vercel Functions cannot run Playwright/Chromium — they are ephemeral, have no persistent filesystem, and have a 250 MB bundle limit that precludes a browser binary. The research execution layer (`scripts/notebooklm_research.py`) must run inside a persistent Daytona container. The Next.js API routes, when in cloud mode, proxy research job requests to the Daytona container and relay its SSE stream back to the browser. The Daytona container is user-owned infrastructure; `~/.notebooklm/storage_state.json` persists there across restarts (already confirmed correct auth path in Phase 2).

**Primary recommendation:** Build local packaging first (plan 04-01), then the Daytona container (plan 04-02), then wire the Vercel-to-Daytona proxy with the `DEPLOYMENT_MODE` env var switch (plan 04-03). These can each be verified independently.

---

## Standard Stack

### Core
| Library/Tool | Version | Purpose | Why Standard |
|---|---|---|---|
| Next.js | 15.3.9 (already in repo) | App framework | Already in use |
| Vercel CLI | latest | Deploy Next.js frontend | Official Vercel deployment tool |
| Daytona | latest | Persistent container platform | Chosen by project; supports devcontainer spec |
| `mcr.microsoft.com/devcontainers/python:3.12` | latest | Devcontainer base image | Has Python, supports feature installs |
| `notebooklm-py[browser]==0.3.4` | 0.3.4 | Research execution in container | Already pinned in `scripts/requirements.txt` |

### Supporting
| Library/Tool | Version | Purpose | When to Use |
|---|---|---|---|
| `playwright install --with-deps chromium` | bundled with notebooklm-py | Install Chromium + OS deps inside container | Run in `postCreateCommand` or Dockerfile layer |
| `dotenv` (Node built-in approach) | N/A | Env var loading for local `.env.local` | Only for local mode; Vercel injects vars on deploy |
| `cross-env` | latest | Platform-neutral env var setting in npm scripts | If needed for Windows compatibility in setup scripts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|---|---|---|
| Daytona container | Railway / Fly.io / Render persistent service | Valid alternatives for persistent Python execution; Daytona is project-specified |
| Vercel frontend | Self-hosted Next.js on VPS | More ops burden; Vercel is project-specified for cloud mode |
| devcontainer.json | Plain Dockerfile | Daytona reads devcontainer.json natively; devcontainer.json is the right approach |

**Installation (local dev, if not already installed):**
```bash
npm install -g vercel
# Daytona CLI: curl -fsSL https://get.daytona.io/install | bash
```

---

## Architecture Patterns

### Recommended Project Structure Additions
```
.devcontainer/
  devcontainer.json       # Daytona container spec (Node 18 + Python 3.12 + Chromium)
scripts/
  setup.sh                # One-time local setup validator (Node, Python, ANTHROPIC_API_KEY)
  requirements.txt        # already exists: notebooklm-py[browser]==0.3.4
vercel.json               # maxDuration for proxy routes + env var docs
.env.local.example        # Template showing required env vars for local use
src/app/api/
  analysis/[ticker]/
    route.ts              # already exists — add DEPLOYMENT_MODE branch for cloud proxy
  research/[ticker]/
    route.ts              # may need same DEPLOYMENT_MODE branch
```

### Pattern 1: npm start with pre-build step

**What:** `package.json` `"start"` script runs `next build && next start` so the user's single command produces a production build and serves it.

**When to use:** Local install target — user runs `npm install && npm start` per success criteria.

**Key constraint (HIGH confidence):** `next start` requires a `.next/` build artifact from `next build`. Running `next start` on a fresh clone without building first produces the error: `Could not find a production build`. The `"start"` script must chain both commands.

```json
// package.json
{
  "scripts": {
    "start": "next build && next start",
    "dev": "next dev"
  }
}
```

**Pre-flight validation** (run via `prestart` npm hook or `setup.sh`):
- Check `node --version` >= 18
- Check `python3 --version` >= 3.10
- Check `ANTHROPIC_API_KEY` env var is set (non-empty)
- Print friendly error and exit 1 if any check fails

### Pattern 2: DEPLOYMENT_MODE env var routing in API routes

**What:** API routes that currently spawn `python3 scripts/notebooklm_research.py` check `process.env.DEPLOYMENT_MODE`. In local mode (default, `DEPLOYMENT_MODE` unset or `"local"`), they spawn the local Python process. In cloud mode (`DEPLOYMENT_MODE=cloud`), they forward the request to the Daytona container URL and pipe the SSE stream back.

**When to use:** Vercel deployment — the frontend has no Python, no `child_process.spawn`.

```typescript
// src/app/api/analysis/[ticker]/route.ts — cloud branch addition
export const dynamic = 'force-dynamic'; // required for runtime env var access on Vercel

if (process.env.DEPLOYMENT_MODE === 'cloud') {
  const containerUrl = process.env.DAYTONA_CONTAINER_URL; // e.g. https://mycontainer.daytona.app
  // Forward POST with filePath to container's /api/analysis endpoint
  // Pipe the SSE response stream back to the browser
}
```

**Critical:** `export const dynamic = 'force-dynamic'` must be added to any route that reads `process.env.DEPLOYMENT_MODE` at runtime. Without it, Next.js may evaluate the route at build time and cache the result, meaning the env var value is captured at build time, not runtime.

### Pattern 3: Daytona devcontainer.json for multi-stack container

**What:** `.devcontainer/devcontainer.json` declares the container spec that Daytona reads when the user runs `daytona create`. Combines a Python 3.12 base image (which supports Playwright/Chromium) with Node.js 18+ as a feature.

**When to use:** Plan 04-02 — building the Daytona container spec.

```json
// .devcontainer/devcontainer.json
{
  "name": "ticker-research",
  "image": "mcr.microsoft.com/devcontainers/python:3.12",
  "features": {
    "ghcr.io/devcontainers/features/node:1": { "version": "18" }
  },
  "postCreateCommand": "pip install -r scripts/requirements.txt && playwright install --with-deps chromium && npm install",
  "forwardPorts": [3000, 8080],
  "remoteEnv": {
    "ANTHROPIC_API_KEY": "${localEnv:ANTHROPIC_API_KEY}"
  }
}
```

**Note on Playwright in containers (HIGH confidence, from official Playwright Python Docker docs):**
- Playwright requires glibc-based Linux (Ubuntu/Debian). Alpine is not supported.
- `playwright install --with-deps chromium` installs system-level OS dependencies automatically via `--with-deps`.
- When running headless Chromium, `--ipc=host` improves memory isolation (less critical for single-user research workloads but good practice).
- Auth is NOT baked into the container image. User runs `notebooklm login` once inside the container after `daytona create`; `~/.notebooklm/storage_state.json` persists on the container filesystem across restarts.

### Pattern 4: Daytona container exposes a research job endpoint

**What:** The container needs to accept incoming research job requests from Vercel. The simplest approach is to run the existing Next.js server inside the container (`npm start`), which provides all the same API routes — including `/api/analysis/[ticker]`. The Vercel frontend in cloud mode proxies to the container's Next.js server. No separate microservice needed.

**Alternative:** A minimal standalone Python HTTP server (e.g., Flask or plain `http.server`) that accepts job requests and invokes `notebooklm_research.py`. This is lighter weight but requires additional code. Using Next.js server inside the container is simpler and reuses existing route code.

**Recommended:** Use the full Next.js server inside the container. Set `DEPLOYMENT_MODE=local` inside the container (so it uses `child_process.spawn` there), and `DEPLOYMENT_MODE=cloud` on Vercel (so it proxies to the container).

### Pattern 5: SSE proxy from Vercel to Daytona container

**What:** When `DEPLOYMENT_MODE=cloud`, the Next.js API route on Vercel acts as a transparent SSE proxy — it makes a fetch to the container URL, reads the SSE stream, and re-emits it to the browser.

**SSE proxy pattern (verified against Vercel docs and community sources):**
```typescript
// Vercel route — cloud mode SSE proxy
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 min — matches Hobby plan limit

const containerRes = await fetch(`${process.env.DAYTONA_CONTAINER_URL}/api/analysis/${ticker}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ filePath }),
});

return new Response(containerRes.body, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  },
});
```

**Vercel SSE duration limits (HIGH confidence, from official Vercel docs):**
- With Fluid Compute enabled (default on all plans): 300s (5 minutes) Hobby, 800s (13 minutes) Pro/Enterprise.
- Without Fluid Compute: 60s Hobby, 300s Pro.
- A notebooklm-py research run takes roughly 3–5 minutes (15s text index wait + 20s URL index wait + 6 queries). This fits within the 300s Hobby limit with Fluid Compute enabled but is close to the edge. A Pro plan gives comfortable headroom.

### Anti-Patterns to Avoid

- **Running `next start` without `next build` first:** Crashes with "Could not find a production build" — the `start` npm script must include the build step for local install.
- **Hardcoding container URL:** `DAYTONA_CONTAINER_URL` must be an environment variable on Vercel, not hardcoded — the URL will differ per user's Daytona setup.
- **Baking Google auth into the Daytona image:** `storage_state.json` contains live browser session cookies. It cannot be pre-baked into the image and persisted correctly. User must run `notebooklm login` once inside the container after creation.
- **Not adding `force-dynamic` to routes reading runtime env vars:** Without it, Next.js static analysis may cache the route output at build time on Vercel.
- **Using Alpine as devcontainer base:** Playwright/Chromium does not run on Alpine (musl libc). Must use Ubuntu/Debian-based images.
- **Spawning `python3` on Vercel Functions:** Vercel has no Python runtime for child_process.spawn and no filesystem for temp files. Only the Daytona container path works in cloud mode.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Daytona container spec | Custom Dockerfile without devcontainer.json | `.devcontainer/devcontainer.json` | Daytona reads devcontainer.json natively; feature-based installs are reproducible |
| SSE proxying | Custom buffering/chunking logic | Direct `containerRes.body` passthrough as `ReadableStream` | Node.js fetch streams work natively as SSE passthrough; no manual chunking needed |
| Python version checking | Custom shell parsing of `python --version` | Reuse existing `checkPython()` in `/api/setup/status/route.ts` | Already handles both `python3` and `python` candidates with semver comparison |
| Env var validation | Try/catch on missing keys | `prestart` npm script with `node -e "if (!process.env.ANTHROPIC_API_KEY) { console.error(...); process.exit(1); }"` | Simple, runs before build |

---

## Common Pitfalls

### Pitfall 1: `npm start` fails on fresh clone
**What goes wrong:** User follows README (`npm install && npm start`), but `next start` requires a prior `next build`. Without the build, the server throws "Could not find a production build" and exits immediately.
**Why it happens:** `next start` and `next dev` are separate commands; `start` is production mode only and needs the `.next/` artifact.
**How to avoid:** Define `"start": "next build && next start"` in `package.json`. The build step adds ~1 minute to first launch but is the correct production model.
**Warning signs:** Error message `Error: Could not find a production build in .next/` on first run.

### Pitfall 2: Vercel route caches env var at build time
**What goes wrong:** `DEPLOYMENT_MODE=cloud` is set on Vercel, but the deployed API route always behaves as if it's in local mode.
**Why it happens:** Next.js may statically analyze GET/POST route handlers and cache the response. Without `export const dynamic = 'force-dynamic'`, the env var value is captured at build time, not request time.
**How to avoid:** Add `export const dynamic = 'force-dynamic'` to every API route that reads `DEPLOYMENT_MODE` (specifically the analysis and research routes).
**Warning signs:** Cloud mode never takes effect even with correct env vars on Vercel.

### Pitfall 3: Playwright headless fails in Daytona container
**What goes wrong:** `notebooklm_research.py` runs but Playwright fails to launch Chromium with errors about missing system libraries (e.g., `libnss3`, `libgbm`, etc.).
**Why it happens:** Playwright requires glibc-based Linux with specific system dependencies. If `playwright install chromium` (without `--with-deps`) was run, OS-level dependencies are missing.
**How to avoid:** Always use `playwright install --with-deps chromium` in the `postCreateCommand`. This installs the browser AND its OS dependencies.
**Warning signs:** Playwright launch error mentioning missing shared libraries, or error `Host system is missing dependencies to run browsers`.

### Pitfall 4: SSE stream times out on Vercel Hobby plan
**What goes wrong:** A research run takes 4+ minutes; the Vercel Hobby plan hits the 300s limit and returns a 504 `FUNCTION_INVOCATION_TIMEOUT`.
**Why it happens:** Vercel Hobby with Fluid Compute caps at 300s. The notebooklm-py pipeline has hardcoded `sleep(15)` (text index) + `sleep(20)` (URL index) + 6 async queries. In slow conditions, total runtime can exceed 300s.
**How to avoid:** Set `export const maxDuration = 300` on the analysis proxy route (Hobby max). Consider reducing `asyncio.sleep` values if under time pressure. Recommend Pro plan for production use where headroom to 800s is needed.
**Warning signs:** 504 error in Vercel logs; Vercel function log shows `FUNCTION_INVOCATION_TIMEOUT`.

### Pitfall 5: `DAYTONA_CONTAINER_URL` CORS / auth
**What goes wrong:** The Vercel frontend successfully sets up the proxy, but the Daytona container rejects requests from Vercel's IP with 403/CORS errors.
**Why it happens:** The container's Next.js server may not accept cross-origin requests by default if the Vercel frontend origin is not whitelisted.
**How to avoid:** Add a `ALLOWED_ORIGINS` env var or configure Next.js `headers()` in `next.config.ts` for the container deployment. Alternatively, use a shared secret header (`X-Internal-Secret`) to authenticate requests from Vercel to the container, rejecting all requests lacking it.
**Warning signs:** 403 or CORS errors in browser DevTools when cloud mode is active.

### Pitfall 6: `storage_state.json` path mismatch in container
**What goes wrong:** `notebooklm login` saves auth, but `notebooklm_research.py` fails to authenticate because `NotebookLMClient.from_storage()` looks in a different path.
**Why it happens:** `notebooklm-py` defaults to `~/.notebooklm/storage_state.json`. If the container runs as a non-root user, `~` resolves correctly. But if the container user is `root` and the app runs as another user, paths diverge.
**How to avoid:** Confirm the devcontainer runs as a consistent non-root user. The existing `notebooklm_auth.py` reads `NOTEBOOKLM_HOME` env var and defaults to `Path.home() / ".notebooklm"` — this pattern should be consistent with how `notebooklm-py`'s `from_storage()` resolves its path.
**Warning signs:** `NotebookLMClient.from_storage()` raises `FileNotFoundError` for `storage_state.json` despite `notebooklm login` reporting success.

---

## Code Examples

### setup.sh — pre-flight validator for local install
```bash
#!/usr/bin/env bash
# scripts/setup.sh
# Validates local prerequisites before npm start.
set -euo pipefail

echo "Checking prerequisites..."

# Node.js >= 18
NODE_VERSION=$(node --version 2>/dev/null || echo "none")
if [[ "$NODE_VERSION" == "none" ]]; then
  echo "ERROR: Node.js not found. Install Node.js 18+ from https://nodejs.org"
  exit 1
fi

# Python 3.10+
PYTHON_CMD=""
for cmd in python3 python; do
  if $cmd --version 2>/dev/null | grep -qE "Python 3\.(1[0-9]|[2-9][0-9])"; then
    PYTHON_CMD=$cmd
    break
  fi
done
if [[ -z "$PYTHON_CMD" ]]; then
  echo "ERROR: Python 3.10+ not found. Install from https://www.python.org"
  exit 1
fi

# ANTHROPIC_API_KEY
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo "ERROR: ANTHROPIC_API_KEY is not set."
  echo "Add it to your shell profile or create a .env.local file:"
  echo "  ANTHROPIC_API_KEY=your-key-here"
  exit 1
fi

echo "All prerequisites met."
```

### .env.local.example — template for local users
```bash
# .env.local.example
# Copy to .env.local and fill in your values.

# Required: Anthropic API key for data collection
ANTHROPIC_API_KEY=your-anthropic-api-key-here

# Optional: Set to 'cloud' when deploying to Vercel
# DEPLOYMENT_MODE=local

# Optional (cloud mode only): URL of your Daytona container
# DAYTONA_CONTAINER_URL=https://your-container.daytona.app
```

### vercel.json — maxDuration for long-running proxy routes
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "functions": {
    "src/app/api/analysis/**/*": {
      "maxDuration": 300
    },
    "src/app/api/research/**/*": {
      "maxDuration": 300
    }
  }
}
```

### API route — DEPLOYMENT_MODE branch for cloud proxy
```typescript
// Addition to src/app/api/analysis/[ticker]/route.ts
export const dynamic = 'force-dynamic';

// At the top of the POST handler, before the local spawn branch:
if (process.env.DEPLOYMENT_MODE === 'cloud') {
  const containerUrl = process.env.DAYTONA_CONTAINER_URL;
  if (!containerUrl) {
    return new Response(
      JSON.stringify({ type: 'error', message: 'DAYTONA_CONTAINER_URL is not configured.' }),
      { status: 500 }
    );
  }
  const upstream = await fetch(`${containerUrl}/api/analysis/${ticker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filePath }),
  });
  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
// ... existing local spawn logic below
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Vercel Functions default 10s timeout (Hobby) | 300s default with Fluid Compute (all plans) | 2024/2025 — Fluid Compute GA | Long-running SSE proxy routes are viable on Hobby; no plan upgrade required for most research runs |
| `next start` without build in dev setups | `next build && next start` required for production | Next.js stable | Must chain build into start script for local packaging |
| Alpine as container base for Node/Python | Ubuntu-based devcontainer images for Playwright | Playwright policy (ongoing) | Alpine is unsupported; use `mcr.microsoft.com/devcontainers/python` which is Ubuntu-based |

---

## Open Questions

1. **Daytona container public URL / port forwarding mechanism**
   - What we know: Daytona supports `daytona forward` and publicly accessible URLs for forwarded ports
   - What's unclear: The exact stable public URL format for a Daytona container's forwarded port (whether it uses `*.daytona.app` or requires a custom domain or tunnel setup)
   - Recommendation: Plan 04-02 should document the one-time URL discovery step and store the URL as `DAYTONA_CONTAINER_URL` on Vercel. This is a configuration/documentation concern, not a code concern.

2. **SSE stream duration under load**
   - What we know: notebooklm-py pipeline has 35s of mandatory sleep + 6 async queries; measured total is ~3–5 minutes under normal conditions
   - What's unclear: Whether slow NotebookLM query responses (e.g., busy hours) could push past 300s on Hobby
   - Recommendation: Set `maxDuration=300` in `vercel.json`, document Pro plan as the production recommendation, and consider reducing sleep durations in `notebooklm_research.py` if timing becomes an issue (that's a separate script change, not a deployment concern).

3. **Container-to-Vercel authentication (shared secret vs. open)**
   - What we know: The Vercel frontend calls the Daytona container's Next.js server
   - What's unclear: Whether the container endpoint should require a shared secret to prevent unauthorized calls
   - Recommendation: Add an optional `INTERNAL_SECRET` env var check in the container's API routes as a low-friction guard. Plan 04-03 can implement this as a request header check.

---

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest 3.0.9 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm test -- --reporter=verbose` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-01 | `npm start` runs build then serves the app | smoke/manual | Manual: `npm install && npm start` on fresh clone | ❌ Wave 0 |
| DEPLOY-01 | Pre-flight validator (`setup.sh` or `prestart`) exits with helpful error when ANTHROPIC_API_KEY missing | unit | `npm test -- src/lib/__tests__/preflight.test.ts` | ❌ Wave 0 |
| DEPLOY-01 | `setup.sh` exits non-zero when Python 3.10+ is absent | unit/script | `bash scripts/setup.sh` with mocked PATH | manual-only |
| DEPLOY-02 | API route reads `DEPLOYMENT_MODE=cloud` and proxies to container URL | unit | `npm test -- src/app/api/analysis/__tests__/route.test.ts` | ✅ (extend existing) |
| DEPLOY-02 | API route returns 500 when `DEPLOYMENT_MODE=cloud` but `DAYTONA_CONTAINER_URL` is unset | unit | `npm test -- src/app/api/analysis/__tests__/route.test.ts` | ✅ (extend existing) |
| DEPLOY-02 | Full end-to-end: Vercel → Daytona container → SSE result | e2e/manual | Manual production smoke test | manual-only |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green + manual local smoke test (`npm install && npm start`) + manual cloud smoke test before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/lib/__tests__/preflight.test.ts` — unit tests for pre-flight validation logic (DEPLOY-01 env var and version checks)
- [ ] Extend `src/app/api/analysis/__tests__/route.test.ts` — add cases for `DEPLOYMENT_MODE=cloud` branch: proxy to container, error on missing `DAYTONA_CONTAINER_URL`, SSE passthrough

*(Existing test infrastructure covers the full Vitest setup; no new framework install needed)*

---

## Sources

### Primary (HIGH confidence)
- Vercel official docs: [Configuring Maximum Duration](https://vercel.com/docs/functions/configuring-functions/duration) — maxDuration limits per plan, Fluid Compute defaults
- Vercel official docs: [Vercel Functions Limits](https://vercel.com/docs/functions/limitations) — bundle size, ephemeral filesystem, no Playwright/Chromium
- Playwright official docs: [Docker / Python](https://playwright.dev/python/docs/docker) — base image requirements, `--with-deps chromium`, Alpine exclusion
- Next.js official docs: [Production build requirement](https://nextjs.org/docs/messages/production-start-no-build-id) — `next start` requires prior `next build`
- Existing codebase: `scripts/notebooklm_auth.py`, `scripts/notebooklm_research.py`, `src/app/api/setup/status/route.ts`, `src/app/api/analysis/[ticker]/route.ts` — confirmed implementation patterns and auth file path (`storage_state.json`)

### Secondary (MEDIUM confidence)
- Daytona devcontainer docs / community: [Integrate Daytona with Node+Python](https://dev.to/subashlamichhane/integrate-daytona-into-a-machine-learning-project-with-react-node-and-python-36o8) — devcontainer.json pattern with Node+Python features
- [devcontainers.dev features registry](https://containers.dev/features) — `ghcr.io/devcontainers/features/node:1` for Node.js in Python base image
- [Fixing Slow SSE in Next.js and Vercel (Jan 2026)](https://medium.com/@oyetoketoby80/fixing-slow-sse-server-sent-events-streaming-in-next-js-and-vercel-99f42fbdb996) — `force-dynamic` requirement for SSE routes

### Tertiary (LOW confidence)
- Daytona public URL / port forwarding format — not officially documented in searched sources; requires validation during plan 04-02 execution

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — core tools (Vercel, Next.js, devcontainer spec) are confirmed from official docs; Daytona-specific URL mechanism is LOW
- Architecture: HIGH — DEPLOYMENT_MODE pattern and SSE proxy are standard Next.js patterns; Playwright devcontainer requirements confirmed from official Playwright docs
- Pitfalls: HIGH — `next build` requirement, `force-dynamic`, `--with-deps chromium`, and Vercel timeout limits all confirmed from official sources

**Research date:** 2026-03-15
**Valid until:** 2026-04-15 (stable tooling; Vercel plan limits and Daytona APIs may change)
