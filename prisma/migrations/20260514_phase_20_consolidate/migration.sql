-- Phase 20 consolidated migration
-- Captures the 9 Phase-20 Prisma models that were added to schema.prisma
-- across Z-01, B-01, Z-03, C-01, C-03, C-04, B-03, B-04, C-06 without
-- their own dedicated migration directories. Adds them in dependency-safe
-- order with idempotent IF NOT EXISTS guards so re-runs are safe.
--
-- All 9 tables are PIT-disciplined (S2): joins must reference computed_at
-- or fetched_at, never published_at (enforced by 20-Z-07 lookahead-bias
-- regression).

-- ─── Plan 20-Z-01 — SentimentObservation PIT feature store ────────────────
CREATE TABLE IF NOT EXISTS "sentiment_observations" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ,
    "raw_body_hash" TEXT NOT NULL,
    "classifier_version" TEXT NOT NULL,
    "classifier_score" DOUBLE PRECISION,
    "decay_weight" DOUBLE PRECISION,
    "author_id" TEXT NOT NULL,
    "author_features_snapshot" JSONB NOT NULL,
    "model_version" TEXT NOT NULL,
    "aspects" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "sentiment_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sentobs_ticker_msg_modelver_uq"
    ON "sentiment_observations" ("ticker", "message_id", "model_version");

