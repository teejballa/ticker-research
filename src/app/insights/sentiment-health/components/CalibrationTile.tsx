// Plan 20-B-03 — per-classifier temperature-calibration tile rendered on
// /insights/sentiment-health. Server component (no 'use client'). Queries
// prisma.temperatureCalibration directly via dynamic import of @/lib/db so
// missing DATABASE_URL degrades gracefully.

interface CalibrationRow {
  classifier_version: string;
  temperature: number;
  ece_pre_scaling: number;
  ece_post_scaling: number;
  brier_pre_scaling: number;
  brier_post_scaling: number;
  cv_ece_mean: number;
  cv_ece_std: number;
  n_validation_samples: number;
  n_fpb_samples: number;
  n_production_samples: number;
  status: string;
  computed_at: Date;
}

async function loadLatest(classifier_version: string): Promise<CalibrationRow | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { prisma } = await import('@/lib/db');
    const row = (await prisma.temperatureCalibration.findFirst({
      where: { classifier_version },
      orderBy: { computed_at: 'desc' },
    })) as CalibrationRow | null;
    return row;
  } catch {
    return null;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'ship-eligible':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'shadow':
      return 'text-amber-600 dark:text-amber-400';
    case 'degraded':
      return 'text-orange-600 dark:text-orange-400';
    case 'nonconvergent':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-zinc-500 dark:text-zinc-400';
  }
}

function relative(d: Date): string {
  const diffMs = Date.now() - new Date(d).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

interface Props {
  classifierVersion: string;
}

export async function CalibrationTile({ classifierVersion }: Props) {
  const row = await loadLatest(classifierVersion);
  if (!row) {
    return (
      <div
        className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900"
        data-testid={`calibration-tile-${classifierVersion}`}
      >
        <h3 className="font-semibold text-lg">{classifierVersion}</h3>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-2">
          No calibration data — run{' '}
          <code className="text-xs">scripts/calibrate-temperature.ts</code> or
          wait for the monthly cron.
        </p>
      </div>
    );
  }

  const ece_post_scaling = row.ece_post_scaling;
  const eceMax = 0.1;
  const preDot = Math.min(Math.max(row.ece_pre_scaling, 0), eceMax) / eceMax;
  const postDot = Math.min(Math.max(ece_post_scaling, 0), eceMax) / eceMax;

  return (
    <div
      className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900"
      data-testid={`calibration-tile-${classifierVersion}`}
    >
      <div className="flex items-baseline justify-between">
        <h3 className="font-semibold text-lg">{row.classifier_version}</h3>
        <span className={`text-xs uppercase font-bold ${statusColor(row.status)}`}>
          {row.status}
        </span>
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        T = {row.temperature.toFixed(4)} · {relative(row.computed_at)}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-zinc-500 dark:text-zinc-400">ECE pre</dt>
        <dd>{row.ece_pre_scaling.toFixed(4)}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">ECE post</dt>
        <dd className="font-semibold">{ece_post_scaling.toFixed(4)}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">Brier pre</dt>
        <dd>{row.brier_pre_scaling.toFixed(4)}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">Brier post</dt>
        <dd className="font-semibold">{row.brier_post_scaling.toFixed(4)}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">CV ECE mean</dt>
        <dd>{row.cv_ece_mean.toFixed(4)} ± {row.cv_ece_std.toFixed(4)}</dd>
        <dt className="text-zinc-500 dark:text-zinc-400">n (FPB + prod)</dt>
        <dd>
          {row.n_fpb_samples.toLocaleString()} + {row.n_production_samples.toLocaleString()}
        </dd>
      </dl>
      {/* Tiny inline reliability micro-chart — pre (orange) vs post (emerald) on a [0, 0.1] ECE axis. */}
      <svg
        className="mt-3"
        width="160"
        height="20"
        viewBox="0 0 160 20"
        aria-label="ECE pre vs post"
      >
        <line x1="0" y1="10" x2="160" y2="10" stroke="currentColor" strokeWidth="1" opacity="0.2" />
        <circle cx={preDot * 160} cy="10" r="4" fill="#fb923c" />
        <circle cx={postDot * 160} cy="10" r="4" fill="#10b981" />
      </svg>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
        ECE pre (orange) → post (emerald) on [0, 0.1] axis
      </p>
    </div>
  );
}
