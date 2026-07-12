import { describe, expect, it } from "vitest";

import dailyPlan from "../examples/daily_plan_payload.json";
import dailyReflection from "../examples/daily_reflection_payload.json";
import weeklyReview from "../examples/weekly_review_payload.json";
import {
  contextItemImportSchema,
  dailyReflectionImportSchema,
  importEnvelopeSchema,
  weeklyReviewImportSchema,
} from "../src/server/imports/schemas";

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

  it("accepts user-visible context summaries", () => {
    expect(
      contextItemImportSchema.safeParse({
        kind: "context_item",
        schema_version: "1.0",
        idempotency_key: "context-day-1-summary-v1",
        source: "custom_gpt",
        payload: {
          kind: "reasoning_summary",
          title: "Why minimum work counts",
          summary: "Minimum actions preserve continuity without shame.",
          importance: 4,
          tags: ["minimum", "continuity"],
        },
      }).success,
    ).toBe(true);
  });

  it("rejects hidden reasoning-shaped context fields", () => {
    expect(
      contextItemImportSchema.safeParse({
        kind: "context_item",
        schema_version: "1.0",
        idempotency_key: "context-day-1-hidden-reasoning-v1",
        source: "custom_gpt",
        payload: {
          kind: "reasoning_summary",
          title: "Unsafe payload",
          summary: "Visible summary.",
          importance: 4,
          tags: [],
          chain_of_thought: "private scratchpad",
        },
      }).success,
    ).toBe(false);
  });
});
