import { describe, expect, it, vi } from "vitest";

import weeklyReviewExample from "../examples/weekly_review_payload.json";
import type { WeeklyReviewNormalizationDatabase } from "../src/server/imports/normalize-weekly-review";
import { normalizeWeeklyReviewImport } from "../src/server/imports/normalize-weekly-review";
import { deriveCanonicalWeekRange } from "../src/server/reviews";

type ProcessingStatus = "PENDING" | "PROCESSED" | "REJECTED" | "FAILED";

type StoredImport = {
  id: string;
  kind: "DAILY_PLAN" | "WEEKLY_REVIEW";
  rawJson: unknown;
  validationStatus: "VALID" | "INVALID";
  processingStatus: ProcessingStatus;
  processedAt: Date | null;
  errorMetadata: unknown;
  createdAt: Date;
};

type StoredReview = {
  id: string;
  cycleId: string;
  importedPayloadId: string;
  weekNumber: number;
  dateFrom: Date;
  dateTo: Date;
  summary: string;
  winsJson: unknown;
  blockersJson: unknown;
  patternsJson: unknown;
  recommendedChangesJson: unknown;
  nextWeekCommitmentsJson: unknown;
  metricsJson: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const OWNER_SUBJECT = "owner-subject";
const NOW = new Date("2026-07-08T12:00:00.000Z");
const CYCLE = {
  id: "cycle-1",
  startDate: new Date("2026-07-01T00:00:00.000Z"),
  endDate: new Date("2026-09-28T00:00:00.000Z"),
};

function reviewPayload(overrides: Record<string, unknown> = {}) {
  const input = structuredClone(weeklyReviewExample) as unknown as {
    payload: Record<string, unknown>;
  };
  Object.assign(input.payload, overrides);
  return input;
}

function createTestDatabase(
  options: {
    rawInput?: unknown;
    ownerFound?: boolean;
    cycles?: (typeof CYCLE)[];
    upsertError?: Error;
  } = {},
) {
  let imports: StoredImport[] = [
    {
      id: "import-1",
      kind: "WEEKLY_REVIEW",
      rawJson: structuredClone(options.rawInput ?? weeklyReviewExample),
      validationStatus: "VALID",
      processingStatus: "PENDING",
      processedAt: null,
      errorMetadata: null,
      createdAt: new Date("2026-07-08T10:00:00.000Z"),
    },
  ];
  let reviews: StoredReview[] = [];
  let transactionTail = Promise.resolve();
  let failProcessedUpdate = false;
  let reviewSequence = 0;
  let activeCycles = options.cycles ?? [CYCLE];

  const upsert = vi.fn();
  const queryRaw = vi.fn();
  const userFindUnique = vi.fn(() =>
    options.ownerFound === false ? null : { id: "owner-1" },
  );
  const resetCycleFindMany = vi.fn(() => activeCycles);
  const protectedState = structuredClone({
    dailyPlans: ["plan-1"],
    tasks: ["task-1"],
    checkins: ["checkin-1"],
    reflections: ["reflection-1"],
    recoveryCredits: 4,
    recoveryEvents: ["recovery-1"],
    dayStatuses: ["YELLOW"],
  });

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
      const draftReviews = structuredClone(reviews);
      const transaction = {
        $queryRaw: async (...args: unknown[]) => {
          queryRaw(...args);
          return [];
        },
        importedPayload: {
          findUnique: async ({ where }: { where: { id: string } }) =>
            draftImports.find((row) => row.id === where.id) ?? null,
          update: async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Record<string, unknown>;
          }) => {
            if (failProcessedUpdate && data.processingStatus === "PROCESSED") {
              throw new Error("final processing update failed");
            }
            const row = draftImports.find((item) => item.id === where.id);
            if (!row) throw new Error("missing import");
            if (data.processingStatus)
              row.processingStatus = data.processingStatus as ProcessingStatus;
            if (data.processedAt) row.processedAt = data.processedAt as Date;
            if ("errorMetadata" in data) {
              row.errorMetadata =
                typeof data.errorMetadata === "object" &&
                data.errorMetadata !== null &&
                "code" in data.errorMetadata
                  ? data.errorMetadata
                  : null;
            }
            return row;
          },
        },
        user: { findUnique: userFindUnique },
        resetCycle: { findMany: resetCycleFindMany },
        weeklyReview: {
          findUnique: async ({
            where,
          }: {
            where: {
              importedPayloadId?: string;
              cycleId_weekNumber?: { cycleId: string; weekNumber: number };
            };
          }) => {
            const review = where.importedPayloadId
              ? draftReviews.find(
                  (row) => row.importedPayloadId === where.importedPayloadId,
                )
              : draftReviews.find(
                  (row) =>
                    row.cycleId === where.cycleId_weekNumber?.cycleId &&
                    row.weekNumber === where.cycleId_weekNumber.weekNumber,
                );
            if (!review) return null;
            const source = draftImports.find(
              (row) => row.id === review.importedPayloadId,
            );
            return where.importedPayloadId
              ? { id: review.id }
              : {
                  id: review.id,
                  importedPayload: source && {
                    id: source.id,
                    createdAt: source.createdAt,
                  },
                };
          },
          upsert: async ({
            where,
            create,
            update,
          }: {
            where: {
              cycleId_weekNumber: { cycleId: string; weekNumber: number };
            };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            upsert({ where, create, update });
            if (options.upsertError) throw options.upsertError;
            const index = draftReviews.findIndex(
              (row) =>
                row.cycleId === where.cycleId_weekNumber.cycleId &&
                row.weekNumber === where.cycleId_weekNumber.weekNumber,
            );
            const sourceId = (index < 0 ? create : update)
              .importedPayloadId as string;
            const source = draftImports.find((row) => row.id === sourceId);
            if (!source) throw new Error("missing source import");
            if (index < 0) {
              reviewSequence += 1;
              const createdAt = new Date("2026-07-08T10:30:00.000Z");
              draftReviews.push({
                id: `review-${reviewSequence}`,
                ...(create as Omit<
                  StoredReview,
                  "id" | "createdAt" | "updatedAt"
                >),
                createdAt,
                updatedAt: createdAt,
              });
            } else {
              draftReviews[index] = {
                ...draftReviews[index],
                ...update,
                updatedAt: new Date(source.createdAt.getTime() + 1),
              } as StoredReview;
            }
            const stored = draftReviews.find(
              (row) =>
                row.cycleId === where.cycleId_weekNumber.cycleId &&
                row.weekNumber === where.cycleId_weekNumber.weekNumber,
            );
            return { id: stored?.id };
          },
        },
      };

      try {
        const result = await callback(transaction);
        imports = draftImports;
        reviews = draftReviews;
        return result;
      } finally {
        release();
      }
    }),
  } as unknown as WeeklyReviewNormalizationDatabase;

  return {
    database,
    protectedState,
    queryRaw,
    resetCycleFindMany,
    upsert,
    addImport(
      row: Partial<StoredImport> & Pick<StoredImport, "id" | "rawJson">,
    ) {
      imports.push({
        kind: "WEEKLY_REVIEW",
        validationStatus: "VALID",
        processingStatus: "PENDING",
        processedAt: null,
        errorMetadata: null,
        createdAt: new Date("2026-07-08T11:00:00.000Z"),
        ...row,
      });
    },
    getImports: () => structuredClone(imports),
    getReviews: () => structuredClone(reviews),
    setFailProcessedUpdate(value: boolean) {
      failProcessedUpdate = value;
    },
    setActiveCycles(cycles: (typeof CYCLE)[]) {
      activeCycles = cycles;
    },
  };
}

