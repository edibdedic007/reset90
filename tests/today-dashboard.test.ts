import { describe, expect, it, vi } from "vitest";

import type { TodayDashboardDatabase } from "../src/server/dashboard/today";
import {
  getTodayDashboard,
  setTaskCompletion,
  setTodayEnergy,
} from "../src/server/dashboard/today";

const NOW = new Date("2026-07-08T12:34:00.000Z");
const TODAY = new Date("2026-07-08T00:00:00.000Z");

const baseTask = {
  id: "task-1",
  title: "Walk outside",
  domain: "BODY",
  tier: "MINIMUM",
  estimateMinutes: 10,
  trigger: "After coffee",
  why: "Build momentum",
  completedAt: null,
} as const;

const latestCheckin = {
  id: "checkin-1",
  kind: "MIDDAY",
  timestamp: new Date("2026-07-08T12:00:00.000Z"),
  energyLevel: "LOW",
  moodScore: 5,
  fogScore: 7,
  lonelinessScore: 4,
  selfCriticismScore: 6,
  digitalControlScore: 3,
  learningResistanceScore: 8,
  bodyRelationshipScore: 5,
  workConfidenceScore: 4,
  note: "Use the minimum plan.",
} as const;

function createDashboardDatabase() {
  const resetCycleFindFirst = vi.fn().mockResolvedValue({
    id: "cycle-1",
    name: "Reset90 Local Cycle",
    recoveryCreditLimit: 6,
    recoveryEvents: [],
    dayLogs: [
      {
        id: "day-3",
        date: TODAY,
        dayNumber: 3,
        status: "UNSET",
        energyLevel: "LOW",
        phase: {
          name: "Clear the Fog",
          description: "Reduce noise.",
        },
        dailyPlan: {
          id: "plan-1",
          mission: "Keep the day small and complete.",
          supportiveMessage: "Minimum still counts.",
          warnings: ["Protect energy."],
          downshiftRule: "Use the minimum plan when energy drops.",
          contextSummary: "Early cycle stabilization.",
          tasks: [
            {
              ...baseTask,
              id: "task-0",
              title: "Drink water",
              tier: "NON_NEGOTIABLE",
              sortOrder: 0,
            },
            { ...baseTask, sortOrder: 1 },
            {
              ...baseTask,
              id: "task-2",
              title: "Study block",
              domain: "LEARNING",
              tier: "STANDARD",
              completedAt: new Date("2026-07-08T13:00:00.000Z"),
              sortOrder: 2,
            },
          ],
        },
        checkins: [latestCheckin],
        recoveryEvent: null,
      },
    ],
  });

  return {
    database: {
      resetCycle: { findFirst: resetCycleFindFirst },
      task: { findFirst: vi.fn(), update: vi.fn() },
      dayLog: {
        findFirst: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
      },
      recoveryEvent: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    } as unknown as TodayDashboardDatabase,
    resetCycleFindFirst,
  };
}

