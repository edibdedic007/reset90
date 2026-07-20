import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  getReadOnlyBrowserSessionResult: vi.fn(),
  getPrismaClient: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  getReadOnlyBrowserSessionResult: routeMocks.getReadOnlyBrowserSessionResult,
}));

vi.mock("@/server/db/client", () => ({
  getPrismaClient: routeMocks.getPrismaClient,
}));

import {
  SettingsExportActions,
  USER_EXPORT_ACTIONS,
  UserExportDownloadError,
  createUserExportGuard,
  downloadUserExport,
} from "../src/components/settings-export";
import type { UserDataExportDatabase } from "../src/server/user-data-export";
import {
  CHECKIN_CSV_HEADERS,
  DAY_LOG_CSV_HEADERS,
  FULL_EXPORT_SCHEMA_VERSION,
  FULL_EXPORT_TYPE,
  RAW_IMPORT_SCOPE,
  TASK_CSV_HEADERS,
  assembleUserDataExport,
  handleUserDataExportRequest,
  serializeCheckinsCsv,
  serializeDayLogsCsv,
  serializeFullJsonExport,
  serializeSummariesMarkdown,
  serializeTasksCsv,
} from "../src/server/user-data-export";

const NOW = new Date("2026-07-20T13:14:15.123Z");
const USER_ID = "11111111-1111-4111-8111-111111111111";

function timestamp(day: number, hour = 8) {
  return new Date(
    `2026-07-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`,
  );
}

function dayLog(dayNumber: number, overrides: Record<string, unknown> = {}) {
  const date = timestamp(dayNumber, 0);
  return {
    id: `day-${String(dayNumber).padStart(2, "0")}`,
    cycleId: "cycle-active",
    phaseId: "phase-1",
    date,
    dayNumber,
    energyLevel: null,
    status: "UNSET",
    mission: null,
    supportiveMessage: null,
    notes: null,
    createdAt: date,
    updatedAt: date,
    dailyPlan: null,
    dailyReflection: null,
    checkins: [],
    recoveryEvent: null,
    ...overrides,
  };
}

