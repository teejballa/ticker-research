-- CreateTable
CREATE TABLE "diffusion_traces" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "cap_class" TEXT NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "window_cycles" INTEGER NOT NULL,
    "v_niche" DOUBLE PRECISION NOT NULL,
    "v_middle" DOUBLE PRECISION NOT NULL,
    "v_mainstream" DOUBLE PRECISION NOT NULL,
    "q_z" DOUBLE PRECISION NOT NULL,
    "qual_z" DOUBLE PRECISION NOT NULL,
    "niche_lead_cycles" INTEGER NOT NULL,
    "flow_pattern" TEXT NOT NULL,
    "source_snapshot_ids" TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diffusion_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learned_patterns" (
    "id" TEXT NOT NULL,
    "flow_pattern" TEXT NOT NULL,
    "cap_class" TEXT NOT NULL,
    "alpha" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "beta" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "sample_size" INTEGER NOT NULL DEFAULT 0,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "brier_in_sample" DOUBLE PRECISION,
    "brier_out_sample" DOUBLE PRECISION,
    "brier_null" DOUBLE PRECISION,
    "alpha_30d" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "beta_30d" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "drift_z" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'EXPLORATORY',
    "last_updated" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "learned_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_events" (
    "id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event_type" TEXT NOT NULL,
    "ticker" TEXT,
    "outcome_id" TEXT,
    "flow_pattern" TEXT,
    "cap_class" TEXT,
    "delta" JSONB NOT NULL,
    "message" TEXT NOT NULL,

    CONSTRAINT "learning_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistic_epochs" (
    "id" TEXT NOT NULL,
    "epoch" INTEGER NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coefficients" JSONB NOT NULL,
    "intercept" DOUBLE PRECISION NOT NULL,
    "brier_in" DOUBLE PRECISION NOT NULL,
    "brier_out" DOUBLE PRECISION NOT NULL,
    "sample_size" INTEGER NOT NULL,

    CONSTRAINT "logistic_epochs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "diffusion_traces_ticker_end_at_idx" ON "diffusion_traces"("ticker", "end_at" DESC);

-- CreateIndex
CREATE INDEX "diffusion_traces_flow_pattern_cap_class_end_at_idx" ON "diffusion_traces"("flow_pattern", "cap_class", "end_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "learned_patterns_flow_pattern_cap_class_key" ON "learned_patterns"("flow_pattern", "cap_class");

-- CreateIndex
CREATE INDEX "learning_events_occurred_at_idx" ON "learning_events"("occurred_at" DESC);

-- CreateIndex
CREATE INDEX "learning_events_outcome_id_idx" ON "learning_events"("outcome_id");

-- CreateIndex
CREATE INDEX "logistic_epochs_epoch_idx" ON "logistic_epochs"("epoch" DESC);
