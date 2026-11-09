import { formatUserDate, todayInEdmonton } from "@/lib/dates";
import {
  countdownEmail,
  finalDaysEmail,
  launchEmail,
  midpointEmail,
  progressEmail,
  wrapUpEmail,
  type FlowEmail,
  type LiveLinks,
} from "@/lib/email/flow-copy";
import { formatQuoteGoal, prospectActionUrls } from "@/lib/email/prospect";
import { appUrl } from "@/lib/env";
import { sendFlowEmail, sendParked } from "@/lib/flow-mail";
import { countdownKind, daysUntil, liveMailKind, shopPhase, waitlistDue, type LiveMailKind } from "@/lib/launch";
import { formatCad } from "@/lib/money";
import { sharePath } from "@/lib/roster";
import { starSellers, goalPercent, type Seller } from "@/lib/standings";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Participant = {
  cp_id: string;
  player_first_name: string;
  player_last_name: string;
  bags_sold: number;
  leaderboard_opt_in: boolean | null;
  player_slug: string;
  parent_token: string;
  families: { parent_email: string; parent_first_name: string; email_opted_out_at: string | null } | { parent_email: string; parent_first_name: string; email_opted_out_at: string | null }[] | null;
};

export async function sendDueFlowEmails(now = new Date()): Promise<{ countdown: number; waitlist: number; live: number }> {
  const today = todayInEdmonton(now);
  const countdown = await sendCountdowns(today);
  const waitlist = await sendWaitlistNotes(today);
  const live = await sendLiveSales(today);
  return { countdown, waitlist, live };
}

async function sentTypes(campaignId: string): Promise<{ type: string; createdAt: string }[]> {
  const { data, error } = await supabaseAdmin()
    .from("email_log")
    .select("email_type, created_at")
    .eq("campaign_id", campaignId)
    .in("status", ["sent", "redirected"]);
  if (error) throw error;
  return (data ?? []).map((row) => ({ type: row.email_type, createdAt: row.created_at }));
}

function familyOf(row: Participant["families"]) {
  return Array.isArray(row) ? row[0] : row;
}

async function sendCountdowns(today: string): Promise<number> {
  const db = supabaseAdmin();
  const { data: campaigns, error } = await db
    .from("campaigns")
    .select("campaign_id, campaign_name, organizer_id, start_date, end_date, status")
    .eq("status", "active");
  if (error) throw error;
  let sent = 0;
  for (const campaign of campaigns ?? []) {
    if (!campaign.start_date || shopPhase(campaign.start_date, campaign.end_date, today) !== "before") continue;
    const links = prospectActionUrls(campaign.organizer_id);
    if (!links) continue;
    const { data: org } = await db.from("organizers").select("first_name, email, confirmed_participant_count, unsubscribed_at").eq("organizer_id", campaign.organizer_id).maybeSingle();
    if (!org?.email || org.unsubscribed_at) continue;
    const { count } = await db.from("campaign_participants").select("cp_id", { count: "exact", head: true }).eq("campaign_id", campaign.campaign_id);
    const signedUp = count || 0;
    const expected = org.confirmed_participant_count || signedUp;
    const logs = await sentTypes(campaign.campaign_id);
    const weekly = logs.filter((row) => row.type.startsWith("flow_countdown_weekly")).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
    const kind = countdownKind(today, campaign.start_date, { weeklyAt: weekly?.createdAt ?? null, final: logs.some((row) => row.type === "flow_countdown_final") });
    if (!kind) continue;
    const mail = countdownEmail({
      firstName: org.first_name,
      teamName: campaign.campaign_name,
      signedUp,
      participants: expected,
      remaining: Math.max(0, expected - signedUp),
      daysToLaunch: daysUntil(today, campaign.start_date),
      signupUrl: links.signupUrl,
      dashboardUrl: links.dashboardUrl,
      unsubscribeUrl: links.unsubscribeUrl,
    });
    const type = kind === "final" ? "flow_countdown_final" : `flow_countdown_weekly_${today}`;
    await sendFlowEmail(org.email, type, mail, campaign.campaign_id);
    sent += 1;
  }
  return sent;
}

