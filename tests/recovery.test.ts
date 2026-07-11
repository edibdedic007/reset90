import { describe, expect, it, vi } from "vitest";

import {
  RECOVERY_ACTIONS,
  recoveryActionsMeetRequirements,
} from "../src/server/recovery/actions";
import {
  completeTodayRecovery,
  parseRecoveryActionIds,
  startTodayRecovery,
  updateTodayRecoveryActions,
  type RecoveryDatabase,
} from "../src/server/recovery/service";
import {
  handleCompleteRecoveryRequest,
  handleStartRecoveryRequest,
  handleUpdateRecoveryActionsRequest,
} from "../src/server/recovery/http";

const NOW = new Date("2026-07-10T12:00:00.000Z");
const TODAY = new Date("2026-07-10T00:00:00.000Z");
const validActionIds = [
  "water_or_basic_reset",
  "tiny_focus_action",
  "reflection_or_note",
] as const;

type StoredEvent = {
  id: string;
  cycleId: string;
  selectedActionIds: string[];
  completedAt: Date | null;
  creditConsumedAt: Date | null;
};

function createRecoveryDatabase({
  event = null as StoredEvent | null,
  creditsUsed = 0,
  creditLimit = 6,
  failStatusWrite = false,
} = {}) {
  let stored = event;
  const dayLogFindFirst = vi.fn().mockResolvedValue({
    id: "day-1",
    cycleId: "cycle-1",
  });
  const outerRecoveryFindUnique = vi.fn(async () => stored);
  const resetCycleUpdate = vi.fn();
  const statusUpdate = vi.fn().mockResolvedValue({ id: "day-1" });
  let transactionChain = Promise.resolve();
  const transaction = vi.fn(async (callback) => {
    const previousTransaction = transactionChain;
    let releaseTransaction: () => void;
    transactionChain = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    await previousTransaction;
    let draft = stored
      ? { ...stored, selectedActionIds: [...stored.selectedActionIds] }
      : null;
    const tx = {
      recoveryEvent: {
        findUnique: vi.fn(async () =>
          draft
            ? { ...draft, cycle: { recoveryCreditLimit: creditLimit } }
            : null,
        ),
        upsert: vi.fn(async ({ create }) => {
          if (!draft) {
            draft = {
              id: "event-1",
              cycleId: create.cycleId,
              selectedActionIds: [],
              completedAt: null,
              creditConsumedAt: null,
            };
          }
          return draft;
        }),
        count: vi.fn(
          async () => creditsUsed + (draft?.creditConsumedAt ? 1 : 0),
        ),
        updateMany: vi.fn(async ({ data }) => {
          if (!draft) {
            throw new Error("test draft missing");
          }
          draft.selectedActionIds = data.selectedActionIds;
          if ("completedAt" in data) {
            draft.completedAt = data.completedAt;
          }
          if ("creditConsumedAt" in data) {
            draft.creditConsumedAt = data.creditConsumedAt;
          }
          return { count: 1 };
        }),
      },
      dayLog: {
        findUnique: vi.fn(async () => ({
          id: "day-1",
          cycleId: "cycle-1",
          date: TODAY,
          status: "UNSET",
          dailyPlan: { tasks: [] },
          recoveryEvent: draft,
        })),
        findFirst: vi.fn().mockResolvedValue(null),
        update: failStatusWrite
          ? vi.fn().mockRejectedValue(new Error("status persistence failed"))
          : statusUpdate,
      },
    };

    try {
      const result = await callback(tx);
      stored = draft;
      return result;
    } finally {
      releaseTransaction!();
    }
  });

  return {
    database: {
      dayLog: { findFirst: dayLogFindFirst, findMany: vi.fn() },
      recoveryEvent: {
        findUnique: outerRecoveryFindUnique,
      },
      resetCycle: { update: resetCycleUpdate },
      $transaction: transaction,
    } as unknown as RecoveryDatabase,
    dayLogFindFirst,
    outerRecoveryFindUnique,
    resetCycleUpdate,
    statusUpdate,
    transaction,
    stored: () => stored,
  };
}

