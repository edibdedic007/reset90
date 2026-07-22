import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDevBrowserIdentity,
  resolveExistingBrowserUser,
  storeBrowserUser,
  type BrowserUserRecord,
} from "../src/server/auth/users";
import {
  getAuthentikProviderConfig,
  getAuthMode,
  getAuthSecret,
  isPublicAuthPath,
  shouldTrustAuthHost,
  shouldUseSecureCookies,
} from "../src/server/auth/config";

async function loadReadOnlyBrowserSession(
  authSession: unknown,
  database: unknown,
) {
  vi.resetModules();
  vi.stubEnv("AUTH_MODE", "oidc");
  const auth = vi.fn().mockResolvedValue(authSession);
  const getPrismaClient = vi.fn(() => database);

  vi.doMock("../src/auth", () => ({ auth }));
  vi.doMock("../src/server/db/client", () => ({ getPrismaClient }));

  const { getReadOnlyBrowserSession, getReadOnlyBrowserSessionResult } =
    await import("../src/server/auth/session");
  return {
    auth,
    getPrismaClient,
    getReadOnlyBrowserSession,
    getReadOnlyBrowserSessionResult,
  };
}

async function loadAuthConfig(database: unknown) {
  vi.resetModules();
  vi.stubEnv("AUTH_MODE", "oidc");
  vi.stubEnv("AUTH_SECRET", "01234567890123456789012345678901");
  vi.stubEnv("AUTH_AUTHENTIK_ID", "reset90");
  vi.stubEnv("AUTH_AUTHENTIK_SECRET", "client-secret");
  vi.stubEnv(
    "AUTH_AUTHENTIK_ISSUER",
    "https://auth.example.com/application/o/reset90/",
  );

  const getPrismaClient = vi.fn(() => database);
  vi.doMock("next-auth", () => ({
    default: vi.fn(() => ({
      handlers: {},
      auth: vi.fn(),
      signIn: vi.fn(),
      signOut: vi.fn(),
    })),
  }));
  vi.doMock("next-auth/providers/authentik", () => ({
    default: vi.fn((config) => ({ id: "authentik", ...config })),
  }));
  vi.doMock("../src/server/db/client", () => ({ getPrismaClient }));

  const { authConfig } = await import("../src/auth");
  return { authConfig, getPrismaClient };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.doUnmock("../src/auth");
  vi.doUnmock("../src/server/db/client");
  vi.doUnmock("next-auth");
  vi.doUnmock("next-auth/providers/authentik");
  vi.resetModules();
});

describe("browser auth config", () => {
  it("defaults to dev auth outside production", () => {
    expect(getAuthMode({ NODE_ENV: "development" })).toBe("dev");
  });

  it("defaults to OIDC auth in production", () => {
    expect(getAuthMode({ NODE_ENV: "production" })).toBe("oidc");
  });

  it("rejects unknown auth modes", () => {
    expect(() => getAuthMode({ AUTH_MODE: "password" })).toThrow(
      "AUTH_MODE must be either dev or oidc",
    );
  });

  it("requires a strong Auth.js secret in OIDC mode", () => {
    expect(() =>
      getAuthSecret({ AUTH_MODE: "oidc", AUTH_SECRET: "short" }),
    ).toThrow("AUTH_SECRET must be at least 32 characters in oidc mode");
  });

  it("normalizes Authentik issuer to exactly one trailing slash", () => {
    for (const issuer of [
      "https://auth.example.com/application/o/reset90",
      "https://auth.example.com/application/o/reset90/",
    ]) {
      expect(
        getAuthentikProviderConfig({
          AUTH_MODE: "oidc",
          AUTH_SECRET: "01234567890123456789012345678901",
          AUTH_AUTHENTIK_ID: "reset90",
          AUTH_AUTHENTIK_SECRET: "client-secret",
          AUTH_AUTHENTIK_ISSUER: issuer,
        }),
      ).toEqual({
        clientId: "reset90",
        clientSecret: "client-secret",
        issuer: "https://auth.example.com/application/o/reset90/",
      });
    }
  });

  it("keeps GPT ingest outside browser auth", () => {
    expect(isPublicAuthPath("/api/gpt/import")).toBe(true);
    expect(isPublicAuthPath("/api/checkins")).toBe(false);
  });

  it("uses secure cookies in production and trusts host only when configured", () => {
    expect(shouldUseSecureCookies({ NODE_ENV: "production" })).toBe(true);
    expect(shouldUseSecureCookies({ NODE_ENV: "development" })).toBe(false);
    expect(shouldTrustAuthHost({ AUTH_TRUST_HOST: "true" })).toBe(true);
    expect(shouldTrustAuthHost({ AUTH_TRUST_HOST: "false" })).toBe(false);
  });
});

