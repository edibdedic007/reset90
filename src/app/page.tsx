import { AppShell } from "@/components/app-shell";
import { requireBrowserSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await requireBrowserSession();

  return <AppShell session={session} />;
}
