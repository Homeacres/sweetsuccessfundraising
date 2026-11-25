import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/admin-auth";
import { prospectActionUrls } from "@/lib/email/prospect";
import { appUrl } from "@/lib/env";
import { isTestOrganizerName, maskPreviewEmail, previewKeepEmail } from "@/lib/preview-links";
import { supporterShopPath } from "@/lib/roster";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preview links", robots: { index: false, follow: false } };

export default async function PreviewLinksPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  if (!(await isAdminRequest())) redirect("/admin/login");

  const secretSet = Boolean(process.env.ORGANIZER_ACTION_SECRET);
  const db = supabaseAdmin();
  const { data: organizers, error } = await db
    .from("organizers")
    .select("organizer_id, organization_name, offered_window_id")
    .ilike("organization_name", "TEST %")
    .order("organization_name");
  if (error) throw error;
  const teams = (organizers ?? []).filter((row) => isTestOrganizerName(row.organization_name || ""));
  const ids = teams.map((row) => row.organizer_id);
  const { data: campaigns } = ids.length
    ? await db.from("campaigns").select("campaign_id, campaign_name, organizer_id").in("organizer_id", ids).order("campaign_name")
    : { data: [] };
  const campaignIds = (campaigns ?? []).map((row) => row.campaign_id);
  const { data: players } = campaignIds.length
    ? await db
        .from("campaign_participants")
        .select("campaign_id, player_first_name, parent_token, share_token")
        .in("campaign_id", campaignIds)
    : { data: [] };
  const { data: receipts } = await db
    .from("orders")
    .select("cash_receipt_token, campaign_id")
    .eq("is_test", true)
    .not("cash_receipt_token", "is", null)
    .limit(20);
  const { data: waitlist } = await db.from("area_waitlist").select("email, keep_token").limit(50);
  const origin = appUrl();

  return (
    <main className="page wrap">
      <h1>Preview links</h1>
      <p className="muted">Read-only TEST links for screenshots. Nothing on this page writes.</p>
      {!secretSet ? <p>Signing secret not set</p> : null}
      {teams.map((team) => {
        const links = secretSet ? prospectActionUrls(team.organizer_id) : null;
        const teamCampaigns = (campaigns ?? []).filter((row) => row.organizer_id === team.organizer_id);
        return (
          <section className="panel" key={team.organizer_id} style={{ marginTop: 16 }}>
            <h2>{team.organization_name}</h2>
            {links ? (
              <ul>
                <li><a href={`${origin}/o/start/${tokenOf(links.startUrl)}`}>Organizer start</a></li>
                <li><a href={`${origin}/o/roster/${tokenOf(links.rosterUrl)}`}>Roster</a></li>
                <li><a href={`${origin}/o/window/${tokenOf(links.windowsUrl)}`}>Sale window</a></li>
                <li>
                  {team.offered_window_id
                    ? <a href={`${origin}/o/window/${tokenOf(links.acceptUrl)}`}>Accept offered window</a>
                    : "no offer on file"}
                </li>
                <li><a href={`${origin}/o/dashboard/${tokenOf(links.dashboardUrl)}`}>Dashboard</a></li>
                <li><a href={`${origin}/p/join/${tokenOf(links.signupUrl)}`}>Parent join</a></li>
                <li><a href={`${origin}/p/join/${tokenOf(links.signupUrl)}?done=1`}>Parent share links</a></li>
              </ul>
            ) : null}
            {teamCampaigns.map((campaign) => (
              <div key={campaign.campaign_id}>
                <h3>{campaign.campaign_name}</h3>
                <p>
                  <Link href={`/admin/campaigns/${campaign.campaign_id}`}>Pick list</Link>
                  {" · "}
                  <a href={`/api/admin/campaigns/${campaign.campaign_id}/pick-list`}>Pick list CSV</a>
                </p>
                <ul>
                  {(players ?? [])
                    .filter((player) => player.campaign_id === campaign.campaign_id)
                    .map((player) => (
                      <li key={player.parent_token}>
                        {player.player_first_name}
                        {" · "}
                        <a href={`${origin}/p/ledger/${player.parent_token}`}>Parent ledger</a>
                        {" · "}
                        <a href={`${origin}/p/ledger/${player.parent_token}/remit/success`}>Remit success</a>
                        {" · "}
                        <a href={`${origin}/l/${player.parent_token}`}>Leaderboard</a>
                        {" · "}
                        <a href={`${origin}${supporterShopPath(player.share_token)}`}>Shop</a>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Cash receipts</h2>
        <ul>
          {(receipts ?? []).filter((row) => row.cash_receipt_token).map((row) => (
            <li key={row.cash_receipt_token}><a href={`${origin}/r/${row.cash_receipt_token}`}>Cash receipt</a></li>
          ))}
        </ul>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Keep me posted</h2>
        <ul>
          {(waitlist ?? []).filter((row) => previewKeepEmail(row.email || "")).map((row) => (
            <li key={row.keep_token}>
              {maskPreviewEmail(row.email)}
              {" · "}
              <a href={`${origin}/waitlist/keep?t=${encodeURIComponent(row.keep_token)}`}>Confirm</a>
              {" · "}
              <a href={`${origin}/waitlist/keep?t=${encodeURIComponent(row.keep_token)}&done=1`}>Thank you</a>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <h2>Invalid links</h2>
        <ul>
          <li><a href={`${origin}/o/start/invalid`}>Start</a></li>
          <li><a href={`${origin}/p/join/invalid`}>Join</a></li>
          <li><a href={`${origin}/p/ledger/invalid`}>Ledger</a></li>
          <li><a href={`${origin}/waitlist/keep?t=invalid`}>Keep</a></li>
          <li><a href={`${origin}/waitlist/unsubscribe/invalid`}>Unsubscribe</a></li>
          <li><Link href="/checkout/cancelled">Checkout cancelled</Link></li>
        </ul>
      </section>
    </main>
  );
}

function tokenOf(url: string): string {
  return url.slice(url.lastIndexOf("/") + 1);
}
