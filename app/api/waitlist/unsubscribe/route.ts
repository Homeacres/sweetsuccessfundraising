import { unsubscribeOnPost } from "@/lib/area-waitlist";
import { isUnguessableToken } from "@/lib/ledger-rules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cleanText } from "@/lib/text";

export const dynamic = "force-dynamic";

async function tokenFrom(request: Request): Promise<string> {
  const url = new URL(request.url);
  const fromQuery = cleanText(url.searchParams.get("token"), 80);
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
  if (!isUnguessableToken(token)) return Response.json({ ok: false }, { status: 400 });
  const db = supabaseAdmin();
  const { data, error } = await db.from("area_waitlist").select("unsubscribed_at").eq("unsub_token", token).maybeSingle();
  if (error) throw error;
  if (!data) return Response.json({ ok: false }, { status: 404 });
  const next = unsubscribeOnPost(data.unsubscribed_at, new Date().toISOString());
  if (next.changed) {
    const { error: updateError } = await db
      .from("area_waitlist")
      .update({ unsubscribed_at: next.unsubscribedAt })
      .eq("unsub_token", token)
      .is("unsubscribed_at", null);
    if (updateError) throw updateError;
  }
  const wantsHtml = (request.headers.get("content-type") || "").includes("form");
  if (wantsHtml) return Response.redirect(new URL(`/waitlist/unsubscribe/${token}?done=1`, request.url), 303);
  return Response.json({ ok: true });
}
