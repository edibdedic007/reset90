import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pageMocks = vi.hoisted(() => ({
  getReadOnlyBrowserSession: vi.fn(),
  getPrismaClient: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  getReadOnlyBrowserSession: pageMocks.getReadOnlyBrowserSession,
}));

vi.mock("@/server/db/client", () => ({
  getPrismaClient: pageMocks.getPrismaClient,
}));

vi.mock("@/auth", () => ({ signOut: vi.fn() }));

vi.mock("next/navigation", () => ({ redirect: pageMocks.redirect }));

import AnalyticsPage from "../src/app/analytics/page";
import { AnalyticsDashboardView } from "../src/components/analytics-dashboard";
import { AppShell } from "../src/components/app-shell";
import {
  getAnalyticsDashboard,
  type AnalyticsDashboard,
  type AnalyticsDatabase,
} from "../src/server/analytics";

const START = new Date("2026-07-01T00:00:00.000Z");

type TestCheckin = {
  id: string;
  timestamp: Date;
  moodScore: number;
  fogScore: number;
  digitalControlScore: number;
  learningResistanceScore: number;
  bodyRelationshipScore: number;
  workConfidenceScore: number;
};

type TestTask = {
  domain:
    | "BODY"
    | "MOOD"
    | "DIGITAL"
    | "LEARNING"
    | "WORK"
    | "SYSTEM"
    | "ENVIRONMENT"
    | "SOCIAL"
    | "OTHER";
  completedAt: Date | null;
  skippedAt: Date | null;
};

type TestDay = {
  dayNumber: number;
  status: "GREEN" | "YELLOW" | "BLUE" | "RED" | "GOLD" | "UNSET";
  dailyPlan: { tasks: TestTask[] } | null;
  checkins: TestCheckin[];
  recoveryEvent: {
    completedAt: Date | null;
    creditConsumedAt: Date | null;
  } | null;
};

function task(
  domain: TestTask["domain"],
  state: "complete" | "incomplete" | "skipped" | "complete_and_skipped",
): TestTask {
  return {
    domain,
    completedAt:
      state === "complete" || state === "complete_and_skipped" ? START : null,
    skippedAt:
      state === "skipped" || state === "complete_and_skipped" ? START : null,
  };
}

function checkin(
  id: string,
  timestamp: string,
  scores: Partial<Omit<TestCheckin, "id" | "timestamp">> = {},
): TestCheckin {
  return {
    id,
    timestamp: new Date(timestamp),
    moodScore: 5,
    fogScore: 5,
    digitalControlScore: 5,
    learningResistanceScore: 5,
    bodyRelationshipScore: 5,
    workConfidenceScore: 5,
    ...scores,
  };
}

function day(dayNumber: number, overrides: Partial<TestDay> = {}): TestDay {
  return {
    dayNumber,
    status: "UNSET",
    dailyPlan: null,
    checkins: [],
    recoveryEvent: null,
    ...overrides,
  };
}

function cycle(days: TestDay[], recoveryCreditLimit = 6) {
  return {
    name: "My Reset",
    startDate: START,
    recoveryCreditLimit,
    dayLogs: days,
  };
}

