-- Phase 30 D-18 — provider_health_alerts table
CREATE TABLE "provider_health_alerts" (
  "id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "breached_at" TIMESTAMPTZ NOT NULL,
  "error_rate" DOUBLE PRECISION NOT NULL,
  "error_count" INTEGER NOT NULL,
  "total_count" INTEGER NOT NULL,
  "dominant_error_class" TEXT,
  "resolved_at" TIMESTAMPTZ,
  CONSTRAINT "provider_health_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_pha_provider_breached" ON "provider_health_alerts"("provider_id", "breached_at" DESC);
CREATE INDEX "idx_pha_resolved_at" ON "provider_health_alerts"("resolved_at");
