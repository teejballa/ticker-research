# Google Cloud Run Deployment Runbook

Container: `ticker-research-container`
Region: `us-central1`
Registry: Google Artifact Registry (`us-central1-docker.pkg.dev`)
Project: `cipher-491101`

---

## Prerequisites

- `gcloud` CLI installed and authenticated
- Docker installed and running
- GCP project set as default

```bash
# Already authenticated as walshtj46@gmail.com — no gcloud auth login needed
gcloud config set project cipher-491101
gcloud config set run/region us-central1
```

---

## One-Time Setup

### Enable APIs

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com
```

### Create Artifact Registry repository

```bash
gcloud artifacts repositories create ticker-research \
  --repository-format=docker \
  --location=us-central1 \
  --description="Ticker research container images"
```

### Configure Docker auth for Artifact Registry

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
```

---

## Build and Deploy

Run these commands from the repo root for every deploy.

### Step 1: Set variables

```bash
PROJECT_ID=cipher-491101
GIT_SHA=$(git rev-parse --short HEAD)
IMAGE="us-central1-docker.pkg.dev/${PROJECT_ID}/ticker-research/container:${GIT_SHA}"
```

### Step 2: Build and push image

```bash
docker build -t "${IMAGE}" .
docker push "${IMAGE}"
```

### Step 3: Deploy to Cloud Run

**First deploy** (creates the service and sets env vars):

```bash
gcloud run deploy ticker-research-container \
  --image="${IMAGE}" \
  --region=us-central1 \
  --min-instances=0 \
  --cpu-boost \
  --memory=2Gi \
  --cpu=1 \
  --timeout=3600 \
  --allow-unauthenticated \
  --port=8080 \
  --set-env-vars="CONTAINER_SECRET=YOUR_SECRET_HERE,ALLOWED_ORIGIN=https://ticker-research.vercel.app"
```

**Subsequent deploys** (env vars already set on service — omit `--set-env-vars` to avoid overwriting):

```bash
gcloud run deploy ticker-research-container \
  --image="${IMAGE}" \
  --region=us-central1 \
  --min-instances=0 \
  --cpu-boost \
  --memory=2Gi \
  --cpu=1 \
  --timeout=3600 \
  --allow-unauthenticated \
  --port=8080
```

> **Note:** `--set-env-vars` overwrites ALL env vars on the service. Omit it on subsequent deploys to preserve `CONTAINER_SECRET` already set. To update a single env var without redeploying the image: `gcloud run services update ticker-research-container --update-env-vars KEY=VALUE --region=us-central1`.

### Step 4: Get the service URL

```bash
gcloud run services describe ticker-research-container \
  --region=us-central1 \
  --format='value(status.url)'
```

This output is your `CONTAINER_URL` value for Vercel.

---

## Update Vercel Environment Variables

After deploying, update these env vars in Vercel Dashboard → Project → Settings → Environment Variables:

| Env Var | Value |
|---------|-------|
| `CONTAINER_URL` | Cloud Run service URL (e.g., `https://ticker-research-container-xxxx-uc.a.run.app`) |
| `CONTAINER_SECRET` | Same secret set on Cloud Run with `CONTAINER_SECRET=YOUR_SECRET_HERE` |
| `CONTAINER_VNC_URL` | `wss://YOUR_SERVICE_URL/vnc-ws` (NOT a :6080 port URL — must use /vnc-ws path) |

**Critical:** `CONTAINER_VNC_URL` must use `wss://` and path `/vnc-ws`. Cloud Run exposes only one port (8080/443). The old Daytona format (`https://host:6080`) will not work — port 6080 is unreachable externally on Cloud Run.

After updating env vars, redeploy Vercel to pick them up:

```bash
vercel --prod
```

---

## Rollback

Re-deploy with a previous git SHA tag:

```bash
PROJECT_ID=cipher-491101
PRIOR_SHA=abc1234   # Replace with the SHA from the prior working deploy

gcloud run deploy ticker-research-container \
  --image="us-central1-docker.pkg.dev/${PROJECT_ID}/ticker-research/container:${PRIOR_SHA}" \
  --region=us-central1
```

---

## Smoke Test

After every deploy, verify the service is healthy:

```bash
SERVICE_URL=$(gcloud run services describe ticker-research-container \
  --region=us-central1 --format='value(status.url)')

curl "${SERVICE_URL}/health"
# Expected: {"status":"ok"}
```

Then run the full manual smoke test:

1. Open https://ticker-research.vercel.app/setup
2. Click "Launch Research Environment" — VNC panel should appear within 30 seconds
3. Log in with Google in the VNC panel
4. After login is captured (green checkmark), go to the home page
5. Search for ticker AAPL, confirm the chart, submit
6. SSE progress stream should run 6 steps and complete with a research report

---

## Cost Estimate

- `min-instances=0` (scale to zero): **~$0/month** for personal use — within Cloud Run free tier
  - Free tier: 180,000 vCPU-seconds + 360,000 GiB-seconds/month
  - One research run (~5 min, 1 CPU, 2GiB) uses ~300 vCPU-sec + ~600 GiB-sec → **~600 free runs/month**
  - After free tier: ~$0.01/run
- Cold start after idle: ~20–40s (mitigated by `--cpu-boost`)
- Auth state is stored in Neon DB per-user — container is fully stateless, cold starts lose no data
- Review Cloud Run pricing at https://cloud.google.com/run/pricing

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `/health` returns 503 | Container not started or crashed | Check logs: `gcloud logging read "resource.type=cloud_run_revision" --limit=50` |
| `/vnc-start` returns 503 "Chromium launch failed" | Playwright browser binary missing in image | Verify `COPY --from=builder /root/.cache/ms-playwright` in Dockerfile |
| VNC panel blank / connection refused | `CONTAINER_VNC_URL` using `:6080` port | Update Vercel env var to `wss://SERVICE_URL/vnc-ws` |
| 401 on all requests | `CONTAINER_SECRET` mismatch | Verify Vercel `CONTAINER_SECRET` matches the value set on the Cloud Run service |
| CORS errors in browser console | `ALLOWED_ORIGIN` not set on container | Run: `gcloud run services update ticker-research-container --update-env-vars ALLOWED_ORIGIN=https://ticker-research.vercel.app --region=us-central1` |
| SSE stream stops mid-analysis | Vercel `maxDuration=300s` proxy timeout | Pre-existing constraint — Cloud Run timeout is 3600s but the Vercel proxy caps at 300s. Long runs (>5 min) may be cut off. |
| Cold start delay (~30s) | `min-instances=0` — container was idle and scaled to zero | Expected behavior. Frontend shows "Waking up research environment..." during startup. No auth state is lost (stored in DB). |
