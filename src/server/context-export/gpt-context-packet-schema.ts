import { z } from "zod";

import { CONTEXT_KINDS } from "@/lib/context";

export const GPT_CONTEXT_PACKET_SCHEMA_VERSION = "1.0" as const;

const isoDateSchema = z.iso.date();
const dayNumberSchema = z.number().int().min(1).max(90);
const dayStatusSchema = z.enum([
  "GREEN",
  "YELLOW",
  "BLUE",
  "RED",
  "GOLD",
  "UNSET",
]);
const scoreSchema = z.number().int().min(1).max(10);

const taskTierCountSchema = z.strictObject({
  total: z.number().int().min(0).max(110),
  completed: z.number().int().min(0).max(110),
});

const taskCompletionSchema = z.strictObject({
  total: z.number().int().min(0).max(110),
  completed: z.number().int().min(0).max(110),
  by_tier: z.strictObject({
    NON_NEGOTIABLE: taskTierCountSchema,
    MINIMUM: taskTierCountSchema,
    STANDARD: taskTierCountSchema,
    IDEAL: taskTierCountSchema,
  }),
});

const checkinScoresSchema = z.strictObject({
  mood: scoreSchema,
  fog: scoreSchema,
  loneliness: scoreSchema,
  self_criticism: scoreSchema,
  digital_control: scoreSchema,
  learning_resistance: scoreSchema,
  body_relationship: scoreSchema,
  work_confidence: scoreSchema,
});

export const gptContextDaySummarySchema = z.strictObject({
  date: isoDateSchema,
  day_number: dayNumberSchema,
  status: dayStatusSchema,
  mission: z.string().min(1).max(1_000).nullable(),
  task_completion: taskCompletionSchema,
  latest_checkin_scores: checkinScoresSchema.nullable(),
  reflection_summary: z.string().min(1).max(1_500).nullable(),
  is_recovery_day: z.boolean(),
});

const scoreAverageSchema = z
  .strictObject({
    average: z.number().min(1).max(10).nullable(),
    sample_count: z.number().int().min(0).max(7),
  })
  .superRefine((value, context) => {
    if (
      (value.sample_count === 0 && value.average !== null) ||
      (value.sample_count > 0 && value.average === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Average and sample count must describe the same samples",
      });
    }
  });

const statusCountsSchema = z.strictObject({
  GREEN: z.number().int().min(0).max(7),
  YELLOW: z.number().int().min(0).max(7),
  BLUE: z.number().int().min(0).max(7),
  RED: z.number().int().min(0).max(7),
  GOLD: z.number().int().min(0).max(7),
  UNSET: z.number().int().min(0).max(7),
});

const contextTagsSchema = z.array(z.string().min(1).max(40)).max(8);

const contextItemSchema = z.strictObject({
  kind: z.enum(CONTEXT_KINDS),
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(4_000),
  tags: contextTagsSchema,
});

const openDecisionSchema = z.strictObject({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(4_000),
  tags: contextTagsSchema,
});

export const gptContextPacketSchema = z
  .strictObject({
    schema_version: z.literal(GPT_CONTEXT_PACKET_SCHEMA_VERSION),
    generated_at: z.iso.datetime({ offset: true }),
    cycle: z.strictObject({
      start_date: isoDateSchema,
      end_date: isoDateSchema,
      current_day_number: dayNumberSchema.nullable(),
      total_days: dayNumberSchema,
      current_phase_number: z.number().int().min(1).max(3).nullable(),
      current_phase_name: z.string().min(1).max(200).nullable(),
    }),
    current_day: gptContextDaySummarySchema.nullable(),
    recent_days: z.array(gptContextDaySummarySchema).max(3),
    metrics_7d: z.strictObject({
      window_start_date: isoDateSchema.nullable(),
      window_end_date: isoDateSchema.nullable(),
      cycle_date_count: z.number().int().min(0).max(7),
      dates_with_checkins: z.number().int().min(0).max(7),
      status_counts: statusCountsSchema,
      checkin_averages: z.strictObject({
        mood: scoreAverageSchema,
        fog: scoreAverageSchema,
        loneliness: scoreAverageSchema,
        self_criticism: scoreAverageSchema,
        digital_control: scoreAverageSchema,
        learning_resistance: scoreAverageSchema,
        body_relationship: scoreAverageSchema,
        work_confidence: scoreAverageSchema,
      }),
      completed_recovery_events: z.number().int().min(0).max(7),
    }),
    active_patterns: z
      .array(
        z.strictObject({
          title: z.string().min(1).max(300),
          evidence: z.string().min(1).max(2_000),
        }),
      )
      .max(10),
    pinned_context: z.array(contextItemSchema).max(12),
    recovery: z.strictObject({
      configured_credit_allowance: z.number().int().min(0).nullable(),
      credits_used: z.number().int().min(0),
      credits_remaining: z.number().int().min(0),
      completed_events_7d: z.number().int().min(0).max(7),
      current_day_is_recovery: z.boolean(),
    }),
    open_decisions: z.array(openDecisionSchema).max(10),
  })
  .meta({ title: "Reset90 gpt_context_packet 1.0" });

export type GptContextPacket = z.infer<typeof gptContextPacketSchema>;
export type GptContextDaySummary = z.infer<typeof gptContextDaySummarySchema>;
