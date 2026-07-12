import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ReviewsPageContent } from "../src/components/reviews-page";
import {
  getReviewsDashboard,
  type ReviewsDatabase,
  type ReviewsDashboard,
  type WeeklyReviewSummary,
} from "../src/server/reviews";

const REVIEW_ROW = {
  weekNumber: 2,
  dateFrom: new Date("2026-07-08T00:00:00.000Z"),
  dateTo: new Date("2026-07-14T00:00:00.000Z"),
  summary: "Second week summary.",
  winsJson: ["First win", "Second win"],
  blockersJson: ["One blocker"],
  patternsJson: [
    { title: "Small starts help", evidence: "Short tasks reduced resistance." },
  ],
  recommendedChangesJson: ["Keep tasks concrete"],
  nextWeekCommitmentsJson: ["Move daily"],
  metricsJson: {
    green_days: 2,
    yellow_days: 3,
    blue_days: 1,
    red_days: 1,
    gold_days: 0,
    recovery_credits_used: 1,
  },
  createdAt: new Date("2026-07-15T08:00:00.000Z"),
  updatedAt: new Date("2026-07-15T08:05:00.000Z"),
  importedPayload: { rawJson: { private: "RAW_ONLY_SENTINEL_REVIEW_44" } },
};

function databaseWithCycles(cycles: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(cycles);
  return {
    database: { resetCycle: { findMany } } as unknown as ReviewsDatabase,
    findMany,
  };
}

function review(
  overrides: Partial<WeeklyReviewSummary> = {},
): WeeklyReviewSummary {
  return {
    weekNumber: 1,
    dateFrom: "2026-07-01",
    dateTo: "2026-07-07",
    summary: "Week summary.",
    wins: ["Win one", "Win two"],
    blockers: ["Blocker one"],
    patterns: [{ title: "Pattern", evidence: "Evidence" }],
    recommendedChanges: ["Change one"],
    nextWeekCommitments: ["Commitment one"],
    metrics: {
      greenDays: 2,
      yellowDays: 3,
      blueDays: 1,
      redDays: 1,
      goldDays: 0,
      recoveryCreditsUsed: 1,
    },
    createdAt: "2026-07-08T08:00:00.000Z",
    updatedAt: "2026-07-08T08:05:00.000Z",
    ...overrides,
  };
}

describe("owned weekly review reads", () => {
  it("queries only authenticated active-cycle normalized reviews newest first", async () => {
    const { database, findMany } = databaseWithCycles([
      { name: "My Reset", weeklyReviews: [REVIEW_ROW] },
    ]);

    await expect(getReviewsDashboard(database, "user-1")).resolves.toEqual({
      status: "ready",
      cycleName: "My Reset",
      reviews: [
        {
          weekNumber: 2,
          dateFrom: "2026-07-08",
          dateTo: "2026-07-14",
          summary: "Second week summary.",
          wins: ["First win", "Second win"],
          blockers: ["One blocker"],
          patterns: [
            {
              title: "Small starts help",
              evidence: "Short tasks reduced resistance.",
            },
          ],
          recommendedChanges: ["Keep tasks concrete"],
          nextWeekCommitments: ["Move daily"],
          metrics: {
            greenDays: 2,
            yellowDays: 3,
            blueDays: 1,
            redDays: 1,
            goldDays: 0,
            recoveryCreditsUsed: 1,
          },
          createdAt: "2026-07-15T08:00:00.000Z",
          updatedAt: "2026-07-15T08:05:00.000Z",
        },
      ],
    });

    const query = findMany.mock.calls[0]?.[0];
    expect(query.where).toEqual({ userId: "user-1", status: "ACTIVE" });
    expect(query.take).toBe(2);
    expect(query.select.weeklyReviews.orderBy).toEqual({ weekNumber: "desc" });
    expect(query.select.weeklyReviews.select).not.toHaveProperty("id");
    expect(query.select.weeklyReviews.select).not.toHaveProperty("cycleId");
    expect(query.select.weeklyReviews.select).not.toHaveProperty(
      "importedPayload",
    );
    expect(
      JSON.stringify(await getReviewsDashboard(database, "user-1")),
    ).not.toContain("RAW_ONLY_SENTINEL_REVIEW_44");
  });

  it.each([
    ["no active cycle", []],
    [
      "ambiguous active cycles",
      [
        { name: "Cycle one", weeklyReviews: [] },
        { name: "Cycle two", weeklyReviews: [] },
      ],
    ],
  ])("returns protected no-cycle state for %s", async (_name, cycles) => {
    const { database } = databaseWithCycles(cycles);
    await expect(getReviewsDashboard(database, "user-2")).resolves.toEqual({
      status: "no_cycle",
    });
  });
});

describe("Reviews page", () => {
  it("renders newest first, preserves list order, escapes text, and labels snapshots", () => {
    const dashboard: ReviewsDashboard = {
      status: "ready",
      cycleName: "My Reset",
      reviews: [
        review({
          weekNumber: 2,
          dateFrom: "2026-07-08",
          dateTo: "2026-07-14",
          summary: "<script>unsafe()</script>\nSecond line",
          wins: ["First ordered win", "Second ordered win"],
        }),
        review(),
      ],
    };
    const html = renderToStaticMarkup(
      <ReviewsPageContent dashboard={dashboard} />,
    );

    expect(html.indexOf("Week 2")).toBeLessThan(html.indexOf("Week 1"));
    expect(html.indexOf("First ordered win")).toBeLessThan(
      html.indexOf("Second ordered win"),
    );
    expect(html).toContain("2026-07-08 – 2026-07-14");
    expect(html).toContain("&lt;script&gt;unsafe()&lt;/script&gt;");
    expect(html).not.toContain("<script>unsafe()</script>");
    expect(html).toContain("Review metrics snapshot");
    expect(html).toContain("Recovery usage (review snapshot): 1 credit");
    expect(html).toContain("break-words");
    expect(html).not.toContain("raw_json");
    expect(html).not.toContain("processingStatus");
  });

  it("omits empty optional sections without blank bullets", () => {
    const html = renderToStaticMarkup(
      <ReviewsPageContent
        dashboard={{
          status: "ready",
          cycleName: "My Reset",
          reviews: [
            review({
              wins: [],
              blockers: [],
              patterns: [],
              recommendedChanges: [],
              nextWeekCommitments: [],
            }),
          ],
        }}
      />,
    );
    expect(html).not.toContain(">Wins<");
    expect(html).not.toContain(">Blockers<");
    expect(html).not.toContain(">Patterns<");
    expect(html).not.toContain(">Recommended changes<");
    expect(html).not.toContain(">Next-week commitments<");
    expect(html).not.toContain("<li></li>");
  });

  it("renders neutral empty and no-active-cycle states", () => {
    const empty = renderToStaticMarkup(
      <ReviewsPageContent
        dashboard={{ status: "ready", cycleName: "My Reset", reviews: [] }}
      />,
    );
    const noCycle = renderToStaticMarkup(
      <ReviewsPageContent dashboard={{ status: "no_cycle" }} />,
    );
    expect(empty).toContain("No weekly reviews yet.");
    expect(empty).toContain("No weekly review has been imported");
    expect(empty).not.toMatch(/failed|failure|missed/i);
    expect(noCycle).toContain("No active reset cycle.");
  });
});
