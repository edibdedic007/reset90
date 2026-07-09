import { z } from "zod";

import { requireBrowserSession } from "@/server/auth/session";
import { getPrismaClient } from "@/server/db/client";
import { ENERGY_LEVELS, setTodayEnergy } from "@/server/dashboard/today";

const energyUpdateSchema = z
  .object({
    energyLevel: z.enum(ENERGY_LEVELS).nullable(),
  })
  .strict();

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const session = await requireBrowserSession();
  const body = await request.json().catch(() => null);
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
}
