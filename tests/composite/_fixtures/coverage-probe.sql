-- Pitfall 5 coverage probe: measure current MIN_CLASSES_ACTIVE=2 coverage on live backfill.
-- Run against Neon: SELECT of tickers where ≥2 signal_class rows have patternStatus='ACTIVE'
-- at (cap_class, horizon_days=30) cell. Result MUST be ≥0.50 or D-07 ship gate cannot pass.
-- Note: assumes LearnedPattern.patternStatus column exists per P21.1 (verify before running).
WITH per_ticker_active AS (
  SELECT
    cap_class,
    COUNT(DISTINCT signal_class) AS active_class_count
  FROM learned_patterns
  WHERE horizon_days = 30
    AND regime = 'ALL'
    AND patternStatus = 'ACTIVE'
  GROUP BY cap_class
),
covered AS (
  SELECT cap_class FROM per_ticker_active WHERE active_class_count >= 2
)
SELECT
  (SELECT COUNT(*) FROM covered)::float / NULLIF((SELECT COUNT(DISTINCT cap_class) FROM learned_patterns WHERE horizon_days=30), 0) AS coverage_fraction;
