import type { PrismaClient } from "@/generated/prisma/client";

export const FULL_EXPORT_TYPE = "reset90_full_export" as const;
export const FULL_EXPORT_SCHEMA_VERSION = "1.0" as const;
export const RAW_IMPORT_SCOPE = "linked_owned_records_only" as const;

export const USER_DATA_EXPORT_KINDS = [
  "full-json",
  "day-logs-csv",
  "tasks-csv",
  "checkins-csv",
  "summaries-markdown",
] as const;

export type UserDataExportKind = (typeof USER_DATA_EXPORT_KINDS)[number];
export type UserDataExportDatabase = Pick<PrismaClient, "$transaction">;

function isoTimestamp(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export async function assembleUserDataExport(
  database: UserDataExportDatabase,
  userId: string,
  generatedAt: Date,
) {
  return database.$transaction(
    async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          displayName: true,
          createdAt: true,
          updatedAt: true,
          resetCycles: {
            orderBy: [{ startDate: "asc" }, { id: "asc" }],
            select: {
              id: true,
              userId: true,
              name: true,
              startDate: true,
              endDate: true,
              status: true,
              recoveryCreditLimit: true,
              createdAt: true,
              updatedAt: true,
              phases: {
                orderBy: [{ dayStart: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  cycleId: true,
                  name: true,
                  dayStart: true,
                  dayEnd: true,
                  description: true,
                },
              },
              dayLogs: {
                orderBy: [{ dayNumber: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  cycleId: true,
                  phaseId: true,
                  date: true,
                  dayNumber: true,
                  energyLevel: true,
                  status: true,
                  mission: true,
                  supportiveMessage: true,
                  notes: true,
                  createdAt: true,
                  updatedAt: true,
                  dailyPlan: {
                    select: {
                      id: true,
                      dayLogId: true,
                      importedPayloadId: true,
                      source: true,
                      schemaVersion: true,
                      mission: true,
                      supportiveMessage: true,
                      warnings: true,
                      downshiftRule: true,
                      contextSummary: true,
                      createdAt: true,
                      updatedAt: true,
                      tasks: {
                        orderBy: [
                          { tier: "asc" },
                          { sortOrder: "asc" },
                          { id: "asc" },
                        ],
                        select: {
                          id: true,
                          dailyPlanId: true,
                          title: true,
                          description: true,
                          domain: true,
                          tier: true,
                          estimateMinutes: true,
                          trigger: true,
                          why: true,
                          completedAt: true,
                          skippedAt: true,
                          notes: true,
                          sortOrder: true,
                          createdAt: true,
                          updatedAt: true,
                        },
                      },
                    },
                  },
                  dailyReflection: {
                    select: {
                      id: true,
                      dayLogId: true,
                      importedPayloadId: true,
                      summary: true,
                      whatHappened: true,
                      whatWorked: true,
                      whatBlockedMe: true,
                      tomorrowAdjustment: true,
                      selfCriticismNote: true,
                      dayStatusRecommendation: true,
                      createdAt: true,
                      updatedAt: true,
                    },
                  },
                  checkins: {
                    orderBy: [{ timestamp: "asc" }, { id: "asc" }],
                    select: {
                      id: true,
                      dayLogId: true,
                      kind: true,
                      timestamp: true,
                      energyLevel: true,
                      moodScore: true,
                      fogScore: true,
                      lonelinessScore: true,
                      selfCriticismScore: true,
                      digitalControlScore: true,
                      learningResistanceScore: true,
                      bodyRelationshipScore: true,
                      workConfidenceScore: true,
                      note: true,
                    },
                  },
                  recoveryEvent: {
                    select: {
                      id: true,
                      cycleId: true,
                      dayLogId: true,
                      selectedActionIds: true,
                      startedAt: true,
                      completedAt: true,
                      creditConsumedAt: true,
                    },
                  },
                },
              },
              weeklyReviews: {
                orderBy: [{ weekNumber: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  cycleId: true,
                  importedPayloadId: true,
                  weekNumber: true,
                  dateFrom: true,
                  dateTo: true,
                  summary: true,
                  winsJson: true,
                  blockersJson: true,
                  patternsJson: true,
                  recommendedChangesJson: true,
                  nextWeekCommitmentsJson: true,
                  metricsJson: true,
                  createdAt: true,
                  updatedAt: true,
                },
              },
              contextItems: {
                orderBy: [{ createdAt: "asc" }, { id: "asc" }],
                select: {
                  id: true,
                  cycleId: true,
                  kind: true,
                  domain: true,
                  title: true,
                  summary: true,
                  sourceType: true,
                  importedPayloadId: true,
                  sourceRef: true,
                  pinnedAt: true,
                  createdAt: true,
                  updatedAt: true,
                  tags: {
                    orderBy: [{ normalizedName: "asc" }, { id: "asc" }],
                    select: {
                      id: true,
                      contextItemId: true,
                      name: true,
                      normalizedName: true,
                      createdAt: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (!user) return null;

      const rawImportIds = new Set<string>();
      for (const cycle of user.resetCycles) {
        for (const dayLog of cycle.dayLogs) {
          if (dayLog.dailyPlan) {
            rawImportIds.add(dayLog.dailyPlan.importedPayloadId);
          }
          if (dayLog.dailyReflection) {
            rawImportIds.add(dayLog.dailyReflection.importedPayloadId);
          }
        }
        for (const review of cycle.weeklyReviews) {
          rawImportIds.add(review.importedPayloadId);
        }
        for (const item of cycle.contextItems) {
          if (item.importedPayloadId) rawImportIds.add(item.importedPayloadId);
        }
      }

      const importedPayloadRows = rawImportIds.size
        ? await transaction.importedPayload.findMany({
            where: { id: { in: [...rawImportIds] } },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              kind: true,
              schemaVersion: true,
              idempotencyKey: true,
              source: true,
              externalConversationId: true,
              rawJson: true,
              validationStatus: true,
              processingStatus: true,
              errorMetadata: true,
              processedAt: true,
              createdAt: true,
            },
          })
        : [];

      const resetCycles = user.resetCycles.map((cycle) => ({
        id: cycle.id,
        user_id: cycle.userId,
        name: cycle.name,
        start_date: isoDate(cycle.startDate),
        end_date: isoDate(cycle.endDate),
        status: cycle.status,
        recovery_credit_limit: cycle.recoveryCreditLimit,
        created_at: isoTimestamp(cycle.createdAt),
        updated_at: isoTimestamp(cycle.updatedAt),
      }));
      const resetPhases = user.resetCycles.flatMap((cycle) =>
        cycle.phases.map((phase) => ({
          id: phase.id,
          cycle_id: phase.cycleId,
          name: phase.name,
          day_start: phase.dayStart,
          day_end: phase.dayEnd,
          description: phase.description,
        })),
      );
      const dayLogs = user.resetCycles.flatMap((cycle) =>
        cycle.dayLogs.map((dayLog) => ({
          id: dayLog.id,
          cycle_id: dayLog.cycleId,
          phase_id: dayLog.phaseId,
          date: isoDate(dayLog.date),
          day_number: dayLog.dayNumber,
          energy_level: dayLog.energyLevel,
          status: dayLog.status,
          mission: dayLog.mission,
          supportive_message: dayLog.supportiveMessage,
          notes: dayLog.notes,
          created_at: isoTimestamp(dayLog.createdAt),
          updated_at: isoTimestamp(dayLog.updatedAt),
        })),
      );
      const dailyPlans = user.resetCycles.flatMap((cycle) =>
        cycle.dayLogs.flatMap((dayLog) =>
          dayLog.dailyPlan
            ? [
                {
                  id: dayLog.dailyPlan.id,
                  day_log_id: dayLog.dailyPlan.dayLogId,
                  imported_payload_id: dayLog.dailyPlan.importedPayloadId,
                  source: dayLog.dailyPlan.source,
                  schema_version: dayLog.dailyPlan.schemaVersion,
                  mission: dayLog.dailyPlan.mission,
                  supportive_message: dayLog.dailyPlan.supportiveMessage,
                  warnings: dayLog.dailyPlan.warnings,
                  downshift_rule: dayLog.dailyPlan.downshiftRule,
                  context_summary: dayLog.dailyPlan.contextSummary,
                  created_at: isoTimestamp(dayLog.dailyPlan.createdAt),
                  updated_at: isoTimestamp(dayLog.dailyPlan.updatedAt),
                },
              ]
            : [],
        ),
      );
      const tasks = user.resetCycles.flatMap((cycle) =>
        cycle.dayLogs.flatMap((dayLog) =>
          (dayLog.dailyPlan?.tasks ?? []).map((task) => ({
            id: task.id,
            daily_plan_id: task.dailyPlanId,
            title: task.title,
            description: task.description,
            domain: task.domain,
            tier: task.tier,
            estimate_minutes: task.estimateMinutes,
            trigger: task.trigger,
            reason: task.why,
            completed_at: isoTimestamp(task.completedAt),
            skipped_at: isoTimestamp(task.skippedAt),
            notes: task.notes,
            sort_order: task.sortOrder,
            created_at: isoTimestamp(task.createdAt),
            updated_at: isoTimestamp(task.updatedAt),
          })),
        ),
      );
      const checkins = user.resetCycles.flatMap((cycle) =>
        cycle.dayLogs.flatMap((dayLog) =>
          dayLog.checkins.map((checkin) => ({
            id: checkin.id,
            day_log_id: checkin.dayLogId,
            kind: checkin.kind,
            timestamp: isoTimestamp(checkin.timestamp),
            energy_level: checkin.energyLevel,
            mood_score: checkin.moodScore,
            fog_score: checkin.fogScore,
            loneliness_score: checkin.lonelinessScore,
            self_criticism_score: checkin.selfCriticismScore,
            digital_control_score: checkin.digitalControlScore,
            learning_resistance_score: checkin.learningResistanceScore,
            body_relationship_score: checkin.bodyRelationshipScore,
            work_confidence_score: checkin.workConfidenceScore,
            note: checkin.note,
          })),
        ),
      );
      const recoveryEvents = user.resetCycles.flatMap((cycle) =>
        cycle.dayLogs.flatMap((dayLog) =>
          dayLog.recoveryEvent
            ? [
                {
                  id: dayLog.recoveryEvent.id,
                  cycle_id: dayLog.recoveryEvent.cycleId,
                  day_log_id: dayLog.recoveryEvent.dayLogId,
                  selected_action_ids: dayLog.recoveryEvent.selectedActionIds,
                  started_at: isoTimestamp(dayLog.recoveryEvent.startedAt),
                  completed_at: isoTimestamp(dayLog.recoveryEvent.completedAt),
                  credit_consumed_at: isoTimestamp(
                    dayLog.recoveryEvent.creditConsumedAt,
                  ),
                },
              ]
            : [],
        ),
      );
      const dailyReflections = user.resetCycles.flatMap((cycle) =>
        cycle.dayLogs.flatMap((dayLog) =>
          dayLog.dailyReflection
            ? [
                {
                  id: dayLog.dailyReflection.id,
                  day_log_id: dayLog.dailyReflection.dayLogId,
                  imported_payload_id: dayLog.dailyReflection.importedPayloadId,
                  summary: dayLog.dailyReflection.summary,
                  what_happened: dayLog.dailyReflection.whatHappened,
                  what_worked: dayLog.dailyReflection.whatWorked,
                  what_blocked_me: dayLog.dailyReflection.whatBlockedMe,
                  tomorrow_adjustment:
                    dayLog.dailyReflection.tomorrowAdjustment,
                  self_criticism_note: dayLog.dailyReflection.selfCriticismNote,
                  day_status_recommendation:
                    dayLog.dailyReflection.dayStatusRecommendation,
                  created_at: isoTimestamp(dayLog.dailyReflection.createdAt),
                  updated_at: isoTimestamp(dayLog.dailyReflection.updatedAt),
                },
              ]
            : [],
        ),
      );
      const weeklyReviews = user.resetCycles.flatMap((cycle) =>
        cycle.weeklyReviews.map((review) => ({
          id: review.id,
          cycle_id: review.cycleId,
          imported_payload_id: review.importedPayloadId,
          week_number: review.weekNumber,
          date_from: isoDate(review.dateFrom),
          date_to: isoDate(review.dateTo),
          summary: review.summary,
          wins: review.winsJson,
          blockers: review.blockersJson,
          patterns: review.patternsJson,
          recommended_changes: review.recommendedChangesJson,
          next_week_commitments: review.nextWeekCommitmentsJson,
          metrics: review.metricsJson,
          created_at: isoTimestamp(review.createdAt),
          updated_at: isoTimestamp(review.updatedAt),
        })),
      );
      const contextItems = user.resetCycles.flatMap((cycle) =>
        cycle.contextItems.map((item) => ({
          id: item.id,
          cycle_id: item.cycleId,
          kind: item.kind,
          domain: item.domain,
          title: item.title,
          summary: item.summary,
          source_type: item.sourceType,
          imported_payload_id: item.importedPayloadId,
          source_ref: item.sourceRef,
          pinned_at: isoTimestamp(item.pinnedAt),
          created_at: isoTimestamp(item.createdAt),
          updated_at: isoTimestamp(item.updatedAt),
        })),
      );
      const contextTags = user.resetCycles.flatMap((cycle) =>
        cycle.contextItems.flatMap((item) =>
          item.tags.map((tag) => ({
            id: tag.id,
            context_item_id: tag.contextItemId,
            name: tag.name,
            normalized_name: tag.normalizedName,
            created_at: isoTimestamp(tag.createdAt),
          })),
        ),
      );
      const importedPayloads = importedPayloadRows.map((payload) => ({
        id: payload.id,
        kind: payload.kind,
        schema_version: payload.schemaVersion,
        idempotency_key: payload.idempotencyKey,
        source: payload.source,
        external_conversation_id: payload.externalConversationId,
        raw_json: payload.rawJson,
        validation_status: payload.validationStatus,
        processing_status: payload.processingStatus,
        error_metadata: payload.errorMetadata,
        processed_at: isoTimestamp(payload.processedAt),
        created_at: isoTimestamp(payload.createdAt),
      }));

      const recordCounts = {
        reset_cycles: resetCycles.length,
        reset_phases: resetPhases.length,
        day_logs: dayLogs.length,
        daily_plans: dailyPlans.length,
        tasks: tasks.length,
        checkins: checkins.length,
        recovery_events: recoveryEvents.length,
        daily_reflections: dailyReflections.length,
        weekly_reviews: weeklyReviews.length,
        context_items: contextItems.length,
        context_tags: contextTags.length,
        imported_payloads: importedPayloads.length,
      };

      return {
        export_type: FULL_EXPORT_TYPE,
        schema_version: FULL_EXPORT_SCHEMA_VERSION,
        generated_at: generatedAt.toISOString(),
        manifest: {
          record_counts: recordCounts,
          raw_import_scope: RAW_IMPORT_SCOPE,
        },
        user: {
          id: user.id,
          email: user.email,
          display_name: user.displayName,
          created_at: isoTimestamp(user.createdAt),
          updated_at: isoTimestamp(user.updatedAt),
        },
        reset_cycles: resetCycles,
        reset_phases: resetPhases,
        day_logs: dayLogs,
        daily_plans: dailyPlans,
        tasks,
        checkins,
        recovery_events: recoveryEvents,
        daily_reflections: dailyReflections,
        weekly_reviews: weeklyReviews,
        context_items: contextItems,
        context_tags: contextTags,
        imported_payloads: importedPayloads,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

export type FullUserDataExport = NonNullable<
  Awaited<ReturnType<typeof assembleUserDataExport>>
>;

export function serializeFullJsonExport(data: FullUserDataExport): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (
    typeof value === "string" &&
    /^[\u0000-\u0020\u007f]*[=+\-@]/.test(value)
  ) {
    text = `'${value}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")
    .concat("\r\n");
}

export const DAY_LOG_CSV_HEADERS = [
  "day_log_id",
  "cycle_id",
  "phase_id",
  "date",
  "day_number",
  "energy_level",
  "status",
  "mission",
  "supportive_message",
  "notes",
  "created_at",
  "updated_at",
] as const;

export function serializeDayLogsCsv(data: FullUserDataExport): string {
  return csv(
    DAY_LOG_CSV_HEADERS,
    data.day_logs.map((row) => [
      row.id,
      row.cycle_id,
      row.phase_id,
      row.date,
      row.day_number,
      row.energy_level,
      row.status,
      row.mission,
      row.supportive_message,
      row.notes,
      row.created_at,
      row.updated_at,
    ]),
  );
}

export const TASK_CSV_HEADERS = [
  "task_id",
  "daily_plan_id",
  "day_log_id",
  "cycle_id",
  "title",
  "description",
  "domain",
  "tier",
  "estimate_minutes",
  "trigger",
  "reason",
  "completed_at",
  "skipped_at",
  "notes",
  "sort_order",
  "created_at",
  "updated_at",
] as const;

export function serializeTasksCsv(data: FullUserDataExport): string {
  const plans = new Map(
    data.daily_plans.map((plan) => [plan.id, plan.day_log_id]),
  );
  const days = new Map(data.day_logs.map((day) => [day.id, day.cycle_id]));
  return csv(
    TASK_CSV_HEADERS,
    data.tasks.map((row) => {
      const dayLogId = plans.get(row.daily_plan_id) ?? "";
      return [
        row.id,
        row.daily_plan_id,
        dayLogId,
        days.get(dayLogId) ?? "",
        row.title,
        row.description,
        row.domain,
        row.tier,
        row.estimate_minutes,
        row.trigger,
        row.reason,
        row.completed_at,
        row.skipped_at,
        row.notes,
        row.sort_order,
        row.created_at,
        row.updated_at,
      ];
    }),
  );
}

export const CHECKIN_CSV_HEADERS = [
  "checkin_id",
  "day_log_id",
  "cycle_id",
  "kind",
  "timestamp",
  "energy_level",
  "mood_score",
  "fog_score",
  "loneliness_score",
  "self_criticism_score",
  "digital_control_score",
  "learning_resistance_score",
  "body_relationship_score",
  "work_confidence_score",
  "note",
] as const;

export function serializeCheckinsCsv(data: FullUserDataExport): string {
  const days = new Map(data.day_logs.map((day) => [day.id, day.cycle_id]));
  return csv(
    CHECKIN_CSV_HEADERS,
    data.checkins.map((row) => [
      row.id,
      row.day_log_id,
      days.get(row.day_log_id) ?? "",
      row.kind,
      row.timestamp,
      row.energy_level,
      row.mood_score,
      row.fog_score,
      row.loneliness_score,
      row.self_criticism_score,
      row.digital_control_score,
      row.learning_resistance_score,
      row.body_relationship_score,
      row.work_confidence_score,
      row.note,
    ]),
  );
}

function blockquote(value: string): string {
  return value
    .split(/\r\n|\r|\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function indentedJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

export function serializeSummariesMarkdown(data: FullUserDataExport): string {
  const lines = ["# Reset90 stored summaries", ""];
  if (data.reset_cycles.length === 0) {
    lines.push("No stored weekly-review or cycle-report summaries exist.", "");
    return lines.join("\n");
  }

  for (const cycle of data.reset_cycles) {
    lines.push(
      `## Cycle ${cycle.id}`,
      "",
      "**Name**",
      blockquote(cycle.name),
      "",
    );
    const reviews = data.weekly_reviews.filter(
      (review) => review.cycle_id === cycle.id,
    );
    lines.push("### Weekly reviews", "");
    if (reviews.length === 0) {
      lines.push("No weekly reviews have been stored for this cycle.", "");
    } else {
      for (const review of reviews) {
        lines.push(
          `#### Week ${review.week_number} (${review.date_from} to ${review.date_to})`,
          "",
          "**Summary**",
          blockquote(review.summary),
          "",
          "**Wins**",
          indentedJson(review.wins),
          "",
          "**Blockers**",
          indentedJson(review.blockers),
          "",
          "**Patterns**",
          indentedJson(review.patterns),
          "",
          "**Recommended changes**",
          indentedJson(review.recommended_changes),
          "",
          "**Next-week commitments**",
          indentedJson(review.next_week_commitments),
          "",
          "**Stored metrics**",
          indentedJson(review.metrics),
          "",
        );
      }
    }

    const reports = data.context_items.filter(
      (item) => item.cycle_id === cycle.id && item.kind === "CYCLE_REPORT",
    );
    lines.push("### Stored cycle reports", "");
    if (reports.length === 0) {
      lines.push("No stored cycle report exists for this cycle.", "");
    } else {
      for (const [index, report] of reports.entries()) {
        lines.push(
          `#### Cycle report ${index + 1}`,
          "",
          "**Title**",
          blockquote(report.title),
          "",
          "**Summary**",
          blockquote(report.summary),
          "",
        );
      }
    }
  }
  return lines.join("\n");
}

type ExportSessionResult =
  | { status: "unauthenticated" }
  | { status: "user_not_found" }
  | { status: "authenticated"; session: { userId: string } };

export type UserDataExportHttpDependencies = {
  getSessionResult: () => Promise<ExportSessionResult>;
  getDatabase: () => UserDataExportDatabase;
  now?: () => Date;
  serializers?: UserDataExportSerializers;
};

const PRIVATE_NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

function safeError(error: string, message: string, status: number) {
  return Response.json(
    { ok: false, error, message },
    { status, headers: PRIVATE_NO_STORE_HEADERS },
  );
}

function isExportKind(value: string): value is UserDataExportKind {
  return USER_DATA_EXPORT_KINDS.some((kind) => kind === value);
}

function filenameTimestamp(value: Date): string {
  return value
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(":", "-");
}

export type UserDataExportSerializers = Record<
  UserDataExportKind,
  (data: FullUserDataExport) => string
>;

const DEFAULT_USER_DATA_EXPORT_SERIALIZERS: UserDataExportSerializers = {
  "full-json": serializeFullJsonExport,
  "day-logs-csv": serializeDayLogsCsv,
  "tasks-csv": serializeTasksCsv,
  "checkins-csv": serializeCheckinsCsv,
  "summaries-markdown": serializeSummariesMarkdown,
};

function serializeRequestedExport(
  format: UserDataExportKind,
  data: FullUserDataExport,
  timestamp: string,
  serializers: UserDataExportSerializers,
) {
  switch (format) {
    case "full-json":
      return {
        body: serializers[format](data),
        contentType: "application/json; charset=utf-8",
        filename: `reset90-full-export-${timestamp}.json`,
      };
    case "day-logs-csv":
      return {
        body: serializers[format](data),
        contentType: "text/csv; charset=utf-8",
        filename: `reset90-day-logs-${timestamp}.csv`,
      };
    case "tasks-csv":
      return {
        body: serializers[format](data),
        contentType: "text/csv; charset=utf-8",
        filename: `reset90-tasks-${timestamp}.csv`,
      };
    case "checkins-csv":
      return {
        body: serializers[format](data),
        contentType: "text/csv; charset=utf-8",
        filename: `reset90-checkins-${timestamp}.csv`,
      };
    case "summaries-markdown":
      return {
        body: serializers[format](data),
        contentType: "text/markdown; charset=utf-8",
        filename: `reset90-summaries-${timestamp}.md`,
      };
  }
}

export async function handleUserDataExportRequest(
  request: Request,
  format: string,
  dependencies: UserDataExportHttpDependencies,
): Promise<Response> {
  try {
    const sessionResult = await dependencies.getSessionResult();
    if (sessionResult.status === "unauthenticated") {
      return safeError(
        "unauthorized",
        "A browser session is required to export Reset90 data.",
        401,
      );
    }
    if (sessionResult.status === "user_not_found") {
      return safeError(
        "application_user_not_found",
        "No Reset90 user exists for this authenticated session.",
        404,
      );
    }
    if (new URL(request.url).searchParams.size > 0) {
      return safeError(
        "invalid_export_request",
        "Data export does not accept selection parameters.",
        400,
      );
    }
    if (!isExportKind(format)) {
      return safeError("export_not_found", "Export format was not found.", 404);
    }

    const now = dependencies.now?.() ?? new Date();
    const data = await assembleUserDataExport(
      dependencies.getDatabase(),
      sessionResult.session.userId,
      now,
    );
    if (!data) {
      return safeError(
        "application_user_not_found",
        "No Reset90 user exists for this authenticated session.",
        404,
      );
    }

    const variant = serializeRequestedExport(
      format,
      data,
      filenameTimestamp(now),
      dependencies.serializers ?? DEFAULT_USER_DATA_EXPORT_SERIALIZERS,
    );
    return new Response(variant.body, {
      status: 200,
      headers: {
        "Content-Type": variant.contentType,
        "Content-Disposition": `attachment; filename="${variant.filename}"`,
        ...PRIVATE_NO_STORE_HEADERS,
      },
    });
  } catch {
    return safeError(
      "export_failed",
      "Reset90 data could not be exported. Try again.",
      500,
    );
  }
}
