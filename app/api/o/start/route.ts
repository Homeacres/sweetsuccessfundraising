import { redirect } from "next/navigation";
import { dollarsToCents } from "@/lib/money";
import { organizerActionSecret, signOrganizerAction, verifyOrganizerAction } from "@/lib/organizer-token";
import { sendRequestReceived } from "@/lib/flow-mail";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const secret = organizerActionSecret();
  const parsed = secret ? verifyOrganizerAction(token, "start", secret) : null;
  if (!parsed) redirect("/o/start/invalid");
  const windowId = String(form.get("windowId") || "");
  const participants = Number(form.get("participants"));
  const goal = Number(form.get("goal"));
  if (!windowId || !Number.isInteger(participants) || participants < 1 || participants > 200 || !Number.isFinite(goal) || goal < 100) {
    redirect(`/o/start/${token}`);
  }
  const db = supabaseAdmin();
  const { data: window } = await db.from("launch_windows").select("window_id").eq("window_id", windowId).eq("is_open", true).maybeSingle();
  if (!window) redirect(`/o/start/${token}`);
  const now = new Date().toISOString();
  await db.from("organizers").update({
    request_submitted_at: now,
    started_at: now,
    requested_window_id: windowId,
    confirmed_participant_count: participants,
    confirmed_goal_cents: dollarsToCents(goal),
    review_status: "pending",
  }).eq("organizer_id", parsed.organizerId).is("request_submitted_at", null);
  await sendRequestReceived(parsed.organizerId);
  const next = secret ? signOrganizerAction(parsed.organizerId, "start", secret) : token;
  redirect(`/o/start/${next}`);
}
