import type { BagEstimate } from "@/lib/estimate";
import { applicationApplicantEmail, applicationAdminEmail, type ApplyEmail } from "@/lib/email/copy";
import { sentLogStatus } from "@/lib/email/send";

export const APPLY_ADMIN_FALLBACK = "obrien71@gmail.com";

export type ApplyEmailEnv = NodeJS.ProcessEnv;

/**
 * Sends when a Resend key is set and either APPLY_EMAILS_ENABLED is on
 * or EMAIL_TEST_RECIPIENT is set. The test inbox still redirects every message.
 */
export function applyEmailsWillSend(env: ApplyEmailEnv): boolean {
  const flag = (env.APPLY_EMAILS_ENABLED || "").trim().toLowerCase();
  const enabled = flag === "true" || flag === "1" || flag === "yes";
  const test = Boolean(env.EMAIL_TEST_RECIPIENT?.trim());
  return Boolean(env.RESEND_API_KEY?.trim()) && (enabled || test);
}

export function applyAdminRecipient(env: ApplyEmailEnv): string {
  const configured = env.ADMIN_EMAIL?.trim();
  return configured || APPLY_ADMIN_FALLBACK;
}

export type ApplyNotice = {
  to: string;
  emailType: string;
  message: ApplyEmail;
};

export function planApplicantNotices(input: {
  applicantEmail: string;
  firstName: string;
  lastName: string;
  phone: string;
  team: string;
  sport: string;
  city: string;
  postal: string;
  participants: number;
  goalDollars: number;
  howHeard: string;
  consent: boolean;
  summary: BagEstimate;
  env: ApplyEmailEnv;
}): ApplyNotice[] {
  const summaryText = applicationApplicantEmail({
    firstName: input.firstName,
    team: input.team,
    summary: input.summary,
  });
  const admin = applicationAdminEmail({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.applicantEmail,
    phone: input.phone,
    team: input.team,
    sport: input.sport,
    city: input.city,
    postal: input.postal,
    participants: input.participants,
    goalDollars: input.goalDollars,
    howHeard: input.howHeard,
    consent: input.consent,
    summary: input.summary,
  });
  const adminTo = applyAdminRecipient(input.env);
  const notices: ApplyNotice[] = [
    { to: input.applicantEmail, emailType: "apply_confirmation", message: summaryText },
  ];
  if (adminTo.toLowerCase() !== input.applicantEmail.toLowerCase()) {
    notices.push({ to: adminTo, emailType: "apply_confirmation_copy", message: admin });
  }
  return notices;
}

export async function deliverApplyNotices(input: {
  notices: ApplyNotice[];
  env: ApplyEmailEnv;
  send: (message: ApplyEmail & { to: string }) => Promise<string | null>;
  log: (row: { email_type: string; recipient: string; status: string; resend_id: string | null }) => Promise<void>;
}): Promise<{ sent: boolean }> {
  const sendNow = applyEmailsWillSend(input.env);
  let sent = false;
  for (const notice of input.notices) {
    if (!sendNow) {
      await input.log({
        email_type: notice.emailType,
        recipient: notice.to,
        status: "skipped",
        resend_id: null,
      });
      continue;
    }
    try {
      const resendId = await input.send({ to: notice.to, ...notice.message });
      sent = true;
      await input.log({
        email_type: notice.emailType,
        recipient: notice.to,
        status: sentLogStatus(input.env),
        resend_id: resendId,
      });
    } catch (error) {
      console.error("apply email failed", error instanceof Error ? error.message : "error");
      await input.log({
        email_type: notice.emailType,
        recipient: notice.to,
        status: "failed",
        resend_id: null,
      }).catch(() => undefined);
    }
  }
  return { sent };
}
