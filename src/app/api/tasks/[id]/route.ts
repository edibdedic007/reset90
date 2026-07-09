import { z } from "zod";

import { requireBrowserSession } from "@/server/auth/session";
import { setTaskCompletion } from "@/server/dashboard/today";
import { getPrismaClient } from "@/server/db/client";

const taskUpdateSchema = z
  .object({
    completed: z.boolean(),
  })
  .strict();

type TaskRouteContext = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: TaskRouteContext) {
  const session = await requireBrowserSession();
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = taskUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "invalid_task_payload" },
      { status: 400 },
    );
  }

  const result = await setTaskCompletion(
    getPrismaClient(),
    session.userId,
    id,
    parsed.data.completed,
  );

  if (result.status === "not_found") {
    return Response.json(
      { ok: false, error: "task_not_found" },
      { status: 404 },
    );
  }

  return Response.json({ ok: true, task: result.task });
}
