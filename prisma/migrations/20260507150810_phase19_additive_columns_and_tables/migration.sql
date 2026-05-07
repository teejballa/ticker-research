-- Phase 19-Z-02 — consolidated additive migration (D-46 / D-47 / D-48)
-- Bundles all 9 LearnedPattern column-adds + 4 SentimentSnapshot column-adds
-- + 3 new tables (CommunityChatter, ShadowComparison, RollbackLog) into a
-- single Prisma migration per RESEARCH §"Schema Migration Ordering".
--
-- All ADDs are nullable with sensible defaults — Postgres skips full table
-- rewrite (metadata-only DDL on Postgres 11+). Existing rows untouched.
-- No backfill required at migration time.

-- AlterTable
ALTER TABLE "learned_patterns" ADD COLUMN     "conformal_high" DOUBLE PRECISION,
ADD COLUMN     "conformal_low" DOUBLE PRECISION,
ADD COLUMN     "dsr" DOUBLE PRECISION,
ADD COLUMN     "ic_decay_flag" BOOLEAN DEFAULT false,
ADD COLUMN     "parent_alpha" DOUBLE PRECISION,
ADD COLUMN     "parent_beta" DOUBLE PRECISION,
ADD COLUMN     "pbo" DOUBLE PRECISION,
ADD COLUMN     "rolling_ic_20d" DOUBLE PRECISION,
ADD COLUMN     "shrinkage_strength" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "sentiment_snapshots" ADD COLUMN     "citations_v2" JSONB,
ADD COLUMN     "community_aggregated" JSONB,
ADD COLUMN     "finsentllm_score" DOUBLE PRECISION,
ADD COLUMN     "model_agreement" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "CommunityChatter" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "raw_text" TEXT,
    "finsentllm_score" DOUBLE PRECISION,
    "reputation_weight" DOUBLE PRECISION DEFAULT 1.0,
    "scraped_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityChatter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShadowComparison" (
    "id" TEXT NOT NULL,
    "path_name" TEXT NOT NULL,
    "ticker" TEXT,
    "old_output_json" JSONB,
    "new_output_json" JSONB,
    "old_latency_ms" INTEGER,
    "new_latency_ms" INTEGER,
    "old_cost_usd" DOUBLE PRECISION,
    "new_cost_usd" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShadowComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RollbackLog" (
    "id" TEXT NOT NULL,
    "feature_flag" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RollbackLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunityChatter_ticker_scraped_at_idx" ON "CommunityChatter"("ticker", "scraped_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CommunityChatter_ticker_source_url_scraped_at_key" ON "CommunityChatter"("ticker", "source", "url", "scraped_at");

-- CreateIndex
CREATE INDEX "ShadowComparison_path_name_created_at_idx" ON "ShadowComparison"("path_name", "created_at" DESC);

-- CreateIndex
CREATE INDEX "RollbackLog_feature_flag_created_at_idx" ON "RollbackLog"("feature_flag", "created_at" DESC);
