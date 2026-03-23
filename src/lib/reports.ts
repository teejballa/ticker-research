// src/lib/reports.ts
// Report persistence helpers for Phase 5.
// Reports are written to ~/.cipher/reports/ — never inside the project directory.

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { AnalysisResult } from '@/lib/types';
export type { StoredReport } from '@/lib/types';

const REPORTS_DIR = path.join(os.homedir(), '.cipher', 'reports');

function sanitizeTimestamp(iso: string): string {
  return iso.replace(/:/g, '-').replace(/\.\d+Z$/, 'Z');
}

export async function writeReport(result: AnalysisResult): Promise<string> {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const ts = sanitizeTimestamp(result.analyzed_at);
  const filename = `${result.ticker}-${ts}.json`;
  const filePath = path.join(REPORTS_DIR, filename);
  const stored = {
    ticker: result.ticker,
    company_name: result.company_name,
    analyzed_at: result.analyzed_at,
    market_sentiment: result.market_sentiment,
    confidence_level: result.confidence_level,
    analysis: result,
  };
  await fs.writeFile(filePath, JSON.stringify(stored, null, 2), 'utf8');
  return filename;
}

export async function readReport(filename: string): Promise<import('@/lib/types').StoredReport> {
  const filePath = path.join(REPORTS_DIR, filename);
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

export async function listReports(): Promise<import('@/lib/types').StoredReport[]> {
  try {
    const files = await fs.readdir(REPORTS_DIR);
    const reports: import('@/lib/types').StoredReport[] = [];
    for (const file of files.filter(f => f.endsWith('.json'))) {
      try {
        const content = await fs.readFile(path.join(REPORTS_DIR, file), 'utf8');
        reports.push(JSON.parse(content));
      } catch {
        // Skip corrupt files — never abort the list
      }
    }
    reports.sort((a, b) =>
      new Date(b.analyzed_at).getTime() - new Date(a.analyzed_at).getTime()
    );
    return reports;
  } catch {
    return [];
  }
}
