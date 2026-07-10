import cron from "node-cron";
import { runFollowUpProcessing, runReplyCheck } from "./scheduler-tasks";

let started = false;

// In-process cron only runs during local dev or on a long-running Node server.
// On Vercel serverless, use /api/cron/replies and /api/cron/follow-ups instead.
export function startScheduler() {
  if (started) return;
  if (process.env.VERCEL === "1") {
    console.log("[scheduler] Skipped on Vercel — use /api/cron/* routes with an external scheduler");
    return;
  }
  started = true;

  cron.schedule("*/15 * * * *", async () => {
    const result = await runReplyCheck();
    if (result.replies > 0) {
      console.log(`[scheduler] Marked ${result.replies} email(s) as replied`);
    }
    if (result.bounces > 0) {
      console.log(`[scheduler] Marked ${result.bounces} email(s) as bounced`);
    }
  });

  cron.schedule("0 * * * *", async () => {
    const result = await runFollowUpProcessing();
    if (result.count > 0) {
      console.log(`[scheduler] Sent ${result.count} follow-up(s)`);
    }
  });

  console.log("[scheduler] Local reply check (15 min) and follow-ups (hourly) started");
}
