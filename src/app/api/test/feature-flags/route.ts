// One-off debug route — verifies live FEATURE_* flag state in production.
// SAFE: returns only mode strings ('off' | 'shadow' | 'on'), no secret values.
// Will be removed after verification per the close-out task.
import { NextResponse } from 'next/server';
import { resolveFeatures } from '@/lib/features';

export const dynamic = 'force-dynamic';

export async function GET() {
  const features = resolveFeatures();
  return NextResponse.json({
    features,
    timestamp: new Date().toISOString(),
  });
}
