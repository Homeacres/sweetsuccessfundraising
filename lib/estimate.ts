/**
 * Organizer-facing estimate. Goal is what the team keeps.
 * teamShareDollars is the standard bag team share (currently $5).
 * Bag count rounds up to the nearest 10. This is not a price discount.
 */
export function calcEstimates(
  goalDollars: number,
  players: number,
  teamShareDollars = 5,
): {
  bagsNeeded: number;
  bagsLow: number;
  bagsHigh: number;
} | null {
  if (
    !Number.isFinite(goalDollars) ||
    goalDollars <= 0 ||
    !Number.isFinite(players) ||
    players <= 0 ||
    !Number.isFinite(teamShareDollars) ||
    teamShareDollars <= 0
  ) {
    return null;
  }
  const bagsNeeded = Math.ceil(goalDollars / teamShareDollars / 10) * 10;
  const bagsPerPlayer = bagsNeeded / players;
  return {
    bagsNeeded,
    bagsLow: Math.floor(bagsPerPlayer * 0.9),
    bagsHigh: Math.ceil(bagsPerPlayer * 1.1),
  };
}
