import { z } from "zod";

import { getReadOnlyBrowserSession } from "@/server/auth/session";
import { getPrismaClient } from "@/server/db/client";
import { ENERGY_LEVELS, setTodayEnergy } from "@/server/dashboard/today";
import { handleBrowserMutation } from "@/server/http/security";

const energyUpdateSchema = z
  .object({
    energyLevel: z.enum(ENERGY_LEVELS).nullable(),
  })
  .strict();

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  return handleBrowserMutation(
    request,
    "PATCH",
    "today.energy.update",
    {
      appUrl: process.env.APP_URL,
      getSession: getReadOnlyBrowserSession,
    },
    async (boundedRequest, session) => {
      const body = await boundedRequest.json().catch(() => null);
      const parsed = energyUpdateSchema.safeParse(body);

      if (!parsed.success) {
        return Response.json(
          { ok: false, error: "invalid_energy_payload" },
          { status: 400 },
        );
      }

      const result = await setTodayEnergy(
        getPrismaClient(),
        session.userId,
        parsed.data.energyLevel,
      );

      if (result.status === "not_found") {
        return Response.json(
          { ok: false, error: "today_not_found" },
          { status: 404 },
        );
      }

      return Response.json({ ok: true, day: result.day });
    },
  );
}
