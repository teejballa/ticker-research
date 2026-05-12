-- Plan 20-A-04 — Per-ticker author-share Q1 calibration (additive, insert-only).
-- Weekly cron computes 25th percentile of trailing-90d author-share distribution.
-- INSERT-only by design (Cookson & Engelberg 2020 relative-baseline approach).
-- Old rows preserved for 30d for PIT-replay; Phase 27 cleanup will retire them.

CREATE TABLE "author_share_calibrations" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "q1_author_share_pct" DOUBLE PRECISION NOT NULL,
    "n_observations" INTEGER NOT NULL,
    "training_window_days" INTEGER NOT NULL DEFAULT 90,

    CONSTRAINT "author_share_calibrations_pkey" PRIMARY KEY ("id")
);

-- (ticker, computed_at DESC) — primary lookup is "latest threshold for ticker".
CREATE INDEX "idx_authcal_ticker_computed_at" ON "author_share_calibrations" ("ticker", "computed_at" DESC);
