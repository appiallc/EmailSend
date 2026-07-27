import { NextResponse } from "next/server";
import { runFollowUpProcessing, runReplyCheck } from "@/lib/scheduler-tasks";

export async function POST() {
  // Await sequentially so that replies are checked and stored in the database first,
  // before processing due follow-up emails.
  const replyResult = await runReplyCheck();
  const followUpResult = await runFollowUpProcessing();

  return NextResponse.json({
    replies: replyResult.replies,
    bounces: replyResult.bounces,
    followUps: followUpResult.count,
    errors: [replyResult.error, followUpResult.error].filter(Boolean),
  });
}
