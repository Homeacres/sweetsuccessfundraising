import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { receiptEmail } from "@/lib/email/copy";
import {
  BAG_ARRIVAL,
  DEFAULT_INBOUND_REPLY_DOMAIN,
  SIGN_OFF_NAME,
  dueProspectStep,
  inboundEmailEnabled,
  inboundReplyDomain,
  prospectDay10Email,
  prospectDay2Email,
  prospectDay5Email,
  prospectFields,
  prospectQuoteEmail,
  prospectReplyTo,
} from "@/lib/email/prospect";
import { activityLine } from "@/lib/email/activity-lines";
import { approvedEmail, parentInviteEmail, progressEmail } from "@/lib/email/flow-copy";
import { bagEstimate } from "@/lib/estimate";
import { followUpsStopped } from "@/lib/prospect-run";
import { signOrganizerAction, verifyOrganizerAction } from "@/lib/organizer-token";
import { parseInboundEmail, verifyResendWebhook } from "@/lib/resend-inbound";
import { participantSlug, sharePath } from "@/lib/roster";

const organizerId = "11111111-1111-4111-8111-111111111111";
const secret = "test-secret";
const summary = bagEstimate(2000, 20)!;
const fields = prospectFields({
  firstName: "Pat",
  teamName: "Hawks",
  summary,
  startUrl: "https://preview.example/o/start/token",
  unsubscribeUrl: "https://preview.example/o/unsubscribe/token",
});

describe("prospect copy", () => {
  it("uses the quote, day 2, day 5 and day 10 wording with one bag-arrival sentence", () => {
    const quote = prospectQuoteEmail(fields);
    expect(quote.subject).toBe("Your Hawks fundraising estimate");
    expect(quote.preview).toBe("About 400 bags to raise $2,000.");
    expect(quote.text).toContain("Hi Pat,");
    expect(quote.text).toContain("about 400 bags, which is about 20 per participant");
    expect(quote.text).toContain("Bags start at $12 (GST included), and your group makes $5 or more on every bag sold. That's at least 40% of every sale.");
    expect(quote.text).toContain("We love working with local groups like yours.");
    expect(quote.text).not.toContain("keeps $5");
    expect(quote.text).toContain("Prices include GST. Single bags only for now.");
    expect(quote.text).toContain("Start my fundraiser: https://preview.example/o/start/token");
    expect(quote.text).toContain(SIGN_OFF_NAME);
    expect(quote.html).toContain(">Start my fundraiser</a>");
    expect(quote.html).toContain(">Unsubscribe</a>");
    expect(quote.headers).toBeUndefined();

    const day2 = prospectDay2Email(fields);
    expect(day2.subject).toBe("How it works for Hawks");
    expect(day2.text).toContain(BAG_ARRIVAL);
    expect(day2.text).toContain("Supporters order online, and your group makes $5 or more on every bag.");
    expect(day2.text).toContain("20 per participant");

    expect(prospectDay5Email(fields).subject).toBe("Any questions before you start?");
    expect(prospectDay5Email(fields).text).toContain("Or just reply with any questions.");
    const last = prospectDay10Email(fields);
    expect(last.subject).toBe("Should we close your Hawks estimate?");
    expect(last.text).toContain("We won't email again");
    expect(`${quote.text}\n${day2.text}\n${last.text}`).not.toMatch(/skittles|jolly rancher|gummy|ltd|inc\./i);
  });

  it("adds Reply-To only when inbound email is enabled", () => {
    expect(inboundEmailEnabled({})).toBe(false);
    expect(inboundReplyDomain({})).toBe("team.sweetsuccessfundraising.com");
    expect(inboundReplyDomain({ INBOUND_REPLY_DOMAIN: "team.example.com" })).toBe("team.example.com");
    expect(DEFAULT_INBOUND_REPLY_DOMAIN).toBe("team.sweetsuccessfundraising.com");
    expect(prospectReplyTo(organizerId, {})).toBeNull();
    const on = prospectReplyTo(organizerId, { INBOUND_EMAIL_ENABLED: "true" });
    expect(on).toBe("hello@team.sweetsuccessfundraising.com");
  });
});

