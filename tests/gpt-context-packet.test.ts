import { describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  getBrowserSession: vi.fn(),
  getReadOnlyBrowserSession: vi.fn(),
  getPrismaClient: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  getBrowserSession: routeMocks.getBrowserSession,
  getReadOnlyBrowserSession: routeMocks.getReadOnlyBrowserSession,
}));

vi.mock("@/server/db/client", () => ({
  getPrismaClient: routeMocks.getPrismaClient,
}));

import generatedPacketSchema from "../schemas/gpt-context-packet.schema.json";
import type { PrismaClient } from "../src/generated/prisma/client";
import {
  assembleGptContextPacket,
  fitGptContextPacketToByteLimit,
  gptContextPacketByteLength,
  GPT_CONTEXT_DECISION_LIMIT,
  GPT_CONTEXT_PACKET_MAX_BYTES,
  GPT_CONTEXT_PINNED_LIMIT,
  GPT_CONTEXT_TAG_LIMIT,
  handleGptContextPacketRequest,
} from "../src/server/context-export/gpt-context-packet";
import { gptContextPacketSchema } from "../src/server/context-export/gpt-context-packet-schema";

const START = new Date("2026-07-01T00:00:00.000Z");
const END = new Date("2026-09-28T00:00:00.000Z");
const NOW = new Date("2026-07-07T12:34:56.000Z");

const PHASES = [
  { name: "Clear the Fog", dayStart: 1, dayEnd: 30 },
  { name: "Rebuild Momentum", dayStart: 31, dayEnd: 60 },
  { name: "Prove Continuation", dayStart: 61, dayEnd: 90 },
];

function cycle(overrides: Record<string, unknown> = {}) {
  return {
    id: "cycle-owned-active",
    startDate: START,
    endDate: END,
    recoveryCreditLimit: 6,
    phases: PHASES,
    userId: "user-1",
    status: "ACTIVE",
    authentikSubject: "AUTH_SENTINEL_16",
    email: "PRIVATE_EMAIL_SENTINEL_16@example.test",
    ...overrides,
  };
}

function scores(value: number) {
  return {
    moodScore: value,
    fogScore: value,
    lonelinessScore: value,
    selfCriticismScore: value,
    digitalControlScore: value,
    learningResistanceScore: value,
    bodyRelationshipScore: value,
    workConfidenceScore: value,
    note: "CHECKIN_NOTE_SENTINEL_16",
    id: "CHECKIN_ID_SENTINEL_16",
  };
}

function day(dayNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    id: `DAY_ID_SENTINEL_16_${dayNumber}`,
    cycleId: "cycle-owned-active",
    date: new Date(Date.UTC(2026, 6, dayNumber)),
    dayNumber,
    status: "UNSET",
    mission: null,
    notes: "DAY_NOTE_SENTINEL_16",
    dailyPlan: null,
    dailyReflection: null,
    checkins: [],
    recoveryEvent: null,
    ...overrides,
  };
}

function completedMinimumTasks() {
  return [
    {
      tier: "NON_NEGOTIABLE",
      completedAt: NOW,
      skippedAt: null,
      title: "TASK_DESCRIPTION_SENTINEL_16",
    },
    {
      tier: "MINIMUM",
      completedAt: NOW,
      skippedAt: null,
      title: "TASK_DESCRIPTION_SENTINEL_16",
    },
  ];
}

function contextItem(index: number, kind = "DECISION") {
  return {
    id: `CONTEXT_ID_SENTINEL_16_${index}`,
    cycleId: "cycle-owned-active",
    kind,
    title: `Context ${index}`,
    summary: `Summary ${index} 🚀`,
    pinnedAt: new Date(
      `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
    ),
    createdAt: new Date(
      `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
    ),
    tags: [
      { name: " Open ", normalizedName: "open" },
      { name: "open", normalizedName: "open" },
      ...Array.from({ length: 10 }, (_, tagIndex) => ({
        name: `Tag-${tagIndex}`,
        normalizedName: `tag-${tagIndex}`,
      })),
    ],
    rawJson: "RAW_IMPORT_SENTINEL_16",
    importedPayloadId: "IMPORT_ID_SENTINEL_16",
  };
}

type PacketDatabaseOptions = {
  cycles?: ReturnType<typeof cycle>[];
  days?: ReturnType<typeof day>[];
  patterns?: unknown;
  pinned?: ReturnType<typeof contextItem>[];
  decisions?: ReturnType<typeof contextItem>[];
  creditsUsed?: number;
  databaseError?: Error;
};

