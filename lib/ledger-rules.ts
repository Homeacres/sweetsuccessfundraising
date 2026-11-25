import type { PaymentMethod } from "@/lib/buyer";

export type LeaderboardCashMode = "when_remitted" | "when_received";

/** platform_config.leaderboard_cash_counting. Chris confirmed when_remitted. */
export function leaderboardCashMode(value: unknown): LeaderboardCashMode {
  if (value === "when_received") return "when_received";
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const mode = (value as { mode?: unknown }).mode;
    if (mode === "when_received") return "when_received";
  }
  return "when_remitted";
}

export type CountableOrder = {
  paymentStatus: string;
  paymentMethod: PaymentMethod | string;
  cashReceived: boolean;
  bags: number;
};

/**
 * Same rule as fn_recalc_leaderboard. Paid orders count once. Option A also
 * counts cash that is received and not yet paid, so a later remittance does
 * not add the bags a second time.
 */
export function countsOnLeaderboard(order: CountableOrder, mode: LeaderboardCashMode): boolean {
  if (order.paymentStatus === "refunded" || order.paymentStatus === "failed") return false;
  if (order.paymentStatus === "paid") return true;
  return mode === "when_received" && order.paymentMethod === "cash" && order.cashReceived;
}

export function leaderboardBags(orders: CountableOrder[], mode: LeaderboardCashMode): number {
  return orders.reduce((sum, order) => (countsOnLeaderboard(order, mode) ? sum + order.bags : sum), 0);
}

export function cashReceivedAmountError(amountCents: number, totalCents: number): string | null {
  if (!Number.isInteger(amountCents) || amountCents !== totalCents) {
    return "The amount has to match the order.";
  }
  return null;
}

/** Parent cancel: uncollected cash owed only. */
export function canParentCancelCash(order: {
  paymentMethod: string;
  paymentStatus: string;
  cashReceived: boolean;
  remittanceId: string | null;
}): boolean {
  return (
    order.paymentMethod === "cash" &&
    order.paymentStatus === "pending" &&
    !order.cashReceived &&
    !order.remittanceId
  );
}

/** Admin undo: full amount, only before a remittance is attached or paid. */
export function canAdminUndoCashReceived(order: {
  paymentMethod: string;
  paymentStatus: string;
  cashReceived: boolean;
  remittanceId: string | null;
}): boolean {
  return (
    order.paymentMethod === "cash" &&
    order.paymentStatus === "pending" &&
    order.cashReceived &&
    !order.remittanceId
  );
}

export function orderLinesLocked(order: { paymentStatus: string; cashReceived: boolean }): boolean {
  return order.paymentStatus === "paid" || order.cashReceived;
}

/**
 * Opening pay again reuses the one pending remittance. A changed amount
 * refreshes that row instead of inserting a second pending payment.
 */
export function remittanceReuse(input: { pendingId: string | null; previousCents: number | null; dueCents: number }): {
  reused: boolean;
  amountChanged: boolean;
  remittanceId: string | null;
} {
  if (input.dueCents <= 0) return { reused: false, amountChanged: false, remittanceId: input.pendingId };
  if (!input.pendingId) return { reused: false, amountChanged: false, remittanceId: null };
  return {
    reused: true,
    amountChanged: input.dueCents !== input.previousCents,
    remittanceId: input.pendingId,
  };
}

/**
 * An expired or failed checkout fails the remittance only when that session
 * is still the one stored on the pending row.
 */
export function failRemittanceApplies(input: { eventSessionId: string | null; currentSessionId: string | null; status: string }): boolean {
  if (!input.eventSessionId || input.status !== "pending") return false;
  return input.eventSessionId === input.currentSessionId;
}

export function isUnguessableToken(value: unknown): value is string {
  return typeof value === "string" && value.length >= 32 && /^[A-Za-z0-9]+$/.test(value);
}

/** Shop JSON the browser is allowed to see for the participant. */
export function supporterIdentity(shop: { player_first_name?: string; campaign_name?: string }): {
  playerFirstName: string;
  teamName: string;
} {
  return {
    playerFirstName: shop.player_first_name || "Participant",
    teamName: shop.campaign_name || "the team",
  };
}

export function ledgerNote(order: { paymentStatus: string; paymentMethod: string; cashReceived: boolean }): string | null {
  if (order.paymentMethod === "cash" && order.cashReceived && order.paymentStatus === "paid") {
    return "Paid to Sweet Success";
  }
  return null;
}
