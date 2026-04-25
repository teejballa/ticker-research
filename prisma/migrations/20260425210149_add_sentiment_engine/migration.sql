-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "community_data" JSONB,
ADD COLUMN     "price_at_report" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "sentiment_snapshots" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "scanned_at" TIMESTAMPTZ NOT NULL,
    "price_at_scan" DOUBLE PRECISION NOT NULL,
    "community_data" JSONB NOT NULL,

    CONSTRAINT "sentiment_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_outcomes" (
    "id" TEXT NOT NULL,
    "report_id" TEXT,
    "snapshot_id" TEXT,
    "days_after" INTEGER NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "pct_change" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "price_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sentiment_snapshots_ticker_scanned_at_idx" ON "sentiment_snapshots"("ticker", "scanned_at" DESC);

-- AddForeignKey
ALTER TABLE "price_outcomes" ADD CONSTRAINT "price_outcomes_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_outcomes" ADD CONSTRAINT "price_outcomes_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "sentiment_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
