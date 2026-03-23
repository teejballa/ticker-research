-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "analyzed_at" TIMESTAMPTZ NOT NULL,
    "market_sentiment" TEXT NOT NULL,
    "confidence_level" TEXT NOT NULL,
    "analysis" JSONB NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reports_user_id_analyzed_at_idx" ON "reports"("user_id", "analyzed_at" DESC);
