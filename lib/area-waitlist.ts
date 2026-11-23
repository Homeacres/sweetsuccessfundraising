import { matchPostalArea, tallyPrefix, type PostalArea } from "@/lib/area";
import { IMPLIED_WAITLIST_CONSENT } from "@/lib/waitlist-copy";
import { isEmail } from "@/lib/text";

export type WaitlistExisting = {
  email: string;
  unsubscribedAt: string | null;
};

export type WaitlistPlan =
  | { action: "ignore" }
  | { action: "reject" }
  | { action: "keep" }
  | { action: "insert"; email: string; country: "CA" | "US"; prefix: string; consentText: string };

export function planWaitlistJoin(input: {
  email: string;
  consent: boolean;
  postal: string;
  areas: PostalArea[];
  honeypot: string;
  rateLimited: boolean;
  existing: WaitlistExisting | null;
}): WaitlistPlan {
  if (input.honeypot || input.rateLimited) return { action: "ignore" };
  const email = input.email.trim().toLowerCase();
  if (!email || !input.consent || !isEmail(email)) return { action: "reject" };
  const tally = tallyPrefix(input.postal, input.areas);
  const area = matchPostalArea(input.postal, input.areas);
  if (!tally || area.ok) return { action: "reject" };
  if (input.existing) return { action: "keep" };
  return { action: "insert", email, country: tally.country, prefix: tally.prefix, consentText: IMPLIED_WAITLIST_CONSENT };
}

export function unsubscribeOnPost(current: string | null, now: string): { unsubscribedAt: string; changed: boolean } {
  if (current) return { unsubscribedAt: current, changed: false };
  return { unsubscribedAt: now, changed: true };
}
