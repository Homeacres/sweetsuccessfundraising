import { appUrl } from "@/lib/env";
import { rowIsTest } from "@/lib/live-sale";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type RemitResult = { ok: true; url: string } | { ok: false; error: string; status: number };

type Opened = {
  remittance_id?: string;
  amount_cents?: number;
  amount_changed?: boolean;
  reused?: boolean;
  stripe_checkout_session_id?: string | null;
  campaign_id?: string;
};

/** One card checkout for the cash this parent has collected. Reuses an open pending remittance. */
export async function startRemittance(parentToken: string): Promise<RemitResult> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc("fn_open_cash_remittance", { p_token: parentToken, p_method: "card" });
  if (error) {
    const message = /no collected cash/i.test(error.message) ? "There is no collected cash due right now." : "Link not valid.";
    return { ok: false, error: message, status: /no collected cash/i.test(error.message) ? 400 : 404 };
  }
  const opened = (data ?? {}) as Opened;
  if (!opened.remittance_id || !opened.amount_cents) {
    return { ok: false, error: "There is no collected cash due right now.", status: 400 };
  }

  const { data: campaign } = await db.from("campaigns").select("campaign_name").eq("campaign_id", opened.campaign_id || "").maybeSingle();
  const team = campaign?.campaign_name || "the team";
  const stripe = getStripe();
  const existingId = opened.stripe_checkout_session_id || null;
  if (opened.reused && !opened.amount_changed && existingId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(existingId);
      if (existing.status === "open" && existing.url) return { ok: true, url: existing.url };
    } catch {
      // The stored session cannot be reused. A new one is created below.
    }
  }

  if (existingId) {
    await db
      .from("parent_remittances")
      .update({ stripe_checkout_session_id: null, updated_at: new Date().toISOString() })
      .eq("remittance_id", opened.remittance_id)
      .eq("status", "pending");
    await stripe.checkout.sessions.expire(existingId).catch(() => undefined);
  }

  const origin = appUrl();
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: opened.remittance_id,
      metadata: { kind: "parent_remittance", remittance_id: opened.remittance_id },
      payment_intent_data: {
        metadata: { kind: "parent_remittance", remittance_id: opened.remittance_id },
      },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "cad",
          unit_amount: opened.amount_cents,
          product_data: {
            name: `Cash collected for ${team}`,
            description: "Parent remittance to Sweet Success. Stripe test checkout.",
          },
        },
      }],
      success_url: `${origin}/p/ledger/${parentToken}/remit/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/p/ledger/${parentToken}`,
    });
  } catch (err) {
    console.error("remittance session failed", err instanceof Error ? err.message : "error");
    return { ok: false, error: "Payment could not be started. Nothing was charged.", status: 502 };
  }
  if (!session.id || !session.url) {
    return { ok: false, error: "Payment could not be started. Nothing was charged.", status: 502 };
  }

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (paymentIntentId) {
    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: {
        kind: "parent_remittance",
        remittance_id: opened.remittance_id,
        checkout_session_id: session.id,
      },
    }).catch(() => undefined);
  }

  const { data: saved, error: saveError } = await db
    .from("parent_remittances")
    .update({
      stripe_checkout_session_id: session.id,
      is_test: rowIsTest(),
      updated_at: new Date().toISOString(),
    })
    .eq("remittance_id", opened.remittance_id)
    .eq("status", "pending")
    .select("remittance_id");
  if (saveError || !saved?.length) {
    await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
    return { ok: false, error: "Payment could not be started. Nothing was charged.", status: 502 };
  }
  return { ok: true, url: session.url };
}
