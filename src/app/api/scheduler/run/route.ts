import { NextResponse } from "next/server";
import { runFollowUpProcessing, runReplyCheck } from "@/lib/scheduler-tasks";

export async function POST() {
  const [replyResult, followUpResult] = await Promise.all([
    runReplyCheck(),
    runFollowUpProcessing(),
  ]);

  return NextResponse.json({
    replies: replyResult.replies,
    bounces: replyResult.bounces,
    followUps: followUpResult.count,
    errors: [replyResult.error, followUpResult.error].filter(Boolean),
  });
}
