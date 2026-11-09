import { AcceptWindow, PickWindowForm } from "@/components/FlowScreens";
import { supabaseConfigured } from "@/lib/env";
import { organizerActionSecret, verifyOrganizerAction } from "@/lib/organizer-token";
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
    const { data } = await db.from("organizers").select("organization_name, offered_window_id").eq("organizer_id", parsed.organizerId).maybeSingle();
    if (data?.organization_name) team = data.organization_name;
    if (data?.offered_window_id) {
      const { data: window } = await db.from("launch_windows").select("label").eq("window_id", data.offered_window_id).maybeSingle();
      if (window?.label) offered = window.label;
    }
    const { data: open } = await db.from("launch_windows").select("window_id, label").eq("is_open", true).order("start_date");
    windows = (open ?? []).map((row) => ({ id: row.window_id, label: row.label }));
  }
  if (accept) return <AcceptWindow team={team} windowLabel={offered} token={token} />;
  return <PickWindowForm team={team} windows={windows} token={token} />;
}
