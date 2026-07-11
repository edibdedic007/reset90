import type { PrismaClient } from "@/generated/prisma/client";
import type {
  DayStatus,
  EnergyLevel,
  FocusDomain,
  TaskTier,
} from "@/generated/prisma/enums";
import { checkinSelect, toDayCheckin, type DayCheckin } from "../checkins";
import { normalizeUtcDate } from "../db/cycle";
import {
  reconcileDayStatusInTransaction,
  reconcileCurrentDayStatus,
  reconcileElapsedDayStatuses,
  toRecoveryEventSummary,
  type RecoveryEventSummary,
} from "../recovery/service";

export const ENERGY_LEVELS = [
  "BURNED_OUT",
  "LOW",
  "NORMAL",
  "HIGH",
  "RESTLESS_CHAOTIC",
] as const satisfies readonly EnergyLevel[];

export const TASK_TIERS = [
  "NON_NEGOTIABLE",
  "MINIMUM",
  "STANDARD",
  "IDEAL",
] as const satisfies readonly TaskTier[];

export type TodayDashboardDatabase = Pick<
  PrismaClient,
  "dayLog" | "resetCycle" | "task" | "recoveryEvent" | "$transaction"
>;

export type TodayTask = {
  id: string;
  title: string;
  domain: FocusDomain;
  tier: TaskTier;
  estimateMinutes: number | null;
  trigger: string | null;
  why: string | null;
  completedAt: string | null;
};

export type TodayTaskGroups = Record<TaskTier, TodayTask[]>;

export type TodayCycleSummary = {
  id: string;
  name: string;
  recoveryCreditLimit: number;
  recoveryCreditsUsed: number;
  recoveryCreditsRemaining: number;
};

export type TodayDaySummary = {
  id: string;
  date: string;
  dayNumber: number;
  status: DayStatus;
  energyLevel: EnergyLevel | null;
  phase: {
    name: string;
    description: string | null;
  };
  recoveryEvent: RecoveryEventSummary | null;
};

export type TodayPlan = {
  id: string;
  mission: string;
  supportiveMessage: string;
  warnings: string[];
  downshiftRule: string;
  contextSummary: string;
  tasksByTier: TodayTaskGroups;
};

export type TodayDashboard =
  | {
      status: "no_cycle";
      today: string;
    }
  | {
      status: "no_day";
      today: string;
      cycle: TodayCycleSummary;
    }
  | {
      status: "ready";
      today: string;
      cycle: TodayCycleSummary;
      day: TodayDaySummary;
      plan: TodayPlan | null;
      latestCheckin: DayCheckin | null;
    };

export type TaskCompletionResult =
  | { status: "not_found" }
  | { status: "updated"; task: TodayTask; dayStatus: DayStatus };

export type TodayEnergyResult =
  | { status: "not_found" }
  | {
      status: "updated";
      day: { id: string; energyLevel: EnergyLevel | null };
    };

type DashboardQueryTask = {
  id: string;
  title: string;
  domain: FocusDomain;
  tier: TaskTier;
  estimateMinutes: number | null;
  trigger: string | null;
  why: string | null;
  completedAt: Date | null;
};

const taskSelect = {
  id: true,
  title: true,
  domain: true,
  tier: true,
  estimateMinutes: true,
  trigger: true,
  why: true,
  completedAt: true,
} as const;

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function emptyTaskGroups(): TodayTaskGroups {
  return {
    NON_NEGOTIABLE: [],
    MINIMUM: [],
    STANDARD: [],
    IDEAL: [],
  };
}

function parseWarnings(warnings: unknown): string[] {
  if (!Array.isArray(warnings)) {
    return [];
  }

  return warnings.filter((warning): warning is string => {
    return typeof warning === "string" && warning.trim().length > 0;
  });
}

function toTask(task: DashboardQueryTask): TodayTask {
  return {
    ...task,
    completedAt: task.completedAt?.toISOString() ?? null,
  };
}

function groupTasks(tasks: DashboardQueryTask[]): TodayTaskGroups {
  const groups = emptyTaskGroups();

  for (const task of tasks) {
    groups[task.tier].push(toTask(task));
  }

  return groups;
}

function summarizeCycle(cycle: {
  id: string;
  name: string;
  recoveryCreditLimit: number;
  recoveryEvents: { id: string }[];
}): TodayCycleSummary {
  const recoveryCreditsUsed = cycle.recoveryEvents.length;

  return {
    id: cycle.id,
    name: cycle.name,
    recoveryCreditLimit: cycle.recoveryCreditLimit,
    recoveryCreditsUsed,
    recoveryCreditsRemaining: Math.max(
      cycle.recoveryCreditLimit - recoveryCreditsUsed,
      0,
    ),
  };
}

