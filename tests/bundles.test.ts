import { describe, expect, it } from "vitest";
import { bundlePickError, splitBundleCents, visibleBundleOffers, type BundleOffer } from "@/lib/bundles";

const TIERS = [
  { label: "Mix Pack", bags: 3, price: 3600, share: 1500 },
  { label: "5-Pack", bags: 5, price: 5900, share: 2500 },
  { label: "7-Pack", bags: 7, price: 8300, share: 3500 },
  { label: "10-Pack", bags: 10, price: 11800, share: 5000 },
];

describe("bundle cent split", () => {
  it("sums exactly to the price and the team share for every tier and mix", () => {
    const mixes: Record<number, number[][]> = {
      3: [[1, 1, 1], [3], [2, 1]],
      5: [[1, 1, 1, 1, 1], [5], [3, 2]],
      7: [[3, 2, 2], [1, 1, 1, 1, 1, 1, 1], [7], [4, 3]],
      10: [[4, 3, 3], [10], [2, 2, 2, 2, 2]],
    };
    for (const tier of TIERS) {
      for (const mix of mixes[tier.bags]) {
        const price = splitBundleCents(tier.price, mix);
        const share = splitBundleCents(tier.share, mix);
        expect(price.reduce((sum, part) => sum + part, 0), `${tier.label} price ${mix}`).toBe(tier.price);
        expect(share.reduce((sum, part) => sum + part, 0), `${tier.label} share ${mix}`).toBe(tier.share);
        expect(price.every((part) => part >= 0)).toBe(true);
      }
    }
  });

  it("puts a leftover cent on the first line", () => {
    const parts = splitBundleCents(8300, [3, 2, 2]);
    expect(parts[0]).toBeGreaterThan(Math.floor((8300 * 3) / 7) - 1);
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(8300);
  });
});

describe("bundle picks", () => {
  const active = new Set(["a", "b", "c"]);
  it("rejects a premium bag and the wrong bag count", () => {
    expect(bundlePickError({
      bagCount: 7,
      standardBagTypeId: "standard",
      activeProductIds: active,
      picks: [{ productId: "a", bagTypeId: "premium", qty: 7 }],
    })).toMatch(/Premium/);
    expect(bundlePickError({
      bagCount: 7,
      standardBagTypeId: "standard",
      activeProductIds: active,
      picks: [{ productId: "a", bagTypeId: "standard", qty: 6 }],
    })).toMatch(/exactly 7/);
    expect(bundlePickError({
      bagCount: 7,
      standardBagTypeId: "standard",
      activeProductIds: active,
      picks: [
        { productId: "a", bagTypeId: "standard", qty: 3 },
        { productId: "b", bagTypeId: "standard", qty: 2 },
        { productId: "c", bagTypeId: "standard", qty: 2 },
      ],
    })).toBeNull();
  });
});

describe("which bundles a shop may show", () => {
  const offers: BundleOffer[] = [
    { offerId: "1", label: "7-Pack", description: null, bagCount: 7, bagTypeId: "s", priceCents: 8300, teamShareCents: 3500, isActive: true, isTest: true, sortOrder: 30 },
    { offerId: "2", label: "Live", description: null, bagCount: 3, bagTypeId: "s", priceCents: 3600, teamShareCents: 1500, isActive: true, isTest: false, sortOrder: 10 },
    { offerId: "3", label: "Off", description: null, bagCount: 5, bagTypeId: "s", priceCents: 5900, teamShareCents: 2500, isActive: false, isTest: false, sortOrder: 20 },
  ];
  it("shows test tiers on preview and hides them in production", () => {
    expect(visibleBundleOffers(offers, { VERCEL_ENV: "preview" }).map((offer) => offer.label)).toEqual(["Live", "7-Pack"]);
    expect(visibleBundleOffers(offers, { VERCEL_ENV: "production" }).map((offer) => offer.label)).toEqual(["Live"]);
  });
});
