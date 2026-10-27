import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { isAdminRequest } from "@/lib/admin-auth";
import { formatUserDate } from "@/lib/dates";
import { formatCad } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Close-out", robots: { index: false, follow: false } };

type PickRow = {
  cp_id: string;
  player_first_name: string;
  player_last_name: string;
  order_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  candy_name: string;
  base_candy: string;
  bag_type_code: string;
  bags: number;
  includes_mix_pack: boolean;
  ordered_at: string;
};

export default async function CampaignAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await isAdminRequest())) redirect("/admin/login");
  const { campaignId } = await params;
  const { error: errorFlag } = await searchParams;
  const db = supabaseAdmin();

  const { data: campaign, error } = await db
    .from("campaigns")
    .select("campaign_id, campaign_name, team_slug, sport, status, start_date, end_date, goal_cad, team_raised_cents, total_raised_cad")
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw error;
  if (!campaign) notFound();

  const [totalsRes, pickRes, deliveryRes, kpiRes] = await Promise.all([
    db.from("v_campaign_production_totals").select("product_name, bag_type_code, bags, orders").eq("campaign_id", campaignId),
    db
      .from("v_organizer_pick_list")
      .select("cp_id, player_first_name, player_last_name, order_id, buyer_name, buyer_email, buyer_phone, candy_name, base_candy, bag_type_code, bags, includes_mix_pack, ordered_at")
      .eq("campaign_id", campaignId),
    db.from("deliveries").select("delivery_id, status, scheduled_for, delivered_at, received_by, bags_delivered, notes").eq("campaign_id", campaignId).order("created_at", { ascending: false }),
    db.from("v_kpi_bags_per_order").select("paid_orders, bags, avg_bags_per_order").eq("campaign_id", campaignId).maybeSingle(),
  ]);
  for (const result of [totalsRes, pickRes, deliveryRes, kpiRes]) {
    if (result.error) throw result.error;
  }

  const picks = [...((pickRes.data ?? []) as PickRow[])].sort(
    (a, b) =>
      a.player_last_name.localeCompare(b.player_last_name) ||
      a.player_first_name.localeCompare(b.player_first_name) ||
      a.buyer_name.localeCompare(b.buyer_name) ||
      a.candy_name.localeCompare(b.candy_name),
  );
  const grouped = new Map<string, { name: string; orders: Map<string, { buyer: string; email: string; phone: string | null; lines: PickRow[] }> }>();
  for (const row of picks) {
    const player = grouped.get(row.cp_id) ?? {
      name: `${row.player_first_name} ${row.player_last_name}`.trim(),
      orders: new Map(),
    };
    const order = player.orders.get(row.order_id) ?? { buyer: row.buyer_name, email: row.buyer_email, phone: row.buyer_phone, lines: [] };
    order.lines.push(row);
    player.orders.set(row.order_id, order);
    grouped.set(row.cp_id, player);
  }

  return (
    <main className="page wrap">
      <p className="no-print"><Link href="/admin">All campaigns</Link></p>
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

      <div className="grid-3" style={{ margin: "16px 0" }}>
        <article className="panel"><h3>Team keeps</h3><p>{formatCad(campaign.team_raised_cents)} of {formatCad(campaign.goal_cad)}</p></article>
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
        <p className="muted">By player, then buyer. Full names are for the organizer.</p>
        {[...grouped.entries()].map(([cpId, player]) => (
          <article className="player-block panel" key={cpId}>
            <h3>{player.name}</h3>
            {[...player.orders.entries()].map(([orderId, order]) => (
              <div key={orderId}>
                <strong>{order.buyer}</strong>
                <div className="muted">{order.email}{order.phone ? ` · ${order.phone}` : ""}</div>
                <ul>
                  {order.lines.map((line, index) => (
                    <li key={`${line.candy_name}-${line.base_candy}-${index}`}>
                      {line.candy_name}{line.base_candy && line.base_candy !== line.candy_name ? ` · ${line.base_candy}` : ""} · {line.bag_type_code} · {line.bags}{line.includes_mix_pack ? " · includes mix pack" : ""}
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
