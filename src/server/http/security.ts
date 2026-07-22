const BROWSER_MUTATION_MAX_BODY_BYTES = 16 * 1024;

type BodyReadResult =
  | { status: "ok"; text: string }
  | { status: "too_large" }
  | { status: "invalid_encoding" };

export type SafeLogEvent = {
  event: string;
  operation: string;
  code: string;
  httpStatus: number;
  correlationId: string;
  durationMs?: number;
  recordId?: string;
  count?: number;
};

export type SafeLogSink = (message: string) => void;

function bounded(value: string, maximumLength: number) {
  return value.slice(0, maximumLength);
}

export function writeSafeLogEvent(
  event: SafeLogEvent,
  sink: SafeLogSink = (message) => console.error(message),
) {
  sink(
    JSON.stringify({
      event: bounded(event.event, 80),
      operation: bounded(event.operation, 120),
      code: bounded(event.code, 80),
      http_status: event.httpStatus,
      correlation_id: bounded(event.correlationId, 80),
      ...(event.durationMs === undefined
        ? {}
        : { duration_ms: Math.max(0, Math.round(event.durationMs)) }),
      ...(event.recordId === undefined
        ? {}
        : { record_id: bounded(event.recordId, 80) }),
      ...(event.count === undefined
        ? {}
        : { count: Math.max(0, Math.round(event.count)) }),
    }),
  );
}

