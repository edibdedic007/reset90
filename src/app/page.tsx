import { AppShell } from "@/components/app-shell";
import { requireBrowserSession } from "@/server/auth/session";
import { getTodayDashboard } from "@/server/dashboard/today";
import { getPrismaClient } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requireBrowserSession();
  const dashboard = await getTodayDashboard(getPrismaClient(), session.userId);

  return <AppShell dashboard={dashboard} session={session} />;
}