function fullUser() {
  const createdAt = new Date("2026-01-01T00:00:00.000Z");
  const activeDay = dayLog(1, {
    energyLevel: "HIGH",
    status: "GOLD",
    mission: "=Focus, then rest",
    supportiveMessage: 'Unicode survives: Život 🚀 "steady"',
    notes: "Line one\r\nLine two, quoted",
    dailyPlan: {
      id: "plan-1",
      dayLogId: "day-01",
      importedPayloadId: "raw-shared",
      source: "custom-gpt",
      schemaVersion: "1.0",
      mission: "Plan mission",
      supportiveMessage: "Keep going",
      warnings: ["warning"],
      downshiftRule: "Use minimum tier",
      contextSummary: "Stored context",
      createdAt: timestamp(1, 7),
      updatedAt: timestamp(1, 7),
      tasks: [
        {
          id: "task-1",
          dailyPlanId: "plan-1",
          title: "=SUM(1,1)",
          description: 'Comma, quote " and\nnewline Ž',
          domain: "WORK",
          tier: "MINIMUM",
          estimateMinutes: 15,
          trigger: "+after coffee",
          why: "Build momentum",
          completedAt: timestamp(1, 9),
          skippedAt: null,
          notes: "@private note",
          sortOrder: 1,
          createdAt: timestamp(1, 7),
          updatedAt: timestamp(1, 9),
        },
        {
          id: "task-2",
          dailyPlanId: "plan-1",
          title: "Skipped task",
          description: null,
          domain: "BODY",
          tier: "STANDARD",
          estimateMinutes: null,
          trigger: null,
          why: null,
          completedAt: null,
          skippedAt: timestamp(1, 10),
          notes: null,
          sortOrder: 2,
          createdAt: timestamp(1, 7),
          updatedAt: timestamp(1, 10),
        },
      ],
    },
    dailyReflection: {
      id: "reflection-1",
      dayLogId: "day-01",
      importedPayloadId: "raw-reflection",
      summary: "Stored reflection",
      whatHappened: null,
      whatWorked: "Minimum tier",
      whatBlockedMe: null,
      tomorrowAdjustment: "Start earlier",
      selfCriticismNote: null,
      dayStatusRecommendation: "GREEN",
      createdAt: timestamp(1, 20),
      updatedAt: timestamp(1, 20),
    },
    checkins: [
      {
        id: "checkin-1",
        dayLogId: "day-01",
        kind: "MORNING",
        timestamp: timestamp(1, 8),
        energyLevel: "HIGH",
        moodScore: 8,
        fogScore: 2,
        lonelinessScore: 3,
        selfCriticismScore: 2,
        digitalControlScore: 7,
        learningResistanceScore: 3,
        bodyRelationshipScore: 6,
        workConfidenceScore: 8,
        note: "@formula\nUnicode Ž",
      },
      {
        id: "checkin-2",
        dayLogId: "day-01",
        kind: "MORNING",
        timestamp: timestamp(1, 9),
        energyLevel: "NORMAL",
        moodScore: 7,
        fogScore: 3,
        lonelinessScore: 3,
        selfCriticismScore: 3,
        digitalControlScore: 7,
        learningResistanceScore: 3,
        bodyRelationshipScore: 6,
        workConfidenceScore: 7,
        note: null,
      },
    ],
    recoveryEvent: {
      id: "recovery-1",
      cycleId: "cycle-active",
      dayLogId: "day-01",
      selectedActionIds: ["hydrate", "walk"],
      startedAt: timestamp(1, 12),
      completedAt: timestamp(1, 13),
      creditConsumedAt: timestamp(1, 13),
    },
  });

  return {
    id: USER_ID,
    authentikSubject: "AUTHENTIK_SECRET_SENTINEL",
    sessionToken: "SESSION_SECRET_SENTINEL",
    email: "owner@example.test",
    displayName: "Owner Ž",
    createdAt,
    updatedAt: NOW,
    resetCycles: [
      {
        id: "cycle-archived",
        userId: USER_ID,
        name: "Archived cycle",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2026-06-29T00:00:00.000Z"),
        status: "ARCHIVED",
        recoveryCreditLimit: 5,
        createdAt,
        updatedAt: createdAt,
        phases: [],
        dayLogs: [],
        weeklyReviews: [],
        contextItems: [],
      },
      {
        id: "cycle-active",
        userId: USER_ID,
        name: "Current\n# injected heading",
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-09-28T00:00:00.000Z"),
        status: "ACTIVE",
        recoveryCreditLimit: 6,
        createdAt,
        updatedAt: NOW,
        phases: [
          {
            id: "phase-1",
            cycleId: "cycle-active",
            name: "Clear the Fog",
            dayStart: 1,
            dayEnd: 30,
            description: null,
          },
        ],
        dayLogs: [activeDay, dayLog(2)],
        weeklyReviews: [
          {
            id: "review-1",
            cycleId: "cycle-active",
            importedPayloadId: "raw-shared",
            weekNumber: 1,
            dateFrom: new Date("2026-07-01T00:00:00.000Z"),
            dateTo: new Date("2026-07-07T00:00:00.000Z"),
            summary: "Stored summary\n# cannot escape quote",
            winsJson: ["One win"],
            blockersJson: ["One blocker"],
            patternsJson: ["One pattern"],
            recommendedChangesJson: ["One change"],
            nextWeekCommitmentsJson: ["One commitment"],
            metricsJson: { completed: 4 },
            createdAt: timestamp(7),
            updatedAt: timestamp(7),
          },
          {
            id: "review-2",
            cycleId: "cycle-active",
            importedPayloadId: "raw-review-2",
            weekNumber: 2,
            dateFrom: new Date("2026-07-08T00:00:00.000Z"),
            dateTo: new Date("2026-07-14T00:00:00.000Z"),
            summary: "Second stored summary",
            winsJson: [],
            blockersJson: [],
            patternsJson: [],
            recommendedChangesJson: [],
            nextWeekCommitmentsJson: [],
            metricsJson: {},
            createdAt: timestamp(14),
            updatedAt: timestamp(14),
          },
        ],
        contextItems: [
          {
            id: "context-report",
            cycleId: "cycle-active",
            kind: "CYCLE_REPORT",
            domain: "SYSTEM",
            title: "Stored report\n## not a heading",
            summary: "Existing cycle report only.",
            sourceType: "IMPORT",
            importedPayloadId: "raw-context",
            sourceRef: "conversation-1",
            pinnedAt: null,
            createdAt: timestamp(15),
            updatedAt: timestamp(15),
            tags: [
              {
                id: "tag-1",
                contextItemId: "context-report",
                name: "Report",
                normalizedName: "report",
                createdAt: timestamp(15),
              },
            ],
          },
          {
            id: "context-manual",
            cycleId: "cycle-active",
            kind: "DECISION",
            domain: "WORK",
            title: "Manual decision",
            summary: "No raw import",
            sourceType: "MANUAL",
            importedPayloadId: null,
            sourceRef: null,
            pinnedAt: null,
            createdAt: timestamp(16),
            updatedAt: timestamp(16),
            tags: [],
          },
        ],
      },
    ],
  };
}

