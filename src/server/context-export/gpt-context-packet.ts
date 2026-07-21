import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import type { DayStatus } from "@/generated/prisma/enums";
import { normalizeContextTags } from "@/lib/context";
import {
  addUtcDays,
  calculateDayNumber,
  normalizeUtcDate,
} from "@/server/db/cycle";
import { weeklyPatternSchema } from "@/server/imports/schemas";
import { writeSafeLogEvent, type SafeLogSink } from "@/server/http/security";
import { calculateDayStatus } from "@/server/recovery/day-status";

import {
  GPT_CONTEXT_PACKET_SCHEMA_VERSION,
  gptContextPacketSchema,
  type GptContextDaySummary,
  type GptContextPacket,
} from "./gpt-context-packet-schema";

export const GPT_CONTEXT_RECENT_DAY_LIMIT = 3;
export const GPT_CONTEXT_METRICS_DAY_LIMIT = 7;
export const GPT_CONTEXT_PATTERN_LIMIT = 10;
export const GPT_CONTEXT_PINNED_LIMIT = 12;
export const GPT_CONTEXT_DECISION_LIMIT = 10;
export const GPT_CONTEXT_TAG_LIMIT = 8;
export const GPT_CONTEXT_PACKET_MAX_BYTES = 32 * 1_024;

const DAY_STATUSES = [
  "GREEN",
  "YELLOW",
  "BLUE",
  "RED",
  "GOLD",
  "UNSET",
] as const satisfies readonly DayStatus[];

const SCORE_FIELDS = [
  "mood",
  "fog",
  "loneliness",
  "self_criticism",
  "digital_control",
  "learning_resistance",
  "body_relationship",
  "work_confidence",
] as const;

const dayLogSelect = {
  date: true,
  dayNumber: true,
  status: true,
  mission: true,
  dailyPlan: {
    select: {
      mission: true,
      tasks: {
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        take: 110,
        select: {
          tier: true,
          completedAt: true,
          skippedAt: true,
        },
      },
    },
  },
  dailyReflection: { select: { summary: true } },
  checkins: {
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    take: 1,
    select: {
      moodScore: true,
      fogScore: true,
      lonelinessScore: true,
      selfCriticismScore: true,
      digitalControlScore: true,
      learningResistanceScore: true,
      bodyRelationshipScore: true,
      workConfidenceScore: true,
    },
  },
  recoveryEvent: {
    select: { completedAt: true, creditConsumedAt: true },
  },
} satisfies Prisma.DayLogSelect;

const contextItemSelect = {
  kind: true,
  title: true,
  summary: true,
  tags: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: GPT_CONTEXT_TAG_LIMIT,
    select: { name: true },
  },
} satisfies Prisma.ContextItemSelect;

type StoredDay = Prisma.DayLogGetPayload<{ select: typeof dayLogSelect }>;
type LatestCheckin = StoredDay["checkins"][number];
type PacketDatabase = Pick<PrismaClient, "$transaction">;

export type GptContextPacketResult =
  | { status: "ready"; packet: GptContextPacket }
  | { status: "no_cycle" }
  | { status: "invariant_error" }
  | { status: "size_error" };

export function gptContextPacketByteLength(packet: GptContextPacket) {
  return new TextEncoder().encode(JSON.stringify(packet)).byteLength;
}

