import { CopyLink } from "@/components/CopyLink";
import { Shop } from "@/components/Shop";
import { shopBundles, shopCatalog } from "@/lib/catalog";
import { formatUserDate, todayInEdmonton } from "@/lib/dates";
import { appUrl, supabaseConfigured } from "@/lib/env";
import { countsOnLeaderboard, isUnguessableToken, leaderboardCashMode } from "@/lib/ledger-rules";
import { formatCad } from "@/lib/money";
import { describeRemittanceDeadline, parseRemittanceDeadline, remittanceDeadlineDate } from "@/lib/remittance-deadline";
import { supporterShopPath } from "@/lib/roster";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Parent ledger", robots: { index: false, follow: false } };

type LedgerOrder = {
  order_id: string;
  created_at: string;
  entered_by: string;
  payment_method: string;
  payment_status: string;
  ledger_payment_status: string | null;
  paid_to_ssf: boolean;
  buyer_name: string;
  buyer_email: string | null;
  buyer_phone: string | null;
  total_bags: number;
  total_cad: number;
  cash_received_at: string | null;
  cash_received_cents: number | null;
  cash_received_by: string | null;
  cash_receipt_token: string | null;
  remittance_id: string | null;
  line_items: { display_name?: string | null; qty?: number; bundle_label?: string | null }[] | null;
};

const ERRORS: Record<string, string> = {
  amount: "The amount has to match the order.",
  received: "That cash could not be marked received.",
  cancel: "Only an uncollected cash order can be cancelled.",
  remit: "There is no collected cash due right now.",
  link: "That link is not valid.",
};

