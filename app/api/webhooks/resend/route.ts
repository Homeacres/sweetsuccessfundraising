import { inboundEmailEnabled, inboundReplyDomain } from "@/lib/email/prospect";
import { organizerActionSecret, organizerIdFromReplyLocalPart } from "@/lib/organizer-token";
import { parseInboundEmail, replyLocalPartFromAddress, verifyResendWebhook } from "@/lib/resend-inbound";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!inboundEmailEnabled()) return Response.json({ ok: false, error: "Inbound email is off." }, { status: 404 });
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ error: "Inbound webhook is not configured." }, { status: 401 });
  const payload = await request.text();
  const ok = verifyResendWebhook(payload, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  }, secret);
  if (!ok) return Response.json({ error: "Invalid signature" }, { status: 401 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }
  const email = parseInboundEmail(parsed);
  if (!email) return Response.json({ ok: true, ignored: true });

  const db = supabaseAdmin();
  const actionSecret = organizerActionSecret();
  const local = replyLocalPartFromAddress(email.toEmail);
  let organizerId = actionSecret && local ? organizerIdFromReplyLocalPart(local, actionSecret) : null;
  if (!organizerId) {
    const { data } = await db.from("organizers").select("organizer_id").eq("email", email.fromEmail).maybeSingle();
    organizerId = data?.organizer_id ?? null;
  }

  const { error } = await db.from("inbound_messages").insert({
    organizer_id: organizerId,
    from_email: email.fromEmail,
    to_email: email.toEmail,
    subject: email.subject || null,
    body_text: email.bodyText || null,
    body_html: email.bodyHtml || null,
    resend_id: email.resendId,
  });
  if (error && error.code !== "23505") throw error;
  if (organizerId) {
    await db.from("organizers").update({ replied_at: new Date().toISOString() }).eq("organizer_id", organizerId).is("replied_at", null);
  }
  if (!email.toEmail.endsWith(`@${inboundReplyDomain()}`) && !organizerId) {
    return Response.json({ ok: true, matched: false });
  }
  return Response.json({ ok: true, matched: Boolean(organizerId) });
}
