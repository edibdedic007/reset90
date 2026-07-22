import { describe, expect, it, vi } from "vitest";

import dailyPlanExample from "../examples/daily_plan_payload.json";
import type { DailyPlanNormalizationDatabase } from "../src/server/imports/normalize-daily-plan";
import { normalizeDailyPlanImport } from "../src/server/imports/normalize-daily-plan";

const OWNER_SUBJECT = "daily-plan-owner";

type ProcessingStatus = "PENDING" | "PROCESSED" | "REJECTED" | "FAILED";

type StoredImport = {
  id: string;
  kind: "DAILY_PLAN" | "DAILY_REFLECTION";
  schemaVersion: string;
  source: string;
  rawJson: unknown;
  validationStatus: "VALID" | "INVALID";
  processingStatus: ProcessingStatus;
  createdAt: Date;
  processedAt: Date | null;
  errorMetadata: unknown;
};

type StoredTask = {
  title: string;
  domain: string;
  tier: string;
  estimateMinutes?: number;
  trigger?: string;
  why?: string;
  sortOrder: number;
};

type PlanWrite = {
  importedPayloadId: string;
  mission: string;
  supportiveMessage: string;
  warnings: string[];
  downshiftRule: string;
  contextSummary: string;
  tasks: { create: StoredTask[]; deleteMany?: object };
};

function createTestDatabase(
  options: { dayLogFound?: boolean; rawInput?: unknown } = {},
) {
  let importedPayload: StoredImport = {
    id: "import-1",
    kind: "DAILY_PLAN",
    schemaVersion: "1.0",
    source: "custom_gpt",
    rawJson: structuredClone(options.rawInput ?? dailyPlanExample),
    validationStatus: "VALID",
    processingStatus: "PENDING",
    createdAt: new Date("2026-07-01T10:00:00.000Z"),
    processedAt: null,
    errorMetadata: null,
  };
  const importedPayloads = new Map([[importedPayload.id, importedPayload]]);
  let plan: (Omit<PlanWrite, "tasks"> & { id: string }) | null = null;
  let tasks: StoredTask[] = [];
  let dayLog = {
    id: "day-1",
    cycleId: "cycle-1",
    date: new Date("2026-07-01T00:00:00.000Z"),
    status: "UNSET",
    mission: null,
    supportiveMessage: null,
  } as {
    id: string;
    cycleId: string;
    date: Date;
    status: string;
    mission: string | null;
    supportiveMessage: string | null;
  };

  const importedPayloadFindUnique = vi.fn(
    ({ where }: { where: { id: string } }) =>
      importedPayloads.get(where.id) ?? null,
  );
  const importedPayloadUpdate = vi.fn(
    ({
      where,
      data,
    }: {
      where: { id: string };
      data: {
        processingStatus?: ProcessingStatus;
        processedAt?: Date;
        errorMetadata?: unknown;
      };
    }) => {
      const stored = importedPayloads.get(where.id);
      if (!stored) throw new Error("Import fixture not found");
      const updated = { ...stored, ...data };
      importedPayloads.set(where.id, updated);
      if (importedPayload.id === where.id) importedPayload = updated;
      return updated;
    },
  );
  const dayLogFindFirst = vi.fn(
    ({ where }: { where: { cycleId?: string; dayNumber?: number } }) =>
      where.dayNumber === undefined
        ? null
        : options.dayLogFound === false
          ? null
          : { id: dayLog.id },
  );
  const dayLogUpdate = vi.fn(
    ({
      data,
    }: {
      data: Partial<{
        mission: string;
        supportiveMessage: string;
        status: string;
      }>;
    }) => {
      dayLog = { ...dayLog, ...data };
      return dayLog;
    },
  );
  const dayLogFindUnique = vi.fn(() => ({
    ...dayLog,
    dailyPlan: {
      tasks: tasks.map(({ tier }) => ({
        tier,
        completedAt: null,
        skippedAt: null,
      })),
    },
    recoveryEvent: null,
  }));
  const dailyPlanFindUnique = vi.fn(
    ({
      where,
    }: {
      where: { importedPayloadId?: string; dayLogId?: string };
    }) => {
      if (!plan) return null;
      if (
        where.importedPayloadId &&
        plan.importedPayloadId !== where.importedPayloadId
      ) {
        return null;
      }
      if (where.dayLogId && where.dayLogId !== dayLog.id) return null;

      const sourceImport = importedPayloads.get(plan.importedPayloadId);
      if (!sourceImport)
        throw new Error("Plan source import fixture not found");
      return {
        id: plan.id,
        _count: { tasks: tasks.length },
        importedPayload: {
          id: sourceImport.id,
          createdAt: sourceImport.createdAt,
        },
      };
    },
  );
  const dailyPlanUpsert = vi.fn(
    ({ create, update }: { create: PlanWrite; update: PlanWrite }) => {
      const write = plan ? update : create;
      plan = {
        id: plan?.id ?? "plan-1",
        importedPayloadId: write.importedPayloadId,
        mission: write.mission,
        supportiveMessage: write.supportiveMessage,
        warnings: write.warnings,
        downshiftRule: write.downshiftRule,
        contextSummary: write.contextSummary,
      };
      tasks = structuredClone(write.tasks.create);
      return { id: plan.id };
    },
  );
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: "locked" }]),
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: "user-1" }),
    },
    resetCycle: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "cycle-1",
          startDate: new Date("2026-07-01T00:00:00.000Z"),
          endDate: new Date("2026-09-28T00:00:00.000Z"),
        },
      ]),
    },
    importedPayload: {
      findUnique: importedPayloadFindUnique,
      update: importedPayloadUpdate,
    },
    dayLog: {
      findFirst: dayLogFindFirst,
      findUnique: dayLogFindUnique,
      update: dayLogUpdate,
    },
    dailyPlan: { findUnique: dailyPlanFindUnique, upsert: dailyPlanUpsert },
  };
  const database = {
    $transaction: async (
      callback: (value: typeof transaction) => Promise<unknown>,
    ) => callback(transaction),
  } as unknown as DailyPlanNormalizationDatabase;

  return {
    database,
    dayLogFindFirst,
    dailyPlanUpsert,
    snapshot: () => ({ importedPayload, plan, tasks, dayLog }),
    getImport: (id: string) => importedPayloads.get(id),
    replaceImport(next: StoredImport) {
      importedPayload = next;
      importedPayloads.set(next.id, next);
    },
  };
}

