import { cashReceiptCopy } from "@/lib/cash-receipt";
import { supabaseConfigured } from "@/lib/env";
import { receiptMoneyLines } from "@/lib/gst";
import { isUnguessableToken } from "@/lib/ledger-rules";
import { formatCad } from "@/lib/money";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bagCount } from "@/lib/text";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cash receipt", robots: { index: false, follow: false } };

export default async function ReceiptPage({ params }: { params: Promise<{ receiptToken: string }> }) {
  const { receiptToken } = await params;
  if (!supabaseConfigured() || !isUnguessableToken(receiptToken)) return <Missing />;

  const { data, error } = await supabaseAdmin().rpc("fn_receipt_by_token", { p_token: receiptToken });
  if (error || !data || typeof data !== "object") return <Missing />;
  const row = data as {
    buyer_name?: string;
    total_cad?: number;
    total_bags?: number;
    cash_received_at?: string | null;
    cash_received_by?: string | null;
    line_items?: unknown;
    campaign_name?: string;
  };
  const lines = Array.isArray(row.line_items)
    ? row.line_items.map((item) => {
        const line = item as { display_name?: string | null; qty?: number; gross_cents?: number; bundle_label?: string | null };
        const candy = line.display_name || "Freeze-dried candy";
        return {
          label: line.bundle_label ? `${line.bundle_label}: ${candy}` : candy,
          qty: line.qty ?? 0,
          amountCents: line.gross_cents ?? 0,
        };
      })
    : [];
  const copy = cashReceiptCopy({
    buyerName: row.buyer_name || "Supporter",
    team: row.campaign_name || "the team",
    totalCents: row.total_cad ?? 0,
    bags: row.total_bags ?? 0,
    receivedBy: row.cash_received_by || "The parent",
    receivedAt: row.cash_received_at ?? null,
    lines,
    receiptToken,
  });

  return (
    <main className="page wrap">
      <p className="kicker">Cash receipt</p>
      <h1>{row.campaign_name || "Cash receipt"}</h1>
      <p><strong>{row.cash_received_by || "The parent"}</strong> received this payment on behalf of the team.</p>
      <p>Buyer: {row.buyer_name}</p>
      <ul>
        {lines.map((line, index) => (
          <li key={`${line.label}-${index}`}>{line.label} × {line.qty} — {formatCad(line.amountCents)}</li>
        ))}
      </ul>
      {receiptMoneyLines(row.total_cad ?? 0).map((line) => <p key={line}>{line}</p>)}
      <p>{bagCount(row.total_bags ?? 0)}</p>
      <p className="muted">{copy.text.includes("Received") ? copy.text.split("\n").find((line) => line.startsWith("Received")) : null}</p>
      <p>Questions? Email <a href="mailto:hello@sweetsuccessfundraising.com">hello@sweetsuccessfundraising.com</a>.</p>
      <p>Thanks,<br />The Sweet Success Family</p>
    </main>
  );
}

function Missing() {
  return (
    <main className="page wrap">
      <h1>Link not valid</h1>
      <p>This receipt link doesn't match an order.</p>
    </main>
  );
}
