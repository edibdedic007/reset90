import { z } from "zod";

import {
  dateSchema,
  dayNumberSchema,
  dayStatusSchema,
  resetPhaseNameSchema,
} from "./common";

const requiredReflectionText = z.string().trim().min(1).max(1_500);
const optionalReflectionText = z.string().trim().max(1_500).optional();
const optionalSelfCriticismNote = z.string().trim().max(1_000).optional();

export const dailyReflectionPayloadSchema = z
  .strictObject({
    date: dateSchema,
    day_number: dayNumberSchema,
    phase: resetPhaseNameSchema.optional(),
    summary: requiredReflectionText,
    what_happened: optionalReflectionText,
    what_worked: optionalReflectionText,
    what_blocked_me: optionalReflectionText,
    tomorrow_adjustment: optionalReflectionText,
    self_criticism_note: optionalSelfCriticismNote,
    day_status_recommendation: dayStatusSchema.optional(),
  })
  .meta({ title: "Reset90 Daily Reflection Payload" });

export type DailyReflectionPayload = z.infer<
  typeof dailyReflectionPayloadSchema
>;
