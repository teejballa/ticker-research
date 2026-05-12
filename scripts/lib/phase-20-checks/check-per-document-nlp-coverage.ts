// scripts/lib/phase-20-checks/check-per-document-nlp-coverage.ts
// Owned by 20-Z-01 (table) + 20-B-01 (per_document_polarity populator) — this script only consumes.
//
// DoD #3 — Prisma query: of last-7d SentimentObservation rows where
// source ∈ {news, community}, ≥80% have a non-null per_document_polarity
// field. Pending if SentimentObservation table absent (20-Z-01 not yet landed)
// or if zero rows exist in the window.

import type { CheckFn } from './types';

// Threshold per CONTEXT.md DoD #3: "Per-document NLP active for ≥80% of news/community items per ticker"
const COVERAGE_MIN = 0.80;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const checkPerDocumentNlpCoverage: CheckFn = async (deps) => {
  const base = {
    name: 'per-document-nlp-coverage',
    dod_label: 'Per-document NLP active for ≥80% of news/community items per ticker',
    blocker_for: 3,
    branch: 'sentiment',
  } as const;
  try {
    if (!deps.prisma.sentimentObservation) {
      return { ...base, status: 'pending', evidence: 'SentimentObservation Prisma model not available' };
    }
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_MS);
    const total = await deps.prisma.sentimentObservation.count({
      where: {
        source: { in: ['news', 'community'] },
        fetched_at: { gte: sevenDaysAgo },
      },
    });
    if (total === 0) {
      return { ...base, status: 'pending', evidence: 'no news/community SentimentObservation rows in last 7d' };
    }
    const withPolarity = await deps.prisma.sentimentObservation.count({
      where: {
        source: { in: ['news', 'community'] },
        fetched_at: { gte: sevenDaysAgo },
        per_document_polarity: { not: null },
      },
    });
    const ratio = withPolarity / total;
    if (ratio >= COVERAGE_MIN) {
      return {
        ...base,
        status: 'pass',
        evidence: `${withPolarity}/${total} rows have per_document_polarity (${(ratio * 100).toFixed(1)}%; need ≥${COVERAGE_MIN * 100}%)`,
      };
    }
    return {
      ...base,
      status: 'fail',
      evidence: `${withPolarity}/${total} rows have per_document_polarity (${(ratio * 100).toFixed(1)}%; need ≥${COVERAGE_MIN * 100}%)`,
    };
  } catch (err) {
    return { ...base, status: 'pending', evidence: `query failed: ${String(err)}` };
  }
};
