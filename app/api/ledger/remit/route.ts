import { isUnguessableToken } from "@/lib/ledger-rules";
import { startRemittance } from "@/lib/remit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") || "");
  if (!isUnguessableToken(token)) return Response.redirect(new URL("/p/ledger/invalid", request.url), 303);
  const back = `/p/ledger/${encodeURIComponent(token)}`;
  try {
    const result = await startRemittance(token);
    if (!result.ok) {
      const code = result.status === 400 ? "remit" : "link";
      return Response.redirect(new URL(`${back}?error=${code}`, request.url), 303);
    }
    return Response.redirect(result.url, 303);
  } catch (error) {
    console.error("remit failed", error instanceof Error ? error.message : "error");
    return Response.redirect(new URL(`${back}?error=remit`, request.url), 303);
  }
}
