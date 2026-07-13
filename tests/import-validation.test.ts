import { describe, expect, it } from "vitest";

import dailyPlan from "../examples/daily_plan_payload.json";
import dailyReflection from "../examples/daily_reflection_payload.json";
import contextItemJsonSchema from "../schemas/context-item.schema.json";
import weeklyReview from "../examples/weekly_review_payload.json";
import { CONTEXT_DOMAINS, CONTEXT_KINDS } from "../src/lib/context";
import {
  CONTEXT_LIBRARY_SCHEMA_VERSION,
  contextItemImportSchemaForVersion,
  contextItemImportSchema,
  contextItemPayloadSchema,
  contextLibraryItemImportSchema,
  dailyReflectionImportSchema,
  importEnvelopeSchema,
  legacyContextItemImportSchema,
  LEGACY_CONTEXT_ITEM_SCHEMA_VERSION,
  weeklyReviewImportSchema,
} from "../src/server/imports/schemas";

type JsonSchema = {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
};

function acceptsJsonSchema(schema: JsonSchema, value: unknown): boolean {
  if (schema.const !== undefined && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "string") {
    if (typeof value !== "string") return false;
    if (schema.minLength !== undefined && value.length < schema.minLength)
      return false;
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      return false;
    return schema.pattern ? new RegExp(schema.pattern).test(value) : true;
  }
  if (schema.type === "array") {
    return (
      Array.isArray(value) &&
      (schema.maxItems === undefined || value.length <= schema.maxItems) &&
      (!schema.items ||
        value.every((item) => acceptsJsonSchema(schema.items!, item)))
    );
  }
  if (schema.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value))
      return false;
    const record = value as Record<string, unknown>;
    if (schema.required?.some((key) => !(key in record))) return false;
    if (
      schema.additionalProperties === false &&
      Object.keys(record).some((key) => !(key in (schema.properties ?? {})))
    )
      return false;
    return Object.entries(record).every(
      ([key, item]) =>
        !schema.properties?.[key] ||
        acceptsJsonSchema(schema.properties[key], item),
    );
  }
  return true;
}

