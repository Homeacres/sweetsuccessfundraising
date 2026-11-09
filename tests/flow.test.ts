import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { finalDaysEmail, midpointEmail, progressEmail, requestReceivedEmail, wrapUpEmail, type LiveLinks } from "@/lib/email/flow-copy";
import { liveMailKind, shopPhase } from "@/lib/launch";
import { signOrganizerAction, verifyOrganizerAction } from "@/lib/organizer-token";
import { goalPercent, starSellerLine, starSellers, type Seller } from "@/lib/standings";

const sellers: Seller[] = [
  { id: "a", first: "Sam", last: "Lee", bags: 8, optedIn: true },
  { id: "b", first: "Jo", last: "Ng", bags: 5, optedIn: true },
  { id: "c", first: "Ada", last: "Kim", bags: 3, optedIn: true },
  { id: "d", first: "Bea", last: "Ott", bags: 9, optedIn: false },
  { id: "e", first: "Cy", last: "Wu", bags: 0, optedIn: true },
  { id: "f", first: "Max", last: "Ito", bags: 1, optedIn: true },
];

const base: LiveLinks = {
  firstName: "Pat",
  teamName: "Hawks",
  goal: "$2,000",
  goalPct: 40,
  daysLeft: 6,
  endDate: "Dec 15, 2026",
  salesTotal: "$800.00",
  periodStars: ["Sam L.", "Jo N."],
  overallStars: ["Sam L."],
  dashboardUrl: null,
  supporterLinks: [{ name: "Sam L.", url: "https://preview.example/t/hawks/sam-l" }],
  unsubscribeUrl: "https://preview.example/o/unsubscribe/token",
};

describe("star sellers", () => {
  it("lists at most three opted-in people with sales and never zeros", () => {
    expect(starSellers(sellers)).toEqual(["Sam L.", "Jo N.", "Ada K."]);
    expect(starSellers(sellers).join(" ")).not.toContain("Bea");
    expect(starSellers(sellers).join(" ")).not.toContain("Cy");
    expect(starSellers([{ id: "a", first: "Sam", last: "Lee", bags: 2, optedIn: true }])).toEqual(["Sam L."]);
    expect(starSellers([{ id: "a", first: "Sam", last: "Lee", bags: 0, optedIn: true }])).toEqual([]);
    expect(starSellerLine("Star sellers since our last update", [])).toBeNull();
    expect(goalPercent(80000, 200000)).toBe(40);
    expect(goalPercent(0, 200000)).toBe(0);
  });
});

describe("emails 12 to 15", () => {
  it("switches 12 to 14 at 100 percent and keeps dollars in the wrap-up only", () => {
    const under = progressEmail(base);
    expect(under.subject).toBe("Hawks is 40% of the way there!");
    expect(under.text).toContain("Hawks is at 40% of its goal.");
    expect(under.text).toContain("Star sellers since our last update: Sam L., Jo N.");
    expect(under.text).toContain("Unsubscribe:");
    expect(under.text).not.toContain("$800.00");

    const over = progressEmail({ ...base, goalPct: 100, periodStars: [] });
    expect(over.subject).toBe("Hawks passed its goal!");
    expect(over.text).toContain("Hawks has passed its goal (100%)!");
    expect(over.text).not.toContain("Star sellers");

    expect(midpointEmail({ ...base, goalPct: 120 }).subject).toBe("Hawks passed its goal!");
    expect(finalDaysEmail({ ...base, goalPct: 100 }).text.startsWith("Hi Pat,\n\nHawks has passed its goal (100%)!")).toBe(true);
    const wrap = wrapUpEmail(base);
    expect(wrap.text).toContain("together you raised $800.00 (40% of the goal)");
    expect(wrap.subject).toBe("Thank you from Hawks!");
    expect(under.text).toContain("Or just reply with any questions.");
    expect(under.text).toContain("The Sweet Success Family");
  });
});

describe("public sign-up token", () => {
  it("does not open the organizer dashboard", () => {
    const secret = "test-secret";
    const id = "11111111-1111-4111-8111-111111111111";
    const signup = signOrganizerAction(id, "signup", secret);
    expect(verifyOrganizerAction(signup, "signup", secret)?.organizerId).toBe(id);
    expect(verifyOrganizerAction(signup, "dashboard", secret)).toBeNull();
    expect(shopPhase("2026-12-01", "2026-12-20", "2026-11-01")).toBe("before");
    expect(shopPhase("2026-12-01", "2026-12-20", "2026-12-20")).toBe("open");
    expect(shopPhase("2026-12-01", "2026-12-20", "2026-12-21")).toBe("after");
    const form = readFileSync("components/FlowScreens.tsx", "utf8");
    expect(readFileSync("lib/launch.ts", "utf8")).toContain("OK to show my participant's first name and last initial in group updates");
    expect(form).toContain('name="leaderboard"');
    expect(form).not.toContain("defaultChecked");
    expect(readFileSync("supabase/migrations/20261109140000_leaderboard_opt_in.sql", "utf8")).toContain("leaderboard_opt_in boolean not null default false");
    const request = requestReceivedEmail({
      firstName: "Pat",
      teamName: "Hawks",
      startWindow: "Nov 15",
      participants: 18,
      goal: "$2,000",
      unsubscribeUrl: "https://preview.example/o/unsubscribe/token",
    });
    expect(request.subject).toBe("We've got your Hawks request");
    expect(request.preview).toContain("shortly");
    expect(request.text).not.toContain("DRAFT");
    expect(liveMailKind({
      today: "2026-12-01",
      start: "2026-12-01",
      end: "2026-12-20",
      launchSent: false,
      lastProgressOn: null,
      midpointSent: false,
      finalSent: false,
      wrapSent: false,
    })).toBe("launch");
    expect(liveMailKind({
      today: "2026-12-21",
      start: "2026-12-01",
      end: "2026-12-20",
      launchSent: true,
      lastProgressOn: "2026-12-14",
      midpointSent: true,
      finalSent: true,
      wrapSent: false,
    })).toBe("wrap");
  });
});
