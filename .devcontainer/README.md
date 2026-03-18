# Daytona Container — One-Time Setup

This devcontainer spec provisions a fully configured environment for running the Ticker Research Assistant in cloud deployment mode. It includes Node.js 18, Python 3.12, Chromium, and `notebooklm-py` pre-installed.

## What `postCreateCommand` does

When Daytona creates the container, it automatically runs:

1. `pip install -r scripts/requirements.txt` — installs `notebooklm-py==0.3.4` and its Playwright dependency
2. `playwright install --with-deps chromium` — installs Chromium plus all required OS-level system libraries (libnss3, libgbm, etc.) needed to run Chromium on Linux. The `--with-deps` flag is required — using bare `playwright install chromium` omits these libraries and causes Chromium to fail at launch.
3. `npm install` — installs Node.js dependencies so `npm start` works inside the container

## One-time setup after `daytona create`

Auth is **not** baked into the container image. After the container is created, complete these steps once:

1. Open a terminal inside the container
2. Run: `notebooklm login`
   - A browser window opens on your screen
   - Log into Google with the account you want to use for NotebookLM
   - Auth credentials are saved at `~/.notebooklm/storage_state.json`
3. Auth persists across container restarts — you only need to do this once
4. Copy the Daytona-provided public URL for port 3000 (visible in the Daytona dashboard or via `daytona port list`)
5. Set `DAYTONA_CONTAINER_URL` on Vercel to that forwarded port 3000 URL
6. Start the server inside the container: `npm start`

## Environment variables

`ANTHROPIC_API_KEY` is mapped from your local machine's environment into the container via `remoteEnv`. Make sure it is set in your shell before running `daytona create`.

If deploying to Vercel, also set `ANTHROPIC_API_KEY` in the Vercel project environment variables.

## Port forwarding

| Port | Purpose |
|------|---------|
| 3000 | Next.js server (primary — this is the `DAYTONA_CONTAINER_URL` value) |
| 8080 | Alternate / reserved |

## Vercel SSE timeout note

`vercel.json` sets `maxDuration=300` (5 minutes) on the `/api/analysis/**` and `/api/research/**` routes. This is the maximum allowed on the Vercel Hobby plan with Fluid Compute enabled. A `notebooklm-py` research run takes approximately 3–5 minutes. If you are on the Vercel Pro plan, you can raise this to 800 seconds for additional headroom during slow network conditions.

## Base image

The container uses `mcr.microsoft.com/devcontainers/python:3.12` — an Ubuntu-based (glibc) image. Do not switch to Alpine-based images; Playwright does not support musl libc.
