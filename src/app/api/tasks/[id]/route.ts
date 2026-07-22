import { z } from "zod";

import { getReadOnlyBrowserSession } from "@/server/auth/session";
import { setTaskCompletion } from "@/server/dashboard/today";
import { getPrismaClient } from "@/server/db/client";
import { handleBrowserMutation } from "@/server/http/security";

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
  return handleBrowserMutation(
    request,
    "PATCH",
    "task.completion.update",
    {
      appUrl: process.env.APP_URL,
      getSession: getReadOnlyBrowserSession,
    },
    async (boundedRequest, session) => {
      const { id } = await context.params;
      const body = await boundedRequest.json().catch(() => null);
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

      return Response.json({
        ok: true,
        task: result.task,
        day_status: result.dayStatus,
      });
    },
  );
}
