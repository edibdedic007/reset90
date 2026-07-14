import Link from "next/link";
import type { ReactNode } from "react";

import { signOut } from "@/auth";
import type { BrowserUserSession } from "@/server/auth/session";

type AppShellProps = {
  activeItem: "Today" | "90 Days" | "Reviews" | "Context" | "Analytics";
  children: ReactNode;
  session: BrowserUserSession;
};

const navigationItems = [
  { label: "Today", href: "/" },
  { label: "90 Days", href: "/days" },
  { label: "Reviews", href: "/reviews" },
  { label: "Context", href: "/context" },
  { label: "Analytics", href: "/analytics" },
  { label: "Settings", href: null },
] as const;

export function AppShell({ activeItem, children, session }: AppShellProps) {
  const displayName =
    session.displayName ?? session.email ?? session.authentikSubject;

  return (
    <main className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex flex-wrap items-center gap-4">
            <Link className="text-xl font-semibold" href="/">
              Reset90
            </Link>
            <nav
              aria-label="Primary navigation"
              className="flex flex-wrap gap-1"
            >
              {navigationItems.map((item) =>
                item.href ? (
                  <Link
                    aria-current={
                      activeItem === item.label ? "page" : undefined
                    }
                    className="rounded-lg px-3 py-2 text-sm text-[var(--foreground)] aria-[current=page]:bg-[var(--surface-alt)]"
                    href={item.href}
                    key={item.label}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="rounded-lg px-3 py-2 text-sm text-[var(--muted)]"
                    key={item.label}
                  >
                    {item.label}
                  </span>
                ),
              )}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            <span className="rounded-lg border border-[var(--border)] px-3 py-2">
              {displayName}
            </span>
            {session.isDev ? (
              <span className="rounded-lg border border-[var(--border)] px-3 py-2">
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
                  className="rounded-lg border border-[var(--border)] px-3 py-2 hover:border-[var(--accent)] hover:text-[var(--foreground)]"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </div>
    </main>
  );
}
