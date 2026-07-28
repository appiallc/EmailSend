import cron from "node-cron";
import {
  runFollowUpProcessing,
  runOutboundProcessing,
  runReplyCheck,
} from "./scheduler-tasks";

let started = false;

// In-process cron only runs during local dev or on a long-running Node server.
// On Vercel serverless, use /api/cron/* routes (see vercel.json).
export function startScheduler() {
  if (started) return;
  if (process.env.VERCEL === "1") {
    console.log(
      "[scheduler] Skipped on Vercel — use cron-job.org hitting /api/cron/outbound and /api/cron/replies"
    );
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

  // Outbound: scheduled campaigns + background send batches every minute
  cron.schedule("* * * * *", async () => {
    const outbound = await runOutboundProcessing();
    if (outbound.scheduledQueued > 0 || outbound.sent > 0) {
      console.log(
        `[scheduler] Outbound: queued ${outbound.scheduledQueued} campaign(s), sent ${outbound.sent}, failed ${outbound.failed}`
      );
    }
    if (outbound.error) {
      console.error(`[scheduler] Outbound: ${outbound.error}`);
    }

    const followUps = await runFollowUpProcessing();
    if (followUps.count > 0) {
      console.log(`[scheduler] Created ${followUps.count} follow-up(s)`);
      await runOutboundProcessing();
    }
  });

  console.log(
    "[scheduler] Local reply check (15 min) and outbound/follow-ups (1 min) started"
  );
}
