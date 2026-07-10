"use client";

import { useMemo, useState } from "react";

import { CheckinForm } from "@/components/checkin-form";
import type { DayCheckin } from "@/server/checkins";
import type {
  TodayDashboard,
  TodayTask,
  TodayTaskGroups,
} from "@/server/dashboard/today";

type TierKey = keyof TodayTaskGroups;

const taskTiers: readonly TierKey[] = [
  "NON_NEGOTIABLE",
  "MINIMUM",
  "STANDARD",
  "IDEAL",
];

const tierLabels: Record<TierKey, string> = {
  NON_NEGOTIABLE: "Non-negotiables",
  MINIMUM: "Minimum",
  STANDARD: "Standard",
  IDEAL: "Ideal",
};

const tierSubtitles: Record<TierKey, string> = {
  NON_NEGOTIABLE: "Anchors for today.",
  MINIMUM: "Minimum still counts.",
  STANDARD: "Steady execution.",
  IDEAL: "Use only when capacity is real.",
};

const energyOptions = [
  { value: "BURNED_OUT", label: "Burned out" },
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "RESTLESS_CHAOTIC", label: "Restless/chaotic" },
] as const;

type EnergyOption = (typeof energyOptions)[number]["value"];

const statusLabels = {
  UNSET: "Open",
  GREEN: "Standard or ideal",
  YELLOW: "Minimum counts",
  BLUE: "Recovery",
  RED: "Needs reset data",
  GOLD: "Comeback",
} as const;

function formatDomain(domain: string) {
  return domain.toLowerCase().replaceAll("_", " ");
}

function taskCount(groups: TodayTaskGroups) {
  return taskTiers.reduce((count, tier) => count + groups[tier].length, 0);
}

function completedTaskCount(groups: TodayTaskGroups) {
  return taskTiers.reduce(
    (count, tier) =>
      count + groups[tier].filter((task) => task.completedAt !== null).length,
    0,
  );
}

function replaceTask(
  dashboard: TodayDashboard,
  updatedTask: TodayTask,
): TodayDashboard {
  if (dashboard.status !== "ready" || dashboard.plan === null) {
    return dashboard;
  }

  const tasksByTier = { ...dashboard.plan.tasksByTier };
  for (const tier of taskTiers) {
    tasksByTier[tier] = tasksByTier[tier].map((task) =>
      task.id === updatedTask.id ? updatedTask : task,
    );
  }

  return {
    ...dashboard,
    plan: {
      ...dashboard.plan,
      tasksByTier,
    },
  };
}

function replaceEnergy(
  dashboard: TodayDashboard,
  energyLevel: EnergyOption | null,
): TodayDashboard {
  if (dashboard.status !== "ready") {
    return dashboard;
  }

  return {
    ...dashboard,
    day: {
      ...dashboard.day,
      energyLevel,
    },
  };
}

function replaceLatestCheckin(
  dashboard: TodayDashboard,
  checkin: DayCheckin,
): TodayDashboard {
  if (dashboard.status !== "ready") {
    return dashboard;
  }

  return {
    ...dashboard,
    day: {
      ...dashboard.day,
      energyLevel: checkin.energyLevel,
    },
    latestCheckin: checkin,
  };
}

function NoCycleState({ today }: { today: string }) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
      <p className="text-sm text-[var(--muted)]">{today}</p>
      <h1 className="mt-2 text-2xl font-semibold">No active reset cycle.</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        Seed or create one active cycle, then import today&apos;s plan from GPT.
      </p>
    </section>
  );
}

function NoDayState({
  dashboard,
}: {
  dashboard: Extract<TodayDashboard, { status: "no_day" }>;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
      <p className="text-sm text-[var(--muted)]">{dashboard.today}</p>
      <h1 className="mt-2 text-2xl font-semibold">No day log for today.</h1>
      <p className="mt-3 max-w-2xl text-[var(--muted)]">
        Active cycle found: {dashboard.cycle.name}. Today is outside its seeded
        90-day range.
      </p>
    </section>
  );
}

function MetricPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function TaskList({
  busyTaskId,
  onToggleTask,
  tasks,
  tier,
}: {
  busyTaskId: string | null;
  onToggleTask: (task: TodayTask) => void;
  tasks: TodayTask[];
  tier: TierKey;
}) {
  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{tierLabels[tier]}</h2>
          <p className="text-sm text-[var(--muted)]">{tierSubtitles[tier]}</p>
        </div>
        <span className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]">
          {tasks.filter((task) => task.completedAt !== null).length}/
          {tasks.length}
        </span>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No tasks in this tier.</p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const completed = task.completedAt !== null;
            const busy = busyTaskId === task.id;

            return (
              <label
                className="block rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] p-3"
                key={task.id}
              >
                <div className="flex items-start gap-3">
                  <input
                    checked={completed}
                    className="mt-1 h-5 w-5 accent-[var(--accent)]"
                    disabled={busy}
                    onChange={() => onToggleTask(task)}
                    type="checkbox"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{task.title}</p>
                      <span className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]">
                        {formatDomain(task.domain)}
                      </span>
                      {task.estimateMinutes ? (
                        <span className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-[var(--muted)]">
                          {task.estimateMinutes} min
                        </span>
                      ) : null}
                    </div>
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
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function TodayCommandCenter({
  initialDashboard,
}: {
  initialDashboard: TodayDashboard;
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [savingEnergy, setSavingEnergy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const taskStats = useMemo(() => {
    if (dashboard.status !== "ready" || dashboard.plan === null) {
      return { completed: 0, total: 0 };
    }

    return {
      completed: completedTaskCount(dashboard.plan.tasksByTier),
      total: taskCount(dashboard.plan.tasksByTier),
    };
  }, [dashboard]);

  async function toggleTask(task: TodayTask) {
    setBusyTaskId(task.id);
    setNotice(null);

    try {
      const response = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: task.completedAt === null }),
      });

      if (!response.ok) {
        throw new Error("Task update failed");
      }

      const payload = (await response.json()) as {
        ok: true;
        task: TodayTask;
      };
      setDashboard((current) => replaceTask(current, payload.task));
    } catch {
      setNotice("Task update did not save. Try again.");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function updateEnergy(energyLevel: EnergyOption | null) {
    setSavingEnergy(true);
    setNotice(null);

    try {
      const response = await fetch("/api/dashboard/today/energy", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ energyLevel }),
      });

      if (!response.ok) {
        throw new Error("Energy update failed");
      }

      setDashboard((current) => replaceEnergy(current, energyLevel));
    } catch {
      setNotice("Energy update did not save. Try again.");
    } finally {
      setSavingEnergy(false);
    }
  }

  if (dashboard.status === "no_cycle") {
    return <NoCycleState today={dashboard.today} />;
  }

  if (dashboard.status === "no_day") {
    return <NoDayState dashboard={dashboard} />;
  }

  const { cycle, day, plan } = dashboard;
  const currentEnergy = day.energyLevel;
  const showDownshift =
    currentEnergy === "BURNED_OUT" || currentEnergy === "LOW";

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm text-[var(--muted)]">{cycle.name}</p>
            <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">
              Day {day.dayNumber} / 90
            </h1>
            <p className="mt-2 text-lg text-[var(--muted)]">{day.phase.name}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[34rem]">
            <MetricPill label="Status" value={statusLabels[day.status]} />
            <MetricPill
              label="Recovery credits"
              value={`${cycle.recoveryCreditsRemaining} left`}
            />
            <MetricPill
              label="Energy"
              value={
                energyOptions.find((option) => option.value === currentEnergy)
                  ?.label ?? "Unset"
              }
            />
            <MetricPill
              label="Tasks"
              value={`${taskStats.completed}/${taskStats.total}`}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Energy</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Downshift, don&apos;t abandon.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {energyOptions.map((option) => {
              const selected = currentEnergy === option.value;

              return (
                <button
                  aria-pressed={selected}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-60 aria-pressed:border-[var(--accent)] aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--foreground)]"
                  disabled={savingEnergy}
                  key={option.value}
                  onClick={() => updateEnergy(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              );
            })}
            <button
              aria-pressed={currentEnergy === null}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)] disabled:opacity-60 aria-pressed:border-[var(--accent)] aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--foreground)]"
              disabled={savingEnergy}
              onClick={() => updateEnergy(null)}
              type="button"
            >
              Unset
            </button>
          </div>
        </div>
      </section>

      {notice ? (
        <p className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm">
          {notice}
        </p>
      ) : null}

      <CheckinForm
        latestCheckin={dashboard.latestCheckin}
        onCreated={(checkin) =>
          setDashboard((current) => replaceLatestCheckin(current, checkin))
        }
      />

      {plan === null ? (
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="text-xl font-semibold">No imported plan for today.</h2>
          <p className="mt-2 max-w-2xl text-[var(--muted)]">
            Import today&apos;s GPT plan when ready. The day can still receive
            energy updates now.
          </p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-xl font-semibold">Mission</h2>
              <p className="mt-3 text-lg leading-8">{plan.mission}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-xl font-semibold">Support</h2>
              <p className="mt-3 leading-7 text-[var(--muted)]">
                {plan.supportiveMessage}
              </p>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-xl font-semibold">Downshift rule</h2>
              <p className="mt-3 leading-7 text-[var(--muted)]">
                {plan.downshiftRule}
              </p>
              {showDownshift ? (
                <p className="mt-4 rounded-lg border border-[var(--accent)] bg-[var(--accent-soft)] p-3 text-sm">
                  Minimum tier is valid for current energy.
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
              <h2 className="text-xl font-semibold">Context</h2>
              <p className="mt-3 leading-7 text-[var(--muted)]">
                {plan.contextSummary}
              </p>
              {plan.warnings.length > 0 ? (
                <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
                  {plan.warnings.map((warning) => (
                    <li
                      className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] px-3 py-2"
                      key={warning}
                    >
                      {warning}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            {taskTiers.map((tier) => (
              <TaskList
                busyTaskId={busyTaskId}
                key={tier}
                onToggleTask={toggleTask}
                tasks={plan.tasksByTier[tier]}
                tier={tier}
              />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
