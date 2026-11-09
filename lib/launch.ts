export const WAITLIST_FOLLOWUP_DAYS = 60;
export const COUNTDOWN_INTERVAL_DAYS = 7;
export const COUNTDOWN_FINAL_DAYS = 3;
export const LIVE_MAIL_INTERVAL_DAYS = 7;

export const LEADERBOARD_OPT_IN_LABEL = "OK to show my participant's first name and last initial in group updates";

export function requestTurnaroundText(env: Record<string, string | undefined> = process.env): string {
  const value = (env.REQUEST_TURNAROUND_TEXT || "shortly").trim();
  return value || "shortly";
}

export function shopPhase(start: string | null | undefined, end: string | null | undefined, today: string): "before" | "open" | "after" | "undated" {
  if (!start || !end) return "undated";
  if (today < start) return "before";
  if (today > end) return "after";
  return "open";
}

export function daysUntil(today: string, date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export type CountdownKind = "weekly" | "final";

export function countdownKind(today: string, start: string, sent: { weeklyAt: string | null; final: boolean }): CountdownKind | null {
  const days = daysUntil(today, start);
  if (days <= 0) return null;
  if (days <= COUNTDOWN_FINAL_DAYS && !sent.final) return "final";
  if (days > COUNTDOWN_FINAL_DAYS && !sent.weeklyAt) return "weekly";
  if (days > COUNTDOWN_FINAL_DAYS && sent.weeklyAt && daysUntil(sent.weeklyAt.slice(0, 10), today) >= COUNTDOWN_INTERVAL_DAYS) return "weekly";
  return null;
}

export type LiveMailKind = "launch" | "progress" | "midpoint" | "final" | "wrap";

export function liveMailKind(input: {
  today: string;
  start: string;
  end: string;
  launchSent: boolean;
  lastProgressOn: string | null;
  midpointSent: boolean;
  finalSent: boolean;
  wrapSent: boolean;
}): LiveMailKind | null {
  if (input.today < input.start) return null;
  if (input.today > input.end) return input.wrapSent ? null : "wrap";
  if (!input.launchSent) return "launch";
  const left = daysUntil(input.today, input.end);
  if (left > 0 && left <= COUNTDOWN_FINAL_DAYS && !input.finalSent) return "final";
  const span = Math.max(1, daysUntil(input.start, input.end));
  if (!input.midpointSent && daysUntil(input.start, input.today) >= Math.ceil(span / 2)) return "midpoint";
  const anchor = input.lastProgressOn || input.start;
  if (daysUntil(anchor, input.today) >= LIVE_MAIL_INTERVAL_DAYS) return "progress";
  return null;
}

export function waitlistDue(parkedOn: string, today: string, alreadySent: boolean): boolean {
  if (alreadySent) return false;
  return daysUntil(parkedOn, today) >= WAITLIST_FOLLOWUP_DAYS;
}
