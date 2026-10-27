import { formatUserDate } from "@/lib/dates";
import { appUrl } from "@/lib/env";
import { formatCad } from "@/lib/money";
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

export function applicationAdminEmail(input: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  team: string;
  sport: string;
  city: string;
  postal: string;
  participants: number | null;
  goalDollars: number | null;
  howHeard: string;
  consent: boolean;
  estimate: string | null;
}): { subject: string; html: string; text: string } {
  const rows: [string, string][] = [
    ["Name", `${input.firstName} ${input.lastName}`],
    ["Email", input.email],
    ["Phone", input.phone || "—"],
    ["Team", input.team],
    ["Sport", input.sport],
    ["City", input.city || "—"],
    ["Postal code", input.postal],
    ["Participants", input.participants ? String(input.participants) : "—"],
    ["Goal", input.goalDollars ? `$${input.goalDollars.toLocaleString("en-CA")}` : "—"],
    ["Heard about us", input.howHeard || "—"],
    ["CASL consent", input.consent ? "Yes" : "No"],
    ["Estimate", input.estimate || "—"],
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

export function applicationApplicantEmail(input: {
  firstName: string;
  team: string;
  estimate: string | null;
}): { subject: string; html: string; text: string } {
  const extra = input.estimate ? `\n\n${input.estimate}` : "";
  const text = `Hi ${input.firstName}, we have your application for ${input.team}. We'll confirm your campaign within 48 hours.${extra}\n\nQuestions: hello@sweetsuccessfundraising.com`;
  const html = `<p>Hi ${escapeHtml(input.firstName)},</p>
<p>We have your application for <strong>${escapeHtml(input.team)}</strong>. We'll confirm your campaign within 48 hours.</p>
${input.estimate ? `<p>${escapeHtml(input.estimate)}</p>` : ""}
<p>Questions? Email <a href="mailto:hello@sweetsuccessfundraising.com">hello@sweetsuccessfundraising.com</a>.</p>`;
  const wrapped = shell("You're in the pipeline", html, text);
  return { subject: "We received your Sweet Success application", ...wrapped };
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
};

export function receiptEmail(input: {
  buyerName: string;
  team: string;
  totalCents: number;
  bags: number;
  lines: ReceiptLine[];
}): { subject: string; html: string; text: string } {
  const lineText = input.lines
    .map((line) => `${line.player} — ${line.candy} × ${line.qty}${line.mix ? " (mix pack)" : ""} — ${formatCad(line.grossCents)}`)
    .join("\n");
  const text = `Hi ${input.buyerName}, thanks for supporting ${input.team}.\n\n${lineText}\n\nTotal: ${formatCad(input.totalCents)} for ${input.bags} bag${input.bags === 1 ? "" : "s"}.\n\nThere is no shipping address. The order is delivered in bulk to the team organizer, who hands it out at practice or a game.`;
  const html = `<p>Hi ${escapeHtml(input.buyerName)}, thanks for supporting <strong>${escapeHtml(input.team)}</strong>.</p>
<ul>${input.lines
    .map(
      (line) =>
        `<li>${escapeHtml(line.player)} — ${escapeHtml(line.candy)} × ${line.qty}${line.mix ? " (mix pack)" : ""} — ${formatCad(line.grossCents)}</li>`,
    )
    .join("")}</ul>
<p><strong>Total ${formatCad(input.totalCents)}</strong> · ${input.bags} bag${input.bags === 1 ? "" : "s"}</p>
<p>There is no shipping address on this order. It is delivered in bulk to the team organizer, who hands bags out at practice or a game.</p>`;
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

export function milestoneEmail(input: {
  kind: MilestoneName;
  team: string;
  parentFirst: string;
  token: string;
  players: MilestonePlayer[];
  endDate: string | null;
}): { subject: string; html: string; text: string; unsubscribeUrl: string } {
  const origin = appUrl();
  const boardUrl = `${origin}/l/${input.token}`;
  const unsubscribeUrl = `${origin}/unsubscribe/${input.token}`;
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
  const stats = input.players
    .map(
      (player) =>
        `${playerDisplayName(player.first, player.last, player.hideLastName)}: ${player.bags} bags, ${formatCad(player.teamCents)} for the team`,
    )
    .join("\n");
  const text = `Hi ${input.parentFirst},\n\n${intro[input.kind]}\n\n${stats}\n\nPrivate leaderboard: ${boardUrl}\n\nYou can stop these updates (order receipts still arrive): ${unsubscribeUrl}`;
  const html = `<p>Hi ${escapeHtml(input.parentFirst)},</p>
<p>${escapeHtml(intro[input.kind])}</p>
<ul>${input.players
    .map(
      (player) =>
        `<li>${escapeHtml(playerDisplayName(player.first, player.last, player.hideLastName))}: ${player.bags} bags, ${formatCad(player.teamCents)} for the team</li>`,
    )
    .join("")}</ul>
<p><a href="${boardUrl}">Open the private leaderboard</a></p>
<p style="font-size:12px;color:#6B5F7A;">These updates are optional. <a href="${unsubscribeUrl}">Unsubscribe</a>. Order receipts still send.</p>`;
  const wrapped = shell(input.team, html, text);
  return {
    subject: MILESTONE_SUBJECT[input.kind](input.team),
    unsubscribeUrl,
    ...wrapped,
  };
}
