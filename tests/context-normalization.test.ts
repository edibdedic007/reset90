import { describe, expect, it, vi } from "vitest";

import type { ProcessingStatus } from "../src/generated/prisma/client";
import {
  type ContextItemNormalizationDatabase,
  normalizeContextItemImport,
} from "../src/server/imports/normalize-context-item";

const OWNER_SUBJECT = "owner-subject";
const RAW_SENTINEL = "RAW_ONLY_CONTEXT_SENTINEL_15";

function contextEnvelope(idempotencyKey = "context-import-one") {
  return {
    kind: "context_item",
    schema_version: "2.0",
    idempotency_key: idempotencyKey,
    source: "custom_gpt",
    external_conversation_id: RAW_SENTINEL,
    payload: {
      kind: "DECISION",
      domain: "WORK",
      title: "Keep work bounded",
      summary: "Small explicit scopes preserve momentum.",
      tags: ["Work", "work", " bounded "],
      source_ref: "visible-ref",
    },
  };
}

function legacyContextEnvelope(idempotencyKey = "legacy-context-import-one") {
  return {
    kind: "context_item",
    schema_version: "1.0",
    idempotency_key: idempotencyKey,
    source: "custom_gpt",
    payload: {
      kind: "decision_log",
      title: "Legacy bounded work",
      summary: RAW_SENTINEL,
      importance: 4,
      tags: ["legacy"],
      is_sensitive: true,
    },
  };
}

type StoredImport = {
  id: string;
  kind: "CONTEXT_ITEM";
  schemaVersion: string;
  rawJson: unknown;
  validationStatus: "VALID" | "INVALID";
  processingStatus: ProcessingStatus;
  processedAt: Date | null;
  errorMetadata: { code: string } | null;
};

type StoredItem = {
  id: string;
  cycleId: string;
  importedPayloadId: string;
  kind: string;
  domain: string;
  title: string;
  summary: string;
  sourceType: string;
  sourceRef: string | null;
  pinnedAt: null;
};

type StoredTag = {
  contextItemId: string;
  name: string;
  normalizedName: string;
};

