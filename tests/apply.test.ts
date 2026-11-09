import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyThanksHeading } from "@/lib/apply-heading";
import { deliverApplyNotices, planApplicantNotices, applyEmailsWillSend, applyAdminRecipient } from "@/lib/apply-email";
import { applySportOptions, parseParticipantCount, resolveOrganizerSport, SPORT_LIST_ERROR, sportListUnavailable, type SportCatalogRow } from "@/lib/apply-sport";
import { bagEstimate, bagEstimateFromStoredCents, bagsEach, totalBagsForGoalCents, totalBagsForGoalDollars } from "@/lib/estimate";
import { applicationApplicantEmail } from "@/lib/email/copy";
import { dollarsToCents, formatTeamCad } from "@/lib/money";
import { QUOTE_REUSE_MS, sameRecentQuote } from "@/lib/apply";
import { formatQuoteGoal, onPageQuote, TEAM_KEEP_ABOUT } from "@/lib/quote-copy";

const active = ["Hockey", "Soccer", "Other"];

describe("apply form before submit", () => {
  it("does not show a bag estimate on the form", () => {
    const source = readFileSync("components/ApplyForm.tsx", "utf8");
    const form = source.slice(source.lastIndexOf("<form"));
    expect(form).not.toMatch(/\bbags?\b/i);
    expect(form).not.toContain("estimateSentences");
    expect(source).not.toContain("calcEstimates");
    expect(source).toContain('if (done === "saved")');
    expect(source).toContain("Nothing has started yet.");
  });
});

const SPORT_NAMES = [
  "Hockey",
  "Soccer",
  "Basketball",
  "Football",
  "Baseball",
  "Volleyball",
  "Ringette",
  "Figure Skating",
  "Dance",
  "Gymnastics",
  "Swimming",
  "Lacrosse",
  "Rugby",
  "Softball",
  "Martial Arts",
  "Skiing",
  "Cheer",
  "Music",
  "Community/School",
  "Other",
];

function catalogRow(name: string, sortOrder: number, extras?: Partial<SportCatalogRow>): SportCatalogRow {
  return { sport_name: name, emoji: null, sort_order: sortOrder, is_active: true, nameCount: 3, ...extras };
}

describe("sport dropdown", () => {
  it("offers Other and stores a typed activity with the Other prefix", () => {
    const source = readFileSync("components/ApplyForm.tsx", "utf8");
    expect(source).toContain('id="sportOther"');
    expect(source).toContain("sport === OTHER_SPORT");
    expect(source).not.toContain("Hockey");
    expect(resolveOrganizerSport("Hockey", "", active)).toEqual({ ok: true, sport: "Hockey" });
    expect(resolveOrganizerSport("Other", "Curling", active)).toEqual({ ok: true, sport: "Other: Curling" });
    expect(resolveOrganizerSport("Other", "Curling", ["Hockey"])).toEqual({ ok: true, sport: "Other: Curling" });
    expect(resolveOrganizerSport("Other", "", active).ok).toBe(false);
    expect(resolveOrganizerSport("Curling", "", active).ok).toBe(false);
    expect(resolveOrganizerSport("Other: Curling", "", active).ok).toBe(false);
  });

  it("lists real sports that have product names, then one Other", () => {
    const rows = SPORT_NAMES.map((name, index) => catalogRow(name, index + 1));
    rows.push(catalogRow("Curling", 0, { nameCount: 0 }));
    rows.push(catalogRow("Inactive League", 21, { is_active: false }));
    rows.push(catalogRow("Other", 99));
    const names = applySportOptions(rows).map((option) => option.sport_name);
    expect(names.length).toBeGreaterThan(2);
    expect(names.filter((name) => name === "Other")).toEqual(["Other"]);
    expect(names.at(-1)).toBe("Other");
    expect(names.slice(0, -1)).toEqual(SPORT_NAMES.slice(0, -1));
    expect(names).not.toContain("Curling");
    expect(names).not.toContain("Inactive League");
    const catalog = readFileSync("lib/catalog.ts", "utf8");
    expect(catalog).toContain("sport_product_names!inner");
    expect(catalog).toContain("applySportOptions");
  });

  it("shows an error instead of a lone Other when the sport list fails", () => {
    const form = readFileSync("components/ApplyForm.tsx", "utf8");
    const page = readFileSync("app/page.tsx", "utf8");
    const apply = readFileSync("lib/apply.ts", "utf8");
    expect(SPORT_LIST_ERROR).toBe("We couldn't load the sport list. Please refresh or email us.");
    expect(form).toContain("{SPORT_LIST_ERROR}");
    expect(form).toContain("disabled={pending || sportsError}");
    expect(form).toContain('role="alert"');
    expect(page).toContain('console.error("sport list failed');
    expect(page).toContain("sportsError");
    expect(apply).toContain("error: SPORT_LIST_ERROR");
    expect(sportListUnavailable(null)).toBe(true);
    expect(sportListUnavailable([])).toBe(true);
    expect(sportListUnavailable([{ sport_name: "Other", emoji: null }])).toBe(true);
    expect(sportListUnavailable(applySportOptions([catalogRow("Hockey", 1), catalogRow("Soccer", 2)]))).toBe(false);
    const onlyOther = applySportOptions([catalogRow("Other", 1), catalogRow("Curling", 2, { nameCount: 0 })]);
    expect(onlyOther.map((option) => option.sport_name)).toEqual(["Other"]);
    expect(sportListUnavailable(onlyOther)).toBe(true);
  });
});