describe("recovery action validation", () => {
  it("requires three configured actions with physical and forward coverage", () => {
    expect(recoveryActionsMeetRequirements(validActionIds)).toBe(true);
    expect(
      recoveryActionsMeetRequirements([
        RECOVERY_ACTIONS[0].id,
        RECOVERY_ACTIONS[3].id,
      ]),
    ).toBe(false);
    expect(
      recoveryActionsMeetRequirements([
        RECOVERY_ACTIONS[0].id,
        RECOVERY_ACTIONS[1].id,
        RECOVERY_ACTIONS[3].id,
      ]),
    ).toBe(false);
    expect(
      parseRecoveryActionIds([...validActionIds, validActionIds[0]]),
    ).toBeNull();
    expect(parseRecoveryActionIds(["not_configured"])).toBeNull();
  });
});

describe("recovery persistence", () => {
  it("starts one recovery event per current user day and returns it idempotently", async () => {
    const { database } = createRecoveryDatabase();

    await expect(
      startTodayRecovery(database, "user-1", NOW),
    ).resolves.toMatchObject({
      status: "started",
      event: { id: "event-1" },
    });
    await expect(
      startTodayRecovery(database, "user-1", NOW),
    ).resolves.toMatchObject({
      status: "existing",
      event: { id: "event-1" },
    });
  });

  it("completes once, consumes one available credit, and keeps duplicate completion immutable", async () => {
    const { database, resetCycleUpdate, statusUpdate, stored } =
      createRecoveryDatabase({
        event: {
          id: "event-1",
          cycleId: "cycle-1",
          selectedActionIds: [],
          completedAt: null,
          creditConsumedAt: null,
        },
      });

    const [first, second] = await Promise.all([
      completeTodayRecovery(database, "user-1", validActionIds, NOW),
      completeTodayRecovery(database, "user-1", validActionIds, NOW),
    ]);

    expect(first).toMatchObject({ status: "completed", dayStatus: "BLUE" });
    expect(second).toMatchObject({
      status: "already_completed",
      dayStatus: "BLUE",
    });
    expect(stored()?.creditConsumedAt).toEqual(NOW);
    expect(first).toMatchObject({
      recoveryCredits: {
        recoveryCreditsUsed: 1,
        recoveryCreditsRemaining: 5,
      },
    });
    expect(second).toMatchObject({
      recoveryCredits: {
        recoveryCreditsUsed: 1,
        recoveryCreditsRemaining: 5,
      },
    });
    expect(resetCycleUpdate).not.toHaveBeenCalled();
    expect(statusUpdate).toHaveBeenCalledWith({
      where: { id: "day-1" },
      data: { status: "BLUE" },
      select: { id: true },
    });
  });

  it("allows recovery without an available credit and returns YELLOW", async () => {
    const { database, stored } = createRecoveryDatabase({
      creditsUsed: 6,
      event: {
        id: "event-1",
        cycleId: "cycle-1",
        selectedActionIds: [],
        completedAt: null,
        creditConsumedAt: null,
      },
    });

    await expect(
      completeTodayRecovery(database, "user-1", validActionIds, NOW),
    ).resolves.toMatchObject({ status: "completed", dayStatus: "YELLOW" });
    expect(stored()?.creditConsumedAt).toBeNull();

    await expect(
      completeTodayRecovery(database, "user-1", validActionIds, NOW),
    ).resolves.toMatchObject({
      recoveryCredits: {
        recoveryCreditsUsed: 6,
        recoveryCreditsRemaining: 0,
      },
    });
  });

  it("persists partial actions for reload and rejects edits after completion", async () => {
    const { database, stored } = createRecoveryDatabase({
      event: {
        id: "event-1",
        cycleId: "cycle-1",
        selectedActionIds: [],
        completedAt: null,
        creditConsumedAt: null,
      },
    });
    const partial = ["water_or_basic_reset", "tiny_focus_action"] as const;

    await expect(
      updateTodayRecoveryActions(database, "user-1", partial, NOW),
    ).resolves.toMatchObject({
      status: "updated",
      event: { selectedActionIds: partial },
    });
    await expect(
      startTodayRecovery(database, "user-1", NOW),
    ).resolves.toMatchObject({
      status: "existing",
      event: { selectedActionIds: partial },
    });

    await completeTodayRecovery(database, "user-1", validActionIds, NOW);
    await expect(
      updateTodayRecoveryActions(database, "user-1", partial, NOW),
    ).resolves.toMatchObject({ status: "completed" });
    expect(stored()?.selectedActionIds).toEqual([...validActionIds]);
  });

  it("rolls back completion when status persistence fails", async () => {
    const { database, stored } = createRecoveryDatabase({
      failStatusWrite: true,
      event: {
        id: "event-1",
        cycleId: "cycle-1",
        selectedActionIds: [],
        completedAt: null,
        creditConsumedAt: null,
      },
    });

    await expect(
      completeTodayRecovery(database, "user-1", validActionIds, NOW),
    ).rejects.toThrow("status persistence failed");
    expect(stored()?.completedAt).toBeNull();
  });

  it("always scopes current-day lookup to active user ownership", async () => {
    const { database, dayLogFindFirst } = createRecoveryDatabase({
      event: {
        id: "event-1",
        cycleId: "cycle-1",
        selectedActionIds: [],
        completedAt: null,
        creditConsumedAt: null,
      },
    });

    await startTodayRecovery(database, "user-1", NOW);

    expect(dayLogFindFirst).toHaveBeenCalledWith({
      where: {
        date: TODAY,
        cycle: { userId: "user-1", status: "ACTIVE" },
      },
      select: { id: true, cycleId: true, status: true },
    });
  });
});

