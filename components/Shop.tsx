"use client";

import { useMemo, useRef, useState } from "react";
import { ProductPhotoView } from "@/components/ProductPhoto";
import type { ProductPhoto } from "@/components/product-photos";
import { buyerContactError, type PaymentMethod } from "@/lib/buyer";
import { mixPackLines, normalizeCartLines } from "@/lib/cart";
import { formatUserDate } from "@/lib/dates";
import { formatCad, formatTeamCad } from "@/lib/money";
import { cartCandyLine } from "@/lib/public-names";
import {
  cartTotals,
  hasMultiBagTiers,
  initialCandyQty,
  priceCart,
  unitPriceCents,
  type BagRow,
  type TierRow,
} from "@/lib/pricing";

type Player = { cpId: string; name: string };
type Product = {
  productId: string;
  displayName: string | null;
  description: string | null;
  photo: ProductPhoto | null;
};
type Bag = { bagTypeId: string; code: string; name: string; teamShareCents: number };
type Line = { cpId: string; productId: string; bagTypeId: string; qty: number; fromMixPack: boolean };
type ShopBundle = {
  offerId: string;
  label: string;
  bagCount: number;
  bagTypeId: string;
  priceCents: number;
  isTest: boolean;
};
type BundleCart = { offerId: string; cpId: string; picks: { productId: string; qty: number }[] };

