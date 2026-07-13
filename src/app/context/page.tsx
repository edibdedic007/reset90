import { AppShell } from "@/components/app-shell";
import { ContextLibraryPage } from "@/components/context-library";
import { requireBrowserSession } from "@/server/auth/session";
import { getContextLibrary } from "@/server/context";
import { getPrismaClient } from "@/server/db/client";

type ContextPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function ContextPage({ searchParams }: ContextPageProps) {
  const session = await requireBrowserSession();
  const result = await getContextLibrary(
    getPrismaClient(),
    session.userId,
    await searchParams,
  );

  return (
    <AppShell activeItem="Context" session={session}>
      <ContextLibraryPage
        library={result.status === "valid" ? result.library : null}
        queryIssues={result.status === "invalid" ? result.issues : []}
      />
    </AppShell>
  );
}