function packetDatabase(options: PacketDatabaseOptions = {}) {
  const cycles = options.cycles ?? [cycle()];
  const storedDays = options.days ?? [];
  const resetCycleFindMany = vi.fn(
    async (args: { where: { userId: string; status: string }; take: number }) =>
      cycles
        .filter(
          (stored) =>
            stored.userId === args.where.userId &&
            stored.status === args.where.status,
        )
        .slice(0, args.take),
  );
  const dayLogFindMany = vi.fn(
    async (args: {
      where: { cycleId: string; date: { gte: Date; lte: Date } };
      take: number;
      select: {
        checkins: {
          orderBy: Array<Record<string, string>>;
          take: number;
        };
      };
    }) =>
      storedDays
        .filter((stored) => stored.cycleId === args.where.cycleId)
        .filter(
          (stored) =>
            stored.date >= args.where.date.gte &&
            stored.date <= args.where.date.lte,
        )
        .sort((left, right) => left.date.getTime() - right.date.getTime())
        .slice(0, args.take),
  );
  const weeklyReviewFindFirst = vi.fn(async () =>
    options.patterns === undefined
      ? null
      : {
          patternsJson: options.patterns,
          rawJson: "RAW_REVIEW_SENTINEL_16",
        },
  );
  const contextItemFindMany = vi.fn(
    async (args: {
      where: {
        cycleId: string;
        kind?: string;
        pinnedAt?: { not: null };
        tags?: { some: { normalizedName: string } };
      };
    }) => {
      const items =
        args.where.kind === "DECISION"
          ? (options.decisions ?? [])
          : (options.pinned ?? []);
      return items.filter(
        (item) =>
          item.cycleId === args.where.cycleId &&
          (!args.where.kind || item.kind === args.where.kind) &&
          (!args.where.pinnedAt || item.pinnedAt !== null) &&
          (!args.where.tags ||
            item.tags.some(
              (tag) =>
                tag.normalizedName === args.where.tags?.some.normalizedName,
            )),
      );
    },
  );
  const recoveryCount = vi.fn(async () => options.creditsUsed ?? 0);
  const transactionClient = {
    resetCycle: { findMany: resetCycleFindMany },
    dayLog: { findMany: dayLogFindMany },
    weeklyReview: { findFirst: weeklyReviewFindFirst },
    contextItem: { findMany: contextItemFindMany },
    recoveryEvent: { count: recoveryCount },
  };
  const transaction = vi.fn(
    async (
      callback: (client: typeof transactionClient) => Promise<unknown>,
    ) => {
      if (options.databaseError) throw options.databaseError;
      return callback(transactionClient);
    },
  );
  const database = {
    $transaction: transaction,
  } as unknown as Pick<PrismaClient, "$transaction">;
  return {
    database,
    transaction,
    resetCycleFindMany,
    dayLogFindMany,
    weeklyReviewFindFirst,
    contextItemFindMany,
    recoveryCount,
  };
}

async function readyPacket(test: ReturnType<typeof packetDatabase>, now = NOW) {
  const result = await assembleGptContextPacket(test.database, "user-1", now);
  if (result.status !== "ready") throw new Error("Expected ready packet");
  return result.packet;
}

