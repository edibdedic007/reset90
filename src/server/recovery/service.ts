import type { PrismaClient } from "@/generated/prisma/client";
import type { DayStatus } from "@/generated/prisma/enums";
import { normalizeUtcDate } from "../db/cycle";

import {
  RECOVERY_ACTIONS,
  isRecoveryActionId,
  recoveryActionsMeetRequirements,
  type RecoveryActionId,
} from "./actions";
import { calculateDayStatus } from "./day-status";

export type RecoveryDatabase = Pick<
  PrismaClient,
  "dayLog" | "recoveryEvent" | "$transaction"
>;

export type RecoveryTransaction = Pick<
  PrismaClient,
  "dayLog" | "recoveryEvent"
>;

export type RecoveryEventSummary = {
  id: string;
  selectedActionIds: RecoveryActionId[];
  completedAt: string | null;
  creditConsumedAt: string | null;
};

export type RecoveryCreditSummary = {
  recoveryCreditLimit: number;
  recoveryCreditsUsed: number;
  recoveryCreditsRemaining: number;
};

export type RecoveryStartResult =
  | { status: "not_found" }
  | { status: "started" | "existing"; event: RecoveryEventSummary };

export type RecoveryCompletionResult =
  | { status: "not_found" }
  | { status: "not_started" }
  | { status: "invalid_actions" }
  | {
      status: "completed" | "already_completed";
      event: RecoveryEventSummary;
      dayStatus: DayStatus;
      recoveryCredits: RecoveryCreditSummary;
    };

export type RecoveryActionUpdateResult =
  | { status: "not_found" }
  | { status: "not_started" }
  | { status: "completed"; event: RecoveryEventSummary }
  | { status: "updated"; event: RecoveryEventSummary };

const recoveryEventSelect = {
  id: true,
  selectedActionIds: true,
  completedAt: true,
  creditConsumedAt: true,
} as const;

function selectedActionIds(value: unknown): RecoveryActionId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const selected = value.filter(
    (actionId): actionId is RecoveryActionId =>
      typeof actionId === "string" && isRecoveryActionId(actionId),
  );

  return RECOVERY_ACTIONS.filter((action) => selected.includes(action.id)).map(
    (action) => action.id,
  );
}

export function parseRecoveryActionIds(
  value: unknown,
): RecoveryActionId[] | null {
  if (!Array.isArray(value) || value.length > RECOVERY_ACTIONS.length) {
    return null;
  }

  if (
    !value.every(
      (actionId) =>
        typeof actionId === "string" && isRecoveryActionId(actionId),
    )
  ) {
    return null;
  }

  if (new Set(value).size !== value.length) {
    return null;
  }

  return selectedActionIds(value);
}

export function toRecoveryEventSummary(event: {
  id: string;
  selectedActionIds: unknown;
  completedAt: Date | null;
  creditConsumedAt: Date | null;
}): RecoveryEventSummary {
  return {
    id: event.id,
    selectedActionIds: selectedActionIds(event.selectedActionIds),
    completedAt: event.completedAt?.toISOString() ?? null,
    creditConsumedAt: event.creditConsumedAt?.toISOString() ?? null,
  };
}

async function getRecoveryCreditSummary(
  transaction: RecoveryTransaction,
  cycleId: string,
  recoveryCreditLimit: number,
): Promise<RecoveryCreditSummary> {
  const recoveryCreditsUsed = await transaction.recoveryEvent.count({
    where: { cycleId, creditConsumedAt: { not: null } },
  });

  return {
    recoveryCreditLimit,
    recoveryCreditsUsed,
    recoveryCreditsRemaining: Math.max(
      recoveryCreditLimit - recoveryCreditsUsed,
      0,
    ),
  };
}

