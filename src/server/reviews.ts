import type { PrismaClient } from "@/generated/prisma/client";

import { addUtcDays, normalizeUtcDate } from "./db/cycle";
import {
  stringList,
  weeklyMetricsSchema,
  weeklyPatternSchema,
} from "./imports/schemas";

export type CanonicalWeekRange = {
  dateFrom: Date;
  dateTo: Date;
};

export type WeeklyReviewMetrics = {
  greenDays: number;
  yellowDays: number;
  blueDays: number;
  redDays: number;
  goldDays: number;
  recoveryCreditsUsed: number;
};

export type WeeklyReviewSummary = {
  weekNumber: number;
  dateFrom: string;
  dateTo: string;
  summary: string;
  wins: string[];
  blockers: string[];
  patterns: Array<{ title: string; evidence: string }>;
  recommendedChanges: string[];
  nextWeekCommitments: string[];
  metrics: WeeklyReviewMetrics;
  createdAt: string;
  updatedAt: string;
};

export type ReviewsDashboard =
  | { status: "no_cycle" }
  | {
      status: "ready";
      cycleName: string;
      reviews: WeeklyReviewSummary[];
    };

export type ReviewsDatabase = Pick<PrismaClient, "resetCycle">;

export function deriveCanonicalWeekRange(
  cycleStartDate: Date,
  weekNumber: number,
): CanonicalWeekRange {
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 13) {
    throw new RangeError("Week number must be an integer from 1 through 13");
  }

  const dateFrom = addUtcDays(
    normalizeUtcDate(cycleStartDate),
    (weekNumber - 1) * 7,
  );
  const dateTo = addUtcDays(dateFrom, weekNumber === 13 ? 5 : 6);
  return { dateFrom, dateTo };
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function getReviewsDashboard(
  database: ReviewsDatabase,
  userId: string,
): Promise<ReviewsDashboard> {
  const cycles = await database.resetCycle.findMany({
    where: { userId, status: "ACTIVE" },
    orderBy: { startDate: "desc" },
    take: 2,
    select: {
      name: true,
      weeklyReviews: {
        orderBy: { weekNumber: "desc" },
        select: {
          weekNumber: true,
          dateFrom: true,
          dateTo: true,
          summary: true,
          winsJson: true,
          blockersJson: true,
          patternsJson: true,
          recommendedChangesJson: true,
          nextWeekCommitmentsJson: true,
          metricsJson: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  if (cycles.length !== 1) {
    return { status: "no_cycle" };
  }

  return {
    status: "ready",
    cycleName: cycles[0].name,
    reviews: cycles[0].weeklyReviews.map((review) => {
      const metrics = weeklyMetricsSchema.parse(review.metricsJson);
      return {
        weekNumber: review.weekNumber,
        dateFrom: isoDate(review.dateFrom),
        dateTo: isoDate(review.dateTo),
        summary: review.summary,
        wins: stringList(50, 1_000).parse(review.winsJson),
        blockers: stringList(50, 1_000).parse(review.blockersJson),
        patterns: weeklyPatternSchema
          .array()
          .max(30)
          .parse(review.patternsJson),
        recommendedChanges: stringList(30, 1_000).parse(
          review.recommendedChangesJson,
        ),
        nextWeekCommitments: stringList(30, 1_000).parse(
          review.nextWeekCommitmentsJson,
        ),
        metrics: {
          greenDays: metrics.green_days,
          yellowDays: metrics.yellow_days,
          blueDays: metrics.blue_days,
          redDays: metrics.red_days,
          goldDays: metrics.gold_days,
          recoveryCreditsUsed: metrics.recovery_credits_used,
        },
        createdAt: review.createdAt.toISOString(),
        updatedAt: review.updatedAt.toISOString(),
      };
    }),
  };
}
