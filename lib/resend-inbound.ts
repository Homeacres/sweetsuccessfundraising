import { createHmac, timingSafeEqual } from "node:crypto";

export type InboundHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

/** Svix-style signature used by Resend inbound webhooks. Rejects stale timestamps. */
export function verifyResendWebhook(payload: string, headers: InboundHeaders, secret: string, now = Date.now()): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature || !secret.trim()) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts)) return false;
  const skew = Math.abs(now - ts * 1000);
  if (skew > 5 * 60 * 1000) return false;
  const key = Buffer.from(secret.trim().replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${payload}`).digest("base64");
  return headers.signature.split(" ").some((part) => {
    const value = part.startsWith("v1,") ? part.slice(3) : "";
    const left = Buffer.from(value);
    const right = Buffer.from(expected);
    return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
  });
}

export type InboundEmail = {
  resendId: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
};

export function parseInboundEmail(payload: unknown): InboundEmail | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { type?: string; data?: Record<string, unknown> };
  const data = root.data && typeof root.data === "object" ? root.data : (payload as Record<string, unknown>);
  const resendId = stringField(data.email_id) || stringField(data.id);
  const fromEmail = addressOf(data.from);
  const toEmail = addressOf(data.to);
  if (!resendId || !fromEmail || !toEmail) return null;
  return {
    resendId,
    fromEmail,
    toEmail,
    subject: stringField(data.subject),
    bodyText: stringField(data.text) || stringField(data.body_text),
    bodyHtml: stringField(data.html) || stringField(data.body_html),
  };
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function addressOf(value: unknown): string {
  if (typeof value === "string") return emailIn(value);
  if (Array.isArray(value)) return addressOf(value[0]);
  if (value && typeof value === "object" && "email" in value) return emailIn(String((value as { email?: string }).email || ""));
  return "";
}

function emailIn(value: string): string {
  const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : "";
}

export function replyLocalPartFromAddress(toEmail: string): string | null {
  const local = toEmail.split("@")[0] || "";
  const plus = local.startsWith("reply+") ? local.slice("reply+".length) : "";
  return plus || null;
}
