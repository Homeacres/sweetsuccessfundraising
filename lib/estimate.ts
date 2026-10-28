/** Locked planning figure. Goal is the team's share in dollars. $5 of each bag goes to the team. */
const TEAM_SHARE_DOLLARS = 5;

export type BagEstimate = {
  goalDollars: number;
  participants: number;
  totalBags: number;
  bagsEach: number;
};

/** bags = ceil((goal_dollars / 5) / 10) * 10 */
export function totalBagsForGoalDollars(goalDollars: number): number | null {
  if (!Number.isFinite(goalDollars) || goalDollars <= 0) return null;
  return Math.ceil(goalDollars / TEAM_SHARE_DOLLARS / 10) * 10;
}

/**
 * fundraising_goal_estimate_cad is cents. Convert to dollars before the bag formula.
 */
export function totalBagsForGoalCents(goalCents: number): number | null {
  if (!Number.isFinite(goalCents) || goalCents <= 0) return null;
  return totalBagsForGoalDollars(goalCents / 100);
}

/** About X bags each. Rounds up. */
export function bagsEach(totalBags: number, participants: number): number | null {
  if (!Number.isFinite(totalBags) || totalBags <= 0 || !Number.isInteger(participants) || participants < 1) return null;
  return Math.ceil(totalBags / participants);
}

export function bagEstimate(goalDollars: number, participants: number): BagEstimate | null {
  const totalBags = totalBagsForGoalDollars(goalDollars);
  const each = totalBags == null ? null : bagsEach(totalBags, participants);
  if (totalBags == null || each == null) return null;
  return { goalDollars, participants, totalBags, bagsEach: each };
}

export function bagEstimateFromStoredCents(goalCents: number, participants: number): BagEstimate | null {
  if (!Number.isFinite(goalCents)) return null;
  return bagEstimate(goalCents / 100, participants);
}

function formatGoal(dollars: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
  }).format(dollars);
}

function bagWord(count: number): string {
  return count === 1 ? "bag" : "bags";
}

/** Plain sentences shared by the confirmation screen and the applicant email. */
export function estimateSentences(summary: BagEstimate): { intro: string; total: string; each: string } {
  const bags = summary.totalBags.toLocaleString("en-CA");
  const each = summary.bagsEach.toLocaleString("en-CA");
  return {
    intro: "These are estimates.",
    total: `To raise ${formatGoal(summary.goalDollars)} for the team, you would need about ${bags} ${bagWord(summary.totalBags)}.`,
    each: `About ${each} ${bagWord(summary.bagsEach)} each.`,
  };
}
