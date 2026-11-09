import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await isAdminRequest())) {
    return new Response("Unauthorized", { status: 401 });
  }
  const form = await request.formData();
  const campaignId = String(form.get("campaign_id") ?? "");
  const status = String(form.get("status") ?? "delivered");
  const receivedBy = String(form.get("received_by") ?? "").trim().slice(0, 200);
  const notes = String(form.get("notes") ?? "").trim().slice(0, 2000);
  const scheduled = String(form.get("scheduled_for") ?? "");
  const bagsRaw = String(form.get("bags_delivered") ?? "").trim();
  const bags = bagsRaw === "" ? null : Number(bagsRaw);
  if (!campaignId) redirect("/admin");
  if (status !== "scheduled" && status !== "delivered") redirect(`/admin/campaigns/${campaignId}?error=delivery`);
  if (bags != null && (!Number.isInteger(bags) || bags < 0)) {
    redirect(`/admin/campaigns/${campaignId}?error=delivery`);
  }

  const delivered = status === "delivered";
  const { error } = await supabaseAdmin().from("deliveries").insert({
    campaign_id: campaignId,
    status,
    scheduled_for: scheduled || null,
    delivered_at: delivered ? new Date().toISOString() : null,
    received_by: receivedBy || null,
    bags_delivered: bags,
    notes: notes || null,
  });
  if (error) {
    console.error("delivery insert failed", error.message);
    redirect(`/admin/campaigns/${campaignId}?error=delivery`);
  }
  redirect(`/admin/campaigns/${campaignId}`);
}
