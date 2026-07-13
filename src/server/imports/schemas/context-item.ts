import { z } from "zod";

import {
  CONTEXT_DOMAINS,
  CONTEXT_KINDS,
  normalizeContextTags,
} from "../../../lib/context";
import { IMPORT_SCHEMA_VERSION } from "./common";

export const LEGACY_CONTEXT_ITEM_SCHEMA_VERSION = IMPORT_SCHEMA_VERSION;
export const CONTEXT_LIBRARY_SCHEMA_VERSION = "2.0" as const;

export const legacyContextKindSchema = z.enum([
  "conversation",
  "task_summary",
  "decision_log",
  "daily_summary",
  "weekly_summary",
  "context_snapshot",
  "reasoning_summary",
]);

export const legacyContextItemPayloadSchema = z
  .strictObject({
    kind: legacyContextKindSchema,
    title: z.string().min(1).max(200).regex(/\S/, "Must contain visible text"),
    summary: z
      .string()
      .min(1)
      .max(4_000)
      .regex(/\S/, "Must contain visible text"),
    importance: z.number().int().min(1).max(5),
    tags: z
      .array(z.string().min(1).max(80).regex(/\S/, "Must contain visible text"))
      .max(20)
      .optional(),
    source_ref: z
      .string()
      .min(1)
      .max(500)
      .regex(/\S/, "Must contain visible text")
      .optional(),
    is_sensitive: z.boolean().optional(),
  })
  .overwrite((value) => ({ ...value, tags: value.tags ?? [] }))
  .meta({ title: "Reset90 Legacy Context Item Payload 1.0" });

export const contextKindSchema = z.enum(CONTEXT_KINDS);
export const contextDomainSchema = z.enum(CONTEXT_DOMAINS);

function trimmedVisibleText(maximumLength: number) {
  return z
    .string()
    .regex(
      new RegExp(`^\\s*\\S(?:[\\s\\S]{0,${maximumLength - 2}}\\S)?\\s*$`),
      `Must contain 1-${maximumLength} visible trimmed characters`,
    )
    .overwrite((value) => value.trim());
}

const contextTitleSchema = trimmedVisibleText(160);
const contextSummarySchema = trimmedVisibleText(4_000);
const contextSourceRefSchema = trimmedVisibleText(500);
const contextTagsSchema = z
  .array(trimmedVisibleText(40))
  .max(10)
  .overwrite(normalizeContextTags);

export const contextItemPayloadSchema = z
  .strictObject({
    kind: contextKindSchema,
    domain: contextDomainSchema,
    title: contextTitleSchema,
    summary: contextSummarySchema,
    tags: contextTagsSchema.optional(),
    source_ref: contextSourceRefSchema.optional(),
  })
  .overwrite((value) => ({ ...value, tags: value.tags ?? [] }))
  .meta({ title: "Reset90 Context Library Item Payload 2.0" });

export type ContextItemPayload = z.infer<typeof contextItemPayloadSchema>;
