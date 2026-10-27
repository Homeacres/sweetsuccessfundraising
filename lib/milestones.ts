export type MilestoneName = "start" | "midpoint" | "days_left" | "final_day" | "close";

export type MilestoneConfig = {
  timezone?: string;
  send_hour_local?: number;
  start?: { enabled?: boolean; days_after_start?: number };
  midpoint?: { enabled?: boolean };
  days_left?: { enabled?: boolean; days_before_end?: number };
  final_day?: { enabled?: boolean; days_before_end?: number };
  close?: { enabled?: boolean; trigger?: string };
};

export type MilestoneCampaign = {
  status: string;
  start_date: string | null;
  end_date: string | null;
};

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function zonedNow(now: Date, timeZone: string): { date: string; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
  };
}

function onOrAfter(local: { date: string; hour: number }, target: string, sendHour: number): boolean {
  if (local.date > target) return true;
  if (local.date === target && local.hour >= sendHour) return true;
  return false;
}

/**
 * Date-based milestones are due once local time has reached the target date
 * at send_hour_local, and only while the campaign is active. Close is due
 * whenever status is closed (it is not tied to the send hour).
 */
export function dueMilestones(campaign: MilestoneCampaign, config: MilestoneConfig, now: Date): MilestoneName[] {
  const timezone = config.timezone || "America/Edmonton";
  const sendHour = config.send_hour_local ?? 9;
  const local = zonedNow(now, timezone);
  const due: MilestoneName[] = [];

  if (campaign.status === "closed" && config.close?.enabled !== false) {
    due.push("close");
  }

  if (campaign.status !== "active") return due;

  if (config.start?.enabled !== false && campaign.start_date) {
    const target = addDays(campaign.start_date, config.start?.days_after_start ?? 0);
    if (onOrAfter(local, target, sendHour)) due.push("start");
  }

  if (config.midpoint?.enabled !== false && campaign.start_date && campaign.end_date) {
    const span = daysBetween(campaign.start_date, campaign.end_date);
    const target = addDays(campaign.start_date, Math.floor(span / 2));
    if (onOrAfter(local, target, sendHour)) due.push("midpoint");
  }

  if (config.days_left?.enabled !== false && campaign.end_date) {
    const target = addDays(campaign.end_date, -(config.days_left?.days_before_end ?? 3));
    if (onOrAfter(local, target, sendHour)) due.push("days_left");
  }

  if (config.final_day?.enabled !== false && campaign.end_date) {
    const target = addDays(campaign.end_date, -(config.final_day?.days_before_end ?? 0));
    if (onOrAfter(local, target, sendHour)) due.push("final_day");
  }

  return due;
}

export function milestoneEmailType(name: MilestoneName): string {
  return `parent_milestone_${name}`;
}

export const MILESTONE_SUBJECT: Record<MilestoneName, (team: string) => string> = {
  start: (team) => `${team} fundraiser is open`,
  midpoint: (team) => `${team} fundraiser is halfway there`,
  days_left: (team) => `${team} fundraiser is almost over`,
  final_day: (team) => `${team} fundraiser ends today`,
  close: (team) => `${team} fundraiser is closed`,
};