function rawPayloads() {
  return [
    "raw-shared",
    "raw-reflection",
    "raw-review-2",
    "raw-context",
    "raw-unlinked",
  ].map((id, index) => ({
    id,
    kind: index === 1 ? "DAILY_REFLECTION" : "DAILY_PLAN",
    schemaVersion: "1.0",
    idempotencyKey: `key-${id}`,
    source: "custom-gpt",
    externalConversationId: null,
    rawJson: { id, unicode: "Ž 🚀", private: "RAW_PRIVATE_SENTINEL" },
    validationStatus: id === "raw-unlinked" ? "INVALID" : "VALID",
    processingStatus: id === "raw-unlinked" ? "REJECTED" : "PROCESSED",
    errorMetadata: id === "raw-unlinked" ? { issue: "private" } : null,
    processedAt: timestamp(index + 1),
    createdAt: timestamp(index + 1),
  }));
}

function exportDatabase(user: ReturnType<typeof fullUser> | null = fullUser()) {
  const payloads = rawPayloads();
  const forbiddenWrites = {
    userUpsert: vi.fn(),
    userUpdate: vi.fn(),
    payloadUpdate: vi.fn(),
    dayLogUpdate: vi.fn(),
    taskUpdate: vi.fn(),
    recoveryUpdate: vi.fn(),
    contextCreate: vi.fn(),
  };
  const userFindUnique = vi.fn(async (args: { where: { id: string } }) =>
    user?.id === args.where.id ? user : null,
  );
  const importedFindMany = vi.fn(
    async (args: { where: { id: { in: string[] } } }) =>
      payloads.filter((payload) => args.where.id.in.includes(payload.id)),
  );
  const transactionClient = {
    user: {
      findUnique: userFindUnique,
      upsert: forbiddenWrites.userUpsert,
      update: forbiddenWrites.userUpdate,
    },
    importedPayload: {
      findMany: importedFindMany,
      update: forbiddenWrites.payloadUpdate,
    },
    dayLog: { update: forbiddenWrites.dayLogUpdate },
    task: { update: forbiddenWrites.taskUpdate },
    recoveryEvent: { update: forbiddenWrites.recoveryUpdate },
    contextItem: { create: forbiddenWrites.contextCreate },
  };
  const transaction = vi.fn(
    async (callback: (client: typeof transactionClient) => Promise<unknown>) =>
      callback(transactionClient),
  );
  return {
    database: {
      $transaction: transaction,
    } as unknown as UserDataExportDatabase,
    transaction,
    userFindUnique,
    importedFindMany,
    forbiddenWrites,
  };
}

async function assembled(test = exportDatabase()) {
  const data = await assembleUserDataExport(test.database, USER_ID, NOW);
  if (!data) throw new Error("Expected export data");
  return { data, test };
}

function authenticated() {
  return {
    status: "authenticated" as const,
    session: { userId: USER_ID },
  };
}

