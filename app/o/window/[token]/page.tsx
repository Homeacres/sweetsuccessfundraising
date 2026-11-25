import { AcceptWindow, ApprovedWindow, PickWindowForm } from "@/components/FlowScreens";
import { appUrl, supabaseConfigured } from "@/lib/env";
import { organizerActionSecret, signOrganizerAction, verifyOrganizerAction } from "@/lib/organizer-token";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Choose a window", robots: { index: false, follow: false } };

export default async function WindowPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = organizerActionSecret();
  const accept = secret ? verifyOrganizerAction(token, "accept", secret) : null;
  const pick = secret ? verifyOrganizerAction(token, "windows", secret) : null;
  const parsed = accept || pick;
  if (!parsed) return <main className="page wrap"><h1>This link is not valid</h1></main>;
  let team = "your group";
  let offered = "this window";
  let windows: { id: string; label: string }[] = [];
  if (supabaseConfigured()) {
    const db = supabaseAdmin();
    const { data } = await db.from("organizers").select("organization_name, offered_window_id, agreed_window_id, review_status").eq("organizer_id", parsed.organizerId).maybeSingle();
    if (data?.organization_name) team = data.organization_name;
    const windowId = data?.agreed_window_id || data?.offered_window_id;
    if (windowId) {
      const { data: window } = await db.from("launch_windows").select("label").eq("window_id", windowId).maybeSingle();
      if (window?.label) offered = window.label;
    }
    const { data: open } = await db.from("launch_windows").select("window_id, label").eq("is_open", true).order("start_date");
    windows = (open ?? []).map((row) => ({ id: row.window_id, label: row.label }));
    const { data: campaign } = await db.from("campaigns").select("campaign_id").eq("organizer_id", parsed.organizerId).limit(1);
    if (data?.review_status === "approved" || (campaign ?? []).length > 0) {
      const dashboardHref = secret ? `${appUrl()}/o/dashboard/${signOrganizerAction(parsed.organizerId, "dashboard", secret)}` : "/";
      return <ApprovedWindow team={team} windowLabel={offered} dashboardHref={dashboardHref} />;
    }
  }
  if (accept) return <AcceptWindow team={team} windowLabel={offered} token={token} />;
  return <PickWindowForm team={team} windows={windows} token={token} />;
}
