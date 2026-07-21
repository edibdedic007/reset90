import { describe, expect, it } from "vitest";

import { assertSafeTestDatabaseUrl } from "../scripts/test-database-url";

const safeUrl =
  "postgresql://reset90_test:synthetic@127.0.0.1:55432/reset90_test";

describe("test database URL guard", () => {
  it("accepts a matching loopback test database", () => {
    expect(
      assertSafeTestDatabaseUrl({
        DATABASE_URL: safeUrl,
        TEST_DATABASE_URL: safeUrl,
      }),
    ).toBe(safeUrl);
  });

  it.each([
    ["missing URL", {}],
    [
      "normal development database",
      {
        DATABASE_URL: "postgresql://reset90:secret@127.0.0.1:5432/reset90",
        TEST_DATABASE_URL: "postgresql://reset90:secret@127.0.0.1:5432/reset90",
      },
    ],
    [
      "remote host",
      {
        DATABASE_URL:
          "postgresql://reset90_test:secret@db.example.com/reset90_test",
        TEST_DATABASE_URL:
          "postgresql://reset90_test:secret@db.example.com/reset90_test",
      },
    ],
    [
      "mismatched application URL",
      {
        DATABASE_URL: "postgresql://reset90:secret@127.0.0.1:5432/reset90",
        TEST_DATABASE_URL: safeUrl,
      },
    ],
  ])("rejects %s", (_name, environment) => {
    expect(() => assertSafeTestDatabaseUrl(environment)).toThrow();
  });
});
