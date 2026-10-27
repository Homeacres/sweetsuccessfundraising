"use client";

import { useMemo, useRef, useState } from "react";
import { mixPackLines, normalizeCartLines } from "@/lib/cart";
import { formatUserDate } from "@/lib/dates";
import { formatCad } from "@/lib/money";
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
type Product = { productId: string; displayName: string | null; description: string | null };
type Bag = { bagTypeId: string; code: string; name: string; teamShareCents: number };
type Line = { cpId: string; productId: string; bagTypeId: string; qty: number; fromMixPack: boolean };

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
}) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [playerId, setPlayerId] = useState(props.initialCpId || props.players[0]?.cpId || "");
  const [lines, setLines] = useState<Line[]>([]);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
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
  const playersInCart = new Set(lines.map((line) => line.cpId));
  const percent = props.goalCents > 0 ? Math.min(100, Math.round((props.raisedCents / props.goalCents) * 100)) : 0;

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
    if (!buyerName.trim() || !buyerEmail.trim()) {
      setError("Name and email are required.");
      document.getElementById("buyer-name")?.focus();
      return;
    }
    if (!priced.lines.length) {
      setError(priced.error || `Add at least ${props.minBags} bag${props.minBags === 1 ? "" : "s"}.`);
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamSlug: props.teamSlug,
          entryCpId: props.initialCpId,
          buyerName,
          buyerEmail,
          buyerPhone,
          lines,
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
      <p className="sub">
        Pay online. Candy is delivered in bulk to the organizer — no shipping address.{" "}
        {props.endDate ? `Orders run through ${formatUserDate(props.endDate)}.` : ""}
      </p>
      {props.goalCents > 0 && (
        <div style={{ margin: "16px 0 22px" }}>
          <div className="progress" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
          <p className="muted">Team has earned {formatCad(props.raisedCents)} of {formatCad(props.goalCents)}</p>
        </div>
      )}
      {props.status !== "active" && <div className="alert error">This fundraiser is not taking orders right now.</div>}

      <h2 style={{ fontSize: 28 }}>Who is this for?</h2>
      <div className="picker" ref={pickerRef}>
        {props.players.map((player) => (
          <button key={player.cpId} type="button" aria-pressed={player.cpId === playerId} onClick={() => setPlayerId(player.cpId)}>
            {player.name}
          </button>
        ))}
      </div>
      {props.players.length === 0 && <p>No players are listed for this team yet.</p>}

      <div className="grid-2" style={{ marginTop: 18 }}>
        <div className="candy">
          {props.products.map((product) => (
            <article className="panel" key={product.productId}>
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
                        {unit != null ? `${formatCad(unit)} each` : "Price confirmed at checkout"} · team keeps {formatCad(bag.teamShareCents)}
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
              <p className="muted">One of each candy for this player. {mixQuote ? `${mixQuote.bags} bags · ${formatCad(mixQuote.grossCents)}.` : ""}</p>
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
            {lines.length === 0 && <p className="muted">Choose a player and add bags. The first tap starts at {props.defaultQty}.</p>}
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
            {playersInCart.size === 1 && props.players.length > 1 && lines.length > 0 && (
              <div className="estimate">
                <strong style={{ fontSize: 18 }}>Add another player?</strong>
                <p className="muted">One payment can be split across the team. Pick someone else, then add their bags.</p>
                <button className="btn btn-ghost" type="button" onClick={() => pickerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                  Choose another player
                </button>
              </div>
            )}
            <p>{priced.lines.length > 0 ? `${totals.bags} bags · ${formatCad(totals.grossCents)}` : priced.error}</p>
            {priced.lines.length > 0 && <p className="muted">Team keeps {formatCad(totals.teamShareCents)} from this order.</p>}

            <label htmlFor="buyer-name">Your name</label>
            <input id="buyer-name" value={buyerName} onChange={(event) => setBuyerName(event.target.value)} autoComplete="name" required />
            <label htmlFor="buyer-email">Email</label>
            <input id="buyer-email" type="email" value={buyerEmail} onChange={(event) => setBuyerEmail(event.target.value)} autoComplete="email" required />
            <label htmlFor="buyer-phone">Phone <span className="fine">(optional)</span></label>
            <input id="buyer-phone" type="tel" value={buyerPhone} onChange={(event) => setBuyerPhone(event.target.value)} autoComplete="tel" />
            {error && <div className="alert error" role="alert">{error}</div>}
          </div>
          <div className="sticky-pay">
            <div>
              <strong>{priced.lines.length ? formatCad(totals.grossCents) : "Add bags"}</strong>
              <div className="muted" style={{ color: "rgba(255,255,255,0.7)" }}>{totals.bags || 0} bags</div>
            </div>
            <button className="btn btn-gold" type="submit" disabled={!canOrder || pending || !priced.lines.length}>
              {pending ? "Starting…" : "Checkout"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
