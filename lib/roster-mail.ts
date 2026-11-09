import { applyEmailsWillSend } from "@/lib/apply-email";
import { rosterDraftEmail, prospectActionUrls } from "@/lib/email/prospect";
import { sendEmail, sentLogStatus } from "@/lib/email/send";
import { supabaseAdmin } from "@/lib/supabase/admin";

/** Gated like other apply mail. Copy is marked DRAFT until CORA replaces it. */
export async function sendRosterDraft(organizerId: string): Promise<void> {
  const links = prospectActionUrls(organizerId);
  if (!links || !applyEmailsWillSend(process.env)) return;
  const { data, error } = await supabaseAdmin()
    .from("organizers")
    .select("first_name, email, organization_name")
    .eq("organizer_id", organizerId)
    .maybeSingle();
  if (error || !data?.email) return;
  const mail = rosterDraftEmail({
    firstName: data.first_name,
    teamName: data.organization_name || "your group",
    rosterUrl: links.rosterUrl,
  });
  try {
    const resendId = await sendEmail({ to: data.email, subject: mail.subject, html: mail.html, text: mail.text });
    await supabaseAdmin().from("email_log").insert({
      email_type: "prospect_roster",
      recipient: data.email.toLowerCase(),
      status: sentLogStatus(),
      resend_id: resendId,
    });
  } catch (err) {
    console.error("roster draft email failed", err instanceof Error ? err.message : "error");
  }
}
