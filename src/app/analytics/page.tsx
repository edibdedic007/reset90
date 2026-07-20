import { redirect } from "next/navigation";

import { AnalyticsDashboardView } from "@/components/analytics-dashboard";
import { AppShell } from "@/components/app-shell";
import { getAnalyticsDashboard } from "@/server/analytics";
import { getReadOnlyBrowserSession } from "@/server/auth/session";
import { getPrismaClient } from "@/server/db/client";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await getReadOnlyBrowserSession();
  if (!session) {
    redirect("/api/auth/signin?callbackUrl=/analytics");
  }

  const dashboard = await getAnalyticsDashboard(
    getPrismaClient(),
    session.userId,
  );

  return (
    <AppShell activeItem="Analytics" session={session}>
      <AnalyticsDashboardView dashboard={dashboard} />
    </AppShell>
  );
}
