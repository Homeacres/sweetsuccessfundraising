export {
  alternateWindowEmail,
  approvedEmail,
  countdownEmail,
  finalDaysEmail,
  launchEmail,
  midpointEmail,
  parentInviteEmail,
  parkedEmail,
  progressEmail,
  requestReceivedEmail,
  wrapUpEmail,
} from "@/lib/email/flow-copy";
import { formatUserDate } from "@/lib/dates";
import { prospectFields, prospectQuoteEmail } from "@/lib/email/prospect";
import { estimateSentences, type BagEstimate } from "@/lib/estimate";
import { appUrl } from "@/lib/env";
import { formatCad, formatTeamCad } from "@/lib/money";
import { playerDisplayName } from "@/lib/names";
import { MILESTONE_SUBJECT, type MilestoneName } from "@/lib/milestones";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function shell(title: string, innerHtml: string, innerText: string): { html: string; text: string } {
  const html = `<!doctype html>
<html>
<body style="margin:0;background:#F7F3FF;font-family:Arial,sans-serif;color:#2D1A4E;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <p style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#C9A84C;font-weight:700;">Sweet Success Fundraising</p>
    <h1 style="font-size:28px;line-height:1.1;margin:8px 0 16px;">${escapeHtml(title)}</h1>
    ${innerHtml}
    <p style="font-size:12px;color:#6B5F7A;margin-top:28px;">Sweet Success Fundraising · Alberta, Canada</p>
  </div>
</body>
</html>`;
  return { html, text: `${title}\n\n${innerText}\n\nSweet Success Fundraising` };
}

export type ApplyEmail = { subject: string; html: string; text: string; headers?: Record<string, string> };

export function applicationAdminEmail(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  team: string;
  sport: string;
  city: string;
  postal: string;
  participants: number;
  goalDollars: number;
  howHeard: string;
  consent: boolean;
  summary: BagEstimate;
}): ApplyEmail {
  const rows: [string, string][] = [
    ["Name", `${input.firstName} ${input.lastName}`],
    ["Email", input.email],
    ["Phone", input.phone || "—"],
    ["Team", input.team],
    ["Sport", input.sport],
    ["City", input.city || "—"],
    ["Postal code", input.postal],
    ["Participants", String(input.participants)],
    ["Goal", formatTeamCad(Math.round(input.goalDollars) * 100)],
    ["Heard about us", input.howHeard || "—"],
    ["CASL consent", input.consent ? "Yes" : "No"],
    ["Estimate", estimatePlain(input.summary)],
  ];
  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6B5F7A;">${escapeHtml(label)}</td><td style="padding:6px 0;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const wrapped = shell("New organizer application", `<table style="border-collapse:collapse;">${htmlRows}</table>`, text);
  return { subject: `New application: ${input.team}`, ...wrapped };
}

function estimatePlain(summary: BagEstimate): string {
  const lines = estimateSentences(summary);
  return `${lines.intro} ${lines.total} ${lines.each}`;
}

export function applicationApplicantEmail(input: {
  firstName: string;
  team: string;
  summary: BagEstimate;
  startUrl?: string;
  unsubscribeUrl?: string;
  replyTo?: string | null;
  sport?: string;
}): ApplyEmail {
  const mail = prospectQuoteEmail(
    prospectFields({
      firstName: input.firstName,
      teamName: input.team,
      summary: input.summary,
      startUrl: input.startUrl || "https://example.com/o/start",
      unsubscribeUrl: input.unsubscribeUrl || "https://example.com/o/unsubscribe",
      sport: input.sport,
    }),
    input.replyTo,
  );
  return { subject: mail.subject, html: mail.html, text: mail.text, headers: mail.headers };
}

export function outOfAreaAdminEmail(input: {
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  postal: string;
  province: string | null;
  sport: string;
}): { subject: string; html: string; text: string } {
  const text = `${input.firstName} ${input.lastName} (${input.email}) is outside the service area.\nPostal: ${input.postal}\nProvince: ${input.province || "unknown"}\nCity: ${input.city || "—"}\nSport: ${input.sport || "—"}`;
  const wrapped = shell("Out-of-area application", `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`, text);
  return { subject: `Out of area: ${input.firstName} ${input.lastName}`, ...wrapped };
}

export type ReceiptLine = {
  player: string;
  candy: string;
  qty: number;
  grossCents: number;
  mix: boolean;
  bundle?: string | null;
};

