import { describe, expect, it } from "vitest";

import { getHealthStatus, getReadinessStatus } from "../src/lib/status";

describe("status payloads", () => {
  it("returns a minimal health response", () => {
    expect(getHealthStatus()).toEqual({ status: "ok" });
  });

  it("reports database readiness as not configured", () => {
    expect(getReadinessStatus()).toEqual({
      status: "not_ready",
      checks: { database: "not_configured" },
    });
  });
});