export default async function LedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ parentToken: string }>;
  searchParams: Promise<{ error?: string; saved?: string; received?: string; cancelled?: string }>;
}) {
  const { parentToken } = await params;
  const query = await searchParams;
  if (!supabaseConfigured() || !isUnguessableToken(parentToken)) return <Missing />;

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("fn_parent_ledger", { p_token: parentToken });
  if (error || !data || typeof data !== "object") return <Missing />;
  const ledger = data as {
    cp_id: string;
    campaign_id: string;
    family_id: string;
    player_first_name: string;
    card_paid_cents: number;
    cash_owed_cents: number;
    cash_collected_cents: number;
    cash_due_to_ssf_cents: number;
    orders: LedgerOrder[] | null;
  };
  const orders = ledger.orders ?? [];
  const [familyRes, shareRes, campaignRes, configRes] = await Promise.all([
    db.from("families").select("parent_first_name, parent_last_name").eq("family_id", ledger.family_id).maybeSingle(),
    db.from("campaign_participants").select("share_token").eq("cp_id", ledger.cp_id).maybeSingle(),
    db.from("campaigns").select("campaign_name, sport, status, start_date, end_date").eq("campaign_id", ledger.campaign_id).maybeSingle(),
    db.from("platform_config").select("key, value").in("key", ["remittance_deadline", "leaderboard_cash_counting"]),
  ]);
  const parentName = `${familyRes.data?.parent_first_name || ""} ${familyRes.data?.parent_last_name || ""}`.trim() || "Parent";
  const shareToken = shareRes.data?.share_token;
  const campaign = campaignRes.data;
  const config = new Map((configRes.data ?? []).map((row) => [row.key, row.value]));
  const deadlineSetting = parseRemittanceDeadline(config.get("remittance_deadline"));
  const deadline = remittanceDeadlineDate(deadlineSetting, campaign?.end_date ?? null);
  const mode = leaderboardCashMode(config.get("leaderboard_cash_counting"));
  const pastDeadline = Boolean(deadline && todayInEdmonton() > deadline);
  const notice = ERRORS[query.error || ""] || (query.saved ? "Cash order saved." : query.received ? "Cash marked received." : query.cancelled ? "Cash order cancelled." : null);

  let catalog = null;
  let bundles: Awaited<ReturnType<typeof shopBundles>> = [];
  if (campaign?.sport) {
    [catalog, bundles] = await Promise.all([shopCatalog(campaign.sport), shopBundles()]);
  }
  const origin = appUrl();

  return (
    <main className="page wrap ledger">
      <p className="kicker">Parent ledger</p>
      <h1>{ledger.player_first_name}</h1>
      <p className="muted">{campaign?.campaign_name}. Only you and Sweet Success can see these orders.</p>
      {notice ? <div className="alert" role="status">{notice}</div> : null}
      <p><a href={`/l/${parentToken}`}>Private leaderboard</a></p>
      {shareToken ? <CopyLink label="Link to share with supporters" href={`${origin}${supporterShopPath(shareToken)}`} /> : null}

      <div className="ledger-totals">
        <article className="panel"><h3>Card paid</h3><p>{formatCad(ledger.card_paid_cents || 0)}</p></article>
        <article className="panel"><h3>Cash owed</h3><p>{formatCad(ledger.cash_owed_cents || 0)}</p></article>
        <article className="panel"><h3>Cash collected</h3><p>{formatCad(ledger.cash_collected_cents || 0)}</p></article>
        <article className="panel"><h3>Due to Sweet Success</h3><p>{formatCad(ledger.cash_due_to_ssf_cents || 0)}</p></article>
      </div>

      <p className="muted">Remittance deadline: {deadline ? formatUserDate(deadline) : describeRemittanceDeadline(deadlineSetting)}. Cash not remitted by then is left out of the team order.</p>
      {pastDeadline && ledger.cash_due_to_ssf_cents > 0 ? (
        <p className="alert">The remittance deadline has passed. You can still pay Sweet Success. Those bags will not be packed.</p>
      ) : null}
      {ledger.cash_due_to_ssf_cents > 0 ? (
        <form action="/api/ledger/remit" method="post">
          <input type="hidden" name="token" value={parentToken} />
          <button className="btn btn-navy ledger-pay" type="submit">Pay Sweet Success · {formatCad(ledger.cash_due_to_ssf_cents)}</button>
        </form>
      ) : null}

      <section className="ledger-orders">
        <h2>Orders</h2>
        {!orders.length ? <p className="muted">No orders yet.</p> : null}
        <div className="ledger-cards">
          {orders.map((order) => (
            <article className="panel" key={order.order_id}>
              <h3>{order.buyer_name}</h3>
              <p className="muted">{contactLine(order)}</p>
              <p className="muted">{order.entered_by === "parent" ? "Entered by you" : "Entered by a supporter"}</p>
              <StatusPill order={order} />
              <p>{order.total_bags} bag{order.total_bags === 1 ? "" : "s"} · {itemSummary(order)}</p>
              <p><strong>{formatCad(order.total_cad)}</strong> · {paidBy(order)} · {formatUserDate(order.created_at)}</p>
              {order.cash_received_at ? (
                <p>Cash received {formatCad(order.cash_received_cents || order.total_cad)} on {formatUserDate(order.cash_received_at)} by {order.cash_received_by}.</p>
              ) : null}
              <p className="muted">{boardLine(order, mode)}</p>
              <OrderActions order={order} parentToken={parentToken} parentName={parentName} origin={origin} idPrefix="card" />
            </article>
          ))}
        </div>
        <div className="ledger-table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Supporter</th>
                <th>Bags</th>
                <th>Amount</th>
                <th>Paid by</th>
                <th>Status</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.order_id}>
                  <td>
                    <strong>{order.buyer_name}</strong>
                    <div className="muted">{contactLine(order) || "—"}</div>
                    <div className="muted">{order.entered_by === "parent" ? "Entered by you" : "Entered by a supporter"}</div>
                  </td>
                  <td>
                    <strong>{order.total_bags}</strong>
                    <div>{itemSummary(order)}</div>
                  </td>
                  <td>{formatCad(order.total_cad)}</td>
                  <td>{paidBy(order)}</td>
                  <td>
                    <StatusPill order={order} />
                    {order.cash_received_by ? <div className="muted">Collected by {order.cash_received_by}</div> : null}
                    <div className="muted">{boardLine(order, mode)}</div>
                  </td>
                  <td>{formatUserDate(order.created_at)}</td>
                  <td><OrderActions order={order} parentToken={parentToken} parentName={parentName} origin={origin} idPrefix="table" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {catalog && campaign ? (
        <section style={{ marginTop: 24 }}>
          <h2>Enter a cash or paper order</h2>
          <Shop
            teamSlug=""
            campaignName={campaign.campaign_name}
            status={campaign.status}
            goalCents={0}
            raisedCents={0}
            endDate={campaign.end_date}
            players={[{ cpId: "parent-order", name: ledger.player_first_name }]}
            initialCpId="parent-order"
            products={catalog.products}
            bags={catalog.bags.map((bag) => ({
              bagTypeId: bag.bagTypeId,
              code: bag.code,
              name: bag.name,
              teamShareCents: bag.teamShareCents,
            }))}
            tiers={catalog.tiers}
            bagRows={catalog.bagRows}
            tierLabels={catalog.tierLabels}
            defaultQty={catalog.defaultQty}
            minBags={catalog.minBags}
            standardBagTypeId={catalog.standardBagTypeId}
            bundles={bundles.map((offer) => ({
              offerId: offer.offerId,
              label: offer.label,
              bagCount: offer.bagCount,
              bagTypeId: offer.bagTypeId,
              priceCents: offer.priceCents,
              isTest: offer.isTest,
            }))}
            orderTarget={{ kind: "parent", parentToken }}
          />
        </section>
      ) : null}
    </main>
  );
}

