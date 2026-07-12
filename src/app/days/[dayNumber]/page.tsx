import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { DayDetail } from "@/components/day-detail";
import { requireBrowserSession } from "@/server/auth/session";
import { getPrismaClient } from "@/server/db/client";
import { getDayDetail, parseDayNumber } from "@/server/progress";

export const dynamic = "force-dynamic";

export default async function DayDetailPage({
  params,
}: {
  params: Promise<{ dayNumber: string }>;
}) {
  const dayNumber = parseDayNumber((await params).dayNumber);
  if (dayNumber === null) {
    notFound();
  }

  const session = await requireBrowserSession();
  const detail = await getDayDetail(
    getPrismaClient(),
    session.userId,
    dayNumber,
  );

  return (
    <AppShell activeItem="90 Days" session={session}>
      <DayDetail detail={detail} />
    </AppShell>
  );
}
