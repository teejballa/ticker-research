// src/app/api/history/[filename]/route.ts
// GET /api/history/[filename] — returns a single persisted report by filename.
import { NextRequest, NextResponse } from 'next/server';
import { readReport } from '@/lib/reports';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const { filename } = await params;
  // Security: only allow alphanumeric, hyphens, underscores, dots, plus — no path traversal
  // + appears in timezone-offset filenames (e.g. AAPL-2026-03-20T00-49-55...+00-00.json)
  if (!/^[A-Z0-9.+\-_]+\.json$/i.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }
  try {
    const report = await readReport(filename);
    return NextResponse.json(report);
  } catch {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }
}
