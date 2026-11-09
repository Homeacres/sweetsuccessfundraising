import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/admin-auth";
import { approveAppliedOrganizer, supabaseApplicationRepo } from "@/lib/applications";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ organizerId: string }> }) {
  if (!(await isAdminRequest())) return new Response("Unauthorized", { status: 401 });
  const { organizerId } = await context.params;
  const form = await request.formData();
  const result = await approveAppliedOrganizer(supabaseApplicationRepo(), {
    organizerId,
    startDate: String(form.get("start_date") || ""),
    endDate: String(form.get("end_date") || ""),
  });
  if (!result.ok) redirect(`/admin/applications?error=${encodeURIComponent(result.error)}`);
  redirect(`/admin/campaigns/${result.campaignId}`);
}
