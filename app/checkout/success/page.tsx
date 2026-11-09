import Link from "next/link";
import { supabaseConfigured } from "@/lib/env";
import { formatCad } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const metadata = { title: "Order received", robots: { index: false, follow: false } };

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams;
  let summary: { status: string; total: number; bags: number } | null = null;
  if (sessionId && supabaseConfigured()) {
    const { data } = await supabaseAdmin()
      .from("orders")
      .select("payment_status, total_cad, total_bags")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();
    if (data) summary = { status: data.payment_status, total: data.total_cad, bags: data.total_bags };
  }

  return (
    <main className="page wrap">
      <h1>Thank you</h1>
      {summary ? (
        <p>
          {summary.status === "paid" ? "Payment received." : "We're confirming the payment."}{" "}
          {summary.bags} bag{summary.bags === 1 ? "" : "s"} · {formatCad(summary.total)}. A receipt is on its way to your email.
        </p>
      ) : (
        <p>If the payment went through, your receipt will arrive by email. The candy goes to the team organizer, not to a home address.</p>
      )}
      <p><Link href="/">Back to Sweet Success</Link></p>
    </main>
  );
}
