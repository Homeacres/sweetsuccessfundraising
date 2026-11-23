import type { PostalArea } from "@/lib/area";
import { appUrl } from "@/lib/env";
import { IMPLIED_WAITLIST_CONSENT, outOfAreaTally, planOutOfAreaSave, waitlistEmailSubject, waitlistEmailText } from "@/lib/waitlist-copy";
import { waitlistUnsubscribeHeaders } from "@/lib/waitlist-headers";

export type SavedWaitlist = { token: string; unsubscribedAt: string | null };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function outOfAreaMessage(input: string, unsubscribeUrl: string): {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
} {
  const text = waitlistEmailText(input, unsubscribeUrl);
  const html = `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
  const origin = unsubscribeUrl.slice(0, unsubscribeUrl.indexOf("/waitlist/unsubscribe/"));
  const token = unsubscribeUrl.slice(unsubscribeUrl.lastIndexOf("/") + 1);
  return {
    subject: waitlistEmailSubject(input),
    text,
    html,
    headers: waitlistUnsubscribeHeaders(origin, token),
  };
}

export async function saveOutOfAreaInterest(input: {
  email: string;
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
  const message = outOfAreaMessage(input.postal, unsubscribeUrl);
  await input.send({ to: email, ...message });
  return { emailed: true };
}
