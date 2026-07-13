-- CreateEnum
CREATE TYPE "context_kind" AS ENUM (
    'CONVERSATION_SUMMARY',
    'TASK_SUMMARY',
    'DECISION',
    'PREFERENCE',
    'DAILY_SUMMARY',
    'WEEKLY_SNAPSHOT',
    'CYCLE_REPORT',
    'CONTEXT_SNAPSHOT'
);

-- CreateEnum
CREATE TYPE "context_source_type" AS ENUM ('MANUAL', 'IMPORT');

-- CreateTable
CREATE TABLE "context_items" (
    "id" UUID NOT NULL,
    "cycle_id" UUID NOT NULL,
    "kind" "context_kind" NOT NULL,
    "domain" "focus_domain" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source_type" "context_source_type" NOT NULL,
    "imported_payload_id" UUID,
    "source_ref" TEXT,
    "pinned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "context_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "context_items_title_not_blank" CHECK (btrim("title") <> ''),
    CONSTRAINT "context_items_summary_not_blank" CHECK (btrim("summary") <> ''),
    CONSTRAINT "context_items_provenance_check" CHECK (
        ("source_type" = 'IMPORT' AND "imported_payload_id" IS NOT NULL) OR
        ("source_type" = 'MANUAL' AND "imported_payload_id" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "context_tags" (
    "id" UUID NOT NULL,
    "context_item_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_tags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "context_tags_name_not_blank" CHECK (btrim("name") <> ''),
    CONSTRAINT "context_tags_normalized_name_not_blank" CHECK (btrim("normalized_name") <> '')
);

-- CreateIndex
CREATE UNIQUE INDEX "context_items_imported_payload_id_key" ON "context_items"("imported_payload_id");

-- CreateIndex
CREATE INDEX "context_items_cycle_id_pinned_at_created_at_id_idx" ON "context_items"("cycle_id", "pinned_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "context_items_cycle_id_kind_created_at_idx" ON "context_items"("cycle_id", "kind", "created_at");

-- CreateIndex
CREATE INDEX "context_items_cycle_id_domain_created_at_idx" ON "context_items"("cycle_id", "domain", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "context_tags_context_item_id_normalized_name_key" ON "context_tags"("context_item_id", "normalized_name");

-- CreateIndex
CREATE INDEX "context_tags_normalized_name_context_item_id_idx" ON "context_tags"("normalized_name", "context_item_id");

-- AddForeignKey
ALTER TABLE "context_items" ADD CONSTRAINT "context_items_cycle_id_fkey"
FOREIGN KEY ("cycle_id") REFERENCES "reset_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_items" ADD CONSTRAINT "context_items_imported_payload_id_fkey"
FOREIGN KEY ("imported_payload_id") REFERENCES "imported_payloads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_tags" ADD CONSTRAINT "context_tags_context_item_id_fkey"
FOREIGN KEY ("context_item_id") REFERENCES "context_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
