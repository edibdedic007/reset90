import { describe, expect, it, vi } from "vitest";

import {
  createDevBrowserIdentity,
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
});