describe("browser user persistence", () => {
  it("upserts the dev browser identity by Authentik subject", async () => {
    const identity = createDevBrowserIdentity();
    const record: BrowserUserRecord = {
      id: "user-1",
      authentikSubject: identity.authentikSubject,
      email: identity.email,
      displayName: identity.displayName,
    };
    const upsert = vi.fn().mockResolvedValue(record);

    const session = await storeBrowserUser({ user: { upsert } }, identity);

    expect(upsert).toHaveBeenCalledWith({
      where: { authentikSubject: "local-dev-user" },
      create: {
        authentikSubject: "local-dev-user",
        email: null,
        displayName: "Local Dev",
      },
      update: {
        email: null,
        displayName: "Local Dev",
      },
    });
    expect(session).toEqual({
      userId: "user-1",
      authentikSubject: "local-dev-user",
      email: null,
      displayName: "Local Dev",
      isDev: true,
    });
  });

  it("resolves an existing browser user without calling persistence", async () => {
    const identity = createDevBrowserIdentity();
    const record: BrowserUserRecord = {
      id: "user-1",
      authentikSubject: identity.authentikSubject,
      email: "stored@example.test",
      displayName: "Stored Name",
    };
    const findUnique = vi.fn().mockResolvedValue(record);
    const upsert = vi.fn();
    const database = { user: { findUnique, upsert } };

    await expect(
      resolveExistingBrowserUser(database, identity),
    ).resolves.toEqual({
      userId: "user-1",
      authentikSubject: "local-dev-user",
      email: "stored@example.test",
      displayName: "Stored Name",
      isDev: true,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { authentikSubject: "local-dev-user" },
      select: {
        id: true,
        authentikSubject: true,
        email: true,
        displayName: true,
      },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns null for a missing browser user without creating one", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const upsert = vi.fn();
    const database = { user: { findUnique, upsert } };

    await expect(
      resolveExistingBrowserUser(database, createDevBrowserIdentity()),
    ).resolves.toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("Authentik authentication lifecycle provisioning", () => {
  it("uses one stable provider subject across transient Auth.js users and session reads", async () => {
    const stableSubject = "stable-authentik-subject";
    const storedUsers = new Map<string, BrowserUserRecord>();
    const upsert = vi.fn().mockImplementation(({ where, create, update }) => {
      const existing = storedUsers.get(where.authentikSubject);
      const storedUser = existing
        ? { ...existing, ...update }
        : { id: `user-${storedUsers.size + 1}`, ...create };
      storedUsers.set(where.authentikSubject, storedUser);
      return storedUser;
    });
    const findUnique = vi.fn(({ where }) =>
      storedUsers.get(where.authentikSubject),
    );
    const database = { user: { upsert, findUnique } };
    const { authConfig, getPrismaClient } = await loadAuthConfig(database);
    const account = {
      provider: "authentik",
      providerAccountId: stableSubject,
      type: "oidc" as const,
    };

    await expect(
      authConfig.callbacks.signIn({
        user: {
          id: "transient-user-a",
          email: "browser@example.test",
          name: "Browser User",
        },
        account,
        profile: undefined,
        email: undefined,
        credentials: undefined,
      }),
    ).resolves.toBe(true);

    await expect(
      authConfig.callbacks.signIn({
        user: {
          id: "transient-user-b",
          email: "updated@example.test",
          name: "Updated Browser User",
        },
        account,
        profile: undefined,
        email: undefined,
        credentials: undefined,
      }),
    ).resolves.toBe(true);

    expect(getPrismaClient).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenNthCalledWith(1, {
      where: { authentikSubject: stableSubject },
      create: {
        authentikSubject: stableSubject,
        email: "browser@example.test",
        displayName: "Browser User",
      },
      update: {
        email: "browser@example.test",
        displayName: "Browser User",
      },
    });
    expect(upsert).toHaveBeenNthCalledWith(2, {
      where: { authentikSubject: stableSubject },
      create: {
        authentikSubject: stableSubject,
        email: "updated@example.test",
        displayName: "Updated Browser User",
      },
      update: {
        email: "updated@example.test",
        displayName: "Updated Browser User",
      },
    });
    expect(storedUsers.size).toBe(1);
    expect(storedUsers.get(stableSubject)).toEqual({
      id: "user-1",
      authentikSubject: stableSubject,
      email: "updated@example.test",
      displayName: "Updated Browser User",
    });

    const initialToken = await authConfig.callbacks.jwt({
      token: {},
      user: {
        id: "transient-user-a",
        email: "browser@example.test",
        name: "Browser User",
      },
      account,
      profile: undefined,
      trigger: "signIn",
      isNewUser: true,
    });
    expect(initialToken.authentikSubject).toBe(stableSubject);

    const laterToken = await authConfig.callbacks.jwt({
      token: initialToken,
      user: {
        id: "transient-user-b",
        email: "updated@example.test",
        name: "Updated Browser User",
      },
      account: null,
      profile: undefined,
      trigger: undefined,
      isNewUser: false,
    });
    expect(laterToken.authentikSubject).toBe(stableSubject);

    const authenticatedSession = await authConfig.callbacks.session({
      session: {
        user: {
          id: "user-1",
          email: "updated@example.test",
          emailVerified: null,
          name: "Updated Browser User",
          authentikSubject: "",
        },
        expires: new Date("2099-01-01T00:00:00.000Z") as Date & string,
        sessionToken: "session-token",
        userId: "user-1",
      },
      token: laterToken,
      user: {
        id: "user-1",
        email: "updated@example.test",
        emailVerified: null,
        name: "Updated Browser User",
      },
      newSession: undefined,
    });
    expect(authenticatedSession.user.authentikSubject).toBe(stableSubject);

    const { getReadOnlyBrowserSession } = await loadReadOnlyBrowserSession(
      authenticatedSession,
      database,
    );
    await expect(getReadOnlyBrowserSession()).resolves.toEqual({
      userId: "user-1",
      authentikSubject: stableSubject,
      email: "updated@example.test",
      displayName: "Updated Browser User",
      isDev: false,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { authentikSubject: stableSubject },
      select: {
        id: true,
        authentikSubject: true,
        email: true,
        displayName: true,
      },
    });
    expect(upsert).toHaveBeenCalledTimes(2);
  });

  it("fails closed when Authentik omits the provider account subject", async () => {
    const upsert = vi.fn();
    const { authConfig, getPrismaClient } = await loadAuthConfig({
      user: { upsert },
    });

    await expect(
      authConfig.callbacks.signIn({
        user: {
          id: "transient-user",
          email: "browser@example.test",
          name: "Browser User",
        },
        account: {
          provider: "authentik",
          providerAccountId: "   ",
          type: "oidc",
        },
        profile: undefined,
        email: undefined,
        credentials: undefined,
      }),
    ).resolves.toBe(false);
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("denies sign-in and logs only fixed metadata when provisioning fails", async () => {
    const privateSentinel = "PRIVATE_PROVISIONING_SENTINEL";
    const testEmail = "private-browser@example.test";
    const providerSubject = "private-authentik-provider-subject";
    const provisioningError = Object.assign(
      new Error(
        `${privateSentinel}: PrismaClientKnownRequestError P2002 INSERT INTO users constraint users_authentikSubject_key`,
      ),
      {
        code: "P2002",
        name: "PrismaClientKnownRequestError",
        stack: `PrismaClientKnownRequestError: ${privateSentinel}\n    at provisionUser (private-query.ts:42:7)`,
      },
    );
    const upsert = vi.fn().mockRejectedValue(provisioningError);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { authConfig } = await loadAuthConfig({ user: { upsert } });

    await expect(
      authConfig.callbacks.signIn({
        user: {
          id: "transient-user",
          email: testEmail,
          name: "Private Browser User",
        },
        account: {
          provider: "authentik",
          providerAccountId: providerSubject,
          type: "oidc",
        },
        profile: undefined,
        email: undefined,
        credentials: undefined,
      }),
    ).resolves.toBe(false);

    expect(upsert).toHaveBeenCalledWith({
      where: { authentikSubject: providerSubject },
      create: {
        authentikSubject: providerSubject,
        email: testEmail,
        displayName: "Private Browser User",
      },
      update: {
        email: testEmail,
        displayName: "Private Browser User",
      },
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith(
      JSON.stringify({
        event: "authentication_provisioning_failed",
        operation: "authentik_sign_in",
        code: "user_provisioning_failed",
        http_status: 403,
        correlation_id: "not_available",
      }),
    );

    const logged = consoleError.mock.calls
      .map(([message]) => String(message))
      .join("\n");
    for (const privateValue of [
      privateSentinel,
      testEmail,
      providerSubject,
      "PrismaClientKnownRequestError",
      "P2002",
      "INSERT INTO",
      "users_authentikSubject_key",
      "at provisionUser",
    ]) {
      expect(logged).not.toContain(privateValue);
    }
  });
});

describe("read-only browser session resolution", () => {
  const authenticatedSession = {
    user: {
      authentikSubject: "authentik-user",
      email: "browser@example.test",
      name: "Browser User",
    },
  };

  it("returns an existing user through lookup without persistence", async () => {
    const record: BrowserUserRecord = {
      id: "user-1",
      authentikSubject: "authentik-user",
      email: "stored@example.test",
      displayName: "Stored Name",
    };
    const findUnique = vi.fn().mockResolvedValue(record);
    const upsert = vi.fn();
    const { getReadOnlyBrowserSession } = await loadReadOnlyBrowserSession(
      authenticatedSession,
      { user: { findUnique, upsert } },
    );

    await expect(getReadOnlyBrowserSession()).resolves.toEqual({
      userId: "user-1",
      authentikSubject: "authentik-user",
      email: "stored@example.test",
      displayName: "Stored Name",
      isDev: false,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { authentikSubject: "authentik-user" },
      select: {
        id: true,
        authentikSubject: true,
        email: true,
        displayName: true,
      },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns null for a missing user without persistence", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const upsert = vi.fn();
    const { getReadOnlyBrowserSession } = await loadReadOnlyBrowserSession(
      authenticatedSession,
      { user: { findUnique, upsert } },
    );

    await expect(getReadOnlyBrowserSession()).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledWith({
      where: { authentikSubject: "authentik-user" },
      select: {
        id: true,
        authentikSubject: true,
        email: true,
        displayName: true,
      },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("distinguishes an authenticated identity with no application user", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const upsert = vi.fn();
    const { getReadOnlyBrowserSessionResult } =
      await loadReadOnlyBrowserSession(authenticatedSession, {
        user: { findUnique, upsert },
      });

    await expect(getReadOnlyBrowserSessionResult()).resolves.toEqual({
      status: "user_not_found",
    });
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("keeps unauthenticated resolution null without database access", async () => {
    const findUnique = vi.fn();
    const upsert = vi.fn();
    const { auth, getPrismaClient, getReadOnlyBrowserSession } =
      await loadReadOnlyBrowserSession(null, {
        user: { findUnique, upsert },
      });

    await expect(getReadOnlyBrowserSession()).resolves.toBeNull();
    expect(auth).toHaveBeenCalledTimes(1);
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("distinguishes an unauthenticated browser without database access", async () => {
    const findUnique = vi.fn();
    const upsert = vi.fn();
    const { auth, getPrismaClient, getReadOnlyBrowserSessionResult } =
      await loadReadOnlyBrowserSession(null, {
        user: { findUnique, upsert },
      });

    await expect(getReadOnlyBrowserSessionResult()).resolves.toEqual({
      status: "unauthenticated",
    });
    expect(auth).toHaveBeenCalledTimes(1);
    expect(getPrismaClient).not.toHaveBeenCalled();
    expect(findUnique).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });
});
