import { describe, expect, it } from "vitest";
import { dueMilestones, type MilestoneConfig } from "@/lib/milestones";

const config: MilestoneConfig = {
  timezone: "America/Edmonton",
  send_hour_local: 9,
  start: { enabled: true, days_after_start: 0 },
  midpoint: { enabled: true },
  days_left: { enabled: true, days_before_end: 3 },
  final_day: { enabled: true, days_before_end: 0 },
  close: { enabled: true, trigger: "campaign_status_closed" },
};

const campaign = { status: "active", start_date: "2026-10-20", end_date: "2026-10-30" };

describe("parent milestone timing", () => {
  it("waits until 9:00 America/Edmonton on the start date", () => {
    const before = dueMilestones(campaign, config, new Date("2026-10-20T14:30:00Z"));
    const after = dueMilestones(campaign, config, new Date("2026-10-20T15:30:00Z"));
    expect(before).not.toContain("start");
    expect(after).toContain("start");
  });

  it("sends close only after the campaign is closed, and not the date-based notes", () => {
    const due = dueMilestones({ ...campaign, status: "closed" }, config, new Date("2026-10-20T12:00:00Z"));
    expect(due).toEqual(["close"]);
  });

  it("uses the Edmonton clock, including a UTC-7 morning", () => {
    const winter = { status: "active", start_date: "2026-01-15", end_date: "2026-01-25" };
    const before = dueMilestones(winter, config, new Date("2026-01-15T15:30:00Z"));
    const onTime = dueMilestones(winter, config, new Date("2026-01-15T16:00:00Z"));
    expect(before).not.toContain("start");
    expect(onTime).toContain("start");
  });
});
