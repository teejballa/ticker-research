-- Plan 20-A-03 — DecayCalibration history (append-only).
-- Persists every tune-decay run. NEVER updated — a re-tune writes a new row.
-- (source_class, computed_at) gives the time series of λ for each class.
-- model_version on this row equals the model_version stamped on the
-- SentimentObservation backfill rows that this calibration produced.

CREATE TABLE "decay_calibrations" (
    "id"                       TEXT NOT NULL,
    "computed_at"              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source_class"             TEXT NOT NULL,
    "lambda_per_day"           DOUBLE PRECISION NOT NULL,
    "half_life_days"           DOUBLE PRECISION NOT NULL,
    "icir_uplift_vs_no_decay"  DOUBLE PRECISION NOT NULL,
    "training_window_days"     INTEGER NOT NULL,
    "n_observations"           INTEGER NOT NULL,
    "model_version"            TEXT NOT NULL,

    CONSTRAINT "decay_calibrations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_decaycal_class_at" ON "decay_calibrations" ("source_class", "computed_at" DESC);
