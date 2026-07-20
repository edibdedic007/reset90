import { afterAll, beforeEach, describe, expect, it } from "vitest";

import dailyPlanExample from "../examples/daily_plan_payload.json";
import dailyReflectionExample from "../examples/daily_reflection_payload.json";
import { assertSafeTestDatabaseUrl } from "../scripts/test-database-url";
import { getContextLibrary } from "../src/server/context";
import { createPrismaClient } from "../src/server/db/client";
import { getDayDetail } from "../src/server/progress";
import {
  createGptImportRateLimiter,
  handleGptImport,
  type GptImportHandlerDependencies,
} from "../src/server/imports/http";
import { normalizeDailyPlanImport } from "../src/server/imports/normalize-daily-plan";
import { normalizeDailyReflectionImport } from "../src/server/imports/normalize-daily-reflection";

const databaseUrl = assertSafeTestDatabaseUrl();
const database = createPrismaClient(databaseUrl);
const TOKEN = "phase19-synthetic-token";
const SOURCE = "custom_gpt";
const FIXED_NOW = new Date("2026-07-01T12:00:00.000Z");
const CONSTRAINT_NAME = "phase19_reject_task_title";

const owner = {
  id: "19000000-0000-4000-8000-000000000001",
  subject: "phase19-owner",
};
const foreignOwner = {
  id: "19000000-0000-4000-8000-000000000002",
  subject: "phase19-foreign-owner",
};

type PlanPayload = typeof dailyPlanExample;
type ReflectionPayload = typeof dailyReflectionExample;

async function dropSyntheticConstraint() {
  await database.$executeRawUnsafe(
    `ALTER TABLE tasks DROP CONSTRAINT IF EXISTS ${CONSTRAINT_NAME}`,
  );
}

async function cleanFixtures() {
  await dropSyntheticConstraint();
  await database.user.deleteMany({
    where: { id: { in: [owner.id, foreignOwner.id] } },
  });
  await database.importedPayload.deleteMany({
    where: { idempotencyKey: { startsWith: "phase19-" } },
  });
}

async function seedCycle(input: {
  user: typeof owner;
  startDate: string;
  endDate: string;
  suffix: string;
}) {
  const cycleId = `19000000-0000-4000-8100-${input.suffix.padStart(12, "0")}`;
  const phaseId = `19000000-0000-4000-8200-${input.suffix.padStart(12, "0")}`;
  const dayLogId = `19000000-0000-4000-8300-${input.suffix.padStart(12, "0")}`;

  await database.user.create({
    data: {
      id: input.user.id,
      authentikSubject: input.user.subject,
      email: `${input.user.subject}@reset90.test`,
    },
  });
  await database.resetCycle.create({
    data: {
      id: cycleId,
      userId: input.user.id,
      name: `Phase 19 ${input.suffix}`,
      startDate: new Date(`${input.startDate}T00:00:00.000Z`),
      endDate: new Date(`${input.endDate}T00:00:00.000Z`),
      status: "ACTIVE",
    },
  });
  await database.resetPhase.create({
    data: {
      id: phaseId,
      cycleId,
      name: "Clear the Fog",
      dayStart: 1,
      dayEnd: 30,
    },
  });
  await database.dayLog.create({
    data: {
      id: dayLogId,
      cycleId,
      phaseId,
      date: new Date(`${input.startDate}T00:00:00.000Z`),
      dayNumber: 1,
    },
  });

  return { cycleId, dayLogId };
}

function planPayload(idempotencyKey: string): PlanPayload {
  const payload = structuredClone(dailyPlanExample);
  payload.idempotency_key = idempotencyKey;
  payload.source = SOURCE;
  return payload;
}

function reflectionPayload(idempotencyKey: string): ReflectionPayload {
  const payload = structuredClone(dailyReflectionExample);
  payload.idempotency_key = idempotencyKey;
  payload.source = SOURCE;
  return payload;
}

function requestFor(payload: PlanPayload | ReflectionPayload) {
  return new Request("http://localhost/api/gpt/import", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "Idempotency-Key": payload.idempotency_key,
    },
    body: JSON.stringify(payload),
  });
}

