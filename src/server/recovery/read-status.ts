import type { PrismaClient } from "@/generated/prisma/client";
import type { DayStatus } from "@/generated/prisma/enums";

import { calculateDayStatus } from "./day-status";

type ReadStatusDatabase = Pick<PrismaClient, "dayLog">;

export type DerivedCycleDayStatuses = {
  byId: ReadonlyMap<string, DayStatus>;
  byDayNumber: ReadonlyMap<number, DayStatus>;
};

export async function deriveCycleDayStatuses(
  database: ReadStatusDatabase,
  cycleId: string,
  now: Date,
): Promise<DerivedCycleDayStatuses> {
  const days = await database.dayLog.findMany({
    where: { cycleId },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: {
      id: true,
      date: true,
      dayNumber: true,
      dailyPlan: {
        select: {
          tasks: {
            select: { tier: true, completedAt: true, skippedAt: true },
          },
        },
      },
      recoveryEvent: {
        select: { completedAt: true, creditConsumedAt: true },
      },
    },
  });

  const byId = new Map<string, DayStatus>();
  const byDayNumber = new Map<number, DayStatus>();
  let previousStatus: DayStatus | null = null;
  let previousDayNumber: number | null = null;

  for (const day of days) {
    const status = calculateDayStatus({
      date: day.date,
      now,
      previousStatus:
        previousDayNumber === day.dayNumber - 1 ? previousStatus : null,
      tasks: day.dailyPlan?.tasks ?? [],
      recovery: day.recoveryEvent,
    });
    byId.set(day.id, status);
    byDayNumber.set(day.dayNumber, status);
    previousStatus = status;
    previousDayNumber = day.dayNumber;
  }

  return { byId, byDayNumber };
}
