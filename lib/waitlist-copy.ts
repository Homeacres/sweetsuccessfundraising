import { tallyPrefix, type PostalArea } from "@/lib/area";

export const WAITLIST_BODY =
  "Thanks for your interest. Sweet Success Fundraising isn't available at that postal code yet. We're currently serving groups in Alberta.";

export const IMPLIED_WAITLIST_CONSENT =
  "Implied consent: out-of-area enquiry via intake form (Chris approved add-all with unsubscribe, 2026-11-23)";

export const WAITLIST_CONTACT_NAME = "Sweet Success Fundraising Inc.";
export const WAITLIST_MAILING_ADDRESS = "Site 18, Comp 35 RR1, Sundre, AB T0M 1X0";
export const WAITLIST_CONTACT_EMAIL = "hello@sweetsuccessfundraising.com";
export const WAITLIST_CONTACT_SITE = "sweetsuccessfundraising.com";
export const WAITLIST_CONTACT_SITE_URL = "https://sweetsuccessfundraising.com";

export function waitlistContactLine(): string {
  return [WAITLIST_CONTACT_NAME, WAITLIST_MAILING_ADDRESS, WAITLIST_CONTACT_EMAIL, WAITLIST_CONTACT_SITE].join(" · ");
}

// DRAFT copy, Chris sign-off needed before go-live
export const EXPRESS_CONSENT_TEXT =
  "Yes, Sweet Success Fundraising Inc. may email me if it starts serving my area. I can unsubscribe anytime.";

// DRAFT copy, Chris sign-off needed before go-live
export const KEEP_BUTTON = "Keep me posted";

// DRAFT copy, Chris sign-off needed before go-live
export const KEEP_THANKS = "You're all set. We'll email you if we start serving your area.";

export function postalFieldHint(): string {
  return "Currently serving Alberta groups only.";
}

/** Uppercase display of the code the person typed. Full Canadian codes gain one space. US ZIPs keep five digits. */
export function formatServedCode(input: string): string {
  const trimmed = input.trim().toUpperCase();
  const compact = trimmed.replace(/\s+/g, "");
  if (/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(compact)) return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  if (/^\d{5}(?:\d{4}|-\d{4})?$/.test(compact)) return compact.replace(/\D/g, "").slice(0, 5);
  return trimmed;
}

export function waitlistHeadline(input: string): string {
  return `Thanks for checking! We don't serve postal code ${formatServedCode(input)} yet.`;
}

// DRAFT copy, Chris sign-off needed before go-live
export const WAITLIST_RESULT_NOTE =
  "We've emailed you, and we'll let you know if we start serving your area. You can unsubscribe anytime.";

// DRAFT copy, Chris sign-off needed before go-live
// The only mail sent for an area_waitlist row in this build is this enquiry.
// The only future send allowed is an area-opening notice. That notice is not built.
export function areaOpeningNotice(): never {
  throw new Error("Area-opening notice is not built");
}

// DRAFT copy, Chris sign-off needed before go-live
export function waitlistEmailSubject(): string {
  return "Thanks for checking with Sweet Success Fundraising";
}

export function waitlistGreeting(firstName: string): string {
  const name = firstName.trim();
  return name ? `Hi ${name},` : "Hi there,";
}

// DRAFT copy, Chris sign-off needed before go-live
export function waitlistEmailText(input: { firstName: string; postal: string; unsubscribeUrl: string; keepUrl: string }): string {
  const code = formatServedCode(input.postal);
  return [
    waitlistGreeting(input.firstName),
    "",
    `Thanks for asking about a fundraiser with Sweet Success. We don't serve postal code ${code} yet.`,
    "",
    "We've added you to our list, and we'll email you if we start serving your area. You can unsubscribe anytime with the link below.",
    "",
    "Want to make sure you hear from us?",
    `Yes, keep me posted: ${input.keepUrl}`,
    "",
    "Questions? Email hello@sweetsuccessfundraising.com",
    "",
    "Thanks,",
    "The Sweet Success Family",
    "",
    waitlistContactLine(),
    `Unsubscribe: ${input.unsubscribeUrl}`,
  ].join("\n");
}

export type WaitlistRowState = { unsubscribedAt: string | null; token: string } | null;

export function planOutOfAreaSave(existing: WaitlistRowState): "insert" | "keep" | "leave-unsubscribed" {
  if (!existing) return "insert";
  if (existing.unsubscribedAt) return "leave-unsubscribed";
  return "keep";
}

export function outOfAreaTally(postal: string, areas: PostalArea[]): { country: "CA" | "US"; prefix: string } | null {
  return tallyPrefix(postal, areas);
}
