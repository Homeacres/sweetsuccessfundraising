/** Sport-themed name for a candy. Never the source brand in `products.name`. */
export function sportThemedName(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export type PublicProduct = {
  productId: string;
  displayName: string | null;
  description: string | null;
};

/**
 * Customer catalog row. `name` (the source brand) is accepted so callers can
 * pass a products row and tests can prove it is dropped.
 */
export function publicCatalogProduct(
  product: { product_id: string; description: string | null; name?: string },
  themedName: string | null | undefined,
): PublicProduct {
  return {
    productId: product.product_id,
    displayName: sportThemedName(themedName),
    description: product.description,
  };
}

export function cartCandyLine(displayName: string | null, bagName: string, qty: number, fromMixPack: boolean): string {
  const prefix = displayName ? `${displayName} · ` : "";
  return `${prefix}${bagName} × ${qty}${fromMixPack ? " · mix pack" : ""}`;
}

/** One Stripe Checkout line for the whole order. No per-candy name. */
export function stripeCheckoutProduct(input: { campaignName: string; totalBags: number }): { name: string; description: string } {
  const bags = input.totalBags;
  return {
    name: `${input.campaignName} fundraiser`,
    description: `${bags} freeze-dried candy bag${bags === 1 ? "" : "s"}. Bulk delivery to the team organizer.`,
  };
}

/** Receipt and receipt-email label. Missing theme stays generic. */
export function receiptCandyName(displayName: string | null | undefined): string {
  return sportThemedName(displayName) ?? "Freeze-dried candy";
}
