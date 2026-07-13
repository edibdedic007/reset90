import { z } from "zod";

import {
  CONTEXT_DOMAINS,
  CONTEXT_KINDS,
  normalizeContextTags,
} from "../../../lib/context";

export const contextKindSchema = z.enum(CONTEXT_KINDS);
export const contextDomainSchema = z.enum(CONTEXT_DOMAINS);

const contextTitleSchema = z.string().trim().min(1).max(160);
const contextSummarySchema = z.string().trim().min(1).max(4_000);
const contextSourceRefSchema = z.string().trim().min(1).max(500);
const contextTagsSchema = z
  .array(z.string().trim().min(1).max(40))
  .max(10)
  .overwrite(normalizeContextTags);

export const contextItemPayloadSchema = z
  .strictObject({
    kind: contextKindSchema,
    domain: contextDomainSchema,
    title: contextTitleSchema,
    summary: contextSummarySchema,
    tags: contextTagsSchema.default([]),
    source_ref: contextSourceRefSchema.optional(),
  })
  .meta({ title: "Reset90 Context Item Payload" });

export type ContextItemPayload = z.infer<typeof contextItemPayloadSchema>;
