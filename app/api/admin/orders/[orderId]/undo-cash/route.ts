import { isAdminRequest } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  if (!(await isAdminRequest())) return Response.redirect(new URL("/admin/login", request.url), 303);
  const { orderId } = await context.params;
  const form = await request.formData();
  const campaignId = String(form.get("campaign_id") || "");
  const { error } = await supabaseAdmin().rpc("fn_admin_undo_cash_received", { p_order_id: orderId });
  const back = `/admin/campaigns/${campaignId}`;
  if (error) return Response.redirect(new URL(`${back}?error=1`, request.url), 303);
  return Response.redirect(new URL(`${back}?undone=1`, request.url), 303);
}
