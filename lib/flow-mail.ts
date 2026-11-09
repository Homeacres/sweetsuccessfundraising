import { applyEmailsWillSend } from "@/lib/apply-email";
import { approveAppliedOrganizer, supabaseApplicationRepo } from "@/lib/applications";
import {
  alternateWindowEmail,
  approvedEmail,
  parentInviteEmail,
  parkedEmail,
  requestReceivedEmail,
  type FlowEmail,
} from "@/lib/email/flow-copy";
import { formatQuoteGoal, prospectActionUrls } from "@/lib/email/prospect";
import { sendEmail, sentLogStatus } from "@/lib/email/send";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function sendFlowEmail(to: string, emailType: string, mail: FlowEmail, campaignId?: string): Promise<void> {
  if (!to || !applyEmailsWillSend(process.env)) return;
  const db = supabaseAdmin();
  const { data: prior } = await db.from("email_log").select("id").eq("recipient", to.toLowerCase()).eq("email_type", emailType).in("status", ["sent", "redirected"]).limit(1);
  if (prior && prior.length) return;
  try {
    const resendId = await sendEmail({ to, subject: mail.subject, html: mail.html, text: mail.text, headers: mail.headers });
    await db.from("email_log").insert({ email_type: emailType, recipient: to.toLowerCase(), status: sentLogStatus(), resend_id: resendId, campaign_id: campaignId ?? null });
  } catch (error) {
    console.error("flow email failed", error instanceof Error ? error.message : "error");
    await db.from("email_log").insert({ email_type: emailType, recipient: to.toLowerCase(), status: "failed", resend_id: null });
  }
}

export async function sendRequestReceived(organizerId: string): Promise<void> {
  const links = prospectActionUrls(organizerId);
  if (!links) return;
  const { data } = await supabaseAdmin().from("organizers").select("first_name, email, organization_name, confirmed_participant_count, confirmed_goal_cents, requested_window_id").eq("organizer_id", organizerId).maybeSingle();
  if (!data?.email || data.confirmed_goal_cents == null) return;
  const { data: window } = await supabaseAdmin().from("launch_windows").select("label").eq("window_id", data.requested_window_id).maybeSingle();
  const mail = requestReceivedEmail({
    firstName: data.first_name,
    teamName: data.organization_name || "your group",
    startWindow: window?.label || "the window you picked",
    participants: data.confirmed_participant_count || 0,
    goal: formatQuoteGoal(data.confirmed_goal_cents / 100),
    unsubscribeUrl: links.unsubscribeUrl,
  });
  await sendFlowEmail(data.email, `prospect_request_${data.requested_window_id || "window"}`, mail);
}

export async function sendApprovedPack(organizerId: string, windowLabel: string): Promise<void> {
  const links = prospectActionUrls(organizerId);
  if (!links) return;
  const { data } = await supabaseAdmin().from("organizers").select("first_name, email, organization_name, confirmed_goal_cents").eq("organizer_id", organizerId).maybeSingle();
  if (!data?.email) return;
  const goal = formatQuoteGoal((data.confirmed_goal_cents || 0) / 100);
  const team = data.organization_name || "your group";
  await sendFlowEmail(data.email, "prospect_approved", approvedEmail({
    firstName: data.first_name,
    teamName: team,
    startWindow: windowLabel,
    dashboardUrl: links.dashboardUrl,
    unsubscribeUrl: links.unsubscribeUrl,
  }));
  await sendFlowEmail(data.email, "prospect_parent_invite", parentInviteEmail({
    teamName: team,
    startWindow: windowLabel,
    goal,
    signupUrl: links.signupUrl,
    unsubscribeUrl: links.unsubscribeUrl,
  }));
}

export async function sendAlternateOffer(organizerId: string, bookedLabel: string, altLabel: string, windowId: string): Promise<void> {
  const links = prospectActionUrls(organizerId);
  if (!links) return;
  const { data } = await supabaseAdmin().from("organizers").select("first_name, email, organization_name").eq("organizer_id", organizerId).maybeSingle();
  if (!data?.email) return;
  await sendFlowEmail(data.email, `prospect_alternate_${windowId}`, alternateWindowEmail({
    firstName: data.first_name,
    teamName: data.organization_name || "your group",
    startWindow: bookedLabel,
    altWindow: altLabel,
    acceptUrl: links.acceptUrl,
    pickUrl: links.windowsUrl,
    unsubscribeUrl: links.unsubscribeUrl,
  }));
}

export async function sendParked(organizerId: string, waitlist: boolean): Promise<void> {
  const links = prospectActionUrls(organizerId);
  if (!links) return;
  const { data } = await supabaseAdmin().from("organizers").select("first_name, email, organization_name").eq("organizer_id", organizerId).maybeSingle();
  if (!data?.email) return;
  await sendFlowEmail(data.email, waitlist ? "prospect_waitlist" : "prospect_not_this_season", parkedEmail({
    firstName: data.first_name,
    teamName: data.organization_name || "your group",
    estimateUrl: links.startUrl,
    unsubscribeUrl: links.unsubscribeUrl,
    waitlist,
  }));
}

export async function agreeWindow(
  organizerId: string,
  window: { window_id: string; label: string; start_date: string; end_date: string },
): Promise<{ ok: true; campaignId: string } | { ok: false; error: string }> {
  const db = supabaseAdmin();
  const { data: org } = await db.from("organizers").select("confirmed_goal_cents").eq("organizer_id", organizerId).maybeSingle();
  if (org?.confirmed_goal_cents) {
    await db.from("organizers").update({ fundraising_goal_estimate_cad: org.confirmed_goal_cents }).eq("organizer_id", organizerId);
  }
  const created = await approveAppliedOrganizer(supabaseApplicationRepo(), {
    organizerId,
    startDate: window.start_date,
    endDate: window.end_date,
  });
  if (!created.ok) return created;
  await db.from("campaigns").update({
    start_date: window.start_date,
    end_date: window.end_date,
    ...(org?.confirmed_goal_cents ? { goal_cad: org.confirmed_goal_cents } : {}),
  }).eq("campaign_id", created.campaignId);
  await db.from("organizers").update({ review_status: "approved", agreed_window_id: window.window_id }).eq("organizer_id", organizerId);
  await sendApprovedPack(organizerId, window.label);
  return created;
}
