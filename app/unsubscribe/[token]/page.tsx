import { supabaseConfigured } from "@/lib/env";
import { isUnguessableToken } from "@/lib/ledger-rules";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!supabaseConfigured() || !isUnguessableToken(token)) return <Invalid />;

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("families")
    .select("family_id")
    .eq("email_unsub_token", token)
    .maybeSingle();
  if (error || !data) return <Invalid />;

  const { error: updateError } = await db
    .from("families")
    .update({ email_opted_out_at: new Date().toISOString() })
    .eq("family_id", data.family_id)
    .is("email_opted_out_at", null);
  if (updateError) {
    return (
      <main className="page wrap">
        <h1>Try again</h1>
        <p>We couldn't update that preference just now.</p>
      </main>
    );
  }

  return (
    <main className="page wrap">
      <h1>You're unsubscribed</h1>
      <p>Campaign updates will stop for this family. Receipts for orders you pay for still send.</p>
    </main>
  );
}

function Invalid() {
  return (
    <main className="page wrap">
      <h1>Link not valid</h1>
      <p>This link doesn't match a fundraiser.</p>
    </main>
  );
}
