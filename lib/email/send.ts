import { requiredEnv } from "@/lib/env";

export type OutboundEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  cc?: string | string[];
  bcc?: string | string[];
};

export type ResendBody = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

const PERSONAL_GMAIL = /@(gmail|googlemail)\.com$/i;

/** Staff copies, tests, cc, bcc, and Reply-To must not use a personal Gmail. */
export function isPersonalGmail(address: string): boolean {
  const match = address.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return PERSONAL_GMAIL.test((match ? match[0] : address).trim());
}

function listAddresses(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

/** Staff copies, the test inbox, cc, bcc, and Reply-To cannot be a personal Gmail. */
export function assertNoPersonalGmail(message: OutboundEmail, env: Record<string, string | undefined> = process.env): void {
  const test = env.EMAIL_TEST_RECIPIENT?.trim() || "";
  if (test && isPersonalGmail(test)) {
    throw new Error("EMAIL_TEST_RECIPIENT cannot be a personal Gmail");
  }
  const replyTo = message.headers?.["Reply-To"] || message.headers?.["reply-to"] || "";
  if (replyTo && isPersonalGmail(replyTo)) {
    throw new Error("Reply-To cannot be a personal Gmail");
  }
  for (const address of [...listAddresses(message.cc), ...listAddresses(message.bcc)]) {
    if (isPersonalGmail(address)) throw new Error("cc/bcc cannot be a personal Gmail");
  }
}

/** Where a successful send is recorded. Redirects keep the original address out of `to`. */
export function sentLogStatus(env: Record<string, string | undefined> = process.env): "sent" | "redirected" {
  return env.EMAIL_TEST_RECIPIENT?.trim() ? "redirected" : "sent";
}

/**
 * Envelope for Resend. When EMAIL_TEST_RECIPIENT is set, the message goes only
 * to that address. The original address is not copied to to, cc, or bcc.
 */
export function resendBody(message: OutboundEmail, env: Record<string, string | undefined> = process.env): ResendBody {
  assertNoPersonalGmail(message, env);
  const test = env.EMAIL_TEST_RECIPIENT?.trim();
  const to = test || message.to;
  const subject = test ? `[TEST to ${message.to}] ${message.subject}` : message.subject;
  const body: ResendBody = { to: [to], subject, html: message.html, text: message.text };
  if (message.headers) body.headers = message.headers;
  return body;
}

export async function sendEmail(message: OutboundEmail): Promise<string | null> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: requiredEnv("RESEND_FROM"),
      ...resendBody(message, process.env),
    }),
  });

  const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!response.ok) {
    throw new Error(body?.message || `Resend failed (${response.status})`);
  }
  return body?.id ?? null;
}
