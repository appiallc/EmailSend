import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createCampaignWithContacts, sendCampaignEmails } from "@/lib/campaign";
import { resolveContactsForSend } from "@/lib/contact-lists";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, contactListIds, sendToAll, action } = body;

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  let listIds: string[] | undefined = contactListIds;

  if (!sendToAll && !listIds?.length) {
    const saved = await prisma.campaignContactList.findMany({
      where: { campaignId },
      select: { contactListId: true },
    });
    listIds = saved.map((s) => s.contactListId);
  }

  const contacts = await resolveContactsForSend({
    sendToAll: !!sendToAll,
    contactListIds: listIds,
    dedupeByEmail: !sendToAll,
  });

  if (contacts.length === 0) {
    return NextResponse.json(
      { error: "No contacts found for the selected list(s)" },
      { status: 400 }
    );
  }

  if (action === "prepare") {
    const count = await createCampaignWithContacts(campaignId, contacts);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "draft" },
    });
    return NextResponse.json({ prepared: count });
  }

  if (action === "send") {
    await createCampaignWithContacts(campaignId, contacts);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "sending" },
    });
    const result = await sendCampaignEmails(campaignId, "initial");
    return NextResponse.json({ ...result, recipients: contacts.length });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
