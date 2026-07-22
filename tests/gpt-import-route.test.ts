import { describe, expect, it, vi } from "vitest";

import dailyPlan from "../examples/daily_plan_payload.json";
import dailyReflection from "../examples/daily_reflection_payload.json";
import weeklyReview from "../examples/weekly_review_payload.json";
import type { ImportedPayload, Prisma } from "../src/generated/prisma/client";
import {
  createGptImportRateLimiter,
  fingerprintMachineToken,
  type GptImportDatabase,
  type GptImportHandlerDependencies,
  handleGptImport,
} from "../src/server/imports/http";

const TOKEN = "test-gpt-ingest-token";
const contextItem = {
  ...structuredClone(weeklyReview),
  kind: "context_item",
  schema_version: "2.0",
  idempotency_key: "2026-07-01-context-item-v2",
  payload: {
    kind: "DECISION",
    domain: "WORK",
    title: "Keep minimum plan visible",
    summary: "Minimum plan preserves continuity on low-energy days.",
    tags: ["minimum", "continuity"],
  },
};
const legacyContextItem = {
  ...structuredClone(contextItem),
  schema_version: "1.0",
  idempotency_key: "2026-07-01-legacy-context-item-v1",
  payload: {
    kind: "decision_log",
    title: "Legacy context",
    summary: "Published context contract content.",
    importance: 3,
    tags: ["legacy"],
    is_sensitive: true,
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
    },
    getDatabase: () => database,
    rateLimiter: createGptImportRateLimiter(() => 0),
    normalizeDailyPlan: async () => ({ status: "not_applicable" }),
    normalizeContextItem: async () => ({ status: "not_applicable" }),
    normalizeDailyReflection: async () => ({ status: "not_applicable" }),
    normalizeWeeklyReview: async () => ({ status: "not_applicable" }),
    ...overrides,
  };
}

