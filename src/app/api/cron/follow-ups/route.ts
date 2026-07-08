import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { runFollowUpProcessing } from "@/lib/scheduler-tasks";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runFollowUpProcessing();

  return NextResponse.json({
    ok: !result.error,
    followUps: result.count,
    error: result.error,
    ranAt: new Date().toISOString(),
  });
}
