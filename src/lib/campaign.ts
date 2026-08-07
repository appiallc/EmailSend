import { prisma } from "./db";
import { getSettings } from "./db";
import { sendTrackedEmail } from "./email";
import {
  getFollowUpStepConfig,
  getFollowUpSteps,
} from "./follow-ups";
import { getSuppressedEmailSet, normalizeEmail } from "./suppression";
import {
  normalizeSendDelayMs,
  sleep,
  SOFT_BOUNCE_MAX_RETRIES,
} from "./deliverability";
import {
  computeFollowUpDueAt,
  getTimezoneDayBounds,
  isSendAllowedNow,
  type SendWindowSettings,
} from "./send-time";
import {
  claimPendingEmailLogs,
  ensureEmailLogSendGuards,
  QUEUE_STATUSES,
  releaseOutboundLease,
  renewOutboundLease,
  tryAcquireOutboundLease,
} from "./outbound-claim";
import type { Contact, Settings } from "@prisma/client";
import { Prisma } from "@prisma/client";

/** Max emails to send per outbound worker run (avoids HTTP/cron timeouts). */
export const SEND_BATCH_LIMIT = 25;

function windowFromSettings(settings: Settings): SendWindowSettings {
  return {
    timezone: settings.timezone,
    businessDaysOnly: settings.businessDaysOnly,
    sendWindowStart: settings.sendWindowStart,
    sendWindowEnd: settings.sendWindowEnd,
  };
}

function pickSubject(
  campaign: { subject: string; subjectB: string; abTesting: boolean },
  variant: string | null | undefined
): string {
  if (campaign.abTesting && campaign.subjectB.trim() && variant === "B") {
    return campaign.subjectB;
  }
  return campaign.subject;
}

async function countSentToday(settings: Settings): Promise<number> {
  const { start, end } = getTimezoneDayBounds(new Date(), settings.timezone);
  return prisma.emailLog.count({
    where: {
      status: { in: ["sent", "opened", "clicked", "replied"] },
      sentAt: { gte: start, lt: end },
    },
  });
}

async function remainingDailyQuota(settings: Settings): Promise<number | null> {
  const limit = Math.max(0, settings.dailySendLimit ?? 0);
  if (limit <= 0) return null;
  const sent = await countSentToday(settings);
  return Math.max(0, limit - sent);
}

async function scheduleNextFollowUp(
  campaignId: string,
  contactId: string,
  initialSentAt: Date,
  settings: Settings
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
        ? computeFollowUpDueAt({
            sentAt: initialSentAt,
            days: nextStepConfig.days,
            timeOfDay: nextStepConfig.timeOfDay,
            settings: windowFromSettings(settings),
          })
        : null,
    },
  });
}

/** Pause campaign when hard-bounce rate exceeds settings threshold. */
export async function maybeAutoPauseForBounces(campaignId: string) {
  const settings = await getSettings();
  const threshold = Math.max(0, settings.bouncePausePercent ?? 0);
  if (threshold <= 0) return false;

  const [sentLike, hardBounces] = await Promise.all([
    prisma.emailLog.count({
      where: {
        campaignId,
        type: "initial",
        status: {
          in: ["sent", "opened", "clicked", "replied", "bounced"],
        },
      },
    }),
    prisma.emailLog.count({
      where: {
        campaignId,
        bounceType: "HARD_BOUNCE",
      },
    }),
  ]);

  if (sentLike < 10) return false;
  const rate = (hardBounces / sentLike) * 100;
  if (rate < threshold) return false;

  const updated = await prisma.campaign.updateMany({
    where: {
      id: campaignId,
      status: { in: ["sending", "sent", "scheduled"] },
    },
    data: { status: "paused" },
  });
  if (updated.count > 0) {
    console.warn(
      `[deliverability] Auto-paused campaign ${campaignId}: hard bounce rate ${rate.toFixed(1)}% >= ${threshold}%`
    );
    return true;
  }
  return false;
}

