import { z } from "zod";

import { gptContextPacketSchema } from "../context-export/gpt-context-packet-schema";

import {
  contextItemPayloadSchema,
  dailyPlanPayloadSchema,
  dailyReflectionPayloadSchema,
  importEnvelopeSchema,
  legacyContextItemPayloadSchema,
  weeklyReviewPayloadSchema,
} from "./schemas";

const JSON_SCHEMA_BASE = "https://reset90.local/schemas";

function toJsonSchema(
  schema: z.ZodType,
  fileName: string,
): Record<string, unknown> {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `${JSON_SCHEMA_BASE}/${fileName}`,
    ...z.toJSONSchema(schema, { target: "draft-2020-12" }),
  };
}

export const jsonSchemaDocuments = {
  "import-envelope.schema.json": toJsonSchema(
    importEnvelopeSchema,
    "import-envelope.schema.json",
  ),
  "daily-plan.schema.json": toJsonSchema(
    dailyPlanPayloadSchema,
    "daily-plan.schema.json",
  ),
  "daily-reflection.schema.json": toJsonSchema(
    dailyReflectionPayloadSchema,
    "daily-reflection.schema.json",
  ),
  "weekly-review.schema.json": toJsonSchema(
    weeklyReviewPayloadSchema,
    "weekly-review.schema.json",
  ),
  "context-item.schema.json": toJsonSchema(
    legacyContextItemPayloadSchema,
    "context-item.schema.json",
  ),
  "context-item-v2.schema.json": toJsonSchema(
    contextItemPayloadSchema,
    "context-item-v2.schema.json",
  ),
  "gpt-context-packet.schema.json": toJsonSchema(
    gptContextPacketSchema,
    "gpt-context-packet.schema.json",
  ),
} as const;