function createDatabase(
  options: {
    rawJson?: unknown;
    ownerFound?: boolean;
    cycleSelections?: Array<Array<{ id: string; name: string }>>;
    lockedCycleExists?: boolean;
    failCreate?: boolean;
  } = {},
) {
  const rawJson = options.rawJson ?? contextEnvelope();
  const schemaVersion =
    typeof rawJson === "object" && rawJson !== null
      ? String(Reflect.get(rawJson, "schema_version"))
      : "2.0";
  let imports: StoredImport[] = [
    {
      id: "import-1",
      kind: "CONTEXT_ITEM",
      schemaVersion,
      rawJson,
      validationStatus: "VALID",
      processingStatus: "PENDING",
      processedAt: null,
      errorMetadata: null,
    },
  ];
  let items: StoredItem[] = [];
  let tags: StoredTag[] = [];
  let sequence = 0;
  let transactionTail = Promise.resolve();
  const operations: string[] = [];
  const create = vi.fn();
  const cycleSelections = options.cycleSelections ?? [
    [{ id: "cycle-1", name: "My Reset" }],
  ];
  let cycleReadIndex = 0;
  let latestCycles = cycleSelections[0] ?? [];

  const database = {
    $transaction: vi.fn(async (callback: (transaction: unknown) => unknown) => {
      const previous = transactionTail;
      let release = () => {};
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      transactionTail = previous.then(() => current);
      await previous;

      const draftImports = structuredClone(imports);
      const draftItems = structuredClone(items);
      const draftTags = structuredClone(tags);
      const transaction = {
        $queryRaw: async (query: { strings: readonly string[] }) => {
          const sql = query.strings.join("?");
          if (sql.includes("imported_payloads")) {
            operations.push("lock-import");
            return [{ id: "import-1" }];
          }
          operations.push("lock-cycle");
          return options.lockedCycleExists === false ? [] : [{ id: "cycle-1" }];
        },
        importedPayload: {
          findUnique: async ({ where }: { where: { id: string } }) => {
            operations.push("read-import");
            return draftImports.find((row) => row.id === where.id) ?? null;
          },
          update: async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            const row = draftImports.find((item) => item.id === where.id);
            if (!row) throw new Error("missing import");
            if (data.processingStatus)
              row.processingStatus = data.processingStatus as ProcessingStatus;
            if (data.processedAt) row.processedAt = data.processedAt as Date;
            if ("errorMetadata" in data) {
              row.errorMetadata =
                data.errorMetadata &&
                typeof data.errorMetadata === "object" &&
                "code" in data.errorMetadata
                  ? (data.errorMetadata as { code: string })
                  : null;
            }
            operations.push(
              `mark-${String(data.processingStatus).toLowerCase()}`,
            );
            return row;
          },
        },
        user: {
          findUnique: async () =>
            options.ownerFound === false ? null : { id: "owner-1" },
        },
        resetCycle: {
          findMany: async () => {
            latestCycles =
              cycleSelections[
                Math.min(cycleReadIndex, cycleSelections.length - 1)
              ] ?? [];
            cycleReadIndex += 1;
            operations.push("read-cycle");
            return latestCycles;
          },
          count: async () => {
            const nextCycles =
              cycleSelections[
                Math.min(cycleReadIndex, cycleSelections.length - 1)
              ];
            return (nextCycles ?? latestCycles).length;
          },
        },
        contextItem: {
          findUnique: async ({
            where,
          }: {
            where: { importedPayloadId: string };
          }) =>
            draftItems.find(
              (item) => item.importedPayloadId === where.importedPayloadId,
            ) ?? null,
          create: async ({ data }: { data: Record<string, unknown> }) => {
            operations.push("create-context");
            create(data);
            sequence += 1;
            const item: StoredItem = {
              id: `context-${sequence}`,
              cycleId: data.cycleId as string,
              importedPayloadId: data.importedPayloadId as string,
              kind: data.kind as string,
              domain: data.domain as string,
              title: data.title as string,
              summary: data.summary as string,
              sourceType: data.sourceType as string,
              sourceRef: (data.sourceRef as string | undefined) ?? null,
              pinnedAt: null,
            };
            draftItems.push(item);
            const nested = data.tags as {
              create: Array<{ name: string; normalizedName: string }>;
            };
            draftTags.push(
              ...nested.create.map((tag) => ({
                contextItemId: item.id,
                ...tag,
              })),
            );
            if (options.failCreate) throw new Error("tag insert failed");
            return { id: item.id };
          },
        },
      };

      try {
        const result = await callback(transaction);
        imports = draftImports;
        items = draftItems;
        tags = draftTags;
        return result;
      } finally {
        release();
      }
    }),
  } as unknown as ContextItemNormalizationDatabase;

  return {
    database,
    create,
    operations,
    imports: () => structuredClone(imports),
    items: () => structuredClone(items),
    tags: () => structuredClone(tags),
    addImport(id: string, idempotencyKey: string) {
      const raw = contextEnvelope(idempotencyKey);
      imports.push({
        id,
        kind: "CONTEXT_ITEM",
        schemaVersion: "2.0",
        rawJson: raw,
        validationStatus: "VALID",
        processingStatus: "PENDING",
        processedAt: null,
        errorMetadata: null,
      });
    },
  };
}

