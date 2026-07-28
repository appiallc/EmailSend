import { prisma } from "./db";
import { getSettings } from "./db";
import { sendTrackedEmail } from "./email";
import {
  computeFollowUpDue,
  getFollowUpStepConfig,
  getFollowUpSteps,
} from "./follow-ups";
import { getSuppressedEmailSet, normalizeEmail } from "./suppression";
import type { Contact } from "@prisma/client";

/** Max emails to send per outbound worker run (avoids HTTP/cron timeouts). */
export const SEND_BATCH_LIMIT = 25;

async function scheduleNextFollowUp(
  campaignId: string,
  contactId: string,
  initialSentAt: Date
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;

  const sentFollowUps = await prisma.emailLog.count({
    where: {
      campaignId,
      contactId,
      type: "followup",
      status: { in: ["sent", "opened", "clicked", "replied"] },
    },
  });

  const nextStepConfig = getFollowUpStepConfig(campaign, sentFollowUps + 1);
  const initialLog = await prisma.emailLog.findFirst({
    where: { campaignId, contactId, type: "initial" },
  });
  if (!initialLog) return;

  await prisma.emailLog.update({
    where: { id: initialLog.id },
    data: {
      followUpDue: nextStepConfig
        ? computeFollowUpDue(initialSentAt, nextStepConfig.days)
        : null,
    },
  });
}

export async function sendCampaignEmails(
  campaignId: string,
  type: "initial" | "followup" = "initial",
  opts?: { limit?: number }
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found");

  const settings = await getSettings();
  const limit = opts?.limit ?? SEND_BATCH_LIMIT;

  const logs = await prisma.emailLog.findMany({
    where: { campaignId, type, status: "pending" },
    include: { contact: true },
    take: limit,
    orderBy: { id: "asc" },
  });

  const suppressed = await getSuppressedEmailSet(logs.map((l) => l.contact.email));

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const log of logs) {
    try {
      if (suppressed.has(normalizeEmail(log.contact.email))) {
        await prisma.emailLog.update({
          where: { id: log.id },
          data: {
            status: "failed",
            error: "Skipped: email is on the suppression list",
          },
        });
        skipped++;
        continue;
      }

      const checkRepliedOrBounced = await prisma.emailLog.findFirst({
        where: {
          campaignId,
          contactId: log.contactId,
          status: { in: ["replied", "bounced"] },
        },
      });

      if (checkRepliedOrBounced) {
        await prisma.emailLog.delete({
          where: { id: log.id },
        });
        skipped++;
        continue;
      }

      let subject: string;
      let bodyHtml: string;

      if (type === "initial") {
        subject = campaign.subject;
        bodyHtml = campaign.bodyHtml;
      } else {
        const step = log.followUpStep || 1;
        const stepConfig = getFollowUpStepConfig(campaign, step);
        if (!stepConfig) {
          throw new Error(`Missing follow-up step ${step}`);
        }
        const cleanSubject = campaign.subject.trim();
        subject = /^re:/i.test(cleanSubject) ? cleanSubject : `Re: ${cleanSubject}`;
        bodyHtml = stepConfig.bodyHtml;
      }

      if (!subject || !bodyHtml) {
        throw new Error(`Missing ${type} email template`);
      }

      const initialLog =
        type === "followup"
          ? await prisma.emailLog.findFirst({
              where: { campaignId, contactId: log.contactId, type: "initial" },
            })
          : null;

      let inReplyTo: string | undefined = undefined;
      let references: string | undefined = undefined;

      if (type === "followup") {
        const previousLogs = await prisma.emailLog.findMany({
          where: {
            campaignId,
            contactId: log.contactId,
            status: { in: ["sent", "opened", "clicked", "replied"] },
          },
          orderBy: { sentAt: "asc" },
        });

        if (previousLogs.length > 0) {
          const lastLog = previousLogs[previousLogs.length - 1];
          inReplyTo = lastLog.messageId ?? undefined;
          references = previousLogs
            .map((l) => l.messageId)
            .filter((m): m is string => !!m)
            .join(" ");
        }
      }

      const result = await sendTrackedEmail({
        settings,
        contact: log.contact,
        subject,
        bodyHtml,
        trackingId: log.trackingId,
        inReplyTo,
        references,
      });

      const sentAt = new Date();
      let followUpDue: Date | null = null;

      if (type === "initial") {
        const firstStep = getFollowUpSteps(campaign)[0];
        if (firstStep) {
          followUpDue = computeFollowUpDue(sentAt, firstStep.days);
        }
      }

      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "sent",
          sentAt,
          messageId: result.messageId,
          followUpDue: type === "initial" ? followUpDue : null,
        },
      });

      if (type === "followup" && initialLog?.sentAt) {
        await scheduleNextFollowUp(campaignId, log.contactId, initialLog.sentAt);
      }

      sent++;
    } catch (err) {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "failed",
          error: err instanceof Error ? err.message : "Send failed",
        },
      });
      failed++;
    }
  }

  if (type === "initial") {
    const pending = await prisma.emailLog.count({
      where: { campaignId, type: "initial", status: "pending" },
    });
    if (pending === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "sent", sentAt: new Date(), scheduledAt: null },
      });
    }
  }

  return { sent, failed, skipped, total: logs.length };
}

