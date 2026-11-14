import { buyerContactError, isNorthAmericanPhone, type PaymentMethod } from "@/lib/buyer";
import { bundlePickError, type BundlePick } from "@/lib/bundles";
import { shopBundles } from "@/lib/catalog";
import { splitBundleCents } from "@/lib/bundles";
import { todayInEdmonton } from "@/lib/dates";
import { appUrl } from "@/lib/env";
import { isUnguessableToken } from "@/lib/ledger-rules";
import { shopPhase } from "@/lib/launch";
import { rowIsTest } from "@/lib/live-sale";
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
  if (!teamSlug) return { ok: false, error: "Missing team.", status: 400 };
  const contactError = buyerContactError({ name: buyerName, email: buyerEmail, phone: buyerPhone, method: "card" });
  if (contactError) return { ok: false, error: contactError, status: 400 };
  if (!isEmail(buyerEmail)) return { ok: false, error: "Enter a valid email address.", status: 400 };
  if (buyerPhone && !isNorthAmericanPhone(buyerPhone)) {
    return { ok: false, error: "Enter a 10-digit phone number.", status: 400 };
  }
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

  return finishOrder({
    campaign,
    buyerName,
    buyerEmail,
    buyerPhone,
    normalized,
    incomingBundle,
    enteredBy: "supporter",
    paymentMethod: "card",
    successPath: "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
    cancelPath: "/checkout/cancelled",
  });
}

type SaleCampaign = {
  campaign_id: string;
  campaign_name: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
};

export async function createShareOrder(body: unknown): Promise<CheckoutResult> {
  const parsed = parseSaleBody(body);
  if (!parsed.ok) return parsed;
  if (!isUnguessableToken(parsed.shareToken)) return { ok: false, error: "Link not valid.", status: 404 };
  const contactError = buyerContactError({
    name: parsed.buyerName,
    email: parsed.buyerEmail,
    phone: parsed.buyerPhone,
    method: parsed.paymentMethod,
  });
  if (contactError) return { ok: false, error: contactError, status: 400 };

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("fn_shop_from_share_token", { p_token: parsed.shareToken });
  if (error || !data || typeof data !== "object") return { ok: false, error: "Link not valid.", status: 404 };
  const shop = data as {
    cp_id?: string;
    campaign_id?: string;
    campaign_name?: string;
    status?: string;
    start_date?: string | null;
    end_date?: string | null;
  };
  if (!shop.cp_id || !shop.campaign_id) return { ok: false, error: "Link not valid.", status: 404 };
  const closed = sellingError(shop.status || "", shop.start_date ?? null, shop.end_date ?? null);
  if (closed) return { ok: false, error: closed, status: 400 };

  return finishOrder({
    campaign: {
      campaign_id: shop.campaign_id,
      campaign_name: shop.campaign_name || "the team",
      status: shop.status || "active",
      start_date: shop.start_date ?? null,
      end_date: shop.end_date ?? null,
    },
    buyerName: parsed.buyerName,
    buyerEmail: parsed.buyerEmail,
    buyerPhone: parsed.buyerPhone,
    normalized: parsed.normalized,
    incomingBundle: parsed.incomingBundle,
    enteredBy: "supporter",
    paymentMethod: parsed.paymentMethod,
    forceCpId: shop.cp_id,
    successPath: parsed.paymentMethod === "cash" ? `/s/${parsed.shareToken}?placed=cash` : "/checkout/success?session_id={CHECKOUT_SESSION_ID}",
    cancelPath: `/s/${parsed.shareToken}`,
  });
}

export async function createParentCashOrder(body: unknown): Promise<CheckoutResult> {
  const parsed = parseSaleBody(body);
  if (!parsed.ok) return parsed;
  if (parsed.paymentMethod !== "cash") return { ok: false, error: "Parents enter cash or paper orders. Card buyers use the share link.", status: 400 };
  if (!isUnguessableToken(parsed.parentToken)) return { ok: false, error: "Link not valid.", status: 404 };
  const contactError = buyerContactError({
    name: parsed.buyerName,
    email: parsed.buyerEmail,
    phone: parsed.buyerPhone,
    method: "cash",
  });
  if (contactError) return { ok: false, error: contactError, status: 400 };

  const db = supabaseAdmin();
  const { data, error } = await db.rpc("fn_parent_from_token", { p_token: parsed.parentToken });
  const row = participantRow(data);
  if (error || !row?.cp_id || !row.campaign_id) return { ok: false, error: "Link not valid.", status: 404 };
  const { data: campaign, error: campaignError } = await db
    .from("campaigns")
    .select("campaign_id, campaign_name, status, start_date, end_date")
    .eq("campaign_id", row.campaign_id)
    .maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign) return { ok: false, error: "Link not valid.", status: 404 };
  const closed = sellingError(campaign.status, campaign.start_date, campaign.end_date);
  if (closed) return { ok: false, error: closed, status: 400 };

  return finishOrder({
    campaign,
    buyerName: parsed.buyerName,
    buyerEmail: parsed.buyerEmail,
    buyerPhone: parsed.buyerPhone,
    normalized: parsed.normalized,
    incomingBundle: parsed.incomingBundle,
    enteredBy: "parent",
    paymentMethod: "cash",
    forceCpId: row.cp_id,
    successPath: `/p/ledger/${parsed.parentToken}?saved=1`,
    cancelPath: `/p/ledger/${parsed.parentToken}`,
  });
}

