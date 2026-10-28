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

/** Where a successful send is recorded. Redirects keep the original address out of `to`. */
export function sentLogStatus(env: NodeJS.ProcessEnv = process.env): "sent" | "redirected" {
  return env.EMAIL_TEST_RECIPIENT?.trim() ? "redirected" : "sent";
}

/**
 * Envelope for Resend. When EMAIL_TEST_RECIPIENT is set, the message goes only
 * to that address. The original address is not copied to to, cc, or bcc.
 */
export function resendBody(message: OutboundEmail, env: NodeJS.ProcessEnv = process.env): ResendBody {
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
