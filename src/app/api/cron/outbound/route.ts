import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runOutboundWithHealth } from "@/lib/scheduler-health";

export const maxDuration = 60;

/**
 * Queues due scheduled campaigns, drains the send queue, and creates due follow-ups.
 * Also safe to hit from external cron.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { followUps, outbound } = await runOutboundWithHealth();

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
