import { planExpressConsent } from "@/lib/area-waitlist";
import { isUnguessableToken } from "@/lib/ledger-rules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cleanText } from "@/lib/text";
import { EXPRESS_CONSENT_TEXT, KEEP_THANKS } from "@/lib/waitlist-copy";

export const dynamic = "force-dynamic";

async function tokenFrom(request: Request): Promise<string> {
  const url = new URL(request.url);
  const fromQuery = cleanText(url.searchParams.get("t") || url.searchParams.get("token"), 80);
  const type = request.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const body = (await request.json()) as { token?: unknown };
    return cleanText(body.token, 80) || fromQuery;
  }
  if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
    const form = await request.formData();
    return cleanText(form.get("token"), 80) || fromQuery;
  }
  return fromQuery;
}

export async function POST(request: Request) {
  const token = await tokenFrom(request);
  const neutral = () => Response.json({ ok: true, neutral: true });
  if (!isUnguessableToken(token)) return neutral();
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("area_waitlist")
    .select("unsubscribed_at, consent_type, express_consented_at")
    .eq("keep_token", token)
    .maybeSingle();
  if (error || !data) return neutral();
  const now = new Date().toISOString();
  const plan = planExpressConsent({
    unsubscribedAt: data.unsubscribed_at,
    consentType: data.consent_type === "express" ? "express" : "implied",
    expressConsentedAt: data.express_consented_at,
  }, now);
  if (plan === "neutral" || plan === "blocked") return neutral();
  if (plan === "set") {
    const { error: updateError } = await db
      .from("area_waitlist")
      .update({
        consent_type: "express",
        express_consented_at: now,
        express_consent_text: EXPRESS_CONSENT_TEXT,
      })
      .eq("keep_token", token)
      .is("unsubscribed_at", null);
    if (updateError) throw updateError;
  }
  const wantsHtml = (request.headers.get("content-type") || "").includes("form");
  if (wantsHtml) return Response.redirect(new URL(`/waitlist/keep?t=${encodeURIComponent(token)}&done=1`, request.url), 303);
  return Response.json({ ok: true, thanks: KEEP_THANKS });
}
