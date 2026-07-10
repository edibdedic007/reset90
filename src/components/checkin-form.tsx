"use client";

import { useState, type FormEvent } from "react";

import type { CheckinScores, DayCheckin } from "@/server/checkins";

const kindOptions = [
  { value: "MORNING", label: "Morning" },
  { value: "MIDDAY", label: "Midday" },
  { value: "EVENING", label: "Evening" },
  { value: "MANUAL", label: "Manual" },
] as const;

const energyOptions = [
  { value: "BURNED_OUT", label: "Burned out" },
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "RESTLESS_CHAOTIC", label: "Restless/chaotic" },
] as const;

const scoreFields = [
  { key: "mood", label: "Mood", low: "Difficult", high: "Strong" },
  { key: "fog", label: "Fog / clarity", low: "Clear", high: "Foggy" },
  {
    key: "selfCriticism",
    label: "Self-criticism",
    low: "Quiet",
    high: "Intense",
  },
  {
    key: "loneliness",
    label: "Loneliness",
    low: "Connected",
    high: "Lonely",
  },
  {
    key: "digitalControl",
    label: "Digital control / risk",
    low: "At risk",
    high: "In control",
  },
  {
    key: "learningResistance",
    label: "Learning resistance",
    low: "Open",
    high: "Resistant",
  },
  {
    key: "bodyRelationship",
    label: "Body relationship",
    low: "Strained",
    high: "Supportive",
  },
  {
    key: "workConfidence",
    label: "Work confidence",
    low: "Low",
    high: "Strong",
  },
] as const satisfies ReadonlyArray<{
  key: keyof CheckinScores;
  label: string;
  low: string;
  high: string;
}>;

const defaultScores: CheckinScores = {
  mood: 5,
  fog: 5,
  loneliness: 5,
  selfCriticism: 5,
  digitalControl: 5,
  learningResistance: 5,
  bodyRelationship: 5,
  workConfidence: 5,
};

type CheckinKindOption = (typeof kindOptions)[number]["value"];
type EnergyOption = (typeof energyOptions)[number]["value"];

function formatCheckinTime(timestamp: string) {
  return `${timestamp.slice(0, 10)} ${timestamp.slice(11, 16)} UTC`;
}

function LatestCheckin({ checkin }: { checkin: DayCheckin | null }) {
  if (!checkin) {
    return (
      <p className="text-sm text-[var(--muted)]">
        No check-in yet. A neutral 5 is fine when state feels mixed.
      </p>
    );
  }

  const kindLabel =
    kindOptions.find((option) => option.value === checkin.kind)?.label ??
    checkin.kind;
  const energyLabel =
    energyOptions.find((option) => option.value === checkin.energyLevel)
      ?.label ?? checkin.energyLevel;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-lg border border-[var(--border)] px-2 py-1">
          {kindLabel}
        </span>
        <span className="text-[var(--muted)]">
          {formatCheckinTime(checkin.timestamp)}
        </span>
        <span className="text-[var(--muted)]">Energy: {energyLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {scoreFields.map((field) => (
          <div
            className="rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
            key={field.key}
          >
            <p className="text-xs text-[var(--muted)]">{field.label}</p>
            <p className="mt-1 font-semibold">{checkin.scores[field.key]}/10</p>
          </div>
        ))}
      </div>
      {checkin.note ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2 text-sm text-[var(--muted)]">
          {checkin.note}
        </p>
      ) : null}
    </div>
  );
}

export function CheckinForm({
  latestCheckin,
  onCreated,
}: {
  latestCheckin: DayCheckin | null;
  onCreated: (checkin: DayCheckin) => void;
}) {
  const [kind, setKind] = useState<CheckinKindOption>("MANUAL");
  const [energyLevel, setEnergyLevel] = useState<EnergyOption>(
    latestCheckin?.energyLevel ?? "NORMAL",
  );
  const [scores, setScores] = useState<CheckinScores>(
    latestCheckin?.scores ?? defaultScores,
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(latestCheckin === null);

  async function submitCheckin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const response = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          energyLevel,
          ...scores,
          note: note.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Check-in failed");
      }

      const payload = (await response.json()) as {
        ok: true;
        checkin: DayCheckin;
      };
      onCreated(payload.checkin);
      setNote("");
      setNotice("Check-in saved. This is data for today.");
    } catch {
      setNotice("Check-in did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Latest check-in</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Quick day-state snapshot, not a journal.
        </p>
      </div>

      <div className="mt-4">
        <LatestCheckin checkin={latestCheckin} />
      </div>

      <details
        className="mt-5"
        onToggle={(event) => setFormOpen(event.currentTarget.open)}
        open={formOpen}
      >
        <summary className="cursor-pointer font-medium">Add check-in</summary>
        <form className="mt-4 space-y-5" onSubmit={submitCheckin}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm">
              <span className="font-medium">Moment</span>
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
                disabled={saving}
                onChange={(event) =>
                  setKind(event.target.value as CheckinKindOption)
                }
                value={kind}
              >
                {kindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm">
              <span className="font-medium">Energy</span>
              <select
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
                disabled={saving}
                onChange={(event) =>
                  setEnergyLevel(event.target.value as EnergyOption)
                }
                value={energyLevel}
              >
                {energyOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {scoreFields.map((field) => (
              <label
                className="rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] p-3"
                key={field.key}
              >
                <span className="flex items-center justify-between gap-3 text-sm font-medium">
                  <span>{field.label}</span>
                  <span>{scores[field.key]}/10</span>
                </span>
                <input
                  aria-label={field.label}
                  className="mt-3 w-full accent-[var(--accent)]"
                  disabled={saving}
                  max="10"
                  min="1"
                  onChange={(event) =>
                    setScores((current) => ({
                      ...current,
                      [field.key]: Number(event.target.value),
                    }))
                  }
                  step="1"
                  type="range"
                  value={scores[field.key]}
                />
                <span className="mt-1 flex justify-between text-xs text-[var(--muted)]">
                  <span>1 · {field.low}</span>
                  <span>10 · {field.high}</span>
                </span>
              </label>
            ))}
          </div>

          <label className="block space-y-2 text-sm">
            <span className="font-medium">Short note (optional)</span>
            <textarea
              className="min-h-20 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-3 py-2"
              disabled={saving}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="One useful sentence, if needed."
              value={note}
            />
            <span className="text-xs text-[var(--muted)]">
              {note.length}/500
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={saving}
              type="submit"
            >
              {saving ? "Saving…" : "Save check-in"}
            </button>
            {notice ? (
              <p aria-live="polite" className="text-sm text-[var(--muted)]">
                {notice}
              </p>
            ) : null}
          </div>
        </form>
      </details>
    </section>
  );
}
