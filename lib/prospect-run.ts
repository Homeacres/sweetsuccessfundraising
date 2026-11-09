import { applyEmailsWillSend } from "@/lib/apply-email";
import { sendEmail, sentLogStatus } from "@/lib/email/send";
import {
  PROSPECT_STEP_EMAIL,
  dueProspectStep,
  prospectActionUrls,
  prospectEmailForStep,
  prospectFields,
  prospectReplyTo,
  type ProspectStep,
} from "@/lib/email/prospect";
import { bagEstimateFromStoredCents } from "@/lib/estimate";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type ProspectOrganizer = {
  organizerId: string;
  firstName: string;
  email: string;
  teamName: string;
  goalCents: number | null;
  participants: number | null;
  createdAt: string;
  startedAt: string | null;
  repliedAt: string | null;
  unsubscribedAt: string | null;
  declinedAt: string | null;
  requestSubmittedAt: string | null;
  status: string;
};

const STEP_TYPES = Object.values(PROSPECT_STEP_EMAIL);

export function followUpsStopped(row: Pick<ProspectOrganizer, "status" | "startedAt" | "repliedAt" | "unsubscribedAt" | "declinedAt"> & { requestSubmittedAt?: string | null }): boolean {
  return row.status !== "applied" || Boolean(row.startedAt || row.requestSubmittedAt || row.repliedAt || row.unsubscribedAt || row.declinedAt);
}

export async function sendDueProspectEmails(now = new Date()): Promise<{ checked: number; sent: number; skipped: number; failed: number }> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("organizers")
    .select("organizer_id, first_name, email, organization_name, fundraising_goal_estimate_cad, participant_count_estimate, created_at, started_at, request_submitted_at, replied_at, unsubscribed_at, declined_at, status")
    .eq("status", "applied")
    .is("request_submitted_at", null)
    .is("started_at", null)
    .is("replied_at", null)
    .is("unsubscribed_at", null)
    .is("declined_at", null);
  if (error) throw error;

  const result = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  for (const row of data ?? []) {
    const organizer: ProspectOrganizer = {
      organizerId: row.organizer_id,
      firstName: row.first_name,
      email: row.email,
      teamName: row.organization_name || "your group",
      goalCents: row.fundraising_goal_estimate_cad,
      participants: row.participant_count_estimate,
      createdAt: row.created_at,
      startedAt: row.started_at,
      requestSubmittedAt: row.request_submitted_at,
      repliedAt: row.replied_at,
      unsubscribedAt: row.unsubscribed_at,
      declinedAt: row.declined_at,
      status: row.status,
    };
    const outcome = await sendProspectStep(organizer, now);
    result.checked += 1;
    if (outcome === "sent") result.sent += 1;
    else if (outcome === "failed") result.failed += 1;
    else result.skipped += 1;
  }
  return result;
}

export async function sendProspectStep(organizer: ProspectOrganizer, now = new Date()): Promise<"sent" | "skipped" | "failed"> {
  if (followUpsStopped(organizer)) return "skipped";
  const summary = organizer.goalCents != null && organizer.participants != null
    ? bagEstimateFromStoredCents(organizer.goalCents, organizer.participants)
    : null;
  if (!summary) return "skipped";
  const links = prospectActionUrls(organizer.organizerId);
  if (!links) return "skipped";

  const { data: prior, error } = await supabaseAdmin()
    .from("email_log")
    .select("email_type, status")
    .eq("recipient", organizer.email.toLowerCase())
    .in("email_type", STEP_TYPES);
  if (error) throw error;
  const sentTypes = (prior ?? []).filter((row) => row.status === "sent" || row.status === "redirected").map((row) => row.email_type);
  const step = dueProspectStep({
    createdAt: new Date(organizer.createdAt),
    now,
    sentTypes,
    stopped: false,
  });
  if (!step) return "skipped";
  return deliverProspectStep(organizer, step, summary.goalDollars, summary.totalBags, summary.bagsEach, links);
}

async function deliverProspectStep(
  organizer: ProspectOrganizer,
  step: Exclude<ProspectStep, "quote">,
  goalDollars: number,
  totalBags: number,
  bagsEach: number,
  links: { startUrl: string; unsubscribeUrl: string },
): Promise<"sent" | "skipped" | "failed"> {
  const emailType = PROSPECT_STEP_EMAIL[step];
  const db = supabaseAdmin();
  if (!applyEmailsWillSend(process.env)) {
    return "skipped";
  }
  const mail = prospectEmailForStep(
    step,
    prospectFields({
      firstName: organizer.firstName,
      teamName: organizer.teamName,
      summary: { goalDollars, participants: organizer.participants || 1, totalBags, bagsEach },
      startUrl: links.startUrl,
      unsubscribeUrl: links.unsubscribeUrl,
    }),
    prospectReplyTo(organizer.organizerId),
  );
  try {
    const resendId = await sendEmail({
      to: organizer.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: mail.headers,
    });
    await db.from("email_log").insert({
      email_type: emailType,
      recipient: organizer.email.toLowerCase(),
      status: sentLogStatus(),
      resend_id: resendId,
    });
    return "sent";
  } catch (error) {
    console.error("prospect follow-up failed", error instanceof Error ? error.message : "error");
    await db.from("email_log").insert({
      email_type: emailType,
      recipient: organizer.email.toLowerCase(),
      status: "failed",
      resend_id: null,
    });
    return "failed";
  }
}
