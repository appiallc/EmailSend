import { checkForReplies } from "./replies";
import { processDueFollowUps } from "./campaign";

const SCHEDULER_TASK_TIMEOUT_MS = 60_000;

export async function runTask(name: string, task: () => Promise<number>) {
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

    return { count: result, error: null as string | null };
  } catch (err) {
    const message = err instanceof Error ? err.message : `${name} failed`;
    console.error(`[scheduler] ${name} failed:`, err);
    return { count: 0, error: message };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runReplyCheck() {
  return runTask("Reply check", checkForReplies);
}

export async function runFollowUpProcessing() {
  return runTask("Follow-up processing", processDueFollowUps);
}
