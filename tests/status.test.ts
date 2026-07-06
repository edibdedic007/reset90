import { describe, expect, it } from "vitest";

import { getHealthStatus, getReadinessStatus } from "../src/lib/status";

describe("status payloads", () => {
  it("returns a minimal health response", () => {
    expect(getHealthStatus()).toEqual({ status: "ok" });
  });

  it("reports database readiness", () => {
    expect(getReadinessStatus(true)).toEqual({
      status: "ready",
      checks: { database: "ready" },
    });
  });

  it("reports database unavailability without details", () => {
    expect(getReadinessStatus(false)).toEqual({
      status: "not_ready",
      checks: { database: "unavailable" },
    });
  });
});
