import type { FocusDomain } from "@/generated/prisma/enums";
import {
  DAY_STATUS_CLASSES,
  DAY_STATUS_LABELS,
} from "@/lib/day-status-presentation";
import {
  ANALYTICS_DAY_STATUSES,
  type AnalyticsDashboard,
  type AnalyticsTrend,
  type AnalyticsWeek,
  type CompletionSummary,
} from "@/server/analytics";

const STATUS_DESCRIPTIONS = {
  GREEN: "Standard or ideal completed",
  YELLOW: "Minimum or uncredited recovery",
  BLUE: "Credited recovery",
  RED: "Incomplete or abandoned",
  GOLD: "Comeback",
} as const;

const DOMAIN_LABELS: Record<FocusDomain, string> = {
  BODY: "Body",
  MOOD: "Mood",
  DIGITAL: "Digital",
  LEARNING: "Learning",
  WORK: "Work",
  SYSTEM: "System",
  ENVIRONMENT: "Environment",
  SOCIAL: "Social",
  OTHER: "Other",
};

function completionLabel(summary: CompletionSummary) {
  return summary.percentage === null
    ? "No data"
    : `${summary.completed}/${summary.total} · ${summary.percentage}%`;
}

function CompletionBar({
  label,
  summary,
}: {
  label: string;
  summary: CompletionSummary;
}) {
  if (summary.percentage === null) return null;

  return (
    <div
      aria-label={`${label}: ${summary.completed} of ${summary.total} tasks complete, ${summary.percentage}%`}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={summary.percentage}
      className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--border)]"
      role="progressbar"
    >
      <div
        className="h-full rounded-full bg-[var(--accent)]"
        style={{ width: `${summary.percentage}%` }}
      />
    </div>
  );
}

function trendSegments(points: AnalyticsTrend["points"]) {
  const segments: Array<typeof points> = [];
  for (const point of points) {
    const current = segments.at(-1);
    const previous = current?.at(-1);
    if (!previous || point.dayNumber !== previous.dayNumber + 1) {
      segments.push([point]);
    } else if (current) {
      current.push(point);
    }
  }
  return segments;
}

