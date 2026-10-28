import { milestoneEmail, type MilestonePlayer } from "@/lib/email/copy";
import { sendEmail, sentLogStatus } from "@/lib/email/send";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  dueMilestones,
  milestoneEmailType,
  type MilestoneConfig,
  type MilestoneName,
} from "@/lib/milestones";

type FamilyRow = {
  family_id: string;
  parent_email: string;
  parent_first_name: string;
  email_opted_out_at: string | null;
};

type PlayerRow = {
  player_first_name: string;
  player_last_name: string;
  hide_last_name: boolean;
  parent_token: string;
  bags_sold: number;
  team_revenue_cents: number;
  registered_at: string;
  family_id: string;
  families: FamilyRow | FamilyRow[] | null;
};

export type MilestoneRun = { checked: number; sent: number; skipped: number; failed: number };

export async function sendDueMilestoneEmails(onlyCampaignId?: string): Promise<MilestoneRun> {
  const db = supabaseAdmin();
  const { data: configRow, error: configError } = await db
    .from("platform_config")
    .select("value")
    .eq("key", "parent_milestone_emails")
    .maybeSingle();
  if (configError) throw configError;
  const config = (configRow?.value ?? {}) as MilestoneConfig;

  let query = db
    .from("campaigns")
    .select("campaign_id, campaign_name, status, start_date, end_date")
    .in("status", ["active", "closed"]);
  if (onlyCampaignId) query = query.eq("campaign_id", onlyCampaignId);
  const { data: campaigns, error: campaignError } = await query;
  if (campaignError) throw campaignError;

  const result: MilestoneRun = { checked: 0, sent: 0, skipped: 0, failed: 0 };
  const now = new Date();

  for (const campaign of campaigns ?? []) {
    const due = dueMilestones(campaign, config, now);
    if (!due.length) continue;
    result.checked += 1;
    const groups = await parentGroups(campaign.campaign_id);
    for (const kind of due) {
      for (const group of groups) {
        if (group.optedOut || !group.email) {
          result.skipped += 1;
          continue;
        }
        const outcome = await claimAndSend({
          campaignId: campaign.campaign_id,
          team: campaign.campaign_name,
          endDate: campaign.end_date,
          kind,
          email: group.email,
          parentFirst: group.parentFirst,
          token: group.token,
          players: group.players,
        });
        if (outcome === "sent") result.sent += 1;
        else if (outcome === "skipped") result.skipped += 1;
        else result.failed += 1;
      }
    }
  }

  return result;
}

async function parentGroups(campaignId: string): Promise<
  {
    email: string;
    parentFirst: string;
    optedOut: boolean;
    token: string;
    players: MilestonePlayer[];
  }[]
> {
  const { data, error } = await supabaseAdmin()
    .from("campaign_participants")
    .select(
      "player_first_name, player_last_name, hide_last_name, parent_token, bags_sold, team_revenue_cents, registered_at, family_id, families(parent_email, parent_first_name, email_opted_out_at, family_id)",
    )
    .eq("campaign_id", campaignId)
    .order("registered_at");
  if (error) throw error;

  const groups = new Map<
    string,
    { email: string; parentFirst: string; optedOut: boolean; token: string; players: MilestonePlayer[] }
  >();
  for (const row of (data ?? []) as PlayerRow[]) {
    const family = Array.isArray(row.families) ? row.families[0] : row.families;
    if (!family) continue;
    const existing = groups.get(row.family_id);
    const player: MilestonePlayer = {
      first: row.player_first_name,
      last: row.player_last_name,
      hideLastName: row.hide_last_name,
      bags: row.bags_sold,
      teamCents: row.team_revenue_cents,
    };
    if (!existing) {
      groups.set(row.family_id, {
        email: (family.parent_email || "").toLowerCase(),
        parentFirst: family.parent_first_name,
        optedOut: Boolean(family.email_opted_out_at),
        token: row.parent_token,
        players: [player],
      });
    } else {
      existing.players.push(player);
    }
  }
  return [...groups.values()];
}

async function claimAndSend(input: {
  campaignId: string;
  team: string;
  endDate: string | null;
  kind: MilestoneName;
  email: string;
  parentFirst: string;
  token: string;
  players: MilestonePlayer[];
}): Promise<"sent" | "skipped" | "failed"> {
  const db = supabaseAdmin();
  const emailType = milestoneEmailType(input.kind);
  const { data, error } = await db
    .from("email_log")
    .insert({
      email_type: emailType,
      recipient: input.email,
      campaign_id: input.campaignId,
      status: "claimed",
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return "skipped";
    console.error("milestone claim failed", error.message);
    return "failed";
  }

  try {
    const message = milestoneEmail({
      kind: input.kind,
      team: input.team,
      parentFirst: input.parentFirst,
      token: input.token,
      players: input.players,
      endDate: input.endDate,
    });
    const resendId = await sendEmail({
      to: input.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      headers: { "List-Unsubscribe": `<${message.unsubscribeUrl}>` },
    });
    const { error: updateError } = await db
      .from("email_log")
      .update({ status: sentLogStatus(), resend_id: resendId })
      .eq("id", data.id);
    if (updateError) console.error("milestone log update failed", updateError.message);
    return "sent";
  } catch (err) {
    await db.from("email_log").update({ status: "failed" }).eq("id", data.id);
    console.error("milestone send failed", err instanceof Error ? err.message : "error");
    return "failed";
  }
}
