import type { BagEstimate } from "@/lib/estimate";
import { formatTeamCad } from "@/lib/money";

// COPY: pending CORA review
export const TEAM_KEEP_ABOUT = "Groups keep at least 40% of every sale.";

export type ProspectFields = {
  firstName: string;
  teamName: string;
  goal: string;
  bags: string;
  bagsEach: string;
  startUrl: string;
  unsubscribeUrl: string;
  sport?: string;
};

export function formatQuoteGoal(dollars: number): string {
  return formatTeamCad(Math.round(dollars) * 100);
}

export function prospectFields(input: {
  firstName: string;
  teamName: string;
  summary: BagEstimate;
  startUrl: string;
  unsubscribeUrl: string;
  sport?: string;
}): ProspectFields {
  return {
    firstName: input.firstName,
    teamName: input.teamName,
    goal: formatQuoteGoal(input.summary.goalDollars),
    bags: input.summary.totalBags.toLocaleString("en-CA"),
    bagsEach: input.summary.bagsEach.toLocaleString("en-CA"),
    startUrl: input.startUrl,
    unsubscribeUrl: input.unsubscribeUrl,
    sport: input.sport,
  };
}

export function onPageQuote(fields: Pick<ProspectFields, "goal" | "bags" | "bagsEach">): string[] {
  return [
    `Here's your estimate. To raise ${fields.goal}, your group would sell about ${fields.bags} bags, which is about ${fields.bagsEach} bags per participant. Fewer if supporters pick premium.`,
    TEAM_KEEP_ABOUT,
  ];
}
