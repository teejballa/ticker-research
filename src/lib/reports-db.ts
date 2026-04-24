// src/lib/reports-db.ts
// Neon-backed report persistence — web mode parallel to src/lib/reports.ts (local mode).
// All functions filter by user_id (session.user.email) — reports are private per-user.
import { prisma } from '@/lib/db';
import type { AnalysisResult, StoredReport } from '@/lib/types';

/**
 * Persist a completed AnalysisResult to Neon for the given user.
 * Returns the UUID of the created report row.
 */
export async function writeReportToDb(
  result: AnalysisResult,
  userId: string
): Promise<string> {
  const report = await prisma.report.create({
    data: {
      user_id: userId,
      ticker: result.ticker,
      company_name: result.company_name,
      analyzed_at: new Date(result.analyzed_at),
      market_sentiment: result.market_sentiment,
      confidence_level: result.confidence_level,
      analysis: result as object,
    },
  });
  return report.id;
}

/**
 * List all reports for a user, ordered newest first.
 * Maps Prisma Report rows to StoredReport shape.
 */
export async function listReportsFromDb(userId: string): Promise<StoredReport[]> {
  const rows = await prisma.report.findMany({
    where: { user_id: userId },
    orderBy: { analyzed_at: 'desc' },
  });
  return rows.map((r) => ({
    id: r.id,
    ticker: r.ticker,
    company_name: r.company_name,
    analyzed_at: r.analyzed_at.toISOString(),
    market_sentiment: r.market_sentiment as StoredReport['market_sentiment'],
    confidence_level: r.confidence_level as StoredReport['confidence_level'],
    analysis: r.analysis as unknown as AnalysisResult,
  }));
}

/**
 * Read a single report by ID, scoped to the given user_id.
 * Throws if not found (user_id mismatch is treated as not found for security).
 */
export async function readReportFromDb(
  id: string,
  userId: string
): Promise<StoredReport> {
  const row = await prisma.report.findFirst({
    where: { id, user_id: userId },
  });
  if (!row) {
    throw new Error(`Report ${id} not found for user ${userId}`);
  }
  return {
    id: row.id,
    ticker: row.ticker,
    company_name: row.company_name,
    analyzed_at: row.analyzed_at.toISOString(),
    market_sentiment: row.market_sentiment as StoredReport['market_sentiment'],
    confidence_level: row.confidence_level as StoredReport['confidence_level'],
    analysis: row.analysis as unknown as AnalysisResult,
  };
}
