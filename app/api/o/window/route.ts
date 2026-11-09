import { redirect } from "next/navigation";
import { agreeWindow, sendParked, sendRequestReceived } from "@/lib/flow-mail";
import { organizerActionSecret, signOrganizerAction, verifyOrganizerAction } from "@/lib/organizer-token";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const choice = String(form.get("choice") || "");
  const secret = organizerActionSecret();
  const db = supabaseAdmin();
  if (choice === "accept") {
    const parsed = secret ? verifyOrganizerAction(token, "accept", secret) : null;
    if (!parsed) redirect("/o/window/invalid");
    const { data: org } = await db.from("organizers").select("offered_window_id, review_status").eq("organizer_id", parsed.organizerId).maybeSingle();
    const windowId = org?.offered_window_id;
    if (!windowId) redirect(`/o/window/${token}`);
    const { data: window } = await db.from("launch_windows").select("window_id, label, start_date, end_date").eq("window_id", windowId).maybeSingle();
    if (!window) redirect(`/o/window/${token}`);
    const created = await agreeWindow(parsed.organizerId, window);
    if (!created.ok) redirect(`/o/window/${token}`);
    redirect(`/o/dashboard/${secret ? signOrganizerAction(parsed.organizerId, "dashboard", secret) : token}`);
  }
  const parsed = secret ? verifyOrganizerAction(token, "windows", secret) : null;
  if (!parsed) redirect("/o/window/invalid");
  if (choice === "waitlist" || choice === "not_this_season") {
    await db.from("organizers").update({
      review_status: choice === "waitlist" ? "waitlist" : "not_this_season",
      parked_at: new Date().toISOString(),
      offered_window_id: null,
    }).eq("organizer_id", parsed.organizerId);
    if (choice === "not_this_season") await sendParked(parsed.organizerId, false);
    redirect(`/o/window/${token}`);
  }
  const windowId = String(form.get("windowId") || "");
  const { data: window } = await db.from("launch_windows").select("window_id").eq("window_id", windowId).eq("is_open", true).maybeSingle();
  if (!window) redirect(`/o/window/${token}`);
  await db.from("organizers").update({
    requested_window_id: windowId,
    offered_window_id: null,
    review_status: "pending",
    parked_at: null,
  }).eq("organizer_id", parsed.organizerId);
  await sendRequestReceived(parsed.organizerId);
  redirect(`/o/start/${secret ? signOrganizerAction(parsed.organizerId, "start", secret) : token}`);
}