/** Mark due scheduled campaigns as sending (send happens in processSendingCampaigns). */
export async function processDueScheduledCampaigns(): Promise<number> {
  const now = new Date();
  const due = await prisma.campaign.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
    },
    select: { id: true },
  });

  let queued = 0;

  for (const campaign of due) {
    const pending = await prisma.emailLog.count({
      where: { campaignId: campaign.id, type: "initial", status: "pending" },
    });
    if (pending === 0) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "draft", scheduledAt: null },
      });
      continue;
    }

    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "sending", scheduledAt: null },
    });
    queued++;
  }

  return queued;
}

/** Drain pending initial + follow-up sends in batches. */
export async function processSendingCampaigns(): Promise<{
  sent: number;
  failed: number;
  skipped: number;
  campaigns: number;
}> {
  const sendingCampaigns = await prisma.campaign.findMany({
    where: { status: "sending" },
    select: { id: true },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const campaign of sendingCampaigns) {
    const result = await sendCampaignEmails(campaign.id, "initial", {
      limit: SEND_BATCH_LIMIT,
    });
    sent += result.sent;
    failed += result.failed;
    skipped += result.skipped;
  }

  const pendingFollowUpCampaignIds = await prisma.emailLog.findMany({
    where: { type: "followup", status: "pending" },
    select: { campaignId: true },
    distinct: ["campaignId"],
  });

  for (const row of pendingFollowUpCampaignIds) {
    const result = await sendCampaignEmails(row.campaignId, "followup", {
      limit: SEND_BATCH_LIMIT,
    });
    sent += result.sent;
    failed += result.failed;
    skipped += result.skipped;
  }

  return {
    sent,
    failed,
    skipped,
    campaigns: sendingCampaigns.length + pendingFollowUpCampaignIds.length,
  };
}

/** Queue due schedules, then drain the send queue. */
export async function processOutboundQueue() {
  const scheduledQueued = await processDueScheduledCampaigns();
  const drain = await processSendingCampaigns();
  return { scheduledQueued, ...drain };
}

export async function processDueFollowUps(): Promise<number> {
  const now = new Date();

  const dueLogs = await prisma.emailLog.findMany({
    where: {
      type: "initial",
      status: { in: ["sent", "opened", "clicked"] },
      followUpDue: { lte: now },
    },
    include: { campaign: true, contact: true },
  });

  let created = 0;

  for (const log of dueLogs) {
    const steps = getFollowUpSteps(log.campaign);
    if (steps.length === 0) {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { followUpDue: null },
      });
      continue;
    }

    const pendingFollowUp = await prisma.emailLog.findFirst({
      where: {
        campaignId: log.campaignId,
        contactId: log.contactId,
        type: "followup",
        status: "pending",
      },
    });
    if (pendingFollowUp) continue;

    const existingFollowUps = await prisma.emailLog.findMany({
      where: {
        campaignId: log.campaignId,
        contactId: log.contactId,
        type: "followup",
      },
      select: { followUpStep: true },
    });

    const nextStep =
      existingFollowUps.length === 0
        ? 1
        : Math.max(...existingFollowUps.map((f) => f.followUpStep || 1), 0) + 1;

    const stepConfig = getFollowUpStepConfig(log.campaign, nextStep);
    if (!stepConfig) {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { followUpDue: null },
      });
      continue;
    }

    const repliedOrBounced = await prisma.emailLog.findFirst({
      where: {
        campaignId: log.campaignId,
        contactId: log.contactId,
        status: { in: ["replied", "bounced"] },
      },
    });
    if (repliedOrBounced) {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { followUpDue: null },
      });
      continue;
    }

    if (
      (await getSuppressedEmailSet([log.contact.email])).has(
        normalizeEmail(log.contact.email)
      )
    ) {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: { followUpDue: null },
      });
      continue;
    }

    await prisma.emailLog.create({
      data: {
        campaignId: log.campaignId,
        contactId: log.contactId,
        type: "followup",
        followUpStep: nextStep,
        status: "pending",
      },
    });
    created++;
  }

  return created;
}

export async function createCampaignWithContacts(
  campaignId: string,
  contacts: Contact[]
) {
  const suppressed = await getSuppressedEmailSet(contacts.map((c) => c.email));
  const eligible = contacts.filter(
    (c) => !suppressed.has(normalizeEmail(c.email))
  );

  const existing = await prisma.emailLog.findMany({
    where: { campaignId, type: "initial" },
    select: { contactId: true },
  });
  const existingSet = new Set(existing.map((e) => e.contactId));

  const toCreate = eligible.filter((c) => !existingSet.has(c.id));

  if (toCreate.length > 0) {
    await prisma.emailLog.createMany({
      data: toCreate.map((c) => ({
        campaignId,
        contactId: c.id,
        type: "initial",
        followUpStep: 0,
        status: "pending",
      })),
    });
  }

  return {
    created: toCreate.length,
    suppressed: contacts.length - eligible.length,
  };
}

export async function handleReplyOrBounce(campaignId: string, contactId: string) {
  await prisma.emailLog.updateMany({
    where: {
      campaignId,
      contactId,
      type: "initial",
    },
    data: {
      followUpDue: null,
    },
  });

  await prisma.emailLog.deleteMany({
    where: {
      campaignId,
      contactId,
      type: "followup",
      status: "pending",
    },
  });
}
