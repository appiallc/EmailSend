import { NextResponse } from "next/server";
import { checkForReplies } from "@/lib/replies";
import { processDueFollowUps } from "@/lib/campaign";

const SCHEDULER_TASK_TIMEOUT_MS = 60_000;

async function runTask(name: string, task: () => Promise<number>) {
  let timeout: NodeJS.Timeout | undefined;

  try {
    const result = await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${name} timed out after ${SCHEDULER_TASK_TIMEOUT_MS / 1000}s`));
        }, SCHEDULER_TASK_TIMEOUT_MS);
      }),
    ]);

    return { count: result, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : `${name} failed`;
    console.error(`[scheduler] ${name} failed:`, err);
    return { count: 0, error: message };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function POST() {
  const [replyResult, followUpResult] = await Promise.all([
    runTask("Reply check", checkForReplies),
    runTask("Follow-up processing", processDueFollowUps),
  ]);

  return NextResponse.json({
    replies: replyResult.count,
    followUps: followUpResult.count,
    errors: [replyResult.error, followUpResult.error].filter(Boolean),
  });
}
