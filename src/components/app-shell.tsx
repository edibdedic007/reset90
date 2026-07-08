import { signOut } from "@/auth";
import type { BrowserUserSession } from "@/server/auth/session";

type AppShellProps = {
  session: BrowserUserSession;
};

export function AppShell({ session }: AppShellProps) {
  const displayName =
    session.displayName ?? session.email ?? session.authentikSubject;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-16 sm:px-10">
      <section className="w-full rounded-3xl border border-[var(--border)] bg-[var(--surface)]/90 p-8 shadow-2xl shadow-black/20 sm:p-12">
        <p className="mb-5 text-sm font-semibold tracking-[0.24em] text-[var(--accent)] uppercase">
          Private · Self-hosted · Single-user
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          Reset90 app shell is ready.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--muted)]">
          Foundation only. Daily plans, tracking, recovery, and analytics arrive
          in later approved phases.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
          <span className="rounded-full border border-[var(--border)] px-4 py-2">
            Signed in as {displayName}
          </span>
          {session.isDev ? (
            <span className="rounded-full border border-[var(--border)] px-4 py-2">
              Dev auth
            </span>
          ) : (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <button
                className="rounded-full border border-[var(--border)] px-4 py-2 hover:border-[var(--accent)] hover:text-[var(--foreground)]"
                type="submit"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
        <div className="mt-10 flex flex-wrap gap-3 text-sm text-[var(--muted)]">
          <a
            className="rounded-full border border-[var(--border)] px-4 py-2 hover:border-[var(--accent)] hover:text-[var(--foreground)]"
            href="/api/health"
          >
            Health endpoint
          </a>
          <a
            className="rounded-full border border-[var(--border)] px-4 py-2 hover:border-[var(--accent)] hover:text-[var(--foreground)]"
            href="/api/ready"
          >
            Readiness endpoint
          </a>
        </div>
      </section>
    </main>
  );
}
