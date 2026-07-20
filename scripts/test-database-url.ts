import { pathToFileURL } from "node:url";

type TestDatabaseEnvironment = {
  [key: string]: string | undefined;
  DATABASE_URL?: string;
  TEST_DATABASE_URL?: string;
};

const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const testDatabaseName = /(^|[-_])test(?:ing)?($|[-_])/i;

export function assertSafeTestDatabaseUrl(
  environment: TestDatabaseEnvironment = process.env,
): string {
  const rawUrl = environment.TEST_DATABASE_URL?.trim();
  if (!rawUrl) {
    throw new Error("TEST_DATABASE_URL is required for integration tests");
  }
  if (
    environment.DATABASE_URL !== undefined &&
    environment.DATABASE_URL !== rawUrl
  ) {
    throw new Error(
      "DATABASE_URL must equal TEST_DATABASE_URL for integration tests",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL");
  }

  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("TEST_DATABASE_URL must use PostgreSQL");
  }
  if (!loopbackHosts.has(parsed.hostname)) {
    throw new Error("Integration tests require a loopback PostgreSQL host");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (
    !databaseName ||
    databaseName.includes("/") ||
    !testDatabaseName.test(databaseName)
  ) {
    throw new Error(
      "Integration test database name must be clearly test-specific",
    );
  }

  return rawUrl;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  try {
    assertSafeTestDatabaseUrl();
    console.log("Test database URL accepted");
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Unsafe test database URL",
    );
    process.exitCode = 1;
  }
}
