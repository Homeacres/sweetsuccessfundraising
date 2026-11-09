"use client";

import { useState } from "react";
import { SportField } from "@/components/SportField";
import { applyThanksHeading } from "@/lib/apply-heading";
import { OTHER_SPORT, SPORT_LIST_ERROR, type SportChoice } from "@/lib/apply-sport";
import { CASL_CONSENT_TEXT } from "@/lib/consent";
import { type BagEstimate } from "@/lib/estimate";
import { formatQuoteGoal, TEAM_KEEP_ABOUT, TEAM_PAYOUT_ROUND } from "@/lib/quote-copy";

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

type Done = "saved" | "already" | "away";

export function ApplyConfirmation({
  firstName,
  email,
  summary,
  startUrl,
}: {
  firstName: string;
  email: string;
  summary: BagEstimate | null;
  startUrl: string | null;
}) {
  const goal = summary ? formatQuoteGoal(summary.goalDollars) : "";
  const bags = summary ? summary.totalBags.toLocaleString("en-CA") : "";
  const each = summary && summary.participants > 0 ? summary.bagsEach.toLocaleString("en-CA") : null;
  return (
    <div className="card" id="apply">
      <h2>{applyThanksHeading(firstName)}</h2>
      {summary ? (
        <p>
          To raise {goal}, your group would sell about {bags} bags.
          {each ? ` That's about ${each} per participant.` : ""}
        </p>
      ) : null}
      <p>Your group keeps at least 40% of every sale, and the payout is always a round dollar amount.</p>
      <p>We've emailed a copy of this quote to {email}.</p>
      <p className="fine">These are estimates. Nothing has started yet.</p>
      <h3>Ready when you are</h3>
      <p>When you're ready, click Start my fundraiser. You'll pick your start dates, number of participants and goal on the next page. There's no commitment until we confirm with you.</p>
      {startUrl ? <a className="btn btn-navy" href={startUrl}>Start my fundraiser</a> : null}
      <p className="fine">Not ready yet? Just reply to the quote email with any questions.</p>
    </div>
  );
}

export function ApplyForm({ sports, sportsError }: { sports: SportChoice[]; sportsError: boolean }) {
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState("");
  const [sport, setSport] = useState("");
  const [sportOther, setSportOther] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [summary, setSummary] = useState<BagEstimate | null>(null);
  const [thanksName, setThanksName] = useState("");
  const [thanksEmail, setThanksEmail] = useState("");
  const [startUrl, setStartUrl] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sportsError) return;
    setError(null);
    if (!sport) {
      setError("Choose a sport from the list.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setThanksName(String(form.get("firstName") || ""));
    setThanksEmail(String(form.get("email") || ""));
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
          sportOther: sport === OTHER_SPORT ? sportOther : "",
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
        startUrl?: string | null;
      };
      if (!response.ok || !data.ok) {
        setError(data.error || "We couldn't save that. Please try again.");
        return;
      }
      setSummary(data.summary ?? null);
      setStartUrl(data.startUrl ?? null);
      setDone(data.outOfArea ? "away" : data.already ? "already" : "saved");
    } catch {
      setError("We couldn't save that. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (done === "saved") {
    return <ApplyConfirmation firstName={thanksName} email={thanksEmail} summary={summary} startUrl={startUrl} />;
  }

  if (done) {
    return (
      <div className="card" id="apply">
        <h2>{done === "away" ? "We're not in that area yet" : "We already have this quote"}</h2>
        <p>
          {done === "away"
            ? "Sweet Success currently serves Alberta. We saved your note and will be in touch if that changes."
            : "This email already has a quote. Use Start my fundraiser in that email."}
        </p>
      </div>
    );
  }

  return (
    <form className="card" id="apply" onSubmit={onSubmit}>
      <h2>Calculate your fundraiser</h2>
      <p className="hint">Tell us about the team. Your estimate stays on this page. No upfront cost.</p>
      <p>{TEAM_KEEP_ABOUT} {TEAM_PAYOUT_ROUND}</p>
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
      <label htmlFor="team">Team, Association or Club name</label>
      <input id="team" name="team" required />
      <label id="sport-label" htmlFor="sport">Sport / Activity</label>
      {sportsError ? (
        <p id="sport" className="alert error" role="alert">{SPORT_LIST_ERROR}</p>
      ) : (
        <SportField id="sport" labelId="sport-label" options={sports} value={sport} onChange={setSport} />
      )}
      {sport === OTHER_SPORT ? (
        <>
          <label htmlFor="sportOther">Which sport / activity?</label>
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
      <button className="btn btn-navy" type="submit" disabled={pending || sportsError}>
        {pending ? "Calculating…" : "See my estimate"}
      </button>
      <p className="fine">Your information is saved to Sweet Success and used to set up the fundraiser. It is not sold. The updates box starts unchecked.</p>
    </form>
  );
}
