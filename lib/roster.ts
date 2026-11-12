import { teamSlugBase, teamSlugWithSuffix } from "@/lib/applications";

export function participantSlug(firstName: string, lastName: string, taken: string[]): string {
  const base = teamSlugBase(`${firstName} ${lastName}`);
  if (!taken.includes(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = teamSlugWithSuffix(`${firstName} ${lastName}`, n);
    if (!taken.includes(candidate)) return candidate;
  }
  return teamSlugWithSuffix("participant", taken.length + 2);
}

export function sharePath(teamSlug: string, playerSlug: string): string {
  return `/t/${teamSlug}/${playerSlug}`;
}

/** The link a parent or organizer gives to supporters. Never a ledger token. */
export function supporterShopPath(shareToken: string): string {
  return `/s/${shareToken}`;
}

export function rosterParentEmail(organizerId: string, playerSlug: string): string {
  const id = organizerId.replace(/-/g, "").slice(0, 12);
  return `roster.${id}.${playerSlug}@participants.invalid`;
}
