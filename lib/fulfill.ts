import { receiptEmail, type ReceiptLine } from "@/lib/email/copy";
import { receiptCandyName } from "@/lib/public-names";
import { sendEmail } from "@/lib/email/send";
import { playerDisplayName } from "@/lib/names";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { PaidOrder, RefundedOrder } from "@/lib/webhook";

/**
 * update orders set payment_status='paid'
 * where stripe_checkout_session_id=$1 and payment_status='pending'
 * Returns the row only when this call won the update.
 */
export async function markOrderPaid(sessionId: string, paymentIntentId: string | null): Promise<PaidOrder | null> {
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .update({
      payment_status: "paid",
      stripe_payment_id: paymentIntentId,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_checkout_session_id", sessionId)
    .eq("payment_status", "pending")
    .select("order_id, campaign_id, buyer_name, buyer_email, total_cad, total_bags");
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    orderId: row.order_id,
    campaignId: row.campaign_id,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    totalCents: row.total_cad,
    totalBags: row.total_bags,
  };
}

/** Whole-order refund. A second delivery matches zero rows. */
export async function markOrderRefunded(paymentIntentId: string): Promise<RefundedOrder | null> {
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .update({
      payment_status: "refunded",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_payment_id", paymentIntentId)
    .eq("payment_status", "paid")
    .select("order_id, campaign_id");
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return { orderId: row.order_id, campaignId: row.campaign_id };
}

export async function recalcLeaderboard(campaignId: string): Promise<void> {
  const { error } = await supabaseAdmin().rpc("fn_recalc_leaderboard", { p_campaign: campaignId });
  if (error) throw error;
}

export async function sendOrderReceipt(order: PaidOrder): Promise<void> {
  const db = supabaseAdmin();
  const { data: row, error } = await db
    .from("orders")
    .select("line_items, campaign_id, campaigns(campaign_name)")
    .eq("order_id", order.orderId)
    .maybeSingle();
  if (error) throw error;

  const campaignName = campaignNameOf(row?.campaigns) || "your team";
  const cpIds = new Set<string>();
  const items = Array.isArray(row?.line_items) ? row.line_items : [];
  for (const item of items) {
    if (item && typeof item === "object" && typeof (item as { cp_id?: string }).cp_id === "string") {
      cpIds.add((item as { cp_id: string }).cp_id);
    }
  }

  const names = new Map<string, string>();
  if (cpIds.size) {
    const { data: players, error: playerError } = await db
      .from("campaign_participants")
      .select("cp_id, player_first_name, player_last_name, hide_last_name")
      .in("cp_id", [...cpIds]);
    if (playerError) throw playerError;
    for (const player of players ?? []) {
      names.set(
        player.cp_id,
        playerDisplayName(player.player_first_name, player.player_last_name, player.hide_last_name),
      );
    }
  }

  const lines: ReceiptLine[] = items.map((item) => {
    const line = item as {
      cp_id?: string;
      display_name?: string | null;
      qty?: number;
      gross_cents?: number;
      from_mix_pack?: boolean;
    };
    return {
      player: (line.cp_id && names.get(line.cp_id)) || "Player",
      candy: receiptCandyName(line.display_name),
      qty: line.qty ?? 0,
      grossCents: line.gross_cents ?? 0,
      mix: Boolean(line.from_mix_pack),
    };
  });

  const message = receiptEmail({
    buyerName: order.buyerName,
    team: campaignName,
    totalCents: order.totalCents,
    bags: order.totalBags,
    lines,
  });
  const resendId = await sendEmail({ to: order.buyerEmail, ...message });
  await db
    .from("email_log")
    .insert({
      email_type: "buyer_receipt",
      recipient: order.buyerEmail.toLowerCase(),
      campaign_id: order.campaignId,
      resend_id: resendId,
      status: "sent",
    })
    .then(({ error: logError }) => {
      if (logError) console.error("receipt log failed", logError.message);
    });
}

function campaignNameOf(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return campaignNameOf(value[0]);
  if (typeof value === "object" && value && "campaign_name" in value) {
    const name = (value as { campaign_name?: unknown }).campaign_name;
    return typeof name === "string" ? name : null;
  }
  return null;
}
