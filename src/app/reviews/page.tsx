import { AppShell } from "@/components/app-shell";
import { ReviewsPageContent } from "@/components/reviews-page";
import { requireBrowserSession } from "@/server/auth/session";
import { getPrismaClient } from "@/server/db/client";
import { getReviewsDashboard } from "@/server/reviews";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const session = await requireBrowserSession();
  const dashboard = await getReviewsDashboard(
    getPrismaClient(),
    session.userId,
  );

  return (
    <AppShell activeItem="Reviews" session={session}>
      <ReviewsPageContent dashboard={dashboard} />
    </AppShell>
  );
}
