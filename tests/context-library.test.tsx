import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  ContextLibraryPage,
  ContextPacketDownloadError,
  ContextPacketExportControl,
  downloadGptContextPacket,
} from "../src/components/context-library";
import type { PrismaClient } from "../src/generated/prisma/client";
import type { ContextItemDto, ContextLibrary } from "../src/lib/context";
import {
  CONTEXT_PAGE_SIZE,
  createManualContextItem,
  getContextLibrary,
  handleCreateContextRequest,
  handleSetContextPinnedRequest,
  parseContextQuery,
  setContextPinned,
} from "../src/server/context";

const UUIDS = Array.from(
  { length: CONTEXT_PAGE_SIZE + 2 },
  (_, index) =>
    `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
);

const ROW = {
  id: UUIDS[0],
  title: "Keep work bounded",
  summary: "Small scopes preserve momentum.",
  kind: "DECISION" as const,
  domain: "WORK" as const,
  sourceType: "IMPORT" as const,
  sourceRef: "visible-source",
  pinnedAt: new Date("2026-07-13T10:00:00.000Z"),
  createdAt: new Date("2026-07-13T09:00:00.000Z"),
  updatedAt: new Date("2026-07-13T09:05:00.000Z"),
  rawJson: { hidden: "RAW_ONLY_BROWSER_SENTINEL_15" },
};

function readQuery(query: unknown) {
  const sql = query as { strings: readonly string[]; values: unknown[] };
  return { text: sql.strings.join("?"), values: sql.values };
}

function listDatabase(rows: unknown[] = [ROW]) {
  const resetCycleFindMany = vi
    .fn()
    .mockResolvedValue([
      { id: "22222222-2222-4222-8222-222222222222", name: "My Reset" },
    ]);
  const count = vi.fn().mockResolvedValue(rows.length ? 1 : 0);
  const queryRaw = vi.fn().mockResolvedValue(rows);
  const tagFindMany = vi
    .fn()
    .mockResolvedValue([{ contextItemId: UUIDS[0], name: "Work" }]);
  const database = {
    resetCycle: { findMany: resetCycleFindMany },
    contextItem: { count },
    contextTag: { findMany: tagFindMany },
    $queryRaw: queryRaw,
  } as unknown as PrismaClient;
  return { database, resetCycleFindMany, count, queryRaw, tagFindMany };
}

function item(overrides: Partial<ContextItemDto> = {}): ContextItemDto {
  return {
    id: UUIDS[0],
    title: "Context title",
    summary: "Context summary.",
    kind: "DECISION",
    domain: "WORK",
    tags: ["Work"],
    sourceType: "MANUAL",
    sourceRef: null,
    pinnedAt: null,
    createdAt: "2026-07-13T09:00:00.000Z",
    updatedAt: "2026-07-13T09:00:00.000Z",
    ...overrides,
  };
}

describe("context query validation and owned reads", () => {
  it("returns browser-safe DTOs only from the authenticated active cycle", async () => {
    const test = listDatabase();
    const result = await getContextLibrary(test.database, "user-1", {});

    expect(result).toEqual({
      status: "valid",
      library: {
        status: "ready",
        cycleName: "My Reset",
        filters: {},
        hasStoredItems: true,
        items: [
          {
            id: UUIDS[0],
            title: "Keep work bounded",
            summary: "Small scopes preserve momentum.",
            kind: "DECISION",
            domain: "WORK",
            tags: ["Work"],
            sourceType: "IMPORT",
            sourceRef: "visible-source",
            pinnedAt: "2026-07-13T10:00:00.000Z",
            createdAt: "2026-07-13T09:00:00.000Z",
            updatedAt: "2026-07-13T09:05:00.000Z",
          },
        ],
        nextCursor: null,
      },
    });
    expect(test.resetCycleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", status: "ACTIVE" },
        take: 2,
      }),
    );
    expect(JSON.stringify(result)).not.toContain(
      "RAW_ONLY_BROWSER_SENTINEL_15",
    );
    expect(JSON.stringify(result)).not.toContain("rawJson");
    expect(JSON.stringify(result)).not.toContain("cycleId");
    expect(JSON.stringify(result)).not.toContain("importedPayloadId");
  });

  it("combines exact filters with literal case-insensitive relational search", async () => {
    const test = listDatabase([]);
    const result = await getContextLibrary(test.database, "user-1", {
      q: "%_\\Work",
      domain: "WORK",
      kind: "DECISION",
      tag: " Work ",
      pinned: "pinned",
      created_from: "2026-07-01",
      created_to: "2026-07-13",
    });

    expect(result.status).toBe("valid");
    const query = readQuery(test.queryRaw.mock.calls[0][0]);
    expect(query.text).toContain("strpos(lower(ci.title), lower(?)");
    expect(query.text).toContain("strpos(lower(ci.summary), lower(?)");
    expect(query.text).toContain("ct.normalized_name = ?");
    expect(query.text).toContain("ci.pinned_at IS NOT NULL");
    expect(query.text).toContain("ci.created_at >= ?");
    expect(query.text).toContain("ci.created_at < ?");
    expect(query.text).toContain(
      "ORDER BY (ci.pinned_at IS NOT NULL) DESC, ci.created_at DESC, ci.id DESC",
    );
    expect(query.values).toContain("%_\\Work");
    expect(query.values).toContain("work");
    expect(query.values).toContain("WORK");
    expect(query.values).toContain("DECISION");
    expect(query.values).toContainEqual(new Date("2026-07-01T00:00:00.000Z"));
    expect(query.values).toContainEqual(new Date("2026-07-14T00:00:00.000Z"));
  });

  it.each([
    ["invalid kind", { kind: "REASONING_SUMMARY" }],
    ["invalid domain", { domain: "FINANCE" }],
    [
      "reversed range",
      { created_from: "2026-07-13", created_to: "2026-07-01" },
    ],
    ["oversized search", { q: "x".repeat(201) }],
    ["unknown filter", { owner_id: "other-user" }],
  ])("rejects %s before querying", (_name, query) => {
    expect(parseContextQuery(query).success).toBe(false);
  });

  it("treats an empty search as no search", () => {
    expect(parseContextQuery({ q: "   " })).toEqual({
      success: true,
      data: {},
    });
  });

  it("returns neutral no-cycle state without querying context", async () => {
    const test = listDatabase();
    test.resetCycleFindMany.mockResolvedValue([]);

    await expect(
      getContextLibrary(test.database, "user-2", {}),
    ).resolves.toEqual({
      status: "valid",
      library: { status: "no_cycle", filters: {} },
    });
    expect(test.queryRaw).not.toHaveBeenCalled();
    expect(test.count).not.toHaveBeenCalled();
  });
});

describe("manual context creation and owner-only pinning", () => {
  function manualDatabase(
    cycleSelections: unknown[][] = [[{ id: "cycle-1", name: "My Reset" }]],
  ) {
    const create = vi.fn().mockResolvedValue({
      ...ROW,
      sourceType: "MANUAL",
      importedPayloadId: null,
      pinnedAt: null,
      tags: [{ name: "Work" }],
    });
    let cycleReadIndex = 0;
    const findMany = vi.fn(async () => {
      const cycles =
        cycleSelections[Math.min(cycleReadIndex, cycleSelections.length - 1)] ??
        [];
      cycleReadIndex += 1;
      return cycles;
    });
    const queryRaw = vi.fn().mockResolvedValue([{ id: "cycle-1" }]);
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const transaction = {
      $queryRaw: queryRaw,
      resetCycle: { findMany },
      contextItem: { create, updateMany },
    };
    const database = {
      resetCycle: { findMany },
      contextItem: { create, updateMany },
      $transaction: vi.fn(async (callback: (value: unknown) => unknown) =>
        callback(transaction),
      ),
    } as unknown as PrismaClient;
    return { database, create, findMany, queryRaw, updateMany };
  }

  const validManual = {
    kind: "DECISION",
    domain: "WORK",
    title: " Manual decision ",
    summary: " Visible rationale. ",
    tags: ["Work", "work", " bounded "],
    source_ref: "visible-ref",
  };

  it("derives active-cycle ownership and manual provenance server-side", async () => {
    const test = manualDatabase();
    const result = await createManualContextItem(
      test.database,
      "user-1",
      validManual,
    );

    expect(result.status).toBe("created");
    expect(test.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1", status: "ACTIVE" },
      }),
    );
    expect(test.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cycleId: "cycle-1",
          sourceType: "MANUAL",
          title: "Manual decision",
          summary: "Visible rationale.",
          tags: {
            create: [
              { name: "Work", normalizedName: "work" },
              { name: "bounded", normalizedName: "bounded" },
            ],
          },
        }),
      }),
    );
    const data = test.create.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("userId");
    expect(data).not.toHaveProperty("importedPayloadId");
    expect(data).not.toHaveProperty("pinnedAt");
    expect(test.queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects supplied ownership/provenance fields", async () => {
    const test = manualDatabase();
    const result = await createManualContextItem(test.database, "user-1", {
      ...validManual,
      cycle_id: "other-cycle",
      user_id: "other-user",
      source_type: "IMPORT",
    });
    expect(result.status).toBe("invalid");
    expect(test.create).not.toHaveBeenCalled();
  });

  it("does not mutate when no owned active cycle exists", async () => {
    const test = manualDatabase([[]]);
    await expect(
      createManualContextItem(test.database, "user-1", validManual),
    ).resolves.toEqual({ status: "no_cycle" });
    expect(test.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      "two active cycles",
      [
        [
          { id: "cycle-1", name: "First" },
          { id: "cycle-2", name: "Second" },
        ],
      ],
    ],
    ["archived while waiting for lock", [[{ id: "cycle-1", name: "Old" }], []]],
    [
      "replaced while waiting for lock",
      [
        [{ id: "cycle-1", name: "Old" }],
        [{ id: "cycle-2", name: "Replacement" }],
      ],
    ],
  ])("does not manually create context with %s", async (_name, cycles) => {
    const test = manualDatabase(cycles);

    await expect(
      createManualContextItem(test.database, "user-1", validManual),
    ).resolves.toEqual({ status: "no_cycle" });
    expect(test.create).not.toHaveBeenCalled();
  });

  it("pins and unpins only an owned active-cycle item without changing content", async () => {
    const test = manualDatabase();
    const pinnedAt = new Date("2026-07-13T12:00:00.000Z");

    await setContextPinned(test.database, "user-1", UUIDS[0], true, pinnedAt);
    await setContextPinned(test.database, "user-1", UUIDS[0], false, pinnedAt);

    expect(test.updateMany.mock.calls[0][0]).toEqual({
      where: {
        id: UUIDS[0],
        cycleId: "cycle-1",
        pinnedAt: null,
      },
      data: { pinnedAt },
    });
    expect(test.updateMany.mock.calls[1][0]).toEqual({
      where: {
        id: UUIDS[0],
        cycleId: "cycle-1",
        pinnedAt: { not: null },
      },
      data: { pinnedAt: null },
    });
    expect(JSON.stringify(test.updateMany.mock.calls)).not.toMatch(
      /title|summary|kind|domain|sourceType/,
    );
  });

  it("does not pin or unpin when active-cycle state is ambiguous", async () => {
    const ambiguous = [
      { id: "cycle-1", name: "First" },
      { id: "cycle-2", name: "Second" },
    ];
    const test = manualDatabase([ambiguous]);

    await setContextPinned(test.database, "user-1", UUIDS[0], true);
    await setContextPinned(test.database, "user-1", UUIDS[0], false);

    expect(test.queryRaw).not.toHaveBeenCalled();
    expect(test.updateMany).not.toHaveBeenCalled();
  });

  it("gives nonexistent and unowned pin targets equivalent safe responses", async () => {
    const test = manualDatabase();
    const dependencies = {
      requireSession: async () => ({ userId: "user-1" }),
      getDatabase: () => test.database,
    };
    const request = () =>
      new Request(`http://localhost/api/context/${UUIDS[0]}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: true }),
      });

    const nonexistent = await handleSetContextPinnedRequest(
      request(),
      UUIDS[0],
      dependencies,
    );
    const unowned = await handleSetContextPinnedRequest(
      request(),
      UUIDS[1],
      dependencies,
    );
    expect(nonexistent.status).toBe(200);
    expect(unowned.status).toBe(200);
    await expect(nonexistent.json()).resolves.toEqual({ ok: true });
    await expect(unowned.json()).resolves.toEqual({ ok: true });
  });

  it("rejects unauthenticated manual creation before database access", async () => {
    const getDatabase = vi.fn();
    await expect(
      handleCreateContextRequest(
        new Request("http://localhost/api/context", {
          method: "POST",
          body: JSON.stringify(validManual),
        }),
        {
          requireSession: async () => {
            throw new Error("unauthorized");
          },
          getDatabase,
        },
      ),
    ).rejects.toThrow("unauthorized");
    expect(getDatabase).not.toHaveBeenCalled();
  });
});

