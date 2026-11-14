import { deliverCashReceipt } from "@/lib/cash-receipt-mail";
import { cashReceivedAmountError, isUnguessableToken } from "@/lib/ledger-rules";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  const orderId = String(form.get("order_id") || "");
  const amount = Number(form.get("amount_cents"));
  const collectedBy = String(form.get("collected_by") || "");
  const back = `/p/ledger/${encodeURIComponent(token)}`;
  if (!isUnguessableToken(token)) return Response.redirect(new URL("/p/ledger/invalid", request.url), 303);

  const db = supabaseAdmin();
  const { data: order, error: readError } = await db
    .from("orders")
    .select("total_cad")
    .eq("order_id", orderId)
    .maybeSingle();
  if (readError || !order) return Response.redirect(new URL(`${back}?error=received`, request.url), 303);
  if (cashReceivedAmountError(amount, order.total_cad)) {
    return Response.redirect(new URL(`${back}?error=amount`, request.url), 303);
  }

  const { data, error } = await db.rpc("fn_mark_cash_received", {
    p_token: token,
    p_order_id: orderId,
    p_amount_cents: amount,
    p_collected_by: collectedBy,
  });
  if (error || !data) return Response.redirect(new URL(`${back}?error=received`, request.url), 303);
  const row = data as {
    already_received?: boolean;
    cash_receipt_token?: string;
    buyer_email?: string | null;
    has_phone_only?: boolean;
    order_id?: string;
  };
  if (row.cash_receipt_token && row.order_id) {
    await deliverCashReceipt({
      orderId: row.order_id,
      receiptToken: row.cash_receipt_token,
      alreadyReceived: Boolean(row.already_received),
      buyerEmail: row.buyer_email ?? null,
      phoneOnly: Boolean(row.has_phone_only),
    }).catch((err) => {
      console.error("cash receipt failed", err instanceof Error ? err.message : "error");
    });
  }
  return Response.redirect(new URL(`${back}?received=1`, request.url), 303);
}
