import Link from "next/link";

import {
  buildDayAriaLabel,
  DAY_STATUS_CLASSES,
  DAY_STATUS_LABELS,
} from "@/lib/day-status-presentation";
import { DAY_STATUSES, type ProgressDashboard } from "@/server/progress";

const statusDescriptions = {
  GREEN: "Standard or ideal",
  YELLOW: "Minimum or uncredited recovery",
  BLUE: "Credited recovery",
  RED: "Elapsed without another status",
  GOLD: "Comeback",
  UNSET: "Current incomplete or future",
} as const;

export function ProgressGrid({ dashboard }: { dashboard: ProgressDashboard }) {
  if (dashboard.status === "no_cycle") {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <p className="text-sm text-[var(--muted)]">{dashboard.today}</p>
        <h1 className="mt-2 text-2xl font-semibold">No active reset cycle.</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Start a reset cycle when ready. Your 90-day view will appear here.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <p className="text-sm text-[var(--muted)]">{dashboard.cycle.name}</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">90 Days</h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Every day stays visible. Recovery counts as an intentional part of
          continuing.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {DAY_STATUSES.map((status) => (
            <div
              className="rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-3"
              key={status}
            >
              <p className="text-xs text-[var(--muted)]">
                {DAY_STATUS_LABELS[status]}
              </p>
              <p className="mt-1 text-xl font-semibold">
                {dashboard.statusCounts[status]}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3">
            <p className="text-xs text-[var(--muted)]">Recovery credits</p>
            <p className="mt-1 font-semibold">
              {dashboard.cycle.recoveryCreditsRemaining} remaining ·{" "}
              {dashboard.cycle.recoveryCreditsUsed} used
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3">
            <p className="text-xs text-[var(--muted)]">Unavailable days</p>
            <p className="mt-1 font-semibold">{dashboard.unavailableCount}</p>
          </div>
        </div>
      </section>

      <section
        aria-label="90-day progress grid"
        className="grid grid-cols-5 gap-2 sm:grid-cols-10 lg:grid-cols-[repeat(15,minmax(0,1fr))]"
      >
        {dashboard.days.map((day) => {
          const statusLabel = day.status
            ? DAY_STATUS_LABELS[day.status]
            : "Unavailable";
          const statusClass = day.status
            ? DAY_STATUS_CLASSES[day.status]
            : "border-dashed border-[var(--warning)] bg-[var(--warning-soft)] text-[var(--foreground)]";

          return (
            <Link
              aria-label={buildDayAriaLabel(day)}
              className={`relative flex min-h-20 flex-col items-center justify-center rounded-lg border p-1 text-center outline-none transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${statusClass}`}
              href={`/days/${day.dayNumber}`}
              key={day.dayNumber}
            >
              <span className="text-base font-semibold">{day.dayNumber}</span>
              <span className="mt-1 text-[0.65rem] leading-tight">
                {statusLabel}
              </span>
              {day.isCurrent ? (
                <span className="mt-1 rounded-sm border border-current px-1 text-[0.6rem] font-semibold uppercase tracking-wide">
                  Today
                </span>
              ) : null}
            </Link>
          );
        })}
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-lg font-semibold">Status guide</h2>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {DAY_STATUSES.map((status) => (
            <li className="text-[var(--muted)]" key={status}>
              <span className="font-semibold text-[var(--foreground)]">
                {DAY_STATUS_LABELS[status]}:
              </span>{" "}
              {statusDescriptions[status]}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
