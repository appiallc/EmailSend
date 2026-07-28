import { NextResponse } from "next/server";
import {
  runFollowUpProcessing,
  runOutboundProcessing,
  runReplyCheck,
} from "@/lib/scheduler-tasks";

export async function POST() {
  const replyResult = await runReplyCheck();
  const followUpResult = await runFollowUpProcessing();
  const outboundResult = await runOutboundProcessing();

  return NextResponse.json({
    replies: replyResult.replies,
    bounces: replyResult.bounces,
    followUps: followUpResult.count,
    scheduledCampaigns: outboundResult.scheduledQueued,
    sent: outboundResult.sent,
    failed: outboundResult.failed,
    errors: [
      replyResult.error,
      followUpResult.error,
      outboundResult.error,
    ].filter(Boolean),
  });
}
