import { supabaseConfigured } from "@/lib/env";
import { isUnguessableToken } from "@/lib/ledger-rules";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };

export default async function WaitlistUnsubscribePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  if (!supabaseConfigured() || !isUnguessableToken(token)) return <Invalid />;
  const db = supabaseAdmin();
  const { data, error } = await db.from("area_waitlist").select("id").eq("unsub_token", token).maybeSingle();
  if (error || !data) return <Invalid />;
  if (query.done === "1") {
    return (
      <main className="page wrap">
        <h1>You're unsubscribed</h1>
      </main>
    );
  }
  return (
    <main className="page wrap">
      <h1>Unsubscribe</h1>
      <form method="post" action="/api/waitlist/unsubscribe">
        <input type="hidden" name="token" value={token} />
        <button className="btn btn-navy" type="submit">Unsubscribe</button>
      </form>
    </main>
  );
}

function Invalid() {
  return (
    <main className="page wrap">
      <h1>This link isn't working</h1>
      <p>Sorry, this link isn't working anymore. It may have expired, or you may already be unsubscribed.</p>
      <p>Questions? <a href="mailto:hello@sweetsuccessfundraising.com">Email hello@sweetsuccessfundraising.com</a></p>
    </main>
  );
}
