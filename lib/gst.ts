import { formatCad } from "@/lib/money";

/** GST already inside a tax-inclusive total. 5/105, rounded to the nearest cent. */
export function gstIncludedCents(totalCents: number): number {
  return Math.round(totalCents * 5 / 105);
}

/** Null when SSF_GST_NUMBER is unset. The label is waiting on FINN. */
export function gstNumberLine(env: Record<string, string | undefined> = process.env): string | null {
  const value = (env.SSF_GST_NUMBER || "").trim();
  if (!value) return null;
  return `GST number: ${value}`;
}

export function receiptMoneyLines(totalCents: number, env: Record<string, string | undefined> = process.env): string[] {
  const lines = [
    `Total ${formatCad(totalCents)}`,
    `Includes GST (5%) ${formatCad(gstIncludedCents(totalCents))}`,
  ];
  const number = gstNumberLine(env);
  if (number) lines.push(number);
  lines.push("Sweet Success Fundraising Inc.");
  return lines;
}
