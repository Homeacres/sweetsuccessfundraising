import { CopyLink } from "@/components/CopyLink";
import { LEADERBOARD_OPT_IN_LABEL } from "@/lib/launch";
import { starSellerLine } from "@/lib/standings";

export type WindowChoice = { id: string; label: string };

export function StartRequestForm(props: {
  team: string;
  windows: WindowChoice[];
  participants: number;
  goal: number;
  token: string;
  already?: boolean;
}) {
  if (props.already) {
    return (
      <main className="page wrap">
        <div className="card" style={{ maxWidth: 560 }}>
          <h1>We've got your request</h1>
          <p>{props.team} is in review. Follow-up emails have stopped.</p>
        </div>
      </main>
    );
  }
  return (
    <main className="page wrap">
      <div className="card" style={{ maxWidth: 560 }}>
        <h1>Start my fundraiser</h1>
        <p>Pick an open window for {props.team}, and confirm the participants and goal.</p>
        <form method="post" action="/api/o/start">
          <input type="hidden" name="token" value={props.token} />
          <label htmlFor="windowId">Start window</label>
          <select id="windowId" name="windowId" required defaultValue="">
            <option value="" disabled>Select a window</option>
            {props.windows.map((window) => <option key={window.id} value={window.id}>{window.label}</option>)}
          </select>
          <label htmlFor="participants">Participants</label>
          <input id="participants" name="participants" type="number" min={1} max={200} required defaultValue={props.participants} />
          <label htmlFor="goal">Goal the group keeps (CAD)</label>
          <input id="goal" name="goal" type="number" min={100} required defaultValue={props.goal} />
          <button className="btn btn-navy" type="submit" style={{ marginTop: 16 }}>Send my request</button>
        </form>
      </div>
    </main>
  );
}

export function PickWindowForm(props: { team: string; windows: WindowChoice[]; token: string }) {
  return (
    <main className="page wrap">
      <div className="card" style={{ maxWidth: 560 }}>
        <h1>Pick another window</h1>
        <p>None of the offered windows worked for {props.team}. Choose another open slot, or park the request.</p>
        <form method="post" action="/api/o/window">
          <input type="hidden" name="token" value={props.token} />
          <label htmlFor="windowId">Open windows</label>
          <select id="windowId" name="windowId" required defaultValue="">
            <option value="" disabled>Select a window</option>
            {props.windows.map((window) => <option key={window.id} value={window.id}>{window.label}</option>)}
          </select>
          <button className="btn btn-navy" type="submit" name="choice" value="resubmit" style={{ marginTop: 16 }}>Send this window for review</button>
        </form>
        <form method="post" action="/api/o/window" style={{ marginTop: 12 }}>
          <input type="hidden" name="token" value={props.token} />
          <button className="btn btn-ghost" type="submit" name="choice" value="waitlist">Join the waitlist</button>
        </form>
        <form method="post" action="/api/o/window">
          <input type="hidden" name="token" value={props.token} />
          <button className="btn btn-ghost" type="submit" name="choice" value="not_this_season">Not this season</button>
        </form>
      </div>
    </main>
  );
}

export function AcceptWindow(props: { team: string; windowLabel: string; token: string }) {
  return (
    <main className="page wrap">
      <div className="card" style={{ maxWidth: 560 }}>
        <h1>Take {props.windowLabel}</h1>
        <p>Accept this window and {props.team} is approved.</p>
        <form method="post" action="/api/o/window">
          <input type="hidden" name="token" value={props.token} />
          <button className="btn btn-navy" type="submit" name="choice" value="accept">Take {props.windowLabel}</button>
        </form>
      </div>
    </main>
  );
}

export const PARENT_OPT_IN_LABEL = LEADERBOARD_OPT_IN_LABEL;

export function ParentSignupDone(props: {
  team: string;
  links: { name: string; href: string }[];
  addHref: string;
}) {
  return (
    <main className="page wrap">
      <h1>You're signed up</h1>
      <p className="sub">{props.team}. Share each participant's link.</p>
      {props.links.map((item) => (
        <CopyLink key={item.href} label={item.name} href={item.href} />
      ))}
      <p className="fine"><a href={props.addHref}>Add another child</a></p>
    </main>
  );
}

