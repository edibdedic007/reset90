import { describe, expect, it, vi } from "vitest";

import { buildDayAriaLabel } from "../src/lib/day-status-presentation";
import {
  getDayDetail,
  getProgressDashboard,
  parseDayNumber,
  type ProgressDatabase,
} from "../src/server/progress";

const NOW = new Date("2026-07-01T12:00:00.000Z");
const START = new Date("2026-07-01T00:00:00.000Z");

function databaseWithCycle(cycle: unknown) {
  const resetCycleFindFirst = vi.fn().mockResolvedValue(cycle);
  const dayLogFindMany = vi.fn().mockResolvedValue([]);
  const dayLogFindFirst = vi.fn().mockResolvedValue(null);

  return {
    database: {
      resetCycle: { findFirst: resetCycleFindFirst },
      dayLog: {
        findMany: dayLogFindMany,
        findFirst: dayLogFindFirst,
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      recoveryEvent: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    } as unknown as ProgressDatabase,
    dayLogFindMany,
    resetCycleFindFirst,
  };
}

function gridCycle(
  options: {
    startDate?: Date;
    dayLogs?: { dayNumber: number; date: Date; status: string }[];
    creditedEvents?: number;
    recoveryCreditLimit?: number;
  } = {},
) {
  return {
    name: "My Reset",
    startDate: options.startDate ?? START,
    recoveryCreditLimit: options.recoveryCreditLimit ?? 6,
    recoveryEvents: Array.from(
      { length: options.creditedEvents ?? 0 },
      (_, index) => ({ id: `recovery-${index + 1}` }),
    ),
    dayLogs: options.dayLogs ?? [],
  };
}

describe("progress dashboard", () => {
  it("builds exactly 90 ordered positions and preserves missing logs as unavailable", async () => {
    const { database } = databaseWithCycle(
      gridCycle({
        dayLogs: [
          {
            dayNumber: 90,
            date: new Date("2026-09-28T00:00:00Z"),
            status: "GOLD",
          },
          { dayNumber: 1, date: START, status: "UNSET" },
        ],
      }),
    );

    const result = await getProgressDashboard(database, "user-1", NOW);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("Expected ready dashboard");

    expect(result.days).toHaveLength(90);
    expect(result.days.map((day) => day.dayNumber)).toEqual(
      Array.from({ length: 90 }, (_, index) => index + 1),
    );
    expect(result.days[0]).toMatchObject({
      dayNumber: 1,
      date: "2026-07-01",
      status: "UNSET",
      isAvailable: true,
      isCurrent: true,
    });
    expect(result.days[1]).toMatchObject({
      dayNumber: 2,
      date: "2026-07-02",
      status: null,
      isAvailable: false,
    });
    expect(result.days[89]).toMatchObject({
      dayNumber: 90,
      date: "2026-09-28",
      status: "GOLD",
    });
    expect(result.unavailableCount).toBe(88);
  });

  it("derives counts from rendered summaries and clamps completed credited recovery use", async () => {
    const statuses = [
      "GREEN",
      "YELLOW",
      "BLUE",
      "RED",
      "GOLD",
      "UNSET",
    ] as const;
    const dayLogs = statuses.map((status, index) => ({
      dayNumber: index + 1,
      date: new Date(Date.UTC(2026, 6, index + 1)),
      status,
    }));
    const { database, resetCycleFindFirst } = databaseWithCycle(
      gridCycle({
        dayLogs,
        creditedEvents: 8,
        recoveryCreditLimit: 6,
      }),
    );

    const result = await getProgressDashboard(database, "user-1", NOW);
    if (result.status !== "ready") throw new Error("Expected ready dashboard");

    expect(result.statusCounts).toEqual({
      GREEN: 1,
      YELLOW: 1,
      BLUE: 1,
      RED: 1,
      GOLD: 1,
      UNSET: 1,
    });
    expect(result.cycle).toMatchObject({
      recoveryCreditsUsed: 8,
      recoveryCreditsRemaining: 0,
    });
    const query = resetCycleFindFirst.mock.calls[0][0];
    expect(query.where).toEqual({ userId: "user-1", status: "ACTIVE" });
    expect(query.select.recoveryEvents.where).toEqual({
      completedAt: { not: null },
      creditConsumedAt: { not: null },
    });
  });

  it.each([
    [new Date("2026-06-30T12:00:00Z"), null],
    [new Date("2026-07-01T12:00:00Z"), 1],
    [new Date("2026-09-28T12:00:00Z"), 90],
    [new Date("2026-09-29T12:00:00Z"), null],
  ])("marks current day only inside cycle at %s", async (now, expectedDay) => {
    const dayLogs = Array.from({ length: 90 }, (_, index) => ({
      dayNumber: index + 1,
      date: new Date(Date.UTC(2026, 6, index + 1)),
      status: "UNSET",
    }));
    const { database } = databaseWithCycle(gridCycle({ dayLogs }));

    const result = await getProgressDashboard(database, "user-1", now);
    if (result.status !== "ready") throw new Error("Expected ready dashboard");

    expect(
      result.days.filter((day) => day.isCurrent).map((day) => day.dayNumber),
    ).toEqual(expectedDay === null ? [] : [expectedDay]);
  });

  it("requests all elapsed reconciliation candidates through Phase 11 boundary", async () => {
    const { database, dayLogFindMany } = databaseWithCycle(gridCycle());
    await getProgressDashboard(database, "user-7", NOW);

    expect(dayLogFindMany).toHaveBeenCalledWith({
      where: {
        date: { lt: START },
        status: "UNSET",
        cycle: { userId: "user-7", status: "ACTIVE" },
      },
      orderBy: { date: "asc" },
      take: 90,
      select: { id: true },
    });
  });

  it("returns and counts statuses persisted by Phase 11 reconciliation", async () => {
    const now = new Date("2026-07-03T12:00:00.000Z");
    const storedDays = [
      {
        id: "day-1",
        cycleId: "cycle-1",
        dayNumber: 1,
        date: new Date("2026-07-01T00:00:00.000Z"),
        status: "UNSET",
        dailyPlan: { tasks: [] },
        recoveryEvent: null,
      },
      {
        id: "day-2",
        cycleId: "cycle-1",
        dayNumber: 2,
        date: new Date("2026-07-02T00:00:00.000Z"),
        status: "UNSET",
        dailyPlan: {
          tasks: [
            {
              tier: "NON_NEGOTIABLE",
              completedAt: now,
              skippedAt: null,
            },
            { tier: "MINIMUM", completedAt: now, skippedAt: null },
          ],
        },
        recoveryEvent: null,
      },
      {
        id: "day-3",
        cycleId: "cycle-1",
        dayNumber: 3,
        date: new Date("2026-07-03T00:00:00.000Z"),
        status: "UNSET",
        dailyPlan: { tasks: [] },
        recoveryEvent: null,
      },
      {
        id: "day-4",
        cycleId: "cycle-1",
        dayNumber: 4,
        date: new Date("2026-07-04T00:00:00.000Z"),
        status: "UNSET",
        dailyPlan: { tasks: [] },
        recoveryEvent: null,
      },
    ];
    const dayLogFindMany = vi.fn().mockImplementation(() =>
      storedDays
        .filter((day) => day.date < new Date("2026-07-03T00:00:00.000Z"))
        .filter((day) => day.status === "UNSET")
        .map(({ id }) => ({ id })),
    );
    const dayLogUpdate = vi.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: { status: string };
      }) => {
        const day = storedDays.find((candidate) => candidate.id === where.id);
        if (!day) throw new Error(`Missing mocked day ${where.id}`);
        day.status = data.status;
        return { id: day.id };
      },
    );
    const transaction = {
      dayLog: {
        findUnique: vi.fn(({ where }: { where: { id: string } }) =>
          storedDays.find((day) => day.id === where.id),
        ),
        findFirst: vi.fn(
          ({ where }: { where: { cycleId: string; date: { lt: Date } } }) =>
            storedDays
              .filter(
                (day) =>
                  day.cycleId === where.cycleId && day.date < where.date.lt,
              )
              .sort(
                (left, right) => right.date.getTime() - left.date.getTime(),
              )[0] ?? null,
        ),
        update: dayLogUpdate,
      },
      recoveryEvent: { count: vi.fn() },
    };
    const database = {
      resetCycle: {
        findFirst: vi.fn(() => ({
          name: "My Reset",
          startDate: START,
          recoveryCreditLimit: 6,
          recoveryEvents: [],
          dayLogs: storedDays,
        })),
      },
      dayLog: {
        findMany: dayLogFindMany,
        findFirst: vi.fn(({ where }: { where: { date: Date } }) => {
          const day = storedDays.find(
            (candidate) => candidate.date.getTime() === where.date.getTime(),
          );
          return day
            ? { id: day.id, cycleId: day.cycleId, status: day.status }
            : null;
        }),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      recoveryEvent: { findUnique: vi.fn() },
      $transaction: vi.fn((callback: (client: typeof transaction) => unknown) =>
        callback(transaction),
      ),
    } as unknown as ProgressDatabase;

    const result = await getProgressDashboard(database, "user-1", now);
    if (result.status !== "ready") throw new Error("Expected ready dashboard");

    expect(dayLogFindMany).toHaveBeenCalledWith({
      where: {
        date: { lt: new Date("2026-07-03T00:00:00.000Z") },
        status: "UNSET",
        cycle: { userId: "user-1", status: "ACTIVE" },
      },
      orderBy: { date: "asc" },
      take: 90,
      select: { id: true },
    });
    expect(dayLogUpdate).toHaveBeenCalledTimes(2);
    expect(storedDays.map((day) => day.status)).toEqual([
      "RED",
      "GOLD",
      "UNSET",
      "UNSET",
    ]);
    expect(result.days.slice(0, 4).map((day) => day.status)).toEqual([
      "RED",
      "GOLD",
      "UNSET",
      "UNSET",
    ]);
    expect(result.statusCounts).toEqual({
      GREEN: 0,
      YELLOW: 0,
      BLUE: 0,
      RED: 1,
      GOLD: 1,
      UNSET: 2,
    });
  });
});

