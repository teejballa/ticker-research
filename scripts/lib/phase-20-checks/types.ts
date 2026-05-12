// scripts/lib/phase-20-checks/types.ts
//
// Phase 20 / Plan 20-Z-06 — shared types for the composite done-gate.
//
// Three-valued result. The 'pending' state is mandatory: it distinguishes
// "the upstream artifact has not landed yet" (pending) from "the artifact
// landed but the criterion is violated" (fail). The script returns exit
// code 1 only when at least one check is `fail`, and exit 2 when no checks
// fail but at least one is pending — this is the post-commit state on day 1.

export type CheckStatus = 'pass' | 'fail' | 'pending';

export type CheckBranch = 'sentiment' | 'calibration' | 'report' | 'hygiene';

export type CheckResult = {
  /** Stable identifier (kebab-case) used in stdout and in test assertions. */
  name: string;
  /** Verbatim DoD label from CONTEXT.md (lines 145-163), printed in stdout. */
  dod_label: string;
  /** DoD condition number (2-16); 1 is the rollup itself, not a sub-check. */
  blocker_for: number;
  /** Branch grouping for stdout sectioning. */
  branch: CheckBranch;
  /** Result. */
  status: CheckStatus;
  /** Human-readable evidence string (number, file path, query result, …). */
  evidence: string;
};

/**
 * Dependency-injection surface so every sub-check is unit-testable
 * without spawning Prisma/Neon/the real fs/the real shell. The script
 * entrypoint wires real implementations; tests pass mocks.
 */
export type CheckDeps = {
  prisma: {
    sentimentObservation?: {
      count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
    };
    sourceTier?: {
      findMany: (args?: { where?: Record<string, unknown> }) => Promise<Array<Record<string, unknown>>>;
    };
    providerCallLog?: {
      findMany: (
        args?: { where?: Record<string, unknown>; select?: Record<string, boolean> },
      ) => Promise<Array<{ started_at: Date }>>;
    };
    sourceIcir?: {
      groupBy: (args: Record<string, unknown>) => Promise<Array<{ source: string; _count: { _all: number } }>>;
    };
    // Add per-check-needed shapes here as upstream plans land.
  };
  fs: {
    readFileSync: (path: string) => string;
    existsSync: (path: string) => boolean;
  };
  exec: (cmd: string) => { exitCode: number; stdout: string; stderr: string };
  featuresPath: string;       // src/lib/features.ts
  modelCardsGlob: string;     // MODEL-CARD-*.md under repoRoot
  metricsDir: string;         // metrics/ for JSON outputs from upstream plans
  repoRoot: string;
};

export type CheckFn = (deps: CheckDeps) => Promise<CheckResult>;
