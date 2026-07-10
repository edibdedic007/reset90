export const RECOVERY_ACTIONS = [
  {
    id: "water_or_basic_reset",
    label: "Drink water or do a basic physical reset",
    physical: true,
    forward: false,
  },
  {
    id: "short_walk_or_reset",
    label: "Take a short walk, stretch, shower, or do a small cleanup",
    physical: true,
    forward: false,
  },
  {
    id: "tiny_focus_action",
    label: "Do one tiny focus action",
    physical: false,
    forward: true,
  },
  {
    id: "reflection_or_note",
    label: "Write one reflection or note",
    physical: false,
    forward: false,
  },
  {
    id: "prepare_tomorrow",
    label: "Prepare one thing for tomorrow",
    physical: false,
    forward: true,
  },
] as const;

export const RECOVERY_COPY = {
  guidance:
    "Downshift, don't abandon. Recovery needs three actions, one physical reset, and one action that moves tomorrow forward.",
  opened:
    "Recovery is open. Pick a few small actions that help today continue.",
  recorded: "Recovery recorded. Today still has room for one next action.",
  incomplete:
    "Choose at least three actions, including one physical reset and one forward action.",
} as const;

export type RecoveryActionId = (typeof RECOVERY_ACTIONS)[number]["id"];

const actionIds = new Set<string>(RECOVERY_ACTIONS.map((action) => action.id));

export function isRecoveryActionId(value: string): value is RecoveryActionId {
  return actionIds.has(value);
}

export function recoveryActionsMeetRequirements(
  actionIds: readonly RecoveryActionId[],
) {
  const actions = RECOVERY_ACTIONS.filter((action) =>
    actionIds.includes(action.id),
  );

  return (
    actions.length >= 3 &&
    actions.some((action) => action.physical) &&
    actions.some((action) => action.forward)
  );
}
