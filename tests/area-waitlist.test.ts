import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tallyPrefix, type PostalArea } from "@/lib/area";
import { eligibleForAreaNotice, planExpressConsent, unsubscribeOnPost } from "@/lib/area-waitlist";
import { escapeHtml, outOfAreaMessage, saveOutOfAreaInterest } from "@/lib/out-of-area-mail";
import { waitlistContactLine } from "@/lib/waitlist-copy";
import { resendBody } from "@/lib/email/send";
import { silenceRouteAnnouncer } from "@/components/SilenceAnnouncer";
import {
  IMPLIED_WAITLIST_CONSENT,
  WAITLIST_BODY,
  WAITLIST_RESULT_NOTE,
  areaOpeningNotice,
  formatServedCode,
  postalFieldHint,
  waitlistHeadline,
} from "@/lib/waitlist-copy";
import { waitlistReplyTo } from "@/lib/out-of-area-mail";

const areas: PostalArea[] = [
  { prefix: "T", country: "CA", isActive: true },
  { prefix: "T0M", country: "CA", isActive: false },
];

const origin = "https://preview.example";

function memory() {
  const rows: { email: string; country: "CA" | "US"; prefix: string; consentText: string; token: string; keepToken: string; unsubscribedAt: string | null }[] = [];
  const sent: { to: string; subject: string; text: string; html: string; headers: Record<string, string> }[] = [];
  let tallies = 0;
  return {
    rows,
    sent,
    get tallies() { return tallies; },
    async find(email: string, country: "CA" | "US", prefix: string) {
      const row = rows.find((item) => item.email === email && item.country === country && item.prefix === prefix);
      return row ? { token: row.token, keepToken: row.keepToken, unsubscribedAt: row.unsubscribedAt } : null;
    },
    async insert(row: { email: string; country: "CA" | "US"; prefix: string; consentText: string }) {
      if (rows.some((item) => item.email === row.email && item.country === row.country && item.prefix === row.prefix)) {
        throw Object.assign(new Error("duplicate"), { code: "23505" });
      }
      const saved = { ...row, token: "a".repeat(64), keepToken: "k".repeat(64), unsubscribedAt: null };
      rows.push(saved);
      return { token: saved.token, keepToken: saved.keepToken, unsubscribedAt: null };
    },
    async tally() { tallies += 1; },
    async send(message: { to: string; subject: string; text: string; html: string; headers: Record<string, string> }) { sent.push(message); },
  };
}

