import { notFound } from "next/navigation";
import { StartsOn } from "@/components/FlowScreens";
import { Shop } from "@/components/Shop";
import { campaignBySlug, playersForSlug, shopBundles, shopCatalog } from "@/lib/catalog";
import { formatUserDate, todayInEdmonton } from "@/lib/dates";
import { supabaseConfigured } from "@/lib/env";
import { shopPhase } from "@/lib/launch";

export async function CampaignShop({ teamSlug, playerSlug }: { teamSlug: string; playerSlug?: string }) {
  if (!supabaseConfigured()) {
    return (
      <main className="page wrap">
        <h1>Shop unavailable</h1>
        <p>The server is missing its Supabase environment variables.</p>
      </main>
    );
  }

  const campaign = await campaignBySlug(teamSlug);
  if (!campaign?.team_slug) notFound();
  const phase = shopPhase(campaign.start_date, campaign.end_date, todayInEdmonton());
  if (phase === "before") return <StartsOn team={campaign.campaign_name} dateLabel={formatUserDate(campaign.start_date)} />;
  if (phase === "after") {
    return (
      <main className="page wrap">
        <h1>{campaign.campaign_name}</h1>
        <p>This fundraiser is closed. The whole order is delivered to the organizer.</p>
      </main>
    );
  }
  const players = await playersForSlug(campaign.team_slug);
  const selected = playerSlug ? players.find((player) => player.player_slug === playerSlug) : undefined;
  if (playerSlug && !selected) notFound();
  const [catalog, bundles] = await Promise.all([shopCatalog(campaign.sport), shopBundles()]);

  return (
    <Shop
      teamSlug={campaign.team_slug}
      campaignName={campaign.campaign_name}
      status={campaign.status}
      goalCents={campaign.goal_cad}
      raisedCents={campaign.team_raised_cents}
      endDate={campaign.end_date}
      players={players.map((player) => ({ cpId: player.cp_id, name: player.display_name }))}
      initialCpId={selected?.cp_id ?? null}
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
    />
  );
}
