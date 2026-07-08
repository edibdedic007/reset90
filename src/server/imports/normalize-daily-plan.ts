import { Prisma, type PrismaClient } from "../../generated/prisma/client";

import { importEnvelopeSchema } from "./schemas";
import type { DailyPlanPayload } from "./schemas/daily-plan";

type DailyPlanTask =
  | DailyPlanPayload["non_negotiables"][number]
  | DailyPlanPayload["minimum_plan"][number]
  | DailyPlanPayload["standard_plan"][number]
  | DailyPlanPayload["ideal_plan"][number];

const domainByImportValue = {
  body: "BODY",
  mood: "MOOD",
  digital: "DIGITAL",
  learning: "LEARNING",
  work: "WORK",
  system: "SYSTEM",
  environment: "ENVIRONMENT",
  social: "SOCIAL",
  other: "OTHER",
} as const;

const tierByImportValue = {
  non_negotiable: "NON_NEGOTIABLE",
  minimum: "MINIMUM",
  standard: "STANDARD",
  ideal: "IDEAL",
} as const;

export type DailyPlanNormalizationDatabase = Pick<PrismaClient, "$transaction">;

export type DailyPlanNormalizationResult =
  | { status: "not_applicable" }
  | {
      status: "processed" | "already_processed";
      dailyPlanId: string;
      taskCount: number;
    }
  | {
      status: "failed";
      code:
        | "import_not_found"
        | "import_not_processable"
        | "invalid_stored_payload"
        | "day_log_not_found"
        | "processed_record_not_found";
    };

function normalizedTasks(payload: DailyPlanPayload) {
  const tasks: DailyPlanTask[] = [
    ...payload.non_negotiables,
    ...payload.minimum_plan,
    ...payload.standard_plan,
    ...payload.ideal_plan,
  ];

  return tasks.map((task, sortOrder) => ({
    title: task.title,
    domain: domainByImportValue[task.domain],
    tier: tierByImportValue[task.tier],
    estimateMinutes: task.estimate_minutes,
    trigger: task.trigger,
    why: task.why,
    sortOrder,
  }));
}

async function markFailed(
  transaction: Prisma.TransactionClient,
  importedPayloadId: string,
  code: Extract<DailyPlanNormalizationResult, { status: "failed" }>["code"],
): Promise<DailyPlanNormalizationResult> {
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

export function normalizeDailyPlanImport(
  database: DailyPlanNormalizationDatabase,
  importedPayloadId: string,
): Promise<DailyPlanNormalizationResult> {
  return database.$transaction(async (transaction) => {
    const importedPayload = await transaction.importedPayload.findUnique({
      where: { id: importedPayloadId },
      select: {
        id: true,
        kind: true,
        schemaVersion: true,
        source: true,
        rawJson: true,
        validationStatus: true,
        processingStatus: true,
      },
    });

    if (!importedPayload) {
      return { status: "failed", code: "import_not_found" };
    }

    if (importedPayload.kind !== "DAILY_PLAN") {
      return { status: "not_applicable" };
    }

    if (importedPayload.processingStatus === "PROCESSED") {
      const existing = await transaction.dailyPlan.findUnique({
        where: { importedPayloadId },
        select: { id: true, _count: { select: { tasks: true } } },
      });

      if (!existing) {
        return markFailed(
          transaction,
          importedPayloadId,
          "processed_record_not_found",
        );
      }

      return {
        status: "already_processed",
        dailyPlanId: existing.id,
        taskCount: existing._count.tasks,
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
    if (!envelope.success || envelope.data.kind !== "daily_plan") {
      return markFailed(
        transaction,
        importedPayloadId,
        "invalid_stored_payload",
      );
    }

    const payload = envelope.data.payload;
    const dayLog = await transaction.dayLog.findFirst({
      where: {
        date: new Date(`${payload.date}T00:00:00.000Z`),
        dayNumber: payload.day_number,
        phase: { name: payload.phase },
        cycle: { status: "ACTIVE" },
      },
      select: { id: true },
    });

    if (!dayLog) {
      return markFailed(transaction, importedPayloadId, "day_log_not_found");
    }

    const tasks = normalizedTasks(payload);
    const planData = {
      importedPayloadId,
      source: importedPayload.source,
      schemaVersion: importedPayload.schemaVersion,
      mission: payload.mission,
      supportiveMessage: payload.supportive_message,
      warnings: payload.warnings,
      downshiftRule: payload.downshift_rule,
      contextSummary: payload.context_summary,
    };
    const dailyPlan = await transaction.dailyPlan.upsert({
      where: { dayLogId: dayLog.id },
      create: {
        ...planData,
        dayLogId: dayLog.id,
        tasks: { create: tasks },
      },
      update: {
        ...planData,
        tasks: {
          deleteMany: {},
          create: tasks,
        },
      },
      select: { id: true },
    });

    await transaction.dayLog.update({
      where: { id: dayLog.id },
      data: {
        mission: payload.mission,
        supportiveMessage: payload.supportive_message,
      },
    });
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
      dailyPlanId: dailyPlan.id,
      taskCount: tasks.length,
    };
  });
}
