import { after } from "next/server";
import { sendApplyNotices, parseApplyBody, submitApplication } from "@/lib/apply";
import { allowRequest, requestRateKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Missing application." }, { status: 400 });
  }
  const parsed = parseApplyBody(body);
  if ("error" in parsed) {
    return Response.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  if (parsed.honeypot) {
    return Response.json({ ok: true, emailed: false, summary: null, startUrl: null });
  }
  if (!allowRequest(requestRateKey(request, "apply"))) {
    return Response.json({ ok: false, error: "We couldn't save that. Please try again." }, { status: 429 });
  }
  try {
    const result = await submitApplication(parsed);
    if (!result.ok) {
      return Response.json(
        { ok: false, error: result.error, outOfArea: result.outOfArea === true ? true : undefined },
        { status: result.status },
      );
    }
    if (result.notices?.length) {
      const notices = result.notices;
      after(() => sendApplyNotices(notices));
    }
    const { notices: _notices, ...body } = result;
    return Response.json(body);
  } catch (error) {
    console.error("apply failed", error instanceof Error ? error.message : "error");
    return Response.json({ ok: false, error: "We couldn't save that. Please try again." }, { status: 500 });
  }
}
