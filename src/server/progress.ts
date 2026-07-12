import type { PrismaClient } from "@/generated/prisma/client";
import type {
  DayStatus,
  EnergyLevel,
  FocusDomain,
  TaskTier,
} from "@/generated/prisma/enums";
import { checkinSelect, toDayCheckin, type DayCheckin } from "./checkins";
import { addUtcDays, calculateDayNumber, normalizeUtcDate } from "./db/cycle";
import {
  reconcileCurrentDayStatus,
  reconcileElapsedDayStatuses,
  toRecoveryEventSummary,
  type RecoveryEventSummary,
} from "./recovery/service";

export type ProgressDatabase = Pick<
  PrismaClient,
  "dayLog" | "resetCycle" | "recoveryEvent" | "$transaction"
>;

export const DAY_STATUSES = [
  "GREEN",
  "YELLOW",
  "BLUE",
  "RED",
  "GOLD",
  "UNSET",
] as const satisfies readonly DayStatus[];

export type ProgressDaySummary = {
  dayNumber: number;
  date: string;
  status: DayStatus | null;
  isCurrent: boolean;
  isAvailable: boolean;
};

export type ProgressStatusCounts = Record<DayStatus, number>;

export type ProgressDashboard =
  | { status: "no_cycle"; today: string }
  | {
      status: "ready";
      today: string;
      cycle: {
        name: string;
        recoveryCreditLimit: number;
        recoveryCreditsUsed: number;
        recoveryCreditsRemaining: number;
      };
      days: ProgressDaySummary[];
      statusCounts: ProgressStatusCounts;
      unavailableCount: number;
    };

export type ProgressTask = {
  id: string;
  title: string;
  description: string | null;
  domain: FocusDomain;
  tier: TaskTier;
  estimateMinutes: number | null;
  trigger: string | null;
  why: string | null;
  completedAt: string | null;
  skippedAt: string | null;
  notes: string | null;
};

export type DayReflection = {
  summary: string;
  whatHappened: string | null;
  whatWorked: string | null;
  whatBlockedMe: string | null;
  tomorrowAdjustment: string | null;
  selfCriticismNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DayDetail =
  | { status: "no_cycle"; today: string; dayNumber: number }
  | {
      status: "unavailable";
      today: string;
      dayNumber: number;
      date: string;
      cycleName: string;
      isCurrent: boolean;
    }
  | {
      status: "ready";
      today: string;
      cycleName: string;
      day: {
        dayNumber: number;
        date: string;
        status: DayStatus;
        isCurrent: boolean;
        energyLevel: EnergyLevel | null;
        phase: { name: string; description: string | null };
      };
      plan: {
        mission: string;
        supportiveMessage: string;
        warnings: string[];
        downshiftRule: string;
        contextSummary: string;
        tasks: ProgressTask[];
      } | null;
      checkins: DayCheckin[];
      recoveryEvent: RecoveryEventSummary | null;
      reflection: DayReflection | null;
    };

const progressTaskSelect = {
  id: true,
  title: true,
  description: true,
  domain: true,
  tier: true,
  estimateMinutes: true,
  trigger: true,
  why: true,
  completedAt: true,
  skippedAt: true,
  notes: true,
} as const;

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseWarnings(warnings: unknown): string[] {
  return Array.isArray(warnings)
    ? warnings.filter(
        (warning): warning is string =>
          typeof warning === "string" && warning.trim().length > 0,
      )
    : [];
}

function emptyStatusCounts(): ProgressStatusCounts {
  return {
    GREEN: 0,
    YELLOW: 0,
    BLUE: 0,
    RED: 0,
    GOLD: 0,
    UNSET: 0,
  };
}

function activeDayNumber(startDate: Date, today: Date) {
  const dayNumber = calculateDayNumber(startDate, today);
  return dayNumber >= 1 && dayNumber <= 90 ? dayNumber : null;
}

async function reconcileProgressStatuses(
  database: ProgressDatabase,
  userId: string,
  now: Date,
) {
  await reconcileElapsedDayStatuses(database, userId, now, 90);
  await reconcileCurrentDayStatus(database, userId, now);
}

export function parseDayNumber(value: string) {
  if (!/^(?:[1-9]|[1-8][0-9]|90)$/.test(value)) {
    return null;
  }

  return Number(value);
}

export async function getProgressDashboard(
  database: ProgressDatabase,
  userId: string,
  now = new Date(),
): Promise<ProgressDashboard> {
  const today = normalizeUtcDate(now);
  const todayIso = toIsoDate(today);

  await reconcileProgressStatuses(database, userId, now);

  const cycle = await database.resetCycle.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    select: {
      name: true,
      startDate: true,
      recoveryCreditLimit: true,
      recoveryEvents: {
        where: {
          completedAt: { not: null },
          creditConsumedAt: { not: null },
        },
        select: { id: true },
      },
      dayLogs: {
        orderBy: { dayNumber: "asc" },
        select: { dayNumber: true, date: true, status: true },
      },
    },
  });

  if (!cycle) {
    return { status: "no_cycle", today: todayIso };
  }

  const logsByDay = new Map(cycle.dayLogs.map((day) => [day.dayNumber, day]));
  const currentDayNumber = activeDayNumber(cycle.startDate, today);
  const statusCounts = emptyStatusCounts();
  let unavailableCount = 0;

  const days = Array.from({ length: 90 }, (_, index): ProgressDaySummary => {
    const dayNumber = index + 1;
    const dayLog = logsByDay.get(dayNumber);

    if (!dayLog) {
      unavailableCount += 1;
      return {
        dayNumber,
        date: toIsoDate(addUtcDays(cycle.startDate, index)),
        status: null,
        isCurrent: currentDayNumber === dayNumber,
        isAvailable: false,
      };
    }

    statusCounts[dayLog.status] += 1;
    return {
      dayNumber,
      date: toIsoDate(dayLog.date),
      status: dayLog.status,
      isCurrent: currentDayNumber === dayNumber,
      isAvailable: true,
    };
  });

  const recoveryCreditsUsed = cycle.recoveryEvents.length;

  return {
    status: "ready",
    today: todayIso,
    cycle: {
      name: cycle.name,
      recoveryCreditLimit: cycle.recoveryCreditLimit,
      recoveryCreditsUsed,
      recoveryCreditsRemaining: Math.max(
        cycle.recoveryCreditLimit - recoveryCreditsUsed,
        0,
      ),
    },
    days,
    statusCounts,
    unavailableCount,
  };
}