export async function readBoundedBody(
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

  if (!request.body) return { status: "ok", text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

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

export function isJsonContentType(contentType: string | null) {
  return (
    contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json"
  );
}

export function hasSupportedContentEncoding(contentEncoding: string | null) {
  return (
    contentEncoding === null ||
    contentEncoding.trim().toLowerCase() === "identity"
  );
}

function configuredOrigin(appUrl: string | undefined): string | null {
  if (!appUrl) return null;

  try {
    const url = new URL(appUrl);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function requestOrigin(origin: string | null): string | null {
  if (!origin || origin === "null") return null;
  try {
    const url = new URL(origin);
    if (url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function errorResponse(
  status: number,
  error: string,
  correlationId: string,
  headers: HeadersInit = {},
) {
  return Response.json(
    { ok: false, error },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Correlation-ID": correlationId,
        ...headers,
      },
    },
  );
}

export type BrowserMutationDependencies<TSession extends { userId: string }> = {
  appUrl?: string;
  getSession: () => Promise<TSession | null>;
  logSink?: SafeLogSink;
  now?: () => number;
};

export async function handleSafeApplicationRequest(
  operation: string,
  handler: () => Promise<Response>,
  logSink?: SafeLogSink,
) {
  const correlationId = crypto.randomUUID();
  const startedAt = Date.now();
  try {
    return await handler();
  } catch {
    writeSafeLogEvent(
      {
        event: "request_failed",
        operation,
        code: "internal_error",
        httpStatus: 500,
        correlationId,
        durationMs: Date.now() - startedAt,
      },
      logSink,
    );
    return errorResponse(500, "internal_error", correlationId);
  }
}

export async function handleBrowserMutation<
  TSession extends { userId: string },
>(
  request: Request,
  expectedMethod: "POST" | "PUT" | "PATCH" | "DELETE",
  operation: string,
  dependencies: BrowserMutationDependencies<TSession>,
  handler: (request: Request, session: TSession) => Promise<Response>,
): Promise<Response> {
  const correlationId = crypto.randomUUID();
  const startedAt = dependencies.now?.() ?? Date.now();

  try {
    if (request.method !== expectedMethod) {
      return errorResponse(405, "method_not_allowed", correlationId, {
        Allow: expectedMethod,
      });
    }

    const acceptedOrigin = configuredOrigin(dependencies.appUrl);
    if (!acceptedOrigin) {
      return errorResponse(503, "service_unavailable", correlationId);
    }

    const origin = requestOrigin(request.headers.get("origin"));
    if (origin !== acceptedOrigin) {
      return errorResponse(403, "invalid_origin", correlationId);
    }
    if (
      request.headers.get("sec-fetch-site")?.trim().toLowerCase() ===
      "cross-site"
    ) {
      return errorResponse(403, "cross_site_request", correlationId);
    }
    if (!hasSupportedContentEncoding(request.headers.get("content-encoding"))) {
      return errorResponse(415, "unsupported_content_encoding", correlationId);
    }
    if (!isJsonContentType(request.headers.get("content-type"))) {
      return errorResponse(415, "unsupported_media_type", correlationId);
    }

    const session = await dependencies.getSession();
    if (!session) {
      return errorResponse(401, "unauthorized", correlationId);
    }

    const body = await readBoundedBody(
      request,
      BROWSER_MUTATION_MAX_BODY_BYTES,
    );
    if (body.status === "too_large") {
      return errorResponse(413, "payload_too_large", correlationId);
    }
    if (body.status === "invalid_encoding") {
      return errorResponse(400, "invalid_json", correlationId);
    }
    try {
      JSON.parse(body.text);
    } catch {
      return errorResponse(400, "invalid_json", correlationId);
    }

    const boundedRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: body.text,
    });
    return await handler(boundedRequest, session);
  } catch {
    const finishedAt = dependencies.now?.() ?? Date.now();
    writeSafeLogEvent(
      {
        event: "request_failed",
        operation,
        code: "internal_error",
        httpStatus: 500,
        correlationId,
        durationMs: finishedAt - startedAt,
      },
      dependencies.logSink,
    );
    return errorResponse(500, "internal_error", correlationId);
  }
}

const GET_METHODS = ["GET", "HEAD"] as const;
const ROUTE_METHODS: ReadonlyArray<{
  matches: (pathname: string) => boolean;
  methods: readonly string[];
}> = [
  {
    matches: (pathname) => pathname === "/api/gpt/import",
    methods: ["POST"],
  },
  {
    matches: (pathname) => pathname === "/api/checkins",
    methods: ["POST"],
  },
  {
    matches: (pathname) => pathname === "/api/dashboard/today/energy",
    methods: ["PATCH"],
  },
  {
    matches: (pathname) => /^\/api\/tasks\/[^/]+$/.test(pathname),
    methods: ["PATCH"],
  },
  {
    matches: (pathname) => pathname === "/api/recovery/start",
    methods: ["POST"],
  },
  {
    matches: (pathname) => pathname === "/api/recovery/actions",
    methods: ["PATCH"],
  },
  {
    matches: (pathname) => pathname === "/api/recovery/complete",
    methods: ["POST"],
  },
  {
    matches: (pathname) => pathname === "/api/context",
    methods: [...GET_METHODS, "POST"],
  },
  {
    matches: (pathname) => /^\/api\/context\/[^/]+\/pin$/.test(pathname),
    methods: ["PATCH"],
  },
  {
    matches: (pathname) => pathname === "/api/context/export",
    methods: GET_METHODS,
  },
  {
    matches: (pathname) => pathname.startsWith("/api/export/"),
    methods: GET_METHODS,
  },
  {
    matches: (pathname) =>
      pathname === "/api/dashboard/today" ||
      pathname === "/api/health" ||
      pathname === "/api/ready",
    methods: GET_METHODS,
  },
];

export function allowedApplicationMethods(pathname: string) {
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
    return null;
  }
  return (
    ROUTE_METHODS.find((policy) => policy.matches(pathname))?.methods ?? null
  );
}

export function enforceApplicationMethod(request: Request): Response | null {
  const allowed = allowedApplicationMethods(new URL(request.url).pathname);
  if (!allowed) return null;

  const allow = [...allowed, "OPTIONS"].join(", ");
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { Allow: allow } });
  }
  if (allowed.includes(request.method)) return null;

  return new Response(null, { status: 405, headers: { Allow: allow } });
}
