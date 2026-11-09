const ZONE = "America/Edmonton";
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

const calendarDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const zonedStamp = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Friendly date for people. A `YYYY-MM-DD` calendar date is formatted as that
 * day (Nov 15, 2026) and is not parsed with `new Date`, which would treat it
 * as UTC midnight and shift it back in America/Edmonton. Timestamps are shown
 * in America/Edmonton.
 */
export function formatUserDate(value: string | Date | null | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "";
    const match = DATE_ONLY.exec(trimmed);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (month < 1 || month > 12 || day < 1 || day > 31) return trimmed;
      return calendarDate.format(new Date(Date.UTC(year, month - 1, day)));
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return trimmed;
    return zonedStamp.format(parsed);
  }
  if (Number.isNaN(value.getTime())) return "";
  return zonedStamp.format(value);
}
