import { isAdminRequest } from "@/lib/admin-auth";
import { toCsv } from "@/lib/csv";
import { formatUserDate } from "@/lib/dates";
import { packLines } from "@/lib/pick-list";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ campaignId: string }> }) {
  if (!(await isAdminRequest())) return new Response("Unauthorized", { status: 401 });
  const { campaignId } = await context.params;
  let rows;
  try {
    rows = await packLines(campaignId);
  } catch {
    return new Response("Could not build the pick list", { status: 500 });
  }
  rows.sort((a, b) =>
    a.playerLast.localeCompare(b.playerLast) ||
    a.playerFirst.localeCompare(b.playerFirst) ||
    a.buyerName.localeCompare(b.buyerName) ||
    a.candyName.localeCompare(b.candyName),
  );
  const csv = toCsv(
    ["Participant", "Buyer", "Email", "Phone", "Bundle", "Candy", "Bag", "Bags", "Mix pack", "Ordered"],
    rows.map((row) => [
      `${row.playerFirst} ${row.playerLast}`.trim(),
      row.buyerName,
      row.buyerEmail,
      row.buyerPhone,
      row.bundleLabel,
      row.candyName,
      row.bagCode,
      row.bags,
      row.mix ? "yes" : "no",
      formatUserDate(row.orderedAt) || row.orderedAt,
    ]),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pick-list-${campaignId}.csv"`,
    },
  });
}