describe("recovery HTTP boundary", () => {
  function completeRequest(body: unknown) {
    return new Request("http://localhost/api/recovery/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const event = {
    id: "event-1",
    selectedActionIds: [...validActionIds],
    completedAt: NOW.toISOString(),
    creditConsumedAt: NOW.toISOString(),
  };
  const recoveryCredits = {
    recoveryCreditLimit: 6,
    recoveryCreditsUsed: 1,
    recoveryCreditsRemaining: 5,
  };

  it("requires browser auth before recovery start", async () => {
    const getDatabase = vi.fn();

    await expect(
      handleStartRecoveryRequest({
        requireSession: vi.fn().mockRejectedValue(new Error("unauthenticated")),
        getDatabase,
      }),
    ).rejects.toThrow("unauthenticated");
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it("returns complete recovery 400, 404, 409, 422, and success responses", async () => {
    const dependencies = {
      requireSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
      getDatabase: vi.fn(() => ({}) as RecoveryDatabase),
    };

    await expect(
      handleCompleteRecoveryRequest(
        completeRequest({ actionIds: ["bad"] }),
        dependencies,
      ),
    ).resolves.toMatchObject({ status: 400 });

    for (const [result, status] of [
      [{ status: "not_found" }, 404],
      [{ status: "not_started" }, 409],
      [{ status: "invalid_actions" }, 422],
    ] as const) {
      const response = await handleCompleteRecoveryRequest(
        completeRequest({ actionIds: validActionIds }),
        {
          ...dependencies,
          completeRecovery: vi.fn().mockResolvedValue(result),
        },
      );
      expect(response.status).toBe(status);
    }

    const response = await handleCompleteRecoveryRequest(
      completeRequest({ actionIds: validActionIds }),
      {
        ...dependencies,
        completeRecovery: vi.fn().mockResolvedValue({
          status: "completed",
          event,
          dayStatus: "BLUE",
          recoveryCredits,
        }),
      },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      recovery_credits: recoveryCredits,
    });
  });

  it("persists partial actions through the authenticated update boundary", async () => {
    const updateRecoveryActions = vi.fn().mockResolvedValue({
      status: "updated",
      event: { ...event, completedAt: null, creditConsumedAt: null },
    });
    const response = await handleUpdateRecoveryActionsRequest(
      completeRequest({ actionIds: ["water_or_basic_reset"] }),
      {
        requireSession: vi.fn().mockResolvedValue({ userId: "user-1" }),
        getDatabase: () => ({}) as RecoveryDatabase,
        updateRecoveryActions,
      },
    );

    expect(response.status).toBe(200);
    expect(updateRecoveryActions).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      ["water_or_basic_reset"],
    );
  });
});
