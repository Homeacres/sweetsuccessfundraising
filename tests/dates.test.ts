import { describe, expect, it } from "vitest";
import { formatUserDate } from "@/lib/dates";
import { milestoneEmail } from "@/lib/email/copy";

describe("formatUserDate", () => {
  it("formats a calendar date without shifting it into the previous day", () => {
    expect(formatUserDate("2026-11-15")).toBe("Nov 15, 2026");
    expect(formatUserDate("2026-01-05")).toBe("Jan 5, 2026");
    expect(formatUserDate(" 2026-11-15 ")).toBe("Nov 15, 2026");
  });

  it("shows timestamps in America/Edmonton", () => {
    expect(formatUserDate("2026-11-15T00:00:00.000Z")).toBe("Nov 14, 2026, 6:00 PM");
    expect(formatUserDate("2026-01-15T16:00:00.000Z")).toBe("Jan 15, 2026, 9:00 AM");
  });

  it("uses the friendly end date in parent emails", () => {
    const message = milestoneEmail({
      kind: "days_left",
      team: "Hawks",
      parentFirst: "Pat",
      token: "token",
      players: [{ first: "Sam", last: "Lee", hideLastName: true, bags: 2, teamCents: 1000 }],
      endDate: "2026-11-15",
    });
    expect(message.text).toContain("ends Nov 15, 2026");
    expect(message.text).not.toContain("2026-11-15");
    expect(message.html).toContain("Nov 15, 2026");
  });
});