export function ParentSignupForm(props: { team: string; token: string }) {
  return (
    <main className="page wrap">
      <h1>Sign up your participant</h1>
      <p className="sub">{props.team}. One parent can add more than one child.</p>
      <form method="post" action="/api/p/join" className="panel">
        <input type="hidden" name="token" value={props.token} />
        <label htmlFor="parentFirst">Your first name</label>
        <input id="parentFirst" name="parentFirst" required />
        <label htmlFor="parentLast">Your last name</label>
        <input id="parentLast" name="parentLast" required />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
        <label htmlFor="phone">Phone <span className="fine">(optional)</span></label>
        <input id="phone" name="phone" type="tel" />
        <label htmlFor="childFirst">Child first name</label>
        <input id="childFirst" name="childFirst" required />
        <label htmlFor="childLast">Child last initial</label>
        <input id="childLast" name="childLast" required maxLength={20} />
        <label htmlFor="child2First">Another child first name <span className="fine">(optional)</span></label>
        <input id="child2First" name="child2First" />
        <label htmlFor="child2Last">Another child last initial</label>
        <input id="child2Last" name="child2Last" maxLength={20} />
        <label className="check">
          <input type="checkbox" name="leaderboard" />
          <span>{PARENT_OPT_IN_LABEL}</span>
        </label>
        <label className="check">
          <input type="checkbox" name="consent" required />
          <span>I agree to be contacted about this fundraiser. I can unsubscribe at any time.</span>
        </label>
        <button className="btn btn-navy" type="submit">Sign up</button>
      </form>
    </main>
  );
}

export function TeamDashboardView(props: {
  team: string;
  phase: "before" | "open" | "after";
  startLabel: string;
  endLabel: string;
  goal: string;
  goalPct: number;
  periodStars: string[];
  overallStars: string[];
  roster: { name: string; href: string }[];
}) {
  const period = starSellerLine("Star sellers since our last update", props.periodStars);
  const overall = starSellerLine("Top sellers so far", props.overallStars);
  const stages = [
    { id: "setup", label: "Setup", state: props.phase === "before" ? "Now" : "Done" },
    { id: "selling", label: "Selling", state: props.phase === "open" ? "Now" : props.phase === "after" ? "Done" : "Coming" },
    { id: "close", label: "Order close", state: "Coming" },
    { id: "delivery", label: "Delivery", state: "Coming" },
    { id: "payout", label: "Payout", state: "Coming" },
  ];
  return (
    <main className="page wrap">
      <p className="kicker">Team dashboard</p>
      <h1>{props.team}</h1>
      <p>{props.startLabel} to {props.endLabel}</p>
      <p>Goal {props.goal}. {props.phase === "open" || props.phase === "after" ? `${props.goalPct}% of the goal.` : "Selling has not started."}</p>
      <ul className="prices">
        {stages.map((stage) => <li key={stage.id}><strong>{stage.label}</strong> · {stage.state}</li>)}
      </ul>
      {props.phase === "after" ? <p>The whole order is delivered to the organizer.</p> : null}
      {period ? <p>{period}</p> : null}
      {overall ? <p>{overall}</p> : null}
      <h2>Roster</h2>
      {props.roster.length === 0 ? <p>No participants yet.</p> : props.roster.map((person) => (
        <p key={person.href}><a href={person.href}>{person.name}</a></p>
      ))}
    </main>
  );
}

export function StartsOn(props: { team: string; dateLabel: string }) {
  return (
    <main className="page wrap">
      <h1>{props.team}</h1>
      <p>This fundraiser starts on {props.dateLabel}.</p>
    </main>
  );
}

export function ReviewQueue(props: {
  rows: { id: string; name: string; team: string; windowLabel: string; participants: number; goal: string }[];
  windows: WindowChoice[];
}) {
  return (
    <main className="page wrap">
      <h1>Review queue</h1>
      {props.rows.length === 0 ? <p>No requests waiting.</p> : (
        <div className="table-wrap panel">
          <table>
            <thead><tr><th>Name</th><th>Team</th><th>Window</th><th>Participants</th><th>Goal</th><th></th></tr></thead>
            <tbody>
              {props.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td>{row.team}</td>
                  <td>{row.windowLabel}</td>
                  <td>{row.participants}</td>
                  <td>{row.goal}</td>
                  <td>
                    <form method="post" action={`/api/admin/reviews/${row.id}/approve`}>
                      <button className="btn btn-navy" type="submit">Approve</button>
                    </form>
                    <form method="post" action={`/api/admin/reviews/${row.id}/alternate`}>
                      <label htmlFor={`alt-${row.id}`}>Alternate window</label>
                      <select id={`alt-${row.id}`} name="windowId" required defaultValue="">
                        <option value="" disabled>Select</option>
                        {props.windows.map((window) => <option key={window.id} value={window.id}>{window.label}</option>)}
                      </select>
                      <button className="btn btn-ghost" type="submit">Offer alternate</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