export async function sendCampaignEmails(
  campaignId: string,
  type: "initial" | "followup" = "initial",
  opts?: { limit?: number }
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found");

  const settings = await getSettings();
  if (!isSendAllowedNow(new Date(), windowFromSettings(settings))) {
    return { sent: 0, failed: 0, skipped: 0, total: 0, deferred: true as const };
  }

  let limit = opts?.limit ?? SEND_BATCH_LIMIT;
  const remaining = await remainingDailyQuota(settings);
  if (remaining !== null) {
    if (remaining <= 0) {
      return { sent: 0, failed: 0, skipped: 0, total: 0, deferred: true as const };
    }
    limit = Math.min(limit, remaining);
  }

  const delayMs = normalizeSendDelayMs(settings.sendDelayMs);

  // Claim before SMTP so overlapping cron/after() workers cannot send the same row twice.
  const logs = await claimPendingEmailLogs(campaignId, type, limit);

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
        await prisma.$executeRaw`
          UPDATE "EmailLog" SET "claimedAt" = NULL WHERE id = ${log.id}
        `;
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
        subject = pickSubject(campaign, log.subjectVariant);
        bodyHtml = campaign.bodyHtml;
      } else {
        const step = log.followUpStep || 1;
        const stepConfig = getFollowUpStepConfig(campaign, step);
        if (!stepConfig) {
          throw new Error(`Missing follow-up step ${step}`);
        }
        // Gmail (and most clients) thread on subject + In-Reply-To. Keep the same
        // subject as the initial with a Re: prefix so follow-ups stay in-thread.
        const base = pickSubject(campaign, log.subjectVariant).trim();
        subject = /^re:\s*/i.test(base) ? base : `Re: ${base}`;
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
            messageId: { not: null },
          },
          orderBy: { sentAt: "asc" },
        });

        if (previousLogs.length > 0) {
          // Prefer threading off the initial Message-ID; fall back to latest.
          const initialMsg = previousLogs.find((l) => l.type === "initial");
          const lastLog = previousLogs[previousLogs.length - 1];
          inReplyTo =
            (initialMsg?.messageId || lastLog.messageId) ?? undefined;
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
          followUpDue = computeFollowUpDueAt({
            sentAt,
            days: firstStep.days,
            timeOfDay: firstStep.timeOfDay,
            settings: windowFromSettings(settings),
          });
        }
      }

      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "sent",
          sentAt,
          messageId: result.messageId,
          followUpDue: type === "initial" ? followUpDue : null,
          bounceReason: null,
          bounceType: null,
          bouncedAt: null,
          retryAt: null,
          error: null,
        },
      });
      await prisma.$executeRaw`
        UPDATE "EmailLog" SET "claimedAt" = NULL WHERE id = ${log.id}
      `;

      if (type === "followup" && initialLog?.sentAt) {
        await scheduleNextFollowUp(
          campaignId,
          log.contactId,
          initialLog.sentAt,
          settings
        );
      }

      sent++;
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    } catch (err) {
      await prisma.emailLog.update({
        where: { id: log.id },
        data: {
          status: "failed",
          error: err instanceof Error ? err.message : "Send failed",
        },
      });
      await prisma.$executeRaw`
        UPDATE "EmailLog" SET "claimedAt" = NULL WHERE id = ${log.id}
      `;
      failed++;
    }
  }

  if (type === "initial") {
    const remaining = await prisma.emailLog.count({
      where: {
        campaignId,
        type: "initial",
        status: { in: [...QUEUE_STATUSES] },
      },
    });
    if (remaining === 0) {
      await prisma.campaign.update({
        where: { id: campaignId },
        data: { status: "sent", sentAt: new Date(), scheduledAt: null },
      });
    }
  }

  return { sent, failed, skipped, total: logs.length, deferred: false as const };
}

