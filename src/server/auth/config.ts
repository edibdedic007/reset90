export const DEV_AUTHENTIK_SUBJECT = "local-dev-user";
export const DEV_DISPLAY_NAME = "Local Dev";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

const PUBLIC_EXACT_PATHS = new Set([
  "/api/gpt/import",
  "/api/health",
  "/api/ready",
  "/favicon.ico",
]);

const PUBLIC_PREFIXES = ["/api/auth", "/_next/static", "/_next/image"];

export type AuthMode = "dev" | "oidc";

export type AuthEnv = {
  AUTH_MODE?: string;
  AUTH_SECRET?: string;
  AUTH_TRUST_HOST?: string;
  AUTH_AUTHENTIK_ID?: string;
  AUTH_AUTHENTIK_SECRET?: string;
  AUTH_AUTHENTIK_ISSUER?: string;
  NODE_ENV?: string;
};

export type AuthentikProviderConfig = {
  clientId: string;
  clientSecret: string;
  issuer: string;
};

export function getAuthMode(env: AuthEnv = process.env): AuthMode {
  const mode =
    env.AUTH_MODE ?? (env.NODE_ENV === "production" ? "oidc" : "dev");

  if (mode === "dev" || mode === "oidc") {
    return mode;
  }

  throw new Error("AUTH_MODE must be either dev or oidc");
}

export function getAuthSecret(env: AuthEnv = process.env) {
  if (getAuthMode(env) === "dev") {
    return env.AUTH_SECRET ?? "reset90-local-dev-session-secret-not-production";
  }

  const secret = env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be at least 32 characters in oidc mode");
  }

  return secret;
}

export function normalizeIssuer(issuer: string) {
  return issuer.replace(/\/+$/, "");
}

export function getAuthentikProviderConfig(
  env: AuthEnv = process.env,
): AuthentikProviderConfig | null {
  if (getAuthMode(env) !== "oidc") {
    return null;
  }

  const clientId = env.AUTH_AUTHENTIK_ID;
  const clientSecret = env.AUTH_AUTHENTIK_SECRET;
  const issuer = env.AUTH_AUTHENTIK_ISSUER;

  if (!clientId || !clientSecret || !issuer) {
    throw new Error(
      "AUTH_AUTHENTIK_ID, AUTH_AUTHENTIK_SECRET, and AUTH_AUTHENTIK_ISSUER are required in oidc mode",
    );
  }

  return {
    clientId,
    clientSecret,
    issuer: normalizeIssuer(issuer),
  };
}

export function shouldTrustAuthHost(env: AuthEnv = process.env) {
  return env.AUTH_TRUST_HOST === "true";
}

export function shouldUseSecureCookies(env: AuthEnv = process.env) {
  return env.NODE_ENV === "production";
}

export function isPublicAuthPath(pathname: string) {
  if (PUBLIC_EXACT_PATHS.has(pathname)) {
    return true;
  }

  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}
