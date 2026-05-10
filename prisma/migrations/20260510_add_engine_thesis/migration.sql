-- Phase 19 close-out: persisted family-aggregate engine thesis.
-- New row only written when current aggregate materially diverges from prior.

CREATE TABLE "engine_theses" (
    "id" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "families" JSONB NOT NULL,
    "top_family" TEXT NOT NULL,
    "narrative" TEXT NOT NULL,
    "total_cells" INTEGER NOT NULL DEFAULT 0,
    "total_n" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "engine_theses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "engine_theses_recorded_at_idx" ON "engine_theses"("recorded_at" DESC);
