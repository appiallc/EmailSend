import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import {
  createCampaignWithContacts,
  processOutboundQueue,
  queueLateFollowUpStep,
} from "@/lib/campaign";
import { resolveContactsForSend } from "@/lib/contact-lists";
import { getSuppressedEmailSet, normalizeEmail } from "@/lib/suppression";
import { getSettings } from "@/lib/db";
import { snapToSendWindow, findFollowUpsBeforeInitial } from "@/lib/send-time";
import { getFollowUpSteps } from "@/lib/follow-ups";

async function resolveSendContacts(body: {
  campaignId: string;
  contactListIds?: string[];
  sendToAll?: boolean;
  allowDuplicates?: boolean;
}) {
  const { campaignId, sendToAll, allowDuplicates } = body;
  let listIds: string[] | undefined = body.contactListIds;

  if (!sendToAll && !listIds?.length) {
    const saved = await prisma.campaignContactList.findMany({
      where: { campaignId },
      select: { contactListId: true },
    });
    listIds = saved.map((s) => s.contactListId);
  }

  return resolveContactsForSend({
    sendToAll: !!sendToAll,
    contactListIds: listIds,
    // Safer default: always dedupe unless explicitly allowing duplicates.
    dedupeByEmail: !allowDuplicates,
  });
}

async function audiencePreview(body: {
  campaignId: string;
  contactListIds?: string[];
  sendToAll?: boolean;
  allowDuplicates?: boolean;
}) {
  const raw = await resolveContactsForSend({
    sendToAll: !!body.sendToAll,
    contactListIds: body.contactListIds,
    dedupeByEmail: false,
  });

  const uniqueMap = new Map<string, (typeof raw)[0]>();
  for (const c of raw) {
    const key = normalizeEmail(c.email);
    if (!uniqueMap.has(key)) uniqueMap.set(key, c);
  }
  const unique = [...uniqueMap.values()];
  const suppressedSet = await getSuppressedEmailSet(unique.map((c) => c.email));
  const eligible = unique.filter((c) => !suppressedSet.has(normalizeEmail(c.email)));

  // Also resolve what would actually send with current flags.
  const selected = await resolveSendContacts(body);
  const selectedEligible = selected.filter(
    (c) => !suppressedSet.has(normalizeEmail(c.email))
  );

  return {
    rawCount: raw.length,
    uniqueCount: unique.length,
    duplicateCount: Math.max(0, raw.length - unique.length),
    suppressedCount: unique.length - eligible.length,
    willSendCount: selectedEligible.length,
    allowDuplicates: !!body.allowDuplicates,
  };
}

