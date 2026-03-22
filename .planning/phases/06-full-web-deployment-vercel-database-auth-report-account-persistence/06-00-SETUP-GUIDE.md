# Phase 6 — External Services Setup Guide

**Read this before executing any Phase 6 plan.**

This guide walks you through setting up every external service Phase 6 requires.
Plans 01–03 are pure code and need no credentials.
You need credentials before executing **Plan 04** (migration + Vercel deploy).

Complete these in order. Budget ~45 minutes total.

---

## Step 1 — Neon PostgreSQL (10 min)

Neon is the serverless Postgres database where user reports are stored.
It has a generous free tier — no credit card required.

### 1a. Create your Neon project

1. Go to **https://neon.tech**
2. Click **"Start for free"** → sign in with GitHub or Google
3. Click **"New Project"**
4. Fill in:
   - **Project name:** `ticker-research` (or anything you like)
   - **Postgres version:** 16 (default)
   - **Region:** US East 1 (or closest to your Vercel region)
5. Click **"Create project"**

### 1b. Get your connection strings

After creating the project, Neon shows you a **Connection details** panel.
You need **two** connection strings:

| Variable | Which string to copy | How to identify it |
|---|---|---|
| `DATABASE_URL` | **Pooled connection** | Hostname contains `-pooler` (e.g. `ep-xxx-pooler.us-east-2.aws.neon.tech`) |
| `DIRECT_URL` | **Direct connection** | Hostname has NO `-pooler` (e.g. `ep-xxx.us-east-2.aws.neon.tech`) |

**To find them:**
1. In the Neon dashboard, click your project → **Connection details** tab
2. Under **Connection string**, toggle between **Pooled** and **Direct** modes
3. Copy each string — they look like:
   ```
   postgresql://neondb_owner:abc123@ep-some-name-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

**Save both strings now** — you'll need them for `.env.local` and Vercel.

> **Why two strings?**
> `DATABASE_URL` (pooled) is used by Next.js at runtime — pooling handles concurrency.
> `DIRECT_URL` is used by Prisma migrations (`prisma migrate dev`) — migrations require a direct connection, not a pool.

---

## Step 2 — Google Cloud Console OAuth (20 min)

This creates the Google OAuth app that users sign in through.

### 2a. Create or open a Google Cloud project

1. Go to **https://console.cloud.google.com**
2. In the top bar, click the project selector → **New Project**
3. Name: `Equinfo` (or `ticker-research`) → click **Create**
4. Make sure your new project is selected in the top bar

### 2b. Configure the OAuth consent screen

1. In the left sidebar, go to **APIs & Services → OAuth consent screen**
2. User Type: **External** → click **Create**
3. Fill in:
   - **App name:** `Equinfo`
   - **User support email:** your Gmail
   - **Developer contact information:** your Gmail
4. Click **Save and Continue** through all three remaining screens (Scopes, Test users, Summary) — leave defaults
5. Click **Back to Dashboard**

> **Test users (important for dev):** While your app is in "Testing" mode (before you publish it), only emails you explicitly add as Test Users can sign in. Add your own Gmail here. You can add up to 100 test emails.

### 2c. Create OAuth credentials

1. Go to **APIs & Services → Credentials**
2. Click **+ Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: `Equinfo Web`
5. Under **Authorized redirect URIs**, click **+ Add URI** and add:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
6. Click **Create**

You'll see a popup with:
- **Your Client ID** — copy this → `GOOGLE_CLIENT_ID`
- **Your Client Secret** — copy this → `GOOGLE_CLIENT_SECRET`

> **After Vercel deploy:** Come back here and add your production redirect URI too:
> ```
> https://your-app.vercel.app/api/auth/callback/google
> ```
> Without this, Google OAuth won't work in production.

---

## Step 3 — Generate NextAuth Secret (2 min)

NextAuth needs a random secret for signing session JWTs.
Run this in your terminal:

```bash
openssl rand -base64 32
```

Copy the output — this is your `NEXTAUTH_SECRET`.
Keep it private — treat it like a password.

---

## Step 4 — Set up your local .env.local (5 min)

Copy `.env.local.example` to `.env.local` and fill in all values:

```bash
cp .env.local.example .env.local
```

Then open `.env.local` and fill in:

```
# Existing (already set)
ANTHROPIC_API_KEY=your_key_here

# Phase 6 additions
GOOGLE_CLIENT_ID=<from Step 2c>
GOOGLE_CLIENT_SECRET=<from Step 2c>
NEXTAUTH_SECRET=<from Step 3>
NEXTAUTH_URL=http://localhost:3000

DATABASE_URL=<pooled connection string from Step 1b>
DIRECT_URL=<direct connection string from Step 1b>

