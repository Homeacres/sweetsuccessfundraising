import { CopyLink } from "@/components/CopyLink";
import { appUrl, supabaseConfigured } from "@/lib/env";
import { organizerActionSecret, signOrganizerAction, verifyOrganizerAction } from "@/lib/organizer-token";
import { supporterShopPath } from "@/lib/roster";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

  if (!campaign?.team_slug) {
    return (
      <main className="page wrap">
        <h1>Participant links</h1>
        <p>This fundraiser is not approved yet. Parents join from the sign-up link after approval.</p>
      </main>
    );
  }

  const { data: people } = await db
    .from("campaign_participants")
    .select("player_first_name, player_last_name, share_token")
    .eq("campaign_id", campaign.campaign_id)
    .order("registered_at");
  const origin = appUrl();
  const dashboard = `${origin}/o/dashboard/${signOrganizerAction(parsed.organizerId, "dashboard", secret || "")}`;

  return (
    <main className="page wrap">
      <h1>Participant links</h1>
      <p className="sub">{campaign.campaign_name}. Parents add their own participants. Each child gets a link to share.</p>
      <p><a href={dashboard}>Open your team dashboard</a></p>
      <div className="panel">
        {(people ?? []).length === 0 && <p>No participants yet.</p>}
        {(people ?? []).filter((person) => person.share_token).map((person) => (
          <CopyLink
            key={person.share_token}
            label={`${person.player_first_name} ${person.player_last_name}`}
            href={`${origin}${supporterShopPath(person.share_token)}`}
          />
        ))}
      </div>
    </main>
  );
}
