import { notFound } from "next/navigation";
import { Shop } from "@/components/Shop";
import { campaignBySlug, playersForSlug, shopCatalog } from "@/lib/catalog";
import { supabaseConfigured } from "@/lib/env";

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
  const players = await playersForSlug(campaign.team_slug);
  const selected = playerSlug ? players.find((player) => player.player_slug === playerSlug) : undefined;
  if (playerSlug && !selected) notFound();
  const catalog = await shopCatalog(campaign.sport);

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
    />
  );
}
