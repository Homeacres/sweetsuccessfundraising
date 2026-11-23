import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

describe("anon catalog access", () => {
  it("lets the anon key read active bag types and products, and refuses writes", async () => {
    expect(url, "SUPABASE_URL").toBeTruthy();
    expect(anonKey, "SUPABASE_ANON_KEY").toBeTruthy();
    const db = createClient(url!, anonKey!, { auth: { persistSession: false } });

    const bags = await db.from("bag_types").select("bag_type_id, is_active");
    expect(bags.error).toBeNull();
    expect(bags.data?.length).toBeGreaterThan(0);
    expect(bags.data?.every((row) => row.is_active)).toBe(true);

    const products = await db.from("products").select("product_id, is_active");
    expect(products.error).toBeNull();
    expect(products.data?.length).toBeGreaterThan(0);
    expect(products.data?.every((row) => row.is_active)).toBe(true);

    const insertBag = await db.from("bag_types").insert({ code: "ZZZTEST", name: "Not allowed" });
    expect(insertBag.error).not.toBeNull();
    const insertProduct = await db.from("products").insert({ name: "Not allowed" });
    expect(insertProduct.error).not.toBeNull();
    const updateProduct = await db.from("products").update({ name: "Not allowed" }).eq("is_active", true);
    expect(updateProduct.error).not.toBeNull();
    const deleteBag = await db.from("bag_types").delete().eq("code", "standard");
    expect(deleteBag.error).not.toBeNull();
  });
});