/** Re-queue soft-bounced logs whose retry window is due. */
export async function processSoftBounceRetries(limit = SEND_BATCH_LIMIT) {
  const now = new Date();
  const due = await prisma.emailLog.findMany({
    where: {
      status: "bounced",
      bounceType: "SOFT_BOUNCE",
      retryAt: { lte: now },
      retryCount: { lt: SOFT_BOUNCE_MAX_RETRIES },
      campaign: { status: { not: "paused" } },
    },
    take: limit,
    orderBy: { retryAt: "asc" },
  });

  let requeued = 0;
  for (const log of due) {
    // Atomic: only one worker can flip bounced → pending for this row.
    const claimed = await prisma.emailLog.updateMany({
      where: {
        id: log.id,
        status: "bounced",
        bounceType: "SOFT_BOUNCE",
        retryCount: { lt: SOFT_BOUNCE_MAX_RETRIES },
      },
      data: {
        status: "pending",
        retryCount: log.retryCount + 1,
        retryAt: null,
        bounceReason: null,
        bounceType: null,
        bouncedAt: null,
        messageId: null,
        sentAt: null,
        openedAt: null,
        clickedAt: null,
        error: `Soft bounce retry #${log.retryCount + 1}`,
      },
    });
    if (claimed.count === 0) continue;
    await prisma.$executeRaw`
      UPDATE "EmailLog" SET "claimedAt" = NULL WHERE id = ${log.id}
    `;

    if (log.type === "initial") {
      await prisma.campaign.updateMany({
        where: {
          id: log.campaignId,
          status: { in: ["sent", "draft"] },
        },
        data: { status: "sending" },
      });
    }
    requeued++;
  }

  return requeued;
}

