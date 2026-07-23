import { prisma } from "./db";
import { getSettings } from "./db";
import { sendTrackedEmail } from "./email";
import {
  computeFollowUpDue,
  getFollowUpStepConfig,
  getFollowUpSteps,
} from "./follow-ups";
import type { Contact } from "@prisma/client";

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
  type: "initial" | "followup" = "initial"
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found");

  const settings = await getSettings();

  const logs = await prisma.emailLog.findMany({
    where: { campaignId, type, status: "pending" },
    include: { contact: true },
  });

  let sent = 0;
  let failed = 0;

  for (const log of logs) {
    try {
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
        subject = stepConfig.subject;
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

      const result = await sendTrackedEmail({
        settings,
        contact: log.contact,
        subject,
        bodyHtml,
        trackingId: log.trackingId,
        inReplyTo: initialLog?.messageId ?? undefined,
        references: initialLog?.messageId ?? undefined,
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
        data: { status: "sent", sentAt: new Date() },
      });
    }
  }

  return { sent, failed, total: logs.length };
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

  const campaignIds = new Set<string>();
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

    await prisma.emailLog.create({
      data: {
        campaignId: log.campaignId,
        contactId: log.contactId,
        type: "followup",
        followUpStep: nextStep,
        status: "pending",
      },
    });
    campaignIds.add(log.campaignId);
    created++;
  }

  for (const campaignId of campaignIds) {
    await sendCampaignEmails(campaignId, "followup");
  }

  return created;
}

export async function createCampaignWithContacts(
  campaignId: string,
  contacts: Contact[]
) {
  const existing = await prisma.emailLog.findMany({
    where: { campaignId, type: "initial" },
    select: { contactId: true },
  });
  const existingSet = new Set(existing.map((e) => e.contactId));

  const toCreate = contacts.filter((c) => !existingSet.has(c.id));

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

  return toCreate.length;
}
