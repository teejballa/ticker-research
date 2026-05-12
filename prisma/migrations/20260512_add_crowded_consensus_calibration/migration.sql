-- Plan 20-A-01 — CrowdedConsensusCalibration table (GME-100% fix)
-- Additive only: new table + composite index. Non-blocking; no column drops.

CREATE TABLE "crowded_consensus_calibrations" (
    "id" TEXT NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model_version" TEXT NOT NULL,
    "H_thresh" DOUBLE PRECISION NOT NULL,
    "V_thresh" DOUBLE PRECISION NOT NULL,
    "D_thresh" DOUBLE PRECISION NOT NULL,
    "brier_skill_score" DOUBLE PRECISION NOT NULL,
    "training_window_days" INTEGER NOT NULL,
    "n_examples" INTEGER NOT NULL,
    "grid_search_log" JSONB NOT NULL,
    "notes" TEXT,

    CONSTRAINT "crowded_consensus_calibrations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_cc_calib_computed_at" ON "crowded_consensus_calibrations"("computed_at" DESC, "model_version");
