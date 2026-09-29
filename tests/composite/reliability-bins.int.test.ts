import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Wave 3 Task 3 (Phase 24, REASON-04) — /api/insights/composite-calibration
// read-latest endpoint contract.
//
// A live HTTP round-trip requires a running dev server + a seeded snapshot in
// Neon (cron output). Since the plan's Task 5 acceptance allows "after cron
// seed OR manual snapshot insert" — i.e. it's environment-dependent — we
// verify the endpoint contract structurally: file exists, exports GET,
// declares the ZOD enum guards for regime + cap_class (T-24-03-02), returns
// the expected shape including reliability_bins + classifier_version, and
// queries the CompositeCalibrationSnapshot table with the composite classifier
// version default. This proves the shape the /insights/calibration UI reads.
describe('/api/insights/composite-calibration (REASON-04)', () => {
  const endpointPath = resolve(
    __dirname,
    '../../src/app/api/insights/composite-calibration/route.ts',
  );

  it('endpoint file exists', () => {
    expect(existsSync(endpointPath)).toBe(true);
  });

  const source = readFileSync(endpointPath, 'utf8');

  it('exports GET handler (App Router route)', () => {
    expect(source).toMatch(/export\s+async\s+function\s+GET\s*\(/);
  });

  it('validates regime + cap_class via Zod enum (T-24-03-02 tampering mitigation)', () => {
    // Enum values may span multiple lines — collapse whitespace before matching.
    const flat = source.replace(/\s+/g, ' ');
    expect(flat).toMatch(/\.enum\(\[[^\]]*'ALL'[^\]]*'bull-low-vol'[^\]]*'bull-high-vol'[^\]]*'bear-low-vol'[^\]]*'bear-high-vol'/);
    expect(flat).toMatch(/\.enum\(\[[^\]]*'large_cap'[^\]]*'mid_cap'[^\]]*'small_cap'/);
    expect(source).toMatch(/safeParse/);
  });

  it("defaults classifier_version to 'cipher-composite-v1'", () => {
    expect(source).toMatch(/classifier_version:.*default\(['"]cipher-composite-v1['"]\)/);
  });

  it('reads latest snapshot via prisma.compositeCalibrationSnapshot.findFirst', () => {
    expect(source).toMatch(/prisma\.compositeCalibrationSnapshot\.findFirst/);
    expect(source).toMatch(/orderBy:\s*{\s*computed_at:\s*['"]desc['"]/);
  });

  it('returns reliability_bins + classifier_version in the 200 response', () => {
    // Response literal must expose both fields so /insights/calibration UI can render the composite card.
    expect(source).toMatch(/classifier_version:\s*snapshot\.classifier_version/);
    expect(source).toMatch(/reliability_bins:\s*snapshot\.reliability_bins/);
  });

  it('returns 404 when no snapshot exists (contract for pre-cron cold-start)', () => {
    expect(source).toMatch(/status:\s*404/);
  });

  it('returns 400 on invalid query params (contract for T-24-03-02)', () => {
    expect(source).toMatch(/status:\s*400/);
  });
});
