import { isAdminRequest } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ campaignId: string }> }) {
  if (!(await isAdminRequest())) return new Response("Unauthorized", { status: 401 });
  const { campaignId } = await context.params;
  const { data, error } = await supabaseAdmin()
    .from("v_organizer_pick_list")
    .select(
      "player_last_name, player_first_name, buyer_name, buyer_email, buyer_phone, candy_name, bag_type_code, bags, includes_mix_pack, ordered_at",
    )
    .eq("campaign_id", campaignId);
  if (error) return new Response("Could not build the pick list", { status: 500 });

  const rows = [...(data ?? [])].sort(comparePick);
  const csv = toCsv(
    ["Player", "Buyer", "Email", "Phone", "Candy", "Bag", "Bags", "Mix pack", "Ordered"],
    rows.map((row) => [
      `${row.player_first_name} ${row.player_last_name}`.trim(),
      row.buyer_name,
      row.buyer_email,
      row.buyer_phone,
      row.candy_name,
      row.bag_type_code,
      row.bags,
      row.includes_mix_pack ? "yes" : "no",
      row.ordered_at,
    ]),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pick-list-${campaignId}.csv"`,
    },
  });
}

function comparePick(
  a: { player_last_name: string; player_first_name: string; buyer_name: string; candy_name: string },
  b: { player_last_name: string; player_first_name: string; buyer_name: string; candy_name: string },
) {
  return (
    a.player_last_name.localeCompare(b.player_last_name) ||
    a.player_first_name.localeCompare(b.player_first_name) ||
    (a.buyer_name || "").localeCompare(b.buyer_name || "") ||
    (a.candy_name || "").localeCompare(b.candy_name || "")
  );
}
