import { CopyLink } from "@/components/CopyLink";
import { Shop } from "@/components/Shop";
import { shopBundles, shopCatalog } from "@/lib/catalog";
import { formatUserDate, todayInEdmonton } from "@/lib/dates";
import { appUrl, supabaseConfigured } from "@/lib/env";
import { countsOnLeaderboard, isUnguessableToken, leaderboardCashMode, ledgerNote } from "@/lib/ledger-rules";
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
    <main className="page wrap">
      <p className="kicker">Parent ledger</p>
      <h1>{ledger.player_first_name}</h1>
      <p className="muted">{campaign?.campaign_name}. Only you and Sweet Success can see these orders.</p>
      {notice ? <div className="alert" role="status">{notice}</div> : null}
      <p><a href={`/l/${parentToken}`}>Private leaderboard</a></p>
      {shareToken ? <CopyLink label="Link to share with supporters" href={`${origin}${supporterShopPath(shareToken)}`} /> : null}

      <div className="grid-3" style={{ margin: "16px 0" }}>
        <article className="panel"><h3>Paid by card</h3><p>{formatCad(ledger.card_paid_cents || 0)}</p></article>
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
          <button className="btn btn-navy" type="submit">Pay {formatCad(ledger.cash_due_to_ssf_cents)} to Sweet Success</button>
        </form>
      ) : null}

      <section style={{ marginTop: 20 }}>
        <h2>Orders</h2>
        {orders.map((order) => {
          const note = ledgerNote({
            paymentStatus: order.payment_status,
            paymentMethod: order.payment_method,
            cashReceived: Boolean(order.cash_received_at),
          });
          const onBoard = countsOnLeaderboard({
            paymentStatus: order.payment_status,
            paymentMethod: order.payment_method,
            cashReceived: Boolean(order.cash_received_at),
            bags: order.total_bags,
          }, mode);
          return (
            <article className="panel" key={order.order_id} style={{ marginBottom: 12 }}>
              <h3>{order.buyer_name}</h3>
              <p className="muted">
                {order.entered_by === "parent" ? "Entered by you" : "Entered by a supporter"}
                {" · "}
                {statusLabel(order)}
                {" · "}
                {formatCad(order.total_cad)}
                {" · "}
                {formatUserDate(order.created_at)}
              </p>
              <p className="muted">{[order.buyer_email, order.buyer_phone].filter(Boolean).join(" · ")}</p>
              <ul>
                {(order.line_items ?? []).map((line, index) => (
                  <li key={`${order.order_id}-${index}`}>
                    {line.bundle_label ? `${line.bundle_label}: ` : ""}{line.display_name || "Freeze-dried candy"} × {line.qty ?? 0}
                  </li>
                ))}
              </ul>
              {order.cash_received_at ? (
                <p>Cash received {formatCad(order.cash_received_cents || order.total_cad)} on {formatUserDate(order.cash_received_at)} by {order.cash_received_by}.</p>
              ) : null}
              {note ? <p><strong>{note}</strong></p> : null}
              <p className="muted">{onBoard ? "Counts on the leaderboard." : "Not on the leaderboard until it is paid to Sweet Success."}</p>
              {order.ledger_payment_status === "cash_owed" ? (
                <div>
                  <form action="/api/ledger/cash-received" method="post">
                    <input type="hidden" name="token" value={parentToken} />
                    <input type="hidden" name="order_id" value={order.order_id} />
                    <input type="hidden" name="amount_cents" value={order.total_cad} />
                    <label htmlFor={`by-${order.order_id}`}>Collected by</label>
                    <input id={`by-${order.order_id}`} name="collected_by" defaultValue={parentName} />
                    <button className="btn btn-navy" type="submit">Cash received</button>
                  </form>
                  <form action="/api/ledger/cancel" method="post">
                    <input type="hidden" name="token" value={parentToken} />
                    <input type="hidden" name="order_id" value={order.order_id} />
                    <button className="btn btn-ghost" type="submit">Cancel this cash order</button>
                  </form>
                </div>
              ) : null}
              {order.cash_receipt_token ? (
                <CopyLink label="Cash receipt" href={`${origin}/r/${order.cash_receipt_token}`} />
              ) : null}
            </article>
          );
        })}
        {!orders.length ? <p className="muted">No orders yet.</p> : null}
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

function statusLabel(order: LedgerOrder): string {
  if (order.payment_status === "refunded") return "Refunded";
  if (order.payment_status === "failed") return "Cancelled";
  if (order.ledger_payment_status === "card_paid") return "Paid by card";
  if (order.ledger_payment_status === "cash_received") return "Cash received";
  if (order.ledger_payment_status === "cash_owed") return "Cash owed";
  if (order.payment_method === "card") return "Card checkout open";
  return "Pending";
}

function Missing() {
  return (
    <main className="page wrap">
      <h1>Link not valid</h1>
      <p>This link doesn't match a fundraiser.</p>
    </main>
  );
}
