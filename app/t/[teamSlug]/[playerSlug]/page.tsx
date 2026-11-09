import { CampaignShop } from "@/components/CampaignShop";

export const metadata = { title: "Order", robots: { index: false, follow: false } };

export default async function PlayerPage({ params }: { params: Promise<{ teamSlug: string; playerSlug: string }> }) {
  const { teamSlug, playerSlug } = await params;
  return <CampaignShop teamSlug={teamSlug} playerSlug={playerSlug} />;
}
