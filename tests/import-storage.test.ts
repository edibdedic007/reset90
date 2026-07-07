import { describe, expect, it, vi } from "vitest";

import dailyPlan from "../examples/daily_plan_payload.json";
import dailyReflection from "../examples/daily_reflection_payload.json";
import type { ImportedPayload, Prisma } from "../src/generated/prisma/client";
import {
  type RawImportDatabase,
  storeRawImport,
} from "../src/server/imports/store";

function createTestDatabase() {
  const rows: ImportedPayload[] = [];
  const domainMutation = vi.fn();

  const findUnique = vi.fn(
    ({
      where,
    }: {
      where: {
        source_idempotencyKey: {
          source: string;
          idempotencyKey: string;
        };
      };
    }) =>
      rows.find(
        (row) =>
          row.source === where.source_idempotencyKey.source &&
          row.idempotencyKey === where.source_idempotencyKey.idempotencyKey,
      ) ?? null,
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
  } as unknown as RawImportDatabase;

  return { database, rows, create, domainMutation };
}

describe("raw import storage", () => {
  it("stores a valid envelope as raw JSON pending normalization", async () => {
    const { database, rows } = createTestDatabase();

    await expect(storeRawImport(database, dailyPlan)).resolves.toEqual({
      status: "created",
      importedPayloadId: "import-1",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "DAILY_PLAN",
      validationStatus: "VALID",
      processingStatus: "PENDING",
      rawJson: dailyPlan,
      errorMetadata: null,
    });
  });

  it("stores an identifiable invalid envelope without domain mutation", async () => {
    const invalid = structuredClone(dailyReflection);
    invalid.payload.scores.fog = 11;
    const { database, rows, domainMutation } = createTestDatabase();

    const result = await storeRawImport(database, invalid);

    expect(result).toMatchObject({
      status: "invalid",
      importedPayloadId: "import-1",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "DAILY_REFLECTION",
      validationStatus: "INVALID",
      processingStatus: "REJECTED",
      rawJson: invalid,
    });
    expect(JSON.stringify(rows[0]?.errorMetadata)).not.toContain(
      invalid.payload.summary,
    );
    expect(domainMutation).not.toHaveBeenCalled();
  });

  it("returns an existing import for a duplicate source and key", async () => {
    const { database, rows, create } = createTestDatabase();

    await storeRawImport(database, dailyPlan);
    const duplicate = await storeRawImport(database, dailyPlan);

    expect(duplicate).toEqual({
      status: "duplicate",
      importedPayloadId: "import-1",
      validationStatus: "VALID",
      processingStatus: "PENDING",
    });
    expect(rows).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("returns the winner when concurrent inserts hit the unique constraint", async () => {
    const existing = {
      id: "import-winner",
      validationStatus: "VALID" as const,
      processingStatus: "PENDING" as const,
    };
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    const create = vi.fn().mockRejectedValue({ code: "P2002" });
    const database = {
      importedPayload: { findUnique, create },
    } as unknown as RawImportDatabase;

    await expect(storeRawImport(database, dailyPlan)).resolves.toEqual({
      status: "duplicate",
      importedPayloadId: "import-winner",
      validationStatus: "VALID",
      processingStatus: "PENDING",
    });
  });

  it("allows the same idempotency key from another source", async () => {
    const manualImport = {
      ...dailyPlan,
      source: "manual" as const,
    };
    const { database, rows } = createTestDatabase();

    await storeRawImport(database, dailyPlan);
    await storeRawImport(database, manualImport);

    expect(rows).toHaveLength(2);
  });
});
