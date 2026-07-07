import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import { importEnvelopeMetadataSchema, importEnvelopeSchema } from "./schemas";

const payloadKindByImportKind = {
  daily_plan: "DAILY_PLAN",
  daily_reflection: "DAILY_REFLECTION",
  weekly_review: "WEEKLY_REVIEW",
  context_item: "CONTEXT_ITEM",
} as const;

const importReferenceSelect = {
  id: true,
  validationStatus: true,
  processingStatus: true,
} as const;

export type RawImportDatabase = Pick<PrismaClient, "importedPayload">;

export type SafeValidationIssue = {
  code: string;
  path: string;
  message: string;
};

export type StoreRawImportResult =
  | {
      status: "created";
      importedPayloadId: string;
    }
  | {
      status: "duplicate";
      importedPayloadId: string;
      validationStatus: "PENDING" | "VALID" | "INVALID";
      processingStatus: "PENDING" | "PROCESSED" | "REJECTED" | "FAILED";
    }
  | {
      status: "invalid";
      importedPayloadId: string | null;
      errors: SafeValidationIssue[];
    };

function toSafeIssues(
  issues: ReadonlyArray<{
    code: string;
    path: ReadonlyArray<PropertyKey>;
    message: string;
  }>,
): SafeValidationIssue[] {
  return issues.slice(0, 20).map((issue) => ({
    code: issue.code,
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw new TypeError("Import payload must be JSON serializable");
  }

  return JSON.parse(serialized) as Prisma.InputJsonValue;
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function storeRawImport(
  database: RawImportDatabase,
  rawInput: unknown,
): Promise<StoreRawImportResult> {
  const metadataResult = importEnvelopeMetadataSchema.safeParse(rawInput);

  if (!metadataResult.success) {
    return {
      status: "invalid",
      importedPayloadId: null,
      errors: toSafeIssues(metadataResult.error.issues),
    };
  }

  const metadata = metadataResult.data;
  const uniqueWhere = {
    source_idempotencyKey: {
      source: metadata.source,
      idempotencyKey: metadata.idempotency_key,
    },
  };
  const existing = await database.importedPayload.findUnique({
    where: uniqueWhere,
    select: importReferenceSelect,
  });

  if (existing) {
    return {
      status: "duplicate",
      importedPayloadId: existing.id,
      validationStatus: existing.validationStatus,
      processingStatus: existing.processingStatus,
    };
  }

  let rawJson: Prisma.InputJsonValue;

  try {
    rawJson = toInputJsonValue(rawInput);
  } catch {
    return {
      status: "invalid",
      importedPayloadId: null,
      errors: [
        {
          code: "invalid_json",
          path: "",
          message: "Import payload must be JSON serializable",
        },
      ],
    };
  }

  const validationResult = importEnvelopeSchema.safeParse(rawInput);
  const errors = validationResult.success
    ? []
    : toSafeIssues(validationResult.error.issues);

  try {
    const stored = await database.importedPayload.create({
      data: {
        kind: payloadKindByImportKind[metadata.kind],
        schemaVersion: metadata.schema_version,
        idempotencyKey: metadata.idempotency_key,
        source: metadata.source,
        externalConversationId: metadata.external_conversation_id,
        rawJson,
        validationStatus: validationResult.success ? "VALID" : "INVALID",
        processingStatus: validationResult.success ? "PENDING" : "REJECTED",
        errorMetadata: validationResult.success
          ? undefined
          : { issues: errors },
      },
      select: importReferenceSelect,
    });

    if (!validationResult.success) {
      return {
        status: "invalid",
        importedPayloadId: stored.id,
        errors,
      };
    }

    return {
      status: "created",
      importedPayloadId: stored.id,
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const duplicate = await database.importedPayload.findUnique({
      where: uniqueWhere,
      select: importReferenceSelect,
    });

    if (!duplicate) {
      throw error;
    }

    return {
      status: "duplicate",
      importedPayloadId: duplicate.id,
      validationStatus: duplicate.validationStatus,
      processingStatus: duplicate.processingStatus,
    };
  }
}
