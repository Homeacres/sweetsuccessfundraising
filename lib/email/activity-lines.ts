/** One line per activity. Add a key here when CORA writes another. */
export const ACTIVITY_LINES: Record<string, string> = {
  Dance: "We love working with dance groups.",
  Hockey: "We love working with hockey teams.",
  "Music or band": "We love working with bands and music programs.",
  School: "We love helping schools raise money for their students.",
  "Scouts or cadets": "We love working with Scouts and cadet groups.",
  "Church or charity": "We love supporting churches and charities.",
};

export const ACTIVITY_LINE_DEFAULT = "We love working with local groups like yours.";

export function activityLine(sport: string | null | undefined): string {
  const value = (sport || "").trim();
  if (!value || value.toLowerCase() === "other" || value.toLowerCase().startsWith("other:")) return ACTIVITY_LINE_DEFAULT;
  const match = Object.entries(ACTIVITY_LINES).find(([name]) => name.toLowerCase() === value.toLowerCase());
  return match ? match[1] : ACTIVITY_LINE_DEFAULT;
}
