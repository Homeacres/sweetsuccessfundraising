import { productPhotoForSort, type ProductPhoto } from "@/components/product-photos";
import { applySportOptions, OTHER_SPORT, type SportCatalogRow } from "@/lib/apply-sport";
import { jsonbInt } from "@/lib/money";
import { publicCatalogProduct, type PublicProduct } from "@/lib/public-names";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { BagRow, TierRow } from "@/lib/pricing";

export type SportOption = { sport_name: string; emoji: string | null };

export type PublicBagPrice = {
  code: string;
  name: string;
  priceCents: number;
  teamShareCents: number;
};

/** Per-bag shelf price from the active qty=1 tier. Ignores inactive bundle rows. */
export async function publicBagPrices(): Promise<PublicBagPrice[]> {
  const db = supabaseAdmin();
  const [bagsRes, tiersRes] = await Promise.all([
    db
      .from("bag_types")
      .select("bag_type_id, code, name, retail_price_cents, team_share_cents, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    db.from("price_tiers").select("bag_type_id, qty, price_cents").eq("is_active", true).eq("qty", 1),
  ]);
  if (bagsRes.error) throw bagsRes.error;
  if (tiersRes.error) throw tiersRes.error;
  const unit = new Map((tiersRes.data ?? []).map((tier) => [tier.bag_type_id, tier.price_cents]));
  return (bagsRes.data ?? []).map((bag) => ({
    code: bag.code,
    name: bag.name,
    priceCents: unit.get(bag.bag_type_id) ?? bag.retail_price_cents,
    teamShareCents: bag.team_share_cents,
  }));
}

export async function listSports(): Promise<SportOption[]> {
  const { data, error } = await supabaseAdmin()
    .from("sports")
    .select("sport_name, emoji, sort_order, sport_product_names!inner(product_id)")
    .eq("is_active", true)
    .neq("sport_name", OTHER_SPORT)
    .order("sort_order");
  if (error) throw error;
  const rows = (data ?? []) as {
    sport_name: string;
    emoji: string | null;
    sort_order: number | null;
    sport_product_names: { product_id: string }[] | null;
  }[];
  const catalog: SportCatalogRow[] = rows.map((row) => ({
    sport_name: row.sport_name,
    emoji: row.emoji,
    sort_order: row.sort_order ?? 0,
    is_active: true,
    nameCount: Array.isArray(row.sport_product_names) ? Math.max(row.sport_product_names.length, 1) : 1,
  }));
  return applySportOptions(catalog);
}

export async function serviceProvinces(): Promise<string[]> {
  const { data, error } = await supabaseAdmin()
    .from("platform_config")
    .select("value")
    .eq("key", "service_provinces")
    .maybeSingle();
  if (error) throw error;
  if (Array.isArray(data?.value) && data.value.every((item) => typeof item === "string")) {
    return data.value as string[];
  }
  return ["AB"];
}

export type CampaignRecord = {
  campaign_id: string;
  campaign_name: string;
  sport: string;
  team_slug: string;
  goal_cad: number;
  team_raised_cents: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

export async function campaignBySlug(teamSlug: string): Promise<CampaignRecord | null> {
  const { data, error } = await supabaseAdmin()
    .from("campaigns")
    .select("campaign_id, campaign_name, sport, team_slug, goal_cad, team_raised_cents, status, start_date, end_date")
    .eq("team_slug", teamSlug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type PickerPlayer = {
  cp_id: string;
  player_slug: string;
  display_name: string;
  registered_at: string;
};

export async function playersForSlug(teamSlug: string): Promise<PickerPlayer[]> {
  const { data, error } = await supabaseAdmin()
    .from("v_campaign_player_picker")
    .select("cp_id, player_slug, display_name, registered_at")
    .eq("team_slug", teamSlug)
    .order("registered_at");
  if (error) throw error;
  return data ?? [];
}

export type ShopProduct = PublicProduct & { photo: ProductPhoto | null };

export type ShopBag = {
  bagTypeId: string;
  code: string;
  name: string;
  retailPriceCents: number;
  teamShareCents: number;
};

export type ShopCatalog = {
  products: ShopProduct[];
  bags: ShopBag[];
  tiers: TierRow[];
  bagRows: BagRow[];
  tierLabels: { qty: number; label: string }[];
  defaultQty: number;
  minBags: number;
  standardBagTypeId: string | null;
};

export async function shopCatalog(sportName: string): Promise<ShopCatalog> {
  const db = supabaseAdmin();
  const [productsRes, bagsRes, tiersRes, configRes, sportRes] = await Promise.all([
    db.from("products").select("product_id, description, sort_order").eq("is_active", true).order("sort_order"),
    db
      .from("bag_types")
      .select("bag_type_id, code, name, retail_price_cents, team_share_cents")
      .eq("is_active", true)
      .order("sort_order"),
    db.from("price_tiers").select("bag_type_id, qty, price_cents").eq("is_active", true),
    db.from("platform_config").select("key, value").in("key", ["order_default_qty", "order_min_bags"]),
    db.from("sports").select("sport_id").eq("sport_name", sportName).maybeSingle(),
  ]);
  for (const result of [productsRes, bagsRes, tiersRes, configRes, sportRes]) {
    if (result.error) throw result.error;
  }

  let names = new Map<string, string>();
  let tierLabels: { qty: number; label: string }[] = [];
  if (sportRes.data?.sport_id) {
    const [nameRes, labelRes] = await Promise.all([
      db.from("sport_product_names").select("product_id, display_name").eq("sport_id", sportRes.data.sport_id),
      db.from("sport_tier_labels").select("qty, label").eq("sport_id", sportRes.data.sport_id),
    ]);
    if (nameRes.error) throw nameRes.error;
    if (labelRes.error) throw labelRes.error;
    names = new Map((nameRes.data ?? []).map((row) => [row.product_id, row.display_name]));
    tierLabels = (labelRes.data ?? []).map((row) => ({ qty: row.qty, label: row.label }));
  }

  const products: ShopProduct[] = (productsRes.data ?? []).map((product) => ({
    ...publicCatalogProduct(product, names.get(product.product_id)),
    photo: productPhotoForSort(product.sort_order),
  }));

  const bags: ShopBag[] = (bagsRes.data ?? []).map((bag) => ({
    bagTypeId: bag.bag_type_id,
    code: bag.code,
    name: bag.name,
    retailPriceCents: bag.retail_price_cents,
    teamShareCents: bag.team_share_cents,
  }));

  const tiers: TierRow[] = (tiersRes.data ?? []).map((tier) => ({
    bagTypeId: tier.bag_type_id,
    qty: tier.qty,
    priceCents: tier.price_cents,
    active: true,
  }));

  const bagRows: BagRow[] = bags.map((bag) => ({
    bagTypeId: bag.bagTypeId,
    teamShareCents: bag.teamShareCents,
    active: true,
  }));

  const config = new Map((configRes.data ?? []).map((row) => [row.key, row.value]));

  return {
    products,
    bags,
    tiers,
    bagRows,
    tierLabels,
    defaultQty: jsonbInt(config.get("order_default_qty"), 3),
    minBags: jsonbInt(config.get("order_min_bags"), 1),
    standardBagTypeId: bags.find((bag) => bag.code === "standard")?.bagTypeId ?? null,
  };
}
