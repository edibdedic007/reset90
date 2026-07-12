import { describe, expect, it, vi } from "vitest";

import reflectionExample from "../examples/daily_reflection_payload.json";
import type { DailyReflectionNormalizationDatabase } from "../src/server/imports/normalize-daily-reflection";
import { normalizeDailyReflectionImport } from "../src/server/imports/normalize-daily-reflection";

type ProcessingStatus = "PENDING" | "PROCESSED" | "REJECTED" | "FAILED";

type StoredImport = {
  id: string;
  kind: "DAILY_PLAN" | "DAILY_REFLECTION";
  rawJson: unknown;
  validationStatus: "VALID" | "INVALID";
  processingStatus: ProcessingStatus;
  processedAt: Date | null;
  errorMetadata: unknown;
};

type ReflectionWrite = {
  dayLogId?: string;
  importedPayloadId: string;
  summary: string;
  whatHappened: string | null;
  whatWorked: string | null;
  whatBlockedMe: string | null;
  tomorrowAdjustment: string | null;
  selfCriticismNote: string | null;
  dayStatusRecommendation: string | null;
};

const OWNER_SUBJECT = "owner-subject";
const NOW = new Date("2026-07-10T12:00:00.000Z");

function createTestDatabase(
  options: {
    rawInput?: unknown;
    ownerFound?: boolean;
    cycleFound?: boolean;
    dayLogFound?: boolean;
    upsertError?: Error;
  } = {},
) {
  let imports: StoredImport[] = [
    {
      id: "import-1",
      kind: "DAILY_REFLECTION",
      rawJson: structuredClone(options.rawInput ?? reflectionExample),
      validationStatus: "VALID",
      processingStatus: "PENDING",
      processedAt: null,
      errorMetadata: null,
    },
  ];
  let reflection:
    | (ReflectionWrite & {
        id: string;
        dayLogId: string;
        createdAt: Date;
        updatedAt: Date;
      })
    | null = null;
  const protectedState = {
    status: "YELLOW",
    energyLevel: "LOW",
    recoveryCreditsUsed: 2,
    tasks: ["task-1"],
    checkins: ["checkin-1"],
  };

  const importedPayloadFindUnique = vi.fn(
    ({ where }: { where: { id: string } }) =>
      imports.find((row) => row.id === where.id) ?? null,
  );
  const importedPayloadUpdate = vi.fn(
    ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<StoredImport>;
    }) => {
      imports = imports.map((row) =>
        row.id === where.id ? { ...row, ...data } : row,
      );
      return imports.find((row) => row.id === where.id);
    },
  );
  const userFindUnique = vi.fn(() =>
    options.ownerFound === false ? null : { id: "owner-1" },
  );
  const resetCycleFindFirst = vi.fn(() =>
    options.cycleFound === false
      ? null
      : {
          id: "cycle-1",
          startDate: new Date("2026-07-01T00:00:00.000Z"),
          endDate: new Date("2026-09-28T00:00:00.000Z"),
        },
  );
  const dayLogFindFirst = vi.fn(() =>
    options.dayLogFound === false ? null : { id: "day-1" },
  );
  const dailyReflectionFindUnique = vi.fn(
    ({ where }: { where: { importedPayloadId: string } }) =>
      reflection?.importedPayloadId === where.importedPayloadId
        ? { id: reflection.id }
        : null,
  );
  const dailyReflectionUpsert = vi.fn(
    ({
      create,
      update,
    }: {
      create: ReflectionWrite;
      update: ReflectionWrite;
    }) => {
      if (options.upsertError) throw options.upsertError;

      const write = reflection ? update : create;
      reflection = {
        ...write,
        id: reflection?.id ?? "reflection-1",
        dayLogId: reflection?.dayLogId ?? create.dayLogId ?? "day-1",
        createdAt:
          reflection?.createdAt ?? new Date("2026-07-10T12:00:00.000Z"),
        updatedAt: new Date(
          reflection ? "2026-07-11T12:00:00.000Z" : "2026-07-10T12:00:00.000Z",
        ),
      };
      return { id: reflection.id };
    },
  );
  const forbiddenMutation = vi.fn();
  const transaction = {
    importedPayload: {
      findUnique: importedPayloadFindUnique,
      update: importedPayloadUpdate,
    },
    user: { findUnique: userFindUnique },
    resetCycle: { findFirst: resetCycleFindFirst },
    dayLog: { findFirst: dayLogFindFirst, update: forbiddenMutation },
    dailyReflection: {
      findUnique: dailyReflectionFindUnique,
      upsert: dailyReflectionUpsert,
    },
    task: { updateMany: forbiddenMutation },
    checkin: { updateMany: forbiddenMutation },
    recoveryEvent: { create: forbiddenMutation, update: forbiddenMutation },
  };
  const database = {
    $transaction: async (
      callback: (value: typeof transaction) => Promise<unknown>,
    ) => callback(transaction),
  } as unknown as DailyReflectionNormalizationDatabase;

  return {
    database,
    userFindUnique,
    resetCycleFindFirst,
    dayLogFindFirst,
    dailyReflectionUpsert,
    importedPayloadUpdate,
    forbiddenMutation,
    snapshot: () => ({
      imports: structuredClone(imports),
      reflection: structuredClone(reflection),
      protectedState: structuredClone(protectedState),
    }),
    replaceImport(next: StoredImport) {
      imports = [...imports, next];
    },
  };
}

