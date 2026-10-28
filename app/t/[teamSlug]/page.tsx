import { CampaignShop } from "@/components/CampaignShop";

export const metadata = { title: "Order", robots: { index: false, follow: false } };

export default async function TeamPage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  return <CampaignShop teamSlug={teamSlug} />;
}
