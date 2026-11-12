import { isUnguessableToken } from "@/lib/ledger-rules";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const orderId = String(form.get("order_id") || "");
  if (!isUnguessableToken(token)) return Response.redirect(new URL("/p/ledger/invalid", request.url), 303);
  const back = `/p/ledger/${encodeURIComponent(token)}`;
  const { error } = await supabaseAdmin().rpc("fn_cancel_cash_owed", { p_token: token, p_order_id: orderId });
  if (error) return Response.redirect(new URL(`${back}?error=cancel`, request.url), 303);
  return Response.redirect(new URL(`${back}?cancelled=1`, request.url), 303);
}
