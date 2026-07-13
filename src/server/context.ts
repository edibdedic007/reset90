import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import {
  CONTEXT_DOMAINS,
  CONTEXT_KINDS,
  type ContextFilterValues,
  type ContextItemDto,
  type ContextLibrary,
  normalizeContextTag,
} from "@/lib/context";
import {
  findSingularActiveCycle,
  lockAndRevalidateSingularActiveCycle,
} from "@/server/context-cycle";
import { contextItemPayloadSchema } from "@/server/imports/schemas";
import { z } from "zod";

export const CONTEXT_PAGE_SIZE = 24;

type ContextDatabase = PrismaClient;

type ContextRow = {
  id: string;
  title: string;
  summary: string;
  kind: ContextItemDto["kind"];
  domain: ContextItemDto["domain"];
  sourceType: ContextItemDto["sourceType"];
  sourceRef: string | null;
  pinnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type CursorPayload = {
  pinned: boolean;
  createdAt: string;
  id: string;
};

export type ContextValidationIssue = {
  field: string;
  message: string;
};

export type ContextQueryResult =
  | { success: true; data: ContextFilterValues }
  | { success: false; issues: ContextValidationIssue[] };

export type ManualContextCreationResult =
  | { status: "created"; item: ContextItemDto }
  | { status: "no_cycle" }
  | { status: "invalid"; issues: ContextValidationIssue[] };

const optionalQueryText = (maximumLength: number) =>
  z
    .string()
    .trim()
    .max(maximumLength)
    .transform((value) => value || undefined)
    .optional();

const contextQuerySchema = z
  .strictObject({
    q: optionalQueryText(200),
    domain: z.enum(CONTEXT_DOMAINS).optional(),
    kind: z.enum(CONTEXT_KINDS).optional(),
    tag: optionalQueryText(40),
    pinned: z.enum(["pinned", "unpinned"]).optional(),
    created_from: z.iso.date().optional(),
    created_to: z.iso.date().optional(),
    cursor: optionalQueryText(1_000),
  })
  .refine(
    (value) =>
      !value.created_from ||
      !value.created_to ||
      value.created_from <= value.created_to,
    {
      message: "Creation start date must not be after end date",
      path: ["created_to"],
    },
  );

const cursorPayloadSchema = z.strictObject({
  pinned: z.boolean(),
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});

function validationIssues(
  issues: ReadonlyArray<{
    path: ReadonlyArray<PropertyKey>;
    message: string;
  }>,
): ContextValidationIssue[] {
  return issues.slice(0, 12).map((issue) => ({
    field: issue.path.map(String).join(".").slice(0, 100),
    message: issue.message.slice(0, 200),
  }));
}

function encodeCursor(row: ContextRow): string {
  const payload: CursorPayload = {
    pinned: row.pinnedAt !== null,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    return cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
  } catch {
    return null;
  }
}

function nextUtcDate(date: string): Date {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

function mapContextItem(
  row: ContextRow,
  tags: readonly string[],
): ContextItemDto {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    kind: row.kind,
    domain: row.domain,
    tags: [...tags],
    sourceType: row.sourceType,
    sourceRef: row.sourceRef,
    pinnedAt: row.pinnedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function parseContextQuery(input: unknown): ContextQueryResult {
  const parsed = contextQuerySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, issues: validationIssues(parsed.error.issues) };
  }

  if (parsed.data.cursor && !decodeCursor(parsed.data.cursor)) {
    return {
      success: false,
      issues: [{ field: "cursor", message: "Cursor is invalid" }],
    };
  }

  return {
    success: true,
    data: {
      q: parsed.data.q,
      domain: parsed.data.domain,
      kind: parsed.data.kind,
      tag: parsed.data.tag,
      pinned: parsed.data.pinned,
      createdFrom: parsed.data.created_from,
      createdTo: parsed.data.created_to,
      cursor: parsed.data.cursor,
    },
  };
}

export async function getContextLibrary(
  database: ContextDatabase,
  userId: string,
  rawQuery: unknown,
): Promise<
  | { status: "invalid"; issues: ContextValidationIssue[] }
  | { status: "valid"; library: ContextLibrary }
> {
  const parsed = parseContextQuery(rawQuery);
  if (!parsed.success) {
    return { status: "invalid", issues: parsed.issues };
  }

  const cycle = await findSingularActiveCycle(database, userId);
  if (!cycle) {
    return {
      status: "valid",
      library: { status: "no_cycle", filters: parsed.data },
    };
  }

  const filters = parsed.data;
  const clauses: Prisma.Sql[] = [Prisma.sql`ci.cycle_id = ${cycle.id}::uuid`];
  if (filters.q) {
    clauses.push(
      Prisma.sql`(strpos(lower(ci.title), lower(${filters.q})) > 0 OR strpos(lower(ci.summary), lower(${filters.q})) > 0)`,
    );
  }
  if (filters.domain) {
    clauses.push(Prisma.sql`ci.domain = ${filters.domain}::focus_domain`);
  }
  if (filters.kind) {
    clauses.push(Prisma.sql`ci.kind = ${filters.kind}::context_kind`);
  }
  if (filters.tag) {
    clauses.push(
      Prisma.sql`EXISTS (
        SELECT 1 FROM context_tags ct
        WHERE ct.context_item_id = ci.id
          AND ct.normalized_name = ${normalizeContextTag(filters.tag)}
      )`,
    );
  }
  if (filters.pinned === "pinned") {
    clauses.push(Prisma.sql`ci.pinned_at IS NOT NULL`);
  }
  if (filters.pinned === "unpinned") {
    clauses.push(Prisma.sql`ci.pinned_at IS NULL`);
  }
  if (filters.createdFrom) {
    clauses.push(
      Prisma.sql`ci.created_at >= ${new Date(`${filters.createdFrom}T00:00:00.000Z`)}`,
    );
  }
  if (filters.createdTo) {
    clauses.push(Prisma.sql`ci.created_at < ${nextUtcDate(filters.createdTo)}`);
  }

  const cursor = filters.cursor ? decodeCursor(filters.cursor) : null;
  if (cursor) {
    const createdAt = new Date(cursor.createdAt);
    clauses.push(
      Prisma.sql`(
        (ci.pinned_at IS NOT NULL) < ${cursor.pinned}
        OR (
          (ci.pinned_at IS NOT NULL) = ${cursor.pinned}
          AND (
            ci.created_at < ${createdAt}
            OR (ci.created_at = ${createdAt} AND ci.id < ${cursor.id}::uuid)
          )
        )
      )`,
    );
  }

  const [storedCount, queriedRows] = await Promise.all([
    database.contextItem.count({ where: { cycleId: cycle.id } }),
    database.$queryRaw<ContextRow[]>(Prisma.sql`
      SELECT
        ci.id,
        ci.title,
        ci.summary,
        ci.kind,
        ci.domain,
        ci.source_type AS "sourceType",
        ci.source_ref AS "sourceRef",
        ci.pinned_at AS "pinnedAt",
        ci.created_at AS "createdAt",
        ci.updated_at AS "updatedAt"
      FROM context_items ci
      WHERE ${Prisma.join(clauses, " AND ")}
      ORDER BY (ci.pinned_at IS NOT NULL) DESC, ci.created_at DESC, ci.id DESC
      LIMIT ${CONTEXT_PAGE_SIZE + 1}
    `),
  ]);

  const hasNextPage = queriedRows.length > CONTEXT_PAGE_SIZE;
  const rows = queriedRows.slice(0, CONTEXT_PAGE_SIZE);
  const tags = rows.length
    ? await database.contextTag.findMany({
        where: { contextItemId: { in: rows.map((row) => row.id) } },
        orderBy: [
          { contextItemId: "asc" },
          { createdAt: "asc" },
          { id: "asc" },
        ],
        select: { contextItemId: true, name: true },
      })
    : [];
  const tagsByItem = new Map<string, string[]>();
  for (const tag of tags) {
    const names = tagsByItem.get(tag.contextItemId) ?? [];
    names.push(tag.name);
    tagsByItem.set(tag.contextItemId, names);
  }

  return {
    status: "valid",
    library: {
      status: "ready",
      cycleName: cycle.name,
      filters,
      hasStoredItems: storedCount > 0,
      items: rows.map((row) =>
        mapContextItem(row, tagsByItem.get(row.id) ?? []),
      ),
      nextCursor:
        hasNextPage && rows.length ? encodeCursor(rows[rows.length - 1]) : null,
    },
  };
}

export async function createManualContextItem(
  database: ContextDatabase,
  userId: string,
  rawInput: unknown,
): Promise<ManualContextCreationResult> {
  const parsed = contextItemPayloadSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { status: "invalid", issues: validationIssues(parsed.error.issues) };
  }

  return database.$transaction(async (transaction) => {
    const expectedCycle = await findSingularActiveCycle(transaction, userId);
    if (!expectedCycle) {
      return { status: "no_cycle" as const };
    }
    const cycle = await lockAndRevalidateSingularActiveCycle(
      transaction,
      userId,
      expectedCycle.id,
    );
    if (!cycle) {
      return { status: "no_cycle" as const };
    }

    const payload = parsed.data;
    const item = await transaction.contextItem.create({
      data: {
        cycleId: cycle.id,
        kind: payload.kind,
        domain: payload.domain,
        title: payload.title,
        summary: payload.summary,
        sourceType: "MANUAL",
        sourceRef: payload.source_ref,
        tags: {
          create: (payload.tags ?? []).map((name) => ({
            name,
            normalizedName: normalizeContextTag(name),
          })),
        },
      },
      select: {
        id: true,
        title: true,
        summary: true,
        kind: true,
        domain: true,
        sourceType: true,
        sourceRef: true,
        pinnedAt: true,
        createdAt: true,
        updatedAt: true,
        tags: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { name: true },
        },
      },
    });

    return {
      status: "created" as const,
      item: mapContextItem(
        item,
        item.tags.map((tag) => tag.name),
      ),
    };
  });
}

