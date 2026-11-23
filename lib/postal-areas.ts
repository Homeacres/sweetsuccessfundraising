import type { PostalArea } from "@/lib/area";
import { supabaseAdmin } from "@/lib/supabase/admin";

const TTL_MS = 60_000;
let cache: { at: number; rows: PostalArea[] } | null = null;

export function clearPostalAreaCache(): void {
  cache = null;
}

export async function loadPostalAreas(): Promise<PostalArea[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const { data, error } = await supabaseAdmin().from("postal_areas").select("prefix, country, is_active");
  if (error) throw error;
  const rows: PostalArea[] = (data ?? []).flatMap((row) => {
    if ((row.country !== "CA" && row.country !== "US") || typeof row.prefix !== "string") return [];
    return [{ prefix: row.prefix, country: row.country, isActive: Boolean(row.is_active) }];
  });
  cache = { at: Date.now(), rows };
  return rows;
}
