import { redirect } from "next/navigation";
import { AdminApplicationsTable, type ApplicationRow } from "@/components/AdminApplications";
import { AdminNav } from "@/components/AdminNav";
import { isAdminRequest } from "@/lib/admin-auth";
import { onlyApplied } from "@/lib/applications";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Applications", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await isAdminRequest())) redirect("/admin/login");
  const params = await searchParams;
  const { data, error } = await supabaseAdmin()
    .from("organizers")
    .select("organizer_id, first_name, last_name, email, organization_name, sport, city, participant_count_estimate, fundraising_goal_estimate_cad, status, created_at")
    .eq("status", "applied")
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows: ApplicationRow[] = onlyApplied(data ?? []).map((row) => ({
    organizerId: row.organizer_id,
    name: `${row.first_name} ${row.last_name}`.trim(),
    team: row.organization_name || "—",
    sport: row.sport || "—",
    goalCents: row.fundraising_goal_estimate_cad,
    participants: row.participant_count_estimate,
    appliedAt: row.created_at,
    email: row.email,
    city: row.city || "—",
  }));
  const message = (params.error || "").slice(0, 200);

  return (
    <main className="page wrap">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }} className="no-print">
        <h1>Applications</h1>
        <form action="/api/admin/logout" method="post"><button className="btn btn-ghost" type="submit">Sign out</button></form>
      </div>
      <AdminNav />
      {message ? <p className="alert error" role="alert">{message}</p> : null}
      <AdminApplicationsTable rows={rows} />
    </main>
  );
}
