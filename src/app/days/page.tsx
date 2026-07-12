import { AppShell } from "@/components/app-shell";
import { ProgressGrid } from "@/components/progress-grid";
import { requireBrowserSession } from "@/server/auth/session";
import { getPrismaClient } from "@/server/db/client";
import { getProgressDashboard } from "@/server/progress";

export const dynamic = "force-dynamic";

export default async function DaysPage() {
  const session = await requireBrowserSession();
  const dashboard = await getProgressDashboard(
    getPrismaClient(),
    session.userId,
  );

  return (
    <AppShell activeItem="90 Days" session={session}>
      <ProgressGrid dashboard={dashboard} />
    </AppShell>
  );
}
