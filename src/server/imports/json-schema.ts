import { z } from "zod";

import {
  contextItemPayloadSchema,
  dailyPlanPayloadSchema,
  dailyReflectionPayloadSchema,
  importEnvelopeSchema,
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
    contextItemPayloadSchema,
    "context-item.schema.json",
  ),
} as const;