export function Shop(props: {
  teamSlug: string;
  campaignName: string;
  status: string;
  goalCents: number;
  raisedCents: number;
  endDate: string | null;
  players: Player[];
  initialCpId: string | null;
  products: Product[];
  bags: Bag[];
  tiers: TierRow[];
  bagRows: BagRow[];
  tierLabels: { qty: number; label: string }[];
  defaultQty: number;
  minBags: number;
  standardBagTypeId: string | null;
  bundles: ShopBundle[];
  orderTarget?: { kind: "supporter"; shareToken: string; firstName: string } | { kind: "parent"; parentToken: string };
  notice?: string | null;
}) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [playerId, setPlayerId] = useState(props.initialCpId || props.players[0]?.cpId || "");
  const [lines, setLines] = useState<Line[]>([]);
  const [bundle, setBundle] = useState<BundleCart | null>(null);
  const [openOfferId, setOpenOfferId] = useState<string | null>(null);
  const [draftPicks, setDraftPicks] = useState<Record<string, number>>({});
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(props.orderTarget?.kind === "parent" ? "cash" : "card");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const canOrder = props.status === "active" && props.players.length > 0;

  const priced = useMemo(() => {
    if (!lines.length) return { lines: [], error: null as string | null };
    try {
      return { lines: priceCart(normalizeCartLines(lines), props.tiers, props.bagRows, props.minBags), error: null };
    } catch (err) {
      return { lines: [], error: err instanceof Error ? err.message : "Check the cart." };
    }
  }, [lines, props.tiers, props.bagRows, props.minBags]);

  const totals = cartTotals(priced.lines);
  const openOffer = props.bundles.find((offer) => offer.offerId === openOfferId) ?? null;
  const draftBags = Object.values(draftPicks).reduce((sum, qty) => sum + qty, 0);
  const bundleOffer = bundle ? props.bundles.find((offer) => offer.offerId === bundle.offerId) ?? null : null;
  const displayCents = (priced.lines.length ? totals.grossCents : 0) + (bundleOffer?.priceCents ?? 0);
  const displayBags = (priced.lines.length ? totals.bags : 0) + (bundleOffer?.bagCount ?? 0);
  const mixQuote = useMemo(() => {
    if (!props.standardBagTypeId || !playerId || props.products.length === 0) return null;
    try {
      const mix = mixPackLines(playerId, props.products.map((product) => product.productId), props.standardBagTypeId, 1);
      return cartTotals(priceCart(normalizeCartLines(mix), props.tiers, props.bagRows, 1));
    } catch {
      return null;
    }
  }, [playerId, props.products, props.standardBagTypeId, props.tiers, props.bagRows]);

  const showLadder = hasMultiBagTiers(props.tiers);
  const percent = props.goalCents > 0 ? Math.min(100, Math.round((props.raisedCents / props.goalCents) * 100)) : 0;

  function choosePlayer(cpId: string) {
    if (cpId === playerId) return;
    if (lines.length || bundle) {
      setError("This order is for one participant. Remove the cart to switch.");
      return;
    }
    setPlayerId(cpId);
  }

  function qtyOf(productId: string, bagTypeId: string) {
    return lines.find((line) => line.cpId === playerId && line.productId === productId && line.bagTypeId === bagTypeId)?.qty ?? 0;
  }

  function setQty(productId: string, bagTypeId: string, delta: number) {
    setLines((current) => {
      const existing = current.find((line) => line.cpId === playerId && line.productId === productId && line.bagTypeId === bagTypeId);
      const nextQty = initialCandyQty(existing?.qty ?? 0, delta, props.defaultQty);
      const rest = current.filter((line) => !(line.cpId === playerId && line.productId === productId && line.bagTypeId === bagTypeId));
      if (nextQty <= 0) return rest;
      return [...rest, { cpId: playerId, productId, bagTypeId, qty: nextQty, fromMixPack: false }];
    });
  }

  function addMix() {
    const standardBagTypeId = props.standardBagTypeId;
    if (!standardBagTypeId || !playerId) return;
    setLines((current) => {
      const next = [...current];
      for (const product of props.products) {
        const index = next.findIndex(
          (line) => line.cpId === playerId && line.productId === product.productId && line.bagTypeId === standardBagTypeId,
        );
        if (index >= 0) next[index] = { ...next[index], qty: next[index].qty + 1, fromMixPack: true };
        else {
          next.push({
            cpId: playerId,
            productId: product.productId,
            bagTypeId: standardBagTypeId,
            qty: 1,
            fromMixPack: true,
          });
        }
      }
      return next;
    });
  }

  async function checkout(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const method: PaymentMethod = props.orderTarget?.kind === "parent" ? "cash" : props.orderTarget ? paymentMethod : "card";
    const contactError = buyerContactError({ name: buyerName, email: buyerEmail, phone: buyerPhone, method });
    if (contactError) {
      setError(contactError);
      document.getElementById("buyer-name")?.focus();
      return;
    }
    if (!bundle && !priced.lines.length) {
      setError(priced.error || `Add at least ${props.minBags} bag${props.minBags === 1 ? "" : "s"}.`);
      return;
    }
    setPending(true);
    try {
      const bundleBody = bundle && bundleOffer
        ? {
            offerId: bundle.offerId,
            cpId: bundle.cpId,
            picks: bundle.picks.map((pick) => ({
              productId: pick.productId,
              bagTypeId: bundleOffer.bagTypeId,
              qty: pick.qty,
            })),
          }
        : null;
      const target = props.orderTarget;
      const endpoint = target?.kind === "supporter" ? "/api/shop/orders" : target?.kind === "parent" ? "/api/ledger/orders" : "/api/checkout";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamSlug: props.teamSlug,
          entryCpId: props.initialCpId,
          shareToken: target?.kind === "supporter" ? target.shareToken : undefined,
          parentToken: target?.kind === "parent" ? target.parentToken : undefined,
          paymentMethod: method,
          buyerName,
          buyerEmail,
          buyerPhone,
          lines,
          bundle: bundleBody,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; url?: string; error?: string };
      if (!response.ok || !data.url) {
        setError(data.error || "Checkout could not start.");
        setPending(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Checkout could not start.");
      setPending(false);
    }
  }

  return (
    <div className="page wrap">
      <p className="kicker">Team fundraiser</p>
      <h1>{props.campaignName}</h1>
      {props.notice ? <div className="alert">{props.notice}</div> : null}
      <p className="sub">
        {props.orderTarget?.kind === "supporter"
          ? `This order supports ${props.orderTarget.firstName}. Candy is delivered in bulk to the organizer — no shipping address. `
          : props.orderTarget?.kind === "parent"
            ? "Enter a cash or paper order for this participant. "
            : "Pay online. Candy is delivered in bulk to the organizer — no shipping address. "}
        {props.endDate ? `Orders run through ${formatUserDate(props.endDate)}.` : ""}
      </p>
      {props.goalCents > 0 && !props.orderTarget && (
        <div style={{ margin: "16px 0 22px" }}>
          <div className="progress" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
          <p className="muted">Team has earned {formatTeamCad(props.raisedCents)} of {formatTeamCad(props.goalCents)}</p>
        </div>
      )}
      {props.status !== "active" && <div className="alert error">This fundraiser is not taking orders right now.</div>}

      {props.orderTarget ? (
        <p>{props.orderTarget.kind === "supporter" ? `Supporting ${props.orderTarget.firstName}.` : "This cash order is for your participant."}</p>
      ) : (
        <>
          <h2 style={{ fontSize: 28 }}>Which participant is this for?</h2>
          <div className="picker" ref={pickerRef}>
            {props.players.map((player) => (
              <button key={player.cpId} type="button" aria-pressed={player.cpId === playerId} onClick={() => choosePlayer(player.cpId)}>
                {player.name}
              </button>
            ))}
          </div>
        </>
      )}
      {props.players.length === 0 && <p>No participants are listed for this team yet.</p>}

      {props.bundles.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 28 }}>Packs</h2>
          <div className="grid-3">
            {props.bundles.map((offer) => (
              <article className="panel" key={offer.offerId}>
                <h3>{offer.label}</h3>
                {offer.isTest ? <p className="fine">TEST pricing</p> : null}
                <p>{offer.bagCount} bags · {formatCad(offer.priceCents)}</p>
                <p className="muted">pick any {offer.bagCount} standard bags</p>
                <button className="btn btn-navy" type="button" disabled={!canOrder || !playerId} onClick={() => { setOpenOfferId(offer.offerId); setDraftPicks({}); }}>
                  Choose bags
                </button>
              </article>
            ))}
          </div>
          {openOffer && (
            <div className="panel" style={{ marginTop: 12 }}>
              <h3>{openOffer.label}</h3>
              <p className="muted">{draftBags} of {openOffer.bagCount} standard bags</p>
              {props.products.map((product) => (
                <div className="qty-line" key={product.productId}>
                  <strong>{product.displayName || "Candy"}</strong>
                  <div className="stepper">
                    <button type="button" aria-label={`Fewer ${product.displayName || "candy"} in ${openOffer.label}`} onClick={() => setDraftPicks((current) => ({ ...current, [product.productId]: Math.max(0, (current[product.productId] ?? 0) - 1) }))}>−</button>
                    <span>{draftPicks[product.productId] ?? 0}</span>
                    <button type="button" aria-label={`More ${product.displayName || "candy"} in ${openOffer.label}`} onClick={() => setDraftPicks((current) => ({ ...current, [product.productId]: (current[product.productId] ?? 0) + 1 }))} disabled={draftBags >= openOffer.bagCount}>+</button>
                  </div>
                </div>
              ))}
              <button
                className="btn btn-navy"
                type="button"
                disabled={draftBags !== openOffer.bagCount}
                onClick={() => {
                  const picks = Object.entries(draftPicks).filter(([, qty]) => qty > 0).map(([productId, qty]) => ({ productId, qty }));
                  setBundle({ offerId: openOffer.offerId, cpId: playerId, picks });
                  setOpenOfferId(null);
                }}
              >
                Add {openOffer.label}
              </button>
            </div>
          )}
        </section>
      )}

      <div className="grid-2" style={{ marginTop: 18 }}>
        <div className="candy">
          {props.products.map((product) => (
            <article className="panel" key={product.productId}>
              {product.photo ? <ProductPhotoView photo={product.photo} /> : null}
              {product.displayName ? <h3>{product.displayName}</h3> : null}
              {product.description ? <p className="muted">{product.description}</p> : null}
              {props.bags.map((bag) => {
                const unit = unitPriceCents(props.tiers, bag.bagTypeId);
                const qty = qtyOf(product.productId, bag.bagTypeId);
                return (
                  <div className="qty-line" key={bag.bagTypeId}>
                    <div>
                      <strong>{bag.name}</strong>
                      <div className="muted">
                        {unit != null ? `${formatCad(unit)} each` : "Price confirmed at checkout"}
                      </div>
                    </div>
                    <div className="stepper">
                      <button type="button" aria-label={`Fewer ${bag.name}${product.displayName ? ` ${product.displayName}` : ""}`} onClick={() => setQty(product.productId, bag.bagTypeId, -1)} disabled={!canOrder}>−</button>
                      <span>{qty}</span>
                      <button type="button" aria-label={`More ${bag.name}${product.displayName ? ` ${product.displayName}` : ""}`} onClick={() => setQty(product.productId, bag.bagTypeId, 1)} disabled={!canOrder}>+</button>
                    </div>
                  </div>
                );
              })}
            </article>
          ))}
          {props.standardBagTypeId && props.products.length > 0 && (
            <article className="panel">
              <h3>Mix pack</h3>
              <p className="muted">One of each candy for this participant. {mixQuote ? `${mixQuote.bags} bags · ${formatCad(mixQuote.grossCents)}.` : ""}</p>
              <button className="btn btn-ghost" type="button" onClick={addMix} disabled={!canOrder || !playerId}>Add a mix pack</button>
            </article>
          )}
          {showLadder && (
            <article className="panel">
              <h3>Prices for more than one bag</h3>
              {props.bags.map((bag) => {
                const tiers = props.tiers
                  .filter((tier) => tier.bagTypeId === bag.bagTypeId && tier.active && tier.qty > 1)
                  .sort((a, b) => a.qty - b.qty);
                if (!tiers.length) return null;
                return (
                  <div key={bag.bagTypeId}>
                    <strong>{bag.name}</strong>
                    <ul>
                      {tiers.map((tier) => {
                        const label = props.tierLabels.find((item) => item.qty === tier.qty)?.label;
                        return <li key={tier.qty}>{label ? `${label}: ` : ""}{tier.qty} bags · {formatCad(tier.priceCents)}</li>;
                      })}
                    </ul>
                  </div>
                );
              })}
            </article>
          )}
        </div>

        <form onSubmit={checkout}>
          <div className="panel">
            <h2 style={{ fontSize: 28, marginTop: 0 }}>Cart</h2>
            {!bundle && lines.length === 0 && <p className="muted">Choose a participant and add bags. The first tap starts at {props.defaultQty}.</p>}
            {bundleOffer && bundle && (
              <div className="cart-line">
                <div>
                  <strong>{bundleOffer.label}</strong>
                  <div className="muted">
                    {bundle.picks.map((pick) => {
                      const product = props.products.find((item) => item.productId === pick.productId);
                      return `${product?.displayName || "Candy"} × ${pick.qty}`;
                    }).join(", ")}
                    {" · "}{formatCad(bundleOffer.priceCents)}
                  </div>
                </div>
                <button className="btn btn-ghost" type="button" onClick={() => setBundle(null)}>Remove</button>
              </div>
            )}
            {lines.map((line) => {
              const player = props.players.find((item) => item.cpId === line.cpId);
              const product = props.products.find((item) => item.productId === line.productId);
              const bag = props.bags.find((item) => item.bagTypeId === line.bagTypeId);
              return (
                <div className="cart-line" key={`${line.cpId}-${line.productId}-${line.bagTypeId}`}>
                  <div>
                    <strong>{player?.name}</strong>
                    <div className="muted">{cartCandyLine(product?.displayName ?? null, bag?.name ?? "Bag", line.qty, line.fromMixPack)}</div>
                  </div>
                  <button className="btn btn-ghost" type="button" onClick={() => setLines((current) => current.filter((item) => item !== line))}>Remove</button>
                </div>
              );
            })}
            <p>{displayBags > 0 ? `${displayBags} bags · ${formatCad(displayCents)}` : priced.error}</p>
            {props.orderTarget?.kind === "supporter" && (
              <fieldset>
                <legend>How will you pay?</legend>
                <label><input type="radio" name="pay" checked={paymentMethod === "card"} onChange={() => setPaymentMethod("card")} /> Card</label>
                <label><input type="radio" name="pay" checked={paymentMethod === "cash"} onChange={() => setPaymentMethod("cash")} /> Cash</label>
              </fieldset>
            )}

            <label htmlFor="buyer-name">Your name</label>
            <input id="buyer-name" value={buyerName} onChange={(event) => setBuyerName(event.target.value)} autoComplete="name" required />
            <label htmlFor="buyer-email">Email {props.orderTarget && paymentMethod === "cash" ? <span className="fine">(or phone)</span> : null}</label>
            <input id="buyer-email" type="email" value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} autoComplete="email" required={!props.orderTarget || paymentMethod === "card"} />
            <label htmlFor="buyer-phone">Phone {props.orderTarget && paymentMethod === "cash" ? <span className="fine">(or email)</span> : <span className="fine">(optional)</span>}</label>
            <input id="buyer-phone" type="tel" value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} autoComplete="tel" />
            {error && <div className="alert error" role="alert">{error}</div>}
          </div>
          <div className="sticky-pay">
            <div>
              <strong>{displayBags ? formatCad(displayCents) : "Add bags"}</strong>
              <div className="muted" style={{ color: "rgba(255,255,255,0.7)" }}>{displayBags || 0} bags</div>
            </div>
            <button className="btn btn-gold" type="submit" disabled={!canOrder || pending || displayBags === 0}>
              {pending ? "Starting…" : props.orderTarget?.kind === "parent" || paymentMethod === "cash" && props.orderTarget ? "Save cash order" : "Checkout"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
