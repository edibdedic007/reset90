-- CreateTable
CREATE TABLE "daily_reflections" (
    "id" UUID NOT NULL,
    "day_log_id" UUID NOT NULL,
    "imported_payload_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "what_happened" TEXT,
    "what_worked" TEXT,
    "what_blocked_me" TEXT,
    "tomorrow_adjustment" TEXT,
    "self_criticism_note" TEXT,
    "day_status_recommendation" "day_status",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_reflections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_reflections_day_log_id_key" ON "daily_reflections"("day_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reflections_imported_payload_id_key" ON "daily_reflections"("imported_payload_id");

-- AddForeignKey
ALTER TABLE "daily_reflections" ADD CONSTRAINT "daily_reflections_day_log_id_fkey"
FOREIGN KEY ("day_log_id") REFERENCES "day_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reflections" ADD CONSTRAINT "daily_reflections_imported_payload_id_fkey"
FOREIGN KEY ("imported_payload_id") REFERENCES "imported_payloads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
