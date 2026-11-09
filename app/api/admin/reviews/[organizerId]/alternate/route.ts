import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/admin-auth";
import { sendAlternateOffer } from "@/lib/flow-mail";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ organizerId: string }> }) {
  if (!(await isAdminRequest())) return new Response("Unauthorized", { status: 401 });
  const { organizerId } = await context.params;
  const form = await request.formData();
  const windowId = String(form.get("windowId") || "");
  const db = supabaseAdmin();
  const { data: window } = await db.from("launch_windows").select("window_id, label").eq("window_id", windowId).eq("is_open", true).maybeSingle();
  if (!window) redirect("/admin/reviews?error=missing-window");
  const { data: org } = await db.from("organizers").select("requested_window_id").eq("organizer_id", organizerId).maybeSingle();
  const { data: booked } = org?.requested_window_id
    ? await db.from("launch_windows").select("label").eq("window_id", org.requested_window_id).maybeSingle()
    : { data: null };
  await db.from("organizers").update({ offered_window_id: windowId, review_status: "alternate" }).eq("organizer_id", organizerId);
  await sendAlternateOffer(organizerId, booked?.label || "That window", window.label, windowId);
  redirect("/admin/reviews");
}
