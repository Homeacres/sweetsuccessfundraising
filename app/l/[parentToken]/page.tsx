import { supabaseConfigured } from "@/lib/env";
import { isUnguessableToken } from "@/lib/ledger-rules";
import { playerDisplayName } from "@/lib/names";
import { goalPercent, starSellers, type Seller } from "@/lib/standings";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboard", robots: { index: false, follow: false } };

export default async function LeaderboardPage({ params }: { params: Promise<{ parentToken: string }> }) {
  const { parentToken } = await params;
  if (!supabaseConfigured() || !isUnguessableToken(parentToken)) return <Invalid />;

  const db = supabaseAdmin();
  const { data: parent } = await db.rpc("fn_parent_from_token", { p_token: parentToken });
  const me = parentIdentity(parent);
  if (!me) return <Invalid />;
  const { data: campaignRow } = await db
    .from("campaigns")
    .select("campaign_name, goal_cad, team_raised_cents")
    .eq("campaign_id", me.campaign_id)
    .maybeSingle();
  const campaign = campaignRow;
  if (!campaign) return <Invalid />;
  const { data: people, error } = await db
    .from("campaign_participants")
    .select("cp_id, player_first_name, player_last_name, bags_sold, leaderboard_opt_in")
    .eq("campaign_id", me.campaign_id);
  if (error || !people) return <Invalid />;
  const sellers: Seller[] = people.map((person) => ({
    id: person.cp_id,
    first: person.player_first_name,
    last: person.player_last_name,
    bags: person.bags_sold,
    optedIn: Boolean(person.leaderboard_opt_in),
  }));
  const ranked = sellers.filter((person) => person.optedIn && person.bags > 0).sort((a, b) => b.bags - a.bags);
  const pct = goalPercent(campaign.team_raised_cents, campaign.goal_cad);

  return (
    <main className="page wrap">
      <p className="kicker">Private leaderboard</p>
      <h1>{campaign.campaign_name}</h1>
      <p className="muted">{pct}% of the goal.</p>
      <p>{starSellers(sellers).join(", ") || "No star sellers yet."}</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Rank</th><th>Participant</th><th>Bags</th></tr>
          </thead>
          <tbody>
            {ranked.map((person, index) => (
              <tr key={person.id} className={person.id === me.cp_id ? "you" : undefined}>
                <td>{index + 1}</td>
                <td>{playerDisplayName(person.first, person.last, true)}{person.id === me.cp_id ? " · yours" : ""}</td>
                <td>{person.bags}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Invalid() {
  return (
    <main className="page wrap">
      <h1>Link not valid</h1>
      <p>This link doesn't match a fundraiser.</p>
    </main>
  );
}

function parentIdentity(value: unknown): { cp_id: string; campaign_id: string } | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const record = row as { cp_id?: string; campaign_id?: string };
  if (!record.cp_id || !record.campaign_id) return null;
  return { cp_id: record.cp_id, campaign_id: record.campaign_id };
}

