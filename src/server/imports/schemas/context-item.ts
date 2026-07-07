import { z } from "zod";

import { nonEmptyText, stringList } from "./common";

export const contextKindSchema = z.enum([
  "conversation",
  "task_summary",
  "decision_log",
  "daily_summary",
  "weekly_summary",
  "context_snapshot",
  "reasoning_summary",
]);

export const contextItemPayloadSchema = z
  .strictObject({
    kind: contextKindSchema,
    title: nonEmptyText(200),
    summary: nonEmptyText(4_000),
    importance: z.number().int().min(1).max(5),
    tags: stringList(20, 80).default([]),
    source_ref: nonEmptyText(500).optional(),
    is_sensitive: z.boolean().optional(),
  })
  .meta({ title: "Reset90 Context Item Payload" });

export type ContextItemPayload = z.infer<typeof contextItemPayloadSchema>;