export function isEnergyLevel(value: unknown): value is EnergyLevel {
  return ENERGY_LEVELS.some((energyLevel) => energyLevel === value);
}

export async function getTodayDashboard(
  database: TodayDashboardDatabase,
  userId: string,
  now = new Date(),
): Promise<TodayDashboard> {
  const today = normalizeUtcDate(now);
  const todayIso = toIsoDate(today);

  await reconcileElapsedDayStatuses(database, userId, now);
  await reconcileCurrentDayStatus(database, userId, now);

  const cycle = await database.resetCycle.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    select: {
      id: true,
      name: true,
      recoveryCreditLimit: true,
      recoveryEvents: {
        where: { creditConsumedAt: { not: null } },
        select: { id: true },
      },
      dayLogs: {
        where: { date: today },
        take: 1,
        select: {
          id: true,
          date: true,
          dayNumber: true,
          status: true,
          energyLevel: true,
          phase: {
            select: {
              name: true,
              description: true,
            },
          },
          dailyPlan: {
            select: {
              id: true,
              mission: true,
              supportiveMessage: true,
              warnings: true,
              downshiftRule: true,
              contextSummary: true,
              tasks: {
                orderBy: { sortOrder: "asc" },
                select: taskSelect,
              },
            },
          },
          checkins: {
            orderBy: { timestamp: "desc" },
            take: 1,
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
        },
      },
    },
  });

  if (!cycle) {
    return { status: "no_cycle", today: todayIso };
  }

  const cycleSummary = summarizeCycle(cycle);
  const dayLog = cycle.dayLogs[0];

  if (!dayLog) {
    return { status: "no_day", today: todayIso, cycle: cycleSummary };
  }

  return {
    status: "ready",
    today: todayIso,
    cycle: cycleSummary,
    day: {
      id: dayLog.id,
      date: toIsoDate(dayLog.date),
      dayNumber: dayLog.dayNumber,
      status: dayLog.status,
      energyLevel: dayLog.energyLevel,
      phase: dayLog.phase,
      recoveryEvent: dayLog.recoveryEvent
        ? toRecoveryEventSummary(dayLog.recoveryEvent)
        : null,
    },
    plan: dayLog.dailyPlan
      ? {
          id: dayLog.dailyPlan.id,
          mission: dayLog.dailyPlan.mission,
          supportiveMessage: dayLog.dailyPlan.supportiveMessage,
          warnings: parseWarnings(dayLog.dailyPlan.warnings),
          downshiftRule: dayLog.dailyPlan.downshiftRule,
          contextSummary: dayLog.dailyPlan.contextSummary,
          tasksByTier: groupTasks(dayLog.dailyPlan.tasks),
        }
      : null,
    latestCheckin: dayLog.checkins[0] ? toDayCheckin(dayLog.checkins[0]) : null,
  };
}

export async function setTaskCompletion(
  database: TodayDashboardDatabase,
  userId: string,
  taskId: string,
  completed: boolean,
  now = new Date(),
): Promise<TaskCompletionResult> {
  const today = normalizeUtcDate(now);
  const task = await database.task.findFirst({
    where: {
      id: taskId,
      dailyPlan: {
        dayLog: {
          date: today,
          cycle: { userId, status: "ACTIVE" },
        },
      },
    },
    select: {
      id: true,
      dailyPlan: { select: { dayLog: { select: { id: true } } } },
    },
  });

  if (!task) {
    return { status: "not_found" };
  }

  const result = await database.$transaction(async (transaction) => {
    const updatedTask = await transaction.task.update({
      where: { id: task.id },
      data: completed
        ? { completedAt: now, skippedAt: null }
        : { completedAt: null },
      select: taskSelect,
    });
    const dayStatus = await reconcileDayStatusInTransaction(
      transaction,
      task.dailyPlan.dayLog.id,
      now,
    );

    return { updatedTask, dayStatus: dayStatus ?? "UNSET" };
  });

  return {
    status: "updated",
    task: toTask(result.updatedTask),
    dayStatus: result.dayStatus,
  };
}

export async function setTodayEnergy(
  database: TodayDashboardDatabase,
  userId: string,
  energyLevel: EnergyLevel | null,
  now = new Date(),
): Promise<TodayEnergyResult> {
  const today = normalizeUtcDate(now);
  const dayLog = await database.dayLog.findFirst({
    where: {
      date: today,
      cycle: { userId, status: "ACTIVE" },
    },
    select: { id: true },
  });

  if (!dayLog) {
    return { status: "not_found" };
  }

  const updatedDay = await database.dayLog.update({
    where: { id: dayLog.id },
    data: { energyLevel },
    select: {
      id: true,
      energyLevel: true,
    },
  });

  return {
    status: "updated",
    day: updatedDay,
  };
}