function sellingError(status: string, start: string | null, end: string | null): string | null {
  if (status !== "active") return "This fundraiser is not taking orders right now.";
  const phase = shopPhase(start, end, todayInEdmonton());
  if (phase === "before") return "This fundraiser has not started.";
  if (phase === "after") return "This fundraiser is closed.";
  return null;
}

function participantRow(data: unknown): { cp_id: string; campaign_id: string } | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const record = row as { cp_id?: string; campaign_id?: string };
  if (!record.cp_id || !record.campaign_id) return null;
  return { cp_id: record.cp_id, campaign_id: record.campaign_id };
}

function parseSaleBody(body: unknown):
  | { ok: false; error: string; status: number }
  | {
      ok: true;
      shareToken: string;
      parentToken: string;
      buyerName: string;
      buyerEmail: string;
      buyerPhone: string;
      paymentMethod: PaymentMethod;
      normalized: ReturnType<typeof normalizeCartLines>;
      incomingBundle: IncomingBundle | null;
    } {
  if (!body || typeof body !== "object") return { ok: false, error: "Missing order.", status: 400 };
  const raw = body as Record<string, unknown>;
  const method = raw.paymentMethod === "cash" ? "cash" : "card";
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
  return {
    ok: true,
    shareToken: cleanText(raw.shareToken, 80),
    parentToken: cleanText(raw.parentToken, 80),
    buyerName: cleanText(raw.buyerName, 200),
    buyerEmail: cleanText(raw.buyerEmail, 254).toLowerCase(),
    buyerPhone: cleanText(raw.buyerPhone, 40),
    paymentMethod: method,
    normalized,
    incomingBundle,
  };
}

async function finishOrder(input: {
  campaign: SaleCampaign;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  normalized: ReturnType<typeof normalizeCartLines>;
  incomingBundle: IncomingBundle | null;
  enteredBy: "supporter" | "parent";
  paymentMethod: PaymentMethod;
  forceCpId?: string;
  successPath: string;
  cancelPath: string;
}): Promise<CheckoutResult> {
  const normalized = input.forceCpId
    ? input.normalized.map((line) => ({ ...line, cpId: input.forceCpId as string }))
    : input.normalized;
  const incomingBundle = input.incomingBundle
    ? { ...input.incomingBundle, cpId: input.forceCpId || input.incomingBundle.cpId }
    : null;
  const buyerName = input.buyerName;
  const buyerEmail = input.buyerEmail;
  const buyerPhone = input.buyerPhone;
  const campaign = input.campaign;
  const db = supabaseAdmin();
  const bundleCpId = incomingBundle?.cpId ? cleanText(incomingBundle.cpId, 80) : "";
  if (incomingBundle?.offerId && !bundleCpId) return { ok: false, error: "Choose who the pack is for.", status: 400 };
  const cpIds = [...new Set([...normalized.map((line) => line.cpId), ...(bundleCpId ? [bundleCpId] : [])])];
  if (cpIds.length !== 1) return { ok: false, error: "Each order is for one participant.", status: 400 };
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

  const anchorId = input.forceCpId && rows.some((row) => row.cp_id === input.forceCpId)
    ? input.forceCpId
    : [...rows].sort((a, b) => a.line_no - b.line_no)[0].cp_id;
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
      cp_id: anchorId,
      entered_by: input.enteredBy,
      payment_method: input.paymentMethod,
      is_test: rowIsTest(),
      buyer_name: buyerName,
      buyer_email: buyerEmail || null,
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

  if (input.paymentMethod === "cash") {
    const origin = appUrl();
    return { ok: true, url: `${origin}${input.successPath}` };
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
      success_url: `${origin}${input.successPath}`,
      cancel_url: `${origin}${input.cancelPath}`,
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
