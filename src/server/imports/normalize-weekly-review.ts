import { Prisma, type PrismaClient } from "../../generated/prisma/client";

import { normalizeUtcDate } from "../db/cycle";
import { deriveCanonicalWeekRange } from "../reviews";
import { resolveTrustedMachineOwner } from "./machine-owner";
import { importEnvelopeSchema } from "./schemas";
import type { WeeklyReviewPayload } from "./schemas/weekly-review";

export type WeeklyReviewNormalizationDatabase = Pick<
  PrismaClient,
  "$transaction"
>;

export type WeeklyReviewNormalizationResult =
  | { status: "not_applicable" }
  | { status: "processed"; weeklyReviewId: string }
  | { status: "already_processed"; weeklyReviewId: string | null }
  | {
      status: "failed";
      code:
        | "import_not_found"
        | "import_not_processable"
        | "invalid_stored_payload"
        | "import_owner_not_found"
        | "active_cycle_not_found"
        | "active_cycle_ambiguous"
        | "review_dates_mismatch"
        | "review_range_outside_active_cycle"
        | "review_week_incomplete";
    };

function normalizedReview(payload: WeeklyReviewPayload) {
  return {
    summary: payload.summary.trim(),
    winsJson: payload.wins,
    blockersJson: payload.blockers,
    patternsJson: payload.patterns,
    recommendedChangesJson: payload.recommended_changes,
    nextWeekCommitmentsJson: payload.next_week_commitments,
    metricsJson: payload.metrics,
  };
}

function isNewerImport(
  incoming: { id: string; createdAt: Date },
  current: { id: string; createdAt: Date },
) {
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
  code: Extract<WeeklyReviewNormalizationResult, { status: "failed" }>["code"],
): Promise<WeeklyReviewNormalizationResult> {
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

export function normalizeWeeklyReviewImport(
  database: WeeklyReviewNormalizationDatabase,
  importedPayloadId: string,
  ownerAuthentikSubject: string,
  now = new Date(),
): Promise<WeeklyReviewNormalizationResult> {
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
    if (importedPayload.kind !== "WEEKLY_REVIEW") {
      return { status: "not_applicable" };
    }
    if (importedPayload.processingStatus === "PROCESSED") {
      const existing = await transaction.weeklyReview.findUnique({
        where: { importedPayloadId },
        select: { id: true },
      });
      return {
        status: "already_processed",
        weeklyReviewId: existing?.id ?? null,
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
    if (!envelope.success || envelope.data.kind !== "weekly_review") {
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
    const canonicalRange = deriveCanonicalWeekRange(
      cycle.startDate,
      payload.week_number,
    );
    if (
      canonicalRange.dateFrom < cycle.startDate ||
      canonicalRange.dateTo > cycle.endDate
    ) {
      return markFailed(
        transaction,
        importedPayloadId,
        "review_range_outside_active_cycle",
      );
    }
    if (
      payload.date_from !==
        canonicalRange.dateFrom.toISOString().slice(0, 10) ||
      payload.date_to !== canonicalRange.dateTo.toISOString().slice(0, 10)
    ) {
      return markFailed(
        transaction,
        importedPayloadId,
        "review_dates_mismatch",
      );
    }
    if (canonicalRange.dateTo >= normalizeUtcDate(now)) {
      return markFailed(
        transaction,
        importedPayloadId,
        "review_week_incomplete",
      );
    }

    const existingReview = await transaction.weeklyReview.findUnique({
      where: {
        cycleId_weekNumber: {
          cycleId: cycle.id,
          weekNumber: payload.week_number,
        },
      },
      select: {
        id: true,
        importedPayload: { select: { id: true, createdAt: true } },
      },
    });

    const weeklyReviewId =
      !existingReview ||
      isNewerImport(importedPayload, existingReview.importedPayload)
        ? (
            await transaction.weeklyReview.upsert({
              where: {
                cycleId_weekNumber: {
                  cycleId: cycle.id,
                  weekNumber: payload.week_number,
                },
              },
              create: {
                cycleId: cycle.id,
                importedPayloadId,
                weekNumber: payload.week_number,
                dateFrom: canonicalRange.dateFrom,
                dateTo: canonicalRange.dateTo,
                ...normalizedReview(payload),
              },
              update: {
                importedPayloadId,
                dateFrom: canonicalRange.dateFrom,
                dateTo: canonicalRange.dateTo,
                ...normalizedReview(payload),
              },
              select: { id: true },
            })
          ).id
        : existingReview.id;

    await transaction.importedPayload.update({
      where: { id: importedPayloadId },
      data: {
        processingStatus: "PROCESSED",
        processedAt: new Date(),
        errorMetadata: Prisma.DbNull,
      },
    });

    return { status: "processed", weeklyReviewId };
  });
}
