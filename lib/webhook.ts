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

export type RemittanceUpdate = {
  remittanceId: string;
  campaignId: string;
};

export interface WebhookDeps {
  markPaid(sessionId: string, paymentIntentId: string | null): Promise<PaidOrder | null>;
  markRefunded(paymentIntentId: string): Promise<RefundedOrder | null>;
  sendReceipt(order: PaidOrder): Promise<void>;
  recalc(campaignId: string): Promise<void>;
  markRemittancePaid?(sessionId: string, paymentIntentId: string | null): Promise<RemittanceUpdate | null>;
  failRemittance?(sessionId: string): Promise<RemittanceUpdate | null>;
  markRemittanceRefunded?(paymentIntentId: string): Promise<RefundedOrder | null>;
  sessionIdForFailedPayment?(paymentIntentId: string): Promise<string | null>;
}

export type WebhookResult =
  | { action: "paid"; orderId: string }
  | { action: "refunded"; orderId: string }
  | { action: "remittance_paid"; remittanceId: string }
  | { action: "remittance_failed"; remittanceId: string }
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
  if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    return expireRemittance(event.data.object, deps);
  }
  if (event.type === "payment_intent.payment_failed") {
    return failRemittancePayment(event.data.object, deps);
  }
  if (event.type === "charge.refunded") {
    return refundCharge(event.data.object, deps);
  }
  return { action: "ignored" };
}

function metadataOf(record: Record<string, unknown> | null): Record<string, unknown> | null {
  return asRecord(record?.metadata);
}

async function completeCheckout(object: unknown, deps: WebhookDeps): Promise<WebhookResult> {
  const session = asRecord(object);
  if (!session) return { action: "ignored" };
  const sessionId = stripeId(session.id);
  if (!sessionId) return { action: "ignored" };

  if (metadataOf(session)?.kind === "parent_remittance") {
    return completeRemittance(sessionId, stripeId(session.payment_intent), session.payment_status, deps);
  }

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
  if (order) {
    await deps.recalc(order.campaignId);
    return { action: "refunded", orderId: order.orderId };
  }

  if (deps.markRemittanceRefunded) {
    const remitted = await deps.markRemittanceRefunded(paymentIntentId);
    if (remitted) {
      await deps.recalc(remitted.campaignId);
      return { action: "refunded", orderId: remitted.orderId };
    }
  }
  return { action: "noop" };
}

async function completeRemittance(
  sessionId: string,
  paymentIntentId: string | null,
  paymentStatus: unknown,
  deps: WebhookDeps,
): Promise<WebhookResult> {
  if (paymentStatus && paymentStatus !== "paid") return { action: "ignored" };
  if (!deps.markRemittancePaid) return { action: "ignored" };
  const row = await deps.markRemittancePaid(sessionId, paymentIntentId);
  if (!row) return { action: "noop" };
  await deps.recalc(row.campaignId);
  return { action: "remittance_paid", remittanceId: row.remittanceId };
}

async function expireRemittance(object: unknown, deps: WebhookDeps): Promise<WebhookResult> {
  const session = asRecord(object);
  const sessionId = stripeId(session?.id);
  if (!sessionId || !deps.failRemittance) return { action: "ignored" };
  const row = await deps.failRemittance(sessionId);
  if (!row) return { action: "noop" };
  return { action: "remittance_failed", remittanceId: row.remittanceId };
}

async function failRemittancePayment(object: unknown, deps: WebhookDeps): Promise<WebhookResult> {
  const intent = asRecord(object);
  if (!intent || !deps.failRemittance) return { action: "ignored" };
  const metadata = metadataOf(intent);
  if (metadata?.kind && metadata.kind !== "parent_remittance") return { action: "ignored" };
  if (metadata?.kind !== "parent_remittance" && !metadata?.checkout_session_id) return { action: "ignored" };
  let sessionId = typeof metadata?.checkout_session_id === "string" ? metadata.checkout_session_id : null;
  if (!sessionId && deps.sessionIdForFailedPayment) {
    const paymentIntentId = stripeId(intent.id);
    if (paymentIntentId) sessionId = await deps.sessionIdForFailedPayment(paymentIntentId);
  }
  if (!sessionId) return { action: "ignored" };
  const row = await deps.failRemittance(sessionId);
  if (!row) return { action: "noop" };
  return { action: "remittance_failed", remittanceId: row.remittanceId };
}
