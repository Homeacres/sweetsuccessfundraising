import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/admin-auth";
import { agreeWindow } from "@/lib/flow-mail";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ organizerId: string }> }) {
  if (!(await isAdminRequest())) return new Response("Unauthorized", { status: 401 });
  const { organizerId } = await context.params;
  const db = supabaseAdmin();
  const { data: org } = await db.from("organizers").select("requested_window_id").eq("organizer_id", organizerId).maybeSingle();
  const windowId = org?.requested_window_id;
  if (!windowId) redirect("/admin/reviews?error=missing-window");
  const { data: window } = await db.from("launch_windows").select("window_id, label, start_date, end_date").eq("window_id", windowId).maybeSingle();
  if (!window) redirect("/admin/reviews?error=missing-window");
  const created = await agreeWindow(organizerId, window);
  if (!created.ok) redirect(`/admin/reviews?error=${encodeURIComponent(created.error)}`);
  redirect(`/admin/campaigns/${created.campaignId}`);
}
