/**
 * Display preview of public.fn_price_cart.
 * Checkout never uses this result. The server calls fn_price_cart and charges that amount.
 *
 * The pilot sells single bags: only the qty=1 tiers are active ($12 standard,
 * $14 premium), so this returns qty × that price. Inactive 3/5/7/10 rows are
 * ignored. If those tiers are turned back on, the same rule applies again:
 * per bag type, take the largest active tier as many times as it fits. An active
 * 1-bag tier is required. Gross is split with integer division; leftover cents
 * go to the largest remainders, ties broken by lowest line number. Team share
 * is qty × the bag type's per-bag team share.
 */

export class CartPricingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartPricingError";
  }
}

export type PriceInput = {
  lineNo: number;
  cpId: string;
  productId: string;
  bagTypeId: string;
  qty: number;
  fromMixPack: boolean;
};

export type PricedLine = PriceInput & {
  grossCents: number;
  teamShareCents: number;
};

export type TierRow = {
  bagTypeId: string;
  qty: number;
  priceCents: number;
  active: boolean;
};

export type BagRow = {
  bagTypeId: string;
  teamShareCents: number;
  active: boolean;
};

export function priceCart(
  items: PriceInput[],
  tiers: TierRow[],
  bags: BagRow[],
  minBags = 1,
): PricedLine[] {
  if (!items.length) throw new CartPricingError("Cart is empty");

  const lineNos = new Set<number>();
  for (const item of items) {
    if (
      !Number.isInteger(item.lineNo) ||
      !item.cpId ||
      !item.productId ||
      !item.bagTypeId ||
      !Number.isInteger(item.qty) ||
      item.qty <= 0
    ) {
      throw new CartPricingError(
        "Each cart line needs a unique line_no, cp_id, product_id, bag_type_id and qty > 0",
      );
    }
    if (lineNos.has(item.lineNo)) {
      throw new CartPricingError(
        "Each cart line needs a unique line_no, cp_id, product_id, bag_type_id and qty > 0",
      );
    }
    lineNos.add(item.lineNo);
  }

  const totalBags = items.reduce((sum, item) => sum + item.qty, 0);
  if (totalBags < minBags) {
    throw new CartPricingError(`Order needs at least ${minBags} bags (has ${totalBags})`);
  }

  const bagMap = new Map(bags.map((bag) => [bag.bagTypeId, bag]));
  const qtyByBag = new Map<string, number>();
  for (const item of items) {
    qtyByBag.set(item.bagTypeId, (qtyByBag.get(item.bagTypeId) ?? 0) + item.qty);
  }

  const grossByBag = new Map<string, number>();
  for (const [bagTypeId, qty] of qtyByBag) {
    const bag = bagMap.get(bagTypeId);
    if (!bag || !bag.active) {
      throw new CartPricingError(`Bag type ${bagTypeId} is not sellable`);
    }
    const activeTiers = tiers
      .filter((tier) => tier.bagTypeId === bagTypeId && tier.active)
      .sort((a, b) => b.qty - a.qty);
    let remaining = qty;
    let price = 0;
    for (const tier of activeTiers) {
      price += Math.floor(remaining / tier.qty) * tier.priceCents;
      remaining = remaining % tier.qty;
    }
    if (remaining !== 0) {
      throw new CartPricingError(`Bag type ${bagTypeId} has no active 1-bag tier`);
    }
    grossByBag.set(bagTypeId, price);
  }

  type Working = PriceInput & {
    btGross: number;
    btQty: number;
    floorCents: number;
    remCents: number;
  };

  const working: Working[] = items.map((item) => {
    const btQty = qtyByBag.get(item.bagTypeId)!;
    const btGross = grossByBag.get(item.bagTypeId)!;
    return {
      ...item,
      btQty,
      btGross,
      floorCents: Math.floor((btGross * item.qty) / btQty),
      remCents: (btGross * item.qty) % btQty,
    };
  });

  const extra = new Map<number, number>();
  const groups = new Map<string, Working[]>();
  for (const row of working) {
    const list = groups.get(row.bagTypeId) ?? [];
    list.push(row);
    groups.set(row.bagTypeId, list);
  }
  for (const rows of groups.values()) {
    const leftover = rows[0].btGross - rows.reduce((sum, row) => sum + row.floorCents, 0);
    const ranked = [...rows].sort((a, b) => b.remCents - a.remCents || a.lineNo - b.lineNo);
    ranked.forEach((row, index) => {
      extra.set(row.lineNo, index < leftover ? 1 : 0);
    });
  }

  return [...working]
    .sort((a, b) => a.lineNo - b.lineNo)
    .map((row) => ({
      lineNo: row.lineNo,
      cpId: row.cpId,
      productId: row.productId,
      bagTypeId: row.bagTypeId,
      qty: row.qty,
      fromMixPack: row.fromMixPack,
      grossCents: row.floorCents + (extra.get(row.lineNo) ?? 0),
      teamShareCents: row.qty * bagMap.get(row.bagTypeId)!.teamShareCents,
    }));
}

export function cartTotals(lines: PricedLine[]): { bags: number; grossCents: number; teamShareCents: number } {
  return lines.reduce(
    (totals, line) => ({
      bags: totals.bags + line.qty,
      grossCents: totals.grossCents + line.grossCents,
      teamShareCents: totals.teamShareCents + line.teamShareCents,
    }),
    { bags: 0, grossCents: 0, teamShareCents: 0 },
  );
}

/** First tap on a candy jumps to the platform default (order_default_qty). */
export function initialCandyQty(current: number, delta: number, defaultQty: number): number {
  if (delta > 0 && current <= 0) return Math.max(1, defaultQty);
  return Math.max(0, current + delta);
}

/** True only when an active tier covers more than one bag. Inactive ladder rows do not count. */
export function hasMultiBagTiers(tiers: TierRow[]): boolean {
  return tiers.some((tier) => tier.active && tier.qty > 1);
}

export function unitPriceCents(tiers: TierRow[], bagTypeId: string): number | null {
  const tier = tiers.find((row) => row.bagTypeId === bagTypeId && row.active && row.qty === 1);
  return tier ? tier.priceCents : null;
}
