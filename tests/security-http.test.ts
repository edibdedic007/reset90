import { describe, expect, it, vi } from "vitest";

import { CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from "../next.config";
import { getSessionCookieConfig } from "../src/server/auth/config";
import {
  allowedApplicationMethods,
  enforceApplicationMethod,
  handleBrowserMutation,
  writeSafeLogEvent,
} from "../src/server/http/security";

const APP_URL = "https://reset90.example.test";

function jsonBodyAtSize(size: number) {
  const prefix = '{"padding":"';
  const suffix = '"}';
  return `${prefix}${"x".repeat(size - prefix.length - suffix.length)}${suffix}`;
}

function browserRequest(
  body = "{}",
  options: {
    method?: string;
    origin?: string | null;
    contentType?: string | null;
    contentEncoding?: string;
    secFetchSite?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const headers = new Headers(options.headers);
  if (options.origin !== null) {
    headers.set("Origin", options.origin ?? APP_URL);
  }
  if (options.contentType !== null) {
    headers.set("Content-Type", options.contentType ?? "application/json");
  }
  if (options.contentEncoding) {
    headers.set("Content-Encoding", options.contentEncoding);
  }
  if (options.secFetchSite) {
    headers.set("Sec-Fetch-Site", options.secFetchSite);
  }
  return new Request(`${APP_URL}/api/checkins`, {
    method: options.method ?? "POST",
    headers,
    body,
  });
}

function runBrowserMutation(
  request: Request,
  options: {
    session?: { userId: string } | null;
    appUrl?: string;
    handler?: (request: Request) => Promise<Response>;
    logSink?: (message: string) => void;
  } = {},
) {
  return handleBrowserMutation(
    request,
    "POST",
    "checkin.create",
    {
      appUrl: options.appUrl ?? APP_URL,
      getSession: vi
        .fn()
        .mockResolvedValue(
          options.session === undefined
            ? { userId: "user-1" }
            : options.session,
        ),
      logSink: options.logSink,
    },
    async (boundedRequest) =>
      options.handler?.(boundedRequest) ??
      Response.json({ ok: true, body: await boundedRequest.json() }),
  );
}

describe("browser mutation boundary", () => {
  it("accepts exact configured origin with an existing browser user", async () => {
    const response = await runBrowserMutation(browserRequest('{"ok":true}'));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      body: { ok: true },
    });
  });

  it.each([
    ["missing origin", { origin: null }],
    ["foreign origin", { origin: "https://foreign.example.test" }],
    ["cross-site fetch", { secFetchSite: "cross-site" }],
  ])("rejects %s", async (_name, options) => {
    const response = await runBrowserMutation(browserRequest("{}", options));
    expect(response.status).toBe(403);
  });

  it("does not trust Host or forwarded-host headers as canonical origin", async () => {
    const response = await runBrowserMutation(
      browserRequest("{}", {
        origin: "https://foreign.example.test",
        headers: {
          Host: "reset90.example.test",
          "X-Forwarded-Host": "reset90.example.test",
        },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("requires an existing browser session and ignores a machine token", async () => {
    const response = await runBrowserMutation(
      browserRequest("{}", {
        headers: { Authorization: "Bearer machine-token-sentinel" },
      }),
      { session: null },
    );
    expect(response.status).toBe(401);
  });

  it.each([
    ["wrong content type", { contentType: "text/plain" }],
    ["compressed body", { contentEncoding: "gzip" }],
  ])("rejects %s with 415", async (_name, options) => {
    const response = await runBrowserMutation(browserRequest("{}", options));
    expect(response.status).toBe(415);
  });

  it("accepts exactly 16 KiB and rejects one byte over", async () => {
    const exact = await runBrowserMutation(
      browserRequest(jsonBodyAtSize(16 * 1024)),
    );
    expect(exact.status).toBe(200);

    const overHandler = vi.fn();
    const over = await runBrowserMutation(
      browserRequest(jsonBodyAtSize(16 * 1024 + 1)),
      { handler: overHandler },
    );
    expect(over.status).toBe(413);
    expect(overHandler).not.toHaveBeenCalled();
  });

  it("rejects absent-length and forged-length oversized bodies by streamed bytes", async () => {
    const body = jsonBodyAtSize(16 * 1024 + 1);
    const absent = await runBrowserMutation(browserRequest(body));
    expect(absent.status).toBe(413);

    const forged = browserRequest(body, {
      headers: { "Content-Length": "2" },
    });
    const response = await runBrowserMutation(forged);
    expect(response.status).toBe(413);
  });

  it("returns bounded malformed-JSON and unknown-error responses", async () => {
    const malformed = await runBrowserMutation(browserRequest("{"));
    expect(malformed.status).toBe(400);
    await expect(malformed.json()).resolves.toMatchObject({
      ok: false,
      error: "invalid_json",
    });

    const privateSentinel = "PRIVATE_CHECKIN_NOTE_SENTINEL";
    const logs: string[] = [];
    const failed = await runBrowserMutation(
      browserRequest(JSON.stringify({ note: privateSentinel })),
      {
        handler: async () => {
          throw new Error(privateSentinel);
        },
        logSink: (message) => logs.push(message),
      },
    );
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain(privateSentinel);
    expect(logs.join("\n")).not.toContain(privateSentinel);
    expect(logs.join("\n")).toContain('"event":"request_failed"');
    expect(logs.join("\n")).toContain('"operation":"checkin.create"');
    expect(logs.join("\n")).toContain('"http_status":500');
    expect(logs.join("\n")).toMatch(/"correlation_id":"[^"]+"/);
  });
});

describe("application method policy", () => {
  it.each([
    ["/api/gpt/import", "POST"],
    ["/api/checkins", "POST"],
    ["/api/dashboard/today/energy", "PATCH"],
    ["/api/tasks/task-1", "PATCH"],
    ["/api/recovery/start", "POST"],
    ["/api/recovery/actions", "PATCH"],
    ["/api/recovery/complete", "POST"],
    ["/api/context/context-1/pin", "PATCH"],
  ])("rejects GET for mutation route %s", (path, allowedMethod) => {
    const response = enforceApplicationMethod(
      new Request(`${APP_URL}${path}`, { method: "GET" }),
    );
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toContain(allowedMethod);
  });

  it("returns 405 plus Allow for unsupported application methods", () => {
    const response = enforceApplicationMethod(
      new Request(`${APP_URL}/api/tasks/task-1`, { method: "GET" }),
    );
    expect(response?.status).toBe(405);
    expect(response?.headers.get("allow")).toBe("PATCH, OPTIONS");
  });

  it("keeps GET and HEAD read routes allowed and handles OPTIONS centrally", () => {
    expect(
      enforceApplicationMethod(
        new Request(`${APP_URL}/api/dashboard/today`, { method: "HEAD" }),
      ),
    ).toBeNull();
    const options = enforceApplicationMethod(
      new Request(`${APP_URL}/api/dashboard/today`, { method: "OPTIONS" }),
    );
    expect(options?.status).toBe(204);
    expect(options?.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("does not wrap Auth.js protocol endpoints", () => {
    expect(allowedApplicationMethods("/api/auth/session")).toBeNull();
  });
});

describe("security headers, cookies, and safe logger", () => {
  it("publishes compatible headers without HSTS, wildcard sources, or unsafe-eval", () => {
    const headers = new Map<string, string>(
      SECURITY_HEADERS.map((header) => [header.key, header.value]),
    );
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.has("Strict-Transport-Security")).toBe(false);
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("form-action 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("*");
    expect(CONTENT_SECURITY_POLICY).not.toContain("'unsafe-eval'");
  });

  it("uses secure HttpOnly SameSite=Lax production sessions and local HTTP cookies", () => {
    expect(getSessionCookieConfig({ NODE_ENV: "production" })).toEqual({
      name: "__Secure-authjs.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: true },
    });
    expect(getSessionCookieConfig({ NODE_ENV: "development" })).toEqual({
      name: "authjs.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: false },
    });
  });

  it("serializes only allowlisted safe log fields", () => {
    const logs: string[] = [];
    writeSafeLogEvent(
      {
        event: "request_failed",
        operation: "gpt.import",
        code: "internal_error",
        httpStatus: 503,
        correlationId: "correlation-1",
      },
      (message) => logs.push(message),
    );
    expect(JSON.parse(logs[0])).toEqual({
      event: "request_failed",
      operation: "gpt.import",
      code: "internal_error",
      http_status: 503,
      correlation_id: "correlation-1",
    });
  });
});
