import { rosterDraftEmail, prospectActionUrls } from "@/lib/email/prospect";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function sendRosterDraft(organizerId: string): Promise<void> {
  const links = prospectActionUrls(organizerId);
  if (!links) return;
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
    unsubscribeUrl: links.unsubscribeUrl,
  });
  const { sendFlowEmail } = await import("@/lib/flow-mail");
  await sendFlowEmail(data.email, "prospect_roster", mail);
}
