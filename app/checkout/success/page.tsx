import Link from "next/link";
import { gstIncludedCents } from "@/lib/gst";
import { supabaseConfigured } from "@/lib/env";
import { formatCad } from "@/lib/money";
import { playerDisplayName } from "@/lib/names";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bagCount } from "@/lib/text";

export const metadata = { title: "Order received", robots: { index: false, follow: false } };

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams;
  let summary: { status: string; total: number; bags: number; team: string; participant: string } | null = null;
  if (sessionId && supabaseConfigured()) {
    const { data } = await supabaseAdmin()
      .from("orders")
      .select("payment_status, total_cad, total_bags, cp_id, campaign_id")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();
    if (data) {
      const [{ data: campaign }, { data: player }] = await Promise.all([
        supabaseAdmin().from("campaigns").select("campaign_name").eq("campaign_id", data.campaign_id).maybeSingle(),
        supabaseAdmin()
          .from("campaign_participants")
          .select("player_first_name, player_last_name, hide_last_name")
          .eq("cp_id", data.cp_id)
          .maybeSingle(),
      ]);
      summary = {
        status: data.payment_status,
        total: data.total_cad,
        bags: data.total_bags,
        team: campaign?.campaign_name || "the team",
        participant: playerDisplayName(player?.player_first_name || "", player?.player_last_name, true),
      };
    }
  }

  return (
    <main className="page wrap">
      <h1>Thank you</h1>
      {summary ? (
        <>
          <p>Thanks for supporting {summary.team}.</p>
          <p>[NEEDS CORA: participant credit line] {summary.participant}</p>
          <p>
            {summary.status === "paid" ? "Payment received." : "We're confirming the payment."}{" "}
            {bagCount(summary.bags)} · {formatCad(summary.total)}.
          </p>
          <p>Includes GST (5%) {formatCad(gstIncludedCents(summary.total))}</p>
          <p>A receipt is on its way to your email.</p>
        </>
      ) : (
        <p>If the payment went through, your receipt will arrive by email. The candy goes to the team organizer, not to a home address.</p>
      )}
      <p><Link href="/">Back to Sweet Success</Link></p>
    </main>
  );
}
