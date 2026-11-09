import { organizerActionSecret, verifyOrganizerAction } from "@/lib/organizer-token";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/env";
import { recordOrganizerStart } from "@/lib/organizer-actions";

export const metadata = { title: "Start my fundraiser", robots: { index: false, follow: false } };

export default async function StartPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const secret = organizerActionSecret();
  const parsed = secret ? verifyOrganizerAction(token, "start", secret) : null;
  if (!parsed) {
    return (
      <main className="page wrap">
        <h1>This link is not valid</h1>
        <p>Ask us for a new link if you still want to start.</p>
      </main>
    );
  }
  let team = "your group";
  let already = false;
  if (supabaseConfigured()) {
    const { data } = await supabaseAdmin()
      .from("organizers")
      .select("organization_name, started_at")
      .eq("organizer_id", parsed.organizerId)
      .maybeSingle();
    if (data?.organization_name) team = data.organization_name;
    already = Boolean(data?.started_at);
  }

  async function confirm(formData: FormData) {
    "use server";
    const submitted = String(formData.get("token") || "");
    await recordOrganizerStart(submitted);
  }

  return (
    <main className="page wrap">
      <div className="card" style={{ maxWidth: 520 }}>
        <h1>Start my fundraiser</h1>
        {already ? (
          <p>{team} is already started. We won't send more follow-ups.</p>
        ) : (
          <>
            <p>Confirm and we'll mark {team} as started. Follow-up emails stop here.</p>
            <form action={confirm}>
              <input type="hidden" name="token" value={token} />
              <button className="btn btn-navy" type="submit">Start my fundraiser</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