async function sendWaitlistNotes(today: string): Promise<number> {
  const db = supabaseAdmin();
  const { data, error } = await db.from("organizers").select("organizer_id, parked_at, email").eq("review_status", "waitlist");
  if (error) throw error;
  let sent = 0;
  for (const row of data ?? []) {
    if (!row.parked_at || !row.email) continue;
    const { data: prior } = await db.from("email_log").select("id").eq("recipient", row.email.toLowerCase()).eq("email_type", "prospect_waitlist").in("status", ["sent", "redirected"]).limit(1);
    if (!waitlistDue(row.parked_at.slice(0, 10), today, Boolean(prior?.length))) continue;
    await sendParked(row.organizer_id, true);
    sent += 1;
  }
  return sent;
}

async function sendLiveSales(today: string): Promise<number> {
  const db = supabaseAdmin();
  const { data: campaigns, error } = await db
    .from("campaigns")
    .select("campaign_id, campaign_name, organizer_id, team_slug, goal_cad, team_raised_cents, start_date, end_date, status")
    .eq("status", "active");
  if (error) throw error;
  let sent = 0;
  for (const campaign of campaigns ?? []) {
    if (!campaign.start_date || !campaign.end_date || !campaign.team_slug) continue;
    const logs = await sentTypes(campaign.campaign_id);
    const progressLogs = logs.filter((row) => row.type === "flow_launch" || row.type.startsWith("flow_progress_"));
    const lastProgress = progressLogs.sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
    const kind = liveMailKind({
      today,
      start: campaign.start_date,
      end: campaign.end_date,
      launchSent: logs.some((row) => row.type === "flow_launch"),
      lastProgressOn: lastProgress ? lastProgress.createdAt.slice(0, 10) : null,
      midpointSent: logs.some((row) => row.type === "flow_midpoint"),
      finalSent: logs.some((row) => row.type === "flow_final"),
      wrapSent: logs.some((row) => row.type === "flow_wrap"),
    });
    if (!kind) continue;
    const { data: people, error: peopleError } = await db
      .from("campaign_participants")
      .select("cp_id, player_first_name, player_last_name, bags_sold, leaderboard_opt_in, player_slug, parent_token, families(parent_email, parent_first_name, email_opted_out_at)")
      .eq("campaign_id", campaign.campaign_id);
    if (peopleError) throw peopleError;
    const sellers = ((people ?? []) as Participant[]).map((person) => ({
      id: person.cp_id,
      first: person.player_first_name,
      last: person.player_last_name,
      bags: person.bags_sold,
      optedIn: Boolean(person.leaderboard_opt_in),
    }));
    const period = await periodSellers(campaign.campaign_id, sellers, lastProgress?.createdAt ?? null);
    const overall = starSellers(sellers);
    const { data: org } = await db.from("organizers").select("first_name, email, unsubscribed_at").eq("organizer_id", campaign.organizer_id).maybeSingle();
    const links = prospectActionUrls(campaign.organizer_id);
    const recipients = recipientsFor(campaign.team_slug, (people ?? []) as Participant[], org, links?.dashboardUrl ?? null, links?.unsubscribeUrl ?? null);
    const type = emailTypeFor(kind, today);
    const shared = {
      teamName: campaign.campaign_name,
      goal: formatQuoteGoal((campaign.goal_cad || 0) / 100),
      goalPct: goalPercent(campaign.team_raised_cents || 0, campaign.goal_cad || 0),
      daysLeft: Math.max(0, daysUntil(today, campaign.end_date)),
      endDate: formatUserDate(campaign.end_date),
      salesTotal: formatCad(campaign.team_raised_cents || 0),
      periodStars: period,
      overallStars: overall,
    };
    for (const recipient of recipients) {
      const mail = mailFor(kind, {
        ...shared,
        firstName: recipient.firstName,
        dashboardUrl: recipient.dashboardUrl,
        supporterLinks: recipient.supporterLinks,
        unsubscribeUrl: recipient.unsubscribeUrl,
      });
      await sendFlowEmail(recipient.email, type, mail, campaign.campaign_id);
      sent += 1;
    }
  }
  return sent;
}

