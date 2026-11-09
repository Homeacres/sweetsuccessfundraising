import { ParentSignupDone, ParentSignupForm } from "@/components/FlowScreens";
import { CopyLink } from "@/components/CopyLink";
import { appUrl, supabaseConfigured } from "@/lib/env";
import { organizerActionSecret, verifyOrganizerAction } from "@/lib/organizer-token";
import { sharePath } from "@/lib/roster";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Sign up your participant", robots: { index: false, follow: false } };

export default async function JoinPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; add?: string }> }) {
  const { token } = await params;
  const query = await searchParams;
  const secret = organizerActionSecret();
  const parsed = secret ? verifyOrganizerAction(token, "signup", secret) : null;
  if (!parsed || (secret && verifyOrganizerAction(token, "dashboard", secret))) {
    return <main className="page wrap"><h1>This link is not valid</h1></main>;
  }
  let team = "your group";
  let links: { name: string; href: string }[] = [];
  if (supabaseConfigured()) {
    const db = supabaseAdmin();
    const { data: campaign } = await db.from("campaigns").select("campaign_id, campaign_name, team_slug").eq("organizer_id", parsed.organizerId).order("created_at", { ascending: true }).limit(1);
    const row = campaign?.[0];
    if (row?.campaign_name) team = row.campaign_name;
    if (query.done && row?.team_slug) {
      const { data: people } = await db.from("campaign_participants").select("player_first_name, player_last_name, player_slug").eq("campaign_id", row.campaign_id);
      links = (people ?? []).map((person) => ({
        name: `${person.player_first_name} ${person.player_last_name}`,
        href: `${appUrl()}${sharePath(row.team_slug, person.player_slug)}`,
      }));
    }
  }
  const done = query.done === "1";
  const adding = query.add === "1";
  if (done && !adding) {
    return (
      <ParentSignupDone
        team={team}
        links={links}
        addHref={`/p/join/${token}?done=1&add=1`}
      />
    );
  }
  return (
    <>
      <ParentSignupForm team={team} token={token} />
      {links.length > 0 && (
        <div className="page wrap">
          {links.map((item) => <CopyLink key={item.href} label={item.name} href={item.href} />)}
        </div>
      )}
    </>
  );
}
