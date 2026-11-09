"use client";

import { useEffect, useState } from "react";
import { SportField } from "@/components/SportField";
import { applyThanksHeading } from "@/lib/apply-heading";
import { OTHER_SPORT, SPORT_LIST_ERROR, type SportChoice } from "@/lib/apply-sport";
import { CASL_CONSENT_TEXT } from "@/lib/consent";
import { type BagEstimate } from "@/lib/estimate";
import { formatQuoteGoal, TEAM_KEEP_ABOUT } from "@/lib/quote-copy";

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

const STORAGE_KEY = "ssf-calculator-v1";

type Draft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  team: string;
  sport: string;
  sportOther: string;
  city: string;
  postal: string;
  participants: string;
  goal: string;
  howHeard: string;
  consent: boolean;
};

type SavedQuote = {
  draft: Draft;
  firstName: string;
  email: string;
  summary: BagEstimate | null;
  startUrl: string | null;
};

function readSaved(): SavedQuote | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedQuote;
    if (!parsed?.draft || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}

function scrollToApply() {
  document.getElementById("apply")?.scrollIntoView({ block: "start" });
}

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
    <div className="card quote-card" id="apply">
      <h2>{applyThanksHeading(firstName)}</h2>
      {summary ? (
        <p>
          To raise {goal}, your group would sell about {bags} bags.
          {each ? ` That's about ${each} bags per participant.` : ""}
        </p>
      ) : null}
      <p>Your group makes $5 or more on every bag sold. That's at least 40% of every sale.</p>
      <p>We've emailed a copy of this quote to {email}.</p>
      <p className="fine">These are estimates. Nothing has started yet.</p>
      <h3>Ready when you are</h3>
      <p>On the next page, you'll pick a start window and confirm your participants and goal.</p>
      {startUrl ? <a className="btn btn-navy" href={startUrl}>Start my fundraiser</a> : null}
      <p className="fine">Not ready yet? Questions? <a href="mailto:hello@sweetsuccessfundraising.com">Email hello@sweetsuccessfundraising.com</a></p>
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
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formEpoch, setFormEpoch] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = readSaved();
    if (saved) {
      setDraft(saved.draft);
      setSport(saved.draft.sport);
      setSportOther(saved.draft.sportOther);
      setConsent(saved.draft.consent);
    }
    if (window.location.hash === "#quote" && saved) {
      setThanksName(saved.firstName);
      setThanksEmail(saved.email);
      setSummary(saved.summary);
      setStartUrl(saved.startUrl);
      setDone("saved");
      requestAnimationFrame(scrollToApply);
    } else if (!window.history.state?.ssf) {
      window.history.replaceState({ ssf: "form" }, "", "/#apply");
    }
    setReady(true);
    function onPop() {
      const current = readSaved();
      if (window.location.hash === "#quote" && current) {
        setThanksName(current.firstName);
        setThanksEmail(current.email);
        setSummary(current.summary);
        setStartUrl(current.startUrl);
        setDraft(current.draft);
        setSport(current.draft.sport);
        setSportOther(current.draft.sportOther);
        setConsent(current.draft.consent);
        setDone("saved");
        requestAnimationFrame(scrollToApply);
        return;
      }
      if (current) {
        setDraft(current.draft);
        setSport(current.draft.sport);
        setSportOther(current.draft.sportOther);
        setConsent(current.draft.consent);
        setFormEpoch((value) => value + 1);
      }
      setDone(null);
      requestAnimationFrame(scrollToApply);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

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
      const next = data.outOfArea ? "away" : data.already ? "already" : "saved";
      if (next === "saved") {
        const savedQuote: SavedQuote = {
          draft: {
            firstName: String(form.get("firstName") || ""),
            lastName: String(form.get("lastName") || ""),
            email: String(form.get("email") || ""),
            phone: String(form.get("phone") || ""),
            team: String(form.get("team") || ""),
            sport,
            sportOther,
            city: String(form.get("city") || ""),
            postal: String(form.get("postal") || ""),
            participants: String(form.get("participants") || ""),
            goal: String(form.get("goal") || ""),
            howHeard: String(form.get("howHeard") || ""),
            consent,
          },
          firstName: String(form.get("firstName") || ""),
          email: String(form.get("email") || ""),
          summary: data.summary ?? null,
          startUrl: data.startUrl ?? null,
        };
        setDraft(savedQuote.draft);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(savedQuote));
        if (window.location.hash !== "#quote") {
          window.history.replaceState({ ssf: "form" }, "", "/#apply");
          window.history.pushState({ ssf: "quote" }, "", "/#quote");
        }
      }
      setDone(next);
      if (next === "saved") requestAnimationFrame(scrollToApply);
    } catch {
      setError("We couldn't save that. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (!ready) return <div className="card" id="apply" aria-busy="true" />;

  if (done === "saved") {
    return <ApplyConfirmation firstName={thanksName} email={thanksEmail} summary={summary} startUrl={startUrl} />;
  }

  if (done) {
    return (
      <div className="card quote-card" id="apply">
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
    <form className="card" id="apply" key={formEpoch} onSubmit={onSubmit}>
      <h2>Calculate your fundraiser</h2>
      <p className="hint">Tell us about your group. Your estimate stays on this page. No upfront cost.</p>
      <p>{TEAM_KEEP_ABOUT}</p>
      <div className="row two">
        <div>
          <label htmlFor="firstName">First name</label>
          <input id="firstName" name="firstName" autoComplete="given-name" required defaultValue={draft?.firstName || ""} />
        </div>
        <div>
          <label htmlFor="lastName">Last name</label>
          <input id="lastName" name="lastName" autoComplete="family-name" required defaultValue={draft?.lastName || ""} />
        </div>
      </div>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" autoComplete="email" required defaultValue={draft?.email || ""} />
      <label htmlFor="phone">Phone <span className="fine">(optional)</span></label>
      <input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={draft?.phone || ""} />
      <label htmlFor="team">Team, Association or Club name</label>
      <input id="team" name="team" required defaultValue={draft?.team || ""} />
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
          <input id="city" name="city" autoComplete="address-level2" defaultValue={draft?.city || ""} />
        </div>
        <div>
          <label htmlFor="postal">Postal code</label>
          <input id="postal" name="postal" autoComplete="postal-code" placeholder="T0M 1X0" required defaultValue={draft?.postal || ""} />
        </div>
      </div>
      <div className="row two">
        <div>
          <label htmlFor="participants">Number of participants</label>
          <input id="participants" name="participants" inputMode="numeric" min={1} max={200} step={1} required defaultValue={draft?.participants || ""} />
        </div>
        <div>
          <label htmlFor="goal">Goal your group keeps ($)</label>
          <input id="goal" name="goal" inputMode="decimal" min={100} required defaultValue={draft?.goal || ""} />
        </div>
      </div>
      <label htmlFor="howHeard">How did you hear about us?</label>
      <select id="howHeard" name="howHeard" defaultValue={draft?.howHeard || ""}>
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