describe("activity lines", () => {
  it("maps the listed activities and uses one fallback for everything else", () => {
    expect(activityLine("Hockey")).toBe("We love working with hockey teams.");
    expect(activityLine("dance")).toBe("We love working with dance groups.");
    expect(activityLine("Music or band")).toBe("We love working with bands and music programs.");
    expect(activityLine("School")).toBe("We love helping schools raise money for their students.");
    expect(activityLine("Scouts or cadets")).toBe("We love working with Scouts and cadet groups.");
    expect(activityLine("Church or charity")).toBe("We love supporting churches and charities.");
    expect(activityLine("")).toBe("We love working with local groups like yours.");
    expect(activityLine("Other")).toBe("We love working with local groups like yours.");
    expect(activityLine("Other: Curling")).toBe("We love working with local groups like yours.");
    expect(activityLine("Soccer")).toBe("We love working with local groups like yours.");
    const hockey = prospectQuoteEmail({ ...fields, sport: "Hockey" });
    const greeting = hockey.text.indexOf("Hi Pat,");
    const line = hockey.text.indexOf("We love working with hockey teams.");
    const luck = hockey.text.indexOf("Thanks for reaching out. Good luck to Hawks this season.");
    expect(greeting).toBeLessThan(line);
    expect(line).toBeLessThan(luck);
    const approved = approvedEmail({
      firstName: "Pat",
      teamName: "Hawks",
      startWindow: "Nov 15 to Dec 6",
      dashboardUrl: "https://preview.example/o/dashboard/token",
      unsubscribeUrl: "https://preview.example/o/unsubscribe/token",
      sport: "Dance",
    });
    expect(approved.text.indexOf("Hi Pat,")).toBeLessThan(approved.text.indexOf("We love working with dance groups."));
    expect(approved.text).toContain("Thanks for choosing Sweet Success.");
    const invite = parentInviteEmail({
      teamName: "Hawks",
      startWindow: "Nov 15 to Dec 6",
      goal: "$2,000",
      signupUrl: "https://preview.example/p/join/token",
      unsubscribeUrl: "https://preview.example/o/unsubscribe/token",
    });
    expect(invite.text).toContain("Supporters order online. Bags start at $12 (GST included), and our group makes $5 or more on every bag.");
    const progress = progressEmail({
      firstName: "Pat",
      teamName: "Hawks",
      goal: "$2,000",
      goalPct: 40,
      daysLeft: 6,
      endDate: "Dec 6, 2026",
      salesTotal: "$800.00",
      periodStars: [],
      overallStars: [],
      dashboardUrl: null,
      supporterLinks: [],
      unsubscribeUrl: "https://preview.example/o/unsubscribe/token",
    });
    expect(progress.text).toContain("Mention premium bags. Your group makes even more on those.");
    const sources = ["activity-lines.ts", "prospect.ts", "flow-copy.ts", "copy.ts"].map((name) => readFileSync(`lib/email/${name}`, "utf8")).join("\n");
    expect(sources).not.toMatch(/keeps \$[56]/);
    expect(sources).not.toContain("$6 goes to the group");
  });
});

describe("follow-up schedule", () => {
  const created = new Date("2026-11-01T00:00:00Z");

  it("sends day 2, then day 5, then day 10, and stops after a start or unsubscribe", () => {
    expect(dueProspectStep({ createdAt: created, now: new Date("2026-11-02T00:00:00Z"), sentTypes: [], stopped: false })).toBeNull();
    expect(dueProspectStep({ createdAt: created, now: new Date("2026-11-03T00:00:00Z"), sentTypes: [], stopped: false })).toBe("day2");
    expect(dueProspectStep({ createdAt: created, now: new Date("2026-11-06T00:00:00Z"), sentTypes: ["prospect_day_2"], stopped: false })).toBe("day5");
    expect(dueProspectStep({ createdAt: created, now: new Date("2026-11-11T00:00:00Z"), sentTypes: ["prospect_day_2", "prospect_day_5"], stopped: false })).toBe("day10");
    expect(dueProspectStep({ createdAt: created, now: new Date("2026-11-11T00:00:00Z"), sentTypes: ["prospect_day_2", "prospect_day_5"], stopped: true })).toBeNull();
    expect(dueProspectStep({ createdAt: created, now: new Date("2026-11-20T00:00:00Z"), sentTypes: ["prospect_day_10"], stopped: false })).toBeNull();
    expect(followUpsStopped({ status: "applied", startedAt: "2026-11-04", repliedAt: null, unsubscribedAt: null, declinedAt: null })).toBe(true);
    expect(followUpsStopped({ status: "applied", startedAt: null, repliedAt: null, unsubscribedAt: "2026-11-04", declinedAt: null })).toBe(true);
    expect(followUpsStopped({ status: "declined", startedAt: null, repliedAt: null, unsubscribedAt: null, declinedAt: "2026-11-04" })).toBe(true);
    expect(followUpsStopped({ status: "applied", startedAt: null, repliedAt: null, unsubscribedAt: null, declinedAt: null })).toBe(false);
  });
});

