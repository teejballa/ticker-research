import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  sentimentMomentumProduct,
  sentimentVolumeInteraction,
  deltaSentiment3d,
  sentimentDispersion,
} from './joint-features';

describe('joint-features (plan 20-C-05)', () => {
  describe('sentimentMomentumProduct', () => {
    it('uses |returns_5d| while preserving sign of sentiment', () => {
      expect(sentimentMomentumProduct(0.5, -0.02)).toBeCloseTo(0.01, 9);
    });
    it('returns 0 when sentiment is 0, regardless of return magnitude', () => {
      expect(sentimentMomentumProduct(0, 0.1)).toBe(0);
    });
  });

  describe('sentimentVolumeInteraction', () => {
    it('preserves sign — negative sentiment × positive z = negative', () => {
      expect(sentimentVolumeInteraction(-0.5, 3.0)).toBeCloseTo(-1.5, 9);
    });
  });

  describe('deltaSentiment3d', () => {
    it('returns positive when sentiment is rising', () => {
      expect(deltaSentiment3d(0.6, 0.2)).toBeCloseTo(0.4, 9);
    });
    it('returns negative when sentiment is falling (sign-correct)', () => {
      expect(deltaSentiment3d(0.2, 0.6)).toBeCloseTo(-0.4, 9);
    });
  });

  describe('sentimentDispersion', () => {
    it('returns 0 for empty input (empty guard)', () => {
      expect(sentimentDispersion([])).toBe(0);
    });
    it('returns 0 for single-source input (length < 2 guard)', () => {
      expect(sentimentDispersion([0.5])).toBe(0);
    });
    it('matches population std for [0.2, 0.4, 0.6, 0.8] to 1e-9', () => {
      // mean = 0.5
      // sq deviations: 0.09, 0.01, 0.01, 0.09 → sum 0.20 → /4 = 0.05 → sqrt = 0.22360679...
      const expected = Math.sqrt(0.05);
      expect(sentimentDispersion([0.2, 0.4, 0.6, 0.8])).toBeCloseTo(expected, 9);
    });
  });

  describe('purity', () => {
    it('module source has no DB/time/random references', () => {
      // Static guard — the implementation file MUST NOT import prisma, db,
      // call Date.now, or Math.random. This test runs `import.meta.url`-style
      // discovery against the file path to make the assertion explicit.
      // Implementation: read the file via fs at test time.
      const src = fs.readFileSync(
        path.resolve(__dirname, 'joint-features.ts'),
        'utf8',
      );
      expect(src).not.toMatch(/from\s+['"]@\/lib\/db['"]/);
      expect(src).not.toMatch(/from\s+['"]prisma['"]/);
      expect(src).not.toMatch(/Date\.now\(/);
      expect(src).not.toMatch(/Math\.random\(/);
    });
  });
});
