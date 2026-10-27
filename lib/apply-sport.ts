/** Active sport from the list, or a typed activity stored as "Other: …". */
export function resolveOrganizerSport(
  sport: string,
  sportOther: string,
  activeSports: string[],
): { ok: true; sport: string } | { ok: false; error: string } {
  if (sport === "Other") {
    if (!sportOther) return { ok: false, error: "Tell us the sport or activity." };
    return { ok: true, sport: `Other: ${sportOther}` };
  }
  if (!sport || !activeSports.includes(sport)) {
    return { ok: false, error: "Choose a sport from the list." };
  }
  return { ok: true, sport };
}

export function parseParticipantCount(value: number | null): { ok: true; count: number } | { ok: false; error: string } {
  if (value == null || !Number.isInteger(value) || value < 1 || value > 200) {
    return { ok: false, error: "Enter a whole number of participants from 1 to 200." };
  }
  return { ok: true, count: value };
}