export function receiptEmail(input: {
  buyerName: string;
  team: string;
  totalCents: number;
  bags: number;
  lines: ReceiptLine[];
}): { subject: string; html: string; text: string } {
  const lineText = input.lines
    .map((line) => `${line.bundle ? `${line.bundle}: ` : ""}${line.player} — ${line.candy} × ${line.qty}${line.mix ? " (mix pack)" : ""} — ${formatCad(line.grossCents)}`)
    .join("\n");
  const text = `Hi ${input.buyerName}, thanks for supporting ${input.team}.\n\n${lineText}\n\nTotal: ${formatCad(input.totalCents)} for ${input.bags} bag${input.bags === 1 ? "" : "s"}.\n\nThere is no shipping address. Your order will be handed out by your team organizer.`;
  const html = `<p>Hi ${escapeHtml(input.buyerName)}, thanks for supporting <strong>${escapeHtml(input.team)}</strong>.</p>
<ul>${input.lines
    .map(
      (line) =>
        `<li>${line.bundle ? `${escapeHtml(line.bundle)}: ` : ""}${escapeHtml(line.player)} — ${escapeHtml(line.candy)} × ${line.qty}${line.mix ? " (mix pack)" : ""} — ${formatCad(line.grossCents)}</li>`,
    )
    .join("")}</ul>
<p><strong>Total ${formatCad(input.totalCents)}</strong> · ${input.bags} bag${input.bags === 1 ? "" : "s"}</p>
<p>There is no shipping address on this order. Your order will be handed out by your team organizer.</p>`;
  const wrapped = shell("Your receipt", html, text);
  return { subject: `Receipt: ${input.team} fundraiser`, ...wrapped };
}

export type MilestonePlayer = {
  first: string;
  last: string;
  hideLastName: boolean;
  bags: number;
  teamCents: number;
};

const SHAREABLE_MILESTONE = new Set<MilestoneName>(["start", "midpoint", "days_left", "final_day"]);

export function milestoneEmail(input: {
  kind: MilestoneName;
  team: string;
  parentFirst: string;
  shareLinks: { name: string; url: string }[];
  unsubscribeToken: string;
  players: MilestonePlayer[];
  endDate: string | null;
}): { subject: string; html: string; text: string; unsubscribeUrl: string } {
  const origin = appUrl();
  const unsubscribeUrl = `${origin}/unsubscribe/${input.unsubscribeToken}`;
  const names = input.players.map((player) => playerDisplayName(player.first, player.last, player.hideLastName));
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  const endLabel = formatUserDate(input.endDate);
  const intro: Record<MilestoneName, string> = {
    start: `${input.team} is taking orders. Share ${who}'s link and the bags add up from there.`,
    midpoint: `${input.team} is about halfway through the fundraiser. ${who} could still use a few more orders.`,
    days_left: `${input.team} is almost over${endLabel ? ` (ends ${endLabel})` : ""}. A quick text with ${who}'s link still counts.`,
    final_day: `Today is the last day for ${input.team}. Orders close tonight.`,
    close: `${input.team} has closed. Thanks for helping ${who} sell. The organizer will hand out the candy after it is delivered.`,
  };
  const shareLinks = SHAREABLE_MILESTONE.has(input.kind) ? input.shareLinks : [];
  const shareText = shareLinks.map((link) => `${link.name}: ${link.url}`).join("\n");
  const stats = input.players
    .map(
      (player) =>
        `${playerDisplayName(player.first, player.last, player.hideLastName)}: ${player.bags} bags, ${formatTeamCad(player.teamCents)} for the team`,
    )
    .join("\n");
  const text = `Hi ${input.parentFirst},\n\n${intro[input.kind]}${shareText ? `\n\nShare this link:\n${shareText}` : ""}\n\n${stats}\n\nYou can stop these updates (order receipts still arrive): ${unsubscribeUrl}`;
  const html = `<p>Hi ${escapeHtml(input.parentFirst)},</p>
<p>${escapeHtml(intro[input.kind])}</p>
${shareLinks.map((link) => `<p><a href="${escapeHtml(link.url)}">Share ${escapeHtml(link.name)}'s link</a></p>`).join("")}
<ul>${input.players
    .map(
      (player) =>
        `<li>${escapeHtml(playerDisplayName(player.first, player.last, player.hideLastName))}: ${player.bags} bags, ${formatTeamCad(player.teamCents)} for the team</li>`,
    )
    .join("")}</ul>
<p style="font-size:12px;color:#6B5F7A;">These updates are optional. <a href="${unsubscribeUrl}">Unsubscribe</a>. Order receipts still send.</p>`;
  const wrapped = shell(input.team, html, text);
  return {
    subject: MILESTONE_SUBJECT[input.kind](input.team),
    unsubscribeUrl,
    ...wrapped,
  };
}
