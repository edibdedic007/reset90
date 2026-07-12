import { createHash, timingSafeEqual } from "node:crypto";

import {
  type DailyPlanNormalizationDatabase,
  type DailyPlanNormalizationResult,
  normalizeDailyPlanImport,
} from "./normalize-daily-plan";
import {
  type DailyReflectionNormalizationDatabase,
  type DailyReflectionNormalizationResult,
  normalizeDailyReflectionImport,
} from "./normalize-daily-reflection";
import {
  normalizeWeeklyReviewImport,
  type WeeklyReviewNormalizationDatabase,
  type WeeklyReviewNormalizationResult,
} from "./normalize-weekly-review";
import type { RawImportDatabase } from "./store";
import { storeRawImport } from "./store";

const DEFAULT_MAX_BODY_BYTES = 1_048_576;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_REQUESTS_PER_WINDOW = 60;

type GptImportEnvironment = {
  GPT_INGEST_TOKEN?: string;
  GPT_INGEST_OWNER_SUBJECT?: string;
  GPT_INGEST_MAX_BODY_BYTES?: string;
};

type RateLimitResult =
  { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type GptImportRateLimiter = {
  check: () => RateLimitResult;
};

export type GptImportDatabase = RawImportDatabase &
  DailyPlanNormalizationDatabase &
  DailyReflectionNormalizationDatabase &
  WeeklyReviewNormalizationDatabase;

export type GptImportHandlerDependencies = {
  env: GptImportEnvironment;
  getDatabase: () => GptImportDatabase;
  rateLimiter: GptImportRateLimiter;
  normalizeDailyPlan?: (
    database: DailyPlanNormalizationDatabase,
    importedPayloadId: string,
  ) => Promise<DailyPlanNormalizationResult>;
  normalizeDailyReflection?: (
    database: DailyReflectionNormalizationDatabase,
    importedPayloadId: string,
    ownerAuthentikSubject: string,
  ) => Promise<DailyReflectionNormalizationResult>;
  normalizeWeeklyReview?: (
    database: WeeklyReviewNormalizationDatabase,
    importedPayloadId: string,
    ownerAuthentikSubject: string,
  ) => Promise<WeeklyReviewNormalizationResult>;
};

type ImportNormalizationResult =
  | DailyPlanNormalizationResult
  | DailyReflectionNormalizationResult
  | WeeklyReviewNormalizationResult;

type BodyReadResult =
  | { status: "ok"; text: string }
  | { status: "too_large" }
  | { status: "invalid_encoding" };

function jsonResponse(
  body: unknown,
  status: number,
  headers: HeadersInit = {},
): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function parseMaxBodyBytes(value: string | undefined): number {
  if (!value) {
    return DEFAULT_MAX_BODY_BYTES;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_BODY_BYTES;
}

function bearerToken(authorization: string | null): string | null {
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  return match?.[1] ?? null;
}

function tokenMatches(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function isJsonContentType(contentType: string | null): boolean {
  return (
    contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json"
  );
}

async function readBody(
  request: Request,
  maxBodyBytes: number,
): Promise<BodyReadResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBodyBytes) {
      return { status: "too_large" };
    }
  }

  if (!request.body) {
    return { status: "ok", text: "" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > maxBodyBytes) {
      await reader.cancel();
      return { status: "too_large" };
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return {
      status: "ok",
      text: new TextDecoder("utf-8", { fatal: true }).decode(body),
    };
  } catch {
    return { status: "invalid_encoding" };
  }
}

function envelopeIdempotencyKey(input: unknown): string | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const key = Reflect.get(input, "idempotency_key");
  return typeof key === "string" ? key : null;
}

function normalizationFailureResponse(
  importedPayloadId: string,
  result: Extract<ImportNormalizationResult, { status: "failed" }>,
) {
  return jsonResponse(
    {
      ok: false,
      error: "normalization_error",
      code: result.code,
      imported_payload_id: importedPayloadId,
    },
    422,
  );
}

async function normalizeStoredImport(
  dependencies: GptImportHandlerDependencies,
  database: GptImportDatabase,
  importedPayloadId: string,
): Promise<ImportNormalizationResult | { status: "service_unavailable" }> {
  const normalizeDailyPlan =
    dependencies.normalizeDailyPlan ?? normalizeDailyPlanImport;
  const dailyPlan = await normalizeDailyPlan(database, importedPayloadId);
  if (dailyPlan.status !== "not_applicable") {
    return dailyPlan;
  }

  const storedImport = await database.importedPayload.findUnique({
    where: { id: importedPayloadId },
    select: { kind: true },
  });
  if (
    storedImport?.kind !== "DAILY_REFLECTION" &&
    storedImport?.kind !== "WEEKLY_REVIEW"
  ) {
    return { status: "not_applicable" };
  }

  const ownerAuthentikSubject =
    dependencies.env.GPT_INGEST_OWNER_SUBJECT?.trim();
  if (!ownerAuthentikSubject) {
    return { status: "service_unavailable" };
  }

  if (storedImport.kind === "DAILY_REFLECTION") {
    const normalizeDailyReflection =
      dependencies.normalizeDailyReflection ?? normalizeDailyReflectionImport;
    return normalizeDailyReflection(
      database,
      importedPayloadId,
      ownerAuthentikSubject,
    );
  }

  const normalizeWeeklyReview =
    dependencies.normalizeWeeklyReview ?? normalizeWeeklyReviewImport;
  return normalizeWeeklyReview(
    database,
    importedPayloadId,
    ownerAuthentikSubject,
  );
}

