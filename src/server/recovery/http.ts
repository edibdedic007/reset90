import { z } from "zod";

import {
  completeTodayRecovery,
  parseRecoveryActionIds,
  startTodayRecovery,
  updateTodayRecoveryActions,
  type RecoveryDatabase,
} from "./service";

const completeRecoverySchema = z
  .object({ actionIds: z.array(z.string()).max(5) })
  .strict();

export type RecoveryHttpDependencies = {
  requireSession: () => Promise<{ userId: string }>;
  getDatabase: () => RecoveryDatabase;
  startRecovery?: typeof startTodayRecovery;
  completeRecovery?: typeof completeTodayRecovery;
  updateRecoveryActions?: typeof updateTodayRecoveryActions;
};

export async function handleStartRecoveryRequest(
  dependencies: RecoveryHttpDependencies,
) {
  const session = await dependencies.requireSession();
  const result = await (dependencies.startRecovery ?? startTodayRecovery)(
    dependencies.getDatabase(),
    session.userId,
  );

  if (result.status === "not_found") {
    return Response.json(
      { ok: false, error: "today_not_found" },
      { status: 404 },
    );
  }

  return Response.json(
    { ok: true, status: result.status, event: result.event },
    { status: result.status === "started" ? 201 : 200 },
  );
}

export async function handleCompleteRecoveryRequest(
  request: Request,
  dependencies: RecoveryHttpDependencies,
) {
  const session = await dependencies.requireSession();
  const body = await request.json().catch(() => null);
  const parsed = completeRecoverySchema.safeParse(body);
  const actionIds = parsed.success
    ? parseRecoveryActionIds(parsed.data.actionIds)
    : null;

  if (!actionIds) {
    return Response.json(
      { ok: false, error: "invalid_recovery_payload" },
      { status: 400 },
    );
  }

  const result = await (dependencies.completeRecovery ?? completeTodayRecovery)(
    dependencies.getDatabase(),
    session.userId,
    actionIds,
  );

  if (result.status === "not_found") {
    return Response.json(
      { ok: false, error: "today_not_found" },
      { status: 404 },
    );
  }

  if (result.status === "not_started") {
    return Response.json(
      { ok: false, error: "recovery_not_started" },
      { status: 409 },
    );
  }

  if (result.status === "invalid_actions") {
    return Response.json(
      { ok: false, error: "recovery_requirements_not_met" },
      { status: 422 },
    );
  }

  return Response.json({
    ok: true,
    status: result.status,
    event: result.event,
    day_status: result.dayStatus,
    recovery_credits: result.recoveryCredits,
  });
}

export async function handleUpdateRecoveryActionsRequest(
  request: Request,
  dependencies: RecoveryHttpDependencies,
) {
  const session = await dependencies.requireSession();
  const body = await request.json().catch(() => null);
  const parsed = completeRecoverySchema.safeParse(body);
  const actionIds = parsed.success
    ? parseRecoveryActionIds(parsed.data.actionIds)
    : null;

  if (!actionIds) {
    return Response.json(
      { ok: false, error: "invalid_recovery_payload" },
      { status: 400 },
    );
  }

  const result = await (
    dependencies.updateRecoveryActions ?? updateTodayRecoveryActions
  )(dependencies.getDatabase(), session.userId, actionIds);

  if (result.status === "not_found") {
    return Response.json(
      { ok: false, error: "today_not_found" },
      { status: 404 },
    );
  }

  if (result.status === "not_started") {
    return Response.json(
      { ok: false, error: "recovery_not_started" },
      { status: 409 },
    );
  }

  if (result.status === "completed") {
    return Response.json(
      { ok: false, error: "recovery_completed", event: result.event },
      { status: 409 },
    );
  }

  return Response.json({ ok: true, event: result.event });
}
