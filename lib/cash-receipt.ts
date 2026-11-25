import { formatUserDate } from "@/lib/dates";
import { appUrl } from "@/lib/env";
import { receiptMoneyLines, receiptSignOff } from "@/lib/gst";
import { formatCad } from "@/lib/money";
import { bagCount } from "@/lib/text";

export type CashReceiptLine = { label: string; qty: number; amountCents: number };

export type CashReceiptInput = {
  buyerName: string;
  team: string;
  totalCents: number;
  bags: number;
  receivedBy: string;
  receivedAt: string | null;
  lines: CashReceiptLine[];
  receiptToken: string;
  env?: Record<string, string | undefined>;
};

/** JSON false, or a JSON boolean stored as false. Only an explicit true sends. */
export function cashReceiptEmailsEnabled(value: unknown): boolean {
  return value === true;
}

export type CashReceiptSendPlan = "send" | "held" | "page_only";

/**
 * Emails stay off until cash_receipt_emails_enabled is true.
 * Phone-only supporters get the receipt page and no send.
 */
export function cashReceiptSendPlan(input: {
  emailsEnabled: boolean;
  alreadyReceived: boolean;
  buyerEmail: string | null;
  phoneOnly: boolean;
}): CashReceiptSendPlan | "skipped" {
  if (input.alreadyReceived) return "skipped";
  const email = (input.buyerEmail || "").trim();
  if (!email || input.phoneOnly) return "page_only";
  if (!input.emailsEnabled) return "held";
  return "send";
}

export function cashReceiptUrl(receiptToken: string): string {
  return `${appUrl()}/r/${receiptToken}`;
}

export function cashReceiptCopy(input: CashReceiptInput): { subject: string; html: string; text: string } {
  const when = formatUserDate(input.receivedAt);
  const who = input.receivedBy.trim() || "The parent";
  const lineText = input.lines
    .map((line) => `${line.label} × ${line.qty} — ${formatCad(line.amountCents)}`)
    .join("\n");
  const text = [
    `${who} received this payment on behalf of ${input.team}.`,
    "",
    `Buyer: ${input.buyerName}`,
    lineText,
    "",
    ...receiptMoneyLines(input.totalCents, input.env),
    bagCount(input.bags),
    when ? `Received: ${when}.` : "",
    "",
    `Receipt: ${cashReceiptUrl(input.receiptToken)}`,
    "",
    receiptSignOff().text,
  ]
    .filter((line) => line !== "")
    .join("\n");
  const items = input.lines
    .map(
      (line) =>
        `<li>${escapeHtml(line.label)} × ${line.qty} — ${formatCad(line.amountCents)}</li>`,
    )
    .join("");
  const html = `<p><strong>${escapeHtml(who)}</strong> received this payment on behalf of <strong>${escapeHtml(input.team)}</strong>.</p>
<p>Buyer: ${escapeHtml(input.buyerName)}</p>
<ul>${items}</ul>
${receiptMoneyLines(input.totalCents, input.env).map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
<p>${escapeHtml(bagCount(input.bags))}</p>
${when ? `<p>Received ${escapeHtml(when)}.</p>` : ""}
${receiptSignOff().html}`;
  return { subject: `Cash receipt: ${input.team}`, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
