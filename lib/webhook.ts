/**
 * Stripe webhook effects. Signature checks stay in the route.
 * Payment updates are conditional (pending → paid, paid → refunded), so a
 * second delivery does not send another receipt or rebuild the leaderboard.
 */

export type PaidOrder = {
  orderId: string;
  campaignId: string;
  buyerName: string;
  buyerEmail: string;
  totalCents: number;
  totalBags: number;
};

export type RefundedOrder = {
  orderId: string;
  campaignId: string;
};

export interface WebhookDeps {
  markPaid(sessionId: string, paymentIntentId: string | null): Promise<PaidOrder | null>;
  markRefunded(paymentIntentId: string): Promise<RefundedOrder | null>;
  sendReceipt(order: PaidOrder): Promise<void>;
  recalc(campaignId: string): Promise<void>;
}

export type WebhookResult =
  | { action: "paid"; orderId: string }
  | { action: "refunded"; orderId: string }
  | { action: "noop" }
  | { action: "ignored" };

type StripeLikeEvent = {
  type: string;
  data: { object: unknown };
};

export class ReceiptSendError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptSendError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function stripeId(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  const record = asRecord(value);
  if (record && typeof record.id === "string" && record.id.trim()) return record.id;
  return null;
}

export async function handleStripeEvent(event: StripeLikeEvent, deps: WebhookDeps): Promise<WebhookResult> {
  if (event.type === "checkout.session.completed") {
    return completeCheckout(event.data.object, deps);
  }
  if (event.type === "charge.refunded") {
    return refundCharge(event.data.object, deps);
  }
  return { action: "ignored" };
}

async function completeCheckout(object: unknown, deps: WebhookDeps): Promise<WebhookResult> {
  const session = asRecord(object);
  if (!session) return { action: "ignored" };
  const sessionId = stripeId(session.id);
  if (!sessionId) return { action: "ignored" };

  // Card payments are paid on this event. Async methods complete later.
  if (session.payment_status && session.payment_status !== "paid") {
    return { action: "ignored" };
  }

  const order = await deps.markPaid(sessionId, stripeId(session.payment_intent));
  if (!order) return { action: "noop" };

  await deps.recalc(order.campaignId);
  try {
    await deps.sendReceipt(order);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt failed";
    throw new ReceiptSendError(message);
  }
  return { action: "paid", orderId: order.orderId };
}

async function refundCharge(object: unknown, deps: WebhookDeps): Promise<WebhookResult> {
  const charge = asRecord(object);
  if (!charge) return { action: "ignored" };

  // charge.refunded is also sent for partial refunds. The schema only has a
  // whole-order refunded status, so a partial refund is left as paid.
  if (charge.refunded !== true) return { action: "ignored" };

  const paymentIntentId = stripeId(charge.payment_intent);
  if (!paymentIntentId) return { action: "ignored" };

  const order = await deps.markRefunded(paymentIntentId);
  if (!order) return { action: "noop" };

  await deps.recalc(order.campaignId);
  return { action: "refunded", orderId: order.orderId };
}
