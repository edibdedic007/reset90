import type { DayStatus, TaskTier } from "@/generated/prisma/enums";

export type DayStatusTask = {
  tier: TaskTier;
  completedAt: Date | null;
  skippedAt: Date | null;
};

export type DayStatusRecovery = {
  completedAt: Date | null;
  creditConsumedAt: Date | null;
} | null;

export type CalculateDayStatusInput = {
  date: Date;
  now: Date;
  previousStatus: DayStatus | null;
  tasks: readonly DayStatusTask[];
  recovery: DayStatusRecovery;
};

export const DAY_STATUS_PRECEDENCE: readonly DayStatus[] = [
  "GOLD",
  "GREEN",
  "BLUE",
  "YELLOW",
  "RED",
  "UNSET",
];

function isCompleted(task: DayStatusTask) {
  return task.completedAt !== null && task.skippedAt === null;
}

function tierQualifies(tasks: readonly DayStatusTask[], tier: TaskTier) {
  const nonNegotiables = tasks.filter((task) => task.tier === "NON_NEGOTIABLE");
  const tierTasks = tasks.filter((task) => task.tier === tier);

  return (
    tierTasks.length > 0 &&
    nonNegotiables.every(isCompleted) &&
    tierTasks.every(isCompleted)
  );
}

function normalStatus(tasks: readonly DayStatusTask[]): DayStatus | null {
  if (tierQualifies(tasks, "STANDARD") || tierQualifies(tasks, "IDEAL")) {
    return "GREEN";
  }

  if (tierQualifies(tasks, "MINIMUM")) {
    return "YELLOW";
  }

  return null;
}

export function calculateDayStatus({
  date,
  now,
  previousStatus,
  tasks,
  recovery,
}: CalculateDayStatusInput): DayStatus {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

  if (target > today) {
    return "UNSET";
  }

  const normal = normalStatus(tasks);
  const recoveryCompleted = recovery !== null && recovery.completedAt !== null;
  const recoveryCredited =
    recoveryCompleted && recovery.creditConsumedAt !== null;
  const comebackEligible =
    previousStatus === "RED" || previousStatus === "BLUE";

  if (normal !== null && comebackEligible) {
    return "GOLD";
  }

  if (normal === "GREEN") {
    return "GREEN";
  }

  if (recoveryCredited) {
    return "BLUE";
  }

  if (normal === "YELLOW" || recoveryCompleted) {
    return "YELLOW";
  }

  return target < today ? "RED" : "UNSET";
}
