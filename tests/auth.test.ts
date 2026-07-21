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

  it("trims Authentik issuer trailing slash", () => {
    expect(
      getAuthentikProviderConfig({
        AUTH_MODE: "oidc",
        AUTH_SECRET: "01234567890123456789012345678901",
        AUTH_AUTHENTIK_ID: "reset90",
        AUTH_AUTHENTIK_SECRET: "client-secret",
        AUTH_AUTHENTIK_ISSUER:
          "https://auth.example.com/application/o/reset90/",
      }),
    ).toEqual({
      clientId: "reset90",
      clientSecret: "client-secret",
      issuer: "https://auth.example.com/application/o/reset90",
    });
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
  const authenticatedSession = {
    user: {
      authentikSubject: "authentik-user",
      email: "browser@example.test",
      name: "Browser User",
    },
  };

  it("provisions a missing application user during sign-in, then reads without writing", async () => {
    let storedUser: BrowserUserRecord | null = null;
    const upsert = vi.fn().mockImplementation(({ create }) => {
      storedUser = { id: "user-1", ...create };
      return storedUser;
    });
    const findUnique = vi.fn(() => storedUser);
    const database = { user: { upsert, findUnique } };
    const { authConfig, getPrismaClient } = await loadAuthConfig(database);

    await expect(
      authConfig.callbacks.signIn({
        user: {
          id: "authentik-user",
          email: "browser@example.test",
          name: "Browser User",
        },
        account: null,
        profile: undefined,
        email: undefined,
        credentials: undefined,
      }),
    ).resolves.toBe(true);
    expect(getPrismaClient).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: { authentikSubject: "authentik-user" },
      create: {
        authentikSubject: "authentik-user",
        email: "browser@example.test",
        displayName: "Browser User",
      },
      update: {
        email: "browser@example.test",
        displayName: "Browser User",
      },
    });

    const { getReadOnlyBrowserSession } = await loadReadOnlyBrowserSession(
      authenticatedSession,
      database,
    );
    await expect(getReadOnlyBrowserSession()).resolves.toEqual({
      userId: "user-1",
      authentikSubject: "authentik-user",
      email: "browser@example.test",
      displayName: "Browser User",
      isDev: false,
    });
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("updates an existing subject during sign-in without duplicate creation", async () => {
    const existing: BrowserUserRecord = {
      id: "user-1",
      authentikSubject: "authentik-user",
      email: "old@example.test",
      displayName: "Old Name",
    };
    const upsert = vi.fn().mockResolvedValue({
      ...existing,
      email: "browser@example.test",
      displayName: "Browser User",
    });
    const { authConfig } = await loadAuthConfig({ user: { upsert } });

    await expect(
      authConfig.callbacks.signIn({
        user: {
          id: "authentik-user",
          email: "browser@example.test",
          name: "Browser User",
        },
        account: null,
        profile: undefined,
        email: undefined,
        credentials: undefined,
      }),
    ).resolves.toBe(true);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { authentikSubject: "authentik-user" },
      }),
    );
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
