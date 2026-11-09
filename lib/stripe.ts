import Stripe from "stripe";
import { assertStripeTestKey, requiredEnv } from "@/lib/env";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripe) return stripe;
  const key = requiredEnv("STRIPE_SECRET_KEY");
  assertStripeTestKey(key);
  stripe = new Stripe(key, { typescript: true });
  return stripe;
}
