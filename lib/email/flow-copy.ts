import { SIGN_OFF_NAME, prospectReplyTo } from "@/lib/email/prospect";
import { requestTurnaroundText } from "@/lib/launch";
import { starSellerLine } from "@/lib/standings";

export type FlowEmail = {
  subject: string;
  preview: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

function esc(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function ending(unsubscribeUrl: string): { text: string; html: string } {
  return {
    text: `Or just reply with any questions.\n\nThanks,\n${SIGN_OFF_NAME}\nUnsubscribe: ${unsubscribeUrl}`,
    html: `<p>Or just reply with any questions.</p>
<p>Thanks,<br>${esc(SIGN_OFF_NAME)}</p>
<p><a href="${esc(unsubscribeUrl)}">Unsubscribe</a></p>`,
  };
}

function link(url: string, label: string): { text: string; html: string } {
  return { text: `${label}: ${url}`, html: `<p><a href="${esc(url)}">${esc(label)}</a></p>` };
}

function stars(label: string, names: string[]): { text: string; html: string } {
  const line = starSellerLine(label, names);
  if (!line) return { text: "", html: "" };
  return { text: `${line}\n`, html: `<p>${esc(line)}</p>` };
}

function replyHeaders(env: Record<string, string | undefined> = process.env): Record<string, string> | undefined {
  const reply = prospectReplyTo("team", env);
  return reply ? { "Reply-To": reply } : undefined;
}

export function passedGoal(goalPct: number): boolean {
  return goalPct >= 100;
}

export function passedGoalSubject(teamName: string): string {
  return `${teamName} passed its goal!`;
}

export function passedGoalFirstLine(teamName: string, goalPct: number): string {
  return `${teamName} has passed its goal (${goalPct}%)!`;
}

export function requestReceivedEmail(input: {
  firstName: string;
  teamName: string;
  startWindow: string;
  participants: number;
  goal: string;
  unsubscribeUrl: string;
  env?: Record<string, string | undefined>;
}): FlowEmail {
  const shortly = requestTurnaroundText(input.env);
  const end = ending(input.unsubscribeUrl);
  const preview = `We'll confirm your start window ${shortly}.`;
  const text = `Hi ${input.firstName},

Thanks! Here's what you sent us:
- Start window: ${input.startWindow}
- Participants: ${input.participants}
- Goal: ${input.goal}
We'll check the schedule and confirm your window ${shortly}. Nothing else to do for now.

${end.text}`;
  const html = `<p>Hi ${esc(input.firstName)},</p>
<p>Thanks! Here's what you sent us:</p>
<ul>
<li>Start window: ${esc(input.startWindow)}</li>
<li>Participants: ${input.participants}</li>
<li>Goal: ${esc(input.goal)}</li>
</ul>
<p>We'll check the schedule and confirm your window ${esc(shortly)}. Nothing else to do for now.</p>
${end.html}`;
  return { subject: `We've got your ${input.teamName} request`, preview, text, html, headers: replyHeaders(input.env) };
}

export function alternateWindowEmail(input: {
  firstName: string;
  teamName: string;
  startWindow: string;
  altWindow: string;
  acceptUrl: string;
  pickUrl: string;
  unsubscribeUrl: string;
  env?: Record<string, string | undefined>;
}): FlowEmail {
  const end = ending(input.unsubscribeUrl);
  const take = link(input.acceptUrl, `Take ${input.altWindow}`);
  const pick = link(input.pickUrl, "pick another slot");
  const preview = `${input.startWindow} is full. How about ${input.altWindow}?`;
  const text = `Hi ${input.firstName},

${input.startWindow} is already booked up, but we can fit ${input.teamName} in for ${input.altWindow}.

${take.text}

None of these work? ${pick.text} lets you pick another slot, join the waitlist, or tell us 'not this season'.

${end.text}`;
  const html = `<p>Hi ${esc(input.firstName)},</p>
<p>${esc(input.startWindow)} is already booked up, but we can fit ${esc(input.teamName)} in for ${esc(input.altWindow)}.</p>
${take.html}
<p>None of these work? <a href="${esc(input.pickUrl)}">pick another slot</a> lets you pick another slot, join the waitlist, or tell us 'not this season'.</p>
${end.html}`;
  return { subject: `A start window that works for ${input.teamName}`, preview, text, html, headers: replyHeaders(input.env) };
}

export function approvedEmail(input: {
  firstName: string;
  teamName: string;
  startWindow: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
  env?: Record<string, string | undefined>;
}): FlowEmail {
  const end = ending(input.unsubscribeUrl);
  const dash = link(input.dashboardUrl, "Open your team dashboard");
  const text = `Hi ${input.firstName},

Thanks for choosing Sweet Success. ${input.teamName} is confirmed for ${input.startWindow}.
Your dashboard is where you'll see sign-ups and sales as they come in.

${dash.text}

Next, we'll email you a short invite that's ready to forward to your participants' families.

${end.text}`;
  const html = `<p>Hi ${esc(input.firstName)},</p>
<p>Thanks for choosing Sweet Success. ${esc(input.teamName)} is confirmed for ${esc(input.startWindow)}.</p>
<p>Your dashboard is where you'll see sign-ups and sales as they come in.</p>
${dash.html}
<p>Next, we'll email you a short invite that's ready to forward to your participants' families.</p>
${end.html}`;
  return { subject: `You're on! ${input.teamName} starts ${input.startWindow}`, preview: "Thanks for choosing us. Here's your dashboard.", text, html, headers: replyHeaders(input.env) };
}

export function parentInviteEmail(input: {
  teamName: string;
  startWindow: string;
  goal: string;
  signupUrl: string;
  unsubscribeUrl: string;
  env?: Record<string, string | undefined>;
}): FlowEmail {
  const end = ending(input.unsubscribeUrl);
  const sign = link(input.signupUrl, "Sign up your participant");
  const text = `Hi everyone,

${input.teamName} is running a Sweet Success fundraiser from ${input.startWindow}. Our goal is to raise ${input.goal} for the group.
How it works:
1. Sign up your participant below. It takes a minute.
2. You'll get their own order link to share with family, friends and supporters.
3. Supporters order online. Standard bags are $12 and premium bags are $14, GST included, and our group keeps $5 or $6 from every bag.
4. When the fundraiser ends, the whole order comes to our organizer, who hands it out.

${sign.text}

Thanks for helping out!

${end.text}`;
  const html = `<p>Hi everyone,</p>
<p>${esc(input.teamName)} is running a Sweet Success fundraiser from ${esc(input.startWindow)}. Our goal is to raise ${esc(input.goal)} for the group.</p>
<p>How it works:</p>
<ol>
<li>Sign up your participant below. It takes a minute.</li>
<li>You'll get their own order link to share with family, friends and supporters.</li>
<li>Supporters order online. Standard bags are $12 and premium bags are $14, GST included, and our group keeps $5 or $6 from every bag.</li>
<li>When the fundraiser ends, the whole order comes to our organizer, who hands it out.</li>
</ol>
${sign.html}
<p>Thanks for helping out!</p>
${end.html}`;
  return {
    subject: `Join the ${input.teamName} fundraiser: sign up your participant`,
    preview: "Quick sign-up so your participant gets their own order link.",
    text,
    html,
    headers: replyHeaders(input.env),
  };
}

export function countdownEmail(input: {
  firstName: string;
  teamName: string;
  signedUp: number;
  participants: number;
  remaining: number;
  daysToLaunch: number;
  signupUrl: string;
  dashboardUrl: string;
  unsubscribeUrl: string;
  env?: Record<string, string | undefined>;
}): FlowEmail {
  const end = ending(input.unsubscribeUrl);
  const again = link(input.signupUrl, "Re-send the parent invite");
  const dash = link(input.dashboardUrl, "Open your team dashboard");
  const text = `Hi ${input.firstName},

Quick update: ${input.signedUp} of ${input.participants} participants are signed up. That's ${input.remaining} to go, and you launch in ${input.daysToLaunch} days.
Everyone who signs up before launch gets their order link on day one. If a few families haven't seen the invite yet, forwarding it again usually does the trick.

${again.text}
${dash.text}

${end.text}`;
  const html = `<p>Hi ${esc(input.firstName)},</p>
<p>Quick update: ${input.signedUp} of ${input.participants} participants are signed up. That's ${input.remaining} to go, and you launch in ${input.daysToLaunch} days.</p>
<p>Everyone who signs up before launch gets their order link on day one. If a few families haven't seen the invite yet, forwarding it again usually does the trick.</p>
${again.html}
${dash.html}
${end.html}`;
  return {
    subject: `${input.signedUp} of ${input.participants} signed up for ${input.teamName}`,
    preview: `${input.remaining} to go, launching in ${input.daysToLaunch} days.`,
    text,
    html,
    headers: replyHeaders(input.env),
  };
}

export function parkedEmail(input: {
  firstName: string;
  teamName: string;
  estimateUrl: string;
  unsubscribeUrl: string;
  waitlist: boolean;
  env?: Record<string, string | undefined>;
}): FlowEmail {
  const end = ending(input.unsubscribeUrl);
  const estimate = link(input.estimateUrl, "your estimate");
  const body = input.waitlist
    ? "You're on the waitlist. We'll email you if a window opens up."
    : `Thanks for letting us know. We've paused ${input.teamName}'s request and won't send any more reminders.\nWhen the timing's better, your estimate is still here: ${estimate.text}. You can pick a new window anytime.\nGood luck to ${input.teamName} this season.`;
  const htmlBody = input.waitlist
    ? `<p>You're on the waitlist. We'll email you if a window opens up.</p>`
    : `<p>Thanks for letting us know. We've paused ${esc(input.teamName)}'s request and won't send any more reminders.</p>
<p>When the timing's better, your estimate is still here: <a href="${esc(input.estimateUrl)}">your estimate</a>. You can pick a new window anytime.</p>
<p>Good luck to ${esc(input.teamName)} this season.</p>`;
  const text = `Hi ${input.firstName},\n\n${body}\n\n${end.text}`;
  const html = `<p>Hi ${esc(input.firstName)},</p>\n${htmlBody}\n${end.html}`;
  return {
    subject: `No problem, ${input.firstName}`,
    preview: "We'll be here when the timing's right.",
    text,
    html,
    headers: replyHeaders(input.env),
  };
}

export type LiveLinks = {
  firstName: string;
  teamName: string;
  goal: string;
  goalPct: number;
  daysLeft: number;
  endDate: string;
  salesTotal: string;
  periodStars: string[];
  overallStars: string[];
  dashboardUrl: string | null;
  supporterLinks: { name: string; url: string }[];
  unsubscribeUrl: string;
  env?: Record<string, string | undefined>;
};

function audience(input: LiveLinks): { text: string; html: string } {
  const parts: string[] = [];
  const html: string[] = [];
  if (input.dashboardUrl) {
    const dash = link(input.dashboardUrl, "Open your team dashboard");
    parts.push(dash.text);
    html.push(dash.html);
  }
  for (const item of input.supporterLinks) {
    const row = link(item.url, item.name);
    parts.push(row.text);
    html.push(row.html);
  }
  return { text: parts.join("\n"), html: html.join("\n") };
}

export function progressEmail(input: LiveLinks): FlowEmail {
  const end = ending(input.unsubscribeUrl);
  const over = passedGoal(input.goalPct);
  const subject = over ? passedGoalSubject(input.teamName) : `${input.teamName} is ${input.goalPct}% of the way there!`;
  const first = over ? passedGoalFirstLine(input.teamName, input.goalPct) : `${input.teamName} is at ${input.goalPct}% of its goal. Thanks to everyone who's shared so far!`;
  const period = stars("Star sellers since our last update", input.periodStars);
  const links = audience(input);
  const text = `Hi ${input.firstName},\n\n${first}\n${period.text}Every bag counts, whether it's the first one or the fiftieth.\nTips to keep it going:\n- Send a personal note with your link. It works better than a plain link.\n- Ask grandparents and neighbours. They love supporting local groups.\n- Mention premium bags: they're $14, and $6 goes to the group.\n\n${links.text}\n\n${end.text}`;
  const html = `<p>Hi ${esc(input.firstName)},</p><p>${esc(first)}</p>${period.html}<p>Every bag counts, whether it's the first one or the fiftieth.</p><p>Tips to keep it going:</p><ul><li>Send a personal note with your link. It works better than a plain link.</li><li>Ask grandparents and neighbours. They love supporting local groups.</li><li>Mention premium bags: they're $14, and $6 goes to the group.</li></ul>${links.html}${end.html}`;
  return { subject, preview: "Big thanks to everyone sharing, plus this week's star sellers.", text, html, headers: replyHeaders(input.env) };
}

export function midpointEmail(input: LiveLinks): FlowEmail {
  const end = ending(input.unsubscribeUrl);
  const over = passedGoal(input.goalPct);
  const subject = over ? passedGoalSubject(input.teamName) : `Halfway through for ${input.teamName}`;
  const first = over ? passedGoalFirstLine(input.teamName, input.goalPct) : `We're halfway through the fundraiser. ${input.teamName} is at ${input.goalPct}% of its goal with ${input.daysLeft} days to go.`;
  const period = stars("Star sellers since our last update", input.periodStars);
  const overall = stars("Top sellers so far", input.overallStars);
  const links = audience(input);
  const text = `Hi ${input.firstName},\n\n${first}\n${period.text}${overall.text}Every participant helps get us there. If you haven't shared your link in a while, now's a great time to send it out again.\n\n${links.text}\n\n${end.text}`;
  const html = `<p>Hi ${esc(input.firstName)},</p><p>${esc(first)}</p>${period.html}${overall.html}<p>Every participant helps get us there. If you haven't shared your link in a while, now's a great time to send it out again.</p>${links.html}${end.html}`;
  return { subject, preview: `${input.goalPct}% of goal and ${input.daysLeft} days to go.`, text, html, headers: replyHeaders(input.env) };
}

export function finalDaysEmail(input: LiveLinks): FlowEmail {
  const end = ending(input.unsubscribeUrl);
  const over = passedGoal(input.goalPct);
  const subject = over ? passedGoalSubject(input.teamName) : `${input.daysLeft} days left for ${input.teamName}`;
  const first = over ? passedGoalFirstLine(input.teamName, input.goalPct) : `The ${input.teamName} fundraiser closes on ${input.endDate}, and we're at ${input.goalPct}% of our goal.`;
  const period = stars("Star sellers since our last update", input.periodStars);
  const overall = stars("Top sellers so far", input.overallStars);
  const links = audience(input);
  const text = `Hi ${input.firstName},\n\n${first}\n${period.text}${overall.text}Every bag counts in the final stretch. Send your link to anyone who meant to order but hasn't yet.\n\n${links.text}\n\n${end.text}`;
  const html = `<p>Hi ${esc(input.firstName)},</p><p>${esc(first)}</p>${period.html}${overall.html}<p>Every bag counts in the final stretch. Send your link to anyone who meant to order but hasn't yet.</p>${links.html}${end.html}`;
  return { subject, preview: `${input.goalPct}% there. One more share can do it.`, text, html, headers: replyHeaders(input.env) };
}

export function wrapUpEmail(input: LiveLinks): FlowEmail {
  const end = ending(input.unsubscribeUrl);
  const overall = stars("A special shout-out to our top sellers", input.overallStars);
  const text = `Hi ${input.firstName},\n\nThe ${input.teamName} fundraiser is closed, and together you raised ${input.salesTotal} (${input.goalPct}% of the goal). Thank you to every participant, family and supporter!\n${overall.text}Every single bag helped get us here, and everyone who shared made a difference.\nWhat's next: we deliver the whole order to your organizer, who'll add your group's personal touch and hand it out.\n\n${end.text}`;
  const html = `<p>Hi ${esc(input.firstName)},</p><p>The ${esc(input.teamName)} fundraiser is closed, and together you raised ${esc(input.salesTotal)} (${input.goalPct}% of the goal). Thank you to every participant, family and supporter!</p>${overall.html}<p>Every single bag helped get us here, and everyone who shared made a difference.</p><p>What's next: we deliver the whole order to your organizer, who'll add your group's personal touch and hand it out.</p>${end.html}`;
  return {
    subject: `Thank you from ${input.teamName}!`,
    preview: `You raised ${input.salesTotal}. Here's what happens next.`,
    text,
    html,
    headers: replyHeaders(input.env),
  };
}

export function launchEmail(input: LiveLinks): FlowEmail {
  const end = ending(input.unsubscribeUrl);
  const links = audience(input);
  const text = `Hi ${input.firstName},\n\nWe're live! The ${input.teamName} fundraiser runs until ${input.endDate}, and the goal is ${input.goal}.\nShare your link with family, friends and supporters today:\n\n${links.text}\n\nA few easy ways to share: text it to family, post it in your group chats, and ask a couple of people to pass it on.\n\n${end.text}`;
  const html = `<p>Hi ${esc(input.firstName)},</p><p>We're live! The ${esc(input.teamName)} fundraiser runs until ${esc(input.endDate)}, and the goal is ${esc(input.goal)}.</p><p>Share your link with family, friends and supporters today:</p>${links.html}<p>A few easy ways to share: text it to family, post it in your group chats, and ask a couple of people to pass it on.</p>${end.html}`;
  return { subject: `${input.teamName}'s fundraiser is live!`, preview: "Share your link today. The first day counts.", text, html, headers: replyHeaders(input.env) };
}