function databaseWithCycle(
  storedCycle: ReturnType<typeof cycle> | null,
  activeCycles: unknown[] = [{ id: "cycle-1", name: "My Reset" }],
) {
  const resetCycleFindMany = vi.fn().mockResolvedValue(activeCycles);
  const resetCycleFindFirst = vi.fn();
  if (storedCycle) {
    resetCycleFindFirst
      .mockResolvedValueOnce({ startDate: storedCycle.startDate })
      .mockResolvedValueOnce(storedCycle);
  } else {
    resetCycleFindFirst.mockResolvedValue(null);
  }
  const dayLogFindMany = vi.fn().mockResolvedValue([]);
  const dayLogFindFirst = vi.fn().mockResolvedValue(null);

  return {
    database: {
      resetCycle: {
        findMany: resetCycleFindMany,
        findFirst: resetCycleFindFirst,
      },
      dayLog: {
        findMany: dayLogFindMany,
        findFirst: dayLogFindFirst,
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      recoveryEvent: { findUnique: vi.fn() },
      $transaction: vi.fn(),
    } as unknown as AnalyticsDatabase,
    dayLogFindMany,
    resetCycleFindFirst,
    resetCycleFindMany,
  };
}

function readyDashboard(
  overrides: Partial<Extract<AnalyticsDashboard, { status: "ready" }>> = {},
): Extract<AnalyticsDashboard, { status: "ready" }> {
  return {
    status: "ready",
    today: "2026-07-10",
    throughDay: 10,
    cycleName: "My Reset",
    finalizedDayCount: 0,
    statusCounts: { GREEN: 0, YELLOW: 0, BLUE: 0, RED: 0, GOLD: 0 },
    recovery: {
      creditLimit: 6,
      creditsUsed: 0,
      creditsRemaining: 6,
      completedQualifyingDays: 0,
    },
    trends: [
      ["mood", "Mood", "higher"],
      ["fog", "Fog", "lower"],
      ["digitalControl", "Digital control", "higher"],
      ["learningResistance", "Learning resistance", "lower"],
      ["bodyRelationship", "Body relationship", "higher"],
      ["workConfidence", "Work confidence", "higher"],
    ].map(([key, label, direction]) => ({
      key: key as
        | "mood"
        | "fog"
        | "digitalControl"
        | "learningResistance"
        | "bodyRelationship"
        | "workConfidence",
      label,
      direction: direction as "higher" | "lower",
      points: [],
    })),
    weeklyComparison: { status: "unavailable", currentWeekNumber: 1 },
    taskCompletion: { completed: 0, total: 0, percentage: null },
    taskCompletionByDomain: [],
    ...overrides,
  };
}

describe("Analytics authentication and active-cycle boundary", () => {
  beforeEach(() => {
    pageMocks.getReadOnlyBrowserSession.mockReset();
    pageMocks.getPrismaClient.mockReset();
    pageMocks.redirect.mockReset();
  });

  it("redirects a request with no existing application-user session without touching the database", async () => {
    pageMocks.getReadOnlyBrowserSession.mockResolvedValue(null);
    pageMocks.redirect.mockImplementation(() => {
      throw new Error("analytics_redirect");
    });

    await expect(AnalyticsPage()).rejects.toThrow("analytics_redirect");
    expect(pageMocks.getReadOnlyBrowserSession).toHaveBeenCalledTimes(1);
    expect(pageMocks.redirect).toHaveBeenCalledWith(
      "/api/auth/signin?callbackUrl=/analytics",
    );
    expect(pageMocks.getPrismaClient).not.toHaveBeenCalled();
  });

  it.each([
    ["no active cycle", []],
    [
      "duplicate active-cycle corruption",
      [
        { id: "cycle-1", name: "One" },
        { id: "cycle-2", name: "Two" },
      ],
    ],
  ])("returns protected no-cycle state for %s", async (_label, cycles) => {
    const { database, dayLogFindMany, resetCycleFindFirst } = databaseWithCycle(
      null,
      cycles,
    );

    await expect(
      getAnalyticsDashboard(
        database,
        "user-1",
        new Date("2026-07-10T12:00:00Z"),
      ),
    ).resolves.toEqual({ status: "no_cycle" });
    expect(dayLogFindMany).not.toHaveBeenCalled();
    expect(resetCycleFindFirst).not.toHaveBeenCalled();
  });

  it("scopes both active-cycle reads to the authenticated owner and returns no identifiers", async () => {
    const stored = {
      ...cycle([]),
      id: "INTERNAL_CYCLE_SENTINEL",
      userId: "INTERNAL_OWNER_SENTINEL",
      rawJson: "RAW_PAYLOAD_SENTINEL",
      notes: "PRIVATE_NOTE_SENTINEL",
    };
    const { database, resetCycleFindFirst, resetCycleFindMany } =
      databaseWithCycle(stored);

    const result = await getAnalyticsDashboard(
      database,
      "owned-user",
      new Date("2026-07-10T12:00:00Z"),
    );

    expect(resetCycleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "owned-user", status: "ACTIVE" },
        take: 2,
      }),
    );
    expect(resetCycleFindFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          id: "cycle-1",
          userId: "owned-user",
          status: "ACTIVE",
        },
      }),
    );
    expect(resetCycleFindFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          id: "cycle-1",
          userId: "owned-user",
          status: "ACTIVE",
        },
      }),
    );
    expect(JSON.stringify(result)).not.toMatch(
      /INTERNAL_|RAW_PAYLOAD|PRIVATE_NOTE/,
    );

    const dataSelect = resetCycleFindFirst.mock.calls[1][0].select;
    expect(dataSelect).not.toHaveProperty("id");
    expect(dataSelect).not.toHaveProperty("userId");
    expect(dataSelect.dayLogs.select).not.toHaveProperty("dailyReflection");
    expect(dataSelect.dayLogs.select.checkins.select).not.toHaveProperty(
      "note",
    );
    expect(dataSelect.dayLogs.select.checkins.select).not.toHaveProperty(
      "lonelinessScore",
    );
    expect(dataSelect.dayLogs.select.checkins.select).not.toHaveProperty(
      "selfCriticismScore",
    );
  });
});

