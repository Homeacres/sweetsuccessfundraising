import { StartRequestForm } from "@/components/FlowScreens";
import { organizerActionSecret, verifyOrganizerAction } from "@/lib/organizer-token";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/env";

export const metadata = { title: "Start my fundraiser", robots: { index: false, follow: false } };

export default async function StartPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = organizerActionSecret();
  const parsed = secret ? verifyOrganizerAction(token, "start", secret) : null;
  if (!parsed) {
    return <main className="page wrap"><h1>This link is not valid</h1></main>;
  }
  let team = "your group";
  let participants = 1;
  let goal = 100;
  let already = false;
  let windows: { id: string; label: string }[] = [];
  if (supabaseConfigured()) {
    const db = supabaseAdmin();
    const { data } = await db.from("organizers").select("organization_name, participant_count_estimate, fundraising_goal_estimate_cad, request_submitted_at").eq("organizer_id", parsed.organizerId).maybeSingle();
    if (data?.organization_name) team = data.organization_name;
    if (data?.participant_count_estimate) participants = data.participant_count_estimate;
    if (data?.fundraising_goal_estimate_cad) goal = Math.round(data.fundraising_goal_estimate_cad / 100);
    already = Boolean(data?.request_submitted_at);
    const { data: open } = await db.from("launch_windows").select("window_id, label").eq("is_open", true).order("start_date");
    windows = (open ?? []).map((row) => ({ id: row.window_id, label: row.label }));
  }
  return <StartRequestForm team={team} windows={windows} participants={participants} goal={goal} token={token} already={already} />;
}
