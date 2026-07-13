import { z } from "zod";

import {
  IMPORT_SCHEMA_VERSION,
  importKindSchema,
  nonEmptyText,
  sourceSchema,
} from "./common";
import {
  CONTEXT_LIBRARY_SCHEMA_VERSION,
  contextItemPayloadSchema,
  legacyContextItemPayloadSchema,
  LEGACY_CONTEXT_ITEM_SCHEMA_VERSION,
} from "./context-item";
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

export const importEnvelopeMetadataSchema = z.object({
  kind: importKindSchema,
  schema_version: nonEmptyText(50),
  idempotency_key: envelopeFields.idempotency_key,
  source: envelopeFields.source,
  external_conversation_id: envelopeFields.external_conversation_id,
  created_at: envelopeFields.created_at,
});

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

export const legacyContextItemImportSchema = z.strictObject({
  kind: z.literal("context_item"),
  ...envelopeFields,
  schema_version: z.literal(LEGACY_CONTEXT_ITEM_SCHEMA_VERSION),
  payload: legacyContextItemPayloadSchema,
});

export const contextLibraryItemImportSchema = z.strictObject({
  kind: z.literal("context_item"),
  ...envelopeFields,
  schema_version: z.literal(CONTEXT_LIBRARY_SCHEMA_VERSION),
  payload: contextItemPayloadSchema,
});

export const contextItemImportSchema = z.discriminatedUnion("schema_version", [
  legacyContextItemImportSchema,
  contextLibraryItemImportSchema,
]);

export function contextItemImportSchemaForVersion(version: unknown) {
  if (version === LEGACY_CONTEXT_ITEM_SCHEMA_VERSION) {
    return legacyContextItemImportSchema;
  }
  if (version === CONTEXT_LIBRARY_SCHEMA_VERSION) {
    return contextLibraryItemImportSchema;
  }
  return null;
}

export const importEnvelopeSchema = z
  .discriminatedUnion("kind", [
    dailyPlanImportSchema,
    dailyReflectionImportSchema,
    weeklyReviewImportSchema,
    contextItemImportSchema,
  ])
  .meta({ title: "Reset90 Import Envelope" });

export type ImportEnvelope = z.infer<typeof importEnvelopeSchema>;