describe("canonical weekly ranges", () => {
  it("derives weeks 1, 2, and six-day week 13 from cycle start", () => {
    expect(deriveCanonicalWeekRange(CYCLE.startDate, 1)).toEqual({
      dateFrom: new Date("2026-07-01T00:00:00.000Z"),
      dateTo: new Date("2026-07-07T00:00:00.000Z"),
    });
    expect(deriveCanonicalWeekRange(CYCLE.startDate, 2)).toEqual({
      dateFrom: new Date("2026-07-08T00:00:00.000Z"),
      dateTo: new Date("2026-07-14T00:00:00.000Z"),
    });
    expect(deriveCanonicalWeekRange(CYCLE.startDate, 13)).toEqual({
      dateFrom: new Date("2026-09-23T00:00:00.000Z"),
      dateTo: new Date("2026-09-28T00:00:00.000Z"),
    });
  });
});

describe("weekly review normalization", () => {
  it("creates approved normalized content for trusted owner and active cycle", async () => {
    const sentinel = "RAW_ONLY_SENTINEL_WEEKLY_91";
    const raw = reviewPayload();
    (raw.payload.context_snapshot as Record<string, unknown>).summary =
      sentinel;
    const test = createTestDatabase({ rawInput: raw });

    await expect(
      normalizeWeeklyReviewImport(
        test.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).resolves.toEqual({ status: "processed", weeklyReviewId: "review-1" });

    expect(test.getReviews()).toEqual([
      expect.objectContaining({
        cycleId: "cycle-1",
        importedPayloadId: "import-1",
        weekNumber: 1,
        dateFrom: new Date("2026-07-01T00:00:00.000Z"),
        dateTo: new Date("2026-07-07T00:00:00.000Z"),
        summary: weeklyReviewExample.payload.summary,
        winsJson: weeklyReviewExample.payload.wins,
        metricsJson: weeklyReviewExample.payload.metrics,
      }),
    ]);
    expect(JSON.stringify(test.getReviews())).not.toContain(sentinel);
    expect(test.getImports()[0]).toMatchObject({
      processingStatus: "PROCESSED",
      errorMetadata: null,
    });
    expect(test.resetCycleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "owner-1", status: "ACTIVE" },
        take: 2,
      }),
    );
    expect(test.protectedState).toEqual({
      dailyPlans: ["plan-1"],
      tasks: ["task-1"],
      checkins: ["checkin-1"],
      reflections: ["reflection-1"],
      recoveryCredits: 4,
      recoveryEvents: ["recovery-1"],
      dayStatuses: ["YELLOW"],
    });
  });

  it("accepts week 13 only after cycle day 90 completes", async () => {
    const test = createTestDatabase({
      rawInput: reviewPayload({
        week_number: 13,
        date_from: "2026-09-23",
        date_to: "2026-09-28",
      }),
    });
    await expect(
      normalizeWeeklyReviewImport(
        test.database,
        "import-1",
        OWNER_SUBJECT,
        new Date("2026-09-29T00:00:00.000Z"),
      ),
    ).resolves.toMatchObject({ status: "processed" });
    expect(test.getReviews()[0]).toMatchObject({
      weekNumber: 13,
      dateTo: CYCLE.endDate,
    });
  });

  it("makes an exact successful retry a terminal no-op", async () => {
    const test = createTestDatabase();
    await normalizeWeeklyReviewImport(
      test.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    const before = test.getReviews();

    await expect(
      normalizeWeeklyReviewImport(
        test.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).resolves.toEqual({
      status: "already_processed",
      weeklyReviewId: "review-1",
    });
    expect(test.getReviews()).toEqual(before);
    expect(test.upsert).toHaveBeenCalledTimes(1);
  });

  it("replaces same-week content with newer stored import and preserves history", async () => {
    const test = createTestDatabase();
    await normalizeWeeklyReviewImport(
      test.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    const createdAt = test.getReviews()[0]?.createdAt;
    test.addImport({
      id: "import-2",
      rawJson: reviewPayload({ summary: "Newer weekly summary." }),
      createdAt: new Date("2026-07-08T11:00:00.000Z"),
    });

    await normalizeWeeklyReviewImport(
      test.database,
      "import-2",
      OWNER_SUBJECT,
      NOW,
    );
    expect(test.getReviews()).toEqual([
      expect.objectContaining({
        importedPayloadId: "import-2",
        summary: "Newer weekly summary.",
        createdAt,
      }),
    ]);
    expect(test.getReviews()[0]?.updatedAt.getTime()).toBeGreaterThan(
      createdAt?.getTime() ?? 0,
    );
    expect(test.getImports()).toHaveLength(2);
    expect(test.getImports().map((row) => row.processingStatus)).toEqual([
      "PROCESSED",
      "PROCESSED",
    ]);
  });

  it("keeps deterministic newer winner when older import processes later", async () => {
    const test = createTestDatabase();
    test.addImport({
      id: "import-2",
      rawJson: reviewPayload({ summary: "Newer wins." }),
      createdAt: new Date("2026-07-08T11:00:00.000Z"),
    });
    await normalizeWeeklyReviewImport(
      test.database,
      "import-2",
      OWNER_SUBJECT,
      NOW,
    );
    await normalizeWeeklyReviewImport(
      test.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    expect(test.getReviews()[0]).toMatchObject({
      importedPayloadId: "import-2",
      summary: "Newer wins.",
    });
  });

  it("stores different weeks separately in one cycle", async () => {
    const test = createTestDatabase();
    await normalizeWeeklyReviewImport(
      test.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    test.addImport({
      id: "import-2",
      rawJson: reviewPayload({
        week_number: 2,
        date_from: "2026-07-08",
        date_to: "2026-07-14",
      }),
    });
    await normalizeWeeklyReviewImport(
      test.database,
      "import-2",
      OWNER_SUBJECT,
      new Date("2026-07-15T00:00:00.000Z"),
    );
    expect(
      test
        .getReviews()
        .map((row) => row.weekNumber)
        .sort(),
    ).toEqual([1, 2]);
  });

  it("does not collide identical week numbers across owned cycles", async () => {
    const test = createTestDatabase();
    await normalizeWeeklyReviewImport(
      test.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    const nextCycle = {
      id: "cycle-2",
      startDate: new Date("2026-10-01T00:00:00.000Z"),
      endDate: new Date("2026-12-29T00:00:00.000Z"),
    };
    test.setActiveCycles([nextCycle]);
    test.addImport({
      id: "import-2",
      rawJson: reviewPayload({
        date_from: "2026-10-01",
        date_to: "2026-10-07",
      }),
    });
    await normalizeWeeklyReviewImport(
      test.database,
      "import-2",
      OWNER_SUBJECT,
      new Date("2026-10-08T00:00:00.000Z"),
    );
    expect(test.getReviews()).toEqual([
      expect.objectContaining({ cycleId: "cycle-1", weekNumber: 1 }),
      expect.objectContaining({ cycleId: "cycle-2", weekNumber: 1 }),
    ]);
  });

  it("serializes concurrent exact retries to one normalized write", async () => {
    const test = createTestDatabase();
    const results = await Promise.all([
      normalizeWeeklyReviewImport(
        test.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
      normalizeWeeklyReviewImport(
        test.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "already_processed",
      "processed",
    ]);
    expect(test.getReviews()).toHaveLength(1);
    expect(test.upsert).toHaveBeenCalledTimes(1);
  });

  it("serializes concurrent same-week imports with deterministic winner", async () => {
    const test = createTestDatabase();
    test.addImport({
      id: "import-2",
      rawJson: reviewPayload({ summary: "Concurrent newer winner." }),
      createdAt: new Date("2026-07-08T11:00:00.000Z"),
    });
    const results = await Promise.all([
      normalizeWeeklyReviewImport(
        test.database,
        "import-2",
        OWNER_SUBJECT,
        NOW,
      ),
      normalizeWeeklyReviewImport(
        test.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ]);
    expect(results.every((result) => result.status === "processed")).toBe(true);
    expect(test.getReviews()).toHaveLength(1);
    expect(test.getReviews()[0]).toMatchObject({
      importedPayloadId: "import-2",
    });
  });

  it("breaks equal stored timestamps by imported payload id", async () => {
    const test = createTestDatabase();
    test.addImport({
      id: "import-2",
      rawJson: reviewPayload({ summary: "Equal-time id winner." }),
      createdAt: new Date("2026-07-08T10:00:00.000Z"),
    });
    await Promise.all([
      normalizeWeeklyReviewImport(
        test.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
      normalizeWeeklyReviewImport(
        test.database,
        "import-2",
        OWNER_SUBJECT,
        NOW,
      ),
    ]);
    expect(test.getReviews()[0]).toMatchObject({
      importedPayloadId: "import-2",
      summary: "Equal-time id winner.",
    });
  });

  it.each([
    ["missing owner", { ownerFound: false }, "import_owner_not_found"],
    ["no active cycle", { cycles: [] }, "active_cycle_not_found"],
    [
      "ambiguous active cycle",
      { cycles: [CYCLE, { ...CYCLE, id: "cycle-2" }] },
      "active_cycle_ambiguous",
    ],
  ])("fails safely for %s", async (_name, options, code) => {
    const test = createTestDatabase(options);
    await expect(
      normalizeWeeklyReviewImport(
        test.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).resolves.toEqual({ status: "failed", code });
    expect(test.getReviews()).toHaveLength(0);
    expect(test.getImports()[0]?.errorMetadata).toEqual({ code });
  });

  it("rejects client dates that conflict with canonical cycle week", async () => {
    const sentinel = "RAW_DATE_SENTINEL_31";
    const test = createTestDatabase({
      rawInput: reviewPayload({ date_to: "2026-07-06", summary: sentinel }),
    });
    await expect(
      normalizeWeeklyReviewImport(
        test.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).resolves.toEqual({ status: "failed", code: "review_dates_mismatch" });
    expect(test.getReviews()).toHaveLength(0);
    expect(JSON.stringify(test.getImports()[0]?.errorMetadata)).not.toContain(
      sentinel,
    );
  });

  it("rejects a review until its canonical week has completed", async () => {
    const test = createTestDatabase();
    await expect(
      normalizeWeeklyReviewImport(
        test.database,
        "import-1",
        OWNER_SUBJECT,
        new Date("2026-07-07T23:59:59.999Z"),
      ),
    ).resolves.toEqual({ status: "failed", code: "review_week_incomplete" });
  });

  it("rejects canonical ranges outside active cycle", async () => {
    const test = createTestDatabase({
      cycles: [{ ...CYCLE, endDate: new Date("2026-07-06T00:00:00.000Z") }],
    });
    await expect(
      normalizeWeeklyReviewImport(
        test.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).resolves.toEqual({
      status: "failed",
      code: "review_range_outside_active_cycle",
    });
  });

  it("rolls back a new review when processing-state completion fails", async () => {
    const test = createTestDatabase();
    test.setFailProcessedUpdate(true);
    await expect(
      normalizeWeeklyReviewImport(
        test.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).rejects.toThrow("final processing update failed");
    expect(test.getReviews()).toHaveLength(0);
    expect(test.getImports()[0]?.processingStatus).toBe("PENDING");
  });

  it("preserves previous review when same-week replacement rolls back", async () => {
    const test = createTestDatabase();
    await normalizeWeeklyReviewImport(
      test.database,
      "import-1",
      OWNER_SUBJECT,
      NOW,
    );
    const previous = test.getReviews();
    test.addImport({
      id: "import-2",
      rawJson: reviewPayload({ summary: "Must roll back." }),
    });
    test.setFailProcessedUpdate(true);

    await expect(
      normalizeWeeklyReviewImport(
        test.database,
        "import-2",
        OWNER_SUBJECT,
        NOW,
      ),
    ).rejects.toThrow("final processing update failed");
    expect(test.getReviews()).toEqual(previous);
    expect(test.getImports()[1]?.processingStatus).toBe("PENDING");
  });

  it("leaves raw import pending when normalized persistence throws", async () => {
    const test = createTestDatabase({ upsertError: new Error("write failed") });
    await expect(
      normalizeWeeklyReviewImport(
        test.database,
        "import-1",
        OWNER_SUBJECT,
        NOW,
      ),
    ).rejects.toThrow("write failed");
    expect(test.getReviews()).toHaveLength(0);
    expect(test.getImports()[0]?.processingStatus).toBe("PENDING");
  });
});
