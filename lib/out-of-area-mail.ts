import type { PostalArea } from "@/lib/area";
import { appUrl } from "@/lib/env";
import { isPersonalGmail } from "@/lib/email/send";
import { IMPLIED_WAITLIST_CONSENT, formatServedCode, outOfAreaTally, planOutOfAreaSave, waitlistEmailSubject, waitlistEmailText, waitlistGreeting } from "@/lib/waitlist-copy";
import { waitlistUnsubscribeHeaders } from "@/lib/waitlist-headers";

const PUBLIC_WAITLIST_REPLY_TO = "hello@sweetsuccessfundraising.com";

export function waitlistReplyTo(env: Record<string, string | undefined> = process.env): string {
  const value = (env.SSF_WAITLIST_REPLY_TO || PUBLIC_WAITLIST_REPLY_TO).trim();
  if (!value || isPersonalGmail(value)) throw new Error("SSF_WAITLIST_REPLY_TO cannot be a personal Gmail");
  return value;
}

export type SavedWaitlist = { token: string; unsubscribedAt: string | null };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function outOfAreaMessage(input: { firstName: string; postal: string; unsubscribeUrl: string }, env: Record<string, string | undefined> = process.env): {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
} {
  const text = waitlistEmailText(input);
  const origin = input.unsubscribeUrl.slice(0, input.unsubscribeUrl.indexOf("/waitlist/unsubscribe/"));
  const token = input.unsubscribeUrl.slice(input.unsubscribeUrl.lastIndexOf("/") + 1);
  const html = [
    `<p>${escapeHtml(waitlistGreeting(input.firstName))}</p>`,
    `<p>${escapeHtml(`Thanks for asking about a fundraiser with Sweet Success. We don't serve postal code ${formatServedCode(input.postal)} yet.`)}</p>`,
    "<p>We've added you to our list, and we'll email you if we start serving your area. You can unsubscribe anytime with the link below.</p>",
    "<p>Questions? Email hello@sweetsuccessfundraising.com</p>",
    "<p>Thanks,<br>The Sweet Success Family</p>",
    "<p>Sweet Success Fundraising Inc. · [MAILING ADDRESS – Chris to pick] · [CONTACT EMAIL OR WEBSITE – Chris to pick]</p>",
    `<p><a href="${escapeHtml(input.unsubscribeUrl)}">Unsubscribe</a></p>`,
  ].join("");
  return {
    subject: waitlistEmailSubject(),
    text,
    html,
    headers: {
      ...waitlistUnsubscribeHeaders(origin, token),
      "Reply-To": waitlistReplyTo(env),
    },
  };
}

export async function saveOutOfAreaInterest(input: {
  email: string;
  firstName: string;
  postal: string;
  areas: PostalArea[];
  find: (email: string, country: "CA" | "US", prefix: string) => Promise<SavedWaitlist | null>;
  insert: (row: { email: string; country: "CA" | "US"; prefix: string; consentText: string }) => Promise<SavedWaitlist>;
  tally: (country: "CA" | "US", prefix: string) => Promise<void>;
  send: (message: { to: string; subject: string; text: string; html: string; headers: Record<string, string> }) => Promise<void>;
  origin?: string;
}): Promise<{ emailed: boolean }> {
  const tally = outOfAreaTally(input.postal, input.areas);
  if (!tally) return { emailed: false };
  await input.tally(tally.country, tally.prefix);
  const email = input.email.trim().toLowerCase();
  const existing = await input.find(email, tally.country, tally.prefix);
  const plan = planOutOfAreaSave(existing);
  let row = existing;
  if (plan === "insert") {
    row = await input.insert({
      email,
      country: tally.country,
      prefix: tally.prefix,
      consentText: IMPLIED_WAITLIST_CONSENT,
    });
  }
  if (plan === "leave-unsubscribed" || !row?.token) return { emailed: false };
  if (plan === "keep") return { emailed: false };
  const origin = input.origin || appUrl();
  const unsubscribeUrl = `${origin}/waitlist/unsubscribe/${row.token}`;
  const message = outOfAreaMessage({ firstName: input.firstName, postal: input.postal, unsubscribeUrl });
  await input.send({ to: email, ...message });
  return { emailed: true };
}
