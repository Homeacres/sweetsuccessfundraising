import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ messageId: string }> }) {
  if (!(await isAdminRequest())) return new Response("Unauthorized", { status: 401 });
  const { messageId } = await context.params;
  await supabaseAdmin().from("inbound_messages").update({ handled_at: new Date().toISOString() }).eq("id", messageId).is("handled_at", null);
  redirect("/admin/inbox");
}