function createRequest(
  body: unknown,
  options: {
    token?: string | null;
    authorization?: string | null;
    idempotencyKey?: string | null;
    contentType?: string;
    contentEncoding?: string;
    cookie?: string;
    url?: string;
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

  const authorization =
    options.authorization === undefined
      ? token === null
        ? null
        : `Bearer ${token}`
      : options.authorization;
  if (authorization !== null) {
    headers.set("Authorization", authorization);
  }
  if (typeof idempotencyKey === "string") {
    headers.set("Idempotency-Key", idempotencyKey);
  }
  if (options.contentEncoding) {
    headers.set("Content-Encoding", options.contentEncoding);
  }
  if (options.cookie) {
    headers.set("Cookie", options.cookie);
  }

  return new Request(options.url ?? "http://localhost/api/gpt/import", {
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
    ["empty bearer", "Bearer "],
    ["missing token", "Bearer"],
    ["wrong scheme", `Basic ${TOKEN}`],
    ["extra whitespace", `Bearer  ${TOKEN}`],
  ])("rejects malformed authorization: %s", async (_name, authorization) => {
    const { database, rows } = createTestDatabase();
    const response = await handleGptImport(
      createRequest(dailyPlan, { authorization }),
      createDependencies(database),
    );
    expect(response.status).toBe(401);
    expect(rows).toHaveLength(0);
  });

  it("ignores credentials in query, cookie, and request body", async () => {
    const { database, rows } = createTestDatabase();
    const bodyCredential = {
      ...dailyPlan,
      authorization: `Bearer ${TOKEN}`,
    };
    const response = await handleGptImport(
      createRequest(bodyCredential, {
        token: null,
        cookie: `authjs.session-token=${TOKEN}; gpt_token=${TOKEN}`,
        url: `http://localhost/api/gpt/import?token=${TOKEN}`,
      }),
      createDependencies(database),
    );
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain(TOKEN);
    expect(rows).toHaveLength(0);
  });

  it("does not access an unauthorized request body", async () => {
    const { database } = createTestDatabase();
    const request = createRequest(dailyPlan, { token: null });
    const bodyAccess = vi.fn();
    Object.defineProperty(request, "body", {
      configurable: true,
      get: bodyAccess,
    });

    const response = await handleGptImport(
      request,
      createDependencies(database),
    );
    expect(response.status).toBe(401);
    expect(bodyAccess).not.toHaveBeenCalled();
  });

  it("rejects unsupported media types and compressed bodies", async () => {
    const { database, rows } = createTestDatabase();
    const wrongType = await handleGptImport(
      createRequest(dailyPlan, { contentType: "text/plain" }),
      createDependencies(database),
    );
    const compressed = await handleGptImport(
      createRequest(dailyPlan, { contentEncoding: "gzip" }),
      createDependencies(database),
    );
    expect(wrongType.status).toBe(415);
    expect(compressed.status).toBe(415);
    expect(rows).toHaveLength(0);
  });

  it("returns bounded invalid JSON before database access", async () => {
    const { database } = createTestDatabase();
    const getDatabase = vi.fn(() => database);
    const request = new Request("http://localhost/api/gpt/import", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "Idempotency-Key": "malformed-json",
      },
      body: "{",
    });
    const response = await handleGptImport(
      request,
      createDependencies(database, { getDatabase }),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "invalid_json",
    });
    expect(getDatabase).not.toHaveBeenCalled();
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
    expect(rows).toHaveLength(0);
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

  it("stores raw context then returns unavailable without owner configuration", async () => {
    const { database, rows } = createTestDatabase();

    const response = await handleGptImport(
      createRequest(contextItem),
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
      kind: "CONTEXT_ITEM",
      processingStatus: "PENDING",
    });
  });

  it("terminals a legacy context import through the configured owner boundary", async () => {
    const { database } = createTestDatabase();
    const normalizeContextItem = vi.fn().mockResolvedValue({
      status: "accepted_raw_only",
    });

    const response = await handleGptImport(
      createRequest(legacyContextItem),
      createDependencies(database, {
        env: {
          GPT_INGEST_TOKEN: TOKEN,
          GPT_INGEST_OWNER_SUBJECT: "owner-subject",
        },
        normalizeContextItem,
      }),
    );

    expect(response.status).toBe(201);
    await expect(responseJson(response)).resolves.toEqual({
      ok: true,
      status: "created",
      imported_payload_id: "import-1",
    });
    expect(normalizeContextItem).toHaveBeenCalledWith(
      database,
      "import-1",
      "owner-subject",
    );
  });

  it("normalizes a newly stored context item for the configured owner", async () => {
    const { database } = createTestDatabase();
    const normalizeContextItem = vi.fn().mockResolvedValue({
      status: "processed",
      contextItemId: "context-1",
    });

    const response = await handleGptImport(
      createRequest(contextItem),
      createDependencies(database, { normalizeContextItem }),
    );

    expect(response.status).toBe(201);
    await expect(responseJson(response)).resolves.toEqual({
      ok: true,
      status: "created",
      imported_payload_id: "import-1",
      normalized_records: ["context_item"],
    });
    expect(normalizeContextItem).toHaveBeenCalledWith(
      database,
      "import-1",
      "owner-subject",
    );
  });

  it.each([
    ["legacy 1.0", legacyContextItem, "accepted_raw_only"],
    ["Context Library 2.0", contextItem, "processed"],
  ])(
    "keeps exact %s context retries terminal",
    async (_name, payload, status) => {
      const { database, rows, create } = createTestDatabase();
      const normalizeContextItem = vi.fn(async () => {
        if (rows[0]) rows[0].processingStatus = "PROCESSED";
        return status === "processed"
          ? ({ status, contextItemId: "context-1" } as const)
          : ({ status: "accepted_raw_only" } as const);
      });
      const dependencies = createDependencies(database, {
        normalizeContextItem,
      });

      const created = await handleGptImport(
        createRequest(payload),
        dependencies,
      );
      const duplicate = await handleGptImport(
        createRequest(payload),
        dependencies,
      );

      expect(created.status).toBe(201);
      expect(duplicate.status).toBe(200);
      expect(create).toHaveBeenCalledTimes(1);
      expect(normalizeContextItem).toHaveBeenCalledTimes(1);
      expect(rows[0]).toMatchObject({
        schemaVersion: payload.schema_version,
        validationStatus: "VALID",
        processingStatus: "PROCESSED",
      });
    },
  );

  it("does not normalize context without machine authentication", async () => {
    const { database } = createTestDatabase();
    const normalizeContextItem = vi.fn();

    const response = await handleGptImport(
      createRequest(contextItem, { token: null }),
      createDependencies(database, { normalizeContextItem }),
    );

    expect(response.status).toBe(401);
    expect(normalizeContextItem).not.toHaveBeenCalled();
  });

  it("rejects daily-plan normalization when trusted owner configuration is missing", async () => {
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

    expect(response.status).toBe(503);
    await expect(responseJson(response)).resolves.toEqual({
      ok: false,
      error: "service_unavailable",
    });
    expect(normalizeDailyPlan).not.toHaveBeenCalled();
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

  it("keeps raw-only sentinel, auth, and internal metadata out of errors and logs", async () => {
    const sentinel = "RAW_ERROR_PRIVACY_SENTINEL_CONTEXT_15";
    const payload = {
      ...contextItem,
      external_conversation_id: sentinel,
      idempotency_key: "context-private-failure-v2",
    };
    const { database, rows } = createTestDatabase();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const response = await handleGptImport(
        createRequest(payload),
        createDependencies(database, {
          normalizeContextItem: async () => ({
            status: "failed",
            code: "active_cycle_not_found",
          }),
        }),
      );
      const body = JSON.stringify(await responseJson(response));
      const logs = JSON.stringify([
        ...errorSpy.mock.calls,
        ...logSpy.mock.calls,
        ...warnSpy.mock.calls,
      ]);

      expect(response.status).toBe(422);
      expect(rows[0]?.rawJson).toMatchObject({
        external_conversation_id: sentinel,
      });
      expect(body).not.toContain(sentinel);
      expect(body).not.toMatch(
        /rawJson|raw_prompt|processingAttempts|processingStatus|authorization|errorMetadata|test-gpt-ingest-token/,
      );
      expect(logs).not.toContain(sentinel);
      expect(logs).not.toContain(TOKEN);
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("logs only allowlisted metadata for unknown machine failures", async () => {
    const sentinels = [
      TOKEN,
      "COOKIE_SESSION_SENTINEL",
      "postgresql://PRIVATE_DB_SENTINEL",
      "RAW_REFLECTION_SENTINEL",
      "DIGITAL_DETOX_PRIVATE_SENTINEL",
      "PRISMA_PRIVATE_SENTINEL",
    ];
    const payload = structuredClone(dailyReflection);
    payload.idempotency_key = "machine-safe-log-failure";
    payload.payload.summary = `${sentinels[3]} ${sentinels[4]}`;
    const { database } = createTestDatabase();
    const logs: string[] = [];
    const response = await handleGptImport(
      createRequest(payload, {
        cookie: `authjs.session-token=${sentinels[1]}`,
      }),
      createDependencies(database, {
        getDatabase: () => {
          throw new Error(`${sentinels[2]} ${sentinels[5]}`);
        },
        logSink: (message) => logs.push(message),
      }),
    );
    const output = `${JSON.stringify(await response.json())}\n${logs.join("\n")}`;

    expect(response.status).toBe(503);
    for (const sentinel of sentinels) expect(output).not.toContain(sentinel);
    expect(logs.join("\n")).toContain('"event":"request_failed"');
    expect(logs.join("\n")).toContain('"operation":"gpt.import"');
    expect(logs.join("\n")).toContain('"http_status":503');
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

  it("rejects a body one byte over the fixed 128 KiB limit", async () => {
    const { database, rows } = createTestDatabase();
    const json = JSON.stringify(dailyPlan);
    const body = `${json}${" ".repeat(128 * 1024 + 1 - Buffer.byteLength(json))}`;
    const request = new Request("http://localhost/api/gpt/import", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "Idempotency-Key": dailyPlan.idempotency_key,
      },
      body,
    });

    const response = await handleGptImport(
      request,
      createDependencies(database),
    );

    expect(response.status).toBe(413);
    expect(rows).toHaveLength(0);
  });

  it("accepts a valid body exactly at the fixed 128 KiB limit", async () => {
    const { database, rows } = createTestDatabase();
    const json = JSON.stringify(dailyPlan);
    const body = `${json}${" ".repeat(128 * 1024 - Buffer.byteLength(json))}`;
    const request = new Request("http://localhost/api/gpt/import", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        "Idempotency-Key": dailyPlan.idempotency_key,
      },
      body,
    });
    const response = await handleGptImport(
      request,
      createDependencies(database),
    );
    expect(response.status).toBe(201);
    expect(rows).toHaveLength(1);
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

  it("enforces endpoint and principal rolling windows with hashed keys", () => {
    let now = 0;
    const rateLimiter = createGptImportRateLimiter(() => now);

    for (let request = 0; request < 30; request += 1) {
      expect(rateLimiter.checkPrincipal("principal-a")).toEqual({
        allowed: true,
      });
    }

    expect(rateLimiter.checkPrincipal("principal-a")).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(rateLimiter.checkPrincipal("principal-b")).toEqual({
      allowed: true,
    });
    for (let request = 0; request < 120; request += 1) {
      expect(rateLimiter.checkEndpoint()).toEqual({ allowed: true });
    }
    expect(rateLimiter.checkEndpoint()).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });

    const fingerprint = fingerprintMachineToken(TOKEN);
    rateLimiter.checkPrincipal(fingerprint);
    expect(rateLimiter.snapshot().principalKeys).toContain(fingerprint);
    expect(rateLimiter.snapshot().principalKeys.join(" ")).not.toContain(TOKEN);

    now = 60_000;
    expect(rateLimiter.checkPrincipal("principal-a")).toEqual({
      allowed: true,
    });
  });

  it("returns 429 with Retry-After on the first principal over-limit request", async () => {
    const { database } = createTestDatabase();
    const rateLimiter = createGptImportRateLimiter(() => 0);
    const fingerprint = fingerprintMachineToken(TOKEN);
    for (let request = 0; request < 30; request += 1) {
      expect(rateLimiter.checkPrincipal(fingerprint)).toEqual({
        allowed: true,
      });
    }

    const response = await handleGptImport(
      createRequest(dailyPlan),
      createDependencies(database, { rateLimiter }),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "rate_limited",
    });
  });
});
