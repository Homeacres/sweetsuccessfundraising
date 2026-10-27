import { describe, expect, it } from "vitest";
import { handleStripeEvent, type PaidOrder, type WebhookDeps } from "@/lib/webhook";

type Order = {
  id: string;
  sessionId: string;
  paymentIntentId: string | null;
  status: "pending" | "paid" | "refunded";
  campaignId: string;
};

function harness() {
  const orders: Order[] = [
    { id: "order-1", sessionId: "cs_test_1", paymentIntentId: null, status: "pending", campaignId: "camp-1" },
  ];
  const emails: string[] = [];
  const recalcs: string[] = [];

  const deps: WebhookDeps = {
    async markPaid(sessionId, paymentIntentId) {
      const order = orders.find((row) => row.sessionId === sessionId && row.status === "pending");
      if (!order) return null;
      order.status = "paid";
      order.paymentIntentId = paymentIntentId;
      const paid: PaidOrder = {
        orderId: order.id,
        campaignId: order.campaignId,
        buyerName: "Pat Buyer",
        buyerEmail: "pat@example.com",
        totalCents: 3600,
        totalBags: 3,
      };
      return paid;
    },
    async markRefunded(paymentIntentId) {
      const order = orders.find((row) => row.paymentIntentId === paymentIntentId && row.status === "paid");
      if (!order) return null;
      order.status = "refunded";
      return { orderId: order.id, campaignId: order.campaignId };
    },
    async sendReceipt(order) {
      emails.push(order.orderId);
    },
    async recalc(campaignId) {
      recalcs.push(campaignId);
    },
  };

  return { orders, emails, recalcs, deps };
}

const paidEvent = {
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_1", payment_status: "paid", payment_intent: "pi_test_1" } },
};

describe("stripe webhook idempotency", () => {
  it("marks a pending order paid once, then ignores a second delivery", async () => {
    const { orders, emails, recalcs, deps } = harness();
    const first = await handleStripeEvent(paidEvent, deps);
    const second = await handleStripeEvent(paidEvent, deps);

    expect(first).toEqual({ action: "paid", orderId: "order-1" });
    expect(second).toEqual({ action: "noop" });
    expect(orders[0].status).toBe("paid");
    expect(orders[0].paymentIntentId).toBe("pi_test_1");
    expect(emails).toEqual(["order-1"]);
    expect(recalcs).toEqual(["camp-1"]);
  });

  it("does not send a receipt when the pending update matches nothing", async () => {
    const { emails, recalcs, deps } = harness();
    const result = await handleStripeEvent(
      { type: "checkout.session.completed", data: { object: { id: "cs_missing", payment_status: "paid", payment_intent: "pi_x" } } },
      deps,
    );
    expect(result).toEqual({ action: "noop" });
    expect(emails).toEqual([]);
    expect(recalcs).toEqual([]);
  });

  it("does not resend when the receipt fails after the order is already paid", async () => {
    const { orders, recalcs, deps } = harness();
    let attempts = 0;
    deps.sendReceipt = async () => {
      attempts += 1;
      throw new Error("resend down");
    };
    await expect(handleStripeEvent(paidEvent, deps)).rejects.toThrow(/resend down/);
    const retry = await handleStripeEvent(paidEvent, deps);
    expect(retry).toEqual({ action: "noop" });
    expect(orders[0].status).toBe("paid");
    expect(attempts).toBe(1);
    expect(recalcs).toEqual(["camp-1"]);
  });

  it("refunds a fully refunded charge once and ignores a partial refund", async () => {
    const { orders, emails, recalcs, deps } = harness();
    await handleStripeEvent(paidEvent, deps);

    const partial = await handleStripeEvent(
      { type: "charge.refunded", data: { object: { refunded: false, payment_intent: "pi_test_1", amount: 3600, amount_refunded: 1200 } } },
      deps,
    );
    expect(partial).toEqual({ action: "ignored" });
    expect(orders[0].status).toBe("paid");

    const full = await handleStripeEvent(
      { type: "charge.refunded", data: { object: { refunded: true, payment_intent: { id: "pi_test_1" } } } },
      deps,
    );
    const again = await handleStripeEvent(
      { type: "charge.refunded", data: { object: { refunded: true, payment_intent: "pi_test_1" } } },
      deps,
    );
    expect(full).toEqual({ action: "refunded", orderId: "order-1" });
    expect(again).toEqual({ action: "noop" });
    expect(orders[0].status).toBe("refunded");
    expect(emails).toEqual(["order-1"]);
    expect(recalcs).toEqual(["camp-1", "camp-1"]);
  });

  it("ignores unpaid sessions and unrelated events", async () => {
    const { emails, deps } = harness();
    const unpaid = await handleStripeEvent(
      { type: "checkout.session.completed", data: { object: { id: "cs_test_1", payment_status: "unpaid" } } },
      deps,
    );
    const other = await handleStripeEvent({ type: "payment_intent.created", data: { object: {} } }, deps);
    expect(unpaid).toEqual({ action: "ignored" });
    expect(other).toEqual({ action: "ignored" });
    expect(emails).toEqual([]);
  });
});
