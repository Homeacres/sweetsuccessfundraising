import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applicationApplicantEmail, milestoneEmail, receiptEmail } from "@/lib/email/copy";
import { bagEstimate } from "@/lib/estimate";
import {
  cartCandyLine,
  publicCatalogProduct,
  receiptCandyName,
  stripeCheckoutProduct,
} from "@/lib/public-names";

const SOURCE_NAMES = ["Skittles", "Jolly Ranchers", "Mini gummy bears"] as const;

/** sport_product_names.display_name values that contain Gummies. Descriptive copy is still flagged. */
const ALLOWED_THEMED_NAMES = ["Golden Boot Gummies", "Grand Slam Gummies"];

function walkSources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "admin") return [];
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walkSources(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

function stripThemedNames(text: string): string {
  let out = text;
  for (const name of [...ALLOWED_THEMED_NAMES].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  }
  return out;
}

/** Source-brand words in descriptive copy. Sport-themed names that include Gummies are removed first. */
export function descriptiveBrandHits(text: string): string[] {
  const scrubbed = stripThemedNames(text);
  const hits: string[] = [];
  if (/\bskittles\b/i.test(scrubbed)) hits.push("Skittles");
  if (/\bjolly\s+ranchers?\b/i.test(scrubbed)) hits.push("Jolly Rancher(s)");
  if (/\bmini\s+gummy\s+bears\b/i.test(scrubbed)) hits.push("Mini gummy bears");
  if (/\bgummies\b/i.test(scrubbed)) hits.push("gummies");
  if (/\bgummy\b/i.test(scrubbed)) hits.push("gummy");
  return hits;
}

const CUSTOMER_SOURCE_ROOTS = ["app", "components", "lib/email"];

const CUSTOMER_FILES = [
  "components/Shop.tsx",
  "components/CampaignShop.tsx",
  "components/ApplyForm.tsx",
  "components/Header.tsx",
  "components/Footer.tsx",
  "app/page.tsx",
  "app/layout.tsx",
  "app/checkout/success/page.tsx",
  "app/checkout/cancelled/page.tsx",
  "app/l/[parentToken]/page.tsx",
  "app/unsubscribe/[parentToken]/page.tsx",
  "app/privacy/page.tsx",
  "app/t/[teamSlug]/page.tsx",
  "app/t/[teamSlug]/[playerSlug]/page.tsx",
  "lib/catalog.ts",
  "lib/checkout.ts",
  "lib/fulfill.ts",
  "lib/email/copy.ts",
  "lib/public-names.ts",
  "lib/milestones-run.ts",
];

function joinedCustomerOutput(): string {
  const products = SOURCE_NAMES.map((name, index) =>
    publicCatalogProduct(
      { product_id: `p${index}`, name, description: null },
      ["Celly Crunches", "Snipe Snacks", "Barn Burner Bites"][index],
    ),
  );
  const missing = publicCatalogProduct({ product_id: "missing", name: "Skittles", description: "chewy" }, null);
  const stripe = stripeCheckoutProduct({ campaignName: "Hawks", totalBags: 3 });
  const receipt = receiptEmail({
    buyerName: "Pat",
    team: "Hawks",
    totalCents: 3600,
    bags: 3,
    lines: [
      ...products.map((product) => ({
        player: "Sam",
        candy: receiptCandyName(product.displayName),
        qty: 1,
        grossCents: 1200,
        mix: false,
      })),
      { player: "Sam", candy: receiptCandyName(missing.displayName), qty: 1, grossCents: 1200, mix: true },
    ],
  });
  const milestone = milestoneEmail({
    kind: "days_left",
    team: "Hawks",
    parentFirst: "Pat",
    token: "token",
    players: [{ first: "Sam", last: "Lee", hideLastName: false, bags: 3, teamCents: 1500 }],
    endDate: "2026-11-15",
  });
  const cart = [
    ...products.map((product) => cartCandyLine(product.displayName, "Standard bag", 3, false)),
    cartCandyLine(missing.displayName, "Standard bag", 3, false),
  ];
  return JSON.stringify({ products, missing, stripe, receipt, milestone, cart });
}

describe("customer-facing product names", () => {
  it("never puts products.name into shop, cart, Stripe, receipt, or email copy", () => {
    const output = joinedCustomerOutput();
    for (const name of SOURCE_NAMES) {
      expect(output, name).not.toContain(name);
    }
    expect(output).toContain("Celly Crunches");
    expect(output).toContain("Freeze-dried candy");
    expect(output).toContain("Standard bag × 3");
    expect(output).not.toContain("Flavour");
  });

  it("leaves a missing sport name off the shop title and cart, and off the Stripe line", () => {
    const missing = publicCatalogProduct({ product_id: "missing", name: "Jolly Ranchers", description: null }, "  ");
    expect(missing.displayName).toBeNull();
    expect(JSON.stringify(missing)).not.toContain("Jolly Ranchers");
    expect(cartCandyLine(null, "Premium bag", 1, false)).toBe("Premium bag × 1");
    const stripe = stripeCheckoutProduct({ campaignName: "Hawks", totalBags: 1 });
    expect(stripe).toEqual({
      name: "Hawks fundraiser",
      description: "1 freeze-dried candy bag. Bulk delivery to the team organizer.",
    });
    expect(receiptCandyName(null)).toBe("Freeze-dried candy");
    expect(receiptCandyName("Free Pass Crunches")).toBe("Free Pass Crunches");
  });

  it("does not mention source brands in customer-facing source files", () => {
    for (const file of CUSTOMER_FILES) {
      const source = readFileSync(path.join(file), "utf8");
      expect(source, file).not.toContain("baseName");
      for (const name of SOURCE_NAMES) {
        expect(source, `${file} contains ${name}`).not.toContain(name);
      }
    }
    const catalog = readFileSync("lib/catalog.ts", "utf8");
    expect(catalog).not.toContain("product.name");
    const shop = readFileSync("components/Shop.tsx", "utf8");
    expect(shop).toContain("cartCandyLine");
    expect(shop).not.toContain("baseName");
  });

  it("flags source-brand words in landing copy and emails, and allows themed Gummies names", () => {
    expect(descriptiveBrandHits("Freeze-dried gummy bears with a snap")).toEqual(["gummy"]);
    expect(descriptiveBrandHits("A bag of Skittles")).toEqual(["Skittles"]);
    expect(descriptiveBrandHits("Jolly Rancher pieces")).toEqual(["Jolly Rancher(s)"]);
    expect(descriptiveBrandHits("Jolly Ranchers")).toEqual(["Jolly Rancher(s)"]);
    expect(descriptiveBrandHits("Mini gummy bears")).toEqual(["Mini gummy bears", "gummy"]);
    expect(descriptiveBrandHits("Golden Boot Gummies")).toEqual([]);
    expect(descriptiveBrandHits("Grand Slam Gummies and a standard bag")).toEqual([]);
    expect(descriptiveBrandHits("Try Golden Boot Gummies, the freeze-dried gummies")).toEqual(["gummies"]);

    const files = CUSTOMER_SOURCE_ROOTS.flatMap((dir) => walkSources(dir));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const hits = descriptiveBrandHits(readFileSync(file, "utf8"));
      expect(hits, file).toEqual([]);
    }

    const receipt = receiptEmail({
      buyerName: "Pat",
      team: "Hawks",
      totalCents: 2400,
      bags: 2,
      lines: [
        { player: "Sam", candy: "Golden Boot Gummies", qty: 1, grossCents: 1200, mix: false },
        { player: "Sam", candy: "Grand Slam Gummies", qty: 1, grossCents: 1200, mix: false },
      ],
    });
    expect(descriptiveBrandHits(`${receipt.subject}\n${receipt.text}\n${receipt.html}`)).toEqual([]);

    const milestone = milestoneEmail({
      kind: "start",
      team: "Hawks",
      parentFirst: "Pat",
      token: "token",
      players: [{ first: "Sam", last: "Lee", hideLastName: false, bags: 1, teamCents: 500 }],
      endDate: "2026-11-15",
    });
    expect(descriptiveBrandHits(`${milestone.subject}\n${milestone.text}\n${milestone.html}`)).toEqual([]);

    const applySummary = bagEstimate(2000, 20);
    expect(applySummary).not.toBeNull();
    const applyMail = applicationApplicantEmail({ firstName: "Pat", team: "Hawks", summary: applySummary! });
    expect(descriptiveBrandHits(`${applyMail.subject}\n${applyMail.text}\n${applyMail.html}`)).toEqual([]);
    expect(descriptiveBrandHits(readFileSync("lib/estimate.ts", "utf8"))).toEqual([]);
  });
});