/** Mark due scheduled campaigns as sending (send happens in processSendingCampaigns). */
export async function processDueScheduledCampaigns(): Promise<number> {
  const settings = await getSettings();
  if (!isSendAllowedNow(new Date(), windowFromSettings(settings))) {
    return 0;
  }

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
      where: {
        campaignId: campaign.id,
        type: "initial",
        status: { in: [...QUEUE_STATUSES] },
      },
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
  deferred: boolean;
}> {
  const sendingCampaigns = await prisma.campaign.findMany({
    where: { status: "sending" },
    select: { id: true },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let deferred = false;

  for (const campaign of sendingCampaigns) {
    const result = await sendCampaignEmails(campaign.id, "initial", {
      limit: SEND_BATCH_LIMIT,
    });
    sent += result.sent;
    failed += result.failed;
    skipped += result.skipped;
    if (result.deferred) deferred = true;
    await renewOutboundLease();
  }

  const pendingFollowUpCampaignIds = await prisma.emailLog.findMany({
    where: {
      type: "followup",
      status: { in: [...QUEUE_STATUSES] },
      campaign: { status: { not: "paused" } },
    },
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
    if (result.deferred) deferred = true;
    await renewOutboundLease();
  }

  return {
    sent,
    failed,
    skipped,
    campaigns: sendingCampaigns.length + pendingFollowUpCampaignIds.length,
    deferred,
  };
}

/** Queue due schedules, then drain the send queue. */
export async function processOutboundQueue() {
  await ensureEmailLogSendGuards();

  const acquired = await tryAcquireOutboundLease();
  if (!acquired) {
    return {
      softRetries: 0,
      scheduledQueued: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      campaigns: 0,
      // Not a send-window deferral — another worker is already draining.
      deferred: false as const,
      skippedBusy: true as const,
    };
  }

  try {
    const softRetries = await processSoftBounceRetries();
    await renewOutboundLease();
    const scheduledQueued = await processDueScheduledCampaigns();
    await renewOutboundLease();
    const drain = await processSendingCampaigns();
    return { softRetries, scheduledQueued, ...drain, skippedBusy: false as const };
  } finally {
    await releaseOutboundLease();
  }
}

export async function processDueFollowUps(): Promise<number> {
  const now = new Date();

  const dueLogs = await prisma.emailLog.findMany({
    where: {
      type: "initial",
      status: { in: ["sent", "opened", "clicked"] },
      followUpDue: { lte: now },
      campaign: { status: { not: "paused" } },
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
        status: { in: [...QUEUE_STATUSES] },
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

    try {
      await prisma.$transaction([
        prisma.emailLog.create({
          data: {
            campaignId: log.campaignId,
            contactId: log.contactId,
            type: "followup",
            followUpStep: nextStep,
            status: "pending",
            subjectVariant: log.subjectVariant,
          },
        }),
        // Clear due immediately so concurrent cron cannot create another follow-up.
        prisma.emailLog.update({
          where: { id: log.id },
          data: { followUpDue: null },
        }),
      ]);
      created++;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // Another worker already created this follow-up step.
        await prisma.emailLog.update({
          where: { id: log.id },
          data: { followUpDue: null },
        });
        continue;
      }
      throw err;
    }
  }

  return created;
}

/**
 * After adding a new follow-up step on a finished sequence, re-set followUpDue
 * for eligible contacts who already completed prior steps.
 */
export async function queueLateFollowUpStep(campaignId: string): Promise<{
  queued: number;
  step: number | null;
}> {
  const settings = await getSettings();
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new Error("Campaign not found");

  const steps = getFollowUpSteps(campaign);
  if (steps.length === 0) {
    return { queued: 0, step: null };
  }

  const targetStep = steps.length;
  const stepConfig = steps[targetStep - 1];
  if (!stepConfig) return { queued: 0, step: null };

  const initials = await prisma.emailLog.findMany({
    where: {
      campaignId,
      type: "initial",
      status: { in: ["sent", "opened", "clicked"] },
      followUpDue: null,
    },
    include: { contact: true },
  });

  let queued = 0;
  const now = new Date();

  for (const log of initials) {
    if (!log.sentAt) continue;

    const repliedOrBounced = await prisma.emailLog.findFirst({
      where: {
        campaignId,
        contactId: log.contactId,
        status: { in: ["replied", "bounced"] },
      },
    });
    if (repliedOrBounced) continue;

    if (
      (await getSuppressedEmailSet([log.contact.email])).has(
        normalizeEmail(log.contact.email)
      )
    ) {
      continue;
    }

    const pendingFollowUp = await prisma.emailLog.findFirst({
      where: {
        campaignId,
        contactId: log.contactId,
        type: "followup",
        status: { in: [...QUEUE_STATUSES] },
      },
    });
    if (pendingFollowUp) continue;

    const existingFollowUps = await prisma.emailLog.count({
      where: {
        campaignId,
        contactId: log.contactId,
        type: "followup",
        status: { in: ["sent", "opened", "clicked", "replied"] },
      },
    });

    if (existingFollowUps !== targetStep - 1) continue;

    let due = computeFollowUpDueAt({
      sentAt: log.sentAt,
      days: stepConfig.days,
      timeOfDay: stepConfig.timeOfDay,
      settings: windowFromSettings(settings),
      now,
    });
    if (due.getTime() <= now.getTime()) {
      due = computeFollowUpDueAt({
        sentAt: now,
        days: 0,
        timeOfDay: stepConfig.timeOfDay,
        settings: windowFromSettings(settings),
        now,
      });
    }

    await prisma.emailLog.update({
      where: { id: log.id },
      data: { followUpDue: due },
    });
    queued++;
  }

  return { queued, step: targetStep };
}

export async function createCampaignWithContacts(
  campaignId: string,
  contacts: Contact[]
) {
  const suppressed = await getSuppressedEmailSet(contacts.map((c) => c.email));
  const eligible = contacts.filter(
    (c) => !suppressed.has(normalizeEmail(c.email))
  );

  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  const abOn = !!(campaign?.abTesting && campaign.subjectB.trim());

  const existing = await prisma.emailLog.findMany({
    where: { campaignId, type: "initial" },
    select: { contactId: true },
  });
  const existingSet = new Set(existing.map((e) => e.contactId));
  const existingCount = existing.length;

  const toCreate = eligible.filter((c) => !existingSet.has(c.id));

  if (toCreate.length > 0) {
    await prisma.emailLog.createMany({
      data: toCreate.map((c, i) => ({
        campaignId,
        contactId: c.id,
        type: "initial",
        followUpStep: 0,
        status: "pending",
        subjectVariant: abOn
          ? (existingCount + i) % 2 === 0
            ? "A"
            : "B"
          : null,
      })),
      skipDuplicates: true,
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
      status: { in: ["pending", "sending"] },
    },
  });

  await maybeAutoPauseForBounces(campaignId);
}
