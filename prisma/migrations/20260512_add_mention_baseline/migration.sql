-- Phase 20-A-02 — robust mention-volume baseline (median + MAD)
-- Per-ticker rolling 90d daily-mention-count baseline used to compute
--   mention_z = (today_count - median) / max(MAD, EPSILON)
-- Stratified by cap_class because small-caps spike easier than large-caps;
-- per-class Z_thresh is calibrated in HYPERPARAMETERS.md by Plan 20-A-02.
--
-- Daily counts are derived from SentimentObservation rows GROUPED BY
-- (ticker, source_class, date(fetched_at)) — joins on fetched_at NEVER
-- the upstream-claimed-timestamp (PIT discipline per S2 / 20-Z-07).
-- mention_count_mad is already 1.4826-scaled (normal-equivalent σ).

CREATE TABLE "mention_baselines" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "cap_class" TEXT NOT NULL,
    "source_class" TEXT NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "window_start" TIMESTAMPTZ NOT NULL,
    "window_end" TIMESTAMPTZ NOT NULL,
    "mention_count_median" DOUBLE PRECISION NOT NULL,
    "mention_count_mad" DOUBLE PRECISION NOT NULL,
    "n_observations" INTEGER NOT NULL,

    CONSTRAINT "mention_baselines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_mention_baseline_ticker_src_computed"
    ON "mention_baselines" ("ticker", "source_class", "computed_at" DESC);