describe("Analytics status and recovery aggregation", () => {
  it("uses canonical bounded reconciliation and counts each finalized stored status once", async () => {
    const days = ["GREEN", "YELLOW", "BLUE", "RED", "GOLD", "UNSET"].map(
      (status, index) =>
        day(index + 1, {
          status: status as TestDay["status"],
        }),
    );
    const { database, dayLogFindMany, resetCycleFindFirst } = databaseWithCycle(
      cycle(days),
    );
    const now = new Date("2026-07-06T12:00:00Z");

    const result = await getAnalyticsDashboard(database, "user-1", now);
    if (result.status !== "ready") throw new Error("Expected ready Analytics");

    expect(result.statusCounts).toEqual({
      GREEN: 1,
      YELLOW: 1,
      BLUE: 1,
      RED: 1,
      GOLD: 1,
    });
    expect(result.finalizedDayCount).toBe(5);
    expect(dayLogFindMany).toHaveBeenCalledWith({
      where: {
        date: { lt: new Date("2026-07-06T00:00:00.000Z") },
        status: "UNSET",
        cycle: { userId: "user-1", status: "ACTIVE" },
      },
      orderBy: { date: "asc" },
      take: 90,
      select: { id: true },
    });
    expect(resetCycleFindFirst.mock.calls[1][0].select.dayLogs.where).toEqual({
      dayNumber: { gte: 1, lte: 6 },
      date: { lte: new Date("2026-07-06T00:00:00.000Z") },
    });
  });

  it("counts only completed credited recovery as used and clamps remaining at zero", async () => {
    const completed = new Date("2026-07-01T10:00:00Z");
    const days = [
      day(1, {
        recoveryEvent: {
          completedAt: completed,
          creditConsumedAt: completed,
        },
      }),
      day(2, {
        recoveryEvent: { completedAt: null, creditConsumedAt: completed },
      }),
      day(3, {
        recoveryEvent: { completedAt: completed, creditConsumedAt: null },
      }),
      day(4, {
        recoveryEvent: {
          completedAt: completed,
          creditConsumedAt: completed,
        },
      }),
    ];
    const { database } = databaseWithCycle(cycle(days, 1));

    const result = await getAnalyticsDashboard(
      database,
      "user-1",
      new Date("2026-07-04T12:00:00Z"),
    );
    if (result.status !== "ready") throw new Error("Expected ready Analytics");

    expect(result.recovery).toEqual({
      creditLimit: 1,
      creditsUsed: 2,
      creditsRemaining: 0,
      completedQualifyingDays: 3,
    });
  });
});

describe("Analytics check-in trends", () => {
  it("selects latest check-in per UTC cycle day, preserves scale endpoints, order, and gaps", async () => {
    const days = [
      day(1, {
        checkins: [
          checkin("first", "2026-07-01T08:00:00Z", {
            moodScore: 1,
            fogScore: 10,
          }),
          checkin("latest-a", "2026-07-01T22:00:00Z", {
            moodScore: 6,
            fogScore: 6,
          }),
          checkin("latest-z", "2026-07-01T22:00:00Z", {
            moodScore: 10,
            fogScore: 1,
          }),
          checkin("utc-boundary", "2026-07-02T00:00:00Z", {
            moodScore: 1,
            fogScore: 10,
          }),
        ],
      }),
      day(4, {
        checkins: [
          {
            ...checkin("day-four", "2026-07-04T12:00:00Z", {
              moodScore: 7,
              fogScore: 3,
            }),
            note: "PRIVATE_CHECKIN_NOTE_SENTINEL",
          } as TestCheckin,
        ],
      }),
    ];
    const { database } = databaseWithCycle(cycle(days));

    const result = await getAnalyticsDashboard(
      database,
      "user-1",
      new Date("2026-07-04T20:00:00Z"),
    );
    if (result.status !== "ready") throw new Error("Expected ready Analytics");

    expect(result.trends.find((trend) => trend.key === "mood")?.points).toEqual(
      [
        { dayNumber: 1, value: 10 },
        { dayNumber: 2, value: 1 },
        { dayNumber: 4, value: 7 },
      ],
    );
    expect(result.trends.find((trend) => trend.key === "fog")?.points).toEqual([
      { dayNumber: 1, value: 1 },
      { dayNumber: 2, value: 10 },
      { dayNumber: 4, value: 3 },
    ]);
    expect(result.trends).toHaveLength(6);
    expect(result.trends.map((trend) => trend.direction)).toEqual([
      "higher",
      "lower",
      "higher",
      "lower",
      "higher",
      "higher",
    ]);
    expect(JSON.stringify(result)).not.toContain(
      "PRIVATE_CHECKIN_NOTE_SENTINEL",
    );
  });
});

