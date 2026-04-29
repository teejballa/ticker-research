-- Phase 16 — Technical Analysis as a Learning Signal
-- Expand-then-contract: dual-class signal model + multi-horizon outcomes.
-- Single-transaction migration (Prisma applies each .sql file in a tx).
--
-- Pitfall 3 (RESEARCH §6 lines 911-916): the UPDATE that backfills pattern_key
-- from flow_pattern MUST run BEFORE the ALTER COLUMN ... SET NOT NULL on
-- pattern_key, or existing rows are wiped. Order is load-bearing — do not
-- reorder these statements.

-- ── learned_patterns: rename flow_pattern → pattern_key, add signal_class + horizon_days ──
ALTER TABLE "learned_patterns" ADD COLUMN "signal_class" TEXT NOT NULL DEFAULT 'diffusion';
ALTER TABLE "learned_patterns" ADD COLUMN "horizon_days" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "learned_patterns" ADD COLUMN "pattern_key" TEXT;

UPDATE "learned_patterns" SET "pattern_key" = "flow_pattern";

ALTER TABLE "learned_patterns" ALTER COLUMN "pattern_key" SET NOT NULL;
ALTER TABLE "learned_patterns" DROP CONSTRAINT IF EXISTS "learned_patterns_flow_pattern_cap_class_key";
ALTER TABLE "learned_patterns" DROP COLUMN "flow_pattern";

-- Index name explicitly shortened: Postgres NAMEDATALEN=63 silently truncates
-- the default Prisma name (67 chars). Use a stable explicit name instead.
CREATE UNIQUE INDEX "learned_patterns_lookup_key"
  ON "learned_patterns"("signal_class", "pattern_key", "cap_class", "horizon_days");

ALTER TABLE "learned_patterns" ALTER COLUMN "signal_class" DROP DEFAULT;
ALTER TABLE "learned_patterns" ALTER COLUMN "horizon_days" DROP DEFAULT;

-- ── learning_events: parallel rename flow_pattern → pattern_key, add signal_class + horizon_days ──
ALTER TABLE "learning_events" ADD COLUMN "signal_class" TEXT;
ALTER TABLE "learning_events" ADD COLUMN "pattern_key" TEXT;
ALTER TABLE "learning_events" ADD COLUMN "horizon_days" INTEGER;

UPDATE "learning_events" SET "pattern_key" = "flow_pattern", "signal_class" = 'diffusion', "horizon_days" = 7 WHERE "flow_pattern" IS NOT NULL;

ALTER TABLE "learning_events" DROP COLUMN "flow_pattern";

-- ── sentiment_snapshots: technical_data JSONB ──
ALTER TABLE "sentiment_snapshots" ADD COLUMN "technical_data" JSONB;

-- ── reports: technical_at_report JSONB ──
ALTER TABLE "reports" ADD COLUMN "technical_at_report" JSONB;