describe("context import normalization", () => {
  it("locks raw import and cycle before atomically creating safe normalized context", async () => {
    const test = createDatabase();

    await expect(
      normalizeContextItemImport(test.database, "import-1", OWNER_SUBJECT),
    ).resolves.toEqual({ status: "processed", contextItemId: "context-1" });

    expect(test.items()).toEqual([
      {
        id: "context-1",
        cycleId: "cycle-1",
        importedPayloadId: "import-1",
        kind: "DECISION",
        domain: "WORK",
        title: "Keep work bounded",
        summary: "Small explicit scopes preserve momentum.",
        sourceType: "IMPORT",
        sourceRef: "visible-ref",
        pinnedAt: null,
      },
    ]);
    expect(test.tags()).toEqual([
      { contextItemId: "context-1", name: "Work", normalizedName: "work" },
      {
        contextItemId: "context-1",
        name: "bounded",
        normalizedName: "bounded",
      },
    ]);
    expect(test.imports()[0]).toMatchObject({
      processingStatus: "PROCESSED",
      errorMetadata: null,
    });
    expect(test.operations).toEqual([
      "lock-import",
      "read-import",
      "read-cycle",
      "lock-cycle",
      "read-cycle",
      "create-context",
      "mark-processed",
    ]);
    expect(JSON.stringify(test.items())).not.toContain(RAW_SENTINEL);
  });

  it("serializes concurrent exact retries into one normalized item", async () => {
    const test = createDatabase();
    const results = await Promise.all([
      normalizeContextItemImport(test.database, "import-1", OWNER_SUBJECT),
      normalizeContextItemImport(test.database, "import-1", OWNER_SUBJECT),
    ]);

    expect(results).toEqual([
      { status: "processed", contextItemId: "context-1" },
      { status: "already_processed", contextItemId: "context-1" },
    ]);
    expect(test.items()).toHaveLength(1);
    expect(test.tags()).toHaveLength(2);
    expect(test.create).toHaveBeenCalledTimes(1);
  });

  it("allows a different idempotency identity to create a second similar item", async () => {
    const test = createDatabase();
    test.addImport("import-2", "context-import-two");

    await normalizeContextItemImport(test.database, "import-1", OWNER_SUBJECT);
    await normalizeContextItemImport(test.database, "import-2", OWNER_SUBJECT);

    expect(test.items().map((item) => item.importedPayloadId)).toEqual([
      "import-1",
      "import-2",
    ]);
  });

  it.each([
    ["missing owner", { ownerFound: false }, "import_owner_not_found"],
    ["no active cycle", { cycleSelections: [[]] }, "active_cycle_not_found"],
    [
      "ambiguous active cycle",
      {
        cycleSelections: [
          [
            { id: "cycle-1", name: "First" },
            { id: "cycle-2", name: "Second" },
          ],
        ],
      },
      "active_cycle_ambiguous",
    ],
  ])("fails safely for %s", async (_name, options, code) => {
    const test = createDatabase(options);
    const result = await normalizeContextItemImport(
      test.database,
      "import-1",
      OWNER_SUBJECT,
    );

    expect(result).toEqual({ status: "failed", code });
    expect(test.items()).toEqual([]);
    expect(test.tags()).toEqual([]);
    expect(test.imports()[0]).toMatchObject({
      processingStatus: "FAILED",
      errorMetadata: { code },
    });
    expect(JSON.stringify(result)).not.toContain(RAW_SENTINEL);
  });

  it.each([
    [
      "archived after selection",
      [[{ id: "cycle-1", name: "Old" }], []],
      "active_cycle_not_found",
    ],
    [
      "replaced after selection",
      [
        [{ id: "cycle-1", name: "Old" }],
        [{ id: "cycle-2", name: "Replacement" }],
      ],
      "active_cycle_ambiguous",
    ],
    [
      "ambiguous after selection",
      [
        [{ id: "cycle-1", name: "Old" }],
        [
          { id: "cycle-1", name: "Old" },
          { id: "cycle-2", name: "Second" },
        ],
      ],
      "active_cycle_ambiguous",
    ],
  ])(
    "does not create context when cycle becomes %s",
    async (_name, cycles, code) => {
      const test = createDatabase({ cycleSelections: cycles });

      await expect(
        normalizeContextItemImport(test.database, "import-1", OWNER_SUBJECT),
      ).resolves.toEqual({ status: "failed", code });
      expect(test.items()).toEqual([]);
      expect(test.tags()).toEqual([]);
      expect(test.create).not.toHaveBeenCalled();
    },
  );

  it("keeps valid legacy 1.0 content raw-only in a terminal state", async () => {
    const test = createDatabase({ rawJson: legacyContextEnvelope() });

    await expect(
      normalizeContextItemImport(test.database, "import-1", OWNER_SUBJECT),
    ).resolves.toEqual({ status: "accepted_raw_only" });
    await expect(
      normalizeContextItemImport(test.database, "import-1", OWNER_SUBJECT),
    ).resolves.toEqual({
      status: "already_processed",
      contextItemId: null,
    });

    expect(test.items()).toEqual([]);
    expect(test.tags()).toEqual([]);
    expect(test.imports()[0]).toMatchObject({
      validationStatus: "VALID",
      processingStatus: "PROCESSED",
      errorMetadata: null,
    });
    expect(JSON.stringify(test.imports()[0]?.errorMetadata)).not.toContain(
      "invalid_stored_payload",
    );
  });

  it("rolls back item, tags, and success state when normalized creation fails", async () => {
    const test = createDatabase({ failCreate: true });

    await expect(
      normalizeContextItemImport(test.database, "import-1", OWNER_SUBJECT),
    ).rejects.toThrow("tag insert failed");
    expect(test.items()).toEqual([]);
    expect(test.tags()).toEqual([]);
    expect(test.imports()[0]).toMatchObject({
      processingStatus: "PENDING",
      processedAt: null,
    });
  });
});
