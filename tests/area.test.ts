import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchPostalArea, type PostalArea } from "@/lib/area";

const areas: PostalArea[] = [
  { prefix: "T", country: "CA", isActive: true },
  { prefix: "T0M", country: "CA", isActive: false },
];

describe("postal areas", () => {
  it("accepts a T code and keeps the normalized postal code", () => {
    const area = matchPostalArea("t2p 1j9", areas);
    expect(area).toEqual({ ok: true, postal: "T2P1J9", province: "AB", country: "CA", prefix: "T" });
    const apply = readFileSync("lib/apply.ts", "utf8");
    const decision = apply.indexOf("matchPostalArea");
    const insert = apply.indexOf('from("organizers").insert');
    expect(decision).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(decision);
    expect(apply).toContain("postal_code: area.postal");
    expect(apply.slice(decision, insert)).toContain("status: 400");
    expect(apply).not.toContain("out_of_area_log");
  });

  it("rejects a non-T code and does not treat that as a saved application", () => {
    const area = matchPostalArea("S7K", areas);
    expect(area.ok).toBe(false);
    if (!area.ok) {
      expect(area.reason).toBe("out_of_area");
      expect(area.postal).toBe("S7K");
    }
    expect(matchPostalArea("S7K 3J7", areas).ok).toBe(false);
    expect(readFileSync("lib/apply.ts", "utf8")).not.toContain("out_of_area_log");
    expect(readFileSync("components/ApplyForm.tsx", "utf8")).not.toContain("We saved your note");
  });

  it("rejects a US ZIP", () => {
    const area = matchPostalArea("90210", areas);
    expect(area.ok).toBe(false);
    if (!area.ok) expect(area.reason).toBe("out_of_area");
    expect(matchPostalArea("12345", areas).ok).toBe(false);
  });

  it("rejects a switched-off sub-prefix even when the shorter prefix is on", () => {
    const area = matchPostalArea("T0M 1X0", areas);
    expect(area.ok).toBe(false);
    if (!area.ok) {
      expect(area.reason).toBe("out_of_area");
      expect(area.postal).toBe("T0M1X0");
    }
  });
});
