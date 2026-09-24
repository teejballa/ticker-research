-- Pitfall 5 coverage probe: measure current MIN_CLASSES_ACTIVE=2 coverage on live backfill.
-- Run against Neon: fraction of cap_class cells where ≥2 distinct signal_class rows have status='ACTIVE'
-- at horizon_days=30, regime='ALL'. Result MUST be ≥0.50 or D-07 ship gate cannot pass.
-- Note: LearnedPattern.status column (not patternStatus) per prisma schema — P21.1 5-gate values land in `status`.
WITH per_cap_active AS (
  SELECT
    cap_class,
    COUNT(DISTINCT signal_class) AS active_class_count
  FROM learned_patterns
  WHERE horizon_days = 30
    AND regime = 'ALL'
    AND status = 'ACTIVE'
  GROUP BY cap_class
),
covered AS (
  SELECT cap_class FROM per_cap_active WHERE active_class_count >= 2
)
SELECT
  (SELECT COUNT(*) FROM covered)::float
  / NULLIF((SELECT COUNT(DISTINCT cap_class) FROM learned_patterns WHERE horizon_days = 30), 0)
  AS coverage_fraction;
