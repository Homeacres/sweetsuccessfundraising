import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { isAdminRequest } from "@/lib/admin-auth";
import { formatUserDate } from "@/lib/dates";
import { formatTeamCad } from "@/lib/money";
import { describeRemittanceDeadline, parseRemittanceDeadline } from "@/lib/remittance-deadline";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Campaigns", robots: { index: false, follow: false } };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  if (!(await isAdminRequest())) redirect("/admin/login");
  const query = await searchParams;
  const db = supabaseAdmin();
  const { data: deadlineRow } = await db.from("platform_config").select("value").eq("key", "remittance_deadline").maybeSingle();
  const deadline = parseRemittanceDeadline(deadlineRow?.value);
  const { data, error } = await db
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
      {query.saved === "deadline" ? <p className="alert">Remittance deadline saved.</p> : null}
      {query.error === "deadline" ? <p className="alert error">That deadline didn't save. Check the date or the number of days.</p> : null}
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Remittance deadline</h2>
        <p className="muted">Cash not remitted by this deadline is left out of production and the pick list. Current setting: {describeRemittanceDeadline(deadline)}</p>
        <form action="/api/admin/config/remittance-deadline" method="post">
          <label><input type="radio" name="mode" value="campaign_cutoff" defaultChecked={deadline.mode === "campaign_cutoff"} /> Campaign order cut-off</label>
          <label><input type="radio" name="mode" value="days_after_cutoff" defaultChecked={deadline.mode === "days_after_cutoff"} /> Days after the order cut-off</label>
          <input name="days" type="number" min={0} max={365} defaultValue={deadline.days || 0} aria-label="Days after the order cut-off" />
          <label><input type="radio" name="mode" value="fixed_date" defaultChecked={deadline.mode === "fixed_date"} /> One date for every campaign</label>
          <input name="date" type="date" defaultValue={deadline.date || ""} aria-label="Fixed remittance date" />
          <button className="btn btn-navy" type="submit" style={{ marginTop: 12 }}>Save deadline</button>
        </form>
      </section>
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
                <td>{formatTeamCad(campaign.team_raised_cents)} / {formatTeamCad(campaign.goal_cad)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!(data ?? []).length && <p>No campaigns yet. Create one in Supabase, with a team slug and participants, before the shop can sell.</p>}
      </div>
    </main>
  );
}
