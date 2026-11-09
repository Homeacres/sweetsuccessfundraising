import { activityLine } from "@/lib/email/activity-lines";
import { appUrl } from "@/lib/env";
import { organizerActionSecret, signOrganizerAction } from "@/lib/organizer-token";
import { prospectFields, type ProspectFields } from "@/lib/quote-copy";

export { onPageQuote, prospectFields, formatQuoteGoal, type ProspectFields } from "@/lib/quote-copy";

/** Provisional until Chris replaces it. One place so the sentence is not copied around. */
export const BAG_ARRIVAL =
  "We deliver your whole order to you, ready for your group's personal touch. Add your own labels, then hand them out.";

export const SIGN_OFF_NAME = "The Sweet Success Family";

export const DEFAULT_INBOUND_REPLY_DOMAIN = "team.sweetsuccessfundraising.com";

export function inboundReplyDomain(env: Record<string, string | undefined> = process.env): string {
  return (env.INBOUND_REPLY_DOMAIN || DEFAULT_INBOUND_REPLY_DOMAIN).trim().toLowerCase().replace(/^@/, "");
}

const BAG_PRICE_LINE = "Bags start at $12 (GST included), and your group makes $5 or more on every bag sold. That's at least 40% of every sale.";

export type ProspectStep = "quote" | "day2" | "day5" | "day10";

export function inboundEmailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const flag = (env.INBOUND_EMAIL_ENABLED || "").trim().toLowerCase();
  return flag === "true" || flag === "1" || flag === "yes";
}

/** Shared team inbox. Only when inbound email is on. Otherwise no Reply-To header. */
export function prospectReplyTo(_organizerId: string, env: Record<string, string | undefined> = process.env): string | null {
  if (!inboundEmailEnabled(env)) return null;
  return `hello@${inboundReplyDomain(env)}`;
}

export type ProspectLinks = {
  startUrl: string;
  unsubscribeUrl: string;
  rosterUrl: string;
  signupUrl: string;
  dashboardUrl: string;
  windowsUrl: string;
  acceptUrl: string;
};

