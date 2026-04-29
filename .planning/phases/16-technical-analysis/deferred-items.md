
## Plan 16-03 — Sentiment-scan route validator findings (deferred)

- **vercel-functions Line 56:** 2s throttle-sleep between tickers in `src/app/api/cron/sentiment-scan/route.ts`. Pre-existing pattern; plan 16-03 explicitly says "PRESERVE the throttle-sleep". Refactor to Vercel Workflow is a cross-cutting concern, deferred.
- **vercel-functions Line 13:** Route handler has no observability instrumentation. Same pre-existing deferral as 16-02. Cross-cutting observability plan owns this.
