import cron from "node-cron";
import { checkForReplies } from "./replies";
import { processDueFollowUps } from "./campaign";

let started = false;

export function startScheduler() {
  if (started) return;
  started = true;

  // Check for replies every 15 minutes
  cron.schedule("*/15 * * * *", async () => {
    try {
      const count = await checkForReplies();
      if (count > 0) console.log(`[scheduler] Marked ${count} email(s) as replied`);
    } catch (err) {
      console.error("[scheduler] Reply check failed:", err);
    }
  });

  // Process follow-ups every hour
  cron.schedule("0 * * * *", async () => {
    try {
      const count = await processDueFollowUps();
      if (count > 0) console.log(`[scheduler] Sent ${count} follow-up(s)`);
    } catch (err) {
      console.error("[scheduler] Follow-up processing failed:", err);
    }
  });

  console.log("[scheduler] Email follow-up & reply checker started");
}
