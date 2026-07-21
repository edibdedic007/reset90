import { pathToFileURL } from "node:url";

import { Client } from "pg";

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

export async function assertEmptyTestDatabase(
  environment: TestDatabaseEnvironment = process.env,
): Promise<string> {
  const databaseUrl = assertSafeTestDatabaseUrl(environment);
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    const evidence = await client.query<{ evidence: string }>(`
      SELECT evidence
      FROM (
        SELECT format('%I.%I (%s)', namespace.nspname, relation.relname, relation.relkind) AS evidence
        FROM pg_catalog.pg_class AS relation
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname <> 'information_schema'
          AND namespace.nspname !~ '^pg_'
          AND relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')

        UNION ALL

        SELECT format('%I.%I (type)', namespace.nspname, database_type.typname) AS evidence
        FROM pg_catalog.pg_type AS database_type
        INNER JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = database_type.typnamespace
        WHERE namespace.nspname <> 'information_schema'
          AND namespace.nspname !~ '^pg_'
          AND database_type.typtype IN ('d', 'e')

        UNION ALL

        SELECT format('%I (schema)', namespace.nspname) AS evidence
        FROM pg_catalog.pg_namespace AS namespace
        WHERE namespace.nspname <> 'public'
          AND namespace.nspname <> 'information_schema'
          AND namespace.nspname !~ '^pg_'
      ) AS existing_objects
      LIMIT 1
    `);

    if (evidence.rowCount !== 0) {
      throw new Error(
        "Test database must be empty before migrations; existing database objects found",
      );
    }
  } finally {
    await client.end();
  }

  return databaseUrl;
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void (async () => {
    try {
      if (process.argv.includes("--require-empty")) {
        await assertEmptyTestDatabase();
        console.log("Empty test database accepted");
      } else {
        assertSafeTestDatabaseUrl();
        console.log("Test database URL accepted");
      }
    } catch (error) {
      console.error(
        error instanceof Error ? error.message : "Unsafe test database URL",
      );
      process.exitCode = 1;
    }
  })();
}
