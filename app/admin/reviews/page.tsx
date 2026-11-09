import { redirect } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";
import { ReviewQueue } from "@/components/FlowScreens";
import { isAdminRequest } from "@/lib/admin-auth";
import { formatQuoteGoal } from "@/lib/email/prospect";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Review queue", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  if (!(await isAdminRequest())) redirect("/admin/login");
  const db = supabaseAdmin();
  const { data: pending } = await db
    .from("organizers")
    .select("organizer_id, first_name, last_name, organization_name, confirmed_participant_count, confirmed_goal_cents, requested_window_id")
    .eq("review_status", "pending")
    .order("request_submitted_at", { ascending: true });
  const { data: windows } = await db.from("launch_windows").select("window_id, label").eq("is_open", true).order("start_date");
  const labels = new Map((windows ?? []).map((row) => [row.window_id, row.label]));
  return (
    <>
      <AdminNav />
      <form method="post" action="/api/admin/windows" className="panel page wrap" style={{ maxWidth: 560 }}>
        <h2>Open a window</h2>
        <label htmlFor="label">Label</label>
        <input id="label" name="label" required placeholder="Nov 15 to Dec 6" />
        <label htmlFor="start_date">Start</label>
        <input id="start_date" name="start_date" type="date" required />
        <label htmlFor="end_date">End</label>
        <input id="end_date" name="end_date" type="date" required />
        <button className="btn btn-navy" type="submit">Add window</button>
      </form>
      <ReviewQueue
        windows={(windows ?? []).map((row) => ({ id: row.window_id, label: row.label }))}
        rows={(pending ?? []).map((row) => ({
          id: row.organizer_id,
          name: `${row.first_name} ${row.last_name}`.trim(),
          team: row.organization_name || "—",
          windowLabel: labels.get(row.requested_window_id) || "—",
          participants: row.confirmed_participant_count || 0,
          goal: formatQuoteGoal((row.confirmed_goal_cents || 0) / 100),
        }))}
      />
    </>
  );
}
