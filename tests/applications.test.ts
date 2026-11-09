import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  approveAppliedOrganizer,
  campaignGoalCents,
  onlyApplied,
  sportNameForProductNames,
  teamSlugBase,
  teamSlugWithSuffix,
  type ApplicationRepo,
  type CampaignDraft,
  type OrganizerRecord,
} from "@/lib/applications";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const hockeyNames = { Bag: "Celly Crunches", Box: "Barn Burner Bites", "Hat trick": "Snipe Snacks" };
const otherNames = { Bag: "Team Treats", Box: "Victory Bites", "Hat trick": "Champion Crunches" };

function organizer(overrides: Partial<OrganizerRecord> = {}): OrganizerRecord {
  return {
    organizerId: "org-1",
    organizationName: "Hawks U15",
    sport: "Hockey",
    goalCents: 200_000,
    status: "applied",
    ...overrides,
  };
}

function memoryRepo(seed?: { taken?: string[]; existing?: { campaign_id: string } | null; person?: OrganizerRecord | null }) {
  const campaigns: CampaignDraft[] = [];
  const taken = new Set(seed?.taken ?? []);
  let person = seed?.person === undefined ? organizer() : seed.person;
  let existing = seed?.existing ?? null;
  let activeMarked = 0;
  const repo: ApplicationRepo = {
    async organizer() {
      return person;
    },
    async campaignForOrganizer() {
      return existing;
    },
    async productNames(sportName) {
      if (sportName === "Hockey") return hockeyNames;
      if (sportName === "Other") return otherNames;
      return {};
    },
    async slugExists(slug) {
      return taken.has(slug);
    },
    async insertCampaign(row) {
      if (taken.has(row.team_slug)) {
        const error = new Error("duplicate");
        (error as { code?: string }).code = "23505";
        throw error;
      }
      taken.add(row.team_slug);
      campaigns.push(row);
      existing = { campaign_id: `camp-${campaigns.length}` };
      return existing;
    },
    async markActive() {
      activeMarked += 1;
      if (person) person = { ...person, status: "active" };
    },
  };
  return { repo, campaigns, taken, active: () => activeMarked };
}

describe("application list", () => {
  it("shows only organizers whose status is applied", () => {
    const rows = onlyApplied([
      { status: "applied", organizerId: "a" },
      { status: "active", organizerId: "b" },
      { status: "applied", organizerId: "c" },
      { status: "inactive", organizerId: "d" },
    ]);
    expect(rows.map((row) => row.organizerId)).toEqual(["a", "c"]);
    const page = readFileSync("app/admin/applications/page.tsx", "utf8");
    expect(page).toContain('.eq("status", "applied")');
    expect(page).toContain("onlyApplied");
    expect(page).toContain('order("created_at", { ascending: false })');
    expect(readFileSync("components/AdminApplications.tsx", "utf8")).toContain("No new applications.");
    expect(readFileSync("app/admin/page.tsx", "utf8")).toContain("<AdminNav />");
    expect(readFileSync("components/AdminNav.tsx", "utf8")).toContain('href="/admin/applications"');
  });
});

describe("approve application", () => {
  it("creates one campaign with a valid slug, cents goal, product names, and dates", async () => {
    const store = memoryRepo();
    const result = await approveAppliedOrganizer(store.repo, {
      organizerId: "org-1",
      startDate: "2026-11-01",
      endDate: "2026-11-15",
    });
    expect(result).toEqual({ ok: true, campaignId: "camp-1" });
    expect(store.campaigns).toHaveLength(1);
    const campaign = store.campaigns[0];
    expect(campaign.team_slug).toBe("hawks-u15");
    expect(campaign.team_slug).toMatch(SLUG);
    expect(campaign.team_slug.length).toBeLessThanOrEqual(60);
    expect(campaign.goal_cad).toBe(200_000);
    expect(campaign.start_date).toBe("2026-11-01");
    expect(campaign.end_date).toBe("2026-11-15");
    expect(campaign.status).toBe("active");
    expect(campaign.product_names).toEqual(hockeyNames);
    expect(campaign.campaign_name).toBe("Hawks U15");
    expect(store.active()).toBe(1);
  });

  it("appends -2 when the slug is taken and copies Other product names for a typed activity", async () => {
    expect(teamSlugBase("Hawks U15!")).toBe("hawks-u15");
    expect(teamSlugWithSuffix("Hawks U15!", 2)).toBe("hawks-u15-2");
    expect(teamSlugWithSuffix("x".repeat(80), 2).length).toBeLessThanOrEqual(60);
    expect(sportNameForProductNames("Other: Curling")).toBe("Other");
    expect(campaignGoalCents(200_000)).toBe(200_000);
    expect(campaignGoalCents(null)).toBe(0);

    const store = memoryRepo({
      taken: ["hawks-u15"],
      person: organizer({ sport: "Other: Curling", organizationName: "Hawks U15" }),
    });
    const result = await approveAppliedOrganizer(store.repo, {
      organizerId: "org-1",
      startDate: "2026-11-01",
      endDate: "2026-11-01",
    });
    expect(result.ok).toBe(true);
    expect(store.campaigns).toHaveLength(1);
    expect(store.campaigns[0].team_slug).toBe("hawks-u15-2");
    expect(store.campaigns[0].team_slug).toMatch(SLUG);
    expect(store.campaigns[0].sport).toBe("Other: Curling");
    expect(store.campaigns[0].product_names).toEqual(otherNames);
  });

  it("does not create a second campaign when approve is submitted twice", async () => {
    const store = memoryRepo();
    const input = { organizerId: "org-1", startDate: "2026-11-01", endDate: "2026-11-20" };
    const first = await approveAppliedOrganizer(store.repo, input);
    const second = await approveAppliedOrganizer(store.repo, input);
    expect(first).toEqual({ ok: true, campaignId: "camp-1" });
    expect(second).toEqual({ ok: true, campaignId: "camp-1" });
    expect(store.campaigns).toHaveLength(1);
  });

  it("rejects bad dates without inserting a campaign", async () => {
    const store = memoryRepo();
    const missing = await approveAppliedOrganizer(store.repo, { organizerId: "org-1", startDate: "", endDate: "2026-11-15" });
    const inverted = await approveAppliedOrganizer(store.repo, { organizerId: "org-1", startDate: "2026-11-15", endDate: "2026-11-01" });
    const fake = await approveAppliedOrganizer(store.repo, { organizerId: "org-1", startDate: "2026-02-31", endDate: "2026-03-01" });
    expect(missing.ok).toBe(false);
    expect(inverted.ok).toBe(false);
    expect(fake.ok).toBe(false);
    expect(store.campaigns).toHaveLength(0);
  });

  it("refuses an unauthenticated request and never calls the email sender", () => {
    const route = readFileSync("app/api/admin/applications/[organizerId]/approve/route.ts", "utf8");
    const lib = readFileSync("lib/applications.ts", "utf8");
    const page = readFileSync("app/admin/applications/page.tsx", "utf8");
    expect(route.indexOf("isAdminRequest")).toBeLessThan(route.indexOf("approveAppliedOrganizer"));
    expect(route).toContain('return new Response("Unauthorized", { status: 401 })');
    for (const source of [route, lib, page]) {
      expect(source).not.toContain("sendEmail");
      expect(source).not.toContain("deliverApplyNotices");
      expect(source).not.toContain("sendDueMilestoneEmails");
      expect(source).not.toContain("resend");
    }
  });
});