describe("Analytics equal-window weekly comparison", () => {
  it.each([
    [1, "unavailable", null],
    [7, "unavailable", null],
    [8, "ready", [8, 8, 1, 1]],
    [10, "ready", [8, 10, 1, 3]],
    [14, "ready", [8, 14, 1, 7]],
    [90, "ready", [85, 90, 78, 83]],
  ] as const)(
    "uses correct bounded windows on cycle day %s",
    async (throughDay, expectedStatus, ranges) => {
      const allDays = Array.from({ length: 90 }, (_, index) => day(index + 1));
      const { database } = databaseWithCycle(cycle(allDays));
      const now = new Date(START);
      now.setUTCDate(now.getUTCDate() + throughDay - 1);

      const result = await getAnalyticsDashboard(database, "user-1", now);
      if (result.status !== "ready")
        throw new Error("Expected ready Analytics");
      expect(result.weeklyComparison.status).toBe(expectedStatus);

      if (result.weeklyComparison.status === "ready" && ranges) {
        expect([
          result.weeklyComparison.current.dayFrom,
          result.weeklyComparison.current.dayTo,
          result.weeklyComparison.previous.dayFrom,
          result.weeklyComparison.previous.dayTo,
        ]).toEqual(ranges);
        expect(
          result.weeklyComparison.current.dayTo -
            result.weeklyComparison.current.dayFrom,
        ).toBe(
          result.weeklyComparison.previous.dayTo -
            result.weeklyComparison.previous.dayFrom,
        );
      }
    },
  );

  it("excludes missing check-ins from averages and returns No-data nulls for zero task denominators", async () => {
    const credited = new Date("2026-07-08T08:00:00Z");
    const days = [
      day(1, {
        status: "GREEN",
        checkins: [
          checkin("d1", "2026-07-01T10:00:00Z", {
            moodScore: 2,
            fogScore: 8,
          }),
        ],
      }),
      day(3, {
        checkins: [
          checkin("d3", "2026-07-03T10:00:00Z", {
            moodScore: 4,
            fogScore: 6,
          }),
        ],
      }),
      day(8, {
        status: "BLUE",
        checkins: [
          checkin("d8", "2026-07-08T10:00:00Z", {
            moodScore: 10,
            fogScore: 2,
          }),
        ],
        recoveryEvent: {
          completedAt: credited,
          creditConsumedAt: credited,
        },
      }),
      day(10, {
        checkins: [
          checkin("d10", "2026-07-10T10:00:00Z", {
            moodScore: 6,
            fogScore: 4,
          }),
        ],
      }),
    ];
    const { database } = databaseWithCycle(cycle(days));

    const result = await getAnalyticsDashboard(
      database,
      "user-1",
      new Date("2026-07-10T12:00:00Z"),
    );
    if (
      result.status !== "ready" ||
      result.weeklyComparison.status !== "ready"
    ) {
      throw new Error("Expected ready weekly comparison");
    }

    expect(result.weeklyComparison.current).toMatchObject({
      averageMood: 8,
      averageFog: 3,
      taskCompletionPercentage: null,
      recoveryCreditsUsed: 1,
    });
    expect(result.weeklyComparison.previous).toMatchObject({
      averageMood: 3,
      averageFog: 7,
      taskCompletionPercentage: null,
      recoveryCreditsUsed: 0,
    });
  });
});

