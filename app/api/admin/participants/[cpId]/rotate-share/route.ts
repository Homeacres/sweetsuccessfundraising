import { isAdminRequest } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ cpId: string }> }) {
  if (!(await isAdminRequest())) return Response.redirect(new URL("/admin/login", request.url), 303);
  const { cpId } = await context.params;
  const form = await request.formData();
  const campaignId = String(form.get("campaign_id") || "");
  const { error } = await supabaseAdmin().rpc("fn_admin_rotate_share_token", { p_cp_id: cpId });
  const back = `/admin/campaigns/${campaignId}`;
  if (error) return Response.redirect(new URL(`${back}?error=1`, request.url), 303);
  return Response.redirect(new URL(`${back}?rotated=1`, request.url), 303);
}
