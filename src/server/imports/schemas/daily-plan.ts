import { z } from "zod";

import {
  dateSchema,
  dayNumberSchema,
  domainSchema,
  nonEmptyText,
} from "./common";

const taskFields = {
  title: nonEmptyText(200),
  domain: domainSchema,
  estimate_minutes: z.number().int().min(1).max(1_440).optional(),
  trigger: nonEmptyText(500).optional(),
  why: nonEmptyText(1_000).optional(),
};

export const nonNegotiableTaskSchema = z.strictObject({
  ...taskFields,
  tier: z.literal("non_negotiable"),
});

export const minimumTaskSchema = z.strictObject({
  ...taskFields,
  tier: z.literal("minimum"),
});

export const standardTaskSchema = z.strictObject({
  ...taskFields,
  tier: z.literal("standard"),
});

export const idealTaskSchema = z.strictObject({
  ...taskFields,
  tier: z.literal("ideal"),
});

export const dailyPlanPayloadSchema = z
  .strictObject({
    date: dateSchema,
    day_number: dayNumberSchema,
    phase: z.enum(["Clear the Fog", "Rebuild Momentum", "Prove Continuation"]),
    energy_level: z.enum(["low", "normal", "high", "recovery"]),
    mission: nonEmptyText(1_000),
    supportive_message: nonEmptyText(2_000),
    warnings: z.array(nonEmptyText(500)).max(20).default([]),
    downshift_rule: nonEmptyText(1_000),
    non_negotiables: z.array(nonNegotiableTaskSchema).max(20),
    minimum_plan: z.array(minimumTaskSchema).max(30),
    standard_plan: z.array(standardTaskSchema).max(30),
    ideal_plan: z.array(idealTaskSchema).max(30),
    context_summary: nonEmptyText(4_000),
  })
  .meta({ title: "Reset90 Daily Plan Payload" });

export type DailyPlanPayload = z.infer<typeof dailyPlanPayloadSchema>;