export async function setContextPinned(
  database: ContextDatabase,
  userId: string,
  contextItemId: string,
  pinned: boolean,
  now = new Date(),
): Promise<void> {
  await database.$transaction(async (transaction) => {
    const expectedCycle = await findSingularActiveCycle(transaction, userId);
    if (!expectedCycle) {
      return;
    }
    const cycle = await lockAndRevalidateSingularActiveCycle(
      transaction,
      userId,
      expectedCycle.id,
    );
    if (!cycle) {
      return;
    }
    await transaction.contextItem.updateMany({
      where: {
        id: contextItemId,
        cycleId: cycle.id,
        pinnedAt: pinned ? null : { not: null },
      },
      data: { pinnedAt: pinned ? now : null },
    });
  });
}

type ContextHttpDependencies = {
  requireSession: () => Promise<{ userId: string }>;
  getDatabase: () => ContextDatabase;
};

function queryRecord(searchParams: URLSearchParams): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    input[key] = values.length === 1 ? values[0] : values;
  }
  return input;
}

export async function handleGetContextRequest(
  request: Request,
  dependencies: ContextHttpDependencies,
): Promise<Response> {
  const session = await dependencies.requireSession();
  const result = await getContextLibrary(
    dependencies.getDatabase(),
    session.userId,
    queryRecord(new URL(request.url).searchParams),
  );
  if (result.status === "invalid") {
    return Response.json(
      { ok: false, error: "invalid_context_query", details: result.issues },
      { status: 400 },
    );
  }
  return Response.json({ ok: true, library: result.library });
}

