import { config as loadEnv } from "dotenv";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ContextLibraryPage } from "../src/components/context-library";
import type { PrismaClient } from "../src/generated/prisma/client";
import { createPrismaClient } from "../src/server/db/client";
import {
  CONTEXT_PAGE_SIZE,
  getContextLibrary,
  handleGetContextRequest,
} from "../src/server/context";

loadEnv({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.local", quiet: true });

const databaseUrl = process.env.DATABASE_URL;
const database = databaseUrl ? createPrismaClient(databaseUrl) : null;
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

const describeWithPostgres = database ? describe : describe.skip;

describeWithPostgres(
  "Context Library PostgreSQL query and privacy boundary",
  () => {
    afterAll(async () => {
      await database?.$disconnect();
    });

    it("executes matching keyset ordering, pagination, filters, DTO, GET, and rendered privacy", async () => {
      if (!database) throw new Error("DATABASE_URL is required");

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
  },
);
