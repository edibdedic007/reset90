import { getPrismaClient } from "@/server/db/client";
import { getTodayDashboard } from "@/server/dashboard/today";
import { requireBrowserSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireBrowserSession();
  const dashboard = await getTodayDashboard(getPrismaClient(), session.userId);

  return Response.json({ ok: true, dashboard });
}
