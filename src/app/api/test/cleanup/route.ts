// src/app/api/test/cleanup/route.ts
// Playwright e2e test-support endpoints — seed and cleanup for the test user in Neon.
// SECURITY: Double-gated: NODE_ENV !== 'production' AND TEST_CLEANUP_SECRET header.
// These routes MUST NOT be callable in production.
import { NextRequest, NextResponse } from 'next/server';
import type { AnalysisResult } from '@/lib/types';

export const dynamic = 'force-dynamic';

function checkGates(req: NextRequest): NextResponse | null {
  // Gate 1: never run in production (Vercel sets NODE_ENV=production)
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  // Gate 2: caller must supply the cleanup secret
  const secret = req.headers.get('x-test-cleanup-secret');
  if (!secret || secret !== process.env.TEST_CLEANUP_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}

interface SeedPatternRow {
  signal_class: string;
  pattern_key: string;
  cap_class: string;
  horizon_days: number;
  alpha: number;
  beta: number;
  sample_size: number;
  effective_sample_size: number;
  status: string;
  hits?: number;
  alpha_30d?: number;
  beta_30d?: number;
  // Phase 19 Plan 19-A-07 — optional pooling fields for e2e seeding.
  parent_alpha?: number | null;
  parent_beta?: number | null;
  shrinkage_strength?: number | null;
}

interface SeedLearningEventRow {
  event_type: string;
  signal_class: string;
  pattern_key: string;
  cap_class: string;
  horizon_days: number;
  daysAgo: number;
  delta?: Record<string, number>;
  message?: string;
}

/**
 * POST /api/test/cleanup
 * Seeds fixture data directly into Neon for e2e tests.
 *
 * Two body shapes supported (mutually exclusive):
 *  1. { analysis: AnalysisResult } — seeds a Report row (legacy DB-QA-08 path)
 *  2. { learnedPatterns: [...], learningEvents: [...] } — Phase 18-09 seeding
 *     of LearnedPattern + LearningEvent rows for the /insights ESS-CI test.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const gate = checkGates(req);
  if (gate) return gate;

  const body = await req.json() as Partial<{
    analysis: AnalysisResult;
    learnedPatterns: SeedPatternRow[];
    learningEvents: SeedLearningEventRow[];
  }>;

  // Path 1 — legacy report seeding (DB-QA-08 / db-persistence.spec.ts).
  if (body.analysis) {
    const { writeReportToDb } = await import('@/lib/reports-db');
    const id = await writeReportToDb(body.analysis, 'e2e-test@cipher.test');
    return NextResponse.json({ seeded: true, id });
  }

  // Path 2 — Phase 18-09 LearnedPattern + LearningEvent seeding.
  // Used by tests/e2e/insights-ess-ci.spec.ts to exercise CORE-ML-03
  // (sparse-recent CI < sparse-old CI) without running the cron pipeline.
  if (body.learnedPatterns || body.learningEvents) {
    const { prisma } = await import('@/lib/db');
    const created: { patterns: number; events: number } = { patterns: 0, events: 0 };

    for (const p of body.learnedPatterns ?? []) {
      await prisma.learnedPattern.upsert({
        where: {
          signal_class_pattern_key_cap_class_horizon_days: {
            signal_class: p.signal_class,
            pattern_key: p.pattern_key,
            cap_class: p.cap_class,
            horizon_days: p.horizon_days,
          },
        },
        create: {
          signal_class: p.signal_class,
          pattern_key: p.pattern_key,
          cap_class: p.cap_class,
          horizon_days: p.horizon_days,
          alpha: p.alpha,
          beta: p.beta,
          sample_size: p.sample_size,
          effective_sample_size: p.effective_sample_size,
          hits: p.hits ?? 0,
          alpha_30d: p.alpha_30d ?? p.alpha,
          beta_30d: p.beta_30d ?? p.beta,
          status: p.status,
          parent_alpha: p.parent_alpha ?? null,
          parent_beta: p.parent_beta ?? null,
          shrinkage_strength: p.shrinkage_strength ?? null,
        },
        update: {
          alpha: p.alpha,
          beta: p.beta,
          sample_size: p.sample_size,
          effective_sample_size: p.effective_sample_size,
          hits: p.hits ?? 0,
          alpha_30d: p.alpha_30d ?? p.alpha,
          beta_30d: p.beta_30d ?? p.beta,
          status: p.status,
          parent_alpha: p.parent_alpha ?? null,
          parent_beta: p.parent_beta ?? null,
          shrinkage_strength: p.shrinkage_strength ?? null,
        },
      });
      created.patterns += 1;
    }

    for (const e of body.learningEvents ?? []) {
      await prisma.learningEvent.create({
        data: {
          event_type: e.event_type,
          signal_class: e.signal_class,
          pattern_key: e.pattern_key,
          cap_class: e.cap_class,
          horizon_days: e.horizon_days,
          occurred_at: new Date(Date.now() - e.daysAgo * 24 * 60 * 60 * 1000),
          delta: e.delta ?? {},
          message: e.message ?? `e2e seed: ${e.event_type}`,
        },
      });
      created.events += 1;
    }

    return NextResponse.json({ seeded: true, ...created });
  }

  return NextResponse.json({ error: 'no recognized seed body' }, { status: 400 });
}

/**
 * DELETE /api/test/cleanup
 *
 * Two cleanup modes:
 *  1. No body (default) — deletes Report rows for the e2e test user (DB-QA-08).
 *  2. Body { capClass: 'TESTP18CI' } — deletes LearnedPattern + LearningEvent
 *     rows scoped to the supplied test cap_class (Phase 18-09 ESS-CI test).
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const gate = checkGates(req);
  if (gate) return gate;

  const { prisma } = await import('@/lib/db');

  let body: { capClass?: string } = {};
  try {
    body = await req.json();
  } catch {
    // No JSON body — fall through to legacy report cleanup.
  }

  if (body.capClass) {
    const events = await prisma.learningEvent.deleteMany({
      where: { cap_class: body.capClass },
    });
    const patterns = await prisma.learnedPattern.deleteMany({
      where: { cap_class: body.capClass },
    });
    return NextResponse.json({
      deleted: true,
      events: events.count,
      patterns: patterns.count,
    });
  }

  // Legacy: report rows for the e2e test user.
  const result = await prisma.report.deleteMany({
    where: { user_id: 'e2e-test@cipher.test' },
  });
  return NextResponse.json({ deleted: true, count: result.count });
}
