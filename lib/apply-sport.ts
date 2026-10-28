/** Sentinel option. Stored values use `Other: ` plus the typed activity. */
export const OTHER_SPORT = "Other";

export const SPORT_LIST_ERROR = "We couldn't load the sport list. Please refresh or email us.";

export type SportCatalogRow = {
  sport_name: string;
  emoji: string | null;
  sort_order: number;
  is_active: boolean;
  nameCount: number;
};

export type SportChoice = { sport_name: string; emoji: string | null };

/**
 * Active sports that have at least one product name, in sort order.
 * The database "Other" row is dropped. One Other option is always last.
 */
export function applySportOptions(rows: SportCatalogRow[]): SportChoice[] {
  const real = rows
    .filter((row) => row.is_active && row.nameCount > 0 && row.sport_name.trim() !== OTHER_SPORT)
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order || a.sport_name.localeCompare(b.sport_name));
  const seen = new Set<string>();
  const options: SportChoice[] = [];
  for (const row of real) {
    const name = row.sport_name.trim();
    if (seen.has(name)) continue;
    seen.add(name);
    options.push({ sport_name: name, emoji: row.emoji });
  }
  options.push({ sport_name: OTHER_SPORT, emoji: null });
  return options;
}

/** True when the query failed or no real sport survived the filter. */
export function sportListUnavailable(options: SportChoice[] | null): boolean {
  if (!options) return true;
  return options.every((option) => option.sport_name === OTHER_SPORT);
}

/** Active sport from the list, or a typed activity stored as "Other: …". */
export function resolveOrganizerSport(
  sport: string,
  sportOther: string,
  activeSports: string[],
): { ok: true; sport: string } | { ok: false; error: string } {
  if (sport === OTHER_SPORT) {
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
