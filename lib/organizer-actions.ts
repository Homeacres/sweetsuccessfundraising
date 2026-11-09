import { organizerActionSecret, verifyOrganizerAction } from "@/lib/organizer-token";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";

export async function recordOrganizerStart(token: string): Promise<void> {
  const secret = organizerActionSecret();
  const parsed = secret ? verifyOrganizerAction(token, "start", secret) : null;
  if (!parsed) redirect("/o/start/invalid");
  const now = new Date().toISOString();
  await supabaseAdmin()
    .from("organizers")
    .update({ started_at: now })
    .eq("organizer_id", parsed.organizerId)
    .is("started_at", null);
  redirect(`/o/start/${token}`);
}

export async function recordOrganizerUnsubscribe(token: string): Promise<"ok" | "invalid"> {
  const secret = organizerActionSecret();
  const parsed = secret ? verifyOrganizerAction(token, "unsubscribe", secret) : null;
  if (!parsed) return "invalid";
  await supabaseAdmin()
    .from("organizers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("organizer_id", parsed.organizerId)
    .is("unsubscribed_at", null);
  return "ok";
}
