import { addDays } from "@/lib/milestones";

export type RemittanceDeadlineMode = "campaign_cutoff" | "days_after_cutoff" | "fixed_date";

export type RemittanceDeadlineSetting = {
  mode: RemittanceDeadlineMode;
  days: number;
  date: string | null;
};

export const DEFAULT_REMITTANCE_DEADLINE: RemittanceDeadlineSetting = {
  mode: "campaign_cutoff",
  days: 0,
  date: null,
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** platform_config.remittance_deadline. Default is each campaign's order cut-off. */
export function parseRemittanceDeadline(value: unknown): RemittanceDeadlineSetting {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  if (record.mode === "fixed_date") {
    const date = typeof record.date === "string" && DATE_ONLY.test(record.date) ? record.date : null;
    return { mode: "fixed_date", days: 0, date };
  }
  if (record.mode === "days_after_cutoff") {
    const parsed = typeof record.days === "number" ? record.days : Number(record.days);
    const days = Number.isInteger(parsed) && parsed >= 0 && parsed <= 365 ? parsed : 0;
    return { mode: "days_after_cutoff", days, date: null };
  }
  return { ...DEFAULT_REMITTANCE_DEADLINE };
}

/**
 * Last calendar date a cash remittance can clear and still be packed.
 * An unusable fixed date falls back to the campaign order cut-off, matching
 * public.fn_remittance_deadline.
 */
export function remittanceDeadlineDate(setting: RemittanceDeadlineSetting, campaignEnd: string | null): string | null {
  if (setting.mode === "fixed_date" && setting.date) return setting.date;
  if (!campaignEnd || !DATE_ONLY.test(campaignEnd)) return null;
  if (setting.mode === "days_after_cutoff") return addDays(campaignEnd, setting.days);
  return campaignEnd;
}

export function describeRemittanceDeadline(setting: RemittanceDeadlineSetting): string {
  if (setting.mode === "fixed_date" && setting.date) return `One date for every campaign: ${setting.date}.`;
  if (setting.mode === "days_after_cutoff") {
    if (setting.days === 0) return "The campaign order cut-off.";
    return `${setting.days} day${setting.days === 1 ? "" : "s"} after the campaign order cut-off.`;
  }
  return "The campaign order cut-off.";
}

/**
 * Card sales count as soon as they are paid. Cash counts only when the
 * remittance cleared on or before the deadline (Edmonton calendar date).
 */
export function cashCountsForProduction(input: {
  paymentMethod: string | null;
  paymentStatus: string;
  remittedOn: string | null;
  deadline: string | null;
}): boolean {
  if (input.paymentStatus !== "paid") return false;
  if (input.paymentMethod !== "cash") return true;
  if (!input.remittedOn || !input.deadline) return false;
  return input.remittedOn <= input.deadline;
}
