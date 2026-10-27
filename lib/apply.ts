import { checkServiceArea, formatPostal } from "@/lib/area";
import { calcEstimates } from "@/lib/estimate";
import { dollarsToCents } from "@/lib/money";
import { listSports, serviceProvinces } from "@/lib/catalog";
import { applicationAdminEmail, applicationApplicantEmail, outOfAreaAdminEmail } from "@/lib/email/copy";
import { sendEmail } from "@/lib/email/send";
import { requiredEnv } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cleanText, isEmail } from "@/lib/text";

export type ApplyInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  team: string;
  sport: string;
  city: string;
  postal: string;
  participants: number | null;
  goalDollars: number | null;
  howHeard: string;
  consent: boolean;
  honeypot: string;
};

export type ApplyResult =
  | { ok: true; already?: boolean; outOfArea?: boolean; emailed: boolean }
  | { ok: false; error: string; status: number };

export function parseApplyBody(body: unknown): ApplyInput | { error: string } {
  if (!body || typeof body !== "object") return { error: "Missing application." };
  const raw = body as Record<string, unknown>;
  const participants = raw.participants === "" || raw.participants == null ? null : Number(raw.participants);
  const goalDollars = raw.goalDollars === "" || raw.goalDollars == null ? null : Number(raw.goalDollars);
  return {
    firstName: cleanText(raw.firstName, 100),
    lastName: cleanText(raw.lastName, 100),
    email: cleanText(raw.email, 254).toLowerCase(),
    phone: cleanText(raw.phone, 40),
    team: cleanText(raw.team, 200),
    sport: cleanText(raw.sport, 80),
    city: cleanText(raw.city, 80),
    postal: cleanText(raw.postal, 10),
    participants: participants == null || Number.isNaN(participants) ? null : participants,
    goalDollars: goalDollars == null || Number.isNaN(goalDollars) ? null : goalDollars,
    howHeard: cleanText(raw.howHeard, 80),
    consent: raw.consent === true,
    honeypot: cleanText(raw.company, 200),
  };
}

export async function submitApplication(input: ApplyInput): Promise<ApplyResult> {
  if (input.honeypot) return { ok: true, emailed: false };

  if (!input.firstName || !input.lastName) return { ok: false, error: "Enter your first and last name.", status: 400 };
  if (!isEmail(input.email)) return { ok: false, error: "Enter a valid email address.", status: 400 };
  if (input.phone && input.phone.length > 40) return { ok: false, error: "Phone number is too long.", status: 400 };
  if (!input.team) return { ok: false, error: "Enter your club or team name.", status: 400 };
  if (!input.sport) return { ok: false, error: "Choose a sport.", status: 400 };
  if (input.participants != null && (!Number.isInteger(input.participants) || input.participants < 1 || input.participants > 5000)) {
    return { ok: false, error: "Enter a participant count of at least 1.", status: 400 };
  }
  if (input.goalDollars != null && (input.goalDollars < 100 || input.goalDollars > 1_000_000)) {
    return { ok: false, error: "Enter a goal of at least $100, or leave it blank.", status: 400 };
  }

  const sports = await listSports();
  if (!sports.some((sport) => sport.sport_name === input.sport)) {
    return { ok: false, error: "Choose a sport from the list.", status: 400 };
  }

  const provinces = await serviceProvinces();
  const area = checkServiceArea(input.postal, provinces);
  if (!area.ok && area.reason === "invalid") {
    return { ok: false, error: "Enter a Canadian postal code.", status: 400 };
  }

  const db = supabaseAdmin();
  const adminEmail = requiredEnv("ADMIN_EMAIL");

  if (!area.ok) {
    const { error } = await db.from("out_of_area_log").insert({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      city: input.city || null,
      province: area.province,
      country: "CA",
      sport: input.sport,
      form: "pilot_apply",
    });
    if (error) throw error;
    let emailed = false;
    try {
      const message = outOfAreaAdminEmail({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        city: input.city,
        postal: formatPostal(area.postal),
        province: area.province,
        sport: input.sport,
      });
      await sendEmail({ to: adminEmail, ...message });
      emailed = true;
    } catch (err) {
      console.error("out-of-area notice failed", err instanceof Error ? err.message : "error");
    }
    return { ok: true, outOfArea: true, emailed };
  }

  const { data: existing, error: existingError } = await db
    .from("organizers")
    .select("organizer_id")
    .eq("email", input.email)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { ok: true, already: true, emailed: false };

  const { data: standardBag } = await db
    .from("bag_types")
    .select("team_share_cents")
    .eq("code", "standard")
    .eq("is_active", true)
    .maybeSingle();
  const teamShareDollars = (standardBag?.team_share_cents ?? 500) / 100;
  const estimate =
    input.goalDollars && input.participants
      ? calcEstimates(input.goalDollars, input.participants, teamShareDollars)
      : null;
  const estimateText = estimate
    ? `About ${estimate.bagsNeeded.toLocaleString("en-CA")} bags (${estimate.bagsLow}–${estimate.bagsHigh} per player).`
    : null;

  const { error: insertError } = await db.from("organizers").insert({
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone || null,
    organization_name: input.team,
    sport: input.sport,
    city: input.city || null,
    province: area.province,
    country: "CA",
    location_confirmed: false,
    participant_count_estimate: input.participants,
    fundraising_goal_estimate_cad: input.goalDollars == null ? null : dollarsToCents(input.goalDollars),
    how_heard: input.howHeard || null,
    consent_optin: input.consent,
    consent_at: input.consent ? new Date().toISOString() : null,
    record_source: "pilot_apply",
    notes: `Postal code: ${formatPostal(area.postal)}`,
  });
  if (insertError) {
    if (insertError.code === "23505") return { ok: true, already: true, emailed: false };
    throw insertError;
  }

  let emailed = false;
  try {
    const admin = applicationAdminEmail({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      team: input.team,
      sport: input.sport,
      city: input.city,
      postal: formatPostal(area.postal),
      participants: input.participants,
      goalDollars: input.goalDollars,
      howHeard: input.howHeard,
      consent: input.consent,
      estimate: estimateText,
    });
    await sendEmail({ to: adminEmail, ...admin });
    const applicant = applicationApplicantEmail({
      firstName: input.firstName,
      team: input.team,
      estimate: estimateText,
    });
    await sendEmail({ to: input.email, ...applicant });
    emailed = true;
  } catch (err) {
    console.error("application email failed", err instanceof Error ? err.message : "error");
  }

  return { ok: true, emailed };
}