function paidBy(order: LedgerOrder): string {
  return order.payment_method === "cash" ? "Cash" : "Card";
}

function contactLine(order: LedgerOrder): string {
  return [order.buyer_email, order.buyer_phone].filter(Boolean).join(" · ").replaceAll("@", "@\u200b");
}

function itemSummary(order: LedgerOrder): string {
  const items = order.line_items ?? [];
  if (!items.length) return "No items listed";
  return items
    .map((line) => `${line.bundle_label ? `${line.bundle_label}: ` : ""}${line.display_name || "Freeze-dried candy"} × ${line.qty ?? 0}`)
    .join(", ");
}

function boardLine(order: LedgerOrder, mode: ReturnType<typeof leaderboardCashMode>): string {
  const onBoard = countsOnLeaderboard({
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    cashReceived: Boolean(order.cash_received_at),
    bags: order.total_bags,
  }, mode);
  return onBoard ? "On the leaderboard" : "Not on the leaderboard yet";
}

function orderStatus(order: LedgerOrder): { label: string; tone: string } {
  if (order.payment_status === "failed") return { label: "Cancelled", tone: "cancelled" };
  if (order.payment_status === "refunded") return { label: "Refunded", tone: "cancelled" };
  if (order.payment_method === "cash" && order.paid_to_ssf) return { label: "Sent in by parent", tone: "ssf" };
  if (order.ledger_payment_status === "card_paid") return { label: "Paid by card", tone: "card" };
  if (order.ledger_payment_status === "cash_received") return { label: "Cash received", tone: "received" };
  if (order.ledger_payment_status === "cash_owed") return { label: "Cash owed", tone: "owed" };
  if (order.payment_method === "card") return { label: "Card checkout open", tone: "open" };
  return { label: "Pending", tone: "open" };
}

function StatusPill({ order }: { order: LedgerOrder }) {
  const status = orderStatus(order);
  return <span className={`pill pill-${status.tone}`}>{status.label}</span>;
}

function OrderActions({
  order,
  parentToken,
  parentName,
  origin,
  idPrefix,
}: {
  order: LedgerOrder;
  parentToken: string;
  parentName: string;
  origin: string;
  idPrefix: string;
}) {
  return (
    <div className="ledger-actions">
      {order.ledger_payment_status === "cash_owed" ? (
        <>
          <form action="/api/ledger/cash-received" method="post">
            <input type="hidden" name="token" value={parentToken} />
            <input type="hidden" name="order_id" value={order.order_id} />
            <input type="hidden" name="amount_cents" value={order.total_cad} />
            <label htmlFor={`${idPrefix}-by-${order.order_id}`}>Collected by</label>
            <input id={`${idPrefix}-by-${order.order_id}`} name="collected_by" defaultValue={parentName} />
            <button className="btn btn-navy" type="submit">Mark cash received</button>
          </form>
          <form action="/api/ledger/cancel" method="post">
            <input type="hidden" name="token" value={parentToken} />
            <input type="hidden" name="order_id" value={order.order_id} />
            <button className="btn btn-ghost" type="submit">Cancel</button>
          </form>
        </>
      ) : null}
      {order.cash_receipt_token ? (
        <a className="btn btn-ghost" href={`${origin}/r/${order.cash_receipt_token}`}>Receipt</a>
      ) : null}
    </div>
  );
}

function Missing() {
  return (
    <main className="page wrap">
      <h1>Link not valid</h1>
      <p>This link doesn't match a fundraiser.</p>
    </main>
  );
}