CREATE INDEX IF NOT EXISTS "idx_sentobs_ticker_fetched_at"
    ON "sentiment_observations" ("ticker", "fetched_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_sentobs_ticker_modelver_fetched_at"
    ON "sentiment_observations" ("ticker", "model_version", "fetched_at" DESC);

-- ─── Plan 20-Z-03 — ProviderCallLog (telemetry) ──────────────────────────
CREATE TABLE IF NOT EXISTS "provider_call_logs" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "ticker" TEXT,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "http_status" INTEGER,
    "error_class" TEXT,
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "cache_hit" BOOLEAN NOT NULL DEFAULT false,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "request_size_bytes" INTEGER,
    "response_size_bytes" INTEGER,
    "retry_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "provider_call_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_pcl_provider_started"
    ON "provider_call_logs" ("provider_id", "started_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_pcl_ticker_started"
    ON "provider_call_logs" ("ticker", "started_at" DESC);

-- ─── Plan 20-C-01 — PerSourceIC (rolling ICIR + Newey-West HAC + BH-FDR) ─
CREATE TABLE IF NOT EXISTS "per_source_ic" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "forward_horizon_days" INTEGER NOT NULL,
    "ic_20d" DOUBLE PRECISION NOT NULL,
    "icir_20d" DOUBLE PRECISION,
    "ic_se_nw" DOUBLE PRECISION NOT NULL,
    "ic_p_value_nw" DOUBLE PRECISION NOT NULL,
    "ic_p_value_bh_fdr" DOUBLE PRECISION NOT NULL,
    "n_observations" INTEGER NOT NULL,
    "nw_lag" INTEGER NOT NULL,
    "model_version" TEXT NOT NULL,

    CONSTRAINT "per_source_ic_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "psic_src_date_hor_ver_uq"
    ON "per_source_ic" ("source_id", "computed_at", "forward_horizon_days", "model_version");

CREATE INDEX IF NOT EXISTS "idx_psic_src_hor_computed_at"
    ON "per_source_ic" ("source_id", "forward_horizon_days", "computed_at" DESC);

-- ─── Plan 20-C-03 — Cresci-2019 bot filter ────────────────────────────────
CREATE TABLE IF NOT EXISTS "bot_filter_flags" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account_age_days" INTEGER,
    "max_text_cosine_similarity" DOUBLE PRECISION NOT NULL,
    "pump_phrase_density" DOUBLE PRECISION NOT NULL,
    "hashtag_count_max" INTEGER NOT NULL,
    "is_bot_flagged" BOOLEAN NOT NULL,
    "bot_reason" TEXT NOT NULL,

    CONSTRAINT "bot_filter_flags_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_botflag_author_computed_at"
    ON "bot_filter_flags" ("author_id", "computed_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_botflag_ticker_computed_at"
    ON "bot_filter_flags" ("ticker", "computed_at" DESC);

-- ─── Plan 20-C-03 — MinHash + LSH coordinated-posting clusters ───────────
CREATE TABLE IF NOT EXISTS "coordination_clusters" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "window_start" TIMESTAMPTZ NOT NULL,
    "window_end" TIMESTAMPTZ NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "n_messages" INTEGER NOT NULL,
    "similarity_threshold" DOUBLE PRECISION NOT NULL,
    "cluster_size" INTEGER NOT NULL,
    "is_flagged" BOOLEAN NOT NULL,
    "member_ids" JSONB NOT NULL,

    CONSTRAINT "coordination_clusters_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_coordcluster_ticker_window"
    ON "coordination_clusters" ("ticker", "window_start" DESC);

-- ─── Plan 20-B-04 — SourceTier (data-driven softmaxWithCaps weights) ─────
CREATE TABLE IF NOT EXISTS "source_tiers" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mean_ic_90d" DOUBLE PRECISION,
    "weight" DOUBLE PRECISION NOT NULL,
    "n_observations" INTEGER NOT NULL,
    "validation_window_days" INTEGER NOT NULL,
    "model_version" TEXT NOT NULL,

    CONSTRAINT "source_tiers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_sourcetier_source_at"
    ON "source_tiers" ("source_id", "computed_at" DESC);

-- ─── Plan 20-C-04 — Pump-and-dump ManipulationWarning ─────────────────────
CREATE TABLE IF NOT EXISTS "manipulation_warnings" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mention_z" DOUBLE PRECISION,
    "bull_pct" DOUBLE PRECISION NOT NULL,
    "gini" DOUBLE PRECISION,
    "mean_account_age_days" DOUBLE PRECISION,
    "cap_class" TEXT NOT NULL,
    "is_warning_fired" BOOLEAN NOT NULL,
    "matched_rules" TEXT[] NOT NULL,
    "rule_version" TEXT NOT NULL,

    CONSTRAINT "manipulation_warnings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_manipwarn_ticker_computed_at"
    ON "manipulation_warnings" ("ticker", "computed_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_manipwarn_fired_computed_at"
    ON "manipulation_warnings" ("is_warning_fired", "computed_at" DESC);

-- ─── Plan 20-B-03 — Temperature scaling (Guo et al. 2017) ─────────────────
CREATE TABLE IF NOT EXISTS "temperature_calibrations" (
    "id" TEXT NOT NULL,
    "classifier_version" TEXT NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temperature" DOUBLE PRECISION NOT NULL,
    "ece_pre_scaling" DOUBLE PRECISION NOT NULL,
    "ece_post_scaling" DOUBLE PRECISION NOT NULL,
    "brier_pre_scaling" DOUBLE PRECISION NOT NULL,
    "brier_post_scaling" DOUBLE PRECISION NOT NULL,
    "cv_ece_mean" DOUBLE PRECISION NOT NULL,
    "cv_ece_std" DOUBLE PRECISION NOT NULL,
    "n_validation_samples" INTEGER NOT NULL,
    "n_fpb_samples" INTEGER NOT NULL,
    "n_production_samples" INTEGER NOT NULL,
    "validation_window_days" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "temperature_calibrations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TemperatureCalibration_classifier_version_computed_at_idx"
    ON "temperature_calibrations" ("classifier_version", "computed_at");

-- ─── Plan 20-C-06 — Fairness audit report (cap_class + sector stratified) ─
CREATE TABLE IF NOT EXISTS "fairness_audit_reports" (
    "id" TEXT NOT NULL,
    "classifier_version" TEXT NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "report_path" TEXT NOT NULL,
    "json_payload" JSONB NOT NULL,
    "n_predictions_total" INTEGER NOT NULL,
    "n_segments_evaluated" INTEGER NOT NULL,
    "n_limitations_flagged" INTEGER NOT NULL,
    "audit_window_days" INTEGER NOT NULL,
    "source_table" TEXT NOT NULL,

    CONSTRAINT "fairness_audit_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_fairness_audit_classifier_at"
    ON "fairness_audit_reports" ("classifier_version", "computed_at" DESC);