describe("GPT context packet contract and assembly", () => {
  it("builds one schema-valid allowlisted packet from owned active-cycle data", async () => {
    const patterns = Array.from({ length: 12 }, (_, index) => ({
      title: `Pattern ${index}`,
      evidence: `Evidence ${index}`,
    }));
    const pinned = Array.from({ length: 14 }, (_, index) => contextItem(index));
    const decisions = Array.from({ length: 12 }, (_, index) =>
      contextItem(index),
    );
    const test = packetDatabase({
      days: [
        day(1, { status: "GREEN", checkins: [scores(2)] }),
        day(6, { status: "RED" }),
        day(7, {
          mission: "Keep today compact.",
          dailyPlan: {
            mission: "Keep today compact.",
            tasks: completedMinimumTasks(),
          },
          dailyReflection: {
            summary: "Visible compact reflection.",
            whatHappened: "REFLECTION_NARRATIVE_SENTINEL_16",
          },
          checkins: [scores(8)],
          recoveryEvent: {
            completedAt: NOW,
            creditConsumedAt: NOW,
            selectedActionIds: ["RECOVERY_ACTION_SENTINEL_16"],
          },
        }),
      ],
      patterns,
      pinned,
      decisions,
      creditsUsed: 7,
    });

    const packet = await readyPacket(test);

    expect(gptContextPacketSchema.safeParse(packet).success).toBe(true);
    expect(Object.keys(packet)).toEqual([
      "schema_version",
      "generated_at",
      "cycle",
      "current_day",
      "recent_days",
      "metrics_7d",
      "active_patterns",
      "pinned_context",
      "recovery",
      "open_decisions",
    ]);
    expect(packet.current_day).toMatchObject({
      date: "2026-07-07",
      day_number: 7,
      status: "GOLD",
      mission: "Keep today compact.",
      reflection_summary: "Visible compact reflection.",
      task_completion: { total: 2, completed: 2 },
    });
    expect(packet.recent_days.map((entry) => entry.date)).toEqual([
      "2026-07-05",
      "2026-07-06",
      "2026-07-07",
    ]);
    expect(packet.metrics_7d).toMatchObject({
      window_start_date: "2026-07-01",
      window_end_date: "2026-07-07",
      cycle_date_count: 7,
      dates_with_checkins: 2,
      status_counts: { GREEN: 1, RED: 1, GOLD: 1, UNSET: 4 },
      completed_recovery_events: 1,
    });
    expect(packet.metrics_7d.checkin_averages.mood).toEqual({
      average: 5,
      sample_count: 2,
    });
    expect(packet.active_patterns).toEqual(patterns.slice(0, 10));
    expect(packet.pinned_context).toHaveLength(GPT_CONTEXT_PINNED_LIMIT);
    expect(packet.open_decisions).toHaveLength(GPT_CONTEXT_DECISION_LIMIT);
    expect(packet.pinned_context[0].tags).toEqual([
      "Open",
      "Tag-0",
      "Tag-1",
      "Tag-2",
      "Tag-3",
      "Tag-4",
      "Tag-5",
      "Tag-6",
    ]);
    expect(packet.pinned_context[0].tags).toHaveLength(GPT_CONTEXT_TAG_LIMIT);
    expect(packet.recovery).toEqual({
      configured_credit_allowance: 6,
      credits_used: 7,
      credits_remaining: 0,
      completed_events_7d: 1,
      current_day_is_recovery: false,
    });

    expect(test.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
    expect(test.resetCycleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", status: "ACTIVE" },
        take: 2,
      }),
    );
    const dayQuery = test.dayLogFindMany.mock.calls[0][0];
    expect(dayQuery.where.cycleId).toBe("cycle-owned-active");
    expect(dayQuery.take).toBe(7);
    expect(dayQuery.select.checkins.orderBy).toEqual([
      { timestamp: "desc" },
      { id: "desc" },
    ]);
    expect(dayQuery.select.checkins.take).toBe(1);
    const [pinnedQuery, decisionQuery] =
      test.contextItemFindMany.mock.calls.map(([query]) => query);
    expect(pinnedQuery).toMatchObject({
      where: { cycleId: "cycle-owned-active", pinnedAt: { not: null } },
      take: 12,
      orderBy: [{ pinnedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    });
    expect(decisionQuery).toMatchObject({
      where: {
        cycleId: "cycle-owned-active",
        kind: "DECISION",
        tags: { some: { normalizedName: "open" } },
      },
      take: 10,
    });
    expect(test.recoveryCount).toHaveBeenCalledWith({
      where: {
        cycleId: "cycle-owned-active",
        creditConsumedAt: { not: null },
      },
    });

    const serialized = JSON.stringify(packet);
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(
      32_768,
    );
    expect(JSON.parse(serialized).pinned_context[0].summary).toContain("🚀");
    expect(serialized).not.toMatch(
      /SENTINEL_16|user-1|cycle-owned-active|authentik|email|rawJson|notes|whatHappened|selectedActionIds|importedPayloadId|\"id\"/,
    );
  });

  it("deterministically prunes complete optional items in priority order", async () => {
    const base = await readyPacket(packetDatabase());
    const maxTags = Array.from(
      { length: GPT_CONTEXT_TAG_LIMIT },
      (_, index) => `${"T".repeat(39)}${index}`,
    );
    const packet = gptContextPacketSchema.parse({
      ...base,
      active_patterns: Array.from({ length: 10 }, (_, index) => ({
        title: `${"P".repeat(299)}${index}`,
        evidence: "界".repeat(2_000),
      })),
      open_decisions: Array.from({ length: 10 }, (_, index) => ({
        title: `${"D".repeat(159)}${index}`,
        summary: "界".repeat(4_000),
        tags: maxTags,
      })),
      pinned_context: Array.from({ length: 12 }, (_, index) => ({
        kind: "DECISION",
        title: `${"C".repeat(158)}${String(index).padStart(2, "0")}`,
        summary: "界".repeat(4_000),
        tags: maxTags,
      })),
    });

    expect(gptContextPacketSchema.safeParse(packet).success).toBe(true);
    expect(gptContextPacketByteLength(packet)).toBeGreaterThan(
      GPT_CONTEXT_PACKET_MAX_BYTES,
    );

    const fitted = fitGptContextPacketToByteLimit(packet);
    if (!fitted) throw new Error("Expected oversized optional data to fit");

    expect(fitted.active_patterns).toEqual([]);
    expect(fitted.open_decisions).toEqual([]);
    expect(fitted.pinned_context.length).toBeGreaterThan(0);
    expect(fitted.pinned_context.length).toBeLessThan(
      packet.pinned_context.length,
    );
    expect(fitted.pinned_context).toEqual(
      packet.pinned_context.slice(0, fitted.pinned_context.length),
    );
    expect(fitted.pinned_context.at(-1)?.summary).toBe("界".repeat(4_000));
    for (const key of [
      "schema_version",
      "generated_at",
      "cycle",
      "current_day",
      "recent_days",
      "metrics_7d",
      "recovery",
    ] as const) {
      expect(fitted[key]).toEqual(packet[key]);
    }
    expect(gptContextPacketByteLength(fitted)).toBeLessThanOrEqual(
      GPT_CONTEXT_PACKET_MAX_BYTES,
    );
    expect(gptContextPacketSchema.safeParse(fitted).success).toBe(true);
    expect(fitGptContextPacketToByteLimit(packet)).toEqual(fitted);
    expect(packet.active_patterns).toHaveLength(10);
    expect(packet.open_decisions).toHaveLength(10);
    expect(packet.pinned_context).toHaveLength(12);
  });

  it("measures serialized UTF-8 bytes instead of JavaScript string length", async () => {
    const base = await readyPacket(packetDatabase());
    const packet = gptContextPacketSchema.parse({
      ...base,
      pinned_context: Array.from({ length: 7 }, (_, index) => ({
        kind: "DECISION",
        title: `Unicode ${index}`,
        summary: "界".repeat(1_500),
        tags: [],
      })),
    });
    const serialized = JSON.stringify(packet);

    expect(serialized.length).toBeLessThan(GPT_CONTEXT_PACKET_MAX_BYTES);
    expect(gptContextPacketByteLength(packet)).toBeGreaterThan(
      GPT_CONTEXT_PACKET_MAX_BYTES,
    );

    const fitted = fitGptContextPacketToByteLimit(packet);
    if (!fitted) throw new Error("Expected Unicode optional data to fit");
    expect(fitted.pinned_context.length).toBeLessThan(7);
    expect(gptContextPacketByteLength(fitted)).toBeLessThanOrEqual(
      GPT_CONTEXT_PACKET_MAX_BYTES,
    );
    expect(gptContextPacketSchema.safeParse(fitted).success).toBe(true);
  });

  it("returns a size error when required sections alone exceed 32 KiB", async () => {
    const requiredDays = [5, 6, 7].map((dayNumber) =>
      day(dayNumber, {
        status: "GREEN",
        dailyPlan: {
          mission: "界".repeat(1_000),
          tasks: [],
        },
        dailyReflection: { summary: "界".repeat(1_500) },
        checkins: [scores(10)],
      }),
    );
    const oversized = packetDatabase({
      cycles: [
        cycle({
          phases: [
            { name: "界".repeat(200), dayStart: 1, dayEnd: 30 },
            ...PHASES.slice(1),
          ],
        }),
      ],
      days: requiredDays,
    });

    await expect(
      assembleGptContextPacket(oversized.database, "user-1", NOW),
    ).resolves.toEqual({ status: "size_error" });

    const routeDatabase = packetDatabase({
      cycles: [
        cycle({
          phases: [
            { name: "界".repeat(200), dayStart: 1, dayEnd: 30 },
            ...PHASES.slice(1),
          ],
        }),
      ],
      days: requiredDays,
    });
    const response = await handleGptContextPacketRequest(
      new Request("http://localhost/api/context/export"),
      {
        getSession: async () => ({ userId: "user-1" }),
        getDatabase: () => routeDatabase.database,
        now: () => NOW,
      },
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("Content-Disposition")).toBeNull();
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "context_export_too_large",
      message:
        "GPT context packet could not be generated within safe size limits.",
    });
  });

  it("excludes other-owner cycles and other-cycle normalized records", async () => {
    const ownedPinned = contextItem(1);
    const otherCyclePinned = {
      ...contextItem(2),
      cycleId: "cycle-other",
      summary: "OTHER_CYCLE_SENTINEL_16",
    };
    const test = packetDatabase({
      cycles: [
        cycle(),
        cycle({
          id: "cycle-other",
          userId: "user-2",
          email: "OTHER_OWNER_SENTINEL_16@example.test",
        }),
        cycle({ id: "cycle-archived", status: "ARCHIVED" }),
      ],
      days: [
        day(7, { status: "GREEN" }),
        day(7, {
          cycleId: "cycle-other",
          mission: "OTHER_DAY_SENTINEL_16",
        }),
      ],
      pinned: [ownedPinned, otherCyclePinned],
      decisions: [ownedPinned, otherCyclePinned],
    });

    const serialized = JSON.stringify(await readyPacket(test));
    expect(serialized).toContain("Summary 1");
    expect(serialized).not.toMatch(
      /OTHER_CYCLE_SENTINEL_16|OTHER_OWNER_SENTINEL_16|OTHER_DAY_SENTINEL_16/,
    );
  });

  it.each([
    [1, "2026-07-01", 1],
    [2, "2026-07-01", 2],
    [3, "2026-07-01", 3],
    [7, "2026-07-01", 7],
    [10, "2026-07-04", 7],
  ])(
    "uses cycle-relative clipped windows on day %i",
    async (dayNumber, windowStart, metricLength) => {
      const test = packetDatabase({
        days: [day(1, { status: "GREEN" })],
      });
      const now = new Date(Date.UTC(2026, 6, dayNumber, 12));
      const packet = await readyPacket(test, now);

      expect(packet.metrics_7d.window_start_date).toBe(windowStart);
      expect(packet.metrics_7d.cycle_date_count).toBe(metricLength);
      expect(packet.recent_days).toHaveLength(Math.min(dayNumber, 3));
      expect(packet.recent_days.at(-1)?.day_number).toBe(dayNumber);
      expect(packet.recent_days.map((entry) => entry.day_number)).toEqual(
        Array.from(
          { length: Math.min(dayNumber, 3) },
          (_, index) => dayNumber - Math.min(dayNumber, 3) + index + 1,
        ),
      );
      if (dayNumber === 10) {
        expect(packet.metrics_7d.status_counts.GREEN).toBe(0);
      }
    },
  );

  it("keeps missing dates visible and derives statuses with canonical domain logic", async () => {
    const test = packetDatabase({
      days: [
        day(1),
        day(2, {
          dailyPlan: {
            mission: "Minimum counts.",
            tasks: completedMinimumTasks(),
          },
        }),
      ],
    });
    const packet = await readyPacket(
      test,
      new Date("2026-07-03T12:00:00.000Z"),
    );

    expect(
      packet.recent_days.map(({ day_number, status }) => [day_number, status]),
    ).toEqual([
      [1, "RED"],
      [2, "GOLD"],
      [3, "UNSET"],
    ]);
    expect(packet.current_day).toMatchObject({
      day_number: 3,
      mission: null,
      latest_checkin_scores: null,
      reflection_summary: null,
      status: "UNSET",
      is_recovery_day: false,
    });
    expect(packet.current_day?.task_completion).toEqual({
      total: 0,
      completed: 0,
      by_tier: {
        NON_NEGOTIABLE: { total: 0, completed: 0 },
        MINIMUM: { total: 0, completed: 0 },
        STANDARD: { total: 0, completed: 0 },
        IDEAL: { total: 0, completed: 0 },
      },
    });
  });

  it.each([
    new Date("2026-06-30T23:59:59.999Z"),
    new Date("2026-09-29T00:00:00.000Z"),
  ])("returns approved empty day windows outside cycle at %s", async (now) => {
    const packet = await readyPacket(packetDatabase(), now);
    expect(packet.cycle.current_day_number).toBeNull();
    expect(packet.cycle.current_phase_number).toBeNull();
    expect(packet.cycle.current_phase_name).toBeNull();
    expect(packet.current_day).toBeNull();
    expect(packet.recent_days).toEqual([]);
    expect(packet.metrics_7d).toEqual({
      window_start_date: null,
      window_end_date: null,
      cycle_date_count: 0,
      dates_with_checkins: 0,
      status_counts: {
        GREEN: 0,
        YELLOW: 0,
        BLUE: 0,
        RED: 0,
        GOLD: 0,
        UNSET: 0,
      },
      checkin_averages: {
        mood: { average: null, sample_count: 0 },
        fog: { average: null, sample_count: 0 },
        loneliness: { average: null, sample_count: 0 },
        self_criticism: { average: null, sample_count: 0 },
        digital_control: { average: null, sample_count: 0 },
        learning_resistance: { average: null, sample_count: 0 },
        body_relationship: { average: null, sample_count: 0 },
        work_confidence: { average: null, sample_count: 0 },
      },
      completed_recovery_events: 0,
    });
  });

  it("uses UTC calendar boundaries and excludes future cycle days", async () => {
    const beforeMidnight = await readyPacket(
      packetDatabase(),
      new Date("2026-07-01T23:59:59.999Z"),
    );
    const midnight = await readyPacket(
      packetDatabase(),
      new Date("2026-07-02T00:00:00.000Z"),
    );
    expect(beforeMidnight.current_day?.day_number).toBe(1);
    expect(beforeMidnight.recent_days.map((entry) => entry.day_number)).toEqual(
      [1],
    );
    expect(midnight.current_day?.day_number).toBe(2);
    expect(midnight.recent_days.map((entry) => entry.day_number)).toEqual([
      1, 2,
    ]);
  });

  it("keeps no-sample averages null and counts only latest per-date scores", async () => {
    const test = packetDatabase({
      days: [
        day(1, { checkins: [scores(7)] }),
        day(2),
        day(3, { checkins: [scores(9)] }),
      ],
    });
    const packet = await readyPacket(
      test,
      new Date("2026-07-03T12:00:00.000Z"),
    );
    expect(packet.metrics_7d.dates_with_checkins).toBe(2);
    expect(packet.metrics_7d.checkin_averages.mood).toEqual({
      average: 8,
      sample_count: 2,
    });

    const empty = await readyPacket(packetDatabase(), NOW);
    expect(empty.metrics_7d.checkin_averages.mood).toEqual({
      average: null,
      sample_count: 0,
    });
  });

  it("uses only newest stored normalized patterns and returns empty for absent or invalid lists", async () => {
    const valid = packetDatabase({
      patterns: [
        { title: "First", evidence: "Stored first" },
        { title: "Second", evidence: "Stored second" },
      ],
    });
    expect((await readyPacket(valid)).active_patterns).toEqual([
      { title: "First", evidence: "Stored first" },
      { title: "Second", evidence: "Stored second" },
    ]);
    expect(valid.weeklyReviewFindFirst).toHaveBeenCalledWith({
      where: { cycleId: "cycle-owned-active" },
      orderBy: [{ dateTo: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: { patternsJson: true },
    });
    expect((await readyPacket(packetDatabase())).active_patterns).toEqual([]);
    expect(
      (await readyPacket(packetDatabase({ patterns: { inferred: true } })))
        .active_patterns,
    ).toEqual([]);
  });

  it("produces semantically identical output except generated_at", async () => {
    const first = await readyPacket(
      packetDatabase({ days: [day(7, { status: "GREEN" })] }),
      new Date("2026-07-07T08:00:00.000Z"),
    );
    const second = await readyPacket(
      packetDatabase({ days: [day(7, { status: "GREEN" })] }),
      new Date("2026-07-07T18:00:00.000Z"),
    );
    const { generated_at: firstGenerated, ...firstData } = first;
    const { generated_at: secondGenerated, ...secondData } = second;
    expect(firstGenerated).not.toBe(secondGenerated);
    expect(firstData).toEqual(secondData);
  });

  it("matches generated schema bounds and rejects undocumented fields", () => {
    const schema = generatedPacketSchema as unknown as {
      $schema: string;
      $id: string;
      properties: Record<string, { maxItems?: number }>;
      additionalProperties: boolean;
    };
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$id).toBe(
      "https://reset90.local/schemas/gpt-context-packet.schema.json",
    );
    expect(Object.keys(schema.properties)).toEqual([
      "schema_version",
      "generated_at",
      "cycle",
      "current_day",
      "recent_days",
      "metrics_7d",
      "active_patterns",
      "pinned_context",
      "recovery",
      "open_decisions",
    ]);
    expect(schema.properties.recent_days.maxItems).toBe(3);
    expect(schema.properties.active_patterns.maxItems).toBe(10);
    expect(schema.properties.pinned_context.maxItems).toBe(12);
    expect(schema.properties.open_decisions.maxItems).toBe(10);
    expect(schema.additionalProperties).toBe(false);
    expect(gptContextPacketSchema.safeParse({ unexpected: true }).success).toBe(
      false,
    );
  });
});