describe("participants", () => {
  it("requires a whole number from 1 to 200", () => {
    const source = readFileSync("components/ApplyForm.tsx", "utf8");
    expect(source).toContain('name="participants"');
    expect(source).toContain("min={1}");
    expect(source).toContain("max={200}");
    expect(source).toContain("required");
    expect(parseParticipantCount(1)).toEqual({ ok: true, count: 1 });
    expect(parseParticipantCount(200)).toEqual({ ok: true, count: 200 });
    expect(parseParticipantCount(0).ok).toBe(false);
    expect(parseParticipantCount(201).ok).toBe(false);
    expect(parseParticipantCount(1.5).ok).toBe(false);
    expect(parseParticipantCount(null).ok).toBe(false);
  });
});

describe("organizer share copy", () => {
  it("tells teams they keep at least 40 percent and shows whole dollars", () => {
    const page = readFileSync("app/page.tsx", "utf8");
    const form = readFileSync("components/ApplyForm.tsx", "utf8");
    const shop = readFileSync("components/Shop.tsx", "utf8");
    const quote = onPageQuote({ goal: "$2,000", bags: "400", bagsEach: "20" }).join("\n");
    expect(TEAM_KEEP_ABOUT).toBe("Groups keep at least 40% of every sale.");
    expect(form).toContain("Calculate your fundraiser");
    expect(form).toContain("See my estimate");
    expect(form).not.toContain("Apply to run");
    expect(readFileSync("components/Header.tsx", "utf8")).toContain("Get started");
    expect(readFileSync("components/Header.tsx", "utf8")).not.toContain(">Apply<");
    expect(page).toContain("TEAM_KEEP_ABOUT");
    expect(page).not.toContain("round dollar");
    expect(form).toContain("TEAM_KEEP_ABOUT");
    expect(form).not.toContain("round dollar");
    expect(form).not.toContain("teamShareCents");
    expect(shop).not.toContain("team keeps");
    expect(quote).toContain(TEAM_KEEP_ABOUT);
    expect(quote).not.toContain("round dollar");
    expect(quote).not.toContain("keeps $5");
    expect(formatQuoteGoal(2000.4)).toBe(formatTeamCad(200000));
    expect(formatQuoteGoal(2000.6)).toBe(formatTeamCad(200100));
    expect(formatTeamCad(149)).toBe(formatTeamCad(100));
    expect(formatTeamCad(550)).not.toMatch(/\.\d/);
  });
});

