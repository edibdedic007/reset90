import { z } from "zod";

import { IMPORT_SCHEMA_VERSION, nonEmptyText, sourceSchema } from "./common";
import { contextItemPayloadSchema } from "./context-item";
import { dailyPlanPayloadSchema } from "./daily-plan";
import { dailyReflectionPayloadSchema } from "./daily-reflection";
import { weeklyReviewPayloadSchema } from "./weekly-review";

const envelopeFields = {
  schema_version: z.literal(IMPORT_SCHEMA_VERSION),
  idempotency_key: nonEmptyText(200).min(8),
  source: sourceSchema,
  external_conversation_id: nonEmptyText(500).optional(),
  created_at: z.iso.datetime({ offset: true }).optional(),
};

export const dailyPlanImportSchema = z.strictObject({
  kind: z.literal("daily_plan"),
  ...envelopeFields,
  payload: dailyPlanPayloadSchema,
});

export const dailyReflectionImportSchema = z.strictObject({
  kind: z.literal("daily_reflection"),
  ...envelopeFields,
  payload: dailyReflectionPayloadSchema,
});

export const weeklyReviewImportSchema = z.strictObject({
  kind: z.literal("weekly_review"),
  ...envelopeFields,
  payload: weeklyReviewPayloadSchema,
});

export const contextItemImportSchema = z.strictObject({
  kind: z.literal("context_item"),
  ...envelopeFields,
  payload: contextItemPayloadSchema,
});

export const importEnvelopeSchema = z
  .discriminatedUnion("kind", [
    dailyPlanImportSchema,
    dailyReflectionImportSchema,
    weeklyReviewImportSchema,
    contextItemImportSchema,
  ])
  .meta({ title: "Reset90 Import Envelope" });

export type ImportEnvelope = z.infer<typeof importEnvelopeSchema>;
