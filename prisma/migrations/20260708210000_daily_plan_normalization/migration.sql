-- CreateEnum
CREATE TYPE "focus_domain" AS ENUM (
    'BODY',
    'MOOD',
    'DIGITAL',
    'LEARNING',
    'WORK',
    'SYSTEM',
    'ENVIRONMENT',
    'SOCIAL',
    'OTHER'
);

-- CreateEnum
CREATE TYPE "task_tier" AS ENUM ('NON_NEGOTIABLE', 'MINIMUM', 'STANDARD', 'IDEAL');

-- CreateTable
CREATE TABLE "daily_plans" (
    "id" UUID NOT NULL,
    "day_log_id" UUID NOT NULL,
    "imported_payload_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "mission" TEXT NOT NULL,
    "supportive_message" TEXT NOT NULL,
    "warnings" JSONB NOT NULL,
    "downshift_rule" TEXT NOT NULL,
    "context_summary" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "daily_plan_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "domain" "focus_domain" NOT NULL,
    "tier" "task_tier" NOT NULL,
    "estimate_minutes" INTEGER,
    "trigger" TEXT,
    "why" TEXT,
    "completed_at" TIMESTAMP(3),
    "skipped_at" TIMESTAMP(3),
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tasks_estimate_minutes_check" CHECK (
        "estimate_minutes" IS NULL OR "estimate_minutes" BETWEEN 1 AND 1440
    ),
    CONSTRAINT "tasks_sort_order_check" CHECK ("sort_order" >= 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_plans_day_log_id_key" ON "daily_plans"("day_log_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_plans_imported_payload_id_key" ON "daily_plans"("imported_payload_id");

-- CreateIndex
CREATE INDEX "tasks_daily_plan_id_tier_sort_order_idx" ON "tasks"("daily_plan_id", "tier", "sort_order");

-- CreateIndex
CREATE INDEX "tasks_domain_idx" ON "tasks"("domain");

-- AddForeignKey
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_day_log_id_fkey"
FOREIGN KEY ("day_log_id") REFERENCES "day_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_imported_payload_id_fkey"
FOREIGN KEY ("imported_payload_id") REFERENCES "imported_payloads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_daily_plan_id_fkey"
FOREIGN KEY ("daily_plan_id") REFERENCES "daily_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
