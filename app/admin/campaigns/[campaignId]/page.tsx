import { AdminNav } from "@/components/AdminNav";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { isAdminRequest } from "@/lib/admin-auth";
import { packLines } from "@/lib/pick-list";
import { appUrl } from "@/lib/env";
import { canAdminUndoCashReceived } from "@/lib/ledger-rules";
import { formatUserDate } from "@/lib/dates";
import { formatCad, formatTeamCad } from "@/lib/money";
import { parseRemittanceDeadline, remittanceDeadlineDate } from "@/lib/remittance-deadline";
import { supporterShopPath } from "@/lib/roster";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Close-out", robots: { index: false, follow: false } };

type PickRow = {
  cpId: string;
  playerFirst: string;
  playerLast: string;
  orderId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  candyName: string;
  bundleLabel: string;
  bagCode: string;
  bags: number;
  mix: boolean;
};

export default async function CampaignAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ error?: string; rotated?: string; undone?: string }>;
}) {
  if (!(await isAdminRequest())) redirect("/admin/login");
  const { campaignId } = await params;
  const { error: errorFlag, rotated, undone } = await searchParams;
  const db = supabaseAdmin();

  const { data: campaign, error } = await db
    .from("campaigns")
    .select("campaign_id, campaign_name, team_slug, sport, status, start_date, end_date, goal_cad, team_raised_cents, total_raised_cad")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw error;
  if (!campaign) notFound();

  const [totalsRes, deliveryRes, kpiRes, picks] = await Promise.all([
    db.from("v_campaign_production_totals").select("product_name, bag_type_code, bags, orders").eq("campaign_id", campaignId),
    db.from("deliveries").select("delivery_id, status, scheduled_for, delivered_at, received_by, bags_delivered, notes").eq("campaign_id", campaignId).order("created_at", { ascending: false }),
    db.from("v_kpi_bags_per_order").select("paid_orders, bags, avg_bags_per_order").eq("campaign_id", campaignId).maybeSingle(),
    packLines(campaignId),
  ]);
  for (const result of [totalsRes, deliveryRes, kpiRes]) {
    if (result.error) throw result.error;
  }

  const grouped = new Map<string, { name: string; orders: Map<string, { buyer: string; email: string; phone: string | null; lines: PickRow[] }> }>();
  for (const row of picks) {
    const player = grouped.get(row.cpId) ?? {
      name: `${row.playerFirst} ${row.playerLast}`.trim(),
      orders: new Map(),
    };
    const order = player.orders.get(row.orderId) ?? { buyer: row.buyerName, email: row.buyerEmail, phone: row.buyerPhone, lines: [] };
    order.lines.push(row);
    player.orders.set(row.orderId, order);
    grouped.set(row.cpId, player);
  }

  return (
    <main className="page wrap">
      <AdminNav />
      <div className="page-head">
        <div>
          <h1>{campaign.campaign_name}</h1>
          <p className="muted">{campaign.sport} · {campaign.status}{campaign.team_slug ? ` · /t/${campaign.team_slug}` : ""}</p>
        </div>
        <div className="page-actions no-print">
          <PrintButton />
          <a className="btn btn-ghost" href={`/api/admin/campaigns/${campaignId}/pick-list`}>Download CSV</a>
        </div>
      </div>

      {errorFlag && <p className="alert error">That action didn't save. Try again.</p>}
      {rotated ? <p className="alert">Shop link rotated. The old supporter link no longer works.</p> : null}
      {undone ? <p className="alert">Cash received was undone. The order is cash owed again.</p> : null}
      <LedgerAdmin campaignId={campaignId} endDate={campaign.end_date} />

      <div className="grid-3" style={{ margin: "16px 0" }}>
        <article className="panel"><h3>Team keeps</h3><p>{formatTeamCad(campaign.team_raised_cents)} of {formatTeamCad(campaign.goal_cad)}</p></article>
        <article className="panel"><h3>Gross paid</h3><p>{formatCad(campaign.total_raised_cad)}</p></article>
        <article className="panel">
          <h3>Paid orders</h3>
          <p>{kpiRes.data ? `${kpiRes.data.paid_orders} orders · ${kpiRes.data.bags} bags · avg ${kpiRes.data.avg_bags_per_order}` : "None yet"}</p>
        </article>
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>Production</h2>
        <table>
          <thead><tr><th>Candy</th><th>Bag</th><th>Bags</th><th>Orders</th></tr></thead>
          <tbody>
            {(totalsRes.data ?? []).map((row) => (
              <tr key={`${row.product_name}-${row.bag_type_code}`}>
                <td>{row.product_name}</td><td>{row.bag_type_code}</td><td>{row.bags}</td><td>{row.orders}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!(totalsRes.data ?? []).length && <p className="muted">No paid bags yet.</p>}
      </section>

      <section>
        <h2>Pick list</h2>
        <p className="muted">By participant, then buyer. Full names are for the organizer.</p>
        {[...grouped.entries()].map(([cpId, player]) => (
          <article className="player-block panel" key={cpId}>
            <h3>{player.name}</h3>
            {[...player.orders.entries()].map(([orderId, order]) => (
              <div key={orderId}>
                <strong>{order.buyer}</strong>
                <div className="muted">{order.email}{order.phone ? ` · ${order.phone}` : ""}</div>
                <ul>
                  {order.lines.map((line, index) => (
                    <li key={`${line.candyName}-${line.bundleLabel}-${index}`}>
                      {line.bundleLabel ? `${line.bundleLabel}: ` : ""}{line.candyName} · {line.bagCode} · {line.bags}{line.mix ? " · includes mix pack" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </article>
        ))}
        {!grouped.size && <p className="muted">No paid orders to pack.</p>}
      </section>

      <section className="panel no-print" style={{ marginTop: 16 }}>
        <h2>Delivery</h2>
        <ul>
          {(deliveryRes.data ?? []).map((delivery) => (
            <li key={delivery.delivery_id}>
              {delivery.status}
              {delivery.bags_delivered != null ? ` · ${delivery.bags_delivered} bags` : ""}
              {delivery.received_by ? ` · ${delivery.received_by}` : ""}
              {delivery.scheduled_for ? ` · scheduled ${formatUserDate(delivery.scheduled_for)}` : ""}
              {delivery.delivered_at ? ` · ${formatUserDate(delivery.delivered_at)}` : ""}
              {delivery.notes ? ` · ${delivery.notes}` : ""}
            </li>
          ))}
        </ul>
        <form action="/api/admin/delivery" method="post">
          <input type="hidden" name="campaign_id" value={campaignId} />
          <label htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue="delivered">
            <option value="delivered">Delivered</option>
            <option value="scheduled">Scheduled</option>
          </select>
          <label htmlFor="scheduled_for">Date</label>
          <input id="scheduled_for" name="scheduled_for" type="date" />
          <label htmlFor="received_by">Received by</label>
          <input id="received_by" name="received_by" />
          <label htmlFor="bags_delivered">Bags delivered</label>
          <input id="bags_delivered" name="bags_delivered" inputMode="numeric" />
          <label htmlFor="notes">Notes</label>
          <textarea id="notes" name="notes" />
          <button className="btn btn-navy" type="submit" style={{ marginTop: 12 }}>Save delivery</button>
        </form>
      </section>

      {campaign.status === "active" && (
        <form className="no-print" action={`/api/admin/campaigns/${campaignId}/close`} method="post" style={{ marginTop: 16 }}>
          <button className="btn btn-navy" type="submit">Mark campaign closed</button>
          <p className="muted">Closing stops new orders' expectation and sends the parent close email to families who have not opted out.</p>
        </form>
      )}
    </main>
  );
}

async function LedgerAdmin({ campaignId, endDate }: { campaignId: string; endDate: string | null }) {
  const db = supabaseAdmin();
  const [peopleRes, cashRes, remitRes, configRes] = await Promise.all([
    db.from("campaign_participants").select("cp_id, player_first_name, player_last_name, share_token").eq("campaign_id", campaignId).order("registered_at"),
    db.from("orders").select("order_id, buyer_name, total_cad, payment_status, payment_method, cash_received_at, remittance_id").eq("campaign_id", campaignId).eq("payment_method", "cash"),
    db.from("parent_remittances").select("remittance_id, amount_cents, status, method").eq("campaign_id", campaignId).eq("status", "pending"),
    db.from("platform_config").select("value").eq("key", "remittance_deadline").maybeSingle(),
  ]);
  const missing = [peopleRes.error, cashRes.error, remitRes.error].find((error) => error && /does not exist|schema cache|share_token|payment_method|parent_remittances/i.test(error.message));
  if (missing) {
    return <p className="muted">Parent ledger details appear after the parent ledger migration is applied.</p>;
  }
  for (const result of [peopleRes, cashRes, remitRes, configRes]) {
    if (result.error) throw result.error;
  }
  const deadline = remittanceDeadlineDate(parseRemittanceDeadline(configRes.data?.value), endDate);
  const origin = appUrl();
  return (
    <section className="panel no-print" style={{ margin: "16px 0" }}>
      <h2>Cash and shop links</h2>
      <p className="muted">Cash must be remitted by {deadline ? formatUserDate(deadline) : "the order cut-off"} to be packed. Change the deadline on the campaigns page.</p>
      <h3>Supporter links</h3>
      <ul>
        {(peopleRes.data ?? []).map((person) => (
          <li key={person.cp_id}>
            {person.player_first_name} {person.player_last_name}
            {person.share_token ? ` · ${origin}${supporterShopPath(person.share_token)}` : ""}
            <form action={`/api/admin/participants/${person.cp_id}/rotate-share`} method="post">
              <input type="hidden" name="campaign_id" value={campaignId} />
              <button className="btn btn-ghost" type="submit">Rotate shop link</button>
            </form>
          </li>
        ))}
      </ul>
      <h3>Cash orders not yet in the team order</h3>
      <ul>
        {(cashRes.data ?? []).filter((order) => order.payment_status !== "paid").map((order) => (
          <li key={order.order_id}>
            {order.buyer_name} · {formatCad(order.total_cad)} · {order.payment_status}
            {order.cash_received_at ? " · cash received" : " · cash owed"}
            {canAdminUndoCashReceived({
              paymentMethod: order.payment_method,
              paymentStatus: order.payment_status,
              cashReceived: Boolean(order.cash_received_at),
              remittanceId: order.remittance_id,
            }) ? (
              <form action={`/api/admin/orders/${order.order_id}/undo-cash`} method="post">
                <input type="hidden" name="campaign_id" value={campaignId} />
                <button className="btn btn-ghost" type="submit">Undo cash received</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {!(cashRes.data ?? []).some((order) => order.payment_status !== "paid") ? <p className="muted">No held cash.</p> : null}
      <h3>Open remittances</h3>
      <ul>
        {(remitRes.data ?? []).map((row) => (
          <li key={row.remittance_id}>{formatCad(row.amount_cents)} · {row.method} · {row.status}</li>
        ))}
      </ul>
      {!(remitRes.data ?? []).length ? <p className="muted">No open remittance.</p> : null}
    </section>
  );
}