export function prospectActionUrls(organizerId: string, env: Record<string, string | undefined> = process.env): ProspectLinks | null {
  const secret = organizerActionSecret(env);
  if (!secret) return null;
  const origin = appUrl();
  return {
    startUrl: `${origin}/o/start/${signOrganizerAction(organizerId, "start", secret)}`,
    unsubscribeUrl: `${origin}/o/unsubscribe/${signOrganizerAction(organizerId, "unsubscribe", secret)}`,
    rosterUrl: `${origin}/o/roster/${signOrganizerAction(organizerId, "roster", secret)}`,
    signupUrl: `${origin}/p/join/${signOrganizerAction(organizerId, "signup", secret)}`,
    dashboardUrl: `${origin}/o/dashboard/${signOrganizerAction(organizerId, "dashboard", secret)}`,
    windowsUrl: `${origin}/o/window/${signOrganizerAction(organizerId, "windows", secret)}`,
    acceptUrl: `${origin}/o/window/${signOrganizerAction(organizerId, "accept", secret)}`,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function button(url: string): string {
  return `<p style="margin:20px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#2D1A4E;color:#F0D875;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;">Start my fundraiser</a></p>`;
}

function signOff(fields: ProspectFields): { text: string; html: string } {
  return {
    text: `Start my fundraiser: ${fields.startUrl}\n\nOr just reply with any questions.\n\nThanks,\n${SIGN_OFF_NAME}\nUnsubscribe: ${fields.unsubscribeUrl}`,
    html: `${button(fields.startUrl)}
<p>Or just reply with any questions.</p>
<p>Thanks,<br>${escapeHtml(SIGN_OFF_NAME)}</p>
<p style="font-size:12px;"><a href="${escapeHtml(fields.unsubscribeUrl)}">Unsubscribe</a></p>`,
  };
}

export type ProspectEmail = {
  subject: string;
  preview: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

function wrap(preview: string, htmlBody: string, text: string): { html: string; text: string } {
  const html = `<!doctype html>
<html>
<body style="margin:0;background:#F7F3FF;font-family:Arial,sans-serif;color:#2D1A4E;">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preview)}</div>
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#C9A84C;font-weight:700;">Sweet Success Fundraising</p>
    ${htmlBody}
  </div>
</body>
</html>`;
  return { html, text };
}

export function prospectQuoteEmail(fields: ProspectFields, replyTo?: string | null): ProspectEmail {
  const preview = `About ${fields.bags} bags to raise ${fields.goal}.`;
  const activity = activityLine(fields.sport);
  const text = `Hi ${fields.firstName},

${activity}
Thanks for reaching out. Good luck to ${fields.teamName}.

Here's your estimate. To raise ${fields.goal}, your group would sell about ${fields.bags} bags, which is about ${fields.bagsEach} per participant. Fewer if supporters pick premium.

${BAG_PRICE_LINE}

Prices include GST. Single bags only for now.

${signOff(fields).text}`;
  const html = `<p>Hi ${escapeHtml(fields.firstName)},</p>
<p>${escapeHtml(activity)}</p>
<p>Thanks for reaching out. Good luck to ${escapeHtml(fields.teamName)}.</p>
<p>Here's your estimate. To raise ${escapeHtml(fields.goal)}, your group would sell about ${escapeHtml(fields.bags)} bags, which is about ${escapeHtml(fields.bagsEach)} per participant. Fewer if supporters pick premium.</p>
<p>${escapeHtml(BAG_PRICE_LINE)}</p>
<p>Prices include GST. Single bags only for now.</p>
${signOff(fields).html}`;
  const wrapped = wrap(preview, html, text);
  return {
    subject: `Your ${fields.teamName} fundraising estimate`,
    preview,
    ...wrapped,
    headers: replyTo ? { "Reply-To": replyTo } : undefined,
  };
}

export function prospectDay2Email(fields: ProspectFields, replyTo?: string | null): ProspectEmail {
  const preview = "Three steps, and supporters order online.";
  const text = `Hi ${fields.firstName},

Here's how a fundraiser runs for ${fields.teamName}:

1. We send you an order link to share with supporters.
2. Supporters order online, and your group makes $5 or more on every bag.
3. ${BAG_ARRIVAL}

Your estimate is still about ${fields.bags} bags (${fields.bagsEach} per participant) to raise ${fields.goal}.

${signOff(fields).text}`;
  const html = `<p>Hi ${escapeHtml(fields.firstName)},</p>
<p>Here's how a fundraiser runs for ${escapeHtml(fields.teamName)}:</p>
<ol>
<li>We send you an order link to share with supporters.</li>
<li>Supporters order online, and your group makes $5 or more on every bag.</li>
<li>${escapeHtml(BAG_ARRIVAL)}</li>
</ol>
<p>Your estimate is still about ${escapeHtml(fields.bags)} bags (${escapeHtml(fields.bagsEach)} per participant) to raise ${escapeHtml(fields.goal)}.</p>
${signOff(fields).html}`;
  const wrapped = wrap(preview, html, text);
  return {
    subject: `How it works for ${fields.teamName}`,
    preview,
    ...wrapped,
    headers: replyTo ? { "Reply-To": replyTo } : undefined,
  };
}

export function prospectDay5Email(fields: ProspectFields, replyTo?: string | null): ProspectEmail {
  const preview = "Happy to help with the goal, the bag count or ordering.";
  const text = `Hi ${fields.firstName},

If anything's holding you back, whether it's the goal, how many bags, or how supporters order, just reply and ask. We'll answer it.

All set?

${signOff(fields).text}`;
  const html = `<p>Hi ${escapeHtml(fields.firstName)},</p>
<p>If anything's holding you back, whether it's the goal, how many bags, or how supporters order, just reply and ask. We'll answer it.</p>
<p>All set?</p>
${signOff(fields).html}`;
  const wrapped = wrap(preview, html, text);
  return {
    subject: "Any questions before you start?",
    preview,
    ...wrapped,
    headers: replyTo ? { "Reply-To": replyTo } : undefined,
  };
}

export function prospectDay10Email(fields: ProspectFields, replyTo?: string | null): ProspectEmail {
  const preview = "One last note from us.";
  const text = `Hi ${fields.firstName},

This is our last email about your ${fields.teamName} estimate: about ${fields.bags} bags to raise ${fields.goal}.

If you'd still like to run it, the button's below. If now's not the right time, no worries. We won't email again, and you're welcome back anytime.

${signOff(fields).text}`;
  const html = `<p>Hi ${escapeHtml(fields.firstName)},</p>
<p>This is our last email about your ${escapeHtml(fields.teamName)} estimate: about ${escapeHtml(fields.bags)} bags to raise ${escapeHtml(fields.goal)}.</p>
<p>If you'd still like to run it, the button's below. If now's not the right time, no worries. We won't email again, and you're welcome back anytime.</p>
${signOff(fields).html}`;
  const wrapped = wrap(preview, html, text);
  return {
    subject: `Should we close your ${fields.teamName} estimate?`,
    preview,
    ...wrapped,
    headers: replyTo ? { "Reply-To": replyTo } : undefined,
  };
}

export function prospectEmailForStep(step: Exclude<ProspectStep, "quote">, fields: ProspectFields, replyTo?: string | null): ProspectEmail {
  if (step === "day2") return prospectDay2Email(fields, replyTo);
  if (step === "day5") return prospectDay5Email(fields, replyTo);
  return prospectDay10Email(fields, replyTo);
}

/** DRAFT until CORA writes the final roster note. */
export function rosterDraftEmail(input: { firstName: string; teamName: string; rosterUrl: string }): ProspectEmail {
  const preview = "DRAFT: participant links are ready.";
  const text = `DRAFT — CORA writes the final copy.

Hi ${input.firstName},

${input.teamName} is approved. Add participant names and copy each share link:

${input.rosterUrl}

Thanks,
${SIGN_OFF_NAME}
Sweet Success Fundraising`;
  const html = `<p><strong>DRAFT — CORA writes the final copy.</strong></p>
<p>Hi ${escapeHtml(input.firstName)},</p>
<p>${escapeHtml(input.teamName)} is approved. Add participant names and copy each share link.</p>
<p><a href="${escapeHtml(input.rosterUrl)}">Open the roster</a></p>
<p>Thanks,<br>${escapeHtml(SIGN_OFF_NAME)}<br>Sweet Success Fundraising</p>`;
  const wrapped = wrap(preview, html, text);
  return { subject: `DRAFT: Participant links for ${input.teamName}`, preview, ...wrapped };
}

export const PROSPECT_STEP_EMAIL: Record<"day2" | "day5" | "day10", string> = {
  day2: "prospect_day_2",
  day5: "prospect_day_5",
  day10: "prospect_day_10",
};

export function dueProspectStep(input: {
  createdAt: Date;
  now: Date;
  sentTypes: string[];
  stopped: boolean;
}): "day2" | "day5" | "day10" | null {
  if (input.stopped) return null;
  const elapsedDays = (input.now.getTime() - input.createdAt.getTime()) / 86_400_000;
  const steps = [
    { id: "day2" as const, after: 2 },
    { id: "day5" as const, after: 5 },
    { id: "day10" as const, after: 10 },
  ];
  const sentIndex = steps.findLastIndex((step) => input.sentTypes.includes(PROSPECT_STEP_EMAIL[step.id]));
  const due = steps.filter((step, index) => elapsedDays >= step.after && index > sentIndex && !input.sentTypes.includes(PROSPECT_STEP_EMAIL[step.id]));
  return due.length ? due[due.length - 1].id : null;
}