function reflectionWith(
  payload: Record<string, unknown>,
  envelope: Record<string, unknown> = {},
) {
  const reflection = structuredClone(reflectionExample) as unknown as {
    payload: Record<string, unknown>;
  } & Record<string, unknown>;
  Object.assign(reflection, envelope);
  Object.assign(reflection.payload, payload);
  return reflection;
}

describe("daily reflection normalization", () => {
  it("resolves owner and active cycle server-side, then links day and raw import", async () => {
    const testDatabase = createTestDatabase();

    await expect(
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).resolves.toEqual({
      status: "processed",
      dailyReflectionId: "reflection-1",
    });

    expect(testDatabase.userFindUnique).toHaveBeenCalledWith({
      where: { authentikSubject: OWNER_SUBJECT },
      select: { id: true },
    });
    expect(testDatabase.resetCycleFindFirst).toHaveBeenCalledWith({
      where: { userId: "owner-1", status: "ACTIVE" },
      orderBy: { startDate: "desc" },
      select: { id: true, startDate: true, endDate: true },
    });
    expect(testDatabase.dayLogFindFirst).toHaveBeenCalledWith({
      where: {
        cycleId: "cycle-1",
        date: new Date("2026-07-01T00:00:00.000Z"),
        dayNumber: 1,
        phase: { name: "Clear the Fog" },
      },
      select: { id: true },
    });
    expect(testDatabase.snapshot()).toMatchObject({
      imports: [{ id: "import-1", processingStatus: "PROCESSED" }],
      reflection: {
        id: "reflection-1",
        dayLogId: "day-1",
        importedPayloadId: "import-1",
        summary: reflectionExample.payload.summary,
      },
    });
  });

  it("normalizes blank optional fields to null without requiring a daily plan", async () => {
    const rawInput = reflectionWith({
      what_happened: "  ",
      what_worked: "\n",
      what_blocked_me: "",
      tomorrow_adjustment: "  ",
      self_criticism_note: "\t",
    });
    const testDatabase = createTestDatabase({ rawInput });

    await normalizeDailyReflectionImport(
      testDatabase.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );

    expect(testDatabase.snapshot().reflection).toMatchObject({
      whatHappened: null,
      whatWorked: null,
      whatBlockedMe: null,
      tomorrowAdjustment: null,
      selfCriticismNote: null,
    });
  });

  it("reprocessing a successful raw import is a no-op", async () => {
    const testDatabase = createTestDatabase();
    await normalizeDailyReflectionImport(
      testDatabase.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    const first = testDatabase.snapshot();

    await expect(
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).resolves.toEqual({
      status: "already_processed",
      dailyReflectionId: "reflection-1",
    });
    expect(testDatabase.snapshot().reflection).toEqual(first.reflection);
    expect(testDatabase.dailyReflectionUpsert).toHaveBeenCalledTimes(1);
  });

  it("replaces same-day normalized content while preserving createdAt and raw history", async () => {
    const testDatabase = createTestDatabase();
    await normalizeDailyReflectionImport(
      testDatabase.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    const first = testDatabase.snapshot().reflection;
    const replacement = reflectionWith(
      { summary: "Revised cleaned summary." },
      { idempotency_key: "2026-07-01-day-1-reflection-v2" },
    );
    testDatabase.replaceImport({
      id: "import-2",
      kind: "DAILY_REFLECTION",
      rawJson: replacement,
      validationStatus: "VALID",
      processingStatus: "PENDING",
      processedAt: null,
      errorMetadata: null,
    });

    await normalizeDailyReflectionImport(
      testDatabase.database,
      "import-2",
      OWNER_SUBJECT,
      NOW,
    );

    const state = testDatabase.snapshot();
    expect(state.imports).toHaveLength(2);
    expect(state.imports[0]?.rawJson).toEqual(reflectionExample);
    expect(state.reflection).toMatchObject({
      id: "reflection-1",
      importedPayloadId: "import-2",
      summary: "Revised cleaned summary.",
      createdAt: first?.createdAt,
      updatedAt: new Date("2026-07-11T12:00:00.000Z"),
    });
  });

  it.each([
    ["missing owner", { ownerFound: false }, "import_owner_not_found"],
    ["inactive owner cycle", { cycleFound: false }, "active_cycle_not_found"],
    ["unowned or mismatched day", { dayLogFound: false }, "day_log_not_found"],
  ] as const)("rejects %s", async (_name, options, code) => {
    const testDatabase = createTestDatabase(options);

    await expect(
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).resolves.toEqual({ status: "failed", code });
    expect(testDatabase.snapshot().reflection).toBeNull();
    expect(testDatabase.snapshot().imports[0]).toMatchObject({
      processingStatus: "FAILED",
      errorMetadata: { code },
    });
  });

  it.each([
    [
      "future day",
      reflectionWith({ date: "2026-07-11", day_number: 11 }),
      "target_day_in_future",
      NOW,
    ],
    [
      "before cycle",
      reflectionWith({ date: "2026-06-30", day_number: 1 }),
      "target_day_outside_active_cycle",
      NOW,
    ],
    [
      "after cycle",
      reflectionWith({ date: "2026-09-29", day_number: 90 }),
      "target_day_outside_active_cycle",
      new Date("2026-09-30T00:00:00.000Z"),
    ],
  ] as const)("rejects a %s target", async (_name, rawInput, code, now) => {
    const testDatabase = createTestDatabase({ rawInput });

    await expect(
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        now,
      ),
    ).resolves.toEqual({ status: "failed", code });
    expect(testDatabase.snapshot().reflection).toBeNull();
  });

  it.each([
    ["date and day number", { day_number: 2 }],
    ["phase", { phase: "Rebuild Momentum" }],
  ])("rejects a %s mismatch", async (_name, payload) => {
    const testDatabase = createTestDatabase({
      rawInput: reflectionWith(payload),
      dayLogFound: false,
    });

    await expect(
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).resolves.toEqual({
      status: "failed",
      code: "day_log_not_found",
    });
  });

  it("accepts final cycle day and enforces UTC boundary", async () => {
    const finalDay = reflectionWith({
      date: "2026-09-28",
      day_number: 90,
      phase: "Prove Continuation",
    });
    const testDatabase = createTestDatabase({ rawInput: finalDay });

    await expect(
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        new Date("2026-09-28T00:00:00.000Z"),
      ),
    ).resolves.toMatchObject({ status: "processed" });

    const futureAtUtcBoundary = createTestDatabase();
    await expect(
      normalizeDailyReflectionImport(
        futureAtUtcBoundary.database,
        "import-1",
        OWNER_SUBJECT,
        new Date("2026-06-30T23:59:59.999Z"),
      ),
    ).resolves.toEqual({
      status: "failed",
      code: "target_day_in_future",
    });
  });

  it.each(["green", "yellow", "blue", "red", "gold"] as const)(
    "stores %s recommendation without changing canonical state",
    async (recommendation) => {
      const testDatabase = createTestDatabase({
        rawInput: reflectionWith({
          day_status_recommendation: recommendation,
        }),
      });
      const before = testDatabase.snapshot().protectedState;

      await normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      );

      expect(testDatabase.snapshot().protectedState).toEqual(before);
      expect(testDatabase.snapshot().reflection?.dayStatusRecommendation).toBe(
        recommendation.toUpperCase(),
      );
      expect(testDatabase.forbiddenMutation).not.toHaveBeenCalled();
    },
  );

  it("keeps raw-only sentinel out of normalized data and safe target errors", async () => {
    const sentinel = "RAW_ONLY_SENTINEL_7f8e";
    const rawInput = reflectionWith(
      { day_number: 2 },
      { external_conversation_id: sentinel },
    );
    const testDatabase = createTestDatabase({
      rawInput,
      dayLogFound: false,
    });

    await normalizeDailyReflectionImport(
      testDatabase.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );

    const state = testDatabase.snapshot();
    expect(JSON.stringify(state.imports[0]?.rawJson)).toContain(sentinel);
    expect(JSON.stringify(state.reflection)).not.toContain(sentinel);
    expect(JSON.stringify(state.imports[0]?.errorMetadata)).not.toContain(
      sentinel,
    );
  });

  it("leaves raw import pending when normalized write throws", async () => {
    const testDatabase = createTestDatabase({
      upsertError: new Error("database write failed"),
    });

    await expect(
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).rejects.toThrow("database write failed");
    expect(testDatabase.snapshot().reflection).toBeNull();
    expect(testDatabase.snapshot().imports[0]?.processingStatus).toBe(
      "PENDING",
    );
    expect(testDatabase.importedPayloadUpdate).not.toHaveBeenCalled();
  });
});
