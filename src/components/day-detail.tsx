import Link from "next/link";

import {
  DAY_STATUS_CLASSES,
  DAY_STATUS_LABELS,
} from "@/lib/day-status-presentation";
import { RECOVERY_ACTIONS } from "@/server/recovery/actions";
import type { DayDetail as DayDetailModel } from "@/server/progress";

function words(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function EmptyState({ children }: { children: string }) {
  return <p className="mt-3 text-sm text-[var(--muted)]">{children}</p>;
}

export function DayDetail({ detail }: { detail: DayDetailModel }) {
  if (detail.status === "no_cycle") {
    return (
      <div className="space-y-4">
        <Link className="text-sm text-[var(--accent)]" href="/days">
          ← Back to 90 Days
        </Link>
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <h1 className="text-2xl font-semibold">No active reset cycle.</h1>
          <EmptyState>Day details will appear after a cycle starts.</EmptyState>
        </section>
      </div>
    );
  }

  if (detail.status === "unavailable") {
    return (
      <div className="space-y-4">
        <Link className="text-sm text-[var(--accent)]" href="/days">
          ← Back to 90 Days
        </Link>
        <section className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-6">
          <p className="text-sm text-[var(--muted)]">{detail.cycleName}</p>
          <h1 className="mt-2 text-2xl font-semibold">
            Day {detail.dayNumber} is unavailable.
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{detail.date}</p>
          <EmptyState>
            This day could not be loaded. No status has been inferred.
          </EmptyState>
        </section>
      </div>
    );
  }

  const { day, plan } = detail;
  const selectedRecoveryActions = detail.recoveryEvent
    ? RECOVERY_ACTIONS.filter((action) =>
        detail.recoveryEvent?.selectedActionIds.includes(action.id),
      )
    : [];

  return (
    <div className="space-y-6">
      <Link className="text-sm text-[var(--accent)]" href="/days">
        ← Back to 90 Days
      </Link>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm text-[var(--muted)]">{detail.cycleName}</p>
            <h1 className="mt-2 text-3xl font-semibold">
              Day {day.dayNumber} / 90
            </h1>
            <p className="mt-2 text-[var(--muted)]">
              {day.date} · {day.phase.name}
            </p>
            {day.isCurrent ? (
              <p className="mt-3 inline-block rounded-lg border border-[var(--accent)] px-3 py-1 text-sm font-semibold">
                Current day
              </p>
            ) : null}
          </div>
          <div
            className={`rounded-lg border px-4 py-3 ${DAY_STATUS_CLASSES[day.status]}`}
          >
            <p className="text-xs">Status</p>
            <p className="mt-1 font-semibold">
              {DAY_STATUS_LABELS[day.status]}
            </p>
          </div>
        </div>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-[var(--surface-alt)] p-3">
            <dt className="text-[var(--muted)]">Energy</dt>
            <dd className="mt-1 font-medium">
              {day.energyLevel ? words(day.energyLevel) : "Not recorded"}
            </dd>
          </div>
          <div className="rounded-lg bg-[var(--surface-alt)] p-3">
            <dt className="text-[var(--muted)]">Phase</dt>
            <dd className="mt-1 font-medium">{day.phase.name}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-xl font-semibold">Plan</h2>
        {plan ? (
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="font-semibold">Mission</h3>
              <p className="mt-1 text-[var(--muted)]">{plan.mission}</p>
            </div>
            <div>
              <h3 className="font-semibold">Support</h3>
              <p className="mt-1 text-[var(--muted)]">
                {plan.supportiveMessage}
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Downshift rule</h3>
              <p className="mt-1 text-[var(--muted)]">{plan.downshiftRule}</p>
            </div>
            <div>
              <h3 className="font-semibold">Context</h3>
              <p className="mt-1 text-[var(--muted)]">{plan.contextSummary}</p>
            </div>
            {plan.warnings.length > 0 ? (
              <div>
                <h3 className="font-semibold">Warnings</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-[var(--muted)]">
                  {plan.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState>No plan recorded for this day.</EmptyState>
        )}
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-xl font-semibold">Tasks</h2>
        {plan && plan.tasks.length > 0 ? (
          <ol className="mt-4 space-y-3">
            {plan.tasks.map((task) => (
              <li
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] p-4"
                key={task.id}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{task.title}</h3>
                  <span className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]">
                    {words(task.tier)}
                  </span>
                  <span className="rounded border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]">
                    {task.completedAt
                      ? "Completed"
                      : task.skippedAt
                        ? "Skipped"
                        : "Open"}
                  </span>
                </div>
                {task.description ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {task.description}
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {words(task.domain)}
                  {task.estimateMinutes ? ` · ${task.estimateMinutes} min` : ""}
                </p>
                {task.trigger ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    Trigger: {task.trigger}
                  </p>
                ) : null}
                {task.why ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Why: {task.why}
                  </p>
                ) : null}
                {task.notes ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Notes: {task.notes}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState>No tasks recorded for this day.</EmptyState>
        )}
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-xl font-semibold">Check-ins</h2>
        {detail.checkins.length > 0 ? (
          <ol className="mt-4 space-y-3">
            {detail.checkins.map((checkin) => (
              <li
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] p-4"
                key={checkin.id}
              >
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="font-semibold">{words(checkin.kind)}</h3>
                  <time className="text-xs text-[var(--muted)]">
                    {checkin.timestamp.slice(0, 16).replace("T", " ")} UTC
                  </time>
                </div>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Energy: {words(checkin.energyLevel)}
                </p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-[var(--muted)]">Mood</dt>
                    <dd>{checkin.scores.mood}/10</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Fog</dt>
                    <dd>{checkin.scores.fog}/10</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Loneliness</dt>
                    <dd>{checkin.scores.loneliness}/10</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Self-criticism</dt>
                    <dd>{checkin.scores.selfCriticism}/10</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Digital control</dt>
                    <dd>{checkin.scores.digitalControl}/10</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Learning resistance</dt>
                    <dd>{checkin.scores.learningResistance}/10</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Body relationship</dt>
                    <dd>{checkin.scores.bodyRelationship}/10</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--muted)]">Work confidence</dt>
                    <dd>{checkin.scores.workConfidence}/10</dd>
                  </div>
                </dl>
                {checkin.note ? (
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {checkin.note}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState>No check-ins recorded for this day.</EmptyState>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-xl font-semibold">Recovery</h2>
          {detail.recoveryEvent ? (
            <div className="mt-3 text-sm text-[var(--muted)]">
              <p>
                {detail.recoveryEvent.completedAt
                  ? detail.recoveryEvent.creditConsumedAt
                    ? "Completed with a recovery credit."
                    : "Completed without using a recovery credit."
                  : "Recovery started and remains incomplete."}
              </p>
              {selectedRecoveryActions.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  {selectedRecoveryActions.map((action) => (
                    <li key={action.id}>{action.label}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <EmptyState>No recovery recorded for this day.</EmptyState>
          )}
        </div>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-xl font-semibold">Reflection</h2>
          {detail.reflection ? (
            <div className="mt-4 space-y-4">
              <div>
                <h3 className="font-semibold">Summary</h3>
                <p className="mt-1 whitespace-pre-wrap text-[var(--muted)]">
                  {detail.reflection.summary}
                </p>
              </div>
              {detail.reflection.whatHappened ? (
                <div>
                  <h3 className="font-semibold">What happened</h3>
                  <p className="mt-1 whitespace-pre-wrap text-[var(--muted)]">
                    {detail.reflection.whatHappened}
                  </p>
                </div>
              ) : null}
              {detail.reflection.whatWorked ? (
                <div>
                  <h3 className="font-semibold">What worked</h3>
                  <p className="mt-1 whitespace-pre-wrap text-[var(--muted)]">
                    {detail.reflection.whatWorked}
                  </p>
                </div>
              ) : null}
              {detail.reflection.whatBlockedMe ? (
                <div>
                  <h3 className="font-semibold">What blocked me</h3>
                  <p className="mt-1 whitespace-pre-wrap text-[var(--muted)]">
                    {detail.reflection.whatBlockedMe}
                  </p>
                </div>
              ) : null}
              {detail.reflection.tomorrowAdjustment ? (
                <div>
                  <h3 className="font-semibold">Tomorrow adjustment</h3>
                  <p className="mt-1 whitespace-pre-wrap text-[var(--muted)]">
                    {detail.reflection.tomorrowAdjustment}
                  </p>
                </div>
              ) : null}
              {detail.reflection.selfCriticismNote ? (
                <div>
                  <h3 className="font-semibold">Self-criticism note</h3>
                  <p className="mt-1 whitespace-pre-wrap text-[var(--muted)]">
                    {detail.reflection.selfCriticismNote}
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState>No reflection imported for this day.</EmptyState>
          )}
        </div>
      </section>
    </div>
  );
}
