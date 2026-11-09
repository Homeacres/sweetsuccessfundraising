import { redirect } from "next/navigation";
import { organizerActionSecret, verifyOrganizerAction } from "@/lib/organizer-token";
import { participantSlug } from "@/lib/roster";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const secret = organizerActionSecret();
  const parsed = secret ? verifyOrganizerAction(token, "signup", secret) : null;
  if (!parsed) redirect("/p/join/invalid");
  if (form.get("consent") !== "on") redirect(`/p/join/${token}`);
  const email = String(form.get("email") || "").trim().toLowerCase();
  const parentFirst = String(form.get("parentFirst") || "").trim().slice(0, 80);
  const parentLast = String(form.get("parentLast") || "").trim().slice(0, 80);
  const phone = String(form.get("phone") || "").trim().slice(0, 40);
  const optedIn = form.get("leaderboard") === "on";
  const children = [
    { first: String(form.get("childFirst") || ""), last: String(form.get("childLast") || "") },
    { first: String(form.get("child2First") || ""), last: String(form.get("child2Last") || "") },
  ].map((child) => ({ first: child.first.trim().slice(0, 40), last: child.last.trim().slice(0, 1) })).filter((child) => child.first && child.last);
  if (!email || !parentFirst || !parentLast || !children.length) redirect(`/p/join/${token}`);

  const db = supabaseAdmin();
  const { data: campaign } = await db.from("campaigns").select("campaign_id").eq("organizer_id", parsed.organizerId).order("created_at", { ascending: true }).limit(1);
  const campaignId = campaign?.[0]?.campaign_id;
  if (!campaignId) redirect(`/p/join/${token}`);
  const { data: existingFamily } = await db.from("families").select("family_id").eq("parent_email", email).maybeSingle();
  let familyId = existingFamily?.family_id;
  if (!familyId) {
    const { data: created, error } = await db.from("families").insert({
      parent_first_name: parentFirst,
      parent_last_name: parentLast,
      parent_email: email,
      parent_phone: phone || null,
      player_first_name: children[0].first,
      player_last_name: children[0].last,
      referral_code: `p${Date.now().toString(36)}${children[0].first.slice(0, 3)}`.slice(0, 24),
      consent_optin: true,
      consent_at: new Date().toISOString(),
    }).select("family_id").single();
    if (error || !created) redirect(`/p/join/${token}`);
    familyId = created.family_id;
  }
  const { data: existing } = await db.from("campaign_participants").select("player_slug").eq("campaign_id", campaignId);
  const taken = (existing ?? []).map((row) => row.player_slug);
  for (const child of children) {
    const slug = participantSlug(child.first, child.last, taken);
    taken.push(slug);
    await db.from("campaign_participants").insert({
      campaign_id: campaignId,
      family_id: familyId,
      player_first_name: child.first,
      player_last_name: child.last,
      player_slug: slug,
      hide_last_name: true,
      leaderboard_opt_in: optedIn,
    });
  }
  redirect(`/p/join/${token}?done=1`);
}
