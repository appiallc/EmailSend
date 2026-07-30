import {
  runFollowUpProcessing,
  runOutboundProcessing,
  runReplyCheck,
} from "./scheduler-tasks";
import { prisma } from "./db";

async function recordOutboundHealth(error: string | null) {
  try {
    await prisma.settings.update({
      where: { id: "default" },
      data: {
        lastOutboundAt: new Date(),
        lastOutboundError: error ?? "",
      },
    });
  } catch (err) {
    console.error("[scheduler] Failed to record outbound health:", err);
  }
}

async function recordReplyHealth(error: string | null) {
  try {
    await prisma.settings.update({
      where: { id: "default" },
      data: {
        lastReplyCheckAt: new Date(),
        lastReplyCheckError: error ?? "",
      },
    });
  } catch (err) {
    console.error("[scheduler] Failed to record reply health:", err);
  }
}

export async function runReplyCheckWithHealth() {
  const result = await runReplyCheck();
  await recordReplyHealth(result.error);
  return result;
}

export async function runOutboundWithHealth() {
  const followUps = await runFollowUpProcessing();
  const outbound = await runOutboundProcessing();
  const error = followUps.error || outbound.error || null;
  await recordOutboundHealth(error);
  return { followUps, outbound };
}
