import { cronAuthorized } from "@/lib/admin-auth";
import { sendDueMilestoneEmails } from "@/lib/milestones-run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await sendDueMilestoneEmails();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("milestone cron failed", error instanceof Error ? error.message : "error");
    return Response.json({ error: "Cron failed" }, { status: 500 });
  }
}
