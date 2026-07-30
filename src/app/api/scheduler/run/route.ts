import { NextResponse } from "next/server";
import {
  runFollowUpProcessing,
  runOutboundProcessing,
  runReplyCheck,
} from "@/lib/scheduler-tasks";
import { prisma } from "@/lib/db";

export async function POST() {
  const replyResult = await runReplyCheck();
  const followUpResult = await runFollowUpProcessing();
  const outboundResult = await runOutboundProcessing();

  try {
    await prisma.settings.update({
      where: { id: "default" },
      data: {
        lastOutboundAt: new Date(),
        lastOutboundError: followUpResult.error || outboundResult.error || "",
        lastReplyCheckAt: new Date(),
        lastReplyCheckError: replyResult.error || "",
      },
    });
  } catch (err) {
    console.error("[scheduler] Failed to record health:", err);
  }

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