describe("Phase 18 owned full export", () => {
  it("uses one read-only owned snapshot with explicit field allowlists", async () => {
    const { data, test } = await assembled();

    expect(test.userFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: USER_ID } }),
    );
    const query = JSON.stringify(test.userFindUnique.mock.calls[0]?.[0]);
    expect(query).not.toContain("authentikSubject");
    expect(query).not.toContain("sessionToken");
    expect(test.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
    });
    for (const write of Object.values(test.forbiddenWrites)) {
      expect(write).not.toHaveBeenCalled();
    }
    expect(data.reset_cycles.map((cycle) => cycle.id)).toEqual([
      "cycle-archived",
      "cycle-active",
    ]);
    expect(data.day_logs.map((day) => day.id)).toEqual(["day-01", "day-02"]);
    expect(data.user).toEqual({
      id: USER_ID,
      email: "owner@example.test",
      display_name: "Owner Ž",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: NOW.toISOString(),
    });
  });

  it("exports exact contract, relationships, statuses, nulls, and stored values", async () => {
    const { data } = await assembled();
    expect(data.export_type).toBe(FULL_EXPORT_TYPE);
    expect(data.schema_version).toBe(FULL_EXPORT_SCHEMA_VERSION);
    expect(data.manifest.raw_import_scope).toBe(RAW_IMPORT_SCOPE);
    expect(Object.keys(data)).toEqual([
      "export_type",
      "schema_version",
      "generated_at",
      "manifest",
      "user",
      "reset_cycles",
      "reset_phases",
      "day_logs",
      "daily_plans",
      "tasks",
      "checkins",
      "recovery_events",
      "daily_reflections",
      "weekly_reviews",
      "context_items",
      "context_tags",
      "imported_payloads",
    ]);
    expect(data.day_logs[0]?.status).toBe("GOLD");
    expect(data.day_logs[0]?.energy_level).toBe("HIGH");
    expect(data.day_logs[1]?.energy_level).toBeNull();
    expect(data.tasks[0]).toMatchObject({
      daily_plan_id: "plan-1",
      completed_at: "2026-07-01T09:00:00.000Z",
      skipped_at: null,
    });
    expect(data.tasks[1]).toMatchObject({
      completed_at: null,
      skipped_at: "2026-07-01T10:00:00.000Z",
    });
    expect(data.recovery_events[0]).toMatchObject({
      cycle_id: "cycle-active",
      selected_action_ids: ["hydrate", "walk"],
      credit_consumed_at: "2026-07-01T13:00:00.000Z",
    });
    expect(data.daily_reflections[0]?.day_status_recommendation).toBe("GREEN");
    expect(data.day_logs[0]?.status).toBe("GOLD");
    expect(data.context_tags[0]?.context_item_id).toBe("context-report");
    const cycleIds = new Set(data.reset_cycles.map((cycle) => cycle.id));
    const phaseIds = new Set(data.reset_phases.map((phase) => phase.id));
    const dayIds = new Set(data.day_logs.map((day) => day.id));
    const planIds = new Set(data.daily_plans.map((plan) => plan.id));
    const contextIds = new Set(data.context_items.map((item) => item.id));
    expect(
      data.reset_phases.every((phase) => cycleIds.has(phase.cycle_id)),
    ).toBe(true);
    expect(
      data.day_logs.every(
        (day) => cycleIds.has(day.cycle_id) && phaseIds.has(day.phase_id),
      ),
    ).toBe(true);
    expect(data.daily_plans.every((plan) => dayIds.has(plan.day_log_id))).toBe(
      true,
    );
    expect(data.tasks.every((task) => planIds.has(task.daily_plan_id))).toBe(
      true,
    );
    expect(
      data.checkins.every((checkin) => dayIds.has(checkin.day_log_id)),
    ).toBe(true);
    expect(
      data.context_tags.every((tag) => contextIds.has(tag.context_item_id)),
    ).toBe(true);
  });

  it("includes only deduplicated raw imports linked from owned normalized records", async () => {
    const { data, test } = await assembled();
    expect(data.imported_payloads.map((payload) => payload.id)).toEqual([
      "raw-shared",
      "raw-reflection",
      "raw-review-2",
      "raw-context",
    ]);
    expect(
      new Set(data.imported_payloads.map((payload) => payload.id)).size,
    ).toBe(data.imported_payloads.length);
    expect(data.imported_payloads.map((payload) => payload.id)).not.toContain(
      "raw-unlinked",
    );
    expect(test.importedFindMany.mock.calls[0]?.[0].where.id.in).not.toContain(
      "raw-unlinked",
    );
  });

  it("excludes foreign users and returns valid empty owned exports", async () => {
    const foreign = exportDatabase();
    await expect(
      assembleUserDataExport(foreign.database, "foreign-user", NOW),
    ).resolves.toBeNull();
    expect(foreign.importedFindMany).not.toHaveBeenCalled();

    const emptyUser = fullUser();
    emptyUser.resetCycles = [];
    const { data } = await assembled(exportDatabase(emptyUser));
    for (const count of Object.values(data.manifest.record_counts)) {
      expect(count).toBe(0);
    }
    expect(data.reset_cycles).toEqual([]);
    expect(data.imported_payloads).toEqual([]);
  });

  it("exports a representative complete 90-day set", async () => {
    const user = fullUser();
    user.resetCycles = [user.resetCycles[1]!];
    user.resetCycles[0]!.dayLogs = Array.from({ length: 90 }, (_, index) => {
      const date = new Date(Date.UTC(2026, 6, index + 1));
      return dayLog(index + 1, { date, createdAt: date, updatedAt: date });
    });
    const { data } = await assembled(exportDatabase(user));
    expect(data.day_logs).toHaveLength(90);
    expect(data.day_logs[0]?.day_number).toBe(1);
    expect(data.day_logs[89]?.day_number).toBe(90);
  });

  it("exports archived cycles without requiring an active cycle", async () => {
    const user = fullUser();
    user.resetCycles = [user.resetCycles[0]!];
    const { data } = await assembled(exportDatabase(user));
    expect(data.reset_cycles).toHaveLength(1);
    expect(data.reset_cycles[0]?.status).toBe("ARCHIVED");
  });

  it("is deterministic except for generated timestamp", async () => {
    const first = await assembleUserDataExport(
      exportDatabase().database,
      USER_ID,
      NOW,
    );
    const later = new Date("2026-07-20T13:14:16.123Z");
    const second = await assembleUserDataExport(
      exportDatabase().database,
      USER_ID,
      later,
    );
    expect(first && { ...first, generated_at: "" }).toEqual(
      second && { ...second, generated_at: "" },
    );
    expect(first?.generated_at).not.toBe(second?.generated_at);
  });

  it("serializes Unicode while excluding auth and environment secrets", async () => {
    const { data } = await assembled();
    const json = serializeFullJsonExport(data);
    expect(JSON.parse(json)).toEqual(data);
    expect(json).toContain("Život 🚀");
    expect(json).not.toContain("AUTHENTIK_SECRET_SENTINEL");
    expect(json).not.toContain("SESSION_SECRET_SENTINEL");
    expect(json).not.toContain("authentik_subject");
    expect(json).not.toContain("DATABASE_URL");
  });
});

