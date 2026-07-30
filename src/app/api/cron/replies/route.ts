import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runReplyCheckWithHealth } from "@/lib/scheduler-health";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runReplyCheckWithHealth();

  return NextResponse.json({
    ok: !result.error,
    replies: result.replies,
    bounces: result.bounces,
    total: result.total,
    error: result.error,
    ranAt: new Date().toISOString(),
  });
}
