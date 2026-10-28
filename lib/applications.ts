import { supabaseAdmin } from "@/lib/supabase/admin";

/** campaigns.goal_cad is cents, same as organizers.fundraising_goal_estimate_cad. */
export function campaignGoalCents(storedCents: number | null | undefined): number {
  if (typeof storedCents !== "number" || !Number.isFinite(storedCents)) return 0;
  return Math.max(0, Math.trunc(storedCents));
}

export function onlyApplied<T extends { status: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.status === "applied");
}

/** "Other: Curling" uses the Other sports.product_names row. */
export function sportNameForProductNames(sport: string | null | undefined): string {
  const value = (sport || "").trim();
  if (!value || value === "Other" || value.startsWith("Other:")) return "Other";
  return value;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseCampaignDates(
  start: string,
  end: string,
): { ok: true; start: string; end: string } | { ok: false; error: string } {
  const startDate = start.trim();
  const endDate = end.trim();
  if (!isRealDate(startDate) || !isRealDate(endDate)) {
    return { ok: false, error: "Enter a start date and an end date." };
  }
  if (endDate < startDate) {
    return { ok: false, error: "End date must be on or after the start date." };
  }
  return { ok: true, start: startDate, end: endDate };
}

function isRealDate(value: string): boolean {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function teamSlugBase(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const cut = slug.slice(0, 60).replace(/-+$/g, "");
  if (!cut || !SLUG.test(cut) || cut.length > 60) return "team";
  return cut;
}

export function teamSlugWithSuffix(name: string, n: number): string {
  if (n <= 1) return teamSlugBase(name);
  const suffix = `-${n}`;
  const head = teamSlugBase(name).slice(0, 60 - suffix.length).replace(/-+$/g, "") || "team";
  const candidate = `${head}${suffix}`;
  if (SLUG.test(candidate) && candidate.length <= 60) return candidate;
  return `team${suffix}`;
}

export type OrganizerRecord = {
  organizerId: string;
  organizationName: string | null;
  sport: string | null;
  goalCents: number | null;
  status: string;
};

export type CampaignDraft = {
  organizer_id: string;
  campaign_name: string;
  sport: string;
  product_names: unknown;
  goal_cad: number;
  start_date: string;
  end_date: string;
  status: "active";
  team_slug: string;
};

export type ApplicationRepo = {
  organizer: (id: string) => Promise<OrganizerRecord | null>;
  campaignForOrganizer: (id: string) => Promise<{ campaign_id: string } | null>;
  productNames: (sportName: string) => Promise<unknown>;
  slugExists: (slug: string) => Promise<boolean>;
  insertCampaign: (row: CampaignDraft) => Promise<{ campaign_id: string }>;
  markActive: (id: string) => Promise<void>;
};

export async function approveAppliedOrganizer(
  repo: ApplicationRepo,
  input: { organizerId: string; startDate: string; endDate: string },
): Promise<{ ok: true; campaignId: string } | { ok: false; error: string }> {
  const dates = parseCampaignDates(input.startDate, input.endDate);
  if (!dates.ok) return dates;

  const organizer = await repo.organizer(input.organizerId);
  if (!organizer) return { ok: false, error: "Application not found." };

  const existing = await repo.campaignForOrganizer(input.organizerId);
  if (existing) {
    await repo.markActive(input.organizerId);
    return { ok: true, campaignId: existing.campaign_id };
  }

  const productNames = (await repo.productNames(sportNameForProductNames(organizer.sport))) ?? {};
  const campaignName = organizer.organizationName?.trim() || "Team";
  const sport = organizer.sport?.trim() || "Other";

  for (let n = 1; n < 1000; n += 1) {
    const teamSlug = teamSlugWithSuffix(campaignName, n);
    if (await repo.slugExists(teamSlug)) continue;
    try {
      const created = await repo.insertCampaign({
        organizer_id: input.organizerId,
        campaign_name: campaignName,
        sport,
        product_names: productNames,
        goal_cad: campaignGoalCents(organizer.goalCents),
        start_date: dates.start,
        end_date: dates.end,
        status: "active",
        team_slug: teamSlug,
      });
      await repo.markActive(input.organizerId);
      return { ok: true, campaignId: created.campaign_id };
    } catch (error) {
      if (isUniqueViolation(error)) continue;
      throw error;
    }
  }
  return { ok: false, error: "Could not make a unique team link." };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

export function supabaseApplicationRepo(): ApplicationRepo {
  const db = supabaseAdmin();
  return {
    async organizer(id) {
      const { data, error } = await db
        .from("organizers")
        .select("organizer_id, organization_name, sport, fundraising_goal_estimate_cad, status")
        .eq("organizer_id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        organizerId: data.organizer_id,
        organizationName: data.organization_name,
        sport: data.sport,
        goalCents: data.fundraising_goal_estimate_cad,
        status: data.status,
      };
    },
    async campaignForOrganizer(id) {
      const { data, error } = await db
        .from("campaigns")
        .select("campaign_id")
        .eq("organizer_id", id)
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    async productNames(sportName) {
      const { data, error } = await db.from("sports").select("product_names").eq("sport_name", sportName).maybeSingle();
      if (error) throw error;
      return data?.product_names ?? {};
    },
    async slugExists(slug) {
      const { data, error } = await db.from("campaigns").select("campaign_id").eq("team_slug", slug).maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
    async insertCampaign(row) {
      const { data, error } = await db.from("campaigns").insert(row).select("campaign_id").single();
      if (error) throw error;
      return data;
    },
    async markActive(id) {
      const { error } = await db.from("organizers").update({ status: "active" }).eq("organizer_id", id);
      if (error) throw error;
    },
  };
}
