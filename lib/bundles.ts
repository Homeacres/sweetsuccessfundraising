export type BundlePick = {
  productId: string;
  bagTypeId: string;
  qty: number;
};

export type BundleOffer = {
  offerId: string;
  label: string;
  description: string | null;
  bagCount: number;
  bagTypeId: string;
  priceCents: number;
  teamShareCents: number;
  isActive: boolean;
  isTest: boolean;
  sortOrder: number;
};

/** Test offers stay off the production shop. Preview and local still show them. */
export function visibleBundleOffers(offers: BundleOffer[], env: Record<string, string | undefined> = process.env): BundleOffer[] {
  const production = env.VERCEL_ENV === "production";
  return offers
    .filter((offer) => offer.isActive && (!production || !offer.isTest))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.bagCount - b.bagCount);
}

/**
 * Split a bundle total across candy lines in proportion to bag qty.
 * The shares sum to totalCents. Any leftover cent stays on the first line.
 */
export function splitBundleCents(totalCents: number, quantities: number[]): number[] {
  if (!Number.isInteger(totalCents) || totalCents < 0) {
    throw new Error("Bundle total must be zero or a whole number of cents");
  }
  if (!quantities.length || quantities.some((qty) => !Number.isInteger(qty) || qty <= 0)) {
    throw new Error("Each bundle candy needs a whole number of bags");
  }
  const bags = quantities.reduce((sum, qty) => sum + qty, 0);
  const shares = quantities.map((qty) => Math.floor((totalCents * qty) / bags));
  shares[0] += totalCents - shares.reduce((sum, share) => sum + share, 0);
  return shares;
}

export function bundlePickError(input: {
  bagCount: number;
  standardBagTypeId: string;
  picks: BundlePick[];
  activeProductIds: ReadonlySet<string>;
}): string | null {
  if (!input.picks.length) return "Choose the bags in this pack.";
  let bags = 0;
  const seen = new Set<string>();
  for (const pick of input.picks) {
    if (!input.activeProductIds.has(pick.productId)) return "One of those candies is no longer for sale.";
    if (pick.bagTypeId !== input.standardBagTypeId) return "Premium bags can't go in a pack. Use standard bags.";
    if (!Number.isInteger(pick.qty) || pick.qty <= 0) return "Each candy in the pack needs at least one bag.";
    if (seen.has(pick.productId)) return "List each candy once in the pack.";
    seen.add(pick.productId);
    bags += pick.qty;
  }
  if (bags !== input.bagCount) {
    return `This pack needs exactly ${input.bagCount} standard bags.`;
  }
  return null;
}

export function plainBundleSaveError(message: string): string {
  if (message.includes("bundle_offers_share_min40")) return "The group has to keep at least 40% of the price.";
  if (message.includes("bundle_offers_share_min_per_bag")) return "The group has to keep at least $5 on every bag.";
  if (message.includes("bundle_offers_bags")) return "A pack needs more than one bag.";
  if (message.includes("bundle_offers_price")) return "The price has to be more than zero.";
  return "That pack could not be saved. Check the price and the group share.";
}
