import { checkServiceArea, formatPostal } from "@/lib/area";
import { deliverApplyNotices, planApplicantNotices, type ApplyNotice } from "@/lib/apply-email";
import { parseParticipantCount, resolveOrganizerSport } from "@/lib/apply-sport";
import { bagEstimate, type BagEstimate } from "@/lib/estimate";
import { dollarsToCents } from "@/lib/money";
import { listSports, serviceProvinces } from "@/lib/catalog";
import { outOfAreaAdminEmail } from "@/lib/email/copy";
import { sendEmail } from "@/lib/email/send";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cleanText, isEmail } from "@/lib/text";

export type ApplyInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  team: string;
  sport: string;
  sportOther: string;
  city: string;
  postal: string;
  participants: number | null;
  goalDollars: number | null;
  howHeard: string;
  consent: boolean;
  honeypot: string;
};

export type ApplyResult =
  | { ok: true; already?: boolean; outOfArea?: boolean; emailed: boolean; summary: BagEstimate | null }
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
    sportOther: cleanText(raw.sportOther, 40),
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
  if (input.honeypot) return { ok: true, emailed: false, summary: null };

  if (!input.firstName || !input.lastName) return { ok: false, error: "Enter your first and last name.", status: 400 };
  if (!isEmail(input.email)) return { ok: false, error: "Enter a valid email address.", status: 400 };
  if (input.phone && input.phone.length > 40) return { ok: false, error: "Phone number is too long.", status: 400 };
  if (!input.team) return { ok: false, error: "Enter your club or team name.", status: 400 };
  const participants = parseParticipantCount(input.participants);
  if (!participants.ok) return { ok: false, error: participants.error, status: 400 };
  if (input.goalDollars == null || input.goalDollars < 100 || input.goalDollars > 1_000_000) {
    return { ok: false, error: "Enter a goal of at least $100.", status: 400 };
  }
  const summary = bagEstimate(input.goalDollars, participants.count);
  if (!summary) return { ok: false, error: "Enter a goal of at least $100.", status: 400 };

  const sports = await listSports();
  const resolvedSport = resolveOrganizerSport(
    input.sport,
    input.sportOther,
    sports.map((sport) => sport.sport_name),
  );
  if (!resolvedSport.ok) return { ok: false, error: resolvedSport.error, status: 400 };

  const provinces = await serviceProvinces();
  const area = checkServiceArea(input.postal, provinces);
  if (!area.ok && area.reason === "invalid") {
    return { ok: false, error: "Enter a Canadian postal code.", status: 400 };
  }

  const db = supabaseAdmin();

  if (!area.ok) {
    const { error } = await db.from("out_of_area_log").insert({
      first_name: input.firstName,
      last_name: input.lastName,
      email: input.email,
      city: input.city || null,
      province: area.province,
      country: "CA",
      sport: resolvedSport.sport,
      form: "pilot_apply",
    });
    if (error) throw error;
    const message = outOfAreaAdminEmail({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      city: input.city,
      postal: formatPostal(area.postal),
      province: area.province,
      sport: resolvedSport.sport,
    });
    const emailed = await sendApplyNotices([
      { to: applyAdminTo(), emailType: "apply_out_of_area", message },
    ]);
    return { ok: true, outOfArea: true, emailed, summary: null };
  }

  const { data: existing, error: existingError } = await db
    .from("organizers")
    .select("organizer_id")
    .eq("email", input.email)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return { ok: true, already: true, emailed: false, summary: null };

  const { error: insertError } = await db.from("organizers").insert({
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone || null,
    organization_name: input.team,
    sport: resolvedSport.sport,
    city: input.city || null,
    province: area.province,
    country: "CA",
    location_confirmed: false,
    participant_count_estimate: participants.count,
    fundraising_goal_estimate_cad: dollarsToCents(input.goalDollars),
    how_heard: input.howHeard || null,
    consent_optin: input.consent,
    consent_at: input.consent ? new Date().toISOString() : null,
    record_source: "pilot_apply",
    notes: `Postal code: ${formatPostal(area.postal)}`,
  });
  if (insertError) {
    if (insertError.code === "23505") return { ok: true, already: true, emailed: false, summary: null };
    throw insertError;
  }

  const notices = planApplicantNotices({
    applicantEmail: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    phone: input.phone,
    team: input.team,
    sport: resolvedSport.sport,
    city: input.city,
    postal: formatPostal(area.postal),
    participants: participants.count,
    goalDollars: input.goalDollars,
    howHeard: input.howHeard,
    consent: input.consent,
    summary,
    env: process.env,
  });
  const emailed = await sendApplyNotices(notices);
  return { ok: true, emailed, summary };
}

function applyAdminTo(): string {
  return process.env.ADMIN_EMAIL?.trim() || "obrien71@gmail.com";
}

async function sendApplyNotices(notices: ApplyNotice[]): Promise<boolean> {
  try {
    const result = await deliverApplyNotices({
      notices,
      env: process.env,
      send: (message) => sendEmail(message),
      log: logApplyEmail,
    });
    return result.sent;
  } catch (error) {
    console.error("apply email failed", error instanceof Error ? error.message : "error");
    return false;
  }
}

async function logApplyEmail(row: { email_type: string; recipient: string; status: string; resend_id: string | null }): Promise<void> {
  const { error } = await supabaseAdmin().from("email_log").insert({
    email_type: row.email_type,
    recipient: row.recipient,
    status: row.status,
    resend_id: row.resend_id,
  });
  if (error) console.error("apply email log failed", error.message);
}
