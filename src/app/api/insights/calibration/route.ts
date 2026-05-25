// src/app/api/insights/calibration/route.ts
//
// JSON endpoint backing the /insights/calibration dashboard.
// The fetch helper + response type live in _helpers.ts so that
// route.ts only contains the exports the App Router permits.

import { fetchCalibrationPayload } from './_helpers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = await fetchCalibrationPayload();
  if (payload == null) {
    return Response.json(
      { error: 'No Brier evaluation has been written yet.' },
      { status: 404 },
    );
  }
  return Response.json(payload, {
    // Brier evaluation is written once per day by the eval-brier cron — safe to
    // edge-cache for several minutes with a long stale-while-revalidate.
    headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400' },
  });
}
