-- CreateEnum
CREATE TYPE "checkin_kind" AS ENUM ('MORNING', 'MIDDAY', 'EVENING', 'MANUAL');

-- CreateTable
CREATE TABLE "checkins" (
    "id" UUID NOT NULL,
    "day_log_id" UUID NOT NULL,
    "kind" "checkin_kind" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "energy_level" "energy_level" NOT NULL,
    "mood_score" INTEGER NOT NULL,
    "fog_score" INTEGER NOT NULL,
    "loneliness_score" INTEGER NOT NULL,
    "self_criticism_score" INTEGER NOT NULL,
    "digital_control_score" INTEGER NOT NULL,
    "learning_resistance_score" INTEGER NOT NULL,
    "body_relationship_score" INTEGER NOT NULL,
    "work_confidence_score" INTEGER NOT NULL,
    "note" TEXT,

    CONSTRAINT "checkins_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "checkins_scores_check" CHECK (
        "mood_score" BETWEEN 1 AND 10
        AND "fog_score" BETWEEN 1 AND 10
        AND "loneliness_score" BETWEEN 1 AND 10
        AND "self_criticism_score" BETWEEN 1 AND 10
        AND "digital_control_score" BETWEEN 1 AND 10
        AND "learning_resistance_score" BETWEEN 1 AND 10
        AND "body_relationship_score" BETWEEN 1 AND 10
        AND "work_confidence_score" BETWEEN 1 AND 10
    )
);

-- CreateIndex
CREATE INDEX "checkins_day_log_id_timestamp_idx" ON "checkins"("day_log_id", "timestamp");

-- AddForeignKey
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_day_log_id_fkey"
FOREIGN KEY ("day_log_id") REFERENCES "day_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
