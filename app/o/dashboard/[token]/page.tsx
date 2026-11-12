import { TeamDashboardView } from "@/components/FlowScreens";
import { todayInEdmonton, formatUserDate } from "@/lib/dates";
import { appUrl, supabaseConfigured } from "@/lib/env";
import { shopPhase } from "@/lib/launch";
import { formatQuoteGoal } from "@/lib/email/prospect";
import { organizerActionSecret, verifyOrganizerAction } from "@/lib/organizer-token";
import { supporterShopPath } from "@/lib/roster";
import { loadStarLines } from "@/lib/flow-run";
import { goalPercent, type Seller } from "@/lib/standings";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Team dashboard", robots: { index: false, follow: false } };

export default async function DashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = organizerActionSecret();
  const parsed = secret ? verifyOrganizerAction(token, "dashboard", secret) : null;
  if (!parsed || !supabaseConfigured()) return <main className="page wrap"><h1>This link is not valid</h1></main>;
  const db = supabaseAdmin();
  const { data: campaignRows } = await db.from("campaigns").select("campaign_id, campaign_name, team_slug, goal_cad, team_raised_cents, start_date, end_date").eq("organizer_id", parsed.organizerId).order("created_at", { ascending: true }).limit(1);
  const campaign = campaignRows?.[0];
  if (!campaign?.team_slug) return <main className="page wrap"><h1>Not approved yet</h1><p>The fundraiser is still in review.</p></main>;
  const { data: people } = await db.from("campaign_participants").select("cp_id, player_first_name, player_last_name, bags_sold, share_token, leaderboard_opt_in").eq("campaign_id", campaign.campaign_id);
  const sellers: Seller[] = (people ?? []).map((person) => ({
    id: person.cp_id,
    first: person.player_first_name,
    last: person.player_last_name,
    bags: person.bags_sold,
    optedIn: Boolean(person.leaderboard_opt_in),
  }));
  const stars = await loadStarLines(campaign.campaign_id, sellers);
  const phase = shopPhase(campaign.start_date, campaign.end_date, todayInEdmonton());
  const viewPhase = phase === "undated" ? "before" : phase;
  return (
    <TeamDashboardView
      team={campaign.campaign_name}
      phase={viewPhase}
      startLabel={formatUserDate(campaign.start_date) || "Not set"}
      endLabel={formatUserDate(campaign.end_date) || "Not set"}
      goal={formatQuoteGoal((campaign.goal_cad || 0) / 100)}
      goalPct={goalPercent(campaign.team_raised_cents || 0, campaign.goal_cad || 0)}
      periodStars={stars.period}
      overallStars={stars.overall}
      roster={(people ?? []).map((person) => ({
        name: `${person.player_first_name} ${String(person.player_last_name || "").slice(0, 1)}`,
        href: person.share_token ? `${appUrl()}${supporterShopPath(person.share_token)}` : "",
      }))}
    />
  );
}
