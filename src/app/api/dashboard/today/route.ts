import { getPrismaClient } from "@/server/db/client";
import { getTodayDashboard } from "@/server/dashboard/today";
import { getReadOnlyBrowserSession } from "@/server/auth/session";
import { handleSafeApplicationRequest } from "@/server/http/security";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleSafeApplicationRequest("today.read", async () => {
    const session = await getReadOnlyBrowserSession();
    if (!session) {
      return Response.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }
    const dashboard = await getTodayDashboard(
      getPrismaClient(),
      session.userId,
    );

    return Response.json({ ok: true, dashboard });
  });
}