describe("day detail", () => {
  it.each(["0", "01", "1.5", "91", "other"])(
    "rejects invalid day number %s",
    (value) => {
      expect(parseDayNumber(value)).toBeNull();
    },
  );

  it("accepts day 1 and day 90", () => {
    expect(parseDayNumber("1")).toBe(1);
    expect(parseDayNumber("90")).toBe(90);
  });

  it("scopes detail to authenticated active cycle and preserves ordering", async () => {
    const cycle = {
      name: "My Reset",
      startDate: START,
      dayLogs: [
        {
          date: START,
          dayNumber: 1,
          status: "YELLOW",
          energyLevel: "LOW",
          phase: { name: "Clear the Fog", description: null },
          dailyPlan: {
            mission: "Keep moving.",
            supportiveMessage: "Minimum still counts.",
            warnings: [],
            downshiftRule: "Use minimum.",
            contextSummary: "Day one.",
            tasks: [
              {
                id: "task-1",
                title: "Drink water",
                description: null,
                domain: "BODY",
                tier: "MINIMUM",
                estimateMinutes: 2,
                trigger: null,
                why: null,
                completedAt: NOW,
                skippedAt: null,
                notes: null,
              },
            ],
          },
          checkins: [
            {
              id: "checkin-1",
              kind: "MORNING",
              timestamp: NOW,
              energyLevel: "LOW",
              moodScore: 5,
              fogScore: 6,
              lonelinessScore: 4,
              selfCriticismScore: 5,
              digitalControlScore: 4,
              learningResistanceScore: 6,
              bodyRelationshipScore: 5,
              workConfidenceScore: 4,
              note: null,
            },
          ],
          recoveryEvent: null,
        },
      ],
    };
    const { database, resetCycleFindFirst } = databaseWithCycle(cycle);

    const result = await getDayDetail(database, "user-2", 1, NOW);
    expect(result).toMatchObject({
      status: "ready",
      day: { dayNumber: 1, status: "YELLOW", isCurrent: true },
      reflection: null,
    });

    const query = resetCycleFindFirst.mock.calls[0][0];
    expect(query.where).toEqual({ userId: "user-2", status: "ACTIVE" });
    expect(query.select.dayLogs.where).toEqual({ dayNumber: 1 });
    expect(query.select.dayLogs.select.dailyPlan.select.tasks.orderBy).toEqual({
      sortOrder: "asc",
    });
    expect(query.select.dayLogs.select.checkins.orderBy).toEqual({
      timestamp: "desc",
    });
  });

  it("returns controlled unavailable state for a missing expected day", async () => {
    const { database } = databaseWithCycle(gridCycle());

    await expect(getDayDetail(database, "user-1", 2, NOW)).resolves.toEqual({
      status: "unavailable",
      today: "2026-07-01",
      dayNumber: 2,
      date: "2026-07-02",
      cycleName: "My Reset",
      isCurrent: false,
    });
  });

  it("returns calm empty optional data without raw reflection access", async () => {
    const { database } = databaseWithCycle({
      name: "My Reset",
      startDate: START,
      dayLogs: [
        {
          date: START,
          dayNumber: 1,
          status: "UNSET",
          energyLevel: null,
          phase: { name: "Clear the Fog", description: null },
          dailyPlan: null,
          checkins: [],
          recoveryEvent: null,
        },
      ],
    });

    const result = await getDayDetail(database, "user-1", 1, NOW);
    expect(result).toMatchObject({
      status: "ready",
      plan: null,
      checkins: [],
      recoveryEvent: null,
      reflection: null,
    });
  });
});

describe("progress accessibility", () => {
  it("labels day, date, status, and current-day state without color", () => {
    expect(
      buildDayAriaLabel({
        dayNumber: 1,
        date: "2026-07-01",
        status: "GREEN",
        isCurrent: true,
      }),
    ).toBe("Day 1, 2026-07-01, status Green, current day");
    expect(
      buildDayAriaLabel({
        dayNumber: 2,
        date: "2026-07-02",
        status: null,
        isCurrent: false,
      }),
    ).toBe("Day 2, 2026-07-02, status Unavailable");
  });
});