export async function getDayDetail(
  database: ProgressDatabase,
  userId: string,
  dayNumber: number,
  now = new Date(),
): Promise<DayDetail> {
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 90) {
    throw new RangeError("Day number must be an integer from 1 through 90");
  }

  const today = normalizeUtcDate(now);
  const todayIso = toIsoDate(today);

  await reconcileProgressStatuses(database, userId, now);

  const cycle = await database.resetCycle.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    select: {
      name: true,
      startDate: true,
      dayLogs: {
        where: { dayNumber },
        take: 1,
        select: {
          date: true,
          dayNumber: true,
          status: true,
          energyLevel: true,
          phase: { select: { name: true, description: true } },
          dailyPlan: {
            select: {
              mission: true,
              supportiveMessage: true,
              warnings: true,
              downshiftRule: true,
              contextSummary: true,
              tasks: {
                orderBy: { sortOrder: "asc" },
                select: progressTaskSelect,
              },
            },
          },
          checkins: {
            orderBy: { timestamp: "desc" },
            select: checkinSelect,
          },
          recoveryEvent: {
            select: {
              id: true,
              selectedActionIds: true,
              completedAt: true,
              creditConsumedAt: true,
            },
          },
          dailyReflection: {
            select: {
              summary: true,
              whatHappened: true,
              whatWorked: true,
              whatBlockedMe: true,
              tomorrowAdjustment: true,
              selfCriticismNote: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
      },
    },
  });

  if (!cycle) {
    return { status: "no_cycle", today: todayIso, dayNumber };
  }

  const isCurrent = activeDayNumber(cycle.startDate, today) === dayNumber;
  const dayLog = cycle.dayLogs[0];

  if (!dayLog) {
    return {
      status: "unavailable",
      today: todayIso,
      dayNumber,
      date: toIsoDate(addUtcDays(cycle.startDate, dayNumber - 1)),
      cycleName: cycle.name,
      isCurrent,
    };
  }

  return {
    status: "ready",
    today: todayIso,
    cycleName: cycle.name,
    day: {
      dayNumber: dayLog.dayNumber,
      date: toIsoDate(dayLog.date),
      status: dayLog.status,
      isCurrent,
      energyLevel: dayLog.energyLevel,
      phase: dayLog.phase,
    },
    plan: dayLog.dailyPlan
      ? {
          mission: dayLog.dailyPlan.mission,
          supportiveMessage: dayLog.dailyPlan.supportiveMessage,
          warnings: parseWarnings(dayLog.dailyPlan.warnings),
          downshiftRule: dayLog.dailyPlan.downshiftRule,
          contextSummary: dayLog.dailyPlan.contextSummary,
          tasks: dayLog.dailyPlan.tasks.map((task) => ({
            ...task,
            completedAt: task.completedAt?.toISOString() ?? null,
            skippedAt: task.skippedAt?.toISOString() ?? null,
          })),
        }
      : null,
    checkins: dayLog.checkins.map(toDayCheckin),
    recoveryEvent: dayLog.recoveryEvent
      ? toRecoveryEventSummary(dayLog.recoveryEvent)
      : null,
    reflection: dayLog.dailyReflection
      ? {
          summary: dayLog.dailyReflection.summary,
          whatHappened: dayLog.dailyReflection.whatHappened,
          whatWorked: dayLog.dailyReflection.whatWorked,
          whatBlockedMe: dayLog.dailyReflection.whatBlockedMe,
          tomorrowAdjustment: dayLog.dailyReflection.tomorrowAdjustment,
          selfCriticismNote: dayLog.dailyReflection.selfCriticismNote,
          createdAt: dayLog.dailyReflection.createdAt.toISOString(),
          updatedAt: dayLog.dailyReflection.updatedAt.toISOString(),
        }
      : null,
  };
}
