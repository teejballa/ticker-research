-- Phase 17 — Institutional & Insider Intelligence
-- Additive migration: 4 nullable JSONB columns on existing tables.
-- ADD COLUMN ... JSONB (nullable) on Postgres 11+ is metadata-only — no row rewrite.
-- LearnedPattern.signal_class accepts the two new values ('insider', 'institutional')
-- without column changes (D-14).

ALTER TABLE "sentiment_snapshots" ADD COLUMN "insider_data" JSONB;
ALTER TABLE "sentiment_snapshots" ADD COLUMN "institutional_data" JSONB;
ALTER TABLE "reports" ADD COLUMN "insider_at_report" JSONB;
ALTER TABLE "reports" ADD COLUMN "institutional_at_report" JSONB;
