import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/admin-auth";
import { parseCampaignDates } from "@/lib/applications";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return new Response("Unauthorized", { status: 401 });
  const form = await request.formData();
  const label = String(form.get("label") || "").trim().slice(0, 80);
  const dates = parseCampaignDates(String(form.get("start_date") || ""), String(form.get("end_date") || ""));
  if (!label || !dates.ok) redirect("/admin/reviews?error=window");
  const { error } = await supabaseAdmin().from("launch_windows").insert({
    label,
    start_date: dates.start,
    end_date: dates.end,
    is_open: true,
  });
  if (error) redirect("/admin/reviews?error=window");
  redirect("/admin/reviews");
}
