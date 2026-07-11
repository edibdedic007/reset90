import type { DayStatus } from "@/generated/prisma/enums";

export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  GREEN: "Green",
  YELLOW: "Yellow",
  BLUE: "Blue",
  RED: "Red",
  GOLD: "Gold",
  UNSET: "Unset",
};

export const DAY_STATUS_CLASSES: Record<DayStatus, string> = {
  GREEN: "border-emerald-500/70 bg-emerald-950/60 text-emerald-100",
  YELLOW: "border-yellow-500/70 bg-yellow-950/60 text-yellow-100",
  BLUE: "border-sky-500/70 bg-sky-950/60 text-sky-100",
  RED: "border-rose-500/70 bg-rose-950/60 text-rose-100",
  GOLD: "border-amber-400/80 bg-amber-950/60 text-amber-100",
  UNSET: "border-slate-600 bg-slate-900/60 text-slate-200",
};

export function buildDayAriaLabel(day: {
  dayNumber: number;
  date: string;
  status: DayStatus | null;
  isCurrent: boolean;
}) {
  const status = day.status ? DAY_STATUS_LABELS[day.status] : "Unavailable";
  return `Day ${day.dayNumber}, ${day.date}, status ${status}${
    day.isCurrent ? ", current day" : ""
  }`;
}
