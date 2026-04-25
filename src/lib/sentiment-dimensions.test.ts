import { computeSentimentDimensions } from './sentiment-dimensions';
import type { CommunityHighlight } from './types';

const makeHighlight = (
  type: 'mainstream' | 'middle' | 'niche',
  sentiment: 'bullish' | 'bearish' | 'neutral',
  engagement: 'high' | 'medium' | 'low',
): CommunityHighlight => ({
  community_name: 'test',
  community_type: type,
  audience: 'test',
  standout_quote: 'test',
  theme: 'test',
  sentiment,
  engagement_signal: engagement,
});

describe('computeSentimentDimensions', () => {
  it('uses stocktwits bull pct for direction when no highlights', () => {
    const result = computeSentimentDimensions([], { bull: 70, bear: 30, messageCount: 100 });
    expect(result.direction).toBeCloseTo(0.7);
  });

  it('computes diffusion gap as niche / mainstream', () => {
    const highlights = [
      makeHighlight('niche', 'bullish', 'high'),   // weight 3
      makeHighlight('niche', 'bullish', 'high'),   // weight 3 → niche=6
      makeHighlight('mainstream', 'bullish', 'low'), // weight 1 → mainstream=1
    ];
    const result = computeSentimentDimensions(highlights, null);
    expect(result.diffusion_gap).toBe(6);
  });

  it('returns diffusion_gap of 1 when no highlights and no stocktwits', () => {
    const result = computeSentimentDimensions([], null);
    expect(result.diffusion_gap).toBe(1);
  });

  it('returns diffusion_gap of 4 when niche active but no mainstream', () => {
    const result = computeSentimentDimensions(
      [makeHighlight('niche', 'bullish', 'low')],
      null,
    );
    expect(result.diffusion_gap).toBe(4);
  });

  it('quality reflects fraction of engagement from niche+middle', () => {
    const highlights = [
      makeHighlight('niche', 'bullish', 'medium'),     // weight 2
      makeHighlight('mainstream', 'bullish', 'medium'), // weight 2
    ];
    const result = computeSentimentDimensions(highlights, null);
    // quality = niche(2) + middle(0) / total(4) = 0.5
    expect(result.quality).toBeCloseTo(0.5);
  });
});