describe("Analytics task completion", () => {
  it("uses normalized current-plan tasks, skipped denominator rules, and canonical domain order", async () => {
    const days = [
      day(1, {
        dailyPlan: {
          tasks: [
            task("OTHER", "incomplete"),
            task("BODY", "complete"),
            task("BODY", "skipped"),
            task("BODY", "complete_and_skipped"),
          ],
        },
      }),
      day(2),
    ];
    const { database, resetCycleFindFirst } = databaseWithCycle(cycle(days));

    const result = await getAnalyticsDashboard(
      database,
      "user-1",
      new Date("2026-07-02T12:00:00Z"),
    );
    if (result.status !== "ready") throw new Error("Expected ready Analytics");

    expect(result.taskCompletion).toEqual({
      completed: 1,
      total: 4,
      percentage: 25,
    });
    expect(result.taskCompletionByDomain).toEqual([
      { domain: "BODY", completed: 1, total: 3, percentage: 33 },
      { domain: "OTHER", completed: 0, total: 1, percentage: 0 },
    ]);

    const taskQuery =
      resetCycleFindFirst.mock.calls[1][0].select.dayLogs.select.dailyPlan
        .select.tasks;
    expect(taskQuery).not.toHaveProperty("where");
    expect(taskQuery.select).toEqual({
      domain: true,
      completedAt: true,
      skippedAt: true,
    });
  });
});

describe("Analytics page presentation", () => {
  it("enables Analytics in primary navigation and marks it current", () => {
    const html = renderToStaticMarkup(
      <AppShell
        activeItem="Analytics"
        session={{
          userId: "user-1",
          authentikSubject: "subject-1",
          email: "user@example.com",
          displayName: "Reset User",
          isDev: true,
        }}
      >
        <p>Analytics body</p>
      </AppShell>,
    );

    expect(html).toContain('href="/analytics"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Analytics body");
  });

  it("renders calm normalized-data empty states and six direction labels", () => {
    const html = renderToStaticMarkup(
      <AnalyticsDashboardView dashboard={readyDashboard()} />,
    );

    expect(html).toContain("No finalized days yet");
    expect(html).toContain("No check-ins yet");
    expect(html).toContain("No tasks yet");
    expect(html).toContain("Previous week not available");
    expect(html.match(/Higher is better/g)).toHaveLength(4);
    expect(html.match(/Lower is better/g)).toHaveLength(2);
    expect(html).toContain("overflow-hidden");
    expect(html).not.toMatch(/self-trust|loneliness|self-criticism/i);
  });

  it("renders accessible charts, text status labels, task counts, and No data weekly denominators", () => {
    const trends = readyDashboard().trends.map((trend, index) => ({
      ...trend,
      points: [
        { dayNumber: 1, value: index % 2 === 0 ? 1 : 10 },
        { dayNumber: 3, value: index % 2 === 0 ? 10 : 1 },
      ],
    }));
    const dashboard = readyDashboard({
      finalizedDayCount: 1,
      statusCounts: { GREEN: 0, YELLOW: 0, BLUE: 0, RED: 1, GOLD: 0 },
      recovery: {
        creditLimit: 1,
        creditsUsed: 0,
        creditsRemaining: 1,
        completedQualifyingDays: 1,
      },
      trends,
      weeklyComparison: {
        status: "ready",
        current: {
          weekNumber: 2,
          dayFrom: 8,
          dayTo: 10,
          finalizedDays: 1,
          taskCompletionPercentage: null,
          averageMood: 5.5,
          averageFog: null,
          recoveryCreditsUsed: 0,
        },
        previous: {
          weekNumber: 1,
          dayFrom: 1,
          dayTo: 3,
          finalizedDays: 0,
          taskCompletionPercentage: 50,
          averageMood: null,
          averageFog: 4,
          recoveryCreditsUsed: 0,
        },
      },
      taskCompletion: { completed: 1, total: 2, percentage: 50 },
      taskCompletionByDomain: [
        { domain: "OTHER", completed: 1, total: 2, percentage: 50 },
      ],
    });
    const html = renderToStaticMarkup(
      <AnalyticsDashboardView dashboard={dashboard} />,
    );

    expect(html.match(/role="img"/g)).toHaveLength(6);
    expect(html).toContain("Missing days remain gaps");
    expect(html).toContain("Red");
    expect(html).toContain("Incomplete or abandoned");
    expect(html).toContain("Completed qualifying recovery days");
    expect(html).toContain("1/2 · 50%");
    expect(html).toContain("Other");
    expect(html).toContain("No data");
    expect(html).not.toMatch(/NaN|Infinity|INTERNAL_|PRIVATE_|RAW_/);
  });

  it("renders established calm no-active-cycle state", () => {
    const html = renderToStaticMarkup(
      <AnalyticsDashboardView dashboard={{ status: "no_cycle" }} />,
    );
    expect(html).toContain("No active reset cycle.");
    expect(html).toContain("Start a reset cycle when ready");
  });
});
