import type { PrismaClient } from "@/generated/prisma/client";

const MILLISECONDS_PER_DAY = 86_400_000;

export type PhaseRange = {
  name: string;
  dayStart: number;
  dayEnd: number;
  description: string | null;
};

export const DEFAULT_PHASES: readonly PhaseRange[] = [
  {
    name: "Clear the Fog",
    dayStart: 1,
    dayEnd: 30,
    description: "Reduce noise and establish a workable daily baseline.",
  },
  {
    name: "Rebuild Momentum",
    dayStart: 31,
    dayEnd: 60,
    description: "Build steady execution from the restored baseline.",
  },
  {
    name: "Prove Continuation",
    dayStart: 61,
    dayEnd: 90,
    description: "Practice continuing beyond short bursts of motivation.",
  },
] as const;

export function normalizeUtcDate(date: Date) {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Date must be valid");
  }

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function addUtcDays(date: Date, days: number) {
  const normalizedDate = normalizeUtcDate(date);
  normalizedDate.setUTCDate(normalizedDate.getUTCDate() + days);
  return normalizedDate;
}

export function calculateDayNumber(startDate: Date, targetDate: Date) {
  const start = normalizeUtcDate(startDate);
  const target = normalizeUtcDate(targetDate);
  return (
    Math.round((target.getTime() - start.getTime()) / MILLISECONDS_PER_DAY) + 1
  );
}

export function calculatePhase<T extends PhaseRange = PhaseRange>(
  dayNumber: number,
  phases: readonly T[] = DEFAULT_PHASES as readonly T[],
) {
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 90) {
    throw new RangeError("Day number must be an integer from 1 through 90");
  }

  const phase = phases.find(
    ({ dayStart, dayEnd }) => dayNumber >= dayStart && dayNumber <= dayEnd,
  );

  if (!phase) {
    throw new RangeError(`No phase contains day ${dayNumber}`);
  }

  return phase;
}

export function buildDayLogSeeds(
  startDate: Date,
  phases: readonly (PhaseRange & { id: string })[],
) {
  return Array.from({ length: 90 }, (_, index) => {
    const dayNumber = index + 1;
    const phase = calculatePhase(dayNumber, phases);

    return {
      dayNumber,
      date: addUtcDays(startDate, index),
      phaseId: phase.id,
    };
  });
}

export function findActiveCycle(prisma: PrismaClient, userId: string) {
  return prisma.resetCycle.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    include: { phases: { orderBy: { dayStart: "asc" } } },
  });
}
