import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  runFollowUpProcessing,
  runOutboundProcessing,
} from "@/lib/scheduler-tasks";

export const maxDuration = 60;

/**
 * Queues due scheduled campaigns, drains the send queue, and creates due follow-ups.
 * Vercel cron: every minute (see vercel.json). Also safe to hit from external cron.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const followUps = await runFollowUpProcessing();
  const outbound = await runOutboundProcessing();

  return NextResponse.json({
    ok: !followUps.error && !outbound.error,
    followUpsCreated: followUps.count,
    scheduledQueued: outbound.scheduledQueued,
    sent: outbound.sent,
    failed: outbound.failed,
    skipped: outbound.skipped,
    error: followUps.error || outbound.error,
    ranAt: new Date().toISOString(),
  });
}