describe("out-of-area intake", () => {
  it("accepts a T code with no waitlist, tally, or out-of-area email", async () => {
    expect(tallyPrefix("T2P 1J9", areas)).toBeNull();
    const store = memory();
    const result = await saveOutOfAreaInterest({
      email: "pat@example.com",
      firstName: "Pat",
      postal: "T2P 1J9",
      areas,
      find: store.find,
      insert: store.insert,
      tally: store.tally,
      send: store.send,
      origin,
    });
    expect(result.emailed).toBe(false);
    expect(store.rows).toEqual([]);
    expect(store.tallies).toBe(0);
    expect(store.sent).toEqual([]);
    const apply = readFileSync("lib/apply.ts", "utf8");
    expect(apply).not.toContain("out_of_area_log");
    expect(apply.indexOf("saveOutOfAreaInterest")).toBeLessThan(apply.indexOf('from("organizers").insert'));
  });

  it("saves one S7K waitlist row, tallies once, and emails delivered@resend.dev on Preview", async () => {
    const store = memory();
    const result = await saveOutOfAreaInterest({
      email: "Gus@Example.com",
      firstName: "Gus",
      postal: "S7K 1A1",
      areas,
      find: store.find,
      insert: store.insert,
      tally: store.tally,
      send: store.send,
      origin,
    });
    expect(result.emailed).toBe(true);
    expect(store.tallies).toBe(1);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].consentText).toBe(IMPLIED_WAITLIST_CONSENT);
    expect(store.rows[0].email).toBe("gus@example.com");
    expect(store.rows[0].prefix).toBe("S7K");
    expect(store.sent).toHaveLength(1);
    const envelope = resendBody(store.sent[0], { VERCEL_ENV: "preview", EMAIL_TEST_RECIPIENT: "delivered@resend.dev" });
    expect(envelope.to).toEqual(["delivered@resend.dev"]);
    expect(store.sent[0].text).toContain(`/waitlist/unsubscribe/${"a".repeat(64)}`);
    expect(envelope.headers?.["List-Unsubscribe"]).toContain(`/api/waitlist/unsubscribe?token=${"a".repeat(64)}`);
    expect(envelope.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(store.sent[0].subject).toBe("Thanks for checking with Sweet Success Fundraising");
    expect(store.sent[0].text).toContain("Hi Gus,");
    expect(store.sent[0].text).toContain("We don't serve postal code S7K 1A1 yet.");
    expect(store.sent[0].text).toContain("Questions? Email hello@sweetsuccessfundraising.com");
    expect(store.sent[0].text).toContain("Sweet Success Fundraising Inc. · Site 18, Comp 35 RR1, Sundre, AB T0M 1X0 · hello@sweetsuccessfundraising.com · sweetsuccessfundraising.com");
    expect(store.sent[0].text.indexOf("Yes, keep me posted")).toBeLessThan(store.sent[0].text.indexOf("Questions? Email"));
    expect(store.sent[0].html).toContain("/waitlist/keep?t=");
    expect(store.sent[0].html).toContain('href="mailto:hello@sweetsuccessfundraising.com"');
    expect(store.sent[0].html).toContain('href="https://sweetsuccessfundraising.com"');
    expect(store.sent[0].html).toContain(">Unsubscribe</a>");
    expect(store.sent[0].headers["Reply-To"]).toBe("hello@sweetsuccessfundraising.com");
    expect(store.sent[0].text).not.toMatch(/skittles|jolly rancher|gummy/i);
    expect(readFileSync("lib/waitlist-copy.ts", "utf8")).toContain("DRAFT copy, Chris sign-off needed before go-live");
    expect(() => areaOpeningNotice()).toThrow(/not built/);
    expect(() => waitlistReplyTo({ SSF_WAITLIST_REPLY_TO: "someone@gmail.com" })).toThrow(/personal Gmail/);
  });

  it("does not add a second row or email an unsubscribed address", async () => {
    const store = memory();
    await saveOutOfAreaInterest({
      email: "pat@example.com",
      firstName: "Pat",
      postal: "S7K",
      areas,
      find: store.find,
      insert: store.insert,
      tally: store.tally,
      send: store.send,
      origin,
    });
    const again = await saveOutOfAreaInterest({
      email: "PAT@example.com",
      firstName: "Pat",
      postal: "S7K",
      areas,
      find: store.find,
      insert: store.insert,
      tally: store.tally,
      send: store.send,
      origin,
    });
    expect(again.emailed).toBe(false);
    expect(store.rows).toHaveLength(1);
    expect(store.sent).toHaveLength(1);
    store.rows[0].unsubscribedAt = "2026-11-23T00:00:00Z";
    const blocked = await saveOutOfAreaInterest({
      email: "pat@example.com",
      firstName: "Pat",
      postal: "S7K",
      areas,
      find: store.find,
      insert: store.insert,
      tally: store.tally,
      send: store.send,
      origin,
    });
    expect(blocked.emailed).toBe(false);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].unsubscribedAt).toBe("2026-11-23T00:00:00Z");
    expect(store.sent).toHaveLength(1);
    expect(unsubscribeOnPost("2026-11-23T00:00:00Z", "2026-11-24T00:00:00Z").changed).toBe(false);
    expect(unsubscribeOnPost(null, "2026-11-24T00:00:00Z").changed).toBe(true);
    const page = readFileSync("app/waitlist/unsubscribe/[token]/page.tsx", "utf8");
    expect(page).toContain('method="post"');
    expect(page).not.toContain(".update(");
    expect(readFileSync("app/api/waitlist/unsubscribe/route.ts", "utf8")).toContain("fromQuery");
  });

  it("formats the headline and keeps a single alert", () => {
    expect(formatServedCode("s7k1a1")).toBe("S7K 1A1");
    expect(formatServedCode("s7k 1a1")).toBe("S7K 1A1");
    expect(formatServedCode("90210-1234")).toBe("90210");
    expect(formatServedCode("  s7k ")).toBe("S7K");
    expect(waitlistHeadline("s7k1a1")).toBe("Thanks for checking! We don't serve postal code S7K 1A1 yet.");
    expect(waitlistHeadline("<script>")).toBe("Thanks for checking! We don't serve postal code <SCRIPT> yet.");
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
    const link = `${origin}/waitlist/unsubscribe/${"b".repeat(32)}`;
    const keep = `${origin}/waitlist/keep?t=${"k".repeat(32)}`;
    expect(outOfAreaMessage({ firstName: "", postal: "<script>", unsubscribeUrl: link, keepUrl: keep }).html).toContain("&lt;SCRIPT&gt;");
    expect(outOfAreaMessage({ firstName: "", postal: "S7K", unsubscribeUrl: link, keepUrl: keep }).text).toContain("Hi there,");
    expect(waitlistContactLine()).toBe("Sweet Success Fundraising Inc. · Site 18, Comp 35 RR1, Sundre, AB T0M 1X0 · hello@sweetsuccessfundraising.com · sweetsuccessfundraising.com");
    const now = new Date("2026-11-23T12:00:00Z");
    expect(eligibleForAreaNotice({ unsubscribedAt: null, consentType: "express", consentedAt: "2020-01-01T00:00:00Z" }, now)).toBe(true);
    expect(eligibleForAreaNotice({ unsubscribedAt: "2026-01-01T00:00:00Z", consentType: "express", consentedAt: "2026-11-01T00:00:00Z" }, now)).toBe(false);
    expect(eligibleForAreaNotice({ unsubscribedAt: null, consentType: "implied", consentedAt: "2026-08-01T00:00:00Z" }, now)).toBe(true);
    expect(eligibleForAreaNotice({ unsubscribedAt: null, consentType: "implied", consentedAt: "2026-01-01T00:00:00Z" }, now)).toBe(false);
    expect(planExpressConsent(null, "2026-11-23T00:00:00Z")).toBe("neutral");
    expect(planExpressConsent({ unsubscribedAt: "2026-11-01T00:00:00Z", consentType: "implied", expressConsentedAt: null }, "2026-11-23T00:00:00Z")).toBe("blocked");
    expect(planExpressConsent({ unsubscribedAt: null, consentType: "implied", expressConsentedAt: null }, "2026-11-23T00:00:00Z")).toBe("set");
    expect(planExpressConsent({ unsubscribedAt: null, consentType: "express", expressConsentedAt: "2026-11-01T00:00:00Z" }, "2026-11-23T00:00:00Z")).toBe("already");
    const keepRoute = readFileSync("app/api/waitlist/keep/route.ts", "utf8");
    const unsubRoute = readFileSync("app/api/waitlist/unsubscribe/route.ts", "utf8");
    expect(keepRoute).toContain('.eq("keep_token", token)');
    expect(keepRoute).not.toContain("unsub_token");
    expect(unsubRoute).toContain('.eq("unsub_token", token)');
    expect(unsubRoute).not.toContain("keep_token");
    expect(readFileSync("app/waitlist/keep/page.tsx", "utf8")).not.toContain(".update(");
    expect(postalFieldHint()).toBe("Currently serving Alberta groups only.");
    expect(WAITLIST_RESULT_NOTE).toBe("We've emailed you, and we'll let you know if we start serving your area. You can unsubscribe anytime.");
    expect(WAITLIST_BODY.startsWith("Thanks for your interest.")).toBe(true);
    const form = readFileSync("components/ApplyForm.tsx", "utf8");
    expect(form.match(/role="alert"/g)).toHaveLength(1);
    expect(form).toContain("aria-describedby=\"postal-hint\"");
    expect(form).toContain("postalFieldHint()");
    expect(form).toContain("waitlistHeadline(awayCode)");
    expect(form).not.toContain("dangerouslySetInnerHTML");
    expect(form).not.toContain("Notify me");
    expect(form).toContain('aria-hidden="true"');
    expect(form).toContain("tabIndex={-1}");
    const host = {
      shadowRoot: {
        getElementById(id: string) {
          return id === "__next-route-announcer__" ? node : null;
        },
      },
    };
    const node = {
      role: "alert",
      getAttribute(name: string) { return name === "role" ? this.role : null; },
      setAttribute(name: string, value: string) { if (name === "role") this.role = value; },
    };
    const empty = {
      id: "",
      textContent: "  ",
      role: "alert",
      getAttribute(name: string) { return name === "role" ? "alert" : null; },
      removeAttribute(name: string) { if (name === "role") this.role = ""; },
    };
    const doc = {
      getElementsByName() { return [host]; },
      querySelectorAll() { return [empty]; },
    };
    silenceRouteAnnouncer(doc as unknown as Document);
    expect(node.role).toBe("status");
    expect(empty.role).toBe("");
  });
});
