import {
  processDueFollowUps,
  processOutboundQueue,
} from "./campaign";
import { checkForReplies } from "./replies";

const SCHEDULER_TASK_TIMEOUT_MS = 60_000;

export interface ReplyCheckResult {
  replies: number;
  bounces: number;
  total: number;
  error: string | null;
}

async function runTimedTask<T>(
  name: string,
  task: () => Promise<T>
): Promise<T | { error: string }> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(`${name} timed out after ${SCHEDULER_TASK_TIMEOUT_MS / 1000}s`)
          );
        }, SCHEDULER_TASK_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : `${name} failed`;
    console.error(`[scheduler] ${name} failed:`, err);
    return { error: message };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runReplyCheck(): Promise<ReplyCheckResult> {
  const result = await runTimedTask("Reply check", checkForReplies);
  if ("error" in result) {
    return { replies: 0, bounces: 0, total: 0, error: result.error };
  }
  return {
    replies: result.replies,
    bounces: result.bounces,
    total: result.replies + result.bounces,
    error: null,
  };
}

export async function runFollowUpProcessing() {
  const result = await runTimedTask("Follow-up processing", processDueFollowUps);
  if (typeof result === "object" && result && "error" in result) {
    return { count: 0, error: result.error };
  }
  return { count: result as number, error: null as string | null };
}

export async function runOutboundProcessing() {
  const result = await runTimedTask("Outbound processing", processOutboundQueue);
  if (typeof result === "object" && result && "error" in result) {
    return {
      scheduledQueued: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      campaigns: 0,
      error: result.error,
    };
  }
  const data = result as Awaited<ReturnType<typeof processOutboundQueue>>;
  return { ...data, error: null as string | null };
}

/** @deprecated use runOutboundProcessing — kept for older imports */
export async function runScheduledCampaignProcessing() {
  return runOutboundProcessing();
}
