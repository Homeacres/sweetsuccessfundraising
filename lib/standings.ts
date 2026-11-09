import { playerDisplayName } from "@/lib/names";

export type Seller = {
  id: string;
  first: string;
  last: string;
  bags: number;
  optedIn: boolean;
};

/** Whole-number percent of the goal. Never a dollar total. */
export function goalPercent(raisedCents: number, goalCents: number): number {
  if (!Number.isFinite(goalCents) || goalCents <= 0 || !Number.isFinite(raisedCents) || raisedCents <= 0) return 0;
  return Math.max(0, Math.round((raisedCents / goalCents) * 100));
}

/** Top sellers by bags. Opted-in people with sales only. Never zeros. At most 3. */
export function starSellers(rows: Seller[], limit = 3): string[] {
  return rows
    .filter((row) => row.optedIn && row.bags > 0)
    .sort((a, b) => b.bags - a.bags || a.first.localeCompare(b.first) || a.last.localeCompare(b.last))
    .slice(0, limit)
    .map((row) => playerDisplayName(row.first, row.last, true));
}

/** Null when the list would be empty, so the email line is dropped. */
export function starSellerLine(label: string, names: string[]): string | null {
  if (!names.length) return null;
  return `${label}: ${names.join(", ")}`;
}
