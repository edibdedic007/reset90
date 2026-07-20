import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ContextLibraryPage } from "../src/components/context-library";
import type { PrismaClient } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/server/db/client";
import { assertSafeTestDatabaseUrl } from "../scripts/test-database-url";
import {
  CONTEXT_PAGE_SIZE,
  createManualContextItem,
  getContextLibrary,
  handleGetContextRequest,
  setContextPinned,
} from "../src/server/context";

const databaseUrl = assertSafeTestDatabaseUrl();
const database = createPrismaClient(databaseUrl);
const RAW_SENTINEL = "POSTGRES_RAW_ONLY_CONTEXT_SENTINEL_15";

type SeededContext = {
  id: string;
  pinnedAt: Date | null;
  createdAt: Date;
};

type Evidence = {
  firstIds: string[];
  secondIds: string[];
  expectedIds: string[];
  firstPinned: Array<string | null>;
  secondPinned: Array<string | null>;
  firstCreated: string[];
  secondCreated: string[];
  firstTags: string[][];
  secondTags: string[][];
  firstDomains: string[];
  secondDomains: string[];
  firstCursor: string | null;
  secondCursor: string | null;
  responseText: string;
  dtoText: string;
  renderedHtml: string;
};

class RollbackWithEvidence extends Error {
  constructor(readonly evidence: Evidence) {
    super("rollback context PostgreSQL test");
  }
}

function contextId(index: number) {
  return `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`;
}

const describeWithPostgres = describe;