describe("Phase 18 CSV and Markdown serializers", () => {
  it("returns fixed header-only CSVs for empty data", async () => {
    const user = fullUser();
    user.resetCycles = [];
    const { data } = await assembled(exportDatabase(user));
    expect(serializeDayLogsCsv(data)).toBe(
      `${DAY_LOG_CSV_HEADERS.join(",")}\r\n`,
    );
    expect(serializeTasksCsv(data)).toBe(`${TASK_CSV_HEADERS.join(",")}\r\n`);
    expect(serializeCheckinsCsv(data)).toBe(
      `${CHECKIN_CSV_HEADERS.join(",")}\r\n`,
    );
  });

  it("encodes day-log commas, quotes, CRLF, Unicode, and formula prefixes", async () => {
    const { data } = await assembled();
    const output = serializeDayLogsCsv(data);
    expect(output.startsWith(`${DAY_LOG_CSV_HEADERS.join(",")}\r\n`)).toBe(
      true,
    );
    expect(output).toContain("'=Focus");
    expect(output).toContain('"Unicode survives: Život 🚀 ""steady"""');
    expect(output).toContain('"Line one\r\nLine two, quoted"');
  });

  it("keeps task parent IDs plus distinct completed and skipped timestamps", async () => {
    const { data } = await assembled();
    const output = serializeTasksCsv(data);
    expect(output).toContain("task-1,plan-1,day-01,cycle-active");
    expect(output).toContain("task-2,plan-1,day-01,cycle-active");
    expect(output).toContain("'=SUM(1,1)");
    expect(output).toContain("'+after coffee");
    expect(output).toContain("'@private note");
    expect(output).toContain("2026-07-01T09:00:00.000Z,");
    expect(output).toContain(",2026-07-01T10:00:00.000Z,");
  });

  it("keeps repeated check-ins as separate rows with parent IDs", async () => {
    const { data } = await assembled();
    const output = serializeCheckinsCsv(data);
    expect(output.match(/checkin-[12],day-01,cycle-active/g)).toHaveLength(2);
    expect(output).toContain("'@formula\nUnicode Ž");
  });

  it("renders ordered stored reviews and cycle reports with controlled structure", async () => {
    const { data } = await assembled();
    const output = serializeSummariesMarkdown(data);
    expect(output.indexOf("#### Week 1")).toBeLessThan(
      output.indexOf("#### Week 2"),
    );
    expect(output).toContain("Existing cycle report only.");
    expect(output).toContain("**Stored metrics**");
    expect(output).toContain("> # cannot escape quote");
    expect(output).toContain("> ## not a heading");
    expect(output).not.toContain("\n# cannot escape quote");
    expect(output).not.toContain("RAW_PRIVATE_SENTINEL");
    expect(output).not.toContain("AUTHENTIK_SECRET_SENTINEL");
    expect(output).not.toContain("source_ref");
  });

  it("uses neutral missing-summary text without generating substitutes", async () => {
    const { data } = await assembled();
    const output = serializeSummariesMarkdown(data);
    expect(output).toContain(
      "No weekly reviews have been stored for this cycle.",
    );
    expect(output).toContain("No stored cycle report exists for this cycle.");

    const user = fullUser();
    user.resetCycles = [];
    const empty = await assembled(exportDatabase(user));
    expect(serializeSummariesMarkdown(empty.data)).toContain(
      "No stored weekly-review or cycle-report summaries exist.",
    );
  });
});

