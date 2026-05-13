// Helpers extracted from route.ts — Next.js App Router only permits
// specific named exports (GET, POST, dynamic, etc.) from a route file.
// Files prefixed with `_` are ignored by the App Router.

import { prisma } from '@/lib/db';

const SOURCES = [
  'stocktwits',
  'reddit',
  'x',
  'news',
  'apewisdom',
  'firecrawl',
] as const;

const HORIZONS = [7, 30] as const;

export interface SourceHorizonTile {
  computed_at: string;
  ic_20d: number;
  icir_20d: number | null;
  ic_p_value_nw: number;
  ic_p_value_bh_fdr: number;
  significance: '' | '*' | '**' | '***';
  n_observations: number;
  cold_start: boolean;
  auto_down_weight: boolean;
  nw_lag: number;
}

export interface SentimentSourcesResponse {
  generated_at: string;
  sources: Array<{
    source_id: string;
    horizons: {
      '7d': SourceHorizonTile | null;
      '30d': SourceHorizonTile | null;
    };
  }>;
}

function significanceFromP(p: number): '' | '*' | '**' | '***' {
  if (p < 0.001) return '***';
  if (p < 0.01) return '**';
  if (p < 0.05) return '*';
  return '';
}

export async function fetchSentimentSourcesPayload(): Promise<SentimentSourcesResponse> {
  const sources: SentimentSourcesResponse['sources'] = [];

  for (const source_id of SOURCES) {
    const horizons: { '7d': SourceHorizonTile | null; '30d': SourceHorizonTile | null } = {
      '7d': null,
      '30d': null,
    };

    for (const horizon of HORIZONS) {
      const rows = await prisma.perSourceIC.findMany({
        where: { source_id, forward_horizon_days: horizon },
        orderBy: { computed_at: 'desc' },
        take: 2,
      });
      if (rows.length === 0) {
        horizons[`${horizon}d` as '7d' | '30d'] = null;
        continue;
      }
      const latest = rows[0];
      const prev = rows[1] ?? null;
      const auto_down_weight =
        latest.icir_20d != null &&
        latest.icir_20d < 0.3 &&
        prev != null &&
        prev.icir_20d != null &&
        prev.icir_20d < 0.3;

      horizons[`${horizon}d` as '7d' | '30d'] = {
        computed_at: latest.computed_at.toISOString(),
        ic_20d: latest.ic_20d,
        icir_20d: latest.icir_20d,
        ic_p_value_nw: latest.ic_p_value_nw,
        ic_p_value_bh_fdr: latest.ic_p_value_bh_fdr,
        significance: significanceFromP(latest.ic_p_value_bh_fdr),
        n_observations: latest.n_observations,
        cold_start: latest.n_observations < 20,
        auto_down_weight,
        nw_lag: latest.nw_lag,
      };
    }
    sources.push({ source_id, horizons });
  }

  return {
    generated_at: new Date().toISOString(),
    sources,
  };
}
