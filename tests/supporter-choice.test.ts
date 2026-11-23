import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { creditParticipant, orderSupporterChoices, supporterPlayerLabels } from "@/lib/supporter-choice";

const ava = "16c8ecfc-97e1-4c23-b4b6-7efc8e834952";
const ben = "cdce878d-b494-49ec-8004-91d544d5cf5b";
const otherTeam = "a250ecc9-b2f4-409f-8b32-19d1f5d2d4ec";

describe("supporter shop player switch", () => {
  it("uses a first name, and a last initial only when two first names clash", () => {
    expect(supporterPlayerLabels([
      { id: "1", first: "Sam", last: "Lee" },
      { id: "2", first: "Sam", last: "Kim" },
      { id: "3", first: "Ava", last: "Oak" },
    ])).toEqual([
      { id: "3", firstName: "Ava", label: "Ava" },
      { id: "2", firstName: "Sam", label: "Sam K." },
      { id: "1", firstName: "Sam", label: "Sam L." },
    ]);
  });

  it("keeps the shared-link player first", () => {
    const labels = supporterPlayerLabels([
      { id: ben, first: "TEST Ben", last: "O" },
      { id: ava, first: "TEST Ava", last: "O" },
    ]);
    expect(orderSupporterChoices(labels, ava).map((choice) => choice.firstName)).toEqual(["TEST Ava", "TEST Ben"]);
  });

  it("credits the participant the buyer switched to on this team", () => {
    expect(creditParticipant({
      requestedId: ben,
      linkParticipantId: ava,
      sameTeamIds: [ava, ben],
    })).toEqual({ ok: true, cpId: ben });
  });

  it("rejects a participant from another team", () => {
    const result = creditParticipant({
      requestedId: otherTeam,
      linkParticipantId: ava,
      sameTeamIds: [ava, ben],
    });
    expect(result).toEqual({ ok: false, error: "Choose a participant on this team." });
  });

  it("checks the chosen participant on the server against this team only", () => {
    const checkout = readFileSync("lib/checkout.ts", "utf8");
    expect(checkout).toContain("creditParticipant");
    expect(checkout).toContain(".eq(\"campaign_id\", shop.campaign_id)");
    const shop = readFileSync("components/Shop.tsx", "utf8");
    expect(shop).toContain("Your player:");
    expect(shop).toContain("Change player");
    expect(shop).not.toContain("Support a different player");
    const page = readFileSync("app/s/[shareToken]/page.tsx", "utf8");
    expect(page).not.toContain("parent_token");
    expect(page).not.toContain("parent_email");
    expect(page).not.toMatch(/select\([^)]*share_token/);
  });

  it("stays with the link’s player when the buyer does not switch", () => {
    expect(creditParticipant({
      requestedId: "",
      linkParticipantId: ava,
      sameTeamIds: [ava, ben],
    })).toEqual({ ok: true, cpId: ava });
  });
});
