import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tallyPrefix, type PostalArea } from "@/lib/area";
import { planWaitlistJoin, unsubscribeOnPost } from "@/lib/area-waitlist";
import { allowRequest, resetRateLimit } from "@/lib/rate-limit";
import { waitlistUnsubscribeHeaders } from "@/lib/waitlist-headers";
import {
  WAITLIST_BODY,
  WAITLIST_CONSENT,
  WAITLIST_HEADING,
  WAITLIST_OPTIONAL,
  WAITLIST_SENDER,
  postalFieldHint,
} from "@/lib/waitlist-copy";

const areas: PostalArea[] = [
  { prefix: "T", country: "CA", isActive: true },
  { prefix: "T0M", country: "CA", isActive: false },
];

describe("out-of-area waitlist", () => {
  it("accepts a T code with no tally key", () => {
    expect(tallyPrefix("T2P 1J9", areas)).toBeNull();
    const apply = readFileSync("lib/apply.ts", "utf8");
    const tally = apply.indexOf("increment_rejected_area_tally");
    const insert = apply.indexOf('from("organizers").insert');
    expect(tally).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(tally);
    expect(apply).not.toContain("out_of_area_log");
    expect(apply).not.toContain("outOfAreaAdminEmail");
  });

  it("tallies a non-T code and saves a waitlist row only with email and consent", () => {
    expect(tallyPrefix("S7K", areas)).toEqual({ country: "CA", prefix: "S7K" });
    expect(tallyPrefix("S7K 3J7", areas)).toEqual({ country: "CA", prefix: "S7K" });
    const base = { postal: "S7K", areas, honeypot: "", rateLimited: false, existing: null };
    expect(planWaitlistJoin({ ...base, email: "", consent: false })).toEqual({ action: "reject" });
    expect(planWaitlistJoin({ ...base, email: "pat@example.com", consent: false })).toEqual({ action: "reject" });
    expect(planWaitlistJoin({ ...base, email: "Pat@Example.com", consent: true })).toEqual({
      action: "insert",
      email: "pat@example.com",
      country: "CA",
      prefix: "S7K",
      consentText: WAITLIST_CONSENT,
    });
  });

  it("does not save a duplicate or clear an unsubscribe", () => {
    const again = planWaitlistJoin({
      email: "PAT@example.com",
      consent: true,
      postal: "S7K",
      areas,
      honeypot: "",
      rateLimited: false,
      existing: { email: "pat@example.com", unsubscribedAt: null },
    });
    const unsubscribed = planWaitlistJoin({
      email: "pat@example.com",
      consent: true,
      postal: "S7K",
      areas,
      honeypot: "",
      rateLimited: false,
      existing: { email: "pat@example.com", unsubscribedAt: "2026-11-23T00:00:00Z" },
    });
    expect(again).toEqual({ action: "keep" });
    expect(unsubscribed).toEqual({ action: "keep" });
    expect(unsubscribeOnPost("2026-11-23T00:00:00Z", "2026-11-24T00:00:00Z")).toEqual({
      unsubscribedAt: "2026-11-23T00:00:00Z",
      changed: false,
    });
    expect(unsubscribeOnPost(null, "2026-11-24T00:00:00Z").changed).toBe(true);
  });

  it("ignores a honeypot or a rate-limit drop without a tally key of its own", () => {
    const dropped = { email: "pat@example.com", consent: true, postal: "S7K", areas, existing: null };
    expect(planWaitlistJoin({ ...dropped, honeypot: "Acme", rateLimited: false })).toEqual({ action: "ignore" });
    expect(planWaitlistJoin({ ...dropped, honeypot: "", rateLimited: true })).toEqual({ action: "ignore" });
    expect(tallyPrefix("not a postal", areas)).toBeNull();
    resetRateLimit();
    for (let i = 0; i < 8; i += 1) expect(allowRequest("hash-only", 8, 60_000, 1_000)).toBe(true);
    expect(allowRequest("hash-only", 8, 60_000, 1_000)).toBe(false);
  });

  it("renders the Option B wording, the bracketed sender line, and the required markers", () => {
    const form = readFileSync("components/ApplyForm.tsx", "utf8");
    const page = readFileSync("app/waitlist/unsubscribe/[token]/page.tsx", "utf8");
    expect(WAITLIST_HEADING).toBe("We're not in your area yet");
    expect(WAITLIST_BODY).toBe("Thanks for your interest. Sweet Success Fundraising isn't available at that postal code yet. We're currently serving groups in Alberta.");
    expect(WAITLIST_OPTIONAL).toBe("If you'd like, leave your email and we'll let you know if we come to your area.");
    expect(WAITLIST_CONSENT).toBe("Yes, email me if Sweet Success Fundraising Inc. starts serving my area. I can unsubscribe anytime.");
    expect(WAITLIST_SENDER).toBe("Sweet Success Fundraising Inc., [mailing address] · [contact email or website]");
    expect(form).toContain("WAITLIST_HEADING");
    expect(form).toContain("WAITLIST_BODY");
    expect(form).toContain("WAITLIST_OPTIONAL");
    expect(form).toContain("WAITLIST_CONSENT");
    expect(form).toContain("WAITLIST_SENDER");
    expect(form).not.toContain("We saved your note");
    expect(form).not.toContain("Alberta groups only");
    expect(form).toContain("* required");
    expect(form).toContain('aria-required="true"');
    expect(form).toContain('aria-hidden="true"');
    expect(form).toContain('tabIndex={-1}');
    expect(form).toContain('autoComplete="off"');
    expect(form).toContain('role="alert"');
    expect(form).toContain("tabIndex={-1}");
    expect(form).toContain("onBlur={onPostalBlur}");
    expect(form).not.toContain('htmlFor="sport"');
    expect(postalFieldHint()).toBeNull();
    expect(page).toContain('method="post"');
    expect(page).not.toContain("unsubscribed_at");
    const headers = waitlistUnsubscribeHeaders("https://preview.example", "abc");
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(headers["List-Unsubscribe"]).toContain("/api/waitlist/unsubscribe?token=abc");
    expect(readFileSync("app/admin/waitlist/page.tsx", "utf8")).not.toContain("send");
  });
});