describe("Phase 18 private HTTP export", () => {
  it("rejects no browser session, including GPT bearer-token requests", async () => {
    const getDatabase = vi.fn();
    const response = await handleUserDataExportRequest(
      new Request("http://localhost/api/export/full-json", {
        headers: { Authorization: "Bearer gpt-machine-token" },
      }),
      "full-json",
      {
        getSessionResult: async () => ({ status: "unauthenticated" }),
        getDatabase,
      },
    );
    expect(response.status).toBe(401);
    expect(getDatabase).not.toHaveBeenCalled();
    expect(response.headers.get("Content-Disposition")).toBeNull();
  });

  it("returns bounded missing-user response without database access", async () => {
    const getDatabase = vi.fn();
    const response = await handleUserDataExportRequest(
      new Request("http://localhost/api/export/full-json"),
      "full-json",
      {
        getSessionResult: async () => ({ status: "user_not_found" }),
        getDatabase,
      },
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "application_user_not_found",
      message: "No Reset90 user exists for this authenticated session.",
    });
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("rejects all caller-controlled ownership and selection parameters", async () => {
    const getDatabase = vi.fn();
    const response = await handleUserDataExportRequest(
      new Request(
        "http://localhost/api/export/full-json?user_id=other&cycle_id=other&email=other",
      ),
      "full-json",
      { getSessionResult: async () => authenticated(), getDatabase },
    );
    expect(response.status).toBe(400);
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it.each([
    [
      "full-json",
      "application/json; charset=utf-8",
      "reset90-full-export-2026-07-20T13-14-15Z.json",
    ],
    [
      "day-logs-csv",
      "text/csv; charset=utf-8",
      "reset90-day-logs-2026-07-20T13-14-15Z.csv",
    ],
    [
      "tasks-csv",
      "text/csv; charset=utf-8",
      "reset90-tasks-2026-07-20T13-14-15Z.csv",
    ],
    [
      "checkins-csv",
      "text/csv; charset=utf-8",
      "reset90-checkins-2026-07-20T13-14-15Z.csv",
    ],
    [
      "summaries-markdown",
      "text/markdown; charset=utf-8",
      "reset90-summaries-2026-07-20T13-14-15Z.md",
    ],
  ])(
    "streams private %s with fixed headers",
    async (kind, contentType, filename) => {
      const test = exportDatabase();
      const response = await handleUserDataExportRequest(
        new Request(`http://localhost/api/export/${kind}`),
        kind,
        {
          getSessionResult: async () => authenticated(),
          getDatabase: () => test.database,
          now: () => NOW,
        },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe(contentType);
      expect(response.headers.get("Content-Disposition")).toBe(
        `attachment; filename="${filename}"`,
      );
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    },
  );

  it("returns successful empty files for existing user with no cycles", async () => {
    const user = fullUser();
    user.resetCycles = [];
    const response = await handleUserDataExportRequest(
      new Request("http://localhost/api/export/full-json"),
      "full-json",
      {
        getSessionResult: async () => authenticated(),
        getDatabase: () => exportDatabase(user).database,
        now: () => NOW,
      },
    );
    expect(response.status).toBe(200);
    expect((await response.json()).reset_cycles).toEqual([]);
  });

  it("bounds failures without leaking database or raw-payload content", async () => {
    const database = {
      $transaction: vi.fn(async () => {
        throw new Error("RAW_PRIVATE_SENTINEL stack");
      }),
    } as unknown as UserDataExportDatabase;
    const response = await handleUserDataExportRequest(
      new Request("http://localhost/api/export/full-json"),
      "full-json",
      {
        getSessionResult: async () => authenticated(),
        getDatabase: () => database,
      },
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("RAW_PRIVATE_SENTINEL");
  });

  it("wires route through detailed read-only session resolution", async () => {
    routeMocks.getReadOnlyBrowserSessionResult.mockReset();
    routeMocks.getPrismaClient.mockReset();
    routeMocks.getReadOnlyBrowserSessionResult.mockResolvedValue({
      status: "unauthenticated",
    });
    const { GET } = await import("../src/app/api/export/[format]/route");
    const response = await GET(
      new Request("http://localhost/api/export/full-json"),
      { params: Promise.resolve({ format: "full-json" }) },
    );
    expect(response.status).toBe(401);
    expect(routeMocks.getReadOnlyBrowserSessionResult).toHaveBeenCalledTimes(1);
    expect(routeMocks.getPrismaClient).not.toHaveBeenCalled();
  });
});

describe("Phase 18 Settings export UI", () => {
  it("renders exactly five approved responsive actions and no import control", () => {
    const html = renderToStaticMarkup(
      <SettingsExportActions
        notice={null}
        onExport={() => undefined}
        runningKind={null}
      />,
    );
    expect(USER_EXPORT_ACTIONS.map((action) => action.label)).toEqual([
      "Download full JSON archive",
      "Download day logs CSV",
      "Download tasks CSV",
      "Download check-ins CSV",
      "Download weekly and cycle summaries Markdown",
    ]);
    for (const action of USER_EXPORT_ACTIONS)
      expect(html).toContain(action.label);
    expect(html).not.toContain(">Import<");
    expect(html).not.toContain("cycle selector");
    expect(html).toContain("w-full");
    expect(html).toContain("sm:w-auto");
    expect(html).toContain('aria-live="polite"');
  });

  it("renders usable loading, success, and error states", () => {
    const loading = renderToStaticMarkup(
      <SettingsExportActions
        notice="Download started."
        onExport={() => undefined}
        runningKind="tasks-csv"
      />,
    );
    expect(loading).toContain("Downloading…");
    expect(loading.match(/disabled=""/g)).toHaveLength(5);
    expect(loading).toContain("Download started.");

    const error = renderToStaticMarkup(
      <SettingsExportActions
        notice="Export could not be downloaded. Try again."
        onExport={() => undefined}
        runningKind={null}
      />,
    );
    expect(error).toContain("Export could not be downloaded. Try again.");
  });

  it("blocks duplicate concurrent download starts", async () => {
    const guard = createUserExportGuard();
    let release: (() => void) | undefined;
    const first = guard(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    await expect(guard(async () => undefined)).resolves.toBe(false);
    release?.();
    await expect(first).resolves.toBe(true);
  });

  it("defers object-URL cleanup until after browser download", async () => {
    vi.useFakeTimers();
    const revokeObjectUrl = vi.fn();
    const triggerDownload = vi.fn();
    try {
      await downloadUserExport("tasks-csv", {
        fetcher: async () =>
          new Response("task_id\r\n", {
            headers: {
              "Content-Disposition":
                'attachment; filename="reset90-tasks-2026-07-20T13-14-15Z.csv"',
            },
          }),
        createObjectUrl: () => "blob:export",
        revokeObjectUrl,
        triggerDownload,
      });
      expect(triggerDownload).toHaveBeenCalledWith(
        "blob:export",
        "reset90-tasks-2026-07-20T13-14-15Z.csv",
      );
      expect(revokeObjectUrl).not.toHaveBeenCalled();
      await vi.runAllTimersAsync();
      expect(revokeObjectUrl).toHaveBeenCalledWith("blob:export");
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses bounded server error text only", async () => {
    const request = downloadUserExport("full-json", {
      fetcher: async () =>
        Response.json(
          {
            message: "Reset90 data could not be exported. Try again.",
            stack: "PRIVATE_STACK_SENTINEL",
          },
          { status: 500 },
        ),
    });
    await expect(request).rejects.toEqual(
      new UserExportDownloadError(
        "Reset90 data could not be exported. Try again.",
        500,
      ),
    );
    await expect(request).rejects.not.toThrow("PRIVATE_STACK_SENTINEL");
  });
});
