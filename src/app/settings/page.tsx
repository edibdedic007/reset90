import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { SettingsExportPanel } from "@/components/settings-export";
import { getReadOnlyBrowserSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getReadOnlyBrowserSession();
  if (!session) {
    redirect("/api/auth/signin?callbackUrl=/settings");
  }

  return (
    <AppShell activeItem="Settings" session={session}>
      <div className="space-y-6">
        <header>
          <p className="text-sm font-medium text-[var(--accent)]">Settings</p>
          <h1 className="mt-1 text-3xl font-semibold">Your data</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--muted)]">
            Download private copies of data stored for this Reset90 account.
          </p>
        </header>
        <SettingsExportPanel />
      </div>
    </AppShell>
  );
}
