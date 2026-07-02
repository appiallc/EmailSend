import { prisma } from "./db";
import { getSettings } from "./db";
import { sendTrackedEmail } from "./email";

export async function sendCampaignEmails(campaignId: string, type: "initial" | "followup" = "initial") {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found");

  const settings = await getSettings();
  const subject = type === "initial" ? campaign.subject : campaign.followUpSubject;
  const bodyHtml = type === "initial" ? campaign.bodyHtml : campaign.followUpBodyHtml;

  if (!subject || !bodyHtml) {
    throw new Error(`Missing ${type} email template`);
  }

  const logs = await prisma.emailLog.findMany({
    where: { campaignId, type, status: "pending" },
    include: { contact: true },
  });

  let sent = 0;
  let failed = 0;

  for (const log of logs) {
    try {
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

      const followUpDue =
        type === "initial"
          ? new Date(Date.now() + campaign.followUpDays * 24 * 60 * 60 * 1000)
          : null;

      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "sent",
          sentAt: new Date(),
          messageId: result.messageId,
          followUpDue,
        },
      });
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
    if (!log.campaign.followUpSubject || !log.campaign.followUpBodyHtml) continue;

    const existingFollowUp = await prisma.emailLog.findFirst({
      where: {
        campaignId: log.campaignId,
        contactId: log.contactId,
        type: "followup",
      },
    });
    if (existingFollowUp) continue;

    const replied = await prisma.emailLog.findFirst({
      where: {
        campaignId: log.campaignId,
        contactId: log.contactId,
        status: "replied",
      },
    });
    if (replied) continue;

    await prisma.emailLog.create({
      data: {
        campaignId: log.campaignId,
        contactId: log.contactId,
        type: "followup",
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
  contactIds?: string[]
) {
  const contacts = contactIds?.length
    ? await prisma.contact.findMany({ where: { id: { in: contactIds } } })
    : await prisma.contact.findMany();

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
        status: "pending",
      })),
    });
  }

  return toCreate.length;
}
