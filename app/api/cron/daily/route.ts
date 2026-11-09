import { cronAuthorized } from "@/lib/admin-auth";
import { sendDueFlowEmails } from "@/lib/flow-run";
import { sendDueMilestoneEmails } from "@/lib/milestones-run";
import { sendDueProspectEmails } from "@/lib/prospect-run";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!cronAuthorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const milestones = await sendDueMilestoneEmails().catch((error) => {
    console.error("milestone cron failed", error instanceof Error ? error.message : "error");
    return { error: "milestones" };
  });
  const prospects = await sendDueProspectEmails().catch((error) => {
    console.error("prospect cron failed", error instanceof Error ? error.message : "error");
    return { error: "prospects" };
  });
  const flow = await sendDueFlowEmails().catch((error) => {
    console.error("flow cron failed", error instanceof Error ? error.message : "error");
    return { error: "flow" };
  });
  return Response.json({ ok: true, milestones, prospects, flow });
}
