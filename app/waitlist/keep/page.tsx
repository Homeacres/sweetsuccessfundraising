import { EXPRESS_CONSENT_TEXT, KEEP_BUTTON, KEEP_THANKS } from "@/lib/waitlist-copy";
import { planExpressConsent } from "@/lib/area-waitlist";
import { isUnguessableToken } from "@/lib/ledger-rules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/env";
import { cleanText } from "@/lib/text";

export const dynamic = "force-dynamic";
export const metadata = { title: "Keep me posted", robots: { index: false, follow: false } };

export default async function KeepPostedPage({ searchParams }: { searchParams: Promise<{ t?: string; done?: string }> }) {
  const query = await searchParams;
  const token = cleanText(query.t, 80);
  if (!supabaseConfigured() || !isUnguessableToken(token)) return <Neutral />;
  const { data, error } = await supabaseAdmin()
    .from("area_waitlist")
    .select("unsubscribed_at, consent_type, express_consented_at")
    .eq("keep_token", token)
    .maybeSingle();
  if (error || !data) return <Neutral />;
  const plan = planExpressConsent({
    unsubscribedAt: data.unsubscribed_at,
    consentType: data.consent_type === "express" ? "express" : "implied",
    expressConsentedAt: data.express_consented_at,
  }, new Date().toISOString());
  if (plan === "neutral" || plan === "blocked") return <Neutral />;
  if (query.done === "1" && (plan === "already" || data.consent_type === "express")) {
    return (
      <main className="page wrap">
        <h1>{KEEP_THANKS}</h1>
      </main>
    );
  }
  return (
    <main className="page wrap">
      <h1>Keep me posted</h1>
      <p>{EXPRESS_CONSENT_TEXT}</p>
      <form method="post" action="/api/waitlist/keep">
        <input type="hidden" name="token" value={token} />
        <button className="btn btn-navy" type="submit">{KEEP_BUTTON}</button>
      </form>
    </main>
  );
}

function Neutral() {
  return (
    <main className="page wrap">
      <h1>This link isn't working</h1>
      <p>Sorry, this link isn't working anymore. It may have expired, or you may already be unsubscribed.</p>
      <p>Questions? <a href="mailto:hello@sweetsuccessfundraising.com">Email hello@sweetsuccessfundraising.com</a></p>
    </main>
  );
}