describe("quote retry", () => {
  it("reuses the same estimate inside the window and not after it", () => {
    const now = Date.now();
    const row = {
      created_at: new Date(now - 1000).toISOString(),
      organization_name: "Hawks",
      sport: "Hockey",
      participant_count_estimate: 18,
      fundraising_goal_estimate_cad: dollarsToCents(2000),
    };
    const input = { team: "Hawks", participants: 18, goalDollars: 2000 };
    expect(sameRecentQuote(row, input, "Hockey", now)).toBe(true);
    expect(sameRecentQuote(row, { ...input, goalDollars: 3000 }, "Hockey", now)).toBe(false);
    expect(sameRecentQuote({ ...row, created_at: new Date(now - QUOTE_REUSE_MS - 1000).toISOString() }, input, "Hockey", now)).toBe(false);
  });
});

describe("bag math", () => {
  it("rounds the team goal up to the next 10 bags and converts stored cents first", () => {
    expect(totalBagsForGoalDollars(100)).toBe(20);
    expect(totalBagsForGoalDollars(101)).toBe(30);
    expect(totalBagsForGoalDollars(150)).toBe(30);
    expect(totalBagsForGoalDollars(151)).toBe(40);
    expect(totalBagsForGoalDollars(2000)).toBe(400);
    expect(totalBagsForGoalCents(dollarsToCents(2000))).toBe(400);
    expect(totalBagsForGoalCents(10100)).toBe(30);
    expect(totalBagsForGoalCents(200000)).toBe(400);
    expect(totalBagsForGoalDollars(200000)).toBe(40_000);
  });

  it("rounds bags each up", () => {
    expect(bagsEach(400, 20)).toBe(20);
    expect(bagsEach(400, 21)).toBe(20);
    expect(bagsEach(30, 4)).toBe(8);
    expect(bagsEach(20, 3)).toBe(7);
    expect(bagsEach(1, 1)).toBe(1);
    expect(bagEstimate(2000, 18)).toEqual({ goalDollars: 2000, participants: 18, totalBags: 400, bagsEach: 23 });
    expect(bagEstimateFromStoredCents(200000, 18)?.totalBags).toBe(400);
  });
});

