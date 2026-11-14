import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buyerContactError } from "@/lib/buyer";
import { cashReceiptCopy, cashReceiptEmailsEnabled, cashReceiptSendPlan } from "@/lib/cash-receipt";
import { milestoneEmail } from "@/lib/email/copy";
import { assertPreviewInbox, resendBody } from "@/lib/email/send";
import { recipientsFor } from "@/lib/flow-run";
import {
  canAdminUndoCashReceived,
  canParentCancelCash,
  cashReceivedAmountError,
  countsOnLeaderboard,
  failRemittanceApplies,
  isUnguessableToken,
  leaderboardBags,
  ledgerNote,
  orderLinesLocked,
  remittanceReuse,
  supporterIdentity,
} from "@/lib/ledger-rules";
import { rowIsTest } from "@/lib/live-sale";
import { goalPercent } from "@/lib/standings";
import { cashCountsForProduction, parseRemittanceDeadline, remittanceDeadlineDate } from "@/lib/remittance-deadline";
import { supporterShopPath } from "@/lib/roster";
import { splitBundleCents } from "@/lib/bundles";
import { handleStripeEvent, type WebhookDeps } from "@/lib/webhook";

const PARENT = "a".repeat(32);
const SHARE = "b".repeat(32);
const UNSUB = "c".repeat(32);
const RECEIPT = "d".repeat(32);
const migration = readFileSync("supabase/migrations/20261112000000_parent_ledger.sql", "utf8");

function cardDeps(extra: Partial<WebhookDeps> = {}): { deps: WebhookDeps; receipts: string[]; recalcs: string[] } {
  const receipts: string[] = [];
  const recalcs: string[] = [];
  const deps: WebhookDeps = {
    async markPaid() {
      return { orderId: "order-1", campaignId: "camp-1", buyerName: "Pat", buyerEmail: "pat@example.com", totalCents: 1200, totalBags: 1 };
    },
    async markRefunded() {
      return null;
    },
    async sendReceipt(order) {
      receipts.push(order.orderId);
    },
    async recalc(campaignId) {
      recalcs.push(campaignId);
    },
    ...extra,
  };
  return { deps, receipts, recalcs };
}