# Leave this unset for local mode. Set to 'web' only when testing web auth locally.
# DEPLOYMENT_MODE=web
```

> **DEPLOYMENT_MODE in local dev:** Leave it unset (or `local`) while developing.
> Local mode uses the filesystem — no Neon connection is made.
> Only set `DEPLOYMENT_MODE=web` if you want to test the full web auth flow locally.

---

## Step 5 — Generate the Prisma Migration (5 min)

This creates the `reports` database table in Neon.
Run this **after** setting `DATABASE_URL` and `DIRECT_URL` in `.env.local`:

```bash
npx prisma migrate dev --name init
```

This command:
1. Connects to your Neon database using `DIRECT_URL`
2. Creates the `prisma/migrations/` directory with the SQL migration file
3. Creates the `reports` table in Neon

**Then commit the migration files:**
```bash
git add prisma/migrations/
git commit -m "feat(db): add initial Prisma migration for reports table"
```

> **Critical:** The `prisma/migrations/` directory must be committed to the repo.
> Vercel runs `prisma migrate deploy` during build — if no migration files exist, the table is never created.

**Verify the table was created:**
Go to your Neon dashboard → **Tables** — you should see a `reports` table.

---

## Step 6 — Daytona Container Setup (5 min)

Daytona runs `notebooklm-py` in the cloud — it's the server that does the NotebookLM analysis.

### 6a. Start your Daytona container

Follow the Daytona setup from Phase 4 docs. The container needs:
- Node.js 18+
- Python 3.10+
- `notebooklm-py` installed (via `scripts/requirements.txt`)
- Chromium installed (via `playwright install chromium`)

If the container is already set up from Phase 4, start it and get its URL.

### 6b. Authenticate NotebookLM in the container (one-time)

**Inside your Daytona container**, run:
```bash
notebooklm login
```

A browser window opens. Log in with the **product owner's Google account** — the one that will run all analyses in web mode. This is the shared service account (Option A from the research decision).

After login, credentials are saved to `~/.notebooklm/auth.json` in the container. They persist across container restarts.

### 6c. Get the container URL

Your Daytona container exposes an HTTP API. Get its URL:
```bash
daytona info   # or check your Daytona dashboard
```

The URL looks like: `https://your-container-id.daytona.io`

Save this as `DAYTONA_CONTAINER_URL`.

---

## Step 7 — Deploy to Vercel (5 min)

### 7a. Push to GitHub

```bash
git push origin main
```

### 7b. Create Vercel project

1. Go to **https://vercel.com** → **Add New → Project**
2. Click **Import** next to your `ticker-research` GitHub repo
3. **DO NOT click Deploy yet** — you need to set environment variables first

### 7c. Set environment variables in Vercel

In the Vercel import screen, expand **Environment Variables** and add all of these:

| Key | Value | Where to find it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic key | platform.anthropic.com |
| `GOOGLE_CLIENT_ID` | From Step 2c | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Step 2c | Google Cloud Console |
| `NEXTAUTH_SECRET` | From Step 3 | Generated locally |
| `NEXTAUTH_URL` | `https://your-app.vercel.app` | Your Vercel URL (set after first deploy, or predict it) |
| `DATABASE_URL` | Pooled connection string | Neon dashboard → Step 1b |
| `DIRECT_URL` | Direct connection string | Neon dashboard → Step 1b |
| `DEPLOYMENT_MODE` | `web` | Literal string |
| `DAYTONA_CONTAINER_URL` | From Step 6c | Daytona dashboard |
| `INTERNAL_SECRET` | Any random string | `openssl rand -base64 16` |

> **NEXTAUTH_URL note:** Vercel assigns your URL before deploy — it's typically `https://your-repo-name.vercel.app`. If you don't know it yet, deploy once without NEXTAUTH_URL set, copy the URL Vercel gives you, add it as a variable, then redeploy.

### 7d. Deploy

Click **Deploy**. Vercel will:
1. Run `prisma migrate deploy` (applies the committed migration → creates `reports` table)
2. Run `next build`
3. Start your app

Wait for the build to complete — the build log shows the migration output.

### 7e. Add production redirect URI to Google

After deploy, go back to **Google Cloud Console → APIs & Services → Credentials → your OAuth app → Edit**:

Add the redirect URI:
```
https://your-app.vercel.app/api/auth/callback/google
```

Click **Save**. Without this, Google will reject OAuth logins in production.

---

## Step 8 — Smoke Test (3 min)

1. Open your Vercel URL in an incognito window
2. You should be redirected to `/auth/signin` — the terminal dark sign-in page
3. Click **[ CONNECT GOOGLE ACCOUNT ]**
4. Sign in with a Google account that's in your **Test Users** list (Step 2b)
5. You should land on the home page, authenticated
6. Enter a ticker → confirm chart → run analysis
7. Check your Neon dashboard — a row should appear in the `reports` table

---

## Credential Checklist

Before Plan 04 execution, confirm you have all of these:

- [ ] `ANTHROPIC_API_KEY` — existing
- [ ] `GOOGLE_CLIENT_ID` — from Google Cloud Console
- [ ] `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
- [ ] `NEXTAUTH_SECRET` — generated with `openssl rand -base64 32`
- [ ] `DATABASE_URL` — Neon pooled connection string
- [ ] `DIRECT_URL` — Neon direct connection string
- [ ] `NEXTAUTH_URL` — your Vercel deployment URL
- [ ] `DAYTONA_CONTAINER_URL` — your Daytona container URL
- [ ] `INTERNAL_SECRET` — random secret for container auth
- [ ] `DEPLOYMENT_MODE=web` — set in Vercel only, not in local `.env.local`
- [ ] `prisma/migrations/` — committed to git after running `prisma migrate dev --name init`
- [ ] Google OAuth redirect URIs — both localhost and production added

---

## Common Problems

### "OAuthCallback" error on Google sign-in
→ Your redirect URI is not registered in Google Cloud Console. Add it (Step 7e).

### Build fails: `prisma migrate deploy` error
→ `prisma/migrations/` is not committed. Run `git add prisma/migrations/ && git commit`.
→ Or `DATABASE_URL` is not set in Vercel env vars.

### "Error: No Prisma Schema found" on Vercel
→ `prisma/schema.prisma` must be in the root `prisma/` directory and committed.

### Sign-in works but shows "you are not authorized"
→ Your Google account is not in the Test Users list. Add it in Google Cloud Console → OAuth consent screen → Test users.

### Analysis runs but report isn't saved
→ `DEPLOYMENT_MODE=web` not set in Vercel. Reports fall through to filesystem mode, which doesn't work in serverless.

### `notebooklm-py` rate limit errors
→ The Daytona container's shared Google account has hit the ~50 queries/day NotebookLM limit. Wait until midnight PST.
