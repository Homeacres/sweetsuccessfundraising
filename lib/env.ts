export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value.trim();
}

export function supabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function appUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || "http://localhost:3000";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw.replace(/\/$/, "");
  }
  return `https://${raw}`.replace(/\/$/, "");
}

export function assertStripeTestKey(key: string): void {
  if (!key.startsWith("sk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a Stripe test key (sk_test_). Live charges are disabled in the pilot.");
  }
}
