import { cashReceiptCopy, cashReceiptEmailsEnabled, cashReceiptSendPlan, type CashReceiptLine } from "@/lib/cash-receipt";
import { sendEmail, sentLogStatus } from "@/lib/email/send";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function deliverCashReceipt(input: {
  orderId: string;
  receiptToken: string;
  alreadyReceived: boolean;
  buyerEmail: string | null;
  phoneOnly: boolean;
}): Promise<"sent" | "redirected" | "held" | "page_only" | "skipped"> {
  const db = supabaseAdmin();
  const { data: config } = await db.from("platform_config").select("value").eq("key", "cash_receipt_emails_enabled").maybeSingle();
  const plan = cashReceiptSendPlan({
    emailsEnabled: cashReceiptEmailsEnabled(config?.value),
    alreadyReceived: input.alreadyReceived,
    buyerEmail: input.buyerEmail,
    phoneOnly: input.phoneOnly,
  });
  if (plan === "skipped") return plan;

  const { data: order, error } = await db
    .from("orders")
    .select("buyer_name, total_cad, total_bags, cash_received_at, cash_received_by, line_items, campaign_id, campaigns(campaign_name)")
    .eq("order_id", input.orderId)
    .maybeSingle();
  if (error) throw error;
  if (!order) return "skipped";

  const campaignName = campaignNameOf(order.campaigns) || "the team";
  const lines = receiptLines(order.line_items);
  const message = cashReceiptCopy({
    buyerName: order.buyer_name,
    team: campaignName,
    totalCents: order.total_cad,
    bags: order.total_bags,
    receivedBy: order.cash_received_by || "The parent",
    receivedAt: order.cash_received_at,
    lines,
    receiptToken: input.receiptToken,
  });

  let status: "sent" | "redirected" | "held" | "page_only" = plan === "send" ? sentLogStatus() : plan;
  let resendId: string | null = null;
  if (plan === "send" && input.buyerEmail) {
    resendId = await sendEmail({ to: input.buyerEmail, ...message });
    await db.from("orders").update({ cash_receipt_sent_at: new Date().toISOString() }).eq("order_id", input.orderId);
    status = sentLogStatus();
  }

  const recipient = (input.buyerEmail || "").trim().toLowerCase() || "phone-only@receipts.invalid";
  await db.from("email_log").insert({
    email_type: "cash_receipt",
    recipient,
    campaign_id: order.campaign_id,
    resend_id: resendId,
    status,
  });
  return status;
}

function receiptLines(value: unknown): CashReceiptLine[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const line = item as { display_name?: string | null; qty?: number; gross_cents?: number; bundle_label?: string | null };
    const candy = line.display_name || "Freeze-dried candy";
    const label = line.bundle_label ? `${line.bundle_label}: ${candy}` : candy;
    return { label, qty: line.qty ?? 0, amountCents: line.gross_cents ?? 0 };
  });
}

function campaignNameOf(value: unknown): string | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object" || !("campaign_name" in row)) return null;
  const name = (row as { campaign_name?: unknown }).campaign_name;
  return typeof name === "string" ? name : null;
}
