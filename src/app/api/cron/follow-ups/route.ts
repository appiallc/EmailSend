import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  runFollowUpProcessing,
  runOutboundProcessing,
} from "@/lib/scheduler-tasks";

export const maxDuration = 60;

/** @deprecated Prefer /api/cron/outbound — kept for existing external cron URLs. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const followUps = await runFollowUpProcessing();
  const outbound = await runOutboundProcessing();

  return NextResponse.json({
    ok: !followUps.error && !outbound.error,
    scheduledCampaigns: outbound.scheduledQueued,
    followUps: followUps.count,
    sent: outbound.sent,
    failed: outbound.failed,
    error: followUps.error || outbound.error,
    ranAt: new Date().toISOString(),
  });
}