export async function reconcileDayStatusInTransaction(
  transaction: RecoveryTransaction,
  dayLogId: string,
  now: Date,
) {
  const dayLog = await transaction.dayLog.findUnique({
    where: { id: dayLogId },
    select: {
      id: true,
      cycleId: true,
      date: true,
      status: true,
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

  if (!dayLog) {
    return null;
  }

  const previousDay = await transaction.dayLog.findFirst({
    where: { cycleId: dayLog.cycleId, date: { lt: dayLog.date } },
    orderBy: { date: "desc" },
    select: {
      date: true,
      status: true,
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

  let previousStatus = previousDay?.status ?? null;
  if (
    previousDay?.status === "UNSET" &&
    previousDay.date < normalizeUtcDate(now)
  ) {
    previousStatus = calculateDayStatus({
      date: previousDay.date,
      now,
      previousStatus: null,
      tasks: previousDay.dailyPlan?.tasks ?? [],
      recovery: previousDay.recoveryEvent,
    });
  }

  const status = calculateDayStatus({
    date: dayLog.date,
    now,
    previousStatus,
    tasks: dayLog.dailyPlan?.tasks ?? [],
    recovery: dayLog.recoveryEvent,
  });

  if (status !== dayLog.status) {
    await transaction.dayLog.update({
      where: { id: dayLog.id },
      data: { status },
      select: { id: true },
    });
  }

  return status;
}

export async function reconcileDayStatus(
  database: RecoveryDatabase,
  dayLogId: string,
  now = new Date(),
) {
  return database.$transaction((transaction) =>
    reconcileDayStatusInTransaction(transaction, dayLogId, now),
  );
}

export async function reconcileElapsedDayStatuses(
  database: RecoveryDatabase,
  userId: string,
  now = new Date(),
  limit = 7,
) {
  const elapsed = await database.dayLog.findMany({
    where: {
      date: { lt: normalizeUtcDate(now) },
      status: "UNSET",
      cycle: { userId, status: "ACTIVE" },
    },
    orderBy: { date: "asc" },
    take: limit,
    select: { id: true },
  });

  for (const dayLog of elapsed) {
    await reconcileDayStatus(database, dayLog.id, now);
  }
}

async function findCurrentDay(
  database: RecoveryDatabase,
  userId: string,
  now: Date,
) {
  return database.dayLog.findFirst({
    where: {
      date: normalizeUtcDate(now),
      cycle: { userId, status: "ACTIVE" },
    },
    select: { id: true, cycleId: true, status: true },
  });
}

export async function reconcileCurrentDayStatus(
  database: RecoveryDatabase,
  userId: string,
  now = new Date(),
) {
  const dayLog = await findCurrentDay(database, userId, now);
  if (!dayLog || dayLog.status !== "UNSET") {
    return null;
  }

  return reconcileDayStatus(database, dayLog.id, now);
}

export async function startTodayRecovery(
  database: RecoveryDatabase,
  userId: string,
  now = new Date(),
): Promise<RecoveryStartResult> {
  const dayLog = await findCurrentDay(database, userId, now);
  if (!dayLog) {
    return { status: "not_found" };
  }

  const existing = await database.recoveryEvent.findUnique({
    where: { dayLogId: dayLog.id },
    select: recoveryEventSelect,
  });
  if (existing) {
    return { status: "existing", event: toRecoveryEventSummary(existing) };
  }

  const event = await database.$transaction((transaction) =>
    transaction.recoveryEvent.upsert({
      where: { dayLogId: dayLog.id },
      create: { dayLogId: dayLog.id, cycleId: dayLog.cycleId },
      update: {},
      select: recoveryEventSelect,
    }),
  );

  return {
    status: "started",
    event: toRecoveryEventSummary(event),
  };
}

export async function completeTodayRecovery(
  database: RecoveryDatabase,
  userId: string,
  actionIds: readonly RecoveryActionId[],
  now = new Date(),
): Promise<RecoveryCompletionResult> {
  if (!recoveryActionsMeetRequirements(actionIds)) {
    return { status: "invalid_actions" };
  }

  const dayLog = await findCurrentDay(database, userId, now);
  if (!dayLog) {
    return { status: "not_found" };
  }

  return database.$transaction(async (transaction) => {
    const event = await transaction.recoveryEvent.findUnique({
      where: { dayLogId: dayLog.id },
      select: {
        ...recoveryEventSelect,
        cycleId: true,
        cycle: { select: { recoveryCreditLimit: true } },
      },
    });

    if (!event) {
      return { status: "not_started" };
    }

    if (event.completedAt) {
      const dayStatus = await reconcileDayStatusInTransaction(
        transaction,
        dayLog.id,
        now,
      );
      const recoveryCredits = await getRecoveryCreditSummary(
        transaction,
        event.cycleId,
        event.cycle.recoveryCreditLimit,
      );
      return {
        status: "already_completed",
        event: toRecoveryEventSummary(event),
        dayStatus: dayStatus ?? "UNSET",
        recoveryCredits,
      };
    }

    const creditsUsed = await transaction.recoveryEvent.count({
      where: { cycleId: event.cycleId, creditConsumedAt: { not: null } },
    });
    const creditConsumedAt =
      creditsUsed < event.cycle.recoveryCreditLimit ? now : null;
    const updated = await transaction.recoveryEvent.updateMany({
      where: { id: event.id, completedAt: null },
      data: {
        selectedActionIds: [...actionIds],
        completedAt: now,
        creditConsumedAt,
      },
    });
    if (updated.count === 0) {
      const completedEvent = await transaction.recoveryEvent.findUnique({
        where: { id: event.id },
        select: recoveryEventSelect,
      });
      const dayStatus = await reconcileDayStatusInTransaction(
        transaction,
        dayLog.id,
        now,
      );
      const recoveryCredits = await getRecoveryCreditSummary(
        transaction,
        event.cycleId,
        event.cycle.recoveryCreditLimit,
      );

      return {
        status: "already_completed",
        event: toRecoveryEventSummary(completedEvent ?? event),
        dayStatus: dayStatus ?? "UNSET",
        recoveryCredits,
      };
    }
    const completed = await transaction.recoveryEvent.findUnique({
      where: { id: event.id },
      select: recoveryEventSelect,
    });
    const dayStatus = await reconcileDayStatusInTransaction(
      transaction,
      dayLog.id,
      now,
    );
    const recoveryCredits = await getRecoveryCreditSummary(
      transaction,
      event.cycleId,
      event.cycle.recoveryCreditLimit,
    );

    return {
      status: "completed",
      event: toRecoveryEventSummary(completed ?? event),
      dayStatus: dayStatus ?? "UNSET",
      recoveryCredits,
    };
  });
}

export async function updateTodayRecoveryActions(
  database: RecoveryDatabase,
  userId: string,
  actionIds: readonly RecoveryActionId[],
  now = new Date(),
): Promise<RecoveryActionUpdateResult> {
  const dayLog = await findCurrentDay(database, userId, now);
  if (!dayLog) {
    return { status: "not_found" };
  }

  return database.$transaction(async (transaction) => {
    const event = await transaction.recoveryEvent.findUnique({
      where: { dayLogId: dayLog.id },
      select: recoveryEventSelect,
    });
    if (!event) {
      return { status: "not_started" };
    }
    if (event.completedAt) {
      return { status: "completed", event: toRecoveryEventSummary(event) };
    }

    const updated = await transaction.recoveryEvent.updateMany({
      where: { id: event.id, completedAt: null },
      data: { selectedActionIds: [...actionIds] },
    });
    const latest = await transaction.recoveryEvent.findUnique({
      where: { id: event.id },
      select: recoveryEventSelect,
    });

    if (updated.count === 0 || latest?.completedAt) {
      return {
        status: "completed",
        event: toRecoveryEventSummary(latest ?? event),
      };
    }

    return {
      status: "updated",
      event: toRecoveryEventSummary(latest ?? event),
    };
  });
}