export function createGptImportRateLimiter(
  now: () => number = Date.now,
): GptImportRateLimiter {
  let windowStartedAt = now();
  let requests = 0;

  return {
    check() {
      const currentTime = now();
      if (currentTime - windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
        windowStartedAt = currentTime;
        requests = 0;
      }

      if (requests >= RATE_LIMIT_REQUESTS_PER_WINDOW) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil(
              (RATE_LIMIT_WINDOW_MS - (currentTime - windowStartedAt)) / 1000,
            ),
          ),
        };
      }

      requests += 1;
      return { allowed: true };
    },
  };
}

export async function handleGptImport(
  request: Request,
  dependencies: GptImportHandlerDependencies,
): Promise<Response> {
  const expectedToken = dependencies.env.GPT_INGEST_TOKEN;
  if (!expectedToken) {
    return jsonResponse({ ok: false, error: "service_unavailable" }, 503);
  }

  const providedToken = bearerToken(request.headers.get("authorization"));
  if (!providedToken || !tokenMatches(providedToken, expectedToken)) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401, {
      "WWW-Authenticate": "Bearer",
    });
  }

  const rateLimit = dependencies.rateLimiter.check();
  if (!rateLimit.allowed) {
    return jsonResponse({ ok: false, error: "rate_limited" }, 429, {
      "Retry-After": String(rateLimit.retryAfterSeconds),
    });
  }

  if (!isJsonContentType(request.headers.get("content-type"))) {
    return jsonResponse({ ok: false, error: "unsupported_media_type" }, 415);
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) {
    return jsonResponse({ ok: false, error: "missing_idempotency_key" }, 400);
  }

  const body = await readBody(
    request,
    parseMaxBodyBytes(dependencies.env.GPT_INGEST_MAX_BODY_BYTES),
  );
  if (body.status === "too_large") {
    return jsonResponse({ ok: false, error: "payload_too_large" }, 413);
  }
  if (body.status === "invalid_encoding") {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  let rawInput: unknown;
  try {
    rawInput = JSON.parse(body.text) as unknown;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  const envelopeKey = envelopeIdempotencyKey(rawInput);
  if (envelopeKey !== null && envelopeKey !== idempotencyKey) {
    return jsonResponse({ ok: false, error: "idempotency_key_mismatch" }, 400);
  }

  try {
    const database = dependencies.getDatabase();
    const result = await storeRawImport(database, rawInput);

    if (result.status === "created") {
      const normalization = await normalizeStoredImport(
        dependencies,
        database,
        result.importedPayloadId,
      );
      if (normalization.status === "service_unavailable") {
        return jsonResponse({ ok: false, error: "service_unavailable" }, 503);
      }
      if (normalization.status === "failed") {
        return normalizationFailureResponse(
          result.importedPayloadId,
          normalization,
        );
      }

      return jsonResponse(
        {
          ok: true,
          status: "created",
          imported_payload_id: result.importedPayloadId,
          ...(normalization.status === "processed"
            ? {
                normalized_records:
                  "dailyPlanId" in normalization
                    ? ["daily_plan", "tasks"]
                    : "dailyReflectionId" in normalization
                      ? ["daily_reflection"]
                      : ["weekly_review"],
              }
            : {}),
        },
        201,
      );
    }

    if (result.status === "duplicate") {
      if (
        result.validationStatus === "VALID" &&
        result.processingStatus === "PENDING"
      ) {
        const normalization = await normalizeStoredImport(
          dependencies,
          database,
          result.importedPayloadId,
        );
        if (normalization.status === "service_unavailable") {
          return jsonResponse({ ok: false, error: "service_unavailable" }, 503);
        }
        if (normalization.status === "failed") {
          return normalizationFailureResponse(
            result.importedPayloadId,
            normalization,
          );
        }
      }

      return jsonResponse(
        {
          ok: true,
          status: "duplicate",
          imported_payload_id: result.importedPayloadId,
        },
        200,
      );
    }

    return jsonResponse(
      {
        ok: false,
        error: "validation_error",
        details: result.errors,
      },
      422,
    );
  } catch {
    return jsonResponse({ ok: false, error: "service_unavailable" }, 503);
  }
}
