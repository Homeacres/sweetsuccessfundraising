import { after } from "next/server";
import { confirmSuccessCopy } from "@/lib/confirm-copy";
import { dollarsToCents } from "@/lib/money";
import { requestTurnaroundText } from "@/lib/launch";
import { organizerActionSecret, verifyOrganizerAction } from "@/lib/organizer-token";
import { sendRequestReceived } from "@/lib/flow-mail";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cleanText, isEmail } from "@/lib/text";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const secret = organizerActionSecret();
  const parsed = secret ? verifyOrganizerAction(token, "start", secret) : null;
  if (!parsed) return Response.json({ ok: false, error: "This link is not valid." }, { status: 400 });
  const windowId = String(form.get("windowId") || "");
  const participants = Number(form.get("participants"));
  const goal = Number(form.get("goal"));
  const team = cleanText(form.get("team"), 200);
  const firstName = cleanText(form.get("firstName"), 100);
  const lastName = cleanText(form.get("lastName"), 100);
  const email = cleanText(form.get("email"), 254).toLowerCase();
  const phone = cleanText(form.get("phone"), 40);
  const sport = cleanText(form.get("sport"), 80);
  const city = cleanText(form.get("city"), 80);
  const postal = cleanText(form.get("postal"), 10);
  const howHeard = cleanText(form.get("howHeard"), 80);
  if (!windowId || !team || !firstName || !lastName || !isEmail(email) || !sport || !Number.isInteger(participants) || participants < 1 || participants > 200 || !Number.isFinite(goal) || goal < 100) {
    return Response.json({ ok: false, error: "Check the form and try again." }, { status: 400 });
  }
  const db = supabaseAdmin();
  const { data: window } = await db.from("launch_windows").select("window_id").eq("window_id", windowId).eq("is_open", true).maybeSingle();
  if (!window) return Response.json({ ok: false, error: "That start window is no longer open." }, { status: 400 });
  const now = new Date().toISOString();
  const { data: saved, error } = await db.from("organizers").update({
    organization_name: team,
    first_name: firstName,
    last_name: lastName,
    email,
    phone: phone || null,
    sport,
    city: city || null,
    how_heard: howHeard || null,
    ...(postal ? { notes: `Postal code: ${postal}` } : {}),
    participant_count_estimate: participants,
    fundraising_goal_estimate_cad: dollarsToCents(goal),
    request_submitted_at: now,
    started_at: now,
    requested_window_id: windowId,
    confirmed_participant_count: participants,
    confirmed_goal_cents: dollarsToCents(goal),
    review_status: "pending",
  }).eq("organizer_id", parsed.organizerId).is("request_submitted_at", null).select("organizer_id");
  if (error) return Response.json({ ok: false, error: "We couldn't save that. Please try again." }, { status: 500 });
  if (saved?.length) after(() => sendRequestReceived(parsed.organizerId));
  const copy = confirmSuccessCopy(team, requestTurnaroundText());
  return Response.json({ ok: true, heading: copy.heading, body: copy.body });
}
