import { createCheckout } from "@/lib/checkout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Missing order." }, { status: 400 });
  }
  try {
    const result = await createCheckout(body);
    if (!result.ok) return Response.json({ ok: false, error: result.error }, { status: result.status });
    return Response.json({ ok: true, url: result.url });
  } catch (error) {
    console.error("checkout failed", error instanceof Error ? error.message : "error");
    return Response.json({ ok: false, error: "We couldn't start checkout. Nothing was charged." }, { status: 500 });
  }
}
