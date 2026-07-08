import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runReplyCheck } from "@/lib/scheduler-tasks";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runReplyCheck();

  return NextResponse.json({
    ok: !result.error,
    replies: result.count,
    error: result.error,
    ranAt: new Date().toISOString(),
  });
}
