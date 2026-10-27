import { requiredEnv } from "@/lib/env";

export type OutboundEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export async function sendEmail(message: OutboundEmail): Promise<string | null> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: requiredEnv("RESEND_FROM"),
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: message.headers,
    }),
  });

  const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!response.ok) {
    throw new Error(body?.message || `Resend failed (${response.status})`);
  }
  return body?.id ?? null;
}
