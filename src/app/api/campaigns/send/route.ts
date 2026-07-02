import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createCampaignWithContacts, sendCampaignEmails } from "@/lib/campaign";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { campaignId, contactIds, action } = body;

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  if (action === "prepare") {
    const count = await createCampaignWithContacts(campaignId, contactIds);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "draft" },
    });
    return NextResponse.json({ prepared: count });
  }

  if (action === "send") {
    await createCampaignWithContacts(campaignId, contactIds);
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: "sending" },
    });
    const result = await sendCampaignEmails(campaignId, "initial");
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
