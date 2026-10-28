import { describe, expect, it } from "vitest";
import { mixPackBagCount, mixPackLines, normalizeCartLines } from "@/lib/cart";
import {
  cartTotals,
  hasMultiBagTiers,
  initialCandyQty,
  priceCart,
  unitPriceCents,
  type BagRow,
  type TierRow,
} from "@/lib/pricing";

const standard = "standard";
const premium = "premium";

const pilotTiers: TierRow[] = [
  { bagTypeId: standard, qty: 1, priceCents: 1200, active: true },
  { bagTypeId: standard, qty: 3, priceCents: 3500, active: false },
  { bagTypeId: standard, qty: 5, priceCents: 5700, active: false },
  { bagTypeId: standard, qty: 7, priceCents: 7900, active: false },
  { bagTypeId: standard, qty: 10, priceCents: 11000, active: false },
  { bagTypeId: premium, qty: 1, priceCents: 1400, active: true },
];

const bags: BagRow[] = [
  { bagTypeId: standard, teamShareCents: 500, active: true },
  { bagTypeId: premium, teamShareCents: 600, active: true },
];

function bag(qty: number, bagTypeId = standard, lineNo = 1) {
  return {
    lineNo,
    cpId: "player",
    productId: "skittles",
    bagTypeId,
    qty,
    fromMixPack: false,
  };
}

describe("pilot per-bag prices", () => {
  it("charges $12 a standard bag and $5 to the team, with inactive ladder rows ignored", () => {
    for (const qty of [1, 2, 3, 10]) {
      const totals = cartTotals(priceCart([bag(qty)], pilotTiers, bags));
      expect(totals.grossCents).toBe(qty * 1200);
      expect(totals.teamShareCents).toBe(qty * 500);
    }
    expect(hasMultiBagTiers(pilotTiers)).toBe(false);
    expect(unitPriceCents(pilotTiers, standard)).toBe(1200);
    expect(unitPriceCents(pilotTiers, premium)).toBe(1400);
  });

  it("charges $14 a premium bag and $6 to the team", () => {
    const totals = cartTotals(priceCart([bag(2, premium)], pilotTiers, bags));
    expect(totals.grossCents).toBe(2800);
    expect(totals.teamShareCents).toBe(1200);
  });

  it("prices a mix pack as one bag of each candy at the single-bag price", () => {
    expect(mixPackBagCount(3)).toBe(3);
    const lines = normalizeCartLines(mixPackLines("ava", ["skittles", "jolly", "bears"], standard, 1));
    expect(lines).toHaveLength(3);
    expect(lines.every((line) => line.fromMixPack && line.qty === 1)).toBe(true);
    const totals = cartTotals(priceCart(lines, pilotTiers, bags));
    expect(totals.bags).toBe(3);
    expect(totals.grossCents).toBe(3600);
    expect(totals.teamShareCents).toBe(1500);
  });

  it("prices standard and premium in the same cart separately", () => {
    const totals = cartTotals(
      priceCart([bag(2, standard, 1), bag(1, premium, 2)], pilotTiers, bags),
    );
    expect(totals.grossCents).toBe(2400 + 1400);
    expect(totals.teamShareCents).toBe(1000 + 600);
  });

  it("starts a candy at the default quantity, then steps by one", () => {
    expect(initialCandyQty(0, 1, 3)).toBe(3);
    expect(initialCandyQty(3, 1, 3)).toBe(4);
    expect(initialCandyQty(3, -1, 3)).toBe(2);
    expect(initialCandyQty(1, -1, 3)).toBe(0);
  });
});

describe("bundle tiers if they are reactivated", () => {
  const ladder: TierRow[] = [
    { bagTypeId: standard, qty: 1, priceCents: 1200, active: true },
    { bagTypeId: standard, qty: 3, priceCents: 3500, active: true },
    { bagTypeId: standard, qty: 5, priceCents: 5700, active: true },
    { bagTypeId: standard, qty: 7, priceCents: 7900, active: true },
    { bagTypeId: standard, qty: 10, priceCents: 11000, active: true },
  ];

  it("uses the largest active tier first", () => {
    expect(hasMultiBagTiers(ladder)).toBe(true);
    expect(cartTotals(priceCart([bag(3)], ladder, bags)).grossCents).toBe(3500);
    expect(cartTotals(priceCart([bag(4)], ladder, bags)).grossCents).toBe(3500 + 1200);
    expect(cartTotals(priceCart([bag(10)], ladder, bags)).grossCents).toBe(11000);
    expect(cartTotals(priceCart([bag(13)], ladder, bags)).grossCents).toBe(11000 + 3500);
  });

  it("splits leftover cents to the largest remainders, then the lowest line number", () => {
    const lines = priceCart(
      [
        { ...bag(1, standard, 1), productId: "a" },
        { ...bag(1, standard, 2), productId: "b" },
        { ...bag(1, standard, 3), productId: "c" },
      ],
      ladder,
      bags,
    );
    expect(lines.map((line) => line.grossCents)).toEqual([1167, 1167, 1166]);
    expect(lines.reduce((sum, line) => sum + line.grossCents, 0)).toBe(3500);
    expect(lines.every((line) => line.teamShareCents === 500)).toBe(true);
  });
});

describe("cart guards", () => {
  it("rejects an empty cart and a missing one-bag tier", () => {
    expect(() => priceCart([], pilotTiers, bags)).toThrow(/empty/i);
    expect(() => priceCart([bag(1)], [{ bagTypeId: standard, qty: 3, priceCents: 3500, active: true }], bags)).toThrow(/1-bag/);
    expect(() => priceCart([bag(1)], pilotTiers, bags, 3)).toThrow(/at least 3/);
  });
});
