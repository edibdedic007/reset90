import { describe, expect, it, vi } from "vitest";

import dailyPlan from "../examples/daily_plan_payload.json";
import dailyReflection from "../examples/daily_reflection_payload.json";
import weeklyReview from "../examples/weekly_review_payload.json";
import type { ImportedPayload, Prisma } from "../src/generated/prisma/client";
import {
  createGptImportRateLimiter,
  type GptImportDatabase,
  type GptImportHandlerDependencies,
  handleGptImport,
} from "../src/server/imports/http";

const TOKEN = "test-gpt-ingest-token";
const contextItem = {
  ...structuredClone(weeklyReview),
  kind: "context_item",
  idempotency_key: "2026-07-01-context-item-v1",
  payload: {
    kind: "decision_log",
    title: "Keep minimum plan visible",
    summary: "Minimum plan preserves continuity on low-energy days.",
    importance: 4,
    tags: ["minimum", "continuity"],
  },
};

function createTestDatabase() {
  const rows: ImportedPayload[] = [];
  const domainMutation = vi.fn();

  const findUnique = vi.fn(
    ({
      where,
    }: {
      where: {
        id?: string;
        source_idempotencyKey?: {
          source: string;
          idempotencyKey: string;
        };
      };
    }) => {
      if (where.id) {
        return rows.find((row) => row.id === where.id) ?? null;
      }

      const unique = where.source_idempotencyKey;
      return unique
        ? (rows.find(
            (row) =>
              row.source === unique.source &&
              row.idempotencyKey === unique.idempotencyKey,
          ) ?? null)
        : null;
    },
  );

  const create = vi.fn(
    ({ data }: { data: Prisma.ImportedPayloadCreateInput }) => {
      const row: ImportedPayload = {
        id: `import-${rows.length + 1}`,
        kind: data.kind,
        schemaVersion: data.schemaVersion,
        idempotencyKey: data.idempotencyKey,
        source: data.source,
        externalConversationId: data.externalConversationId ?? null,
        rawJson: data.rawJson as Prisma.JsonValue,
        validationStatus: data.validationStatus ?? "PENDING",
        processingStatus: data.processingStatus ?? "PENDING",
        errorMetadata: (data.errorMetadata as Prisma.JsonValue) ?? null,
        processedAt: null,
        createdAt: new Date("2026-07-07T00:00:00Z"),
      };

      rows.push(row);
      return row;
    },
  );

  const database = {
    importedPayload: { findUnique, create },
    dayLog: { update: domainMutation },
  } as unknown as GptImportDatabase;

  return { database, rows, create, domainMutation };
}

function createDependencies(
  database: GptImportDatabase,
  overrides: Partial<GptImportHandlerDependencies> = {},
): GptImportHandlerDependencies {
  return {
    env: {
      GPT_INGEST_TOKEN: TOKEN,
      GPT_INGEST_OWNER_SUBJECT: "owner-subject",
      GPT_INGEST_MAX_BODY_BYTES: "1048576",
    },
    getDatabase: () => database,
    rateLimiter: { check: () => ({ allowed: true }) },
    normalizeDailyPlan: async () => ({ status: "not_applicable" }),
    normalizeDailyReflection: async () => ({ status: "not_applicable" }),
    normalizeWeeklyReview: async () => ({ status: "not_applicable" }),
    ...overrides,
  };
}

