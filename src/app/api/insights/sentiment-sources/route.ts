// src/app/api/insights/sentiment-sources/route.ts
//
// JSON endpoint backing the /insights/sentiment-sources dashboard.
// The fetch helper + response types live in _helpers.ts so that
// route.ts only contains the exports the App Router permits.

import { fetchSentimentSourcesPayload } from './_helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = await fetchSentimentSourcesPayload();
  return Response.json(payload);
}
