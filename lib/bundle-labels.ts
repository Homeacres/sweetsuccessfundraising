import { supabaseAdmin } from "@/lib/supabase/admin";

function labelOf(value: unknown): string | null {
  if (Array.isArray(value)) return labelOf(value[0]);
  if (value && typeof value === "object" && "label" in value) {
    const label = (value as { label?: unknown }).label;
    return typeof label === "string" ? label : null;
  }
  return null;
}

/** order_id|product_id|qty → bundle label, for the pick list. */
export async function bundleLabelsForCampaign(campaignId: string): Promise<Map<string, string>> {
  const { data, error } = await supabaseAdmin()
    .from("order_lines")
    .select("order_id, product_id, qty, bundle_offers(label), orders!inner(campaign_id)")
    .eq("orders.campaign_id", campaignId)
    .not("bundle_offer_id", "is", null);
  if (error) throw error;
  const labels = new Map<string, string>();
  for (const row of data ?? []) {
    const label = labelOf(row.bundle_offers);
    if (!label) continue;
    const key = `${row.order_id}|${row.product_id}|${row.qty}`;
    if (!labels.has(key)) labels.set(key, label);
  }
  return labels;
}

export function takeBundleLabel(labels: Map<string, string>, orderId: string, productId: string, qty: number): string {
  const key = `${orderId}|${productId}|${qty}`;
  const label = labels.get(key) || "";
  if (label) labels.delete(key);
  return label;
}
