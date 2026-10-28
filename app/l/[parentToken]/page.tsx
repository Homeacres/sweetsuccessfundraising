import { formatCad } from "@/lib/money";
import { supabaseConfigured } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Leaderboard", robots: { index: false, follow: false } };

export default async function LeaderboardPage({ params }: { params: Promise<{ parentToken: string }> }) {
  const { parentToken } = await params;
  if (!supabaseConfigured() || parentToken.length < 32) return <Invalid />;

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("fn_parent_leaderboard", { p_token: parentToken });
  if (error || !data?.length) return <Invalid />;

  const { data: me } = await db
    .from("campaign_participants")
    .select("campaigns(campaign_name, goal_cad, team_raised_cents)")
    .eq("parent_token", parentToken)
    .maybeSingle();
  const campaign = campaignOf(me?.campaigns);

  return (
    <main className="page wrap">
      <p className="kicker">Private leaderboard</p>
      <h1>{campaign?.campaign_name || "Your team"}</h1>
      {campaign && campaign.goal_cad > 0 && (
        <p className="muted">Team has earned {formatCad(campaign.team_raised_cents)} of {formatCad(campaign.goal_cad)}.</p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Rank</th><th>Player</th><th>Bags</th><th>For the team</th></tr>
          </thead>
          <tbody>
            {data.map((row: { campaign_rank: number | null; display_name: string; bags_sold: number; team_revenue_cents: number; is_your_player: boolean }, index: number) => (
              <tr key={`${row.display_name}-${index}`} className={row.is_your_player ? "you" : undefined}>
                <td>{row.campaign_rank ?? "—"}</td>
                <td>{row.display_name}{row.is_your_player ? " · yours" : ""}</td>
                <td>{row.bags_sold}</td>
                <td>{formatCad(row.team_revenue_cents)}</td>
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

function campaignOf(value: unknown): { campaign_name: string; goal_cad: number; team_raised_cents: number } | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const record = row as { campaign_name?: string; goal_cad?: number; team_raised_cents?: number };
  if (!record.campaign_name) return null;
  return {
    campaign_name: record.campaign_name,
    goal_cad: record.goal_cad ?? 0,
    team_raised_cents: record.team_raised_cents ?? 0,
  };
}
