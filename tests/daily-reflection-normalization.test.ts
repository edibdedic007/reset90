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
  createdAt: Date;
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
      createdAt: new Date("2026-07-10T10:00:00.000Z"),
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
  const lockTails = new Map<string, Promise<void>>();
  let failProcessedUpdate = false;

  async function acquireLock(key: string) {
    const previous = lockTails.get(key) ?? Promise.resolve();
    let release = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    lockTails.set(
      key,
      previous.then(() => current),
    );
    await previous;
    return release;
  }

  const importedPayloadFindUnique = vi.fn();
  const importedPayloadUpdate = vi.fn();
  const userFindUnique = vi.fn(() =>
    options.ownerFound === false ? null : { id: "owner-1" },
  );
  const resetCycleFindMany = vi.fn(() =>
    options.cycleFound === false
      ? []
      : [
          {
            id: "cycle-1",
            startDate: new Date("2026-07-01T00:00:00.000Z"),
            endDate: new Date("2026-09-28T00:00:00.000Z"),
          },
        ],
  );
  const dayLogFindFirst = vi.fn(() =>
    options.dayLogFound === false ? null : { id: "day-1" },
  );
  const dailyReflectionFindUnique = vi.fn();
  const dailyReflectionUpsert = vi.fn();
  const forbiddenMutation = vi.fn();
  const database = {
    $transaction: async (
      callback: (value: Record<string, unknown>) => Promise<unknown>,
    ) => {
      const releases: Array<() => void> = [];
      const importUpdates = new Map<string, Partial<StoredImport>>();
      let stagedReflection = structuredClone(reflection);
      let reflectionWritten = false;

      const currentImport = (id: string) => {
        const stored = imports.find((row) => row.id === id);
        const update = importUpdates.get(id);
        return stored ? { ...stored, ...update } : null;
      };
      const transaction = {
        $queryRaw: async (query: {
          strings?: readonly string[];
          values?: readonly unknown[];
        }) => {
          const sql = query.strings?.join("?") ?? "";
          const key = `${sql.includes("imported_payloads") ? "import" : "day"}:${String(query.values?.[0])}`;
          const release = await acquireLock(key);
          releases.push(release);
          if (sql.includes("day_logs")) {
            stagedReflection = structuredClone(reflection);
          }
          return [];
        },
        importedPayload: {
          findUnique: (args: { where: { id: string } }) => {
            importedPayloadFindUnique(args);
            return currentImport(args.where.id);
          },
          update: (args: {
            where: { id: string };
            data: Partial<StoredImport>;
          }) => {
            importedPayloadUpdate(args);
            if (
              failProcessedUpdate &&
              args.data.processingStatus === "PROCESSED"
            ) {
              failProcessedUpdate = false;
              throw new Error("import status update failed");
            }
            const existing = importUpdates.get(args.where.id) ?? {};
            importUpdates.set(args.where.id, { ...existing, ...args.data });
            return currentImport(args.where.id);
          },
        },
        user: { findUnique: userFindUnique },
        resetCycle: { findMany: resetCycleFindMany },
        dayLog: { findFirst: dayLogFindFirst, update: forbiddenMutation },
        dailyReflection: {
          findUnique: (args: {
            where: { importedPayloadId?: string; dayLogId?: string };
          }) => {
            dailyReflectionFindUnique(args);
            const candidate = args.where.dayLogId
              ? stagedReflection
              : reflection;
            if (
              !candidate ||
              (args.where.importedPayloadId &&
                candidate.importedPayloadId !== args.where.importedPayloadId) ||
              (args.where.dayLogId &&
                candidate.dayLogId !== args.where.dayLogId)
            ) {
              return null;
            }
            const sourceImport = currentImport(candidate.importedPayloadId);
            return {
              id: candidate.id,
              importedPayload: sourceImport
                ? { id: sourceImport.id, createdAt: sourceImport.createdAt }
                : undefined,
            };
          },
          upsert: (args: {
            create: ReflectionWrite;
            update: ReflectionWrite;
          }) => {
            dailyReflectionUpsert(args);
            if (options.upsertError) throw options.upsertError;

            const write = stagedReflection ? args.update : args.create;
            stagedReflection = {
              ...write,
              id: stagedReflection?.id ?? "reflection-1",
              dayLogId:
                stagedReflection?.dayLogId ?? args.create.dayLogId ?? "day-1",
              createdAt:
                stagedReflection?.createdAt ??
                new Date("2026-07-10T12:00:00.000Z"),
              updatedAt: new Date(
                stagedReflection
                  ? "2026-07-11T12:00:00.000Z"
                  : "2026-07-10T12:00:00.000Z",
              ),
            };
            reflectionWritten = true;
            return { id: stagedReflection.id };
          },
        },
        task: { updateMany: forbiddenMutation },
        checkin: { updateMany: forbiddenMutation },
        recoveryEvent: {
          create: forbiddenMutation,
          update: forbiddenMutation,
        },
      };

      try {
        const result = await callback(transaction);
        for (const [id, update] of importUpdates) {
          imports = imports.map((row) =>
            row.id === id ? { ...row, ...update } : row,
          );
        }
        if (reflectionWritten) {
          reflection = structuredClone(stagedReflection);
        }
        return result;
      } finally {
        for (const release of releases.reverse()) release();
      }
    },
  } as unknown as DailyReflectionNormalizationDatabase;

  return {
    database,
    userFindUnique,
    resetCycleFindMany,
    dayLogFindFirst,
    dailyReflectionUpsert,
    importedPayloadUpdate,
    forbiddenMutation,
    snapshot: () => ({
      imports: structuredClone(imports),
      reflection: structuredClone(reflection),
      protectedState: structuredClone(protectedState),
    }),
    replaceImport(
      next: Omit<StoredImport, "createdAt"> & { createdAt?: Date },
    ) {
      imports = [
        ...imports,
        {
          ...next,
          createdAt: next.createdAt ?? new Date("2026-07-10T11:00:00.000Z"),
        },
      ];
    },
    removeReflection() {
      reflection = null;
    },
    failNextProcessedUpdate() {
      failProcessedUpdate = true;
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
    expect(testDatabase.resetCycleFindMany).toHaveBeenCalledWith({
      where: { userId: "owner-1", status: "ACTIVE" },
      orderBy: { startDate: "desc" },
      take: 2,
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

  it("keeps an older processed import terminal after a newer import replaces it", async () => {
    const testDatabase = createTestDatabase();
    await normalizeDailyReflectionImport(
      testDatabase.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    testDatabase.replaceImport({
      id: "import-2",
      kind: "DAILY_REFLECTION",
      rawJson: reflectionWith(
        { summary: "Newer reflection stays current." },
        { idempotency_key: "2026-07-01-day-1-reflection-v2" },
      ),
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
    const beforeRetry = testDatabase.snapshot();

    await expect(
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).resolves.toEqual({
      status: "already_processed",
      dailyReflectionId: null,
    });

    const afterRetry = testDatabase.snapshot();
    expect(afterRetry).toEqual(beforeRetry);
    expect(afterRetry.imports[0]?.processingStatus).toBe("PROCESSED");
    expect(afterRetry.reflection).toMatchObject({
      importedPayloadId: "import-2",
      summary: "Newer reflection stays current.",
      createdAt: beforeRetry.reflection?.createdAt,
      updatedAt: beforeRetry.reflection?.updatedAt,
    });
    expect(testDatabase.dailyReflectionUpsert).toHaveBeenCalledTimes(2);
  });

  it("does not replay a processed import whose normalized row was removed", async () => {
    const testDatabase = createTestDatabase();
    await normalizeDailyReflectionImport(
      testDatabase.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    testDatabase.removeReflection();
    const beforeRetry = testDatabase.snapshot();

    await expect(
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).resolves.toEqual({
      status: "already_processed",
      dailyReflectionId: null,
    });

    expect(testDatabase.snapshot()).toEqual(beforeRetry);
    expect(testDatabase.snapshot().imports[0]?.processingStatus).toBe(
      "PROCESSED",
    );
    expect(testDatabase.dailyReflectionUpsert).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent exact retries to one normalized write", async () => {
    const testDatabase = createTestDatabase();

    const results = await Promise.all([
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ]);

    expect(results).toEqual([
      { status: "processed", dailyReflectionId: "reflection-1" },
      { status: "already_processed", dailyReflectionId: "reflection-1" },
    ]);
    const state = testDatabase.snapshot();
    expect(state.imports[0]?.processingStatus).toBe("PROCESSED");
    expect(state.reflection).toMatchObject({
      id: "reflection-1",
      importedPayloadId: "import-1",
      createdAt: new Date("2026-07-10T12:00:00.000Z"),
      updatedAt: new Date("2026-07-10T12:00:00.000Z"),
    });
    expect(testDatabase.dailyReflectionUpsert).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent different same-day imports with a deterministic winner", async () => {
    const testDatabase = createTestDatabase();
    testDatabase.replaceImport({
      id: "import-2",
      kind: "DAILY_REFLECTION",
      rawJson: reflectionWith(
        { summary: "Deterministic newer reflection." },
        { idempotency_key: "2026-07-01-day-1-reflection-v2" },
      ),
      validationStatus: "VALID",
      processingStatus: "PENDING",
      processedAt: null,
      errorMetadata: null,
    });

    const results = await Promise.all([
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-2",
        OWNER_SUBJECT,
        NOW,
      ),
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ]);

    expect(results.every((result) => result.status === "processed")).toBe(true);
    const state = testDatabase.snapshot();
    expect(state.imports).toMatchObject([
      { id: "import-1", processingStatus: "PROCESSED" },
      { id: "import-2", processingStatus: "PROCESSED" },
    ]);
    expect(state.reflection).toMatchObject({
      id: "reflection-1",
      dayLogId: "day-1",
      importedPayloadId: "import-2",
      summary: "Deterministic newer reflection.",
    });
    expect(testDatabase.snapshot().reflection).not.toBeNull();

    await normalizeDailyReflectionImport(
      testDatabase.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    expect(testDatabase.snapshot()).toEqual(state);
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

  it("accepts a current UTC day reflection", async () => {
    const testDatabase = createTestDatabase({
      rawInput: reflectionWith({ date: "2026-07-10", day_number: 10 }),
    });

    await expect(
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).resolves.toMatchObject({ status: "processed" });
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

  it("stores unset recommendation and omitted recommendation as nullable advisory data", async () => {
    const unsetDatabase = createTestDatabase({
      rawInput: reflectionWith({ day_status_recommendation: "unset" }),
    });
    await normalizeDailyReflectionImport(
      unsetDatabase.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    expect(unsetDatabase.snapshot().reflection?.dayStatusRecommendation).toBe(
      "UNSET",
    );

    const omitted = reflectionWith({});
    delete omitted.payload.day_status_recommendation;
    const omittedDatabase = createTestDatabase({ rawInput: omitted });
    await normalizeDailyReflectionImport(
      omittedDatabase.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    expect(
      omittedDatabase.snapshot().reflection?.dayStatusRecommendation,
    ).toBeNull();
  });

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

  it("rolls back a new reflection when the final status update fails", async () => {
    const testDatabase = createTestDatabase();
    const before = testDatabase.snapshot();
    testDatabase.failNextProcessedUpdate();

    await expect(
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).rejects.toThrow("import status update failed");

    expect(testDatabase.snapshot()).toEqual(before);
    expect(testDatabase.snapshot().reflection).toBeNull();
    expect(testDatabase.snapshot().imports[0]?.processingStatus).toBe(
      "PENDING",
    );
  });

  it("rolls back reflection replacement when the final status update fails", async () => {
    const testDatabase = createTestDatabase();
    await normalizeDailyReflectionImport(
      testDatabase.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    testDatabase.replaceImport({
      id: "import-2",
      kind: "DAILY_REFLECTION",
      rawJson: reflectionWith(
        { summary: "This replacement must roll back." },
        { idempotency_key: "2026-07-01-day-1-reflection-v2" },
      ),
      validationStatus: "VALID",
      processingStatus: "PENDING",
      processedAt: null,
      errorMetadata: null,
    });
    const before = testDatabase.snapshot();
    testDatabase.failNextProcessedUpdate();

    await expect(
      normalizeDailyReflectionImport(
        testDatabase.database,
        "import-2",
        OWNER_SUBJECT,
        NOW,
      ),
    ).rejects.toThrow("import status update failed");

    expect(testDatabase.snapshot()).toEqual(before);
    expect(testDatabase.snapshot().reflection).toEqual(before.reflection);
    expect(testDatabase.snapshot().imports[1]?.processingStatus).toBe(
      "PENDING",
    );
    expect(testDatabase.snapshot().protectedState).toEqual(
      before.protectedState,
    );
  });
});
