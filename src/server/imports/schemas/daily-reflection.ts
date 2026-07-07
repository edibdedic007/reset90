import { z } from "zod";

import {
  dateSchema,
  dayNumberSchema,
  dayStatusSchema,
  nonEmptyText,
  stringList,
} from "./common";
import { contextItemPayloadSchema } from "./context-item";

const scoreSchema = z.number().int().min(1).max(10);

export const reflectionScoresSchema = z.strictObject({
  mood: scoreSchema,
  fog: scoreSchema,
  loneliness: scoreSchema,
  self_criticism: scoreSchema,
  digital_control: scoreSchema,
  learning_resistance: scoreSchema,
  body_relationship: scoreSchema,
  work_confidence: scoreSchema,
});

export const dailyReflectionPayloadSchema = z
  .strictObject({
    date: dateSchema,
    day_number: dayNumberSchema,
    day_status_recommendation: dayStatusSchema,
    summary: nonEmptyText(4_000),
    scores: reflectionScoresSchema,
    what_happened: nonEmptyText(8_000),
    what_worked: stringList(30, 1_000),
    what_blocked_me: stringList(30, 1_000),
    tomorrow_adjustment: nonEmptyText(2_000),
    self_criticism_note: nonEmptyText(2_000),
    context_items: z.array(contextItemPayloadSchema).max(30),
  })
  .meta({ title: "Reset90 Daily Reflection Payload" });

export type DailyReflectionPayload = z.infer<
  typeof dailyReflectionPayloadSchema
>;
