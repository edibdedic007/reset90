-- Align the persisted enum with the canonical import contract.
ALTER TYPE "payload_kind" RENAME VALUE 'CONTEXT_SUMMARY' TO 'CONTEXT_ITEM';

-- Track normalization separately from boundary validation.
CREATE TYPE "processing_status" AS ENUM ('PENDING', 'PROCESSED', 'REJECTED', 'FAILED');

ALTER TABLE "imported_payloads"
ADD COLUMN "processing_status" "processing_status" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "error_metadata" JSONB;

-- Idempotency keys are scoped to their source.
DROP INDEX "imported_payloads_idempotency_key_key";
CREATE UNIQUE INDEX "imported_payloads_source_idempotency_key_key"
ON "imported_payloads"("source", "idempotency_key");