describe("GPT context packet browser endpoint", () => {
  it("uses read-only session resolution and keeps a missing user safe", async () => {
    routeMocks.getBrowserSession.mockReset();
    routeMocks.getReadOnlyBrowserSession.mockReset();
    routeMocks.getPrismaClient.mockReset();
    routeMocks.getReadOnlyBrowserSession.mockResolvedValue(null);
    const { GET } = await import("../src/app/api/context/export/route");

    const response = await GET(
      new Request("http://localhost/api/context/export"),
    );

    expect(response.status).toBe(401);
    expect(routeMocks.getReadOnlyBrowserSession).toHaveBeenCalledTimes(1);
    expect(routeMocks.getBrowserSession).not.toHaveBeenCalled();
    expect(routeMocks.getPrismaClient).not.toHaveBeenCalled();
  });

  it("returns safe 401 before database access", async () => {
    const getDatabase = vi.fn();
    const response = await handleGptContextPacketRequest(
      new Request("http://localhost/api/context/export"),
      { getSession: async () => null, getDatabase },
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "unauthorized",
      message: "Authentication is required to export GPT context.",
    });
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("returns safe 404 with no downloadable file when no active cycle exists", async () => {
    const test = packetDatabase({ cycles: [] });
    const response = await handleGptContextPacketRequest(
      new Request("http://localhost/api/context/export"),
      {
        getSession: async () => ({ userId: "user-1" }),
        getDatabase: () => test.database,
        now: () => NOW,
      },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Disposition")).toBeNull();
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "no_active_cycle",
      message: expect.stringContaining("No active Reset Cycle exists"),
    });
  });

  it("returns bounded invariant and server failures", async () => {
    const ambiguous = packetDatabase({
      cycles: [cycle(), cycle({ id: "cycle-second" })],
    });
    const dependencies = {
      getSession: async () => ({ userId: "user-1" }),
      getDatabase: () => ambiguous.database,
      now: () => NOW,
    };
    const invariant = await handleGptContextPacketRequest(
      new Request("http://localhost/api/context/export"),
      dependencies,
    );
    expect(invariant.status).toBe(409);
    await expect(invariant.json()).resolves.toEqual({
      ok: false,
      error: "active_cycle_invariant",
      message:
        "Reset Cycle state is inconsistent. GPT context was not exported.",
    });

    const failed = packetDatabase({
      databaseError: new Error("STACK_SENTINEL_16"),
    });
    const serverError = await handleGptContextPacketRequest(
      new Request("http://localhost/api/context/export"),
      { ...dependencies, getDatabase: () => failed.database },
    );
    expect(serverError.status).toBe(500);
    expect(JSON.stringify(await serverError.json())).not.toContain(
      "STACK_SENTINEL_16",
    );
  });

  it("rejects caller-controlled selection parameters", async () => {
    const getDatabase = vi.fn();
    const response = await handleGptContextPacketRequest(
      new Request(
        "http://localhost/api/context/export?owner_id=other&cycle_id=other&day_number=1&date=2026-07-01",
      ),
      {
        getSession: async () => ({ userId: "user-1" }),
        getDatabase,
      },
    );
    expect(response.status).toBe(400);
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("downloads JSON with exact headers and UTC filename", async () => {
    const test = packetDatabase();
    const response = await handleGptContextPacketRequest(
      new Request("http://localhost/api/context/export"),
      {
        getSession: async () => ({ userId: "user-1" }),
        getDatabase: () => test.database,
        now: () => NOW,
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="reset90-gpt-context-2026-07-07.json"',
    );
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const packet = await response.json();
    expect(gptContextPacketSchema.safeParse(packet).success).toBe(true);
  });
});
