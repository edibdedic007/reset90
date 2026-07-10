-- CreateTable
CREATE TABLE "recovery_events" (
    "id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "day_log_id" UUID NOT NULL,
    "selected_action_ids" JSONB NOT NULL DEFAULT '[]',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "credit_consumed_at" TIMESTAMP(3),

    CONSTRAINT "recovery_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recovery_events_day_log_id_key" ON "recovery_events"("day_log_id");

-- CreateIndex
CREATE INDEX "recovery_events_cycle_id_credit_consumed_at_idx" ON "recovery_events"("cycle_id", "credit_consumed_at");

-- AddForeignKey
ALTER TABLE "recovery_events" ADD CONSTRAINT "recovery_events_cycle_id_fkey"
FOREIGN KEY ("cycle_id") REFERENCES "reset_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_events" ADD CONSTRAINT "recovery_events_day_log_id_fkey"
FOREIGN KEY ("day_log_id") REFERENCES "day_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
