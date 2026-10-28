import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { isAdminRequest } from "@/lib/admin-auth";
import { formatUserDate } from "@/lib/dates";
import { formatCad } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Campaigns", robots: { index: false, follow: false } };

export default async function AdminHome() {
  if (!(await isAdminRequest())) redirect("/admin/login");
  const { data, error } = await supabaseAdmin()
    .from("campaigns")
    .select("campaign_id, campaign_name, team_slug, sport, status, start_date, end_date, goal_cad, team_raised_cents")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (
    <main className="page wrap">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }} className="no-print">
        <h1>Campaigns</h1>
        <form action="/api/admin/logout" method="post"><button className="btn btn-ghost" type="submit">Sign out</button></form>
      </div>
      <AdminNav />
      <div className="table-wrap panel">
        <table>
          <thead>
            <tr><th>Team</th><th>Status</th><th>Dates</th><th>Team share</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((campaign) => (
              <tr key={campaign.campaign_id}>
                <td>
                  <Link href={`/admin/campaigns/${campaign.campaign_id}`}>{campaign.campaign_name}</Link>
                  <div className="muted">{campaign.sport}{campaign.team_slug ? ` · /t/${campaign.team_slug}` : ""}</div>
                </td>
                <td>{campaign.status}</td>
                <td>{formatUserDate(campaign.start_date) || "—"} → {formatUserDate(campaign.end_date) || "—"}</td>
                <td>{formatCad(campaign.team_raised_cents)} / {formatCad(campaign.goal_cad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!(data ?? []).length && <p>No campaigns yet. Create one in Supabase, with a team slug and players, before the shop can sell.</p>}
      </div>
    </main>
  );
}
