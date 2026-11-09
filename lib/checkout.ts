import { bundlePickError, type BundlePick } from "@/lib/bundles";
import { shopBundles } from "@/lib/catalog";
import { splitBundleCents } from "@/lib/bundles";
import { todayInEdmonton } from "@/lib/dates";
import { appUrl } from "@/lib/env";
import { shopPhase } from "@/lib/launch";
import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { normalizeCartLines, type IncomingLine } from "@/lib/cart";
import { CartPricingError } from "@/lib/pricing";
import { sportThemedName, stripeCheckoutProduct } from "@/lib/public-names";
import { cleanText, isEmail } from "@/lib/text";

export type CheckoutResult = { ok: true; url: string } | { ok: false; error: string; status: number };

type PricedRow = {
  line_no: number;
  cp_id: string;
  product_id: string;
  bag_type_id: string;
  qty: number;
  from_mix_pack: boolean;
  gross_cents: number;
  team_share_cents: number;
  bundle_offer_id: string | null;
  bundle_label: string | null;
};

type IncomingBundle = {
  offerId?: string;
  cpId?: string;
  picks?: BundlePick[];
};

export async function createCheckout(body: unknown): Promise<CheckoutResult> {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing order.", status: 400 };
  const raw = body as Record<string, unknown>;
  const teamSlug = cleanText(raw.teamSlug, 60);
  const buyerName = cleanText(raw.buyerName, 200);
  const buyerEmail = cleanText(raw.buyerEmail, 254).toLowerCase();
  const buyerPhone = cleanText(raw.buyerPhone, 40);
  const entryCpId = cleanText(raw.entryCpId, 80);
  if (!teamSlug) return { ok: false, error: "Missing team.", status: 400 };
  if (!buyerName) return { ok: false, error: "Enter the buyer's name.", status: 400 };
  if (!isEmail(buyerEmail)) return { ok: false, error: "Enter a valid email address.", status: 400 };
  const incomingLines = Array.isArray(raw.lines) ? (raw.lines as IncomingLine[]) : [];
  const incomingBundle = raw.bundle && typeof raw.bundle === "object" ? (raw.bundle as IncomingBundle) : null;
  if (!incomingLines.length && !incomingBundle?.offerId) return { ok: false, error: "Your cart is empty.", status: 400 };

  let normalized: ReturnType<typeof normalizeCartLines> = [];
  if (incomingLines.length) {
    try {
      normalized = normalizeCartLines(incomingLines);
    } catch (error) {
      if (error instanceof CartPricingError) return { ok: false, error: error.message, status: 400 };
      throw error;
    }
  }

  const db = supabaseAdmin();
  const { data: campaign, error: campaignError } = await db
    .from("campaigns")
    .select("campaign_id, campaign_name, status, team_slug, start_date, end_date")
    .eq("team_slug", teamSlug)
    .maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign) return { ok: false, error: "That team fundraiser was not found.", status: 404 };
  if (campaign.status !== "active") {
    return { ok: false, error: "This fundraiser is not taking orders right now.", status: 400 };
  }
  const phase = shopPhase(campaign.start_date, campaign.end_date, todayInEdmonton());
  if (phase === "before" || phase === "after") {
    return { ok: false, error: phase === "before" ? "This fundraiser has not started." : "This fundraiser is closed.", status: 400 };
  }

  const bundleCpId = incomingBundle?.cpId ? cleanText(incomingBundle.cpId, 80) : "";
  if (incomingBundle?.offerId && !bundleCpId) return { ok: false, error: "Choose who the pack is for.", status: 400 };
  const cpIds = [...new Set([...normalized.map((line) => line.cpId), ...(bundleCpId ? [bundleCpId] : [])])];
  const { data: roster, error: rosterError } = await db
    .from("campaign_participants")
    .select("cp_id, family_id")
    .eq("campaign_id", campaign.campaign_id)
    .in("cp_id", cpIds);
  if (rosterError) throw rosterError;
  if (!roster || roster.length !== cpIds.length) {
    return { ok: false, error: "One of those participants is not on this team.", status: 400 };
  }

  const bundlePicks = (incomingBundle?.picks ?? []).map((pick) => ({
    productId: cleanText(pick?.productId, 80),
    bagTypeId: cleanText(pick?.bagTypeId, 80),
    qty: Number(pick?.qty),
  }));
  const productIds = [...new Set([...normalized.map((line) => line.productId), ...bundlePicks.map((pick) => pick.productId)].filter(Boolean))];
  const bagIds = [...new Set([...normalized.map((line) => line.bagTypeId), ...bundlePicks.map((pick) => pick.bagTypeId)].filter(Boolean))];
  const [productsRes, bagsRes] = await Promise.all([
    db.from("products").select("product_id").eq("is_active", true).in("product_id", productIds),
    db.from("bag_types").select("bag_type_id").eq("is_active", true).in("bag_type_id", bagIds),
  ]);
  if (productsRes.error) throw productsRes.error;
  if (bagsRes.error) throw bagsRes.error;
  if ((productsRes.data ?? []).length !== productIds.length || (bagsRes.data ?? []).length !== bagIds.length) {
    return { ok: false, error: "One of those candies is no longer for sale.", status: 400 };
  }

  const singleRows: PricedRow[] = [];
  if (normalized.length) {
    const payload = normalized.map((line) => ({
      line_no: line.lineNo,
      cp_id: line.cpId,
      product_id: line.productId,
      bag_type_id: line.bagTypeId,
      qty: line.qty,
      from_mix_pack: line.fromMixPack,
    }));
    const { data: priced, error: priceError } = await db.rpc("fn_price_cart", { p_items: payload });
    if (priceError) {
      const message = priceError.message || "Could not price this order.";
      const safe = /bag|cart|order needs/i.test(message) ? message : "Could not price this order.";
      return { ok: false, error: safe, status: 400 };
    }
    for (const row of (priced ?? []) as Omit<PricedRow, "bundle_offer_id" | "bundle_label">[]) {
      singleRows.push({ ...row, bundle_offer_id: null, bundle_label: null });
    }
    if (!singleRows.length) return { ok: false, error: "Could not price this order.", status: 400 };
  }

  const bundleRows: PricedRow[] = [];
  let bundleStripe: { label: string; priceCents: number; bagCount: number } | null = null;
  if (incomingBundle?.offerId) {
    const offer = (await shopBundles()).find((item) => item.offerId === incomingBundle.offerId);
    if (!offer) return { ok: false, error: "That pack is not for sale.", status: 400 };
    if (!bundleCpId) return { ok: false, error: "Choose who the pack is for.", status: 400 };
    const activeProducts = new Set((productsRes.data ?? []).map((row) => row.product_id));
    const pickError = bundlePickError({
      bagCount: offer.bagCount,
      standardBagTypeId: offer.bagTypeId,
      picks: bundlePicks,
      activeProductIds: activeProducts,
    });
    if (pickError) return { ok: false, error: pickError, status: 400 };
    const grossShares = splitBundleCents(offer.priceCents, bundlePicks.map((pick) => pick.qty));
    const shareShares = splitBundleCents(offer.teamShareCents, bundlePicks.map((pick) => pick.qty));
    bundlePicks.forEach((pick, index) => {
      bundleRows.push({
        line_no: 0,
        cp_id: bundleCpId,
        product_id: pick.productId,
        bag_type_id: offer.bagTypeId,
        qty: pick.qty,
        from_mix_pack: false,
        gross_cents: grossShares[index],
        team_share_cents: shareShares[index],
        bundle_offer_id: offer.offerId,
        bundle_label: offer.label,
      });
    });
    bundleStripe = { label: offer.label, priceCents: offer.priceCents, bagCount: offer.bagCount };
  }

  const rows = [...bundleRows, ...singleRows].map((row, index) => ({ ...row, line_no: index + 1 }));
  if (!rows.length) return { ok: false, error: "Could not price this order.", status: 400 };

  const totalBags = rows.reduce((sum, row) => sum + row.qty, 0);
  const totalCents = rows.reduce((sum, row) => sum + row.gross_cents, 0);
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    return { ok: false, error: "Could not price this order.", status: 400 };
  }

  const anchorId =
    entryCpId && rows.some((row) => row.cp_id === entryCpId) ? entryCpId : [...rows].sort((a, b) => a.line_no - b.line_no)[0].cp_id;
  const familyId = roster.find((player) => player.cp_id === anchorId)?.family_id;
  if (!familyId) return { ok: false, error: "One of those participants is not on this team.", status: 400 };

  const nameByProduct = new Map<string, string>();
  const { data: campaignRow } = await db.from("campaigns").select("sport").eq("campaign_id", campaign.campaign_id).maybeSingle();
  const { data: sport } = campaignRow?.sport
    ? await db.from("sports").select("sport_id").eq("sport_name", campaignRow.sport).maybeSingle()
    : { data: null };
  if (sport?.sport_id) {
    const { data: names } = await db
      .from("sport_product_names")
      .select("product_id, display_name")
      .eq("sport_id", sport.sport_id)
      .in("product_id", productIds);
    for (const name of names ?? []) nameByProduct.set(name.product_id, name.display_name);
  }

  const snapshot = [...rows]
    .sort((a, b) => a.line_no - b.line_no)
    .map((row) => ({
      line_no: row.line_no,
      cp_id: row.cp_id,
      product_id: row.product_id,
      bag_type_id: row.bag_type_id,
      qty: row.qty,
      gross_cents: row.gross_cents,
      team_share_cents: row.team_share_cents,
      from_mix_pack: row.from_mix_pack,
      bundle_offer_id: row.bundle_offer_id,
      bundle_label: row.bundle_label,
      display_name: sportThemedName(nameByProduct.get(row.product_id)),
    }));

  const { data: order, error: orderError } = await db
    .from("orders")
    .insert({
      campaign_id: campaign.campaign_id,
      family_id: familyId,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      buyer_phone: buyerPhone || null,
      line_items: snapshot,
      total_bags: totalBags,
      total_cad: totalCents,
      payment_status: "pending",
      fulfillment_status: "pending",
    })
    .select("order_id")
    .single();
  if (orderError) throw orderError;

  const orderId = order.order_id as string;
  const { error: lineError } = await db.from("order_lines").insert(
    snapshot.map((row) => ({
      order_id: orderId,
      line_no: row.line_no,
      cp_id: row.cp_id,
      product_id: row.product_id,
      bag_type_id: row.bag_type_id,
      qty: row.qty,
      gross_cents: row.gross_cents,
      team_share_cents: row.team_share_cents,
      from_mix_pack: row.from_mix_pack,
      bundle_offer_id: row.bundle_offer_id,
    })),
  );
  if (lineError) {
    await db.from("orders").delete().eq("order_id", orderId);
    return { ok: false, error: "Could not save this order. Check the participants and try again.", status: 400 };
  }

  const origin = appUrl();
  const stripe = getStripe();
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: buyerEmail,
      client_reference_id: orderId,
      metadata: { order_id: orderId, campaign_id: campaign.campaign_id },
      payment_intent_data: { metadata: { order_id: orderId } },
      line_items: [
        ...(bundleStripe
          ? [{
              quantity: 1,
              price_data: {
                currency: "cad",
                unit_amount: bundleStripe.priceCents,
                product_data: {
                  name: `${campaign.campaign_name} · ${bundleStripe.label}`,
                  description: `${bundleStripe.bagCount} standard bags. Bulk delivery to the organizer.`,
                },
              },
            }]
          : []),
        ...(singleRows.length
          ? [{
              quantity: 1,
              price_data: {
                currency: "cad",
                unit_amount: singleRows.reduce((sum, row) => sum + row.gross_cents, 0),
                product_data: stripeCheckoutProduct({
                  campaignName: campaign.campaign_name,
                  totalBags: singleRows.reduce((sum, row) => sum + row.qty, 0),
                }),
              },
            }]
          : []),
      ],
      success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout/cancelled`,
    });
  } catch (error) {
    await db.from("orders").delete().eq("order_id", orderId);
    console.error("stripe session failed", error instanceof Error ? error.message : "error");
    return { ok: false, error: "Payment could not be started. Nothing was charged.", status: 502 };
  }

  if (!session.url || !session.id) {
    await db.from("orders").delete().eq("order_id", orderId);
    return { ok: false, error: "Payment could not be started. Nothing was charged.", status: 502 };
  }

  const { error: sessionError } = await db
    .from("orders")
    .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .eq("payment_status", "pending");
  if (sessionError) {
    await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
    await db.from("orders").delete().eq("order_id", orderId);
    throw sessionError;
  }

  return { ok: true, url: session.url };
}
