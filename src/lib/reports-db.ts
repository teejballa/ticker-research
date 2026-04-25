// src/lib/reports-db.ts
// Neon-backed report persistence — web mode parallel to src/lib/reports.ts (local mode).
// All functions filter by user_id (session.user.email) — reports are private per-user.
import { prisma } from '@/lib/db';
import type { AnalysisResult, StoredReport } from '@/lib/types';
import type { SentimentDimensions } from './sentiment-dimensions';

/**
 * Persist a completed AnalysisResult to Neon for the given user.
 * Returns the UUID of the created report row.
 */
export async function writeReportToDb(
  result: AnalysisResult,
  userId: string,
  opts?: { price_at_report?: number; community_data?: SentimentDimensions },
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
      price_at_report: opts?.price_at_report ?? null,
      community_data: opts?.community_data ? (opts.community_data as object) : undefined,
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

function mapRow(r: {
  id: string;
  ticker: string;
  company_name: string;
  analyzed_at: Date;
  market_sentiment: string;
  confidence_level: string;
  analysis: unknown;
}): StoredReport {
  return {
    id: r.id,
    ticker: r.ticker,
    company_name: r.company_name,
    analyzed_at: r.analyzed_at.toISOString(),
    market_sentiment: r.market_sentiment as StoredReport['market_sentiment'],
    confidence_level: r.confidence_level as StoredReport['confidence_level'],
    analysis: r.analysis as unknown as AnalysisResult,
  };
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
  return mapRow(row);
}

/**
 * Read a single report by analyzed_at timestamp, scoped to the given user_id.
 * Fallback for old-format ?report= params (e.g. GOOGL-2026-04-18T04-55-20Z.json).
 * Throws if not found.
 */
export async function readReportFromDbByTimestamp(
  analyzedAt: string,
  userId: string
): Promise<StoredReport> {
  const row = await prisma.report.findFirst({
    where: { analyzed_at: new Date(analyzedAt), user_id: userId },
  });
  if (!row) {
    throw new Error(`Report at ${analyzedAt} not found for user ${userId}`);
  }
  return mapRow(row);
}
