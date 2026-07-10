import { describe, expect, it } from "vitest";

import { RECOVERY_COPY } from "../src/server/recovery/actions";

describe("recovery copy", () => {
  it("does not use prohibited shame language", () => {
    const copy = Object.values(RECOVERY_COPY).join(" ").toLowerCase();

    expect(copy).not.toContain("you failed");
    expect(copy).not.toContain("wasted day");
    expect(copy).not.toContain("ruined streak");
    expect(copy).not.toContain("start over");
    expect(copy).not.toContain("you are behind");
  });
});