export function fitGptContextPacketToByteLimit(
  packet: GptContextPacket,
): GptContextPacket | null {
  const fitted: GptContextPacket = {
    ...packet,
    active_patterns: [...packet.active_patterns],
    open_decisions: [...packet.open_decisions],
    pinned_context: [...packet.pinned_context],
  };
  let byteLength = gptContextPacketByteLength(fitted);

  while (byteLength > GPT_CONTEXT_PACKET_MAX_BYTES) {
    if (fitted.active_patterns.length > 0) {
      fitted.active_patterns.pop();
    } else if (fitted.open_decisions.length > 0) {
      fitted.open_decisions.pop();
    } else if (fitted.pinned_context.length > 0) {
      fitted.pinned_context.pop();
    } else {
      return null;
    }
    byteLength = gptContextPacketByteLength(fitted);
  }

  return gptContextPacketSchema.parse(fitted);
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function emptyTaskCompletion(): GptContextDaySummary["task_completion"] {
  return {
    total: 0,
    completed: 0,
    by_tier: {
      NON_NEGOTIABLE: { total: 0, completed: 0 },
      MINIMUM: { total: 0, completed: 0 },
      STANDARD: { total: 0, completed: 0 },
      IDEAL: { total: 0, completed: 0 },
    },
  };
}

function taskCompletion(day: StoredDay | undefined) {
  const result = emptyTaskCompletion();
  for (const task of day?.dailyPlan?.tasks ?? []) {
    const completed = task.completedAt !== null && task.skippedAt === null;
    result.total += 1;
    result.by_tier[task.tier].total += 1;
    if (completed) {
      result.completed += 1;
      result.by_tier[task.tier].completed += 1;
    }
  }
  return result;
}

function checkinScores(checkin: LatestCheckin | undefined) {
  if (!checkin) return null;
  return {
    mood: checkin.moodScore,
    fog: checkin.fogScore,
    loneliness: checkin.lonelinessScore,
    self_criticism: checkin.selfCriticismScore,
    digital_control: checkin.digitalControlScore,
    learning_resistance: checkin.learningResistanceScore,
    body_relationship: checkin.bodyRelationshipScore,
    work_confidence: checkin.workConfidenceScore,
  };
}

function canonicalStatus(
  day: StoredDay | undefined,
  date: Date,
  previousStatus: DayStatus | null,
  now: Date,
): DayStatus {
  if (!day) return "UNSET";
  if (day.status !== "UNSET") return day.status;
  return calculateDayStatus({
    date,
    now,
    previousStatus,
    tasks: day.dailyPlan?.tasks ?? [],
    recovery: day.recoveryEvent,
  });
}

function daySummary(
  date: Date,
  dayNumber: number,
  day: StoredDay | undefined,
  status: DayStatus,
): GptContextDaySummary {
  return {
    date: isoDate(date),
    day_number: dayNumber,
    status,
    mission: day?.dailyPlan?.mission ?? day?.mission ?? null,
    task_completion: taskCompletion(day),
    latest_checkin_scores: checkinScores(day?.checkins[0]),
    reflection_summary: day?.dailyReflection?.summary ?? null,
    is_recovery_day: status === "BLUE",
  };
}

function emptyStatusCounts(): Record<DayStatus, number> {
  return Object.fromEntries(
    DAY_STATUSES.map((status) => [status, 0]),
  ) as Record<DayStatus, number>;
}

function scoreAverages(days: readonly GptContextDaySummary[]) {
  return Object.fromEntries(
    SCORE_FIELDS.map((outputField) => {
      const samples = days.flatMap((day) => {
        const scores = day.latest_checkin_scores;
        return scores ? [scores[outputField]] : [];
      });
      const average = samples.length
        ? Math.round(
            (samples.reduce((total, sample) => total + sample, 0) /
              samples.length) *
              100,
          ) / 100
        : null;
      return [outputField, { average, sample_count: samples.length }];
    }),
  ) as GptContextPacket["metrics_7d"]["checkin_averages"];
}

function emptyMetrics(): GptContextPacket["metrics_7d"] {
  return {
    window_start_date: null,
    window_end_date: null,
    cycle_date_count: 0,
    dates_with_checkins: 0,
    status_counts: emptyStatusCounts(),
    checkin_averages: scoreAverages([]),
    completed_recovery_events: 0,
  };
}

function mapTags(item: { tags: Array<{ name: string }> }) {
  return normalizeContextTags(item.tags.map((tag) => tag.name)).slice(
    0,
    GPT_CONTEXT_TAG_LIMIT,
  );
}

export async function assembleGptContextPacket(
  database: PacketDatabase,
  userId: string,
  now = new Date(),
): Promise<GptContextPacketResult> {
  const generatedAt = now.toISOString();
  const today = normalizeUtcDate(now);

  return database.$transaction(
    async (transaction) => {
      const cycles = await transaction.resetCycle.findMany({
        where: { userId, status: "ACTIVE" },
        orderBy: { startDate: "desc" },
        take: 2,
        select: {
          id: true,
          startDate: true,
          endDate: true,
          recoveryCreditLimit: true,
          phases: {
            orderBy: { dayStart: "asc" },
            take: 3,
            select: { name: true, dayStart: true, dayEnd: true },
          },
        },
      });

      if (cycles.length === 0) return { status: "no_cycle" as const };
      if (cycles.length !== 1) return { status: "invariant_error" as const };

      const cycle = cycles[0];
      const totalDays = calculateDayNumber(cycle.startDate, cycle.endDate);
      const candidateDayNumber = calculateDayNumber(cycle.startDate, today);
      const currentDayNumber =
        today >= cycle.startDate && today <= cycle.endDate
          ? candidateDayNumber
          : null;
      const currentPhase =
        currentDayNumber === null
          ? null
          : (cycle.phases.find(
              (phase) =>
                currentDayNumber >= phase.dayStart &&
                currentDayNumber <= phase.dayEnd,
            ) ?? null);
      const currentPhaseNumber = currentPhase
        ? cycle.phases.indexOf(currentPhase) + 1
        : null;

      let summaries: GptContextDaySummary[] = [];
      let metrics = emptyMetrics();

      if (currentDayNumber !== null) {
        const windowStartDayNumber = Math.max(
          1,
          currentDayNumber - (GPT_CONTEXT_METRICS_DAY_LIMIT - 1),
        );
        const windowStartDate = addUtcDays(
          cycle.startDate,
          windowStartDayNumber - 1,
        );
        const priorDate = addUtcDays(windowStartDate, -1);
        const queryStartDate =
          windowStartDayNumber > 1 ? priorDate : windowStartDate;
        const storedDays = await transaction.dayLog.findMany({
          where: {
            cycleId: cycle.id,
            date: { gte: queryStartDate, lte: today },
          },
          orderBy: { date: "asc" },
          take:
            GPT_CONTEXT_METRICS_DAY_LIMIT + (windowStartDayNumber > 1 ? 1 : 0),
          select: dayLogSelect,
        });
        const storedByDate = new Map(
          storedDays.map((day) => [isoDate(day.date), day]),
        );

        let previousStatus: DayStatus | null = null;
        if (windowStartDayNumber > 1) {
          const prior = storedByDate.get(isoDate(priorDate));
          previousStatus = canonicalStatus(prior, priorDate, null, now);
        }

        summaries = Array.from(
          { length: currentDayNumber - windowStartDayNumber + 1 },
          (_, index) => {
            const dayNumber = windowStartDayNumber + index;
            const date = addUtcDays(cycle.startDate, dayNumber - 1);
            const stored = storedByDate.get(isoDate(date));
            const status = canonicalStatus(stored, date, previousStatus, now);
            previousStatus = status;
            return daySummary(date, dayNumber, stored, status);
          },
        );

        const statusCounts = emptyStatusCounts();
        for (const summary of summaries) statusCounts[summary.status] += 1;
        metrics = {
          window_start_date: isoDate(windowStartDate),
          window_end_date: isoDate(today),
          cycle_date_count: summaries.length,
          dates_with_checkins: summaries.filter(
            (summary) => summary.latest_checkin_scores !== null,
          ).length,
          status_counts: statusCounts,
          checkin_averages: scoreAverages(summaries),
          completed_recovery_events: summaries.filter((summary) => {
            const day = storedByDate.get(summary.date);
            return day?.recoveryEvent?.completedAt != null;
          }).length,
        };
      }

      const [newestReview, pinnedItems, openDecisions, creditsUsed] =
        await Promise.all([
          transaction.weeklyReview.findFirst({
            where: { cycleId: cycle.id },
            orderBy: [
              { dateTo: "desc" },
              { createdAt: "desc" },
              { id: "desc" },
            ],
            select: { patternsJson: true },
          }),
          transaction.contextItem.findMany({
            where: { cycleId: cycle.id, pinnedAt: { not: null } },
            orderBy: [
              { pinnedAt: "desc" },
              { createdAt: "desc" },
              { id: "desc" },
            ],
            take: GPT_CONTEXT_PINNED_LIMIT,
            select: contextItemSelect,
          }),
          transaction.contextItem.findMany({
            where: {
              cycleId: cycle.id,
              kind: "DECISION",
              tags: { some: { normalizedName: "open" } },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: GPT_CONTEXT_DECISION_LIMIT,
            select: contextItemSelect,
          }),
          transaction.recoveryEvent.count({
            where: { cycleId: cycle.id, creditConsumedAt: { not: null } },
          }),
        ]);

      const parsedPatterns = weeklyPatternSchema
        .array()
        .max(30)
        .safeParse(newestReview?.patternsJson ?? []);
      const activePatterns = parsedPatterns.success
        ? parsedPatterns.data.slice(0, GPT_CONTEXT_PATTERN_LIMIT)
        : [];
      const recentDays = summaries.slice(-GPT_CONTEXT_RECENT_DAY_LIMIT);
      const currentDay = recentDays.at(-1) ?? null;
      const completedEvents = metrics.completed_recovery_events;

      const packet = gptContextPacketSchema.parse({
        schema_version: GPT_CONTEXT_PACKET_SCHEMA_VERSION,
        generated_at: generatedAt,
        cycle: {
          start_date: isoDate(cycle.startDate),
          end_date: isoDate(cycle.endDate),
          current_day_number: currentDayNumber,
          total_days: totalDays,
          current_phase_number: currentPhaseNumber,
          current_phase_name: currentPhase?.name ?? null,
        },
        current_day: currentDay,
        recent_days: recentDays,
        metrics_7d: metrics,
        active_patterns: activePatterns,
        pinned_context: pinnedItems
          .slice(0, GPT_CONTEXT_PINNED_LIMIT)
          .map((item) => ({
            kind: item.kind,
            title: item.title,
            summary: item.summary,
            tags: mapTags(item),
          })),
        recovery: {
          configured_credit_allowance: cycle.recoveryCreditLimit,
          credits_used: creditsUsed,
          credits_remaining: Math.max(
            cycle.recoveryCreditLimit - creditsUsed,
            0,
          ),
          completed_events_7d: completedEvents,
          current_day_is_recovery: currentDay?.is_recovery_day ?? false,
        },
        open_decisions: openDecisions
          .slice(0, GPT_CONTEXT_DECISION_LIMIT)
          .map((item) => ({
            title: item.title,
            summary: item.summary,
            tags: mapTags(item),
          })),
      });

      const fittedPacket = fitGptContextPacketToByteLimit(packet);
      return fittedPacket
        ? { status: "ready" as const, packet: fittedPacket }
        : { status: "size_error" as const };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export type GptContextPacketHttpDependencies = {
  getSession: () => Promise<{ userId: string } | null>;
  getDatabase: () => PacketDatabase;
  now?: () => Date;
  logSink?: SafeLogSink;
};

function safeError(error: string, message: string, status: number) {
  return Response.json({ ok: false, error, message }, { status });
}

export async function handleGptContextPacketRequest(
  request: Request,
  dependencies: GptContextPacketHttpDependencies,
): Promise<Response> {
  try {
    const session = await dependencies.getSession();
    if (!session) {
      return safeError(
        "unauthorized",
        "Authentication is required to export GPT context.",
        401,
      );
    }
    if (new URL(request.url).searchParams.size > 0) {
      return safeError(
        "invalid_context_export_request",
        "GPT context export does not accept selection parameters.",
        400,
      );
    }

    const now = dependencies.now?.() ?? new Date();
    const result = await assembleGptContextPacket(
      dependencies.getDatabase(),
      session.userId,
      now,
    );
    if (result.status === "no_cycle") {
      return safeError(
        "no_active_cycle",
        "No active Reset Cycle exists. Start one before exporting GPT context.",
        404,
      );
    }
    if (result.status === "invariant_error") {
      return safeError(
        "active_cycle_invariant",
        "Reset Cycle state is inconsistent. GPT context was not exported.",
        409,
      );
    }
    if (result.status === "size_error") {
      return safeError(
        "context_export_too_large",
        "GPT context packet could not be generated within safe size limits.",
        500,
      );
    }

    const date = isoDate(now);
    return new Response(JSON.stringify(result.packet), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="reset90-gpt-context-${date}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    writeSafeLogEvent(
      {
        event: "request_failed",
        operation: "context.export",
        code: "context_export_failed",
        httpStatus: 500,
        correlationId: crypto.randomUUID(),
      },
      dependencies.logSink,
    );
    return safeError(
      "context_export_failed",
      "GPT context packet could not be generated. Try again.",
      500,
    );
  }
}
