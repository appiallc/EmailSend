import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import {
  createCampaignWithContacts,
  processOutboundQueue,
} from "@/lib/campaign";
import { resolveContactsForSend } from "@/lib/contact-lists";

async function resolveSendContacts(body: {
  campaignId: string;
  contactListIds?: string[];
  sendToAll?: boolean;
}) {
  const { campaignId, sendToAll } = body;
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
    dedupeByEmail: !sendToAll,
  });
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
  const { campaignId, contactListIds, sendToAll, action, scheduledAt } = body;

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  if (action === "cancel-schedule") {
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }
    if (campaign.status !== "scheduled") {
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

  const contacts = await resolveSendContacts({
    campaignId,
    contactListIds,
    sendToAll,
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
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledAt" }, { status: 400 });
    }
    if (when.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Schedule time must be in the future" },
        { status: 400 }
      );
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
