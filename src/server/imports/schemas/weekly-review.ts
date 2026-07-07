import { z } from "zod";

import { dateSchema, nonEmptyText, stringList } from "./common";

export const weeklyPatternSchema = z.strictObject({
  title: nonEmptyText(300),
  evidence: nonEmptyText(2_000),
});

export const weeklyMetricsSchema = z.strictObject({
  green_days: z.number().int().min(0).max(7),
  yellow_days: z.number().int().min(0).max(7),
  blue_days: z.number().int().min(0).max(7),
  red_days: z.number().int().min(0).max(7),
  gold_days: z.number().int().min(0).max(7),
  recovery_credits_used: z.number().int().min(0).max(90),
});

export const weeklyContextSnapshotSchema = z.strictObject({
  title: nonEmptyText(200),
  summary: nonEmptyText(4_000),
  reasoning_summary: nonEmptyText(4_000),
  tags: stringList(30, 80),
});

export const weeklyReviewPayloadSchema = z
  .strictObject({
    week_number: z.number().int().min(1).max(13),
    date_from: dateSchema,
    date_to: dateSchema,
    summary: nonEmptyText(6_000),
    wins: stringList(50, 1_000),
    blockers: stringList(50, 1_000),
    patterns: z.array(weeklyPatternSchema).max(30),
    recommended_changes: stringList(30, 1_000),
    next_week_commitments: stringList(30, 1_000),
    metrics: weeklyMetricsSchema,
    context_snapshot: weeklyContextSnapshotSchema,
  })
  .meta({ title: "Reset90 Weekly Review Payload" });

export type WeeklyReviewPayload = z.infer<typeof weeklyReviewPayloadSchema>;
