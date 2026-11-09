import type { BagEstimate } from "@/lib/estimate";

export type ProspectFields = {
  firstName: string;
  teamName: string;
  goal: string;
  bags: string;
  bagsEach: string;
  startUrl: string;
  unsubscribeUrl: string;
};

export function formatQuoteGoal(dollars: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
  }).format(dollars);
}

export function prospectFields(input: {
  firstName: string;
  teamName: string;
  summary: BagEstimate;
  startUrl: string;
  unsubscribeUrl: string;
}): ProspectFields {
  return {
    firstName: input.firstName,
    teamName: input.teamName,
    goal: formatQuoteGoal(input.summary.goalDollars),
    bags: input.summary.totalBags.toLocaleString("en-CA"),
    bagsEach: input.summary.bagsEach.toLocaleString("en-CA"),
    startUrl: input.startUrl,
    unsubscribeUrl: input.unsubscribeUrl,
  };
}

export function onPageQuote(fields: Pick<ProspectFields, "goal" | "bags" | "bagsEach">): string[] {
  return [
    `Here's your estimate. To raise ${fields.goal}, your group would sell about ${fields.bags} bags, which is about ${fields.bagsEach} per participant. Fewer if supporters pick premium.`,
    "Standard bag: $12, your group keeps $5",
    "Premium bag: $14, your group keeps $6",
    "Prices include GST. Single bags only for now.",
  ];
}
