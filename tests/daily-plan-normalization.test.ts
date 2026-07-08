import { describe, expect, it, vi } from "vitest";

import dailyPlanExample from "../examples/daily_plan_payload.json";
import type { DailyPlanNormalizationDatabase } from "../src/server/imports/normalize-daily-plan";
import { normalizeDailyPlanImport } from "../src/server/imports/normalize-daily-plan";

type ProcessingStatus = "PENDING" | "PROCESSED" | "REJECTED" | "FAILED";

type StoredImport = {
  id: string;
  kind: "DAILY_PLAN" | "DAILY_REFLECTION";
  schemaVersion: string;
  source: string;
  rawJson: unknown;
  validationStatus: "VALID" | "INVALID";
  processingStatus: ProcessingStatus;
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
    processedAt: null,
    errorMetadata: null,
  };
  let plan: (Omit<PlanWrite, "tasks"> & { id: string }) | null = null;
  let tasks: StoredTask[] = [];
  let dayLog = { id: "day-1", mission: null, supportiveMessage: null } as {
    id: string;
    mission: string | null;
    supportiveMessage: string | null;
  };

  const importedPayloadFindUnique = vi.fn(
    ({ where }: { where: { id: string } }) =>
      where.id === importedPayload.id ? importedPayload : null,
  );
  const importedPayloadUpdate = vi.fn(
    ({
      data,
    }: {
      data: {
        processingStatus?: ProcessingStatus;
        processedAt?: Date;
        errorMetadata?: unknown;
      };
    }) => {
      importedPayload = { ...importedPayload, ...data };
      return importedPayload;
    },
  );
  const dayLogFindFirst = vi.fn(() =>
    options.dayLogFound === false ? null : { id: dayLog.id },
  );
  const dayLogUpdate = vi.fn(
    ({ data }: { data: { mission: string; supportiveMessage: string } }) => {
      dayLog = { ...dayLog, ...data };
      return dayLog;
    },
  );
  const dailyPlanFindUnique = vi.fn(
    ({ where }: { where: { importedPayloadId: string } }) =>
      plan?.importedPayloadId === where.importedPayloadId
        ? { id: plan.id, _count: { tasks: tasks.length } }
        : null,
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
    importedPayload: {
      findUnique: importedPayloadFindUnique,
      update: importedPayloadUpdate,
    },
    dayLog: { findFirst: dayLogFindFirst, update: dayLogUpdate },
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
    replaceImport(next: StoredImport) {
      importedPayload = next;
    },
  };
}

describe("daily plan normalization", () => {
  it("links the canonical plan to its day and stores ordered tier/domain tasks", async () => {
    const testDatabase = createTestDatabase();

    await expect(
      normalizeDailyPlanImport(testDatabase.database, "import-1"),
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
        date: new Date("2026-07-01T00:00:00.000Z"),
        dayNumber: 1,
        phase: { name: "Clear the Fog" },
        cycle: { status: "ACTIVE" },
      },
      select: { id: true },
    });
  });

  it("does not recreate tasks when the same raw import is processed again", async () => {
    const testDatabase = createTestDatabase();

    await normalizeDailyPlanImport(testDatabase.database, "import-1");
    const firstTaskSnapshot = structuredClone(testDatabase.snapshot().tasks);
    const repeated = await normalizeDailyPlanImport(
      testDatabase.database,
      "import-1",
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

    await normalizeDailyPlanImport(testDatabase.database, "import-1");

    expect(testDatabase.snapshot().plan).toMatchObject({ warnings: [] });
  });

  it("replaces the same day's plan and tasks for a new import deterministically", async () => {
    const testDatabase = createTestDatabase();
    await normalizeDailyPlanImport(testDatabase.database, "import-1");

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
      processedAt: null,
      errorMetadata: null,
    });

    await expect(
      normalizeDailyPlanImport(testDatabase.database, "import-2"),
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

  it("marks the raw import failed when date, day number, and phase find no active day", async () => {
    const testDatabase = createTestDatabase({ dayLogFound: false });

    await expect(
      normalizeDailyPlanImport(testDatabase.database, "import-1"),
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
