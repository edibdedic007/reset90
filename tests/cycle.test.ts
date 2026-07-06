import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "../src/generated/prisma/client";
import {
  buildDayLogSeeds,
  calculateDayNumber,
  calculatePhase,
  DEFAULT_PHASES,
  findActiveCycle,
} from "../src/server/db/cycle";

describe("reset cycle calculations", () => {
  it("calculates day numbers from UTC calendar dates", () => {
    const startDate = new Date("2026-07-01T00:00:00Z");

    expect(
      calculateDayNumber(startDate, new Date("2026-07-01T23:59:59Z")),
    ).toBe(1);
    expect(
      calculateDayNumber(startDate, new Date("2026-07-02T12:00:00Z")),
    ).toBe(2);
    expect(
      calculateDayNumber(startDate, new Date("2026-09-28T12:00:00Z")),
    ).toBe(90);
  });

  it.each([
    [1, "Clear the Fog"],
    [30, "Clear the Fog"],
    [31, "Rebuild Momentum"],
    [60, "Rebuild Momentum"],
    [61, "Prove Continuation"],
    [90, "Prove Continuation"],
  ])("maps day %i to %s", (dayNumber, expectedPhase) => {
    expect(calculatePhase(dayNumber).name).toBe(expectedPhase);
  });

  it("rejects day numbers outside the cycle", () => {
    expect(() => calculatePhase(0)).toThrow(RangeError);
    expect(() => calculatePhase(91)).toThrow(RangeError);
  });

  it("builds exactly 90 unique day logs", () => {
    const phases = DEFAULT_PHASES.map((phase, index) => ({
      ...phase,
      id: `phase-${index + 1}`,
    }));
    const dayLogs = buildDayLogSeeds(new Date("2026-07-01T00:00:00Z"), phases);

    expect(dayLogs).toHaveLength(90);
    expect(new Set(dayLogs.map(({ dayNumber }) => dayNumber)).size).toBe(90);
    expect(new Set(dayLogs.map(({ date }) => date.toISOString())).size).toBe(
      90,
    );
  });
});

describe("active cycle lookup", () => {
  it("queries latest active cycle with ordered phases", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "cycle-1" });
    const prisma = { resetCycle: { findFirst } } as unknown as PrismaClient;

    await expect(findActiveCycle(prisma, "user-1")).resolves.toEqual({
      id: "cycle-1",
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", status: "ACTIVE" },
      orderBy: { startDate: "desc" },
      include: { phases: { orderBy: { dayStart: "asc" } } },
    });
  });
});
