import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ organizerId: string }> }) {
  if (!(await isAdminRequest())) return new Response("Unauthorized", { status: 401 });
  const { organizerId } = await context.params;
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin()
    .from("organizers")
    .update({ status: "declined", declined_at: now })
    .eq("organizer_id", organizerId)
    .is("declined_at", null);
  if (error) {
    console.error("decline failed", error.message);
    redirect("/admin/applications?error=Could%20not%20mark%20declined");
  }
  redirect("/admin/applications");
}
