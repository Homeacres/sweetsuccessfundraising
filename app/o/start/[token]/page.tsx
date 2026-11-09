import { StartRequestForm, type ConfirmDetails } from "@/components/FlowScreens";
import { organizerActionSecret, verifyOrganizerAction } from "@/lib/organizer-token";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/env";

export const metadata = { title: "Confirm your fundraiser", robots: { index: false, follow: false } };

function postalFromNotes(notes: string | null | undefined): string {
  const prefix = "Postal code: ";
  if (!notes?.startsWith(prefix)) return "";
  return notes.slice(prefix.length).split("\n")[0].trim();
}

export default async function StartPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = organizerActionSecret();
  const parsed = secret ? verifyOrganizerAction(token, "start", secret) : null;
  if (!parsed) {
    return <main className="page wrap"><h1>This link is not valid</h1></main>;
  }
  const details: ConfirmDetails = {
    team: "your group",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    sport: "",
    city: "",
    postal: "",
    province: "",
    howHeard: "",
    participants: 1,
    goal: 100,
  };
  let already = false;
  let windows: { id: string; label: string }[] = [];
  if (supabaseConfigured()) {
    const db = supabaseAdmin();
    const { data } = await db
      .from("organizers")
      .select("organization_name, first_name, last_name, email, phone, sport, city, province, notes, how_heard, participant_count_estimate, fundraising_goal_estimate_cad, request_submitted_at")
      .eq("organizer_id", parsed.organizerId)
      .maybeSingle();
    if (data?.organization_name) details.team = data.organization_name;
    if (data?.first_name) details.firstName = data.first_name;
    if (data?.last_name) details.lastName = data.last_name;
    if (data?.email) details.email = data.email;
    if (data?.phone) details.phone = data.phone;
    if (data?.sport) details.sport = data.sport;
    if (data?.city) details.city = data.city;
    if (data?.province) details.province = data.province;
    details.postal = postalFromNotes(data?.notes);
    if (data?.how_heard) details.howHeard = data.how_heard;
    if (data?.participant_count_estimate) details.participants = data.participant_count_estimate;
    if (data?.fundraising_goal_estimate_cad) details.goal = Math.round(data.fundraising_goal_estimate_cad / 100);
    already = Boolean(data?.request_submitted_at);
    const { data: open } = await db.from("launch_windows").select("window_id, label").eq("is_open", true).order("start_date");
    windows = (open ?? []).map((row) => ({ id: row.window_id, label: row.label }));
  }
  return <StartRequestForm details={details} windows={windows} token={token} already={already} />;
}