describe("apply email", () => {
  const summary = bagEstimate(2000, 20)!;

  it("includes the estimate sentences and no source brand", () => {
    const message = applicationApplicantEmail({ firstName: "Pat", team: "Hawks", summary });
    expect(applyThanksHeading("Pat")).toBe("Thanks, Pat! Here's your quote.");
    const confirmation = readFileSync("components/ApplyForm.tsx", "utf8");
    const quotePage = confirmation.slice(confirmation.indexOf("export function ApplyConfirmation"), confirmation.indexOf("export function ApplyForm"));
    expect(quotePage).toContain("Nothing has started yet.");
    expect(quotePage).toContain("That's about ${each} bags per participant.");
    expect(quotePage).toContain("Your group makes $5 or more on every bag sold. That's at least 40% of every sale.");
    expect(quotePage).toContain("mailto:hello@sweetsuccessfundraising.com");
    expect(quotePage).toContain("Not ready yet? Questions? ");
    expect(quotePage).not.toContain("reply to the quote email");
    expect(quotePage).toContain("On the next page, you'll pick a start window and confirm your participants and goal.");
    expect(quotePage).toContain("Start my fundraiser");
    expect(quotePage).toContain("We've emailed a copy of this quote to");
    expect(quotePage).not.toMatch(/application|applied|your campaign|saved your application/i);
    expect(readFileSync("lib/apply.ts", "utf8")).not.toContain("started_at");
    expect(readFileSync("lib/apply.ts", "utf8")).not.toContain("review_status");
    expect(readFileSync("lib/email/prospect.ts", "utf8").slice(0, readFileSync("lib/email/prospect.ts", "utf8").indexOf("export function prospectDay2Email"))).not.toMatch(/application|applied|your campaign/i);
    expect(readFileSync("components/ApplyForm.tsx", "utf8")).toContain("applyThanksHeading");
    expect(readFileSync("components/ApplyForm.tsx", "utf8")).toContain("Team, Association or Club name");
    expect(readFileSync("components/ApplyForm.tsx", "utf8")).toContain("Sport / Activity");
    expect(readFileSync("components/ApplyForm.tsx", "utf8")).not.toContain("pipeline");
    expect(message.subject).toBe("Your Hawks fundraising estimate");
    expect(message.text).toContain("about 400 bags");
    expect(message.text).toContain("about 20 bags per participant");
    expect(message.text).toContain("Start my fundraiser:");
    expect(message.html).toContain("Start my fundraiser");
    expect(message.html).toContain("Unsubscribe");
    expect(message.headers).toBeUndefined();
    expect(message.text).not.toMatch(/skittles|jolly rancher|gummy/i);
  });

  it("sends nothing when the flag is off or the Resend key is missing", async () => {
    const notices = planApplicantNotices({
      applicantEmail: "pat@example.com",
      firstName: "Pat",
      lastName: "Lee",
      phone: "",
      team: "Hawks",
      sport: "Hockey",
      city: "Calgary",
      postal: "T2P 1J9",
      participants: 20,
      goalDollars: 2000,
      howHeard: "",
      consent: false,
      summary,
      env: {},
    });
    expect(notices.map((notice) => notice.to)).toEqual(["pat@example.com"]);
    expect(applyAdminRecipient({})).toBeNull();
    expect(applyAdminRecipient({ ADMIN_EMAIL: "pat@gmail.com" })).toBeNull();
    expect(applyAdminRecipient({ ADMIN_EMAIL: "inbox@team.sweetsuccessfundraising.com" })).toBe("inbox@team.sweetsuccessfundraising.com");
    expect(applyEmailsWillSend({})).toBe(false);
    expect(applyEmailsWillSend({ APPLY_EMAILS_ENABLED: "true" })).toBe(false);
    expect(applyEmailsWillSend({ APPLY_EMAILS_ENABLED: "yes", RESEND_API_KEY: "re_test" })).toBe(true);
    expect(applyEmailsWillSend({ EMAIL_TEST_RECIPIENT: "qa@example.com" })).toBe(false);
    expect(applyEmailsWillSend({ EMAIL_TEST_RECIPIENT: "qa@example.com", RESEND_API_KEY: "re_test" })).toBe(true);

    const send = async () => {
      throw new Error("send should not be called");
    };
    const logged: string[] = [];
    const result = await deliverApplyNotices({
      notices,
      env: { APPLY_EMAILS_ENABLED: "false", RESEND_API_KEY: "re_test" },
      send,
      log: async (row) => {
        logged.push(`${row.status}:${row.recipient}`);
      },
    });
    expect(result.sent).toBe(false);
    expect(logged).toEqual(["skipped:pat@example.com"]);

    const missingKey = await deliverApplyNotices({
      notices: [notices[0]],
      env: { APPLY_EMAILS_ENABLED: "true" },
      send,
      log: async (row) => {
        logged.push(`${row.status}:${row.recipient}`);
      },
    });
    expect(missingKey.sent).toBe(false);
  });

  it("sends only when the flag and key are both set", async () => {
    const summaryMessage = applicationApplicantEmail({ firstName: "Pat", team: "Hawks", summary });
    const sent: string[] = [];
    const logged: string[] = [];
    const result = await deliverApplyNotices({
      notices: [
        { to: "pat@example.com", emailType: "apply_confirmation", message: summaryMessage },
        { to: "owner@example.com", emailType: "apply_confirmation_copy", message: summaryMessage },
      ],
      env: { APPLY_EMAILS_ENABLED: "true", RESEND_API_KEY: "re_test", ADMIN_EMAIL: "owner@example.com" },
      send: async (message) => {
        sent.push(message.to);
        expect(message.text).toContain("per participant");
        return "re_123";
      },
      log: async (row) => {
        logged.push(`${row.status}:${row.resend_id}`);
      },
    });
    expect(result.sent).toBe(true);
    expect(sent).toEqual(["pat@example.com", "owner@example.com"]);
    expect(logged).toEqual(["sent:re_123", "sent:re_123"]);
  });
});
