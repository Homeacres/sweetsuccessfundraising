import { Shop } from "@/components/Shop";
import { shopBundles, shopCatalog } from "@/lib/catalog";
import { supabaseConfigured } from "@/lib/env";
import { isUnguessableToken, supporterIdentity } from "@/lib/ledger-rules";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order", robots: { index: false, follow: false } };

export default async function ShareShopPage({
  params,
  searchParams,
}: {
  params: Promise<{ shareToken: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { shareToken } = await params;
  const query = await searchParams;
  if (!supabaseConfigured() || !isUnguessableToken(shareToken)) return <Missing />;

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("fn_shop_from_share_token", { p_token: shareToken });
  if (error || !data || typeof data !== "object") return <Missing />;
  const shop = data as {
    campaign_id?: string;
    player_first_name?: string;
    campaign_name?: string;
    status?: string;
    end_date?: string | null;
  };
  if (!shop.campaign_id) return <Missing />;
  const identity = supporterIdentity(shop);
  const { data: campaign } = await db.from("campaigns").select("sport").eq("campaign_id", shop.campaign_id).maybeSingle();
  const [catalog, bundles] = await Promise.all([shopCatalog(campaign?.sport || ""), shopBundles()]);
  const notice = query.placed === "cash" ? "Cash order saved. Pay the parent, and they will mark it received." : null;

  return (
    <Shop
      teamSlug=""
      campaignName={identity.teamName}
      status={shop.status || "active"}
      goalCents={0}
      raisedCents={0}
      endDate={shop.end_date ?? null}
      players={[{ cpId: "supporter", name: identity.playerFirstName }]}
      initialCpId="supporter"
      products={catalog.products}
      bags={catalog.bags.map((bag) => ({
        bagTypeId: bag.bagTypeId,
        code: bag.code,
        name: bag.name,
        teamShareCents: 0,
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
      orderTarget={{ kind: "supporter", shareToken, firstName: identity.playerFirstName }}
      notice={notice}
    />
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
