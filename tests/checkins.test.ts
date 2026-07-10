import { describe, expect, it, vi } from "vitest";

import type { CheckinDatabase } from "../src/server/checkins";
import {
  CHECKIN_NOTE_MAX_LENGTH,
  createCheckinSchema,
  createTodayCheckin,
  handleCreateCheckinRequest,
  type CreateCheckinInput,
} from "../src/server/checkins";

const NOW = new Date("2026-07-10T12:34:00.000Z");
const TODAY = new Date("2026-07-10T00:00:00.000Z");

const validInput: CreateCheckinInput = {
  kind: "MORNING",
  energyLevel: "LOW",
  mood: 5,
  fog: 7,
  loneliness: 4,
  selfCriticism: 6,
  digitalControl: 3,
  learningResistance: 8,
  bodyRelationship: 5,
  workConfidence: 4,
  note: "Starting small.",
};

const storedCheckin = {
  id: "checkin-1",
  kind: "MORNING",
  timestamp: NOW,
  energyLevel: "LOW",
  moodScore: 5,
  fogScore: 7,
  lonelinessScore: 4,
  selfCriticismScore: 6,
  digitalControlScore: 3,
  learningResistanceScore: 8,
  bodyRelationshipScore: 5,
  workConfidenceScore: 4,
  note: "Starting small.",
} as const;

describe("check-in validation", () => {
  it.each(["MORNING", "MIDDAY", "EVENING", "MANUAL"] as const)(
    "accepts a complete %s check-in",
    (kind) => {
      expect(
        createCheckinSchema.safeParse({ ...validInput, kind }).success,
      ).toBe(true);
    },
  );

  it.each([
    ["score below range", { mood: 0 }],
    ["score above range", { fog: 11 }],
    ["fractional score", { loneliness: 4.5 }],
    ["missing score", { workConfidence: undefined }],
    ["unknown field", { extra: true }],
    ["oversized note", { note: "x".repeat(CHECKIN_NOTE_MAX_LENGTH + 1) }],
  ])("rejects %s", (_name, change) => {
    expect(
      createCheckinSchema.safeParse({ ...validInput, ...change }).success,
    ).toBe(false);
  });
});

describe("createTodayCheckin", () => {
  it("links the check-in to the signed-in user's current UTC day and syncs energy", async () => {
    const dayLogFindFirst = vi.fn().mockResolvedValue({ id: "day-4" });
    const checkinCreate = vi.fn().mockResolvedValue(storedCheckin);
    const dayLogUpdate = vi.fn().mockResolvedValue({ id: "day-4" });
    const transaction = vi.fn(async (callback) =>
      callback({
        checkin: { create: checkinCreate },
        dayLog: { update: dayLogUpdate },
      }),
    );
    const database = {
      dayLog: { findFirst: dayLogFindFirst },
      $transaction: transaction,
    } as unknown as CheckinDatabase;

    const result = await createTodayCheckin(
      database,
      "user-1",
      validInput,
      NOW,
    );

    expect(dayLogFindFirst).toHaveBeenCalledWith({
      where: {
        date: TODAY,
        cycle: { userId: "user-1", status: "ACTIVE" },
      },
      select: { id: true },
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(checkinCreate).toHaveBeenCalledWith({
      data: {
        dayLogId: "day-4",
        kind: "MORNING",
        timestamp: NOW,
        energyLevel: "LOW",
        moodScore: 5,
        fogScore: 7,
        lonelinessScore: 4,
        selfCriticismScore: 6,
        digitalControlScore: 3,
        learningResistanceScore: 8,
        bodyRelationshipScore: 5,
        workConfidenceScore: 4,
        note: "Starting small.",
      },
      select: expect.any(Object),
    });
    expect(dayLogUpdate).toHaveBeenCalledWith({
      where: { id: "day-4" },
      data: { energyLevel: "LOW" },
      select: { id: true },
    });
    expect(result).toEqual({
      status: "created",
      checkin: {
        id: "checkin-1",
        kind: "MORNING",
        timestamp: NOW.toISOString(),
        energyLevel: "LOW",
        scores: {
          mood: 5,
          fog: 7,
          loneliness: 4,
          selfCriticism: 6,
          digitalControl: 3,
          learningResistance: 8,
          bodyRelationship: 5,
          workConfidence: 4,
        },
        note: "Starting small.",
      },
    });
  });

  it("does not write when the signed-in user has no current active day", async () => {
    const transaction = vi.fn();
    const database = {
      dayLog: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: transaction,
    } as unknown as CheckinDatabase;

    await expect(
      createTodayCheckin(database, "user-1", validInput, NOW),
    ).resolves.toEqual({ status: "not_found" });
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("check-in HTTP boundary", () => {
  function createRequest(body: unknown, headers?: HeadersInit) {
    return new Request("http://localhost/api/checkins", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  }

  const database = {} as CheckinDatabase;

  it("requires a browser session even when a GPT bearer token is present", async () => {
    const getDatabase = vi.fn(() => database);
    const createCheckin = vi.fn();

    await expect(
      handleCreateCheckinRequest(
        createRequest(validInput, {
          Authorization: "Bearer gpt-ingest-token",
        }),
        {
          requireSession: vi
            .fn()
            .mockRejectedValue(new Error("unauthenticated")),
          getDatabase,
          createCheckin,
        },
      ),
    ).rejects.toThrow("unauthenticated");
    expect(getDatabase).not.toHaveBeenCalled();
    expect(createCheckin).not.toHaveBeenCalled();
  });

  it("returns 400 before database access for an invalid payload", async () => {
    const getDatabase = vi.fn(() => database);
    const response = await handleCreateCheckinRequest(
      createRequest({ ...validInput, mood: 0 }),
      {
        requireSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
        getDatabase,
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "invalid_checkin_payload",
    });
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("returns 404 when the signed-in user has no current day", async () => {
    const createCheckin = vi.fn().mockResolvedValue({ status: "not_found" });
    const response = await handleCreateCheckinRequest(
      createRequest(validInput),
      {
        requireSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
        getDatabase: () => database,
        createCheckin,
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "today_not_found",
    });
  });

  it("returns 201 with the created current-day check-in", async () => {
    const created = {
      id: "checkin-1",
      kind: "MORNING",
      timestamp: NOW.toISOString(),
      energyLevel: "LOW",
      scores: {
        mood: 5,
        fog: 7,
        loneliness: 4,
        selfCriticism: 6,
        digitalControl: 3,
        learningResistance: 8,
        bodyRelationship: 5,
        workConfidence: 4,
      },
      note: "Starting small.",
    } as const;
    const createCheckin = vi.fn().mockResolvedValue({
      status: "created",
      checkin: created,
    });
    const response = await handleCreateCheckinRequest(
      createRequest(validInput),
      {
        requireSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
        getDatabase: () => database,
        createCheckin,
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      checkin: created,
    });
    expect(createCheckin).toHaveBeenCalledWith(database, "user-1", validInput);
  });
});
