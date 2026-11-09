import { redirect } from "next/navigation";
import { AdminInbox } from "@/components/AdminInbox";
import { AdminNav } from "@/components/AdminNav";
import { isAdminRequest } from "@/lib/admin-auth";
import { inboundEmailEnabled } from "@/lib/email/prospect";
import { supabaseConfigured } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Inbox", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  if (!(await isAdminRequest())) redirect("/admin/login");
  const enabled = inboundEmailEnabled();
  const rows = enabled && supabaseConfigured()
    ? (await supabaseAdmin().from("inbound_messages").select("id, from_email, subject, received_at, handled_at").order("received_at", { ascending: false })).data ?? []
    : [];

  return (
    <main className="page wrap">
      <h1>Inbox</h1>
      <AdminNav />
      <AdminInbox
        enabled={enabled}
        rows={rows.map((row) => ({
          id: row.id,
          fromEmail: row.from_email,
          subject: row.subject,
          receivedAt: row.received_at,
          handledAt: row.handled_at,
        }))}
      />
    </main>
  );
}