function createRequest(
  body: unknown,
  options: {
    token?: string | null;
    idempotencyKey?: string | null;
    contentType?: string;
  } = {},
): Request {
  const token = options.token === undefined ? TOKEN : options.token;
  const bodyKey =
    typeof body === "object" && body !== null
      ? Reflect.get(body, "idempotency_key")
      : null;
  const idempotencyKey =
    options.idempotencyKey === undefined ? bodyKey : options.idempotencyKey;
  const headers = new Headers({
    "Content-Type": options.contentType ?? "application/json",
  });

  if (token !== null) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (typeof idempotencyKey === "string") {
    headers.set("Idempotency-Key", idempotencyKey);
  }

  return new Request("http://localhost/api/gpt/import", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("GPT import HTTP boundary", () => {
  it("rejects a missing token before initializing the database", async () => {
    const { database } = createTestDatabase();
    const getDatabase = vi.fn(() => database);

    const response = await handleGptImport(
      createRequest(dailyPlan, { token: null }),
      createDependencies(database, { getDatabase }),
    );

    expect(response.status).toBe(401);
    await expect(responseJson(response)).resolves.toEqual({
      ok: false,
      error: "unauthorized",
    });
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("rejects a bad token", async () => {
    const { database, rows } = createTestDatabase();

    const response = await handleGptImport(
      createRequest(dailyPlan, { token: "wrong-token" }),
      createDependencies(database),
    );

    expect(response.status).toBe(401);
    expect(rows).toHaveLength(0);
  });

  it.each([
    ["daily plan", dailyPlan, "DAILY_PLAN"],
    ["daily reflection", dailyReflection, "DAILY_REFLECTION"],
    ["weekly review", weeklyReview, "WEEKLY_REVIEW"],
  ])(
    "accepts and stores a valid authenticated %s",
    async (_, payload, kind) => {
      const { database, rows } = createTestDatabase();

      const response = await handleGptImport(
        createRequest(payload),
        createDependencies(database),
      );

      expect(response.status).toBe(201);
      await expect(responseJson(response)).resolves.toEqual({
        ok: true,
        status: "created",
        imported_payload_id: "import-1",
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        kind,
        validationStatus: "VALID",
        processingStatus: "PENDING",
        rawJson: payload,
      });
    },
  );

  it("rejects an invalid payload without domain mutation", async () => {
    const invalid = structuredClone(dailyReflection);
    invalid.payload.summary = "x".repeat(1_501);
    const { database, rows, domainMutation } = createTestDatabase();

    const response = await handleGptImport(
      createRequest(invalid),
      createDependencies(database),
    );

    expect(response.status).toBe(422);
    expect(await responseJson(response)).toMatchObject({
      ok: false,
      error: "validation_error",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      validationStatus: "INVALID",
      processingStatus: "REJECTED",
    });
    expect(domainMutation).not.toHaveBeenCalled();
  });

  it("normalizes a newly stored daily reflection for the configured owner", async () => {
    const { database } = createTestDatabase();
    const normalizeDailyReflection = vi.fn().mockResolvedValue({
      status: "processed",
      dailyReflectionId: "reflection-1",
    });

    const response = await handleGptImport(
      createRequest(dailyReflection),
      createDependencies(database, { normalizeDailyReflection }),
    );

    expect(response.status).toBe(201);
    await expect(responseJson(response)).resolves.toEqual({
      ok: true,
      status: "created",
      imported_payload_id: "import-1",
      normalized_records: ["daily_reflection"],
    });
    expect(normalizeDailyReflection).toHaveBeenCalledWith(
      database,
      "import-1",
      "owner-subject",
    );
  });

  it("stores raw reflection then returns unavailable when owner config is missing", async () => {
    const { database, rows } = createTestDatabase();

    const response = await handleGptImport(
      createRequest(dailyReflection),
      createDependencies(database, {
        env: { GPT_INGEST_TOKEN: TOKEN },
      }),
    );

    expect(response.status).toBe(503);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.processingStatus).toBe("PENDING");
  });

  it("stores raw weekly review then returns unavailable without owner configuration", async () => {
    const { database, rows } = createTestDatabase();

    const response = await handleGptImport(
      createRequest(weeklyReview),
      createDependencies(database, {
        env: { GPT_INGEST_TOKEN: TOKEN },
      }),
    );

    expect(response.status).toBe(503);
    await expect(responseJson(response)).resolves.toEqual({
      ok: false,
      error: "service_unavailable",
    });
    expect(rows[0]).toMatchObject({
      kind: "WEEKLY_REVIEW",
      processingStatus: "PENDING",
    });
  });

  it("normalizes a newly stored weekly review for the configured owner", async () => {
    const { database } = createTestDatabase();
    const normalizeWeeklyReview = vi.fn().mockResolvedValue({
      status: "processed",
      weeklyReviewId: "review-1",
    });

    const response = await handleGptImport(
      createRequest(weeklyReview),
      createDependencies(database, { normalizeWeeklyReview }),
    );

    expect(response.status).toBe(201);
    await expect(responseJson(response)).resolves.toEqual({
      ok: true,
      status: "created",
      imported_payload_id: "import-1",
      normalized_records: ["weekly_review"],
    });
    expect(normalizeWeeklyReview).toHaveBeenCalledWith(
      database,
      "import-1",
      "owner-subject",
    );
  });

  it("stores a context item without reflection owner configuration", async () => {
    const { database, rows } = createTestDatabase();

    const response = await handleGptImport(
      createRequest(contextItem),
      createDependencies(database, {
        env: { GPT_INGEST_TOKEN: TOKEN },
      }),
    );

    expect(response.status).toBe(201);
    await expect(responseJson(response)).resolves.toEqual({
      ok: true,
      status: "created",
      imported_payload_id: "import-1",
    });
    expect(rows[0]).toMatchObject({
      kind: "CONTEXT_ITEM",
      processingStatus: "PENDING",
    });
  });

  it("normalizes a newly stored daily plan without reflection owner configuration", async () => {
    const { database } = createTestDatabase();
    const normalizeDailyPlan = vi.fn().mockResolvedValue({
      status: "processed",
      dailyPlanId: "plan-1",
      taskCount: 10,
    });

    const response = await handleGptImport(
      createRequest(dailyPlan),
      createDependencies(database, {
        env: { GPT_INGEST_TOKEN: TOKEN },
        normalizeDailyPlan,
      }),
    );

    expect(response.status).toBe(201);
    await expect(responseJson(response)).resolves.toEqual({
      ok: true,
      status: "created",
      imported_payload_id: "import-1",
      normalized_records: ["daily_plan", "tasks"],
    });
    expect(normalizeDailyPlan).toHaveBeenCalledWith(database, "import-1");
  });

  it("returns a safe normalization error while preserving raw import reference", async () => {
    const { database } = createTestDatabase();

    const response = await handleGptImport(
      createRequest(dailyPlan),
      createDependencies(database, {
        normalizeDailyPlan: async () => ({
          status: "failed",
          code: "day_log_not_found",
        }),
      }),
    );

    expect(response.status).toBe(422);
    await expect(responseJson(response)).resolves.toEqual({
      ok: false,
      error: "normalization_error",
      code: "day_log_not_found",
      imported_payload_id: "import-1",
    });
  });

  it("returns the existing import for a duplicate idempotency key", async () => {
    const { database, rows, create } = createTestDatabase();
    const dependencies = createDependencies(database);

    const created = await handleGptImport(
      createRequest(dailyPlan),
      dependencies,
    );
    const duplicate = await handleGptImport(
      createRequest(dailyPlan),
      dependencies,
    );

    expect(created.status).toBe(201);
    expect(duplicate.status).toBe(200);
    await expect(responseJson(duplicate)).resolves.toEqual({
      ok: true,
      status: "duplicate",
      imported_payload_id: "import-1",
    });
    expect(rows).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not renormalize an exact successful reflection retry", async () => {
    const { database, rows, create } = createTestDatabase();
    const normalizeDailyReflection = vi.fn(async () => {
      if (rows[0]) rows[0].processingStatus = "PROCESSED";
      return {
        status: "processed" as const,
        dailyReflectionId: "reflection-1",
      };
    });
    const dependencies = createDependencies(database, {
      normalizeDailyReflection,
    });

    const created = await handleGptImport(
      createRequest(dailyReflection),
      dependencies,
    );
    const duplicate = await handleGptImport(
      createRequest(dailyReflection),
      dependencies,
    );

    expect(created.status).toBe(201);
    expect(duplicate.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(1);
    expect(normalizeDailyReflection).toHaveBeenCalledTimes(1);
  });

  it("rejects a body larger than the configured byte limit", async () => {
    const { database, rows } = createTestDatabase();

    const response = await handleGptImport(
      createRequest(dailyPlan),
      createDependencies(database, {
        env: {
          GPT_INGEST_TOKEN: TOKEN,
          GPT_INGEST_OWNER_SUBJECT: "owner-subject",
          GPT_INGEST_MAX_BODY_BYTES: "16",
        },
      }),
    );

    expect(response.status).toBe(413);
    expect(rows).toHaveLength(0);
  });

  it("requires the header and envelope idempotency keys to match", async () => {
    const { database, rows } = createTestDatabase();

    const response = await handleGptImport(
      createRequest(dailyPlan, { idempotencyKey: "another-stable-key" }),
      createDependencies(database),
    );

    expect(response.status).toBe(400);
    await expect(responseJson(response)).resolves.toEqual({
      ok: false,
      error: "idempotency_key_mismatch",
    });
    expect(rows).toHaveLength(0);
  });

  it("limits authenticated requests within one process window", () => {
    let now = 0;
    const rateLimiter = createGptImportRateLimiter(() => now);

    for (let request = 0; request < 60; request += 1) {
      expect(rateLimiter.check()).toEqual({ allowed: true });
    }

    expect(rateLimiter.check()).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    now = 60_000;
    expect(rateLimiter.check()).toEqual({ allowed: true });
  });
});
