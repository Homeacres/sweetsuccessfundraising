import { tallyPrefix, type PostalArea } from "@/lib/area";

export const WAITLIST_BODY =
  "Thanks for your interest. Sweet Success Fundraising isn't available at that postal code yet. We're currently serving groups in Alberta.";

export const IMPLIED_WAITLIST_CONSENT =
  "Implied consent: out-of-area enquiry via intake form (Chris approved add-all with unsubscribe, 2026-11-23)";

export const WAITLIST_SENDER =
  "Sweet Success Fundraising Inc., [mailing address] · [contact email or website]";

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

// COPY-PENDING-CORA
export const WAITLIST_RESULT_NOTE =
  "We've emailed you and will let you know if we come to your area. You can unsubscribe anytime.";

// COPY-PENDING-CORA
export function waitlistEmailSubject(input: string): string {
  return `We don't serve postal code ${formatServedCode(input)} yet`;
}

// COPY-PENDING-CORA
export function waitlistEmailText(input: string, unsubscribeUrl: string): string {
  return `${waitlistHeadline(input)}\n\n${WAITLIST_BODY}\n\nWe'll let you know if we come to your area.\n\n${WAITLIST_SENDER}\n\nUnsubscribe: ${unsubscribeUrl}`;
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
