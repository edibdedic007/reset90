import { describe, expect, it } from "vitest";

import { calculateDayStatus } from "../src/server/recovery/day-status";

const NOW = new Date("2026-07-10T12:00:00.000Z");
const TODAY = new Date("2026-07-10T00:00:00.000Z");

function task(
  tier: "NON_NEGOTIABLE" | "MINIMUM" | "STANDARD" | "IDEAL",
  completed = true,
  skipped = false,
) {
  return {
    tier,
    completedAt: completed ? NOW : null,
    skippedAt: skipped ? NOW : null,
  } as const;
}

function calculate(
  tasks: ReturnType<typeof task>[],
  options: Partial<Parameters<typeof calculateDayStatus>[0]> = {},
) {
  return calculateDayStatus({
    date: TODAY,
    now: NOW,
    previousStatus: null,
    tasks,
    recovery: null,
    ...options,
  });
}

describe("calculateDayStatus", () => {
  it("calculates minimum, standard, and ideal as alternative normal modes", () => {
    expect(calculate([task("NON_NEGOTIABLE"), task("MINIMUM")])).toBe("YELLOW");
    expect(calculate([task("NON_NEGOTIABLE"), task("STANDARD")])).toBe("GREEN");
    expect(calculate([task("NON_NEGOTIABLE"), task("IDEAL")])).toBe("GREEN");
  });

  it("requires non-empty, fully completed qualifying tiers and rejects skips", () => {
    expect(calculate([task("NON_NEGOTIABLE")])).toBe("UNSET");
    expect(
      calculate([
        task("NON_NEGOTIABLE"),
        task("MINIMUM"),
        task("MINIMUM", false),
      ]),
    ).toBe("UNSET");
    expect(
      calculate([task("NON_NEGOTIABLE"), task("MINIMUM", true, true)]),
    ).toBe("UNSET");
  });

  it("calculates credited and uncredited recovery with status precedence", () => {
    expect(
      calculate([], {
        recovery: { completedAt: NOW, creditConsumedAt: NOW },
      }),
    ).toBe("BLUE");
    expect(
      calculate([], {
        recovery: { completedAt: NOW, creditConsumedAt: null },
      }),
    ).toBe("YELLOW");
    expect(
      calculate([task("NON_NEGOTIABLE"), task("STANDARD")], {
        recovery: { completedAt: NOW, creditConsumedAt: NOW },
      }),
    ).toBe("GREEN");
    expect(
      calculate([task("NON_NEGOTIABLE"), task("MINIMUM")], {
        recovery: { completedAt: NOW, creditConsumedAt: NOW },
      }),
    ).toBe("BLUE");
  });

  it("makes a normal completion after RED or BLUE a GOLD comeback only", () => {
    expect(
      calculate([task("NON_NEGOTIABLE"), task("MINIMUM")], {
        previousStatus: "RED",
      }),
    ).toBe("GOLD");
    expect(
      calculate([task("NON_NEGOTIABLE"), task("STANDARD")], {
        previousStatus: "BLUE",
      }),
    ).toBe("GOLD");
    expect(
      calculate([], {
        previousStatus: "RED",
        recovery: { completedAt: NOW, creditConsumedAt: NOW },
      }),
    ).toBe("BLUE");
    expect(
      calculate([task("NON_NEGOTIABLE"), task("MINIMUM")], {
        previousStatus: "GOLD",
      }),
    ).toBe("YELLOW");
  });

  it("keeps current incomplete and future days unset, only elapsed unqualified days red", () => {
    expect(calculate([])).toBe("UNSET");
    expect(calculate([], { date: new Date("2026-07-11T00:00:00.000Z") })).toBe(
      "UNSET",
    );
    expect(calculate([], { date: new Date("2026-07-09T00:00:00.000Z") })).toBe(
      "RED",
    );
  });
});
