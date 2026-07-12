import type { ReviewsDashboard, WeeklyReviewSummary } from "@/server/reviews";

function StringList({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1 break-words pl-5 text-[var(--muted)]">
      {items.map((item, index) => (
        <li className="whitespace-pre-wrap" key={`${index}-${item}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function ListSection({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="font-semibold">{title}</h3>
      <StringList items={items} />
    </section>
  );
}

function ReviewCard({ review }: { review: WeeklyReviewSummary }) {
  const statusMetrics = [
    ["Green", review.metrics.greenDays],
    ["Yellow", review.metrics.yellowDays],
    ["Blue", review.metrics.blueDays],
    ["Red", review.metrics.redDays],
    ["Gold", review.metrics.goldDays],
  ] as const;

  return (
    <article className="min-w-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <header>
        <p className="text-sm text-[var(--muted)]">
          {review.dateFrom} – {review.dateTo}
        </p>
        <h2 className="mt-1 text-2xl font-semibold">
          Week {review.weekNumber}
        </h2>
      </header>

      <section className="mt-5">
        <h3 className="font-semibold">Summary</h3>
        <p className="mt-2 break-words whitespace-pre-wrap text-[var(--muted)]">
          {review.summary}
        </p>
      </section>

      <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-2">
        <ListSection items={review.wins} title="Wins" />
        <ListSection items={review.blockers} title="Blockers" />
        {review.patterns.length > 0 ? (
          <section>
            <h3 className="font-semibold">Patterns</h3>
            <ol className="mt-2 space-y-3">
              {review.patterns.map((pattern, index) => (
                <li
                  className="min-w-0 rounded-lg bg-[var(--surface-alt)] p-3"
                  key={`${index}-${pattern.title}`}
                >
                  <p className="break-words font-medium">{pattern.title}</p>
                  <p className="mt-1 break-words whitespace-pre-wrap text-sm text-[var(--muted)]">
                    {pattern.evidence}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
        <ListSection
          items={review.recommendedChanges}
          title="Recommended changes"
        />
        <ListSection
          items={review.nextWeekCommitments}
          title="Next-week commitments"
        />
      </div>

      <section className="mt-5 rounded-lg bg-[var(--surface-alt)] p-4">
        <h3 className="font-semibold">Review metrics snapshot</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {statusMetrics.map(([label, value]) => (
            <div key={label}>
              <dt className="text-[var(--muted)]">{label} days</dt>
              <dd className="mt-1 font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-sm text-[var(--muted)]">
          Recovery usage (review snapshot): {review.metrics.recoveryCreditsUsed}{" "}
          {review.metrics.recoveryCreditsUsed === 1 ? "credit" : "credits"}
        </p>
      </section>
    </article>
  );
}

export function ReviewsPageContent({
  dashboard,
}: {
  dashboard: ReviewsDashboard;
}) {
  if (dashboard.status === "no_cycle") {
    return (
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="text-2xl font-semibold">No active reset cycle.</h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Weekly reviews will appear after a cycle starts and a review is
          imported.
        </p>
      </section>
    );
  }

  return (
    <div className="min-w-0 space-y-6">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <p className="text-sm text-[var(--muted)]">{dashboard.cycleName}</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
          Weekly reviews
        </h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)]">
          Imported review snapshots for your active reset cycle.
        </p>
      </section>

      {dashboard.reviews.length > 0 ? (
        <div className="min-w-0 space-y-5">
          {dashboard.reviews.map((review) => (
            <ReviewCard key={review.weekNumber} review={review} />
          ))}
        </div>
      ) : (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="text-xl font-semibold">No weekly reviews yet.</h2>
          <p className="mt-3 text-[var(--muted)]">
            No weekly review has been imported for this cycle yet.
          </p>
        </section>
      )}
    </div>
  );
}