describeWithPostgres(
  "Context Library PostgreSQL query and privacy boundary",
  () => {
    afterAll(async () => {
      await database.$disconnect();
    });

    it("executes matching keyset ordering, pagination, filters, DTO, GET, and rendered privacy", async () => {
      let evidence: Evidence | null = null;
      try {
        await database.$transaction(async (transaction) => {
          const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
          const cycleId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
          const linkedImportId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
          const legacyImportId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
          const rejectedImportId = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";

          await transaction.user.create({
            data: {
              id: userId,
              authentikSubject: "context-postgres-test-owner",
              email: "context-postgres-test@reset90.local",
            },
          });
          await transaction.resetCycle.create({
            data: {
              id: cycleId,
              userId,
              name: "Context PostgreSQL Test",
              startDate: new Date("2026-07-01T00:00:00.000Z"),
              endDate: new Date("2026-09-28T00:00:00.000Z"),
              status: "ACTIVE",
            },
          });
          await transaction.importedPayload.createMany({
            data: [
              {
                id: linkedImportId,
                kind: "CONTEXT_ITEM",
                schemaVersion: "2.0",
                idempotencyKey: "context-postgres-linked-v2",
                source: "custom_gpt",
                rawJson: {
                  kind: "context_item",
                  schema_version: "2.0",
                  idempotency_key: "context-postgres-linked-v2",
                  source: "custom_gpt",
                  payload: {
                    kind: "DECISION",
                    domain: "WORK",
                    title: "Linked raw import",
                    summary:
                      "Visible normalized content differs from raw data.",
                  },
                },
                validationStatus: "VALID",
                processingStatus: "PROCESSED",
                processedAt: new Date("2026-07-13T12:00:00.000Z"),
                errorMetadata: {
                  processing_attempts: 7,
                  authentication: "internal-auth-data",
                  internal_error: "internal-error-data",
                },
              },
              {
                id: legacyImportId,
                kind: "CONTEXT_ITEM",
                schemaVersion: "1.0",
                idempotencyKey: "context-postgres-legacy-v1",
                source: "custom_gpt",
                rawJson: {
                  kind: "context_item",
                  schema_version: "1.0",
                  idempotency_key: "context-postgres-legacy-v1",
                  source: "custom_gpt",
                  payload: {
                    kind: "decision_log",
                    title: "Legacy raw-only title",
                    summary: RAW_SENTINEL,
                    importance: 4,
                    tags: ["legacy"],
                    is_sensitive: true,
                  },
                },
                validationStatus: "VALID",
                processingStatus: "PROCESSED",
                processedAt: new Date("2026-07-13T12:00:00.000Z"),
              },
              {
                id: rejectedImportId,
                kind: "CONTEXT_ITEM",
                schemaVersion: "2.0",
                idempotencyKey: "context-postgres-rejected-v2",
                source: "custom_gpt",
                rawJson: {
                  raw_prompt: "private-raw-prompt-data",
                  authorization: "private-auth-data",
                },
                validationStatus: "INVALID",
                processingStatus: "REJECTED",
              },
            ],
          });

          const seeded: SeededContext[] = [];
          for (let index = 1; index <= CONTEXT_PAGE_SIZE + 3; index += 1) {
            const pinned = index <= CONTEXT_PAGE_SIZE;
            const createdAt =
              index <= 2
                ? new Date("2026-07-13T12:00:00.000Z")
                : new Date(
                    Date.parse("2026-07-13T12:00:00.000Z") -
                      (index - 1) * 60_000,
                  );
            const id = contextId(index);
            await transaction.contextItem.create({
              data: {
                id,
                cycleId,
                kind: "DECISION",
                domain: "WORK",
                title: `Kept context ${index}`,
                summary: `Safe normalized summary ${index}.`,
                sourceType: index === 1 ? "IMPORT" : "MANUAL",
                importedPayloadId: index === 1 ? linkedImportId : undefined,
                sourceRef: index === 1 ? "visible-reference" : undefined,
                pinnedAt: pinned ? new Date("2026-07-13T13:00:00.000Z") : null,
                createdAt,
                updatedAt: createdAt,
                tags: {
                  create: { name: "Kept", normalizedName: "kept" },
                },
              },
            });
            seeded.push({
              id,
              pinnedAt: pinned ? new Date("2026-07-13T13:00:00.000Z") : null,
              createdAt,
            });
          }

          await transaction.contextItem.create({
            data: {
              id: contextId(90),
              cycleId,
              kind: "DECISION",
              domain: "BODY",
              title: "Wrong domain",
              summary: "Filter distractor.",
              sourceType: "MANUAL",
              tags: { create: { name: "Kept", normalizedName: "kept" } },
            },
          });
          await transaction.contextItem.create({
            data: {
              id: contextId(91),
              cycleId,
              kind: "DECISION",
              domain: "WORK",
              title: "Wrong tag",
              summary: "Filter distractor.",
              sourceType: "MANUAL",
              tags: { create: { name: "Other", normalizedName: "other" } },
            },
          });

          const transactionDatabase = transaction as unknown as PrismaClient;
          const first = await getContextLibrary(transactionDatabase, userId, {
            domain: "WORK",
            tag: "kept",
          });
          if (first.status !== "valid" || first.library.status !== "ready") {
            throw new Error("expected first ready page");
          }
          const second = await getContextLibrary(transactionDatabase, userId, {
            domain: "WORK",
            tag: "kept",
            cursor: first.library.nextCursor ?? undefined,
          });
          if (second.status !== "valid" || second.library.status !== "ready") {
            throw new Error("expected second ready page");
          }

          const response = await handleGetContextRequest(
            new Request("http://localhost/api/context?domain=WORK&tag=kept"),
            {
              requireSession: async () => ({ userId }),
              getDatabase: () => transactionDatabase,
            },
          );
          const fullDto = await getContextLibrary(
            transactionDatabase,
            userId,
            {},
          );
          const renderedHtml = renderToStaticMarkup(
            <ContextLibraryPage
              library={fullDto.status === "valid" ? fullDto.library : null}
              queryIssues={[]}
            />,
          );

          const expectedIds = seeded
            .toSorted((left, right) => {
              const pinnedOrder =
                Number(right.pinnedAt !== null) -
                Number(left.pinnedAt !== null);
              if (pinnedOrder !== 0) return pinnedOrder;
              const createdOrder =
                right.createdAt.getTime() - left.createdAt.getTime();
              return createdOrder || right.id.localeCompare(left.id);
            })
            .map((item) => item.id);

          throw new RollbackWithEvidence({
            firstIds: first.library.items.map((item) => item.id),
            secondIds: second.library.items.map((item) => item.id),
            expectedIds,
            firstPinned: first.library.items.map((item) => item.pinnedAt),
            secondPinned: second.library.items.map((item) => item.pinnedAt),
            firstCreated: first.library.items.map((item) => item.createdAt),
            secondCreated: second.library.items.map((item) => item.createdAt),
            firstTags: first.library.items.map((item) => item.tags),
            secondTags: second.library.items.map((item) => item.tags),
            firstDomains: first.library.items.map((item) => item.domain),
            secondDomains: second.library.items.map((item) => item.domain),
            firstCursor: first.library.nextCursor,
            secondCursor: second.library.nextCursor,
            responseText: await response.text(),
            dtoText: JSON.stringify(fullDto),
            renderedHtml,
          });
        });
      } catch (error) {
        if (!(error instanceof RollbackWithEvidence)) throw error;
        evidence = error.evidence;
      }

      if (!evidence) throw new Error("missing PostgreSQL evidence");
      expect(evidence.firstIds).toHaveLength(CONTEXT_PAGE_SIZE);
      expect(evidence.secondIds).toHaveLength(3);
      expect([...evidence.firstIds, ...evidence.secondIds]).toEqual(
        evidence.expectedIds,
      );
      expect(new Set([...evidence.firstIds, ...evidence.secondIds]).size).toBe(
        CONTEXT_PAGE_SIZE + 3,
      );
      expect(evidence.firstPinned.every(Boolean)).toBe(true);
      expect(evidence.secondPinned.every((value) => value === null)).toBe(true);
      expect(evidence.firstCursor).not.toBeNull();
      expect(evidence.secondCursor).toBeNull();
      expect(evidence.firstIds.slice(0, 2)).toEqual([
        contextId(2),
        contextId(1),
      ]);
      expect(
        [...evidence.firstCreated, ...evidence.secondCreated].every(
          (createdAt, index, values) =>
            index === 0 || createdAt <= values[index - 1],
        ),
      ).toBe(true);
      expect([...evidence.firstTags, ...evidence.secondTags]).toSatisfy(
        (tags: string[][]) => tags.every((item) => item.includes("Kept")),
      );
      expect([...evidence.firstDomains, ...evidence.secondDomains]).toSatisfy(
        (domains: string[]) => domains.every((domain) => domain === "WORK"),
      );

      for (const output of [
        evidence.responseText,
        evidence.dtoText,
        evidence.renderedHtml,
      ]) {
        expect(output).not.toContain(RAW_SENTINEL);
        expect(output).not.toMatch(
          /rawJson|raw_json|raw_prompt|private-raw-prompt-data|processingAttempts|processing_attempts|processingStatus|processing_status|authorization|authentication|private-auth-data|errorMetadata|error_metadata|internal_error|internal-auth-data|internal-error-data/,
        );
      }
    }, 20_000);

    it("fails the active-cycle migration clearly without changing duplicate data", async () => {
      const pool = new Pool({ connectionString: databaseUrl });
      const connection = await pool.connect();
      const schemaName = `active_cycle_migration_${randomUUID().replaceAll("-", "")}`;

      try {
        await connection.query(`CREATE SCHEMA "${schemaName}"`);
        await connection.query(`SET search_path TO "${schemaName}"`);
        await connection.query(
          `CREATE TYPE "cycle_status" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED')`,
        );
        await connection.query(`
          CREATE TABLE "reset_cycles" (
            "id" UUID PRIMARY KEY,
            "user_id" UUID NOT NULL,
            "status" "cycle_status" NOT NULL
          )
        `);
        await connection.query(`
          INSERT INTO "reset_cycles" ("id", "user_id", "status")
          VALUES
            ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ACTIVE'),
            ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'ACTIVE')
        `);

        const migrationSql = await readFile(
          new URL(
            "../prisma/migrations/20260713160000_single_active_reset_cycle/migration.sql",
            import.meta.url,
          ),
          "utf8",
        );
        let migrationFailure: unknown = null;
        try {
          await connection.query(migrationSql);
        } catch (error) {
          migrationFailure = error;
        }

        expect(migrationFailure).toMatchObject({
          message:
            "Cannot enforce one active Reset Cycle per user: duplicate active cycles exist",
        });
        const duplicateRows = await connection.query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM "reset_cycles"`,
        );
        expect(duplicateRows.rows[0]?.count).toBe("2");
        const indexRows = await connection.query<{ index_name: string | null }>(
          `SELECT to_regclass('reset_cycles_one_active_per_user_key') AS index_name`,
        );
        expect(indexRows.rows[0]?.index_name).toBeNull();
      } finally {
        await connection.query(`SET search_path TO public`);
        await connection.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        connection.release();
        await pool.end();
      }
    }, 20_000);

    it("enforces one active cycle per user across concurrent connections and preserves context safety", async () => {
      const firstConnection = createPrismaClient(databaseUrl);
      const secondConnection = createPrismaClient(databaseUrl);
      const suffix = randomUUID();
      const firstUserId = randomUUID();
      const secondUserId = randomUUID();
      const cycleDates = {
        startDate: new Date("2026-07-01T00:00:00.000Z"),
        endDate: new Date("2026-09-28T00:00:00.000Z"),
      };

      try {
        await database.user.createMany({
          data: [
            {
              id: firstUserId,
              authentikSubject: `active-cycle-race-first-${suffix}`,
            },
            {
              id: secondUserId,
              authentikSubject: `active-cycle-race-second-${suffix}`,
            },
          ],
        });

        let readyCount = 0;
        let releaseAttempts!: () => void;
        const bothTransactionsReady = new Promise<void>((resolve) => {
          releaseAttempts = resolve;
        });
        const attemptActiveCycle = (connection: PrismaClient, name: string) =>
          connection.$transaction(async (transaction) => {
            readyCount += 1;
            if (readyCount === 2) releaseAttempts();
            await bothTransactionsReady;
            return transaction.resetCycle.create({
              data: {
                userId: firstUserId,
                name,
                ...cycleDates,
                status: "ACTIVE",
              },
              select: { id: true },
            });
          });

        const attempts = await Promise.allSettled([
          attemptActiveCycle(firstConnection, "Concurrent active cycle A"),
          attemptActiveCycle(secondConnection, "Concurrent active cycle B"),
        ]);
        const winners = attempts.filter(
          (result) => result.status === "fulfilled",
        );
        const conflicts = attempts.filter(
          (result) => result.status === "rejected",
        );

        expect(winners).toHaveLength(1);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({
          status: "rejected",
          reason: { code: "P2002" },
        });
        expect(
          await database.resetCycle.count({
            where: { userId: firstUserId, status: "ACTIVE" },
          }),
        ).toBe(1);

        const secondUserCycle = await database.resetCycle.create({
          data: {
            userId: secondUserId,
            name: "Other user's active cycle",
            ...cycleDates,
            status: "ACTIVE",
          },
          select: { id: true },
        });
        expect(
          await database.resetCycle.count({
            where: {
              userId: { in: [firstUserId, secondUserId] },
              status: "ACTIVE",
            },
          }),
        ).toBe(2);

        const currentFirstCycle = await database.resetCycle.findFirstOrThrow({
          where: { userId: firstUserId, status: "ACTIVE" },
          select: { id: true },
        });
        const replacementCycle = await database.$transaction(
          async (transaction) => {
            await transaction.resetCycle.update({
              where: { id: currentFirstCycle.id },
              data: { status: "ARCHIVED" },
            });
            return transaction.resetCycle.create({
              data: {
                userId: firstUserId,
                name: "Replacement active cycle",
                ...cycleDates,
                status: "ACTIVE",
              },
              select: { id: true },
            });
          },
        );

        const created = await createManualContextItem(database, firstUserId, {
          kind: "DECISION",
          domain: "WORK",
          title: "Active-cycle invariant proof",
          summary: "Context remains scoped to one active cycle.",
          tags: ["cycle"],
        });
        expect(created.status).toBe("created");
        if (created.status !== "created") {
          throw new Error("expected context creation to succeed");
        }
        expect(
          await database.contextItem.findUniqueOrThrow({
            where: { id: created.item.id },
            select: { cycleId: true },
          }),
        ).toEqual({ cycleId: replacementCycle.id });

        const otherContext = await createManualContextItem(
          database,
          secondUserId,
          {
            kind: "DECISION",
            domain: "WORK",
            title: "Other user's context",
            summary: "Must remain owned by the other active cycle.",
          },
        );
        expect(otherContext.status).toBe("created");
        if (otherContext.status !== "created") {
          throw new Error("expected other-user context creation to succeed");
        }
        expect(
          await database.contextItem.findUniqueOrThrow({
            where: { id: otherContext.item.id },
            select: { cycleId: true },
          }),
        ).toEqual({ cycleId: secondUserCycle.id });

        await setContextPinned(
          database,
          firstUserId,
          otherContext.item.id,
          true,
        );
        expect(
          await database.contextItem.findUniqueOrThrow({
            where: { id: otherContext.item.id },
            select: { pinnedAt: true },
          }),
        ).toEqual({ pinnedAt: null });

        const originalPinnedAt = new Date("2026-07-13T15:00:00.000Z");
        await setContextPinned(
          database,
          firstUserId,
          created.item.id,
          true,
          originalPinnedAt,
        );
        await database.resetCycle.update({
          where: { id: replacementCycle.id },
          data: { status: "ARCHIVED" },
        });

        const contextCountBeforeUnavailableCreate =
          await database.contextItem.count();
        await expect(
          createManualContextItem(database, firstUserId, {
            kind: "DECISION",
            domain: "WORK",
            title: "Unavailable-cycle attempt",
            summary: "Must not be stored.",
          }),
        ).resolves.toEqual({ status: "no_cycle" });
        await setContextPinned(database, firstUserId, created.item.id, false);
        await setContextPinned(
          database,
          firstUserId,
          created.item.id,
          true,
          new Date("2026-07-13T16:00:00.000Z"),
        );

        expect(await database.contextItem.count()).toBe(
          contextCountBeforeUnavailableCreate,
        );
        expect(
          await database.contextItem.findUniqueOrThrow({
            where: { id: created.item.id },
            select: { pinnedAt: true },
          }),
        ).toEqual({ pinnedAt: originalPinnedAt });
        expect(
          await database.contextItem.count({
            where: { cycleId: secondUserCycle.id },
          }),
        ).toBe(1);
      } finally {
        await firstConnection.$disconnect();
        await secondConnection.$disconnect();
        await database.user.deleteMany({
          where: { id: { in: [firstUserId, secondUserId] } },
        });
      }
    }, 20_000);
  },
);