describe("daily plan normalization", () => {
  it("links the canonical plan to its day and stores ordered tier/domain tasks", async () => {
    const testDatabase = createTestDatabase();

    await expect(
      normalizeDailyPlanImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
      ),
    ).resolves.toEqual({
      status: "processed",
      dailyPlanId: "plan-1",
      taskCount: 10,
    });

    const state = testDatabase.snapshot();
    expect(state.importedPayload.processingStatus).toBe("PROCESSED");
    expect(state.plan).toMatchObject({
      importedPayloadId: "import-1",
      warnings: dailyPlanExample.payload.warnings,
    });
    expect(state.dayLog).toMatchObject({
      mission: dailyPlanExample.payload.mission,
      supportiveMessage: dailyPlanExample.payload.supportive_message,
    });
    expect(state.tasks).toHaveLength(10);
    expect(state.tasks.map(({ tier }) => tier)).toEqual([
      "NON_NEGOTIABLE",
      "NON_NEGOTIABLE",
      "NON_NEGOTIABLE",
      "MINIMUM",
      "MINIMUM",
      "STANDARD",
      "STANDARD",
      "STANDARD",
      "IDEAL",
      "IDEAL",
    ]);
    expect(state.tasks[0]).toMatchObject({
      domain: "BODY",
      sortOrder: 0,
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
  });

  it("does not recreate tasks when the same raw import is processed again", async () => {
    const testDatabase = createTestDatabase();

    await normalizeDailyPlanImport(
      testDatabase.database,
      "import-1",
      OWNER_SUBJECT,
    );
    const firstTaskSnapshot = structuredClone(testDatabase.snapshot().tasks);
    const repeated = await normalizeDailyPlanImport(
      testDatabase.database,
      "import-1",
      OWNER_SUBJECT,
    );

    expect(repeated).toEqual({
      status: "already_processed",
      dailyPlanId: "plan-1",
      taskCount: 10,
    });
    expect(testDatabase.snapshot().tasks).toEqual(firstTaskSnapshot);
    expect(testDatabase.dailyPlanUpsert).toHaveBeenCalledTimes(1);
  });

  it("stores an empty warning list for older valid plans without warnings", async () => {
    const withoutWarnings = structuredClone(dailyPlanExample);
    Reflect.deleteProperty(withoutWarnings.payload, "warnings");
    const testDatabase = createTestDatabase({ rawInput: withoutWarnings });

    await normalizeDailyPlanImport(
      testDatabase.database,
      "import-1",
      OWNER_SUBJECT,
    );

    expect(testDatabase.snapshot().plan).toMatchObject({ warnings: [] });
  });

  it("replaces the same day's plan and tasks for a new import deterministically", async () => {
    const testDatabase = createTestDatabase();
    await normalizeDailyPlanImport(
      testDatabase.database,
      "import-1",
      OWNER_SUBJECT,
    );

    const replacement = structuredClone(dailyPlanExample);
    replacement.idempotency_key = "2026-07-01-day-1-revised-plan-v2";
    replacement.payload.mission = "Use the revised minimum plan.";
    replacement.payload.standard_plan = [];
    testDatabase.replaceImport({
      id: "import-2",
      kind: "DAILY_PLAN",
      schemaVersion: "1.0",
      source: "custom_gpt",
      rawJson: replacement,
      validationStatus: "VALID",
      processingStatus: "PENDING",
      createdAt: new Date("2026-07-01T11:00:00.000Z"),
      processedAt: null,
      errorMetadata: null,
    });

    await expect(
      normalizeDailyPlanImport(
        testDatabase.database,
        "import-2",
        OWNER_SUBJECT,
      ),
    ).resolves.toMatchObject({ status: "processed", taskCount: 7 });

    const state = testDatabase.snapshot();
    expect(state.plan).toMatchObject({
      id: "plan-1",
      importedPayloadId: "import-2",
      mission: "Use the revised minimum plan.",
    });
    expect(state.tasks).toHaveLength(7);
    expect(testDatabase.dailyPlanUpsert).toHaveBeenCalledTimes(2);
  });

  it("keeps a newer current plan when an older pending import is processed later", async () => {
    const testDatabase = createTestDatabase();
    const newer = structuredClone(dailyPlanExample);
    newer.idempotency_key = "2026-07-01-day-1-newer-first";
    newer.payload.mission = "Keep the newest plan.";
    newer.payload.standard_plan = [];
    testDatabase.replaceImport({
      id: "import-2",
      kind: "DAILY_PLAN",
      schemaVersion: "1.0",
      source: "custom_gpt",
      rawJson: newer,
      validationStatus: "VALID",
      processingStatus: "PENDING",
      createdAt: new Date("2026-07-01T11:00:00.000Z"),
      processedAt: null,
      errorMetadata: null,
    });

    await normalizeDailyPlanImport(
      testDatabase.database,
      "import-2",
      OWNER_SUBJECT,
    );
    await expect(
      normalizeDailyPlanImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
      ),
    ).resolves.toEqual({
      status: "processed",
      dailyPlanId: "plan-1",
      taskCount: 7,
    });

    expect(testDatabase.snapshot().plan).toMatchObject({
      importedPayloadId: "import-2",
      mission: "Keep the newest plan.",
    });
    expect(testDatabase.snapshot().tasks).toHaveLength(7);
    expect(testDatabase.getImport("import-1")).toMatchObject({
      processingStatus: "PROCESSED",
    });
    const staleProcessedImport = testDatabase.getImport("import-1");
    const currentPlan = structuredClone(testDatabase.snapshot().plan);
    const currentTasks = structuredClone(testDatabase.snapshot().tasks);

    await expect(
      normalizeDailyPlanImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
      ),
    ).resolves.toEqual({
      status: "already_processed",
      dailyPlanId: null,
      taskCount: 0,
    });

    expect(testDatabase.getImport("import-1")).toBe(staleProcessedImport);
    expect(staleProcessedImport).toMatchObject({
      processingStatus: "PROCESSED",
    });
    expect(testDatabase.snapshot().plan).toEqual(currentPlan);
    expect(testDatabase.snapshot().tasks).toEqual(currentTasks);
    expect(testDatabase.dailyPlanUpsert).toHaveBeenCalledTimes(1);
  });

  it("uses raw import ID as the deterministic equal-time tie-breaker", async () => {
    const testDatabase = createTestDatabase();
    await normalizeDailyPlanImport(
      testDatabase.database,
      "import-1",
      OWNER_SUBJECT,
    );

    const higherId = structuredClone(dailyPlanExample);
    higherId.idempotency_key = "2026-07-01-day-1-equal-time-higher-id";
    higherId.payload.mission = "Higher ID wins the tie.";
    testDatabase.replaceImport({
      id: "import-2",
      kind: "DAILY_PLAN",
      schemaVersion: "1.0",
      source: "custom_gpt",
      rawJson: higherId,
      validationStatus: "VALID",
      processingStatus: "PENDING",
      createdAt: new Date("2026-07-01T10:00:00.000Z"),
      processedAt: null,
      errorMetadata: null,
    });

    await normalizeDailyPlanImport(
      testDatabase.database,
      "import-2",
      OWNER_SUBJECT,
    );

    expect(testDatabase.snapshot().plan).toMatchObject({
      importedPayloadId: "import-2",
      mission: "Higher ID wins the tie.",
    });
    expect(testDatabase.dailyPlanUpsert).toHaveBeenCalledTimes(2);
  });

  it("marks the raw import failed when date, day number, and phase find no active day", async () => {
    const testDatabase = createTestDatabase({ dayLogFound: false });

    await expect(
      normalizeDailyPlanImport(
        testDatabase.database,
        "import-1",
        OWNER_SUBJECT,
      ),
    ).resolves.toEqual({
      status: "failed",
      code: "day_log_not_found",
    });

    const state = testDatabase.snapshot();
    expect(state.importedPayload).toMatchObject({
      processingStatus: "FAILED",
      errorMetadata: { code: "day_log_not_found" },
    });
    expect(state.plan).toBeNull();
    expect(state.tasks).toHaveLength(0);
  });
});
