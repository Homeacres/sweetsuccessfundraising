import { redirect } from "next/navigation";
import { isAdminRequest } from "@/lib/admin-auth";
import { dollarsToCents } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cleanText } from "@/lib/text";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ offerId: string }> }) {
  if (!(await isAdminRequest())) redirect("/admin/login");
  const { offerId } = await context.params;
  const form = await request.formData();
  const label = cleanText(form.get("label"), 80);
  const description = cleanText(form.get("description"), 240);
  const price = Number(form.get("priceDollars"));
  const share = Number(form.get("shareDollars"));
  if (!label || !Number.isFinite(price) || !Number.isFinite(share)) {
    redirect("/admin/bundles?error=bundle_offers_price");
  }
  const { error } = await supabaseAdmin()
    .from("bundle_offers")
    .update({
      label,
      description: description || null,
      price_cents: dollarsToCents(price),
      team_share_cents: dollarsToCents(share),
      is_active: form.get("is_active") === "1",
      is_test: form.get("is_test") === "1",
    })
    .eq("offer_id", offerId);
  if (error) redirect(`/admin/bundles?error=${encodeURIComponent(error.message)}`);
  redirect("/admin/bundles?saved=1");
}
