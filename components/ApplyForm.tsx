"use client";

import { useState } from "react";
import { CASL_CONSENT_TEXT } from "@/lib/consent";
import { estimateSentences, type BagEstimate } from "@/lib/estimate";
import { formatCad } from "@/lib/money";

const HEARD = [
  "Coach or team manager",
  "Another parent",
  "Facebook",
  "Instagram",
  "Google search",
  "TeamSnap",
  "Word of mouth",
  "Other",
];

type Sport = { sport_name: string; emoji: string | null };
type Price = { code: string; name: string; priceCents: number; teamShareCents: number };
type Done = "saved" | "already" | "away";

export function ApplyForm({ sports, prices }: { sports: Sport[]; prices: Price[] }) {
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState("");
  const [sport, setSport] = useState("");
  const [sportOther, setSportOther] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [summary, setSummary] = useState<BagEstimate | null>(null);

  const options = sports.some((item) => item.sport_name === "Other")
    ? sports
    : [...sports, { sport_name: "Other", emoji: null }];

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      const response = await fetch("/api/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          email: form.get("email"),
          phone: form.get("phone"),
          team: form.get("team"),
          sport,
          sportOther: sport === "Other" ? sportOther : "",
          city: form.get("city"),
          postal: form.get("postal"),
          participants: form.get("participants"),
          goalDollars: form.get("goal"),
          howHeard: form.get("howHeard"),
          consent,
          company,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        error?: string;
        already?: boolean;
        outOfArea?: boolean;
        emailed?: boolean;
        summary?: BagEstimate | null;
      };
      if (!response.ok || !data.ok) {
        setError(data.error || "We couldn't save that. Please try again.");
        return;
      }
      setEmailed(Boolean(data.emailed));
      setSummary(data.summary ?? null);
      setDone(data.outOfArea ? "away" : data.already ? "already" : "saved");
    } catch {
      setError("We couldn't save that. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (done === "saved") {
    const lines = summary ? estimateSentences(summary) : null;
    return (
      <div className="card" id="apply">
        <h2>You're in the pipeline</h2>
        <p>We saved your application. We'll confirm your campaign within 48 hours.</p>
        {lines ? (
          <>
            <p>{lines.intro}</p>
            <p>{lines.total}</p>
            <p>{lines.each}</p>
          </>
        ) : null}
        {emailed ? <p>We emailed you a confirmation.</p> : null}
      </div>
    );
  }

  if (done) {
    return (
      <div className="card" id="apply">
        <h2>{done === "away" ? "We're not in that area yet" : "We already have your application"}</h2>
        <p>
          {done === "away"
            ? "Sweet Success currently serves Alberta. We saved your note and will be in touch if that changes."
            : "This email is already on an application. We'll use the details we have."}
        </p>
      </div>
    );
  }

  return (
    <form className="card" id="apply" onSubmit={onSubmit}>
      <h2>Apply to run a fundraiser</h2>
      <p className="hint">Tell us about the team. We'll confirm your campaign within 48 hours. No upfront cost.</p>
      {prices.length > 0 && (
        <ul className="prices">
          {prices.map((price) => (
            <li key={price.code}>
              <strong>{price.name}</strong>
              <div>{formatCad(price.priceCents)} each · team keeps {formatCad(price.teamShareCents)}</div>
            </li>
          ))}
        </ul>
      )}
      <div className="row two">
        <div>
          <label htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" autoComplete="given-name" required />
        </div>
        <div>
          <label htmlFor="lastName">Last name</label>
          <input id="lastName" name="lastName" autoComplete="family-name" required />
        </div>
      </div>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="phone">Phone <span className="fine">(optional)</span></label>
      <input id="phone" name="phone" type="tel" autoComplete="tel" />
      <label htmlFor="team">Club or team</label>
      <input id="team" name="team" required />
      <label htmlFor="sport">Sport or activity</label>
      <select id="sport" name="sport" required value={sport} onChange={(event) => setSport(event.target.value)}>
        <option value="" disabled>Select a sport</option>
        {options.map((item) => (
          <option key={item.sport_name} value={item.sport_name}>
            {item.emoji ? `${item.emoji} ` : ""}{item.sport_name}
          </option>
        ))}
      </select>
      {sport === "Other" ? (
        <>
          <label htmlFor="sportOther">Which sport or activity?</label>
          <input
            id="sportOther"
            name="sportOther"
            value={sportOther}
            onChange={(event) => setSportOther(event.target.value)}
            maxLength={40}
            required
          />
        </>
      ) : null}
      <div className="row two">
        <div>
          <label htmlFor="city">City</label>
          <input id="city" name="city" autoComplete="address-level2" />
        </div>
        <div>
          <label htmlFor="postal">Postal code</label>
          <input id="postal" name="postal" autoComplete="postal-code" placeholder="T0M 1X0" required />
        </div>
      </div>
      <div className="row two">
        <div>
          <label htmlFor="participants">Number of participants</label>
          <input id="participants" name="participants" inputMode="numeric" min={1} max={200} step={1} required />
        </div>
        <div>
          <label htmlFor="goal">Goal the team keeps (CAD)</label>
          <input id="goal" name="goal" inputMode="decimal" min={100} required />
        </div>
      </div>
      <label htmlFor="howHeard">How did you hear about us?</label>
      <select id="howHeard" name="howHeard" defaultValue="">
        <option value="">Select an option</option>
        {HEARD.map((option) => <option key={option}>{option}</option>)}
      </select>
      <label className="check">
        <input type="checkbox" name="consent" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>{CASL_CONSENT_TEXT} <a href="/privacy">Privacy</a></span>
      </label>
      <div className="hp">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" value={company} onChange={(event) => setCompany(event.target.value)} />
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      <button className="btn btn-navy" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Apply"}
      </button>
      <p className="fine">Your information is saved to Sweet Success and used to set up the fundraiser. It is not sold. The updates box starts unchecked.</p>
    </form>
  );
}
