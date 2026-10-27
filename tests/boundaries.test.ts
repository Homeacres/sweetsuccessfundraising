import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === ".next") return [];
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

describe("pilot boundaries", () => {
  it("keeps the service role and price function off the client", () => {
    const files = [...walk("app"), ...walk("components")];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("use client")) continue;
      expect(source, file).not.toContain("SUPABASE_SERVICE_ROLE");
      expect(source, file).not.toContain("supabaseAdmin");
      expect(source, file).not.toContain("STRIPE_SECRET_KEY");
      expect(source, file).not.toContain("fn_price_cart");
    }
  });

  it("charges checkout from fn_price_cart, not the display preview", () => {
    const source = readFileSync("lib/checkout.ts", "utf8");
    expect(source).toContain("fn_price_cart");
    expect(source).not.toContain("priceCart(");
  });

  it("does not advertise bundle savings, and only draws a ladder when multi-bag tiers are active", () => {
    const shop = readFileSync("components/Shop.tsx", "utf8");
    const home = readFileSync("app/page.tsx", "utf8");
    const combined = `${shop}\n${home}`.toLowerCase();
    expect(combined).not.toContain("save with");
    expect(combined).not.toContain("best value");
    expect(combined).not.toContain("max savings");
    expect(combined).not.toContain("bundle");
    expect(shop).toContain("hasMultiBagTiers");
  });

  it("leaves the organizer consent box unchecked", () => {
    const source = readFileSync("components/ApplyForm.tsx", "utf8");
    expect(source).toContain("useState(false)");
    expect(source).not.toContain("defaultChecked");
    expect(source).toContain('name="consent"');
  });
});
