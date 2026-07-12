import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DayDetail } from "../src/components/day-detail";
import type { DayDetail as DayDetailModel } from "../src/server/progress";

function readyDetail(
  reflection: Extract<DayDetailModel, { status: "ready" }>["reflection"],
): Extract<DayDetailModel, { status: "ready" }> {
  return {
    status: "ready",
    today: "2026-07-01",
    cycleName: "My Reset",
    day: {
      dayNumber: 1,
      date: "2026-07-01",
      status: "YELLOW",
      isCurrent: true,
      energyLevel: "LOW",
      phase: { name: "Clear the Fog", description: null },
    },
    plan: null,
    checkins: [],
    recoveryEvent: null,
    reflection,
  };
}

describe("day detail reflection", () => {
  it("renders approved populated fields safely and preserves multiline content", () => {
    const html = renderToStaticMarkup(
      <DayDetail
        detail={readyDetail({
          summary: "Napredak ✅\nSecond line <script>alert(1)</script>",
          whatHappened: "A slow start.",
          whatWorked: "Starting small.",
          whatBlockedMe: "Phone distraction.",
          tomorrowAdjustment: "Learn earlier.",
          selfCriticismNote: "Notice it, then continue.",
          createdAt: "2026-07-01T20:00:00.000Z",
          updatedAt: "2026-07-01T20:05:00.000Z",
        })}
      />,
    );

    expect(html).toContain("Napredak ✅\nSecond line");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("What happened");
    expect(html).toContain("What worked");
    expect(html).toContain("What blocked me");
    expect(html).toContain("Tomorrow adjustment");
    expect(html).toContain("Self-criticism note");
    expect(html).toContain(">Status<");
    expect(html).toContain(">Yellow<");
  });

  it("omits headings for absent optional fields", () => {
    const html = renderToStaticMarkup(
      <DayDetail
        detail={readyDetail({
          summary: "Only approved summary.",
          whatHappened: null,
          whatWorked: null,
          whatBlockedMe: null,
          tomorrowAdjustment: null,
          selfCriticismNote: null,
          createdAt: "2026-07-01T20:00:00.000Z",
          updatedAt: "2026-07-01T20:00:00.000Z",
        })}
      />,
    );

    expect(html).toContain("Only approved summary.");
    expect(html).not.toContain("What happened");
    expect(html).not.toContain("What worked");
    expect(html).not.toContain("What blocked me");
    expect(html).not.toContain("Tomorrow adjustment");
    expect(html).not.toContain("Self-criticism note");
  });

  it("renders exact calm empty state without breaking other detail", () => {
    const html = renderToStaticMarkup(<DayDetail detail={readyDetail(null)} />);

    expect(html).toContain("No reflection imported for this day.");
    expect(html).toContain("No plan recorded for this day.");
    expect(html).toContain("Day 1 / 90");
    expect(html).not.toContain("RAW_ONLY_SENTINEL_7f8e");
    expect(html).not.toContain("dayStatusRecommendation");
  });
});