describe("Context Library UI", () => {
  it("renders no-cycle state and disables manual creation", () => {
    const html = renderToStaticMarkup(
      <ContextLibraryPage
        library={{ status: "no_cycle", filters: {} }}
        queryIssues={[]}
      />,
    );
    expect(html).toContain("No active reset cycle.");
    expect(html).toContain(
      "Start an active reset cycle before adding context.",
    );
    expect(html).toContain("Export GPT context packet");
    expect(html).toContain(
      "An active reset cycle is required before exporting GPT context.",
    );
    expect(html).toContain("disabled");
  });

  it("renders an enabled phone-width export action for an active cycle", () => {
    const html = renderToStaticMarkup(
      <ContextLibraryPage
        library={{
          status: "ready",
          cycleName: "My Reset",
          filters: {},
          hasStoredItems: false,
          items: [],
          nextCursor: null,
        }}
        queryIssues={[]}
      />,
    );
    expect(html).toContain("Export GPT context packet");
    expect(html).toContain("w-full");
    expect(html).toContain("sm:w-auto");
    expect(html).not.toContain(
      "An active reset cycle is required before exporting GPT context.",
    );
  });

  it("disables repeated export submission while loading", () => {
    const html = renderToStaticMarkup(
      <ContextPacketExportControl
        disabled={false}
        loading
        notice={null}
        onExport={() => undefined}
      />,
    );
    expect(html).toContain("Exporting…");
    expect(html).toContain("disabled");
  });

  it("invokes one successful JSON download and releases the object URL", async () => {
    const triggerDownload = vi.fn();
    const revokeObjectUrl = vi.fn();
    const fetcher = vi.fn(
      async () =>
        new Response('{"schema_version":"1.0"}', {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="reset90-gpt-context-2026-07-13.json"',
          },
        }),
    );

    await downloadGptContextPacket({
      fetcher,
      createObjectUrl: () => "blob:packet",
      revokeObjectUrl,
      triggerDownload,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/api/context/export", {
      method: "GET",
      cache: "no-store",
    });
    expect(triggerDownload).toHaveBeenCalledWith(
      "blob:packet",
      "reset90-gpt-context-2026-07-13.json",
    );
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:packet");
  });

  it("presents only a bounded server-safe export error", async () => {
    const request = downloadGptContextPacket({
      fetcher: async () =>
        Response.json(
          {
            ok: false,
            error: "context_export_failed",
            message: "GPT context packet could not be generated. Try again.",
            stack: "PRIVATE_STACK_SENTINEL_16",
          },
          { status: 500 },
        ),
    });
    await expect(request).rejects.toEqual(
      new ContextPacketDownloadError(
        "GPT context packet could not be generated. Try again.",
        500,
      ),
    );
    await expect(request).rejects.not.toThrow("PRIVATE_STACK_SENTINEL_16");
  });

  it("distinguishes empty library from filtered-empty state", () => {
    const empty: ContextLibrary = {
      status: "ready",
      cycleName: "My Reset",
      filters: {},
      hasStoredItems: false,
      items: [],
      nextCursor: null,
    };
    const filtered: ContextLibrary = {
      ...empty,
      filters: { q: "missing" },
      hasStoredItems: true,
    };
    const emptyHtml = renderToStaticMarkup(
      <ContextLibraryPage library={empty} queryIssues={[]} />,
    );
    const filteredHtml = renderToStaticMarkup(
      <ContextLibraryPage library={filtered} queryIssues={[]} />,
    );
    expect(emptyHtml).toContain("No context saved yet.");
    expect(emptyHtml).toContain("explicitly import one");
    expect(filteredHtml).toContain("No context matches.");
    expect(filteredHtml).toContain("Clear filters");
  });

  it("renders accessible pin controls and wrapping classes without raw data", () => {
    const long = "verylongvalue".repeat(40);
    const library: ContextLibrary = {
      status: "ready",
      cycleName: "My Reset",
      filters: {},
      hasStoredItems: true,
      items: [
        item({
          title: long,
          summary: `${long}\nSecond line`,
          tags: [long],
          pinnedAt: "2026-07-13T10:00:00.000Z",
        }),
      ],
      nextCursor: null,
    };
    const html = renderToStaticMarkup(
      <ContextLibraryPage library={library} queryIssues={[]} />,
    );
    expect(html).toContain(`aria-label="Unpin ${long}"`);
    expect(html).toContain("break-words");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("overflow-x-hidden");
    expect(html).not.toContain("rawJson");
    expect(html).not.toContain("importedPayloadId");
    expect(html).not.toContain("processingStatus");
  });

  it("renders bounded manual fields and all exact filter controls", () => {
    const html = renderToStaticMarkup(
      <ContextLibraryPage
        library={{
          status: "ready",
          cycleName: "My Reset",
          filters: {},
          hasStoredItems: false,
          items: [],
          nextCursor: null,
        }}
        queryIssues={[]}
      />,
    );
    expect(html).toContain('maxLength="160"');
    expect(html).toContain('maxLength="4000"');
    expect(html).toContain('name="domain"');
    expect(html).toContain('name="kind"');
    expect(html).toContain('name="tag"');
    expect(html).toContain('name="pinned"');
    expect(html).toContain('name="created_from"');
    expect(html).toContain('name="created_to"');
  });
});