describe("canonical GPT import validation", () => {
  it.each([
    ["daily plan", dailyPlan],
    ["daily reflection", dailyReflection],
    ["weekly review", weeklyReview],
  ])("accepts valid %s example", (_name, payload) => {
    expect(importEnvelopeSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects an unsupported schema version", () => {
    expect(
      importEnvelopeSchema.safeParse({
        ...dailyPlan,
        schema_version: "2.0",
      }).success,
    ).toBe(false);
  });

  it("rejects a task whose tier does not match its plan group", () => {
    const invalid = structuredClone(dailyPlan);
    invalid.payload.minimum_plan[0].tier = "ideal";

    const result = importEnvelopeSchema.safeParse(invalid);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual([
        "payload",
        "minimum_plan",
        0,
        "tier",
      ]);
    }
  });

  it("accepts a minimal daily reflection", () => {
    const minimal = structuredClone(dailyReflection);
    Reflect.deleteProperty(minimal.payload, "phase");
    Reflect.deleteProperty(minimal.payload, "day_status_recommendation");
    Reflect.deleteProperty(minimal.payload, "what_happened");
    Reflect.deleteProperty(minimal.payload, "what_worked");
    Reflect.deleteProperty(minimal.payload, "what_blocked_me");
    Reflect.deleteProperty(minimal.payload, "tomorrow_adjustment");
    Reflect.deleteProperty(minimal.payload, "self_criticism_note");

    expect(dailyReflectionImportSchema.safeParse(minimal).success).toBe(true);
  });

  it("rejects the wrong reflection payload kind", () => {
    expect(
      dailyReflectionImportSchema.safeParse({
        ...dailyReflection,
        kind: "daily_plan",
      }).success,
    ).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["blank", "   \n  "],
    ["oversized", "x".repeat(1_501)],
  ])("rejects a %s reflection summary", (_name, summary) => {
    const invalid = structuredClone(dailyReflection);
    if (summary === undefined) {
      Reflect.deleteProperty(invalid.payload, "summary");
    } else {
      invalid.payload.summary = summary;
    }

    expect(importEnvelopeSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects oversized optional reflection text", () => {
    const invalid = structuredClone(dailyReflection);
    invalid.payload.what_happened = "x".repeat(1_501);

    expect(importEnvelopeSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects an oversized self-criticism note", () => {
    const invalid = structuredClone(dailyReflection);
    invalid.payload.self_criticism_note = "x".repeat(1_001);

    expect(importEnvelopeSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects an invalid day-status recommendation", () => {
    const invalid = structuredClone(dailyReflection) as unknown as {
      payload: { day_status_recommendation: string };
    };
    invalid.payload.day_status_recommendation = "complete";

    expect(importEnvelopeSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects unknown reflection properties", () => {
    const invalid = structuredClone(dailyReflection) as unknown as {
      payload: Record<string, unknown>;
    };
    invalid.payload.userId = "another-user";

    expect(importEnvelopeSchema.safeParse(invalid).success).toBe(false);
  });

  it.each([
    ["invalid date", { date: "2026-02-30" }],
    ["invalid day number", { day_number: 0 }],
  ])("rejects %s", (_name, payloadChange) => {
    const invalid = structuredClone(dailyReflection) as unknown as {
      payload: Record<string, unknown>;
    };
    Object.assign(invalid.payload, payloadChange);

    expect(importEnvelopeSchema.safeParse(invalid).success).toBe(false);
  });

  it("trims text while preserving Unicode and multiline content", () => {
    const valid = structuredClone(dailyReflection);
    valid.payload.summary = "  Napredak ✅\nDrugi red.  ";
    valid.payload.what_happened = "  Prvi red.\nDrugi red.  ";

    const result = dailyReflectionImportSchema.parse(valid);

    expect(result.payload.summary).toBe("Napredak ✅\nDrugi red.");
    expect(result.payload.what_happened).toBe("Prvi red.\nDrugi red.");
  });

  it("accepts blank optional reflection fields for null normalization", () => {
    const valid = structuredClone(dailyReflection);
    valid.payload.what_worked = "  ";

    expect(dailyReflectionImportSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects extra envelope fields", () => {
    expect(
      importEnvelopeSchema.safeParse({
        ...weeklyReview,
        raw_reasoning: "must not be accepted",
      }).success,
    ).toBe(false);
  });

  it("accepts week 13, empty structured lists, and Unicode multiline content", () => {
    const valid = structuredClone(weeklyReview);
    valid.payload.week_number = 13;
    valid.payload.date_from = "2026-09-23";
    valid.payload.date_to = "2026-09-28";
    valid.payload.summary = "Sedmica 13 ✅\nMirna završnica.";
    valid.payload.wins = [];
    valid.payload.blockers = [];
    valid.payload.patterns = [];
    valid.payload.recommended_changes = [];
    valid.payload.next_week_commitments = [];

    expect(weeklyReviewImportSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ["week zero", { week_number: 0 }],
    ["week fourteen", { week_number: 14 }],
    ["non-integer week", { week_number: 1.5 }],
    ["malformed start date", { date_from: "2026-02-30" }],
    ["malformed end date", { date_to: "not-a-date" }],
  ])("rejects weekly review with %s", (_name, change) => {
    const invalid = structuredClone(weeklyReview) as unknown as {
      payload: Record<string, unknown>;
    };
    Object.assign(invalid.payload, change);
    expect(weeklyReviewImportSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects a reversed weekly date range", () => {
    const invalid = structuredClone(weeklyReview);
    invalid.payload.date_from = "2026-07-07";
    invalid.payload.date_to = "2026-07-01";
    expect(weeklyReviewImportSchema.safeParse(invalid).success).toBe(false);
  });

  it.each([
    ["malformed metrics", { green_days: -1 }],
    ["malformed recovery usage", { recovery_credits_used: 91 }],
  ])("rejects weekly review with %s", (_name, metricsChange) => {
    const invalid = structuredClone(weeklyReview);
    Object.assign(invalid.payload.metrics, metricsChange);
    expect(weeklyReviewImportSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects unknown weekly fields", () => {
    const invalid = structuredClone(weeklyReview) as unknown as {
      payload: Record<string, unknown>;
    };
    invalid.payload.user_id = "foreign-owner";
    expect(weeklyReviewImportSchema.safeParse(invalid).success).toBe(false);
  });

  it.each([
    ["oversized summary", () => "x".repeat(6_001)],
    ["missing summary", () => undefined],
    ["oversized wins", () => Array.from({ length: 51 }, () => "win")],
    ["oversized win text", () => ["x".repeat(1_001)]],
  ])("rejects weekly review with %s", (_name, value) => {
    const invalid = structuredClone(weeklyReview) as unknown as {
      payload: Record<string, unknown>;
    };
    const nextValue = value();
    if (nextValue === undefined)
      Reflect.deleteProperty(invalid.payload, "summary");
    else if (_name === "oversized summary") invalid.payload.summary = nextValue;
    else invalid.payload.wins = nextValue;
    expect(weeklyReviewImportSchema.safeParse(invalid).success).toBe(false);
  });

  const validContextImport = {
    kind: "context_item" as const,
    schema_version: CONTEXT_LIBRARY_SCHEMA_VERSION,
    idempotency_key: "context-day-1-summary-v1",
    source: "custom_gpt" as const,
    payload: {
      kind: "DECISION" as const,
      domain: "WORK" as const,
      title: "Why minimum work counts",
      summary: "Minimum actions preserve continuity without shame.",
      tags: ["minimum", "continuity"],
      source_ref: "visible-reference",
    },
  };

  const validLegacyContextImport = {
    kind: "context_item" as const,
    schema_version: LEGACY_CONTEXT_ITEM_SCHEMA_VERSION,
    idempotency_key: "legacy-context-item-v1",
    source: "custom_gpt" as const,
    payload: {
      kind: "decision_log" as const,
      title: "Legacy decision",
      summary: "Published 1.0 content remains valid.",
      importance: 4,
      tags: ["legacy"],
      source_ref: "legacy-visible-reference",
      is_sensitive: true,
    },
  };

  it("preserves the published legacy context-item 1.0 contract", () => {
    expect(
      legacyContextItemImportSchema.safeParse(validLegacyContextImport).success,
    ).toBe(true);
    expect(
      importEnvelopeSchema.safeParse(validLegacyContextImport).success,
    ).toBe(true);
    const withoutTags = structuredClone(validLegacyContextImport);
    Reflect.deleteProperty(withoutTags.payload, "tags");
    expect(
      legacyContextItemImportSchema.parse(withoutTags).payload.tags,
    ).toEqual([]);
  });

  it("dispatches each context version only to its declared contract", () => {
    expect(
      contextItemImportSchemaForVersion(LEGACY_CONTEXT_ITEM_SCHEMA_VERSION),
    ).toBe(legacyContextItemImportSchema);
    expect(
      contextItemImportSchemaForVersion(CONTEXT_LIBRARY_SCHEMA_VERSION),
    ).toBe(contextLibraryItemImportSchema);
    expect(contextItemImportSchemaForVersion("3.0")).toBeNull();
    expect(
      contextLibraryItemImportSchema.safeParse(validLegacyContextImport)
        .success,
    ).toBe(false);
    expect(
      legacyContextItemImportSchema.safeParse(validContextImport).success,
    ).toBe(false);
    expect(
      contextItemImportSchema.safeParse(validLegacyContextImport).success,
    ).toBe(true);
    expect(contextItemImportSchema.safeParse(validContextImport).success).toBe(
      true,
    );
  });

  it.each(CONTEXT_KINDS)("accepts context kind %s", (kind) => {
    expect(
      contextItemImportSchema.safeParse({
        ...validContextImport,
        payload: { ...validContextImport.payload, kind },
      }).success,
    ).toBe(true);
  });

  it.each(CONTEXT_DOMAINS)("accepts context domain %s", (domain) => {
    expect(
      contextItemImportSchema.safeParse({
        ...validContextImport,
        payload: { ...validContextImport.payload, domain },
      }).success,
    ).toBe(true);
  });

  it.each([
    ["unknown kind", { kind: "REASONING_SUMMARY" }],
    ["unknown domain", { domain: "FINANCE" }],
    ["blank title", { title: "  \n " }],
    ["blank summary", { summary: "  " }],
    ["oversized title", { title: "x".repeat(161) }],
    ["oversized summary", { summary: "x".repeat(4_001) }],
    ["oversized source reference", { source_ref: "x".repeat(501) }],
    ["excess tags", { tags: Array.from({ length: 11 }, (_, i) => `tag-${i}`) }],
    ["blank tag", { tags: ["work", "  "] }],
    ["oversized tag", { tags: ["x".repeat(41)] }],
  ])("rejects context payload with %s", (_name, change) => {
    expect(
      contextItemImportSchema.safeParse({
        ...validContextImport,
        payload: { ...validContextImport.payload, ...change },
      }).success,
    ).toBe(false);
  });

  it("trims context text and deduplicates tags case-insensitively", () => {
    const parsed = contextItemImportSchema.parse({
      ...validContextImport,
      payload: {
        ...validContextImport.payload,
        title: "  Decision title  ",
        summary: "  Visible summary.  ",
        tags: ["Work", "work", " work ", "Continuity"],
      },
    });
    expect(parsed.payload.title).toBe("Decision title");
    expect(parsed.payload.summary).toBe("Visible summary.");
    expect(parsed.payload.tags).toEqual(["Work", "Continuity"]);
  });

  it("defaults omitted Context Library tags to an empty list", () => {
    const withoutTags = structuredClone(validContextImport);
    Reflect.deleteProperty(withoutTags.payload, "tags");

    expect(contextItemImportSchema.parse(withoutTags).payload.tags).toEqual([]);
  });

  it.each([
    ["valid payload without tags", { tags: undefined }, true],
    ["valid payload with tags", { tags: ["work", " bounded "] }, true],
    ["whitespace-only title", { title: "  \n " }, false],
    ["whitespace-only summary", { summary: "  " }, false],
    ["whitespace-only tag", { tags: ["work", "  "] }, false],
    ["omitted source reference", { source_ref: undefined }, true],
    ["whitespace-only source reference", { source_ref: "  " }, false],
    ["unknown property", { raw_prompt: "private" }, false],
    ["oversized title", { title: "x".repeat(161) }, false],
    ["oversized summary", { summary: "x".repeat(4_001) }, false],
    ["oversized tag", { tags: ["x".repeat(41)] }, false],
    ["oversized source reference", { source_ref: "x".repeat(501) }, false],
  ])(
    "keeps runtime and generated Context Library contracts aligned for %s",
    (_name, change, expected) => {
      const payload: Record<string, unknown> = {
        ...validContextImport.payload,
        ...change,
      };
      for (const [key, value] of Object.entries(change)) {
        if (value === undefined) Reflect.deleteProperty(payload, key);
      }

      expect(contextItemPayloadSchema.safeParse(payload).success).toBe(
        expected,
      );
      expect(acceptsJsonSchema(contextItemJsonSchema, payload)).toBe(expected);
    },
  );

  it.each([
    "chain_of_thought",
    "reasoning_summary",
    "reasoning_trace",
    "raw_prompt",
    "tool_trace",
    "user_id",
    "cycle_id",
    "pinned_at",
  ])("rejects forbidden context property %s", (property) => {
    expect(
      contextItemImportSchema.safeParse({
        ...validContextImport,
        payload: {
          ...validContextImport.payload,
          [property]: "RAW_PRIVATE_SENTINEL_CONTEXT_15",
        },
      }).success,
    ).toBe(false);
  });
});
