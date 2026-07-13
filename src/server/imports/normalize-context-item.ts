import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import { normalizeContextTag } from "../../lib/context";
import {
  findSingularActiveCycle,
  lockAndRevalidateSingularActiveCycle,
} from "../context-cycle";

import {
  contextItemImportSchema,
  LEGACY_CONTEXT_ITEM_SCHEMA_VERSION,
} from "./schemas";

export type ContextItemNormalizationDatabase = Pick<
  PrismaClient,
  "$transaction"
>;

export type ContextItemNormalizationResult =
  | { status: "not_applicable" }
  | { status: "processed"; contextItemId: string }
  | { status: "accepted_raw_only" }
  | { status: "already_processed"; contextItemId: string | null }
  | {
      status: "failed";
      code:
        | "import_not_found"
        | "import_not_processable"
        | "invalid_stored_payload"
        | "import_owner_not_found"
        | "active_cycle_not_found"
        | "active_cycle_ambiguous";
    };

async function markFailed(
  transaction: Prisma.TransactionClient,
  importedPayloadId: string,
  code: Extract<ContextItemNormalizationResult, { status: "failed" }>["code"],
): Promise<ContextItemNormalizationResult> {
  await transaction.importedPayload.update({
    where: { id: importedPayloadId },
    data: {
      processingStatus: "FAILED",
      processedAt: new Date(),
      errorMetadata: { code },
    },
  });
  return { status: "failed", code };
}

export function normalizeContextItemImport(
  database: ContextItemNormalizationDatabase,
  importedPayloadId: string,
  ownerAuthentikSubject: string,
): Promise<ContextItemNormalizationResult> {
  return database.$transaction(async (transaction) => {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM imported_payloads WHERE id = ${importedPayloadId}::uuid FOR UPDATE`,
    );

    const importedPayload = await transaction.importedPayload.findUnique({
      where: { id: importedPayloadId },
      select: {
        id: true,
        kind: true,
        schemaVersion: true,
        rawJson: true,
        validationStatus: true,
        processingStatus: true,
      },
    });
    if (!importedPayload) {
      return { status: "failed", code: "import_not_found" };
    }
    if (importedPayload.kind !== "CONTEXT_ITEM") {
      return { status: "not_applicable" };
    }
    if (importedPayload.processingStatus === "PROCESSED") {
      const existing = await transaction.contextItem.findUnique({
        where: { importedPayloadId },
        select: { id: true },
      });
      return {
        status: "already_processed",
        contextItemId: existing?.id ?? null,
      };
    }
    if (importedPayload.validationStatus !== "VALID") {
      return markFailed(
        transaction,
        importedPayloadId,
        "import_not_processable",
      );
    }

    const envelope = contextItemImportSchema.safeParse(importedPayload.rawJson);
    if (!envelope.success) {
      return markFailed(
        transaction,
        importedPayloadId,
        "invalid_stored_payload",
      );
    }

    if (importedPayload.schemaVersion !== envelope.data.schema_version) {
      return markFailed(
        transaction,
        importedPayloadId,
        "invalid_stored_payload",
      );
    }

    if (envelope.data.schema_version === LEGACY_CONTEXT_ITEM_SCHEMA_VERSION) {
      await transaction.importedPayload.update({
        where: { id: importedPayloadId },
        data: {
          processingStatus: "PROCESSED",
          processedAt: new Date(),
          errorMetadata: Prisma.DbNull,
        },
      });
      return { status: "accepted_raw_only" };
    }

    const owner = await transaction.user.findUnique({
      where: { authentikSubject: ownerAuthentikSubject },
      select: { id: true },
    });
    if (!owner) {
      return markFailed(
        transaction,
        importedPayloadId,
        "import_owner_not_found",
      );
    }

    const expectedCycle = await findSingularActiveCycle(transaction, owner.id);
    if (!expectedCycle) {
      const activeCycleCount = await transaction.resetCycle.count({
        where: { userId: owner.id, status: "ACTIVE" },
      });
      return markFailed(
        transaction,
        importedPayloadId,
        activeCycleCount === 0
          ? "active_cycle_not_found"
          : "active_cycle_ambiguous",
      );
    }

    const cycle = await lockAndRevalidateSingularActiveCycle(
      transaction,
      owner.id,
      expectedCycle.id,
    );
    if (!cycle) {
      const activeCycleCount = await transaction.resetCycle.count({
        where: { userId: owner.id, status: "ACTIVE" },
      });
      return markFailed(
        transaction,
        importedPayloadId,
        activeCycleCount === 0
          ? "active_cycle_not_found"
          : "active_cycle_ambiguous",
      );
    }

    const payload = envelope.data.payload;
    const contextItem = await transaction.contextItem.create({
      data: {
        cycleId: cycle.id,
        kind: payload.kind,
        domain: payload.domain,
        title: payload.title,
        summary: payload.summary,
        sourceType: "IMPORT",
        importedPayloadId,
        sourceRef: payload.source_ref,
        tags: {
          create: (payload.tags ?? []).map((name) => ({
            name,
            normalizedName: normalizeContextTag(name),
          })),
        },
      },
      select: { id: true },
    });

    await transaction.importedPayload.update({
      where: { id: importedPayloadId },
      data: {
        processingStatus: "PROCESSED",
        processedAt: new Date(),
        errorMetadata: Prisma.DbNull,
      },
    });

    return { status: "processed", contextItemId: contextItem.id };
  });
}
