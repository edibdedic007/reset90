import { describe, expect, it } from "vitest";

import dailyPlan from "../examples/daily_plan_payload.json";
import dailyReflection from "../examples/daily_reflection_payload.json";
import weeklyReview from "../examples/weekly_review_payload.json";
import {
  contextItemImportSchema,
  importEnvelopeSchema,
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

  it("rejects reflection scores outside 1 through 10", () => {
    const invalid = structuredClone(dailyReflection);
    invalid.payload.scores.fog = 11;

    expect(importEnvelopeSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects extra envelope fields", () => {
    expect(
      importEnvelopeSchema.safeParse({
        ...weeklyReview,
        raw_reasoning: "must not be accepted",
      }).success,
    ).toBe(false);
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
