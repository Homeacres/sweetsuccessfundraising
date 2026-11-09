import { CopyLink } from "@/components/CopyLink";
import { appUrl, supabaseConfigured } from "@/lib/env";
import { organizerActionSecret, verifyOrganizerAction } from "@/lib/organizer-token";
import { participantSlug, rosterParentEmail, sharePath } from "@/lib/roster";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export const metadata = { title: "Participant links", robots: { index: false, follow: false } };

export default async function RosterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = organizerActionSecret();
  const parsed = secret ? verifyOrganizerAction(token, "roster", secret) : null;
  if (!parsed || !supabaseConfigured()) {
    return (
      <main className="page wrap">
        <h1>This link is not valid</h1>
      </main>
    );
  }

  const db = supabaseAdmin();
  const { data: campaign } = await db
    .from("campaigns")
    .select("campaign_id, team_slug, campaign_name")
    .eq("organizer_id", parsed.organizerId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  async function addName(formData: FormData) {
    "use server";
    const current = String(formData.get("token") || "");
    const key = organizerActionSecret();
    const check = key ? verifyOrganizerAction(current, "roster", key) : null;
    if (!check) redirect("/o/roster/invalid");
    const first = String(formData.get("first") || "").trim().slice(0, 40);
    const last = String(formData.get("last") || "").trim().slice(0, 40);
    if (!first || !last) redirect(`/o/roster/${current}`);
    const admin = supabaseAdmin();
    const { data: found } = await admin
      .from("campaigns")
      .select("campaign_id, team_slug")
      .eq("organizer_id", check.organizerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!found?.team_slug) redirect(`/o/roster/${current}`);
    const { data: existing } = await admin.from("campaign_participants").select("player_slug").eq("campaign_id", found.campaign_id);
    const slug = participantSlug(first, last, (existing ?? []).map((row) => row.player_slug));
    const parentEmail = rosterParentEmail(check.organizerId, slug);
    const { data: family, error: familyError } = await admin.from("families").insert({
      parent_first_name: first,
      parent_last_name: last.slice(0, 1),
      parent_email: parentEmail,
      player_first_name: first,
      player_last_name: last.slice(0, 1),
      referral_code: `r${slug}${Date.now().toString(36)}`.slice(0, 24),
    }).select("family_id").single();
    if (familyError || !family) redirect(`/o/roster/${current}`);
    await admin.from("campaign_participants").insert({
      campaign_id: found.campaign_id,
      family_id: family.family_id,
      player_first_name: first,
      player_last_name: last.slice(0, 1),
      player_slug: slug,
      hide_last_name: true,
    });
    redirect(`/o/roster/${current}`);
  }

  if (!campaign?.team_slug) {
    return (
      <main className="page wrap">
        <h1>Participant links</h1>
        <p>This fundraiser is not approved yet, so there is no share link.</p>
      </main>
    );
  }

  const { data: people } = await db
    .from("campaign_participants")
    .select("player_first_name, player_last_name, player_slug")
    .eq("campaign_id", campaign.campaign_id)
    .order("registered_at");
  const origin = appUrl();

  return (
    <main className="page wrap">
      <h1>Participant links</h1>
      <p className="sub">{campaign.campaign_name}. First name and last initial is enough. Each person gets a link to share.</p>
      <form action={addName} className="panel" style={{ margin: "16px 0" }}>
        <input type="hidden" name="token" value={token} />
        <div className="row two">
          <div>
            <label htmlFor="first">First name</label>
            <input id="first" name="first" required maxLength={40} />
          </div>
          <div>
            <label htmlFor="last">Last initial</label>
            <input id="last" name="last" required maxLength={40} />
          </div>
        </div>
        <button className="btn btn-navy" type="submit" style={{ marginTop: 12 }}>Add participant</button>
      </form>
      <div className="panel">
        {(people ?? []).length === 0 && <p>No participants yet.</p>}
        {(people ?? []).map((person) => (
          <CopyLink
            key={person.player_slug}
            label={`${person.player_first_name} ${person.player_last_name}`}
            href={`${origin}${sharePath(campaign.team_slug, person.player_slug)}`}
          />
        ))}
      </div>
    </main>
  );
}
