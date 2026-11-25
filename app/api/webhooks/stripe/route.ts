import { failRemittance, markOrderPaid, markOrderRefunded, markRemittancePaid, markRemittanceRefunded, recalcLeaderboard, sendOrderReceipt } from "@/lib/fulfill";
import { getStripe } from "@/lib/stripe";

async function sessionIdForFailedPayment(paymentIntentId: string): Promise<string | null> {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.metadata?.checkout_session_id) return intent.metadata.checkout_session_id;
  if (intent.metadata?.kind !== "parent_remittance") return null;
  const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
  return sessions.data[0]?.id ?? null;
}
import { requiredEnv } from "@/lib/env";
import { handleStripeEvent } from "@/lib/webhook";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });

  const stripe = getStripe();
  const payload = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, requiredEnv("STRIPE_WEBHOOK_SECRET"));
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event, {
      markPaid: markOrderPaid,
      markRefunded: markOrderRefunded,
      sendReceipt: sendOrderReceipt,
      recalc: recalcLeaderboard,
      markRemittancePaid,
      failRemittance,
      markRemittanceRefunded,
      sessionIdForFailedPayment,
    });
    return Response.json({ ok: true, action: result.action });
  } catch (error) {
    console.error("stripe webhook failed", error instanceof Error ? error.message : "error");
    return Response.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