function dependencies(now = FIXED_NOW): GptImportHandlerDependencies {
  return {
    env: {
      GPT_INGEST_TOKEN: TOKEN,
      GPT_INGEST_OWNER_SUBJECT: owner.subject,
    },
    getDatabase: () => database,
    rateLimiter: createGptImportRateLimiter(() => now.getTime()),
    normalizeDailyPlan: (client, importedPayloadId) =>
      normalizeDailyPlanImport(client, importedPayloadId, now),
    normalizeDailyReflection: (client, importedPayloadId, subject) =>
      normalizeDailyReflectionImport(client, importedPayloadId, subject, now),
  };
}

beforeEach(async () => {
  await cleanFixtures();
});

afterAll(async () => {
  await cleanFixtures();
  await database.$disconnect();
});

describe("GPT import PostgreSQL integration", () => {
  it("stores raw first, stays idempotent, and replaces only normalized plan data", async () => {
    const { dayLogId } = await seedCycle({
      user: owner,
      startDate: "2026-07-01",
      endDate: "2026-09-28",
      suffix: "1",
    });
    const firstPayload = planPayload("phase19-plan-first");

    const created = await handleGptImport(
      requestFor(firstPayload),
      dependencies(),
    );
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      ok: true,
      status: "created",
      normalized_records: ["daily_plan", "tasks"],
    });

    const firstRaw = await database.importedPayload.findUniqueOrThrow({
      where: {
        source_idempotencyKey: {
          source: SOURCE,
          idempotencyKey: firstPayload.idempotency_key,
        },
      },
      include: { dailyPlan: { include: { tasks: true } } },
    });
    expect(firstRaw.rawJson).toEqual(firstPayload);
    expect(firstRaw.processingStatus).toBe("PROCESSED");
    expect(firstRaw.dailyPlan?.importedPayloadId).toBe(firstRaw.id);
    expect(firstRaw.dailyPlan?.tasks).toHaveLength(10);
    const firstPlanId = firstRaw.dailyPlan?.id;

    const duplicate = await handleGptImport(
      requestFor(firstPayload),
      dependencies(),
    );
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({
      ok: true,
      status: "duplicate",
      imported_payload_id: firstRaw.id,
    });
    expect(
      await database.importedPayload.count({
        where: { idempotencyKey: { startsWith: "phase19-" } },
      }),
    ).toBe(1);
    expect(await database.dailyPlan.count({ where: { dayLogId } })).toBe(1);

    const replacementPayload = planPayload("phase19-plan-replacement");
    replacementPayload.payload.mission = "Use deterministic replacement.";
    replacementPayload.payload.standard_plan = [];
    const replaced = await handleGptImport(
      requestFor(replacementPayload),
      dependencies(),
    );
    expect(replaced.status).toBe(201);

    const plan = await database.dailyPlan.findUniqueOrThrow({
      where: { dayLogId },
      include: { tasks: { orderBy: { sortOrder: "asc" } } },
    });
    expect(plan).toMatchObject({
      id: firstPlanId,
      mission: "Use deterministic replacement.",
    });
    expect(plan.tasks).toHaveLength(7);
    expect(plan.tasks.map((task) => task.sortOrder)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(
      await database.importedPayload.count({
        where: { idempotencyKey: { startsWith: "phase19-" } },
      }),
    ).toBe(2);
    expect(
      await database.importedPayload.findUnique({ where: { id: firstRaw.id } }),
    ).not.toBeNull();
    expect(
      await database.dayLog.findUniqueOrThrow({
        where: { id: dayLogId },
        select: { status: true },
      }),
    ).toEqual({ status: "UNSET" });
  });

  it("rolls back partial normalization and bounds a database constraint failure", async () => {
    const { dayLogId } = await seedCycle({
      user: owner,
      startDate: "2026-07-01",
      endDate: "2026-09-28",
      suffix: "2",
    });
    const payload = planPayload("phase19-plan-constraint");
    payload.payload.non_negotiables[0].title = "PHASE19_REJECTED_TASK";
    await database.$executeRawUnsafe(
      `ALTER TABLE tasks ADD CONSTRAINT ${CONSTRAINT_NAME} CHECK (title <> 'PHASE19_REJECTED_TASK')`,
    );

    let response: Response;
    try {
      response = await handleGptImport(requestFor(payload), dependencies());
    } finally {
      await dropSyntheticConstraint();
    }

    expect(response.status).toBe(503);
    const body = JSON.stringify(await response.json());
    expect(body).toBe('{"ok":false,"error":"service_unavailable"}');
    expect(body).not.toContain(TOKEN);
    expect(body).not.toContain("PHASE19_REJECTED_TASK");
    expect(body).not.toContain("DATABASE_URL");

    const raw = await database.importedPayload.findUniqueOrThrow({
      where: {
        source_idempotencyKey: {
          source: SOURCE,
          idempotencyKey: payload.idempotency_key,
        },
      },
    });
    expect(raw.processingStatus).toBe("PENDING");
    expect(await database.dailyPlan.count({ where: { dayLogId } })).toBe(0);
    expect(await database.task.count()).toBe(0);
    expect(
      await database.dayLog.findUniqueOrThrow({
        where: { id: dayLogId },
        select: { mission: true, supportiveMessage: true, status: true },
      }),
    ).toEqual({ mission: null, supportiveMessage: null, status: "UNSET" });
  });

  it("rejects a trusted-owner cycle mismatch without mutating another user", async () => {
    await seedCycle({
      user: owner,
      startDate: "2026-08-01",
      endDate: "2026-10-29",
      suffix: "3",
    });
    const foreign = await seedCycle({
      user: foreignOwner,
      startDate: "2026-07-01",
      endDate: "2026-09-28",
      suffix: "4",
    });
    const payload = reflectionPayload("phase19-reflection-owner-mismatch");
    const response = await handleGptImport(
      requestFor(payload),
      dependencies(new Date("2026-08-01T12:00:00.000Z")),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "normalization_error",
      code: "target_day_outside_active_cycle",
    });
    expect(
      await database.dailyReflection.count({
        where: { dayLogId: foreign.dayLogId },
      }),
    ).toBe(0);
    expect(
      await database.importedPayload.findUniqueOrThrow({
        where: {
          source_idempotencyKey: {
            source: SOURCE,
            idempotencyKey: payload.idempotency_key,
          },
        },
        select: { processingStatus: true },
      }),
    ).toEqual({ processingStatus: "FAILED" });
  });

  it("returns normalized empty states without parsing raw-only browser fallbacks", async () => {
    await seedCycle({
      user: owner,
      startDate: "2026-07-01",
      endDate: "2026-09-28",
      suffix: "5",
    });
    await database.importedPayload.createMany({
      data: [
        {
          kind: "DAILY_REFLECTION",
          schemaVersion: "1.0",
          idempotencyKey: "phase19-raw-reflection-only",
          source: SOURCE,
          rawJson: {
            ...reflectionPayload("phase19-raw-reflection-only"),
            raw_only: "PHASE19_PRIVATE_RAW_REFLECTION",
          },
          validationStatus: "VALID",
          processingStatus: "PENDING",
        },
        {
          kind: "CONTEXT_ITEM",
          schemaVersion: "1.0",
          idempotencyKey: "phase19-legacy-context-only",
          source: SOURCE,
          rawJson: {
            kind: "context_item",
            schema_version: "1.0",
            idempotency_key: "phase19-legacy-context-only",
            source: SOURCE,
            payload: { private: "PHASE19_PRIVATE_RAW_CONTEXT" },
          },
          validationStatus: "VALID",
          processingStatus: "PROCESSED",
        },
      ],
    });

    const detail = await getDayDetail(database, owner.id, 1, FIXED_NOW);
    expect(detail).toMatchObject({
      status: "ready",
      day: { status: "UNSET" },
      plan: null,
      checkins: [],
      recoveryEvent: null,
      reflection: null,
    });
    expect(JSON.stringify(detail)).not.toContain("PHASE19_PRIVATE_RAW");

    const context = await getContextLibrary(database, owner.id, {});
    expect(context).toMatchObject({
      status: "valid",
      library: {
        status: "ready",
        hasStoredItems: false,
        items: [],
        nextCursor: null,
      },
    });
    expect(JSON.stringify(context)).not.toContain("PHASE19_PRIVATE_RAW");
  });
});
