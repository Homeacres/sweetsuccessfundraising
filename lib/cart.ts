import { CartPricingError, type PriceInput } from "@/lib/pricing";

export type IncomingLine = {
  cpId: string;
  productId: string;
  bagTypeId: string;
  qty: number;
  fromMixPack?: boolean;
};

const MAX_LINE_QTY = 500;
const MAX_LINES = 80;

/**
 * One mix pack is one bag of each active candy (the pilot has 3), so the
 * pack counts as that many bags and is priced on the standard ladder.
 */
export function mixPackLines(
  cpId: string,
  productIds: string[],
  standardBagTypeId: string,
  packs = 1,
): IncomingLine[] {
  if (!cpId || !standardBagTypeId || productIds.length === 0) {
    throw new CartPricingError("A mix pack needs a player and the active candies");
  }
  if (!Number.isInteger(packs) || packs <= 0) {
    throw new CartPricingError("Mix pack quantity must be at least 1");
  }
  return productIds.map((productId) => ({
    cpId,
    productId,
    bagTypeId: standardBagTypeId,
    qty: packs,
    fromMixPack: true,
  }));
}

export function mixPackBagCount(activeCandyCount: number, packs = 1): number {
  return activeCandyCount * packs;
}

/** Merge identical player + candy + bag lines and assign line numbers for fn_price_cart. */
export function normalizeCartLines(lines: IncomingLine[]): PriceInput[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new CartPricingError("Cart is empty");
  }
  if (lines.length > MAX_LINES) {
    throw new CartPricingError("Too many lines in this order");
  }

  const merged = new Map<string, IncomingLine>();
  for (const raw of lines) {
    const qty = Number(raw?.qty);
    if (
      !raw?.cpId ||
      !raw.productId ||
      !raw.bagTypeId ||
      !Number.isInteger(qty) ||
      qty <= 0 ||
      qty > MAX_LINE_QTY
    ) {
      throw new CartPricingError("Each cart line needs a player, a candy, a bag type and a quantity");
    }
    const key = `${raw.cpId}|${raw.productId}|${raw.bagTypeId}`;
    const prev = merged.get(key);
    if (prev) {
      prev.qty += qty;
      prev.fromMixPack = Boolean(prev.fromMixPack || raw.fromMixPack);
      if (prev.qty > MAX_LINE_QTY) throw new CartPricingError("That quantity is too large");
    } else {
      merged.set(key, {
        cpId: raw.cpId,
        productId: raw.productId,
        bagTypeId: raw.bagTypeId,
        qty,
        fromMixPack: Boolean(raw.fromMixPack),
      });
    }
  }

  return [...merged.values()].map((line, index) => ({
    lineNo: index + 1,
    cpId: line.cpId,
    productId: line.productId,
    bagTypeId: line.bagTypeId,
    qty: line.qty,
    fromMixPack: Boolean(line.fromMixPack),
  }));
}
