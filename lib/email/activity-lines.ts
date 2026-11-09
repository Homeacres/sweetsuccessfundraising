/** One line per activity. Add a key here when CORA writes another. */
export const ACTIVITY_LINES: Record<string, string> = {
  Dance: "We love working with dance groups.",
  Hockey: "We love working with hockey teams.",
  Soccer: "We love working with soccer teams.",
  Basketball: "We love working with basketball teams.",
  Football: "We love working with football teams.",
  Baseball: "We love working with baseball teams.",
  Volleyball: "We love working with volleyball teams.",
  Ringette: "We love working with ringette teams.",
  "Figure Skating": "We love working with figure skating clubs.",
  Gymnastics: "We love working with gymnastics clubs.",
  Swimming: "We love working with swim clubs.",
  Lacrosse: "We love working with lacrosse teams.",
  Rugby: "We love working with rugby teams.",
  Softball: "We love working with softball teams.",
  "Martial Arts": "We love working with martial arts clubs.",
  Skiing: "We love working with ski clubs.",
  Cheer: "We love working with cheer teams.",
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