export async function handleCreateContextRequest(
  request: Request,
  dependencies: ContextHttpDependencies,
): Promise<Response> {
  const session = await dependencies.requireSession();
  const body = await request.json().catch(() => null);
  const result = await createManualContextItem(
    dependencies.getDatabase(),
    session.userId,
    body,
  );
  if (result.status === "invalid") {
    return Response.json(
      { ok: false, error: "invalid_context_payload", details: result.issues },
      { status: 400 },
    );
  }
  if (result.status === "no_cycle") {
    return Response.json(
      { ok: false, error: "no_active_cycle" },
      { status: 409 },
    );
  }
  return Response.json({ ok: true, item: result.item }, { status: 201 });
}

const pinPayloadSchema = z.strictObject({ pinned: z.boolean() });

export async function handleSetContextPinnedRequest(
  request: Request,
  contextItemId: string,
  dependencies: ContextHttpDependencies,
): Promise<Response> {
  const session = await dependencies.requireSession();
  const [idResult, bodyResult] = await Promise.all([
    z.uuid().safeParseAsync(contextItemId),
    request
      .json()
      .catch(() => null)
      .then((body) => pinPayloadSchema.safeParse(body)),
  ]);
  if (!idResult.success || !bodyResult.success) {
    return Response.json(
      { ok: false, error: "invalid_context_pin_payload" },
      { status: 400 },
    );
  }

  await setContextPinned(
    dependencies.getDatabase(),
    session.userId,
    idResult.data,
    bodyResult.data.pinned,
  );
  return Response.json({ ok: true });
}
