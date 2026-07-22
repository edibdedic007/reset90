import { Prisma, type PrismaClient } from "../../generated/prisma/client";

import { normalizeUtcDate } from "../db/cycle";
import { resolveTrustedMachineOwner } from "./machine-owner";
import { importEnvelopeSchema } from "./schemas";
import type { DailyReflectionPayload } from "./schemas/daily-reflection";

const dayStatusByImportValue = {
  green: "GREEN",
  yellow: "YELLOW",
  blue: "BLUE",
  red: "RED",
  gold: "GOLD",
  unset: "UNSET",
} as const;

export type DailyReflectionNormalizationDatabase = Pick<
  PrismaClient,
  "$transaction"
>;

export type DailyReflectionNormalizationResult =
  | { status: "not_applicable" }
  | {
      status: "processed";
      dailyReflectionId: string;
    }
  | {
      status: "already_processed";
      dailyReflectionId: string | null;
    }
  | {
      status: "failed";
      code:
        | "import_not_found"
        | "import_not_processable"
        | "invalid_stored_payload"
        | "import_owner_not_found"
        | "active_cycle_not_found"
        | "active_cycle_ambiguous"
        | "target_day_in_future"
        | "target_day_outside_active_cycle"
        | "day_log_not_found";
    };

function optionalText(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizedReflection(payload: DailyReflectionPayload) {
  return {
    summary: payload.summary.trim(),
    whatHappened: optionalText(payload.what_happened),
    whatWorked: optionalText(payload.what_worked),
    whatBlockedMe: optionalText(payload.what_blocked_me),
    tomorrowAdjustment: optionalText(payload.tomorrow_adjustment),
    selfCriticismNote: optionalText(payload.self_criticism_note),
    dayStatusRecommendation: payload.day_status_recommendation
      ? dayStatusByImportValue[payload.day_status_recommendation]
      : null,
  };
}

function isNewerImport(
  incoming: { id: string; createdAt: Date },
  current: { id: string; createdAt: Date },
): boolean {
  const timestampDifference =
    incoming.createdAt.getTime() - current.createdAt.getTime();

  return (
    timestampDifference > 0 ||
    (timestampDifference === 0 && incoming.id > current.id)
  );
}

async function markFailed(
  transaction: Prisma.TransactionClient,
  importedPayloadId: string,
  code: Extract<
    DailyReflectionNormalizationResult,
    { status: "failed" }
  >["code"],
): Promise<DailyReflectionNormalizationResult> {
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

export function normalizeDailyReflectionImport(
  database: DailyReflectionNormalizationDatabase,
  importedPayloadId: string,
  ownerAuthentikSubject: string,
  now = new Date(),
): Promise<DailyReflectionNormalizationResult> {
  return database.$transaction(async (transaction) => {
    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM imported_payloads WHERE id = ${importedPayloadId}::uuid FOR UPDATE`,
    );

    const importedPayload = await transaction.importedPayload.findUnique({
      where: { id: importedPayloadId },
      select: {
        id: true,
        kind: true,
        rawJson: true,
        validationStatus: true,
        processingStatus: true,
        createdAt: true,
      },
    });

    if (!importedPayload) {
      return { status: "failed", code: "import_not_found" };
    }

    if (importedPayload.kind !== "DAILY_REFLECTION") {
      return { status: "not_applicable" };
    }

    if (importedPayload.processingStatus === "PROCESSED") {
      const existing = await transaction.dailyReflection.findUnique({
        where: { importedPayloadId },
        select: { id: true },
      });

      return {
        status: "already_processed",
        dailyReflectionId: existing?.id ?? null,
      };
    }

    if (importedPayload.validationStatus !== "VALID") {
      return markFailed(
        transaction,
        importedPayloadId,
        "import_not_processable",
      );
    }

    const envelope = importEnvelopeSchema.safeParse(importedPayload.rawJson);
    if (!envelope.success || envelope.data.kind !== "daily_reflection") {
      return markFailed(
        transaction,
        importedPayloadId,
        "invalid_stored_payload",
      );
    }

    const owner = await resolveTrustedMachineOwner(
      transaction,
      ownerAuthentikSubject,
    );
    if (owner.status !== "resolved") {
      return markFailed(transaction, importedPayloadId, owner.status);
    }
    const cycle = owner.cycle;

    const payload = envelope.data.payload;
    const targetDate = new Date(`${payload.date}T00:00:00.000Z`);
    if (targetDate > normalizeUtcDate(now)) {
      return markFailed(transaction, importedPayloadId, "target_day_in_future");
    }
    if (targetDate < cycle.startDate || targetDate > cycle.endDate) {
      return markFailed(
        transaction,
        importedPayloadId,
        "target_day_outside_active_cycle",
      );
    }

    const dayLog = await transaction.dayLog.findFirst({
      where: {
        cycleId: cycle.id,
        date: targetDate,
        dayNumber: payload.day_number,
        ...(payload.phase ? { phase: { name: payload.phase } } : {}),
      },
      select: { id: true },
    });
    if (!dayLog) {
      return markFailed(transaction, importedPayloadId, "day_log_not_found");
    }

    await transaction.$queryRaw(
      Prisma.sql`SELECT id FROM day_logs WHERE id = ${dayLog.id}::uuid FOR UPDATE`,
    );

    const existingReflection = await transaction.dailyReflection.findUnique({
      where: { dayLogId: dayLog.id },
      select: {
        id: true,
        importedPayload: { select: { id: true, createdAt: true } },
      },
    });

    const dailyReflectionId =
      !existingReflection ||
      isNewerImport(importedPayload, existingReflection.importedPayload)
        ? (
            await transaction.dailyReflection.upsert({
              where: { dayLogId: dayLog.id },
              create: {
                dayLogId: dayLog.id,
                importedPayloadId,
                ...normalizedReflection(payload),
              },
              update: {
                importedPayloadId,
                ...normalizedReflection(payload),
              },
              select: { id: true },
            })
          ).id
        : existingReflection.id;

    await transaction.importedPayload.update({
      where: { id: importedPayloadId },
      data: {
        processingStatus: "PROCESSED",
        processedAt: new Date(),
        errorMetadata: Prisma.DbNull,
      },
    });

    return {
      status: "processed",
      dailyReflectionId,
    };
  });
}
