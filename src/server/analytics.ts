import type { PrismaClient } from "@/generated/prisma/client";
import {
  FocusDomain,
  type DayStatus,
  type FocusDomain as FocusDomainType,
} from "@/generated/prisma/enums";

import { findSingularActiveCycle } from "./context-cycle";
import { calculateDayNumber, normalizeUtcDate } from "./db/cycle";
import {
  reconcileCurrentDayStatus,
  reconcileElapsedDayStatuses,
} from "./recovery/service";

export type AnalyticsDatabase = Pick<
  PrismaClient,
  "dayLog" | "resetCycle" | "recoveryEvent" | "$transaction"
>;

export const ANALYTICS_DAY_STATUSES = [
  "GREEN",
  "YELLOW",
  "BLUE",
  "RED",
  "GOLD",
] as const satisfies readonly DayStatus[];

export const ANALYTICS_TRENDS = [
  {
    key: "mood",
    label: "Mood",
    field: "moodScore",
    direction: "higher" as const,
  },
  {
    key: "fog",
    label: "Fog",
    field: "fogScore",
    direction: "lower" as const,
  },
  {
    key: "digitalControl",
    label: "Digital control",
    field: "digitalControlScore",
    direction: "higher" as const,
  },
  {
    key: "learningResistance",
    label: "Learning resistance",
    field: "learningResistanceScore",
    direction: "lower" as const,
  },
  {
    key: "bodyRelationship",
    label: "Body relationship",
    field: "bodyRelationshipScore",
    direction: "higher" as const,
  },
  {
    key: "workConfidence",
    label: "Work confidence",
    field: "workConfidenceScore",
    direction: "higher" as const,
  },
] as const;

type FinalizedDayStatus = (typeof ANALYTICS_DAY_STATUSES)[number];
type AnalyticsTrendDefinition = (typeof ANALYTICS_TRENDS)[number];
export type AnalyticsTrendKey = AnalyticsTrendDefinition["key"];

export type CompletionSummary = {
  completed: number;
  total: number;
  percentage: number | null;
};

export type AnalyticsTrend = {
  key: AnalyticsTrendKey;
  label: string;
  direction: "higher" | "lower";
  points: Array<{ dayNumber: number; value: number }>;
};

export type AnalyticsWeek = {
  weekNumber: number;
  dayFrom: number;
  dayTo: number;
  finalizedDays: number;
  taskCompletionPercentage: number | null;
  averageMood: number | null;
  averageFog: number | null;
  recoveryCreditsUsed: number;
};

export type AnalyticsWeeklyComparison =
  | { status: "unavailable"; currentWeekNumber: number | null }
  | { status: "ready"; current: AnalyticsWeek; previous: AnalyticsWeek };

export type AnalyticsDashboard =
  | { status: "no_cycle" }
  | {
      status: "ready";
      today: string;
      throughDay: number;
      cycleName: string;
      finalizedDayCount: number;
      statusCounts: Record<FinalizedDayStatus, number>;
      recovery: {
        creditLimit: number;
        creditsUsed: number;
        creditsRemaining: number;
        completedQualifyingDays: number;
      };
      trends: AnalyticsTrend[];
      weeklyComparison: AnalyticsWeeklyComparison;
      taskCompletion: CompletionSummary;
      taskCompletionByDomain: Array<
        CompletionSummary & { domain: FocusDomainType }
      >;
    };

type StoredCheckin = {
  id: string;
  timestamp: Date;
  moodScore: number;
  fogScore: number;
  digitalControlScore: number;
  learningResistanceScore: number;
  bodyRelationshipScore: number;
  workConfidenceScore: number;
};

type StoredTask = {
  domain: FocusDomainType;
  completedAt: Date | null;
  skippedAt: Date | null;
};

type StoredDay = {
  dayNumber: number;
  status: DayStatus;
  dailyPlan: { tasks: StoredTask[] } | null;
  checkins: StoredCheckin[];
  recoveryEvent: {
    completedAt: Date | null;
    creditConsumedAt: Date | null;
  } | null;
};

