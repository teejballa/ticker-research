-- Phase 20-A-05 — Cross-platform agreement threshold calibration
-- Additive only. No existing tables touched.
--
-- The aggregator reads the LATEST row by computed_at to drive the
-- low_agreement_warning threshold; the monthly cron writes a new row.

CREATE TABLE "agreement_calibrations" (
  "id"                     TEXT NOT NULL,
  "computed_at"            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "threshold"              DOUBLE PRECISION NOT NULL,
  "vol_uplift_vs_baseline" DOUBLE PRECISION NOT NULL,
  "vol_uplift_ci_low"      DOUBLE PRECISION NOT NULL,
  "vol_uplift_ci_high"     DOUBLE PRECISION NOT NULL,
  "training_window_days"   INTEGER NOT NULL,
  "n_examples"             INTEGER NOT NULL,
  "null_result"            BOOLEAN NOT NULL DEFAULT FALSE,
  "notes"                  TEXT,
  CONSTRAINT "agreement_calibrations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_agreement_calib_computed_at"
  ON "agreement_calibrations" ("computed_at" DESC);