function TrendCard({
  throughDay,
  trend,
}: {
  throughDay: number;
  trend: AnalyticsTrend;
}) {
  const direction = trend.direction === "higher" ? "Higher" : "Lower";
  const latest = trend.points.at(-1);
  const width = 600;
  const height = 150;
  const padding = 20;
  const x = (dayNumber: number) =>
    padding +
    ((dayNumber - 1) / Math.max(throughDay - 1, 1)) * (width - padding * 2);
  const y = (value: number) =>
    padding + ((10 - value) / 9) * (height - padding * 2);

  return (
    <article className="min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="font-semibold">{trend.label}</h3>
      <p className="mt-1 text-sm text-[var(--muted)]">
        {direction} is better · stored 1–10 scale
      </p>
      {latest ? (
        <>
          <p className="mt-3 text-sm">
            Latest: <span className="font-semibold">{latest.value}/10</span> on
            day {latest.dayNumber} · {trend.points.length} daily{" "}
            {trend.points.length === 1 ? "point" : "points"}
          </p>
          <svg
            aria-label={`${trend.label} trend. ${direction} is better. ${trend.points.length} daily points through day ${throughDay}.`}
            className="mt-3 h-36 w-full text-[var(--accent)]"
            role="img"
            viewBox={`0 0 ${width} ${height}`}
          >
            <title>{`${trend.label} trend on stored 1 to 10 scale`}</title>
            <line
              className="text-[var(--border)]"
              stroke="currentColor"
              strokeWidth="2"
              x1={padding}
              x2={width - padding}
              y1={height - padding}
              y2={height - padding}
            />
            {trendSegments(trend.points).map((segment) =>
              segment.length > 1 ? (
                <polyline
                  fill="none"
                  key={`${segment[0].dayNumber}-${segment.at(-1)?.dayNumber}`}
                  points={segment
                    .map((point) => `${x(point.dayNumber)},${y(point.value)}`)
                    .join(" ")}
                  stroke="currentColor"
                  strokeWidth="4"
                />
              ) : null,
            )}
            {trend.points.map((point) => (
              <circle
                cx={x(point.dayNumber)}
                cy={y(point.value)}
                fill="currentColor"
                key={point.dayNumber}
                r="6"
              >
                <title>{`Day ${point.dayNumber}: ${point.value}/10`}</title>
              </circle>
            ))}
          </svg>
          <ul className="sr-only">
            {trend.points.map((point) => (
              <li key={point.dayNumber}>
                Day {point.dayNumber}: {point.value}/10
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-sm text-[var(--muted)]">No check-ins yet</p>
      )}
    </article>
  );
}

function weekValue(
  week: AnalyticsWeek,
  metric:
    | "finalizedDays"
    | "taskCompletion"
    | "averageMood"
    | "averageFog"
    | "recoveryCreditsUsed",
) {
  if (metric === "taskCompletion") {
    const summary = week.taskCompletion;
    return summary.percentage === null
      ? "No data"
      : `${summary.completed} / ${summary.total} · ${summary.percentage}%`;
  }

  const value = week[metric];
  if (value === null) return "No data";
  if (metric === "averageMood" || metric === "averageFog") {
    return `${value}/10`;
  }
  return String(value);
}

function WeeklyComparison({
  comparison,
}: {
  comparison: Extract<
    AnalyticsDashboard,
    { status: "ready" }
  >["weeklyComparison"];
}) {
  if (comparison.status === "unavailable") {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Weekly comparison</h2>
        <p className="mt-3 text-[var(--muted)]">Previous week not available</p>
      </section>
    );
  }

  const rows = [
    ["Finalized days", "finalizedDays"],
    ["Task completion", "taskCompletion"],
    ["Average mood", "averageMood"],
    ["Average fog", "averageFog"],
    ["Recovery credits used", "recoveryCreditsUsed"],
  ] as const;

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <h2 className="text-xl font-semibold">Weekly comparison</h2>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Equal elapsed portions: current week days {comparison.current.dayFrom}–
        {comparison.current.dayTo} and previous week days{" "}
        {comparison.previous.dayFrom}–{comparison.previous.dayTo}.
      </p>
      <div className="mt-4 space-y-2 text-sm">
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 text-[var(--muted)]">
          <span>Metric</span>
          <span>Week {comparison.current.weekNumber}</span>
          <span>Week {comparison.previous.weekNumber}</span>
        </div>
        {rows.map(([label, metric]) => (
          <div
            className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 rounded-lg bg-[var(--surface-alt)] px-3 py-2"
            key={metric}
          >
            <span className="min-w-0 break-words">{label}</span>
            <span className="font-semibold">
              {weekValue(comparison.current, metric)}
            </span>
            <span className="font-semibold">
              {weekValue(comparison.previous, metric)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AnalyticsDashboardView({
  dashboard,
}: {
  dashboard: AnalyticsDashboard;
}) {
  if (dashboard.status === "no_cycle") {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="text-2xl font-semibold">No active reset cycle.</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Start a reset cycle when ready. Analytics will appear here.
        </p>
      </section>
    );
  }

  const throughLabel =
    dashboard.throughDay > 0 ? `Day ${dashboard.throughDay}` : "before Day 1";

  return (
    <div className="min-w-0 space-y-6 overflow-hidden">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <p className="text-sm text-[var(--muted)]">{dashboard.cycleName}</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">Analytics</h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Active cycle through current UTC day {dashboard.today} ({throughLabel}
          ).
        </p>
      </section>

      <section aria-labelledby="status-heading">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold" id="status-heading">
              Finalized day statuses
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {dashboard.finalizedDayCount} finalized{" "}
              {dashboard.finalizedDayCount === 1 ? "day" : "days"} in active
              cycle through current UTC day.
            </p>
          </div>
          {dashboard.finalizedDayCount === 0 ? (
            <p className="text-sm text-[var(--muted)]">No finalized days yet</p>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ANALYTICS_DAY_STATUSES.map((status) => (
            <article
              className={`rounded-lg border p-4 ${DAY_STATUS_CLASSES[status]}`}
              key={status}
            >
              <h3 className="font-semibold">{DAY_STATUS_LABELS[status]}</h3>
              <p className="mt-2 text-2xl font-semibold">
                {dashboard.statusCounts[status]}
              </p>
              <p className="mt-1 text-xs">{STATUS_DESCRIPTIONS[status]}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Recovery credits</h2>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            ["Limit", dashboard.recovery.creditLimit],
            ["Used", dashboard.recovery.creditsUsed],
            ["Remaining", dashboard.recovery.creditsRemaining],
          ].map(([label, value]) => (
            <div className="rounded-lg bg-[var(--surface-alt)] p-3" key={label}>
              <dt className="text-sm text-[var(--muted)]">{label}</dt>
              <dd className="mt-1 text-xl font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {dashboard.recovery.completedQualifyingDays !==
        dashboard.recovery.creditsUsed ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Completed qualifying recovery days:{" "}
            {dashboard.recovery.completedQualifyingDays}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="trends-heading">
        <h2 className="text-xl font-semibold" id="trends-heading">
          Check-in trends
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Latest check-in per UTC cycle day. Missing days remain gaps.
        </p>
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
          {dashboard.trends.map((trend) => (
            <TrendCard
              key={trend.key}
              throughDay={dashboard.throughDay}
              trend={trend}
            />
          ))}
        </div>
      </section>

      <WeeklyComparison comparison={dashboard.weeklyComparison} />

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Task completion</h2>
        {dashboard.taskCompletion.total === 0 ? (
          <p className="mt-3 text-[var(--muted)]">No tasks yet</p>
        ) : (
          <div className="mt-4 rounded-lg bg-[var(--surface-alt)] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold">All represented domains</h3>
              <p className="font-semibold">
                {completionLabel(dashboard.taskCompletion)}
              </p>
            </div>
            <CompletionBar
              label="All task completion"
              summary={dashboard.taskCompletion}
            />
          </div>
        )}

        {dashboard.taskCompletionByDomain.length > 0 ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {dashboard.taskCompletionByDomain.map((domain) => (
              <article
                className="min-w-0 rounded-lg border border-[var(--border)] p-4"
                key={domain.domain}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">
                    {DOMAIN_LABELS[domain.domain]}
                  </h3>
                  <p className="font-semibold">{completionLabel(domain)}</p>
                </div>
                <CompletionBar
                  label={`${DOMAIN_LABELS[domain.domain]} task completion`}
                  summary={domain}
                />
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
