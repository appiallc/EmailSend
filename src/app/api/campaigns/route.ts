import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  DEFAULT_FOLLOWUP_BODY,
  DEFAULT_FOLLOWUP_SUBJECT,
  DEFAULT_INITIAL_BODY,
  DEFAULT_INITIAL_SUBJECT,
} from "@/lib/templates";

export async function GET() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      emailLogs: {
        include: { contact: true },
        orderBy: { sentAt: "desc" },
      },
    },
  });
  return NextResponse.json(campaigns);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const campaign = await prisma.campaign.create({
    data: {
      name: body.name || "New Campaign",
      subject: body.subject || DEFAULT_INITIAL_SUBJECT,
      bodyHtml: body.bodyHtml || DEFAULT_INITIAL_BODY,
      followUpSubject: body.followUpSubject || DEFAULT_FOLLOWUP_SUBJECT,
      followUpBodyHtml: body.followUpBodyHtml || DEFAULT_FOLLOWUP_BODY,
      followUpDays: body.followUpDays ?? 7,
    },
  });

  return NextResponse.json(campaign);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, ...data } = body;
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const campaign = await prisma.campaign.update({
    where: { id },
    data,
  });
  return NextResponse.json(campaign);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