describe("today dashboard", () => {
  it("derives current status without persisting from the read path", async () => {
    let storedStatus = "UNSET";
    const currentDay = {
      id: "day-3",
      cycleId: "cycle-1",
      date: TODAY,
      status: "UNSET",
      dailyPlan: {
        tasks: [
          { tier: "NON_NEGOTIABLE", completedAt: NOW, skippedAt: null },
          { tier: "MINIMUM", completedAt: NOW, skippedAt: null },
        ],
      },
      recoveryEvent: null,
    };
    const statusUpdate = vi.fn(({ data }) => {
      storedStatus = data.status;
      return { id: "day-3" };
    });
    const database = {
      dayLog: {
        findMany: vi.fn().mockResolvedValue([currentDay]),
        findFirst: vi.fn().mockResolvedValue({
          id: "day-3",
          cycleId: "cycle-1",
          status: "UNSET",
        }),
      },
      recoveryEvent: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback) =>
        callback({
          dayLog: {
            findUnique: vi.fn().mockResolvedValue(currentDay),
            findFirst: vi.fn().mockResolvedValue(null),
            update: statusUpdate,
          },
          recoveryEvent: { count: vi.fn() },
        }),
      ),
      resetCycle: {
        findFirst: vi.fn(async () => ({
          id: "cycle-1",
          name: "Reset90 Local Cycle",
          recoveryCreditLimit: 6,
          recoveryEvents: [],
          dayLogs: [
            {
              id: "day-3",
              date: TODAY,
              dayNumber: 3,
              status: storedStatus,
              energyLevel: null,
              phase: { name: "Clear the Fog", description: null },
              dailyPlan: null,
              checkins: [],
              recoveryEvent: null,
            },
          ],
        })),
      },
      task: { findFirst: vi.fn() },
    } as unknown as TodayDashboardDatabase;

    await expect(
      getTodayDashboard(database, "user-1", NOW),
    ).resolves.toMatchObject({
      status: "ready",
      day: { status: "YELLOW" },
    });
    expect(statusUpdate).not.toHaveBeenCalled();
  });

  it("loads the signed-in user's active day and groups imported plan tasks", async () => {
    const { database, resetCycleFindFirst } = createDashboardDatabase();

    const dashboard = await getTodayDashboard(database, "user-1", NOW);

    expect(resetCycleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", status: "ACTIVE" },
        orderBy: { startDate: "desc" },
      }),
    );
    expect(
      resetCycleFindFirst.mock.calls[0][0].select.dayLogs.where.date,
    ).toEqual(TODAY);
    expect(
      resetCycleFindFirst.mock.calls[0][0].select.dayLogs.select.checkins,
    ).toMatchObject({ orderBy: { timestamp: "desc" }, take: 1 });
    expect(dashboard.status).toBe("ready");

    if (dashboard.status !== "ready" || dashboard.plan === null) {
      throw new Error("Expected ready dashboard with plan");
    }

    expect(dashboard.day).toMatchObject({
      id: "day-3",
      dayNumber: 3,
      phase: { name: "Clear the Fog" },
      energyLevel: "LOW",
    });
    expect(dashboard.cycle).toMatchObject({
      recoveryCreditLimit: 6,
      recoveryCreditsUsed: 0,
      recoveryCreditsRemaining: 6,
    });
    expect(dashboard.plan.warnings).toEqual(["Protect energy."]);
    expect(dashboard.plan.tasksByTier.NON_NEGOTIABLE).toHaveLength(1);
    expect(dashboard.plan.tasksByTier.MINIMUM).toHaveLength(1);
    expect(dashboard.plan.tasksByTier.STANDARD).toHaveLength(1);
    expect(dashboard.plan.tasksByTier.IDEAL).toHaveLength(0);
    expect(dashboard.plan.tasksByTier.STANDARD[0].completedAt).toBe(
      "2026-07-08T13:00:00.000Z",
    );
    expect(dashboard.latestCheckin).toEqual({
      id: "checkin-1",
      kind: "MIDDAY",
      timestamp: "2026-07-08T12:00:00.000Z",
      energyLevel: "LOW",
      scores: {
        mood: 5,
        fog: 7,
        loneliness: 4,
        selfCriticism: 6,
        digitalControl: 3,
        learningResistance: 8,
        bodyRelationship: 5,
        workConfidence: 4,
      },
      note: "Use the minimum plan.",
    });
  });

  it("updates task completion only after finding an active user-owned task", async () => {
    const taskFindFirst = vi.fn().mockResolvedValue({
      id: "task-1",
      dailyPlan: { dayLog: { id: "day-3" } },
    });
    const taskUpdate = vi.fn().mockResolvedValue({
      ...baseTask,
      completedAt: NOW,
    });
    const database = {
      task: { findFirst: taskFindFirst, update: taskUpdate },
      $transaction: vi.fn(async (callback) =>
        callback({
          task: { update: taskUpdate },
          dayLog: {
            findUnique: vi.fn().mockResolvedValue({
              id: "day-3",
              cycleId: "cycle-1",
              date: TODAY,
              status: "UNSET",
              dailyPlan: { tasks: [] },
              recoveryEvent: null,
            }),
            findFirst: vi.fn().mockResolvedValue(null),
            update: vi.fn(),
          },
        }),
      ),
      recoveryEvent: { findUnique: vi.fn() },
    } as unknown as TodayDashboardDatabase;

    const result = await setTaskCompletion(
      database,
      "user-1",
      "task-1",
      true,
      NOW,
    );

    expect(taskFindFirst).toHaveBeenCalledWith({
      where: {
        id: "task-1",
        dailyPlan: {
          dayLog: {
            date: TODAY,
            cycle: { userId: "user-1", status: "ACTIVE" },
          },
        },
      },
      select: {
        id: true,
        dailyPlan: { select: { dayLog: { select: { id: true } } } },
      },
    });
    expect(taskUpdate).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { completedAt: NOW, skippedAt: null },
      select: expect.any(Object),
    });
    expect(result).toEqual({
      status: "updated",
      task: {
        ...baseTask,
        completedAt: "2026-07-08T12:34:00.000Z",
      },
      dayStatus: "UNSET",
    });
  });

  it("does not update tasks outside the signed-in user's active cycle", async () => {
    const taskFindFirst = vi.fn().mockResolvedValue(null);
    const taskUpdate = vi.fn();
    const database = {
      task: { findFirst: taskFindFirst, update: taskUpdate },
      $transaction: vi.fn(),
      recoveryEvent: { findUnique: vi.fn() },
    } as unknown as TodayDashboardDatabase;

    await expect(
      setTaskCompletion(database, "user-1", "task-2", false, NOW),
    ).resolves.toEqual({ status: "not_found" });
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it("updates today's energy for the signed-in user's active day", async () => {
    const dayLogFindFirst = vi.fn().mockResolvedValue({ id: "day-3" });
    const dayLogUpdate = vi
      .fn()
      .mockResolvedValue({ id: "day-3", energyLevel: "LOW" });
    const database = {
      dayLog: { findFirst: dayLogFindFirst, update: dayLogUpdate },
    } as unknown as TodayDashboardDatabase;

    const result = await setTodayEnergy(database, "user-1", "LOW", NOW);

    expect(dayLogFindFirst).toHaveBeenCalledWith({
      where: {
        date: TODAY,
        cycle: { userId: "user-1", status: "ACTIVE" },
      },
      select: { id: true },
    });
    expect(dayLogUpdate).toHaveBeenCalledWith({
      where: { id: "day-3" },
      data: { energyLevel: "LOW" },
      select: { id: true, energyLevel: true },
    });
    expect(result).toEqual({
      status: "updated",
      day: { id: "day-3", energyLevel: "LOW" },
    });
  });
});
