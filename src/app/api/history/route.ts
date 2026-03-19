// src/app/api/history/route.ts
// GET /api/history — returns all persisted reports, sorted newest first.
import { NextResponse } from 'next/server';
import { listReports } from '@/lib/reports';

export async function GET() {
  try {
    const reports = await listReports();
    return NextResponse.json({ reports });
  } catch (err) {
    console.error('[api/history] Failed to list reports:', err);
    return NextResponse.json({ reports: [] });
  }
}