function emailTypeFor(kind: LiveMailKind, today: string): string {
  if (kind === "progress") return `flow_progress_${today}`;
  return `flow_${kind}`;
}

function mailFor(kind: LiveMailKind, input: LiveLinks): FlowEmail {
  if (kind === "launch") return launchEmail(input);
  if (kind === "midpoint") return midpointEmail(input);
  if (kind === "final") return finalDaysEmail(input);
  if (kind === "wrap") return wrapUpEmail(input);
  return progressEmail(input);
}

type Recipient = {
  email: string;
  firstName: string;
  dashboardUrl: string | null;
  supporterLinks: { name: string; url: string }[];
  unsubscribeUrl: string;
};

function recipientsFor(
  teamSlug: string,
  people: Participant[],
  org: { first_name: string; email: string; unsubscribed_at: string | null } | null,
  dashboardUrl: string | null,
  organizerUnsubscribe: string | null,
): Recipient[] {
  const byEmail = new Map<string, Recipient & { optedOut: boolean }>();
  for (const person of people) {
    const family = familyOf(person.families);
    if (!family?.parent_email) continue;
    const email = family.parent_email.toLowerCase();
    const current = byEmail.get(email) ?? {
      email,
      firstName: family.parent_first_name || "there",
      dashboardUrl: null,
      supporterLinks: [],
      unsubscribeUrl: `${appUrl()}/unsubscribe/${person.parent_token}`,
      optedOut: Boolean(family.email_opted_out_at),
    };
    current.supporterLinks.push({
      name: `${person.player_first_name} ${String(person.player_last_name || "").slice(0, 1)}`.trim(),
      url: `${appUrl()}${sharePath(teamSlug, person.player_slug)}`,
    });
    if (family.email_opted_out_at) current.optedOut = true;
    byEmail.set(email, current);
  }
  if (org?.email && dashboardUrl && organizerUnsubscribe && !org.unsubscribed_at) {
    const email = org.email.toLowerCase();
    const current = byEmail.get(email);
    if (current) current.dashboardUrl = dashboardUrl;
    else byEmail.set(email, {
      email,
      firstName: org.first_name,
      dashboardUrl,
      supporterLinks: [],
      unsubscribeUrl: organizerUnsubscribe,
      optedOut: false,
    });
  }
  return [...byEmail.values()].flatMap((row) => {
    const supporterLinks = row.optedOut ? [] : row.supporterLinks;
    const dashboard = row.dashboardUrl;
    if (!dashboard && supporterLinks.length === 0) return [];
    const unsubscribeUrl = supporterLinks.length ? row.unsubscribeUrl : (organizerUnsubscribe || row.unsubscribeUrl);
    return [{ email: row.email, firstName: row.firstName, dashboardUrl: dashboard, supporterLinks, unsubscribeUrl }];
  });
}

export async function loadStarLines(campaignId: string, sellers: Seller[]): Promise<{ period: string[]; overall: string[] }> {
  const logs = await sentTypes(campaignId);
  const last = logs.filter((row) => row.type === "flow_launch" || row.type.startsWith("flow_progress_")).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1);
  return { period: await periodSellers(campaignId, sellers, last?.createdAt ?? null), overall: starSellers(sellers) };
}

async function periodSellers(campaignId: string, sellers: Seller[], since: string | null): Promise<string[]> {
  if (!since) return [];
  const { data, error } = await supabaseAdmin()
    .from("orders")
    .select("line_items")
    .eq("campaign_id", campaignId)
    .eq("payment_status", "paid")
    .gt("updated_at", since);
  if (error) throw error;
  const bags = new Map(sellers.map((seller) => [seller.id, 0]));
  for (const order of data ?? []) {
    const items = Array.isArray(order.line_items) ? order.line_items : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const id = (item as { cp_id?: string }).cp_id;
      const qty = Number((item as { qty?: number }).qty);
      if (!id || !bags.has(id) || !Number.isFinite(qty) || qty <= 0) continue;
      bags.set(id, (bags.get(id) || 0) + qty);
    }
  }
  return starSellers(sellers.map((seller) => ({ ...seller, bags: bags.get(seller.id) || 0 })));
}
