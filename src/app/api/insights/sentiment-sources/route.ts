// src/app/api/insights/sentiment-sources/route.ts
//
// JSON endpoint backing the /insights/sentiment-sources dashboard.
// The fetch helper + response types live in _helpers.ts so that
// route.ts only contains the exports the App Router permits.

import { fetchSentimentSourcesPayload } from './_helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = await fetchSentimentSourcesPayload();
  return Response.json(payload, {
    // Per-source information-coefficient rows update once daily (per-source-ic
    // cron) — edge-cache for a few minutes.
    headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' },
  });
}
