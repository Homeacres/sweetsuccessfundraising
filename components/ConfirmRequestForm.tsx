"use client";

import { useState } from "react";

type Details = {
  team: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  sport: string;
  city: string;
  postal: string;
  province: string;
  howHeard: string;
  participants: number;
  goal: number;
};

export function ConfirmRequestForm(props: {
  details: Details;
  windows: { id: string; label: string }[];
  token: string;
}) {
  const details = props.details;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ heading: string; body: string } | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const response = await fetch("/api/o/start", { method: "POST", body: new FormData(event.currentTarget) });
      const data = (await response.json()) as { ok?: boolean; error?: string; heading?: string; body?: string };
      if (!response.ok || !data.ok || !data.heading || !data.body) {
        setError(data.error || "We couldn't save that. Please try again.");
        setPending(false);
        return;
      }
      setSuccess({ heading: data.heading, body: data.body });
    } catch {
      setError("We couldn't save that. Please try again.");
      setPending(false);
    }
  }

  if (success) {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <h1>{success.heading}</h1>
        <p>{success.body}</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h1>Confirm your fundraiser</h1>
      <p>These details come from your estimate. Pick a start window, change anything that needs it, then confirm.</p>
      <form onSubmit={onSubmit}>
        <input type="hidden" name="token" value={props.token} />
        <label htmlFor="team">Team, Association or Club name</label>
        <input id="team" name="team" required defaultValue={details.team} />
        <div className="row two">
          <div>
            <label htmlFor="firstName">First name</label>
            <input id="firstName" name="firstName" required defaultValue={details.firstName} />
          </div>
          <div>
            <label htmlFor="lastName">Last name</label>
            <input id="lastName" name="lastName" required defaultValue={details.lastName} />
          </div>
        </div>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required defaultValue={details.email} />
        <label htmlFor="phone">Phone <span className="fine">(optional)</span></label>
        <input id="phone" name="phone" type="tel" defaultValue={details.phone} />
        <label htmlFor="sport">Sport / Activity</label>
        <input id="sport" name="sport" required defaultValue={details.sport} />
        <div className="row two">
          <div>
            <label htmlFor="city">City</label>
            <input id="city" name="city" defaultValue={details.city} />
          </div>
          <div>
            <label htmlFor="postal">Postal code</label>
            <input id="postal" name="postal" defaultValue={details.postal} />
          </div>
        </div>
        {details.province ? <p className="fine">Province {details.province}</p> : null}
        <label htmlFor="howHeard">How did you hear about us?</label>
        <input id="howHeard" name="howHeard" defaultValue={details.howHeard} />
        <div className="row two">
          <div>
            <label htmlFor="participants">Participants</label>
            <input id="participants" name="participants" type="number" min={1} max={200} required defaultValue={details.participants} />
          </div>
          <div>
            <label htmlFor="goal">Goal your group keeps ($)</label>
            <input id="goal" name="goal" type="number" min={100} required defaultValue={details.goal} />
          </div>
        </div>
        <label htmlFor="windowId">Start window</label>
        <select id="windowId" name="windowId" required defaultValue="">
          <option value="" disabled>Select a window</option>
          {props.windows.map((window) => <option key={window.id} value={window.id}>{window.label}</option>)}
        </select>
        {error ? <div className="alert error" role="alert">{error}</div> : null}
        <button className="btn btn-navy" type="submit" disabled={pending} style={{ marginTop: 16 }}>{pending ? "Sending…" : "Send my request"}</button>
      </form>
    </div>
  );
}
