import { playerDisplayName } from "@/lib/names";

export type RosterPlayer = {
  id: string;
  first: string;
  last: string;
};

export type SupporterChoice = {
  id: string;
  label: string;
  firstName: string;
};

/**
 * First name only. A last initial is added only when two people on the team
 * share a first name, so the buyer can tell them apart.
 */
export function supporterPlayerLabels(people: RosterPlayer[]): SupporterChoice[] {
  return people
    .map((person) => {
      const first = person.first.trim();
      return {
        id: person.id,
        firstName: first,
        label: playerDisplayName(person.first, person.last, true),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

/** Put the player from the shared link first. Everyone else stays alphabetical. */
export function orderSupporterChoices(choices: SupporterChoice[], linkParticipantId: string): SupporterChoice[] {
  return [...choices.filter((choice) => choice.id === linkParticipantId), ...choices.filter((choice) => choice.id !== linkParticipantId)];
}

/**
 * Credit the buyer’s pick when that participant is on this link’s team.
 * An empty pick stays with the player whose link was opened.
 */
export function creditParticipant(input: {
  requestedId: string;
  linkParticipantId: string;
  sameTeamIds: string[];
}): { ok: true; cpId: string } | { ok: false; error: string } {
  const requested = input.requestedId.trim();
  if (!requested || requested === input.linkParticipantId) {
    return { ok: true, cpId: input.linkParticipantId };
  }
  if (!input.sameTeamIds.includes(requested)) {
    return { ok: false, error: "Choose a participant on this team." };
  }
  return { ok: true, cpId: requested };
}
