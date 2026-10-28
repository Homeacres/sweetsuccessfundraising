import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/admin-auth";
import { sendDueMilestoneEmails } from "@/lib/milestones-run";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ campaignId: string }> }) {
  if (!(await isAdminRequest())) return new Response("Unauthorized", { status: 401 });
  const { campaignId } = await context.params;
  const { error } = await supabaseAdmin()
    .from("campaigns")
    .update({ status: "closed" })
    .eq("campaign_id", campaignId)
    .eq("status", "active");
  if (error) {
    console.error("close campaign failed", error.message);
    redirect(`/admin/campaigns/${campaignId}?error=close`);
  }
  try {
    await sendDueMilestoneEmails(campaignId);
  } catch (err) {
    console.error("close email failed", err instanceof Error ? err.message : "error");
  }
  redirect(`/admin/campaigns/${campaignId}`);
}