function kickOutboundWorker() {
  after(async () => {
    try {
      await processOutboundQueue();
    } catch (err) {
      console.error("[send] Background outbound worker failed:", err);
    }
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    campaignId,
    contactListIds,
    sendToAll,
    allowDuplicates,
    action,
    scheduledAt,
  } = body;

  if (!campaignId && action !== "preview") {
    // preview can work with list ids only, but we still require campaignId for consistency
  }

  if (action === "pause" || action === "resume") {
    if (!campaignId) {
      return NextResponse.json({ error: "campaignId required" }, { status: 400 });
    }
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (action === "pause") {
      if (campaign.status === "sending") {
        return NextResponse.json(
          { error: "Cannot pause while actively sending. Wait for the batch to finish." },
          { status: 400 }
        );
      }
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: "paused",
          // keep scheduledAt so resume can restore intent, but halt processing via status
        },
      });
      return NextResponse.json({ ok: true, status: "paused" });
    }

    // resume — restore the most useful prior state
    const hasFutureSchedule =
      !!campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now();
    const hasDelivered = await prisma.emailLog.count({
      where: {
        campaignId,
        status: { in: ["sent", "opened", "clicked", "replied", "bounced"] },
      },
    });
    const hasPendingInitial = await prisma.emailLog.count({
      where: { campaignId, type: "initial", status: "pending" },
    });

    let nextStatus: string;
    if (hasFutureSchedule) {
      nextStatus = "scheduled";
    } else if (hasPendingInitial > 0) {
      nextStatus = "sending";
    } else if (hasDelivered > 0) {
      nextStatus = "sent";
    } else {
      nextStatus = "draft";
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: nextStatus,
        // Clear stale schedule if we are no longer scheduled
        scheduledAt: nextStatus === "scheduled" ? campaign.scheduledAt : null,
      },
    });
    if (nextStatus === "sending") {
      kickOutboundWorker();
    }
    return NextResponse.json({ ok: true, status: nextStatus });
  }

  if (action === "queue-late-follow-up") {
    if (!campaignId) {
      return NextResponse.json({ error: "campaignId required" }, { status: 400 });
    }
    try {
      const result = await queueLateFollowUpStep(campaignId);
      if (result.queued > 0) {
        kickOutboundWorker();
      }
      return NextResponse.json({
        ok: true,
        queued: result.queued,
        step: result.step,
        message:
          result.queued > 0
            ? `Queued follow-up ${result.step} for ${result.queued} non-replier(s).`
            : "No eligible contacts to queue (already replied, suppressed, or still in sequence).",
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Queue failed" },
        { status: 400 }
      );
    }
  }

  if (action === "cancel-schedule") {
    if (!campaignId) {
      return NextResponse.json({ error: "campaignId required" }, { status: 400 });
    }
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.status !== "scheduled" && campaign.status !== "paused") {
      return NextResponse.json(
        { error: "Campaign is not scheduled" },
        { status: 400 }
      );
    }
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "draft", scheduledAt: null },
    });
    return NextResponse.json({ ok: true, status: "draft" });
  }

  if (action === "preview") {
    if (!campaignId && !sendToAll && !contactListIds?.length) {
      return NextResponse.json(
        { error: "campaignId or contactListIds required" },
        { status: 400 }
      );
    }
    const preview = await audiencePreview({
      campaignId: campaignId || "",
      contactListIds,
      sendToAll,
      allowDuplicates,
    });
    return NextResponse.json(preview);
  }

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  const contacts = await resolveSendContacts({
    campaignId,
    contactListIds,
    sendToAll,
    allowDuplicates,
  });

  if (contacts.length === 0) {
    return NextResponse.json(
      { error: "No contacts found for the selected list(s)" },
      { status: 400 }
    );
  }

  if (action === "prepare") {
    const result = await createCampaignWithContacts(campaignId, contacts);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "draft", scheduledAt: null },
    });
    return NextResponse.json({
      prepared: result.created,
      suppressed: result.suppressed,
    });
  }

  if (action === "schedule") {
    if (!scheduledAt) {
      return NextResponse.json(
        { error: "scheduledAt is required (ISO date string)" },
        { status: 400 }
      );
    }
    let when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledAt" }, { status: 400 });
    }
    if (when.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Schedule time must be in the future" },
        { status: 400 }
      );
    }

    const settings = await getSettings();
    if (settings.businessDaysOnly) {
      when = snapToSendWindow(when, {
        timezone: settings.timezone,
        businessDaysOnly: settings.businessDaysOnly,
        sendWindowStart: settings.sendWindowStart,
        sendWindowEnd: settings.sendWindowEnd,
      });
      if (when.getTime() <= Date.now()) {
        when = snapToSendWindow(new Date(Date.now() + 60_000), {
          timezone: settings.timezone,
          businessDaysOnly: settings.businessDaysOnly,
          sendWindowStart: settings.sendWindowStart,
          sendWindowEnd: settings.sendWindowEnd,
        });
      }
    }

    const existing = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (existing.status === "sending") {
      return NextResponse.json(
        { error: "Campaign is currently sending" },
        { status: 400 }
      );
    }

    const scheduleConflicts = findFollowUpsBeforeInitial({
      initialAt: when,
      steps: getFollowUpSteps(existing),
      timezone: settings.timezone,
    });
    if (scheduleConflicts.length > 0) {
      const detail = scheduleConflicts
        .map(
          (c) =>
            `Follow-up ${c.stepIndex} (${c.days} day(s) at ${c.timeOfDay})`
        )
        .join("; ");
      return NextResponse.json(
        {
          error: `Follow-up times are at or before the scheduled initial send (${detail}). Edit follow-up times to after the initial send, then schedule again.`,
          code: "FOLLOWUP_BEFORE_INITIAL",
          conflicts: scheduleConflicts.map((c) => ({
            stepIndex: c.stepIndex,
            days: c.days,
            timeOfDay: c.timeOfDay,
            projectedDue: c.projectedDue.toISOString(),
          })),
        },
        { status: 400 }
      );
    }

    const prepared = await createCampaignWithContacts(campaignId, contacts);

    const pendingCount = await prisma.emailLog.count({
      where: { campaignId, type: "initial", status: "pending" },
    });
    if (pendingCount === 0) {
      return NextResponse.json(
        {
          error:
            prepared.suppressed > 0
              ? "All selected contacts are suppressed or already received this campaign."
              : "No pending recipients to schedule. All selected contacts already received this campaign — add new contacts or create a new campaign.",
        },
        { status: 400 }
      );
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "scheduled", scheduledAt: when },
    });

    return NextResponse.json({
      ok: true,
      status: "scheduled",
      scheduledAt: when.toISOString(),
      recipients: pendingCount,
      suppressed: prepared.suppressed,
    });
  }

  if (action === "send") {
    const existing = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (existing.status === "sending") {
      return NextResponse.json(
        { error: "Campaign is already sending" },
        { status: 400 }
      );
    }
    if (existing.status === "paused") {
      return NextResponse.json(
        { error: "Campaign is paused. Resume it before sending." },
        { status: 400 }
      );
    }

    const settingsForSend = await getSettings();
    const sendConflicts = findFollowUpsBeforeInitial({
      initialAt: new Date(),
      steps: getFollowUpSteps(existing),
      timezone: settingsForSend.timezone,
    });
    if (sendConflicts.length > 0) {
      const detail = sendConflicts
        .map(
          (c) =>
            `Follow-up ${c.stepIndex} (${c.days} day(s) at ${c.timeOfDay})`
        )
        .join("; ");
      return NextResponse.json(
        {
          error: `Follow-up times are at or before now (${detail}). Edit follow-up times to after the initial send, then send again.`,
          code: "FOLLOWUP_BEFORE_INITIAL",
        },
        { status: 400 }
      );
    }

    const prepared = await createCampaignWithContacts(campaignId, contacts);
    const pendingCount = await prisma.emailLog.count({
      where: { campaignId, type: "initial", status: "pending" },
    });

    if (pendingCount === 0) {
      return NextResponse.json(
        {
          error:
            prepared.suppressed > 0
              ? "All selected contacts are on the suppression list or already received this campaign."
              : "No pending recipients to send.",
        },
        { status: 400 }
      );
    }

    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "sending", scheduledAt: null },
    });

    kickOutboundWorker();

    return NextResponse.json({
      queued: true,
      status: "sending",
      recipients: pendingCount,
      suppressed: prepared.suppressed,
      message:
        "Campaign queued. Emails send in the background (about 25 per minute).",
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
