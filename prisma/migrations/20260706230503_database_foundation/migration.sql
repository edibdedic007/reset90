-- CreateEnum
CREATE TYPE "cycle_status" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "energy_level" AS ENUM ('BURNED_OUT', 'LOW', 'NORMAL', 'HIGH', 'RESTLESS_CHAOTIC');

-- CreateEnum
CREATE TYPE "day_status" AS ENUM ('GREEN', 'YELLOW', 'BLUE', 'RED', 'GOLD', 'UNSET');

-- CreateEnum
CREATE TYPE "payload_kind" AS ENUM ('DAILY_PLAN', 'DAILY_REFLECTION', 'WEEKLY_REVIEW', 'CONTEXT_SUMMARY');

-- CreateEnum
CREATE TYPE "validation_status" AS ENUM ('PENDING', 'VALID', 'INVALID');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "authentik_subject" TEXT NOT NULL,
    "email" TEXT,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reset_cycles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "cycle_status" NOT NULL DEFAULT 'ACTIVE',
    "recovery_credit_limit" INTEGER NOT NULL DEFAULT 6,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reset_cycles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reset_cycles_date_order_check" CHECK ("end_date" >= "start_date")
);

-- CreateTable
CREATE TABLE "reset_phases" (
    "id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "day_start" INTEGER NOT NULL,
    "day_end" INTEGER NOT NULL,
    "description" TEXT,

    CONSTRAINT "reset_phases_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reset_phases_day_range_check" CHECK (
        "day_start" >= 1 AND
        "day_end" <= 90 AND
        "day_start" <= "day_end"
    )
);

-- CreateTable
CREATE TABLE "day_logs" (
    "id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "phase_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "day_number" INTEGER NOT NULL,
    "energy_level" "energy_level",
    "status" "day_status" NOT NULL DEFAULT 'UNSET',
    "mission" TEXT,
    "supportive_message" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "day_logs_day_number_check" CHECK ("day_number" BETWEEN 1 AND 90)
);

-- CreateTable
CREATE TABLE "imported_payloads" (
    "id" UUID NOT NULL,
    "kind" "payload_kind" NOT NULL,
    "schema_version" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "external_conversation_id" TEXT,
    "raw_json" JSONB NOT NULL,
    "validation_status" "validation_status" NOT NULL DEFAULT 'PENDING',
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imported_payloads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_authentik_subject_key" ON "users"("authentik_subject");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "reset_cycles_user_id_status_idx" ON "reset_cycles"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reset_cycles_user_id_name_key" ON "reset_cycles"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "reset_phases_cycle_id_day_start_key" ON "reset_phases"("cycle_id", "day_start");

-- CreateIndex
CREATE INDEX "day_logs_phase_id_idx" ON "day_logs"("phase_id");

-- CreateIndex
CREATE UNIQUE INDEX "day_logs_cycle_id_date_key" ON "day_logs"("cycle_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "day_logs_cycle_id_day_number_key" ON "day_logs"("cycle_id", "day_number");

-- CreateIndex
CREATE UNIQUE INDEX "imported_payloads_idempotency_key_key" ON "imported_payloads"("idempotency_key");

-- CreateIndex
CREATE INDEX "imported_payloads_kind_created_at_idx" ON "imported_payloads"("kind", "created_at");

-- AddForeignKey
ALTER TABLE "reset_cycles" ADD CONSTRAINT "reset_cycles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reset_phases" ADD CONSTRAINT "reset_phases_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "reset_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_logs" ADD CONSTRAINT "day_logs_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "reset_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_logs" ADD CONSTRAINT "day_logs_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "reset_phases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