describe("parent ledger", () => {
  it("1. card payment records paid, recalculates, and the shop identity is first name and team", async () => {
    const { deps, receipts, recalcs } = cardDeps();
    const result = await handleStripeEvent(
      { type: "checkout.session.completed", data: { object: { id: "cs_card", payment_status: "paid", payment_intent: "pi_card", metadata: { order_id: "order-1" } } } },
      deps,
    );
    expect(result).toEqual({ action: "paid", orderId: "order-1" });
    expect(recalcs).toEqual(["camp-1"]);
    expect(receipts).toEqual(["order-1"]);
    expect(supporterIdentity({ player_first_name: "Sam", campaign_name: "Hawks" })).toEqual({
      playerFirstName: "Sam",
      teamName: "Hawks",
    });
    const shop = readFileSync("app/s/[shareToken]/page.tsx", "utf8");
    expect(shop).not.toContain("parent_token");
    expect(shop).toContain("supporterIdentity");
    expect(shop).toContain("goalCents={0}");
    expect(migration).toContain("fn_recalc_leaderboard");
  });

  it("2. a supporter cash order is cash owed, with lines, and stays off the pick list", () => {
    const source = readFileSync("lib/checkout.ts", "utf8");
    expect(source).toContain('enteredBy: "supporter"');
    expect(source).toContain('paymentMethod: parsed.paymentMethod');
    expect(source).toContain('if (input.paymentMethod === "cash")');
    expect(cashCountsForProduction({ paymentMethod: "cash", paymentStatus: "pending", remittedOn: null, deadline: "2026-11-30" })).toBe(false);
    expect(migration).toContain("payment_method = 'cash' and payment_status <> 'paid'");
  });

  it("3. a parent can enter only a cash order", () => {
    const source = readFileSync("lib/checkout.ts", "utf8");
    expect(source).toContain('enteredBy: "parent"');
    expect(source).toContain('paymentMethod: "cash"');
    expect(source).toContain("Parents enter cash or paper orders");
    expect(migration).toContain("entered_by <> 'parent' or payment_method = 'cash'");
  });

  it("4. requires a name plus email or a North American phone, and a card email", () => {
    expect(buyerContactError({ name: "", email: "a@b.co", phone: "", method: "cash" })).toMatch(/name/i);
    expect(buyerContactError({ name: "Pat", email: "", phone: "", method: "cash" })).toMatch(/email or a phone/i);
    expect(buyerContactError({ name: "Pat", email: "pat@example.com", phone: "", method: "cash" })).toBeNull();
    expect(buyerContactError({ name: "Pat", email: "", phone: "(403) 555-1234", method: "cash" })).toBeNull();
    expect(buyerContactError({ name: "Pat", email: "pat@example.com", phone: "+1 403 555 1234", method: "cash" })).toBeNull();
    expect(buyerContactError({ name: "Pat", email: "", phone: "555-1234", method: "cash" })).toMatch(/10-digit/);
    expect(buyerContactError({ name: "Pat", email: "", phone: "", method: "card" })).toMatch(/email/i);
    expect(buyerContactError({ name: "Pat", email: "pat@example.com", phone: "12", method: "card" })).toMatch(/10-digit/);
  });

  it("5. cash received must match the total and a second tap does not send again", () => {
    expect(cashReceivedAmountError(1200, 1200)).toBeNull();
    expect(cashReceivedAmountError(600, 1200)).toMatch(/match/);
    expect(cashReceiptSendPlan({ emailsEnabled: true, alreadyReceived: true, buyerEmail: "pat@example.com", phoneOnly: false })).toBe("skipped");
    expect(migration).toContain("already_received");
    expect(migration).toContain("Received amount must match the order total");
  });

  it("6. holds the receipt email until the flag is on, and skips phone-only sends", () => {
    expect(cashReceiptEmailsEnabled(false)).toBe(false);
    expect(cashReceiptEmailsEnabled(true)).toBe(true);
    expect(cashReceiptSendPlan({ emailsEnabled: false, alreadyReceived: false, buyerEmail: "pat@example.com", phoneOnly: false })).toBe("held");
    expect(cashReceiptSendPlan({ emailsEnabled: true, alreadyReceived: false, buyerEmail: "pat@example.com", phoneOnly: false })).toBe("send");
    expect(cashReceiptSendPlan({ emailsEnabled: true, alreadyReceived: false, buyerEmail: null, phoneOnly: true })).toBe("page_only");
    const body = resendBody(
      { to: "pat@example.com", subject: "Cash receipt", html: "<p>GST included.</p>", text: "GST included." },
      { EMAIL_TEST_RECIPIENT: "delivered@resend.dev", VERCEL_ENV: "preview" },
    );
    expect(body.to).toEqual(["delivered@resend.dev"]);
    expect(() => assertPreviewInbox({ VERCEL_ENV: "preview", EMAIL_TEST_RECIPIENT: "person@example.com" })).toThrow(/delivered@resend.dev/);
  });

  it("7. the cash receipt says the parent received payment for the team and GST included", () => {
    const copy = cashReceiptCopy({
      buyerName: "Pat Buyer",
      team: "Hawks",
      totalCents: 2400,
      bags: 2,
      receivedBy: "Alex Parent",
      receivedAt: "2026-11-12T18:00:00.000Z",
      lines: [{ label: "Celly Crunches", qty: 2, amountCents: 2400 }],
      receiptToken: RECEIPT,
    });
    const combined = `${copy.subject}\n${copy.text}\n${copy.html}`;
    expect(combined).toContain("Alex Parent");
    expect(combined).toContain("on behalf of");
    expect(combined).toContain("Hawks");
    expect(combined).toContain("Celly Crunches");
    expect(combined).toContain("GST included");
    expect(combined).toContain(`/r/${RECEIPT}`);
    expect(combined).not.toContain(PARENT);
  });

  it("8. a remittance webhook marks the cash paid, recalculates, and does not email", async () => {
    const receipts: string[] = [];
    const recalcs: string[] = [];
    const deps: WebhookDeps = {
      async markPaid() {
        throw new Error("card path");
      },
      async markRefunded() {
        return null;
      },
      async sendReceipt() {
        receipts.push("nope");
      },
      async recalc(id) {
        recalcs.push(id);
      },
      async markRemittancePaid() {
        return { remittanceId: "rem-1", campaignId: "camp-1" };
      },
    };
    const result = await handleStripeEvent(
      { type: "checkout.session.completed", data: { object: { id: "cs_remit", payment_status: "paid", payment_intent: "pi_remit", metadata: { kind: "parent_remittance" } } } },
      deps,
    );
    expect(result).toEqual({ action: "remittance_paid", remittanceId: "rem-1" });
    expect(receipts).toEqual([]);
    expect(recalcs).toEqual(["camp-1"]);
    expect(ledgerNote({ paymentStatus: "paid", paymentMethod: "cash", cashReceived: true })).toBe("Paid to Sweet Success");
    expect(migration).toContain("fn_mark_remittance_paid");
    expect(readFileSync("lib/remit.ts", "utf8")).not.toContain("sendEmail");
  });

  it("9. option B counts cash only once it is remitted, and the goal stays on settled money", () => {
    const cash = { paymentStatus: "pending", paymentMethod: "cash", cashReceived: true, bags: 4 };
    const paid = { ...cash, paymentStatus: "paid" };
    expect(leaderboardBags([cash], "when_remitted")).toBe(0);
    expect(leaderboardBags([cash], "when_received")).toBe(4);
    expect(leaderboardBags([paid], "when_remitted")).toBe(4);
    expect(leaderboardBags([paid], "when_received")).toBe(4);
    expect(goalPercent(500, 1000)).toBe(50);
    expect(migration).toContain("v_mode = 'when_received'");
    expect(migration).toContain("team_raised_cents");
    const setting = parseRemittanceDeadline({ mode: "campaign_cutoff" });
    expect(remittanceDeadlineDate(setting, "2026-11-30")).toBe("2026-11-30");
    expect(remittanceDeadlineDate(parseRemittanceDeadline({ mode: "days_after_cutoff", days: 2 }), "2026-11-30")).toBe("2026-12-02");
  });

  it("10. short tokens fail, and the private board does not select supporter contacts", () => {
    expect(isUnguessableToken("short")).toBe(false);
    expect(isUnguessableToken(PARENT)).toBe(true);
    expect(migration).toContain("revoke all on function private.fn_parent_ledger(text) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function private.fn_parent_ledger(text) to service_role");
    const board = readFileSync("app/l/[parentToken]/page.tsx", "utf8");
    expect(board).not.toContain("buyer_email");
    expect(board).not.toContain("buyer_phone");
    expect(board).toContain("goalPercent");
  });

  it("11. lines can be added while cash is owed or a card is pending, then they lock", () => {
    expect(orderLinesLocked({ paymentStatus: "pending", cashReceived: false })).toBe(false);
    expect(orderLinesLocked({ paymentStatus: "pending", cashReceived: true })).toBe(true);
    expect(orderLinesLocked({ paymentStatus: "paid", cashReceived: false })).toBe(true);
    expect(migration).toContain("Line participant % does not match this ledger");
    expect(migration).toContain("add lines only while it is cash owed or a pending card order");
  });

  it("12. bundle cents still split exactly, and preview rows stay is_test", () => {
    expect(splitBundleCents(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(splitBundleCents(1000, [1, 1, 1]).reduce((sum, part) => sum + part, 0)).toBe(1000);
    expect(rowIsTest({})).toBe(true);
    expect(rowIsTest({ SSF_APPROVED_PRODUCTION: "true" })).toBe(false);
    expect(readFileSync("lib/checkout.ts", "utf8")).toContain("splitBundleCents");
    expect(migration).toContain("is_test boolean not null default true");
  });

  it("13. a second pay reuses the pending remittance and can refresh the amount", () => {
    expect(remittanceReuse({ pendingId: null, previousCents: null, dueCents: 2500 })).toEqual({
      reused: false,
      amountChanged: false,
      remittanceId: null,
    });
    expect(remittanceReuse({ pendingId: "rem-1", previousCents: 2000, dueCents: 2500 })).toEqual({
      reused: true,
      amountChanged: true,
      remittanceId: "rem-1",
    });
    expect(migration).toContain("parent_remittances_one_pending_per_cp");
    expect(readFileSync("lib/remit.ts", "utf8")).toContain("amount_changed");
  });

  it("14. an expired or failed session clears only the current pending remittance", async () => {
    expect(failRemittanceApplies({ eventSessionId: "cs_old", currentSessionId: "cs_new", status: "pending" })).toBe(false);
    expect(failRemittanceApplies({ eventSessionId: "cs_new", currentSessionId: "cs_new", status: "pending" })).toBe(true);
    expect(failRemittanceApplies({ eventSessionId: "cs_new", currentSessionId: "cs_new", status: "paid" })).toBe(false);
    const failed: string[] = [];
    const deps: WebhookDeps = {
      async markPaid() {
        return null;
      },
      async markRefunded() {
        return null;
      },
      async sendReceipt() {
        throw new Error("no receipt");
      },
      async recalc() {
        throw new Error("no recalc");
      },
      async failRemittance(sessionId) {
        failed.push(sessionId);
        return sessionId === "cs_open" ? { remittanceId: "rem-1", campaignId: "camp-1" } : null;
      },
    };
    const expired = await handleStripeEvent({ type: "checkout.session.expired", data: { object: { id: "cs_old" } } }, deps);
    const declined = await handleStripeEvent(
      { type: "payment_intent.payment_failed", data: { object: { id: "pi_1", metadata: { kind: "parent_remittance", checkout_session_id: "cs_open" } } } },
      deps,
    );
    expect(expired).toEqual({ action: "noop" });
    expect(declined).toEqual({ action: "remittance_failed", remittanceId: "rem-1" });
    expect(failed).toEqual(["cs_old", "cs_open"]);
    expect(migration).toContain("fn_fail_remittance");
  });

  it("15. refunding a card order or a remitted cash order recalculates", async () => {
    const recalcs: string[] = [];
    const deps: WebhookDeps = {
      async markPaid() {
        return null;
      },
      async markRefunded(id) {
        return id === "pi_card" ? { orderId: "order-card", campaignId: "camp-1" } : null;
      },
      async markRemittanceRefunded(id) {
        return id === "pi_cash" ? { orderId: "order-cash", campaignId: "camp-1" } : null;
      },
      async sendReceipt() {
        throw new Error("no receipt");
      },
      async recalc(id) {
        recalcs.push(id);
      },
    };
    const card = await handleStripeEvent({ type: "charge.refunded", data: { object: { refunded: true, payment_intent: "pi_card" } } }, deps);
    const cash = await handleStripeEvent({ type: "charge.refunded", data: { object: { refunded: true, payment_intent: "pi_cash" } } }, deps);
    expect(card).toEqual({ action: "refunded", orderId: "order-card" });
    expect(cash).toEqual({ action: "refunded", orderId: "order-cash" });
    expect(recalcs).toEqual(["camp-1", "camp-1"]);
    expect(countsOnLeaderboard({ paymentStatus: "refunded", paymentMethod: "card", cashReceived: false, bags: 2 }, "when_remitted")).toBe(false);
    expect(cashCountsForProduction({ paymentMethod: "cash", paymentStatus: "refunded", remittedOn: "2026-11-01", deadline: "2026-11-30" })).toBe(false);
  });

  it("16. a parent can cancel uncollected cash, and admin can undo cash received only before remittance", () => {
    const owed = { paymentMethod: "cash", paymentStatus: "pending", cashReceived: false, remittanceId: null };
    const received = { ...owed, cashReceived: true };
    const attached = { ...received, remittanceId: "rem-1" };
    expect(canParentCancelCash(owed)).toBe(true);
    expect(canParentCancelCash(received)).toBe(false);
    expect(canAdminUndoCashReceived(received)).toBe(true);
    expect(canAdminUndoCashReceived(attached)).toBe(false);
    expect(canAdminUndoCashReceived({ ...received, paymentStatus: "paid" })).toBe(false);
    expect(migration).toContain("fn_cancel_cash_owed");
    expect(migration).toContain("fn_admin_undo_cash_received");
  });

  it("17. the migration backfills the existing paid order and keeps it on the paid pick list", () => {
    expect(migration).toContain("entered_by = coalesce(o.entered_by, 'supporter')");
    expect(migration).toContain("payment_method = coalesce(o.payment_method, 'card')");
    expect(migration).toContain("o.payment_status = 'paid'::public.payment_status");
    expect(migration).toContain("fn_cash_in_production");
  });

  it("18. a share token cannot open the ledger, the private board, or cash actions", () => {
    const ledger = readFileSync("app/p/ledger/[parentToken]/page.tsx", "utf8");
    const board = readFileSync("app/l/[parentToken]/page.tsx", "utf8");
    const cash = readFileSync("app/api/ledger/cash-received/route.ts", "utf8");
    const remit = readFileSync("app/api/ledger/remit/route.ts", "utf8");
    const cancel = readFileSync("app/api/ledger/cancel/route.ts", "utf8");
    for (const source of [ledger, board, cash, remit, cancel]) {
      expect(source).toContain("isUnguessableToken");
    }
    expect(board).toContain("fn_parent_from_token");
    expect(board).not.toContain("share_token");
    expect(migration).toContain("cp.parent_token = p_token");
    expect(migration).toContain("cp.share_token is distinct from p_token");
  });

  it("19. a ledger token is rejected by the supporter shop lookup", () => {
    const page = readFileSync("app/s/[shareToken]/page.tsx", "utf8");
    const route = readFileSync("app/api/shop/orders/route.ts", "utf8");
    expect(page).toContain("fn_shop_from_share_token");
    expect(page).not.toContain("parent_token");
    expect(route).toContain("createShareOrder");
    expect(readFileSync("lib/checkout.ts", "utf8")).toContain("fn_shop_from_share_token");
    expect(migration).toContain("cp.share_token = p_token");
    expect(migration).toContain("cp.parent_token is distinct from p_token");
  });

  it("20. rotating the share token leaves the ledger token in place", () => {
    expect(migration).toContain("fn_admin_rotate_share_token");
    expect(migration).toContain("Leaves");
    const route = readFileSync("app/api/admin/participants/[cpId]/rotate-share/route.ts", "utf8");
    expect(route).toContain("fn_admin_rotate_share_token");
    expect(route).not.toContain("parent_token");
  });

  it("21. shareable pages and emails carry the shop link, not the ledger token", () => {
    const shareUrl = `https://preview.example${supporterShopPath(SHARE)}`;
    const mail = milestoneEmail({
      kind: "start",
      team: "Hawks",
      parentFirst: "Pat",
      shareLinks: [{ name: "Sam", url: shareUrl }],
      unsubscribeToken: UNSUB,
      players: [{ first: "Sam", last: "Lee", hideLastName: true, bags: 1, teamCents: 500 }],
      endDate: "2026-11-30",
    });
    const combined = `${mail.subject}\n${mail.text}\n${mail.html}\n${mail.unsubscribeUrl}`;
    expect(combined).toContain(`/s/${SHARE}`);
    expect(combined).toContain(`/unsubscribe/${UNSUB}`);
    expect(combined).not.toContain(PARENT);
    expect(combined).not.toContain("/l/");
    const close = milestoneEmail({
      kind: "close",
      team: "Hawks",
      parentFirst: "Pat",
      shareLinks: [{ name: "Sam", url: shareUrl }],
      unsubscribeToken: UNSUB,
      players: [{ first: "Sam", last: "Lee", hideLastName: true, bags: 1, teamCents: 500 }],
      endDate: "2026-11-30",
    });
    expect(close.text).not.toContain(PARENT);
    expect(close.text).not.toContain("/l/");
    const recipients = recipientsFor(
      [{
        cp_id: "cp-1",
        player_first_name: "Sam",
        player_last_name: "Lee",
        bags_sold: 1,
        leaderboard_opt_in: true,
        player_slug: "sam-l",
        share_token: SHARE,
        families: { parent_email: "pat@example.com", parent_first_name: "Pat", email_opted_out_at: null, email_unsub_token: UNSUB },
      }],
      null,
      null,
      null,
    );
    const rendered = JSON.stringify(recipients);
    expect(rendered).toContain(`/s/${SHARE}`);
    expect(rendered).toContain(`/unsubscribe/${UNSUB}`);
    expect(rendered).not.toContain(PARENT);
    expect(rendered).not.toContain("/t/");
    for (const file of [
      "app/s/[shareToken]/page.tsx",
      "app/r/[receiptToken]/page.tsx",
      "app/api/shop/orders/route.ts",
      "lib/cash-receipt.ts",
      "lib/email/copy.ts",
      "lib/flow-run.ts",
      "lib/milestones-run.ts",
    ]) {
      expect(readFileSync(file, "utf8"), file).not.toContain("parent_token");
    }
    const late = cashCountsForProduction({
      paymentMethod: "cash",
      paymentStatus: "paid",
      remittedOn: "2026-12-02",
      deadline: "2026-11-30",
    });
    const onTime = cashCountsForProduction({
      paymentMethod: "cash",
      paymentStatus: "paid",
      remittedOn: "2026-11-30",
      deadline: "2026-11-30",
    });
    expect(late).toBe(false);
    expect(onTime).toBe(true);
  });
});
