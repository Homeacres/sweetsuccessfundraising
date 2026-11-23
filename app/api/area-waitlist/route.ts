import { planWaitlistJoin } from "@/lib/area-waitlist";
import { loadPostalAreas } from "@/lib/postal-areas";
import { allowRequest, requestRateKey } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cleanText } from "@/lib/text";
import { WAITLIST_CONSENT } from "@/lib/waitlist-copy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const honeypot = cleanText(body.company, 200);
  const rateLimited = !allowRequest(requestRateKey(request, "waitlist"));
  const email = cleanText(body.email, 254);
  const postal = cleanText(body.postal, 12);
  const consent = body.consent === true;
  if (honeypot || rateLimited) return Response.json({ ok: true });

  const areas = await loadPostalAreas();
  const existingEmail = email.trim().toLowerCase();
  const planPreview = planWaitlistJoin({
    email,
    consent,
    postal,
    areas,
    honeypot: "",
    rateLimited: false,
    existing: null,
  });
  let existing = null;
  if (planPreview.action === "insert") {
    const { data, error } = await supabaseAdmin()
      .from("area_waitlist")
      .select("email, unsubscribed_at")
      .eq("email", planPreview.email)
      .eq("country", planPreview.country)
      .eq("postal_prefix", planPreview.prefix)
      .maybeSingle();
    if (error) throw error;
    existing = data ? { email: data.email, unsubscribedAt: data.unsubscribed_at } : null;
  }
  const plan = planWaitlistJoin({
    email,
    consent,
    postal,
    areas,
    honeypot: "",
    rateLimited: false,
    existing,
  });
  if (plan.action === "reject") return Response.json({ ok: false }, { status: 400 });
  if (plan.action === "insert") {
    const { error } = await supabaseAdmin().from("area_waitlist").insert({
      email: plan.email,
      country: plan.country,
      postal_prefix: plan.prefix,
      consent_text: WAITLIST_CONSENT,
    });
    if (error && error.code !== "23505") throw error;
  }
  return Response.json({ ok: true });
}
