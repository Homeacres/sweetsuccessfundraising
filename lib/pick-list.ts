import { supabaseAdmin } from "@/lib/supabase/admin";

export type PackLine = {
  orderId: string;
  cpId: string;
  playerFirst: string;
  playerLast: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  orderedAt: string;
  candyName: string;
  bagCode: string;
  bags: number;
  mix: boolean;
  bundleLabel: string;
  productId: string;
};

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nested<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Paid lines for the organizer, using the sport name and the bundle label. Never the source brand. */
export async function packLines(campaignId: string): Promise<PackLine[]> {
  const db = supabaseAdmin();
  const { data: campaign, error: campaignError } = await db.from("campaigns").select("sport").eq("campaign_id", campaignId).maybeSingle();
  if (campaignError) throw campaignError;
  const { data: sport } = campaign?.sport
    ? await db.from("sports").select("sport_id").eq("sport_name", campaign.sport).maybeSingle()
    : { data: null };
  const names = new Map<string, string>();
  if (sport?.sport_id) {
    const { data: themed, error } = await db.from("sport_product_names").select("product_id, display_name").eq("sport_id", sport.sport_id);
    if (error) throw error;
    for (const row of themed ?? []) names.set(row.product_id, row.display_name);
  }

  const { data, error } = await db
    .from("order_lines")
    .select("order_id, qty, product_id, from_mix_pack, bundle_offers(label), bag_types(code), orders!inner(campaign_id, buyer_name, buyer_email, buyer_phone, created_at, payment_status), campaign_participants!inner(cp_id, player_first_name, player_last_name)")
    .eq("orders.campaign_id", campaignId)
    .eq("orders.payment_status", "paid");
  if (error) throw error;

  return (data ?? []).map((row) => {
    const order = nested(row.orders) as { buyer_name?: string; buyer_email?: string; buyer_phone?: string | null; created_at?: string } | null;
    const person = nested(row.campaign_participants) as { cp_id?: string; player_first_name?: string; player_last_name?: string } | null;
    const bag = nested(row.bag_types) as { code?: string } | null;
    return {
      orderId: row.order_id,
      cpId: textOf(person?.cp_id),
      playerFirst: textOf(person?.player_first_name),
      playerLast: textOf(person?.player_last_name),
      buyerName: textOf(order?.buyer_name),
      buyerEmail: textOf(order?.buyer_email),
      buyerPhone: order?.buyer_phone ?? null,
      orderedAt: textOf(order?.created_at),
      candyName: names.get(row.product_id) || "Freeze-dried candy",
      bagCode: textOf(bag?.code),
      bags: row.qty,
      mix: Boolean(row.from_mix_pack),
      bundleLabel: textOf(nested(row.bundle_offers as { label?: string } | { label?: string }[] | null)?.label),
      productId: row.product_id,
    };
  });
}
