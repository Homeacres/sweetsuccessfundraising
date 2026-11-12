import { isAdminRequest } from "@/lib/admin-auth";
import { parseRemittanceDeadline } from "@/lib/remittance-deadline";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DESCRIPTION =
  "When collected cash must reach Sweet Success to be packed. Default mode campaign_cutoff uses that campaign's order cut-off (campaigns.end_date). days_after_cutoff adds value.days to the cut-off. fixed_date uses value.date (YYYY-MM-DD) for every campaign. Cash remitted after this date stays off the pick list and production totals.";

export async function POST(request: Request) {
  if (!(await isAdminRequest())) return Response.redirect(new URL("/admin/login", request.url), 303);
  const form = await request.formData();
  const mode = String(form.get("mode") || "campaign_cutoff");
  const days = Number(form.get("days"));
  const date = String(form.get("date") || "");
  const draft =
    mode === "fixed_date"
      ? { mode: "fixed_date", date }
      : mode === "days_after_cutoff"
        ? { mode: "days_after_cutoff", days }
        : { mode: "campaign_cutoff" };
  const setting = parseRemittanceDeadline(draft);
  if (mode === "fixed_date" && !setting.date) {
    return Response.redirect(new URL("/admin?error=deadline", request.url), 303);
  }
  const value =
    setting.mode === "fixed_date"
      ? { mode: "fixed_date", date: setting.date }
      : setting.mode === "days_after_cutoff"
        ? { mode: "days_after_cutoff", days: setting.days }
        : { mode: "campaign_cutoff" };
  const { error } = await supabaseAdmin().from("platform_config").upsert(
    { key: "remittance_deadline", value, description: DESCRIPTION },
    { onConflict: "key" },
  );
  if (error) return Response.redirect(new URL("/admin?error=deadline", request.url), 303);
  return Response.redirect(new URL("/admin?saved=deadline", request.url), 303);
}