function percentage(completed: number, total: number) {
  return total === 0 ? null : Math.round((completed / total) * 100);
}

function taskIsComplete(task: StoredTask) {
  return task.completedAt !== null && task.skippedAt === null;
}

function completionSummary(tasks: readonly StoredTask[]): CompletionSummary {
  const completed = tasks.filter(taskIsComplete).length;
  return {
    completed,
    total: tasks.length,
    percentage: percentage(completed, tasks.length),
  };
}

function average(values: readonly number[]) {
  if (values.length === 0) return null;
  return (
    Math.round(
      (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
    ) / 10
  );
}

function latestDailyCheckins(
  days: readonly StoredDay[],
  cycleStartDate: Date,
  throughDay: number,
) {
  const latest = new Map<number, StoredCheckin>();

  for (const day of days) {
    for (const checkin of day.checkins) {
      const dayNumber = calculateDayNumber(cycleStartDate, checkin.timestamp);
      if (dayNumber < 1 || dayNumber > throughDay) continue;

      const current = latest.get(dayNumber);
      if (
        !current ||
        checkin.timestamp > current.timestamp ||
        (checkin.timestamp.getTime() === current.timestamp.getTime() &&
          checkin.id.localeCompare(current.id) > 0)
      ) {
        latest.set(dayNumber, checkin);
      }
    }
  }

  return latest;
}

function buildWeek(
  weekNumber: number,
  dayFrom: number,
  dayTo: number,
  days: readonly StoredDay[],
  checkinsByDay: ReadonlyMap<number, StoredCheckin>,
): AnalyticsWeek {
  const windowDays = days.filter(
    (day) => day.dayNumber >= dayFrom && day.dayNumber <= dayTo,
  );
  const tasks = windowDays.flatMap((day) => day.dailyPlan?.tasks ?? []);
  const moodValues: number[] = [];
  const fogValues: number[] = [];

  for (let dayNumber = dayFrom; dayNumber <= dayTo; dayNumber += 1) {
    const checkin = checkinsByDay.get(dayNumber);
    if (checkin) {
      moodValues.push(checkin.moodScore);
      fogValues.push(checkin.fogScore);
    }
  }

  return {
    weekNumber,
    dayFrom,
    dayTo,
    finalizedDays: windowDays.filter((day) => day.status !== "UNSET").length,
    taskCompletionPercentage: completionSummary(tasks).percentage,
    averageMood: average(moodValues),
    averageFog: average(fogValues),
    recoveryCreditsUsed: windowDays.filter(
      (day) =>
        day.recoveryEvent !== null &&
        day.recoveryEvent.completedAt !== null &&
        day.recoveryEvent.creditConsumedAt !== null,
    ).length,
  };
}

function buildWeeklyComparison(
  throughDay: number,
  days: readonly StoredDay[],
  checkinsByDay: ReadonlyMap<number, StoredCheckin>,
): AnalyticsWeeklyComparison {
  if (throughDay < 8) {
    return {
      status: "unavailable",
      currentWeekNumber: throughDay < 1 ? null : 1,
    };
  }

  const currentWeekNumber = Math.ceil(throughDay / 7);
  const currentFrom = (currentWeekNumber - 1) * 7 + 1;
  const currentTo = Math.min(throughDay, 90);
  const elapsedDays = currentTo - currentFrom + 1;
  const previousFrom = currentFrom - 7;
  const previousTo = previousFrom + elapsedDays - 1;

  return {
    status: "ready",
    current: buildWeek(
      currentWeekNumber,
      currentFrom,
      currentTo,
      days,
      checkinsByDay,
    ),
    previous: buildWeek(
      currentWeekNumber - 1,
      previousFrom,
      previousTo,
      days,
      checkinsByDay,
    ),
  };
}

export async function getAnalyticsDashboard(
  database: AnalyticsDatabase,
  userId: string,
  now = new Date(),
): Promise<AnalyticsDashboard> {
  const activeCycle = await findSingularActiveCycle(database, userId);
  if (!activeCycle) return { status: "no_cycle" };

  await reconcileElapsedDayStatuses(database, userId, now, 90);
  await reconcileCurrentDayStatus(database, userId, now);

  const today = normalizeUtcDate(now);
  const cycleSummary = await database.resetCycle.findFirst({
    where: { id: activeCycle.id, userId, status: "ACTIVE" },
    select: { startDate: true },
  });
  if (!cycleSummary) return { status: "no_cycle" };

  const throughDay = Math.min(
    Math.max(calculateDayNumber(cycleSummary.startDate, today), 0),
    90,
  );
  const cycle = await database.resetCycle.findFirst({
    where: { id: activeCycle.id, userId, status: "ACTIVE" },
    select: {
      name: true,
      startDate: true,
      recoveryCreditLimit: true,
      dayLogs: {
        where: {
          dayNumber: { gte: 1, lte: throughDay },
          date: { lte: today },
        },
        orderBy: { dayNumber: "asc" },
        select: {
          dayNumber: true,
          status: true,
          dailyPlan: {
            select: {
              tasks: {
                orderBy: { sortOrder: "asc" },
                select: {
                  domain: true,
                  completedAt: true,
                  skippedAt: true,
                },
              },
            },
          },
          checkins: {
            orderBy: [{ timestamp: "asc" }, { id: "asc" }],
            select: {
              id: true,
              timestamp: true,
              moodScore: true,
              fogScore: true,
              digitalControlScore: true,
              learningResistanceScore: true,
              bodyRelationshipScore: true,
              workConfidenceScore: true,
            },
          },
          recoveryEvent: {
            select: { completedAt: true, creditConsumedAt: true },
          },
        },
      },
    },
  });
  if (!cycle) return { status: "no_cycle" };

  const days = cycle.dayLogs as StoredDay[];
  const statusCounts: Record<FinalizedDayStatus, number> = {
    GREEN: 0,
    YELLOW: 0,
    BLUE: 0,
    RED: 0,
    GOLD: 0,
  };
  for (const day of days) {
    if (day.status !== "UNSET") statusCounts[day.status] += 1;
  }

  const checkinsByDay = latestDailyCheckins(days, cycle.startDate, throughDay);
  const trends = ANALYTICS_TRENDS.map((definition): AnalyticsTrend => ({
    key: definition.key,
    label: definition.label,
    direction: definition.direction,
    points: [...checkinsByDay.entries()]
      .sort(([left], [right]) => left - right)
      .map(([dayNumber, checkin]) => ({
        dayNumber,
        value: checkin[definition.field],
      })),
  }));

  const tasks = days.flatMap((day) => day.dailyPlan?.tasks ?? []);
  const taskCompletion = completionSummary(tasks);
  const taskCompletionByDomain = Object.values(FocusDomain).flatMap(
    (domain) => {
      const domainTasks = tasks.filter((task) => task.domain === domain);
      return domainTasks.length === 0
        ? []
        : [{ domain, ...completionSummary(domainTasks) }];
    },
  );

  const completedQualifyingDays = days.filter(
    (day) =>
      day.recoveryEvent !== null && day.recoveryEvent.completedAt !== null,
  ).length;
  const creditsUsed = days.filter(
    (day) =>
      day.recoveryEvent !== null &&
      day.recoveryEvent.completedAt !== null &&
      day.recoveryEvent.creditConsumedAt !== null,
  ).length;

  return {
    status: "ready",
    today: today.toISOString().slice(0, 10),
    throughDay,
    cycleName: cycle.name,
    finalizedDayCount: Object.values(statusCounts).reduce(
      (total, count) => total + count,
      0,
    ),
    statusCounts,
    recovery: {
      creditLimit: cycle.recoveryCreditLimit,
      creditsUsed,
      creditsRemaining: Math.max(cycle.recoveryCreditLimit - creditsUsed, 0),
      completedQualifyingDays,
    },
    trends,
    weeklyComparison: buildWeeklyComparison(throughDay, days, checkinsByDay),
    taskCompletion,
    taskCompletionByDomain,
  };
}
