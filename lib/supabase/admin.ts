import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requiredEnv } from "@/lib/env";

let client: SupabaseClient | null = null;

/** Service-role client. Server only. Bypasses RLS. */
export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  client = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
