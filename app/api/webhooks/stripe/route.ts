import { markOrderPaid, markOrderRefunded, recalcLeaderboard, sendOrderReceipt } from "@/lib/fulfill";
import { getStripe } from "@/lib/stripe";
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
    });
    return Response.json({ ok: true, action: result.action });
  } catch (error) {
    console.error("stripe webhook failed", error instanceof Error ? error.message : "error");
    return Response.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