describe("organizer action links", () => {
  it("signs start and unsubscribe separately and rejects a scanner GET as a start record", () => {
    const start = signOrganizerAction(organizerId, "start", secret);
    const unsubscribe = signOrganizerAction(organizerId, "unsubscribe", secret);
    expect(verifyOrganizerAction(start, "start", secret)?.organizerId).toBe(organizerId);
    expect(verifyOrganizerAction(start, "unsubscribe", secret)).toBeNull();
    expect(verifyOrganizerAction(unsubscribe, "unsubscribe", secret)?.organizerId).toBe(organizerId);
    expect(verifyOrganizerAction(`${start}x`, "start", secret)).toBeNull();
    expect(readFileSync("components/FlowScreens.tsx", "utf8")).toContain('type="submit"');
    expect(readFileSync("app/o/start/[token]/page.tsx", "utf8")).not.toContain(".update(");
    expect(readFileSync("app/o/start/[token]/page.tsx", "utf8")).not.toContain("recordOrganizerStart()");
    expect(readFileSync("app/api/o/start/route.ts", "utf8")).toContain('.is("request_submitted_at", null)');
    expect(readFileSync("lib/organizer-actions.ts", "utf8")).toContain('.is("started_at", null)');
  });
});

describe("inbound webhook", () => {
  it("rejects a bad signature and parses a reply", () => {
    const payload = JSON.stringify({
      type: "email.received",
      data: { email_id: "em_1", from: "Pat <pat@example.com>", to: ["reply+abc@team.sweetsuccessfundraising.com"], subject: "Question", text: "Hello" },
    });
    const id = "msg_1";
    const timestamp = "1700000000";
    const key = Buffer.from("c2VjcmV0", "utf8").toString("base64");
    const signed = createHmac("sha256", Buffer.from(key, "base64")).update(`${id}.${timestamp}.${payload}`).digest("base64");
    expect(verifyResendWebhook(payload, { id, timestamp, signature: `v1,${signed}` }, key, 1700000000 * 1000)).toBe(true);
    expect(verifyResendWebhook(payload, { id, timestamp, signature: "v1,bm90LXZhbGlk" }, key, 1700000000 * 1000)).toBe(false);
    const parsed = parseInboundEmail(JSON.parse(payload));
    expect(parsed?.fromEmail).toBe("pat@example.com");
    expect(parsed?.resendId).toBe("em_1");
    expect(readFileSync("app/api/webhooks/resend/route.ts", "utf8")).toContain("inboundEmailEnabled");
  });
});

describe("roster and receipt", () => {
  it("builds a personal share link and the receipt hand-out line", () => {
    expect(participantSlug("Sam", "L", [])).toBe("sam-l");
    expect(participantSlug("Sam", "L", ["sam-l"])).toBe("sam-l-2");
    expect(sharePath("hawks-u15", "sam-l")).toBe("/t/hawks-u15/sam-l");
    const receipt = receiptEmail({
      buyerName: "Pat",
      team: "Hawks",
      totalCents: 1200,
      bags: 1,
      lines: [{ player: "Sam", candy: "Celly Crunches", qty: 1, grossCents: 1200, mix: false }],
    });
    expect(receipt.text).toContain("Your order will be handed out by your team organizer.");
    expect(receipt.text).toContain("There is no shipping address.");
    expect(readFileSync("supabase/migrations/20261109120100_activity_catalog.sql", "utf8")).toContain("Music or band");
    expect(readFileSync("supabase/migrations/20261109120100_activity_catalog.sql", "utf8")).toContain("Scouts or cadets");
    expect(readFileSync("supabase/migrations/20261109120000_prospect_followups.sql", "utf8")).toContain("declined");
  });
});
