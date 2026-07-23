import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DEFAULT_FOLLOWUP_BODY,
  DEFAULT_FOLLOWUP_SUBJECT,
  DEFAULT_INITIAL_BODY,
  DEFAULT_INITIAL_SUBJECT,
} from "@/lib/templates";
import { syncCampaignContactLists } from "@/lib/contact-lists";
import {
  normalizeExtraFollowUps,
  validateCampaignFollowUps,
} from "@/lib/follow-ups";

function parseFollowUpDays(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 7;
  return Math.floor(n);
}

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      contactLists: { include: { contactList: true } },
      emailLogs: {
        include: { contact: true },
        orderBy: { sentAt: "desc" },
      },
    },
  });

  return NextResponse.json(
    campaigns.map((c) => ({
      ...c,
      contactListIds: c.contactLists.map((cl) => cl.contactListId),
      contactLists: c.contactLists.map((cl) => ({
        id: cl.contactList.id,
        name: cl.contactList.name,
      })),
    }))
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const followUpPayload = {
    followUpDays: parseFollowUpDays(body.followUpDays ?? 7),
    followUpSubject: body.followUpSubject || DEFAULT_FOLLOWUP_SUBJECT,
    followUpBodyHtml: body.followUpBodyHtml || DEFAULT_FOLLOWUP_BODY,
    extraFollowUps: normalizeExtraFollowUps(body.extraFollowUps),
  };

  const validationError = validateCampaignFollowUps(followUpPayload);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: body.name || "New Campaign",
      subject: body.subject || DEFAULT_INITIAL_SUBJECT,
      bodyHtml: body.bodyHtml || DEFAULT_INITIAL_BODY,
      ...followUpPayload,
      extraFollowUps: followUpPayload.extraFollowUps as unknown as Prisma.InputJsonValue,
    },
  });

  if (body.contactListIds?.length) {
    await syncCampaignContactLists(campaign.id, body.contactListIds);
  }

  const full = await prisma.campaign.findUnique({
    where: { id: campaign.id },
    include: { contactLists: { include: { contactList: true } } },
  });

  return NextResponse.json({
    ...full,
    contactListIds: full?.contactLists.map((cl) => cl.contactListId) ?? [],
    contactLists:
      full?.contactLists.map((cl) => ({
        id: cl.contactList.id,
        name: cl.contactList.name,
      })) ?? [],
  });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const data: {
    name?: string;
    subject?: string;
    bodyHtml?: string;
    followUpSubject?: string;
    followUpBodyHtml?: string;
    followUpDays?: number;
    extraFollowUps?: Prisma.InputJsonValue;
    status?: string;
  } = {};

  if (body.name !== undefined) data.name = body.name;
  if (body.subject !== undefined) data.subject = body.subject;
  if (body.bodyHtml !== undefined) data.bodyHtml = body.bodyHtml;
  if (body.followUpSubject !== undefined) data.followUpSubject = body.followUpSubject;
  if (body.followUpBodyHtml !== undefined) data.followUpBodyHtml = body.followUpBodyHtml;
  if (body.followUpDays !== undefined) data.followUpDays = parseFollowUpDays(body.followUpDays);
  if (body.extraFollowUps !== undefined) {
    data.extraFollowUps = normalizeExtraFollowUps(
      body.extraFollowUps
    ) as unknown as Prisma.InputJsonValue;
  }
  if (body.status !== undefined) data.status = body.status;

  const existing = await prisma.campaign.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const merged = {
    followUpDays: data.followUpDays ?? existing.followUpDays,
    followUpSubject: data.followUpSubject ?? existing.followUpSubject,
    followUpBodyHtml: data.followUpBodyHtml ?? existing.followUpBodyHtml,
    extraFollowUps: data.extraFollowUps ?? existing.extraFollowUps,
  };
  const validationError = validateCampaignFollowUps(merged);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data,
  });

  if (body.contactListIds !== undefined) {
    await syncCampaignContactLists(id, body.contactListIds);
  }

  const full = await prisma.campaign.findUnique({
    where: { id: campaign.id },
    include: { contactLists: { include: { contactList: true } } },
  });

  return NextResponse.json({
    ...full,
    contactListIds: full?.contactLists.map((cl) => cl.contactListId) ?? [],
    contactLists:
      full?.contactLists.map((cl) => ({
        id: cl.contactList.id,
        name: cl.contactList.name,
      })) ?? [],
  });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
