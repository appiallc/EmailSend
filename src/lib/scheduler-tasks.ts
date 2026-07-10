import { checkForReplies } from "./replies";
import { processDueFollowUps } from "./campaign";

const SCHEDULER_TASK_TIMEOUT_MS = 60_000;

export interface ReplyCheckResult {
  replies: number;
  bounces: number;
  total: number;
  error: string | null;
}

async function runTimedTask<T>(name: string, task: () => Promise<T>): Promise<T | { error: string }> {
  let timeout: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${name} timed out after ${SCHEDULER_TASK_TIMEOUT_MS / 1000}s`));
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
  let timeout: NodeJS.Timeout | undefined;

  try {
    const count = await Promise.race([
      processDueFollowUps(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(
            new Error(`Follow-up processing timed out after ${SCHEDULER_TASK_TIMEOUT_MS / 1000}s`)
          );
        }, SCHEDULER_TASK_TIMEOUT_MS);
      }),
    ]);
    return { count, error: null as string | null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Follow-up processing failed";
    console.error(`[scheduler] Follow-up processing failed:`, err);
    return { count: 0, error: message };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
