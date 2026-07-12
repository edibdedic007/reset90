-- CreateTable
CREATE TABLE "weekly_reviews" (
    "id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "imported_payload_id" UUID NOT NULL,
    "week_number" INTEGER NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "wins_json" JSONB NOT NULL,
    "blockers_json" JSONB NOT NULL,
    "patterns_json" JSONB NOT NULL,
    "recommended_changes_json" JSONB NOT NULL,
    "next_week_commitments_json" JSONB NOT NULL,
    "metrics_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "weekly_reviews_week_number_check" CHECK ("week_number" BETWEEN 1 AND 13),
    CONSTRAINT "weekly_reviews_date_range_check" CHECK ("date_from" <= "date_to")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reviews_cycle_id_week_number_key" ON "weekly_reviews"("cycle_id", "week_number");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reviews_imported_payload_id_key" ON "weekly_reviews"("imported_payload_id");

-- AddForeignKey
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_cycle_id_fkey"
FOREIGN KEY ("cycle_id") REFERENCES "reset_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reviews" ADD CONSTRAINT "weekly_reviews_imported_payload_id_fkey"
FOREIGN KEY ("imported_payload_id") REFERENCES "imported_payloads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
