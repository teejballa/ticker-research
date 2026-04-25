// src/lib/sentiment-dimensions.ts
import type { CommunityHighlight } from './types';

export interface SentimentDimensions {
  direction: number;       // 0–1: fraction bullish (0.5 = neutral)
  quantity: number;        // total cross-community engagement score
  quality: number;         // 0–1: fraction of engagement from niche+middle vs mainstream
  diffusion_gap: number;   // niche engagement / mainstream engagement (>1 = early signal)
  tier_breakdown: {
    mainstream: number;
    middle: number;
    niche: number;
  };
  computed_at: string;
}

const ENGAGEMENT_WEIGHTS: Record<string, number> = { high: 3, medium: 2, low: 1 };
const SENTIMENT_SCORES: Record<string, number> = { bullish: 1, neutral: 0.5, bearish: 0 };

export function computeSentimentDimensions(
  highlights: CommunityHighlight[],
  stocktwits: { bull: number; bear: number; messageCount: number } | null,
): SentimentDimensions {
  const tierEngagement = { mainstream: 0, middle: 0, niche: 0 };
  let weightedSentimentSum = 0;
  let totalWeight = 0;

  for (const h of highlights) {
    const weight = ENGAGEMENT_WEIGHTS[h.engagement_signal] ?? 1;
    const tier = h.community_type as keyof typeof tierEngagement;
    if (tier in tierEngagement) tierEngagement[tier] += weight;
    weightedSentimentSum += (SENTIMENT_SCORES[h.sentiment] ?? 0.5) * weight;
    totalWeight += weight;
  }

  let direction = 0.5;
  if (stocktwits && stocktwits.messageCount > 0) {
    const stBull = stocktwits.bull / 100;
    const stWeight = Math.min(stocktwits.messageCount / 50, 3);
    direction = totalWeight > 0
      ? (weightedSentimentSum + stBull * stWeight) / (totalWeight + stWeight)
      : stBull;
  } else if (totalWeight > 0) {
    direction = weightedSentimentSum / totalWeight;
  }

  const quantity = tierEngagement.mainstream + tierEngagement.middle + tierEngagement.niche +
    (stocktwits ? Math.min(stocktwits.messageCount / 10, 20) : 0);

  const analyticalEngagement = tierEngagement.niche + tierEngagement.middle;
  const quality = quantity > 0 ? analyticalEngagement / quantity : 0.5;

  const diffusion_gap = tierEngagement.mainstream > 0
    ? tierEngagement.niche / tierEngagement.mainstream
    : tierEngagement.niche > 0 ? 4 : 1;

  return {
    direction: Math.max(0, Math.min(1, direction)),
    quantity,
    quality: Math.max(0, Math.min(1, quality)),
    diffusion_gap,
    tier_breakdown: { ...tierEngagement },
    computed_at: new Date().toISOString(),
  };
}
