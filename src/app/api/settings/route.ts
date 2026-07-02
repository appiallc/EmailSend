import { NextRequest, NextResponse } from "next/server";
import { prisma, getSettings } from "@/lib/db";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({
    ...settings,
    smtpPass: settings.smtpPass ? "••••••••" : "",
    imapPass: settings.imapPass ? "••••••••" : "",
  });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const existing = await getSettings();

  const data: Record<string, unknown> = {};
  const fields = [
    "companyName",
    "smtpHost",
    "smtpPort",
    "smtpSecure",
    "smtpUser",
    "smtpFrom",
    "imapHost",
    "imapPort",
    "imapUser",
    "baseUrl",
  ] as const;

  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f];
  }

  if (body.smtpPass && body.smtpPass !== "••••••••") {
    data.smtpPass = body.smtpPass;
  }
  if (body.imapPass && body.imapPass !== "••••••••") {
    data.imapPass = body.imapPass;
  }

  const settings = await prisma.settings.update({
    where: { id: "default" },
    data,
  });

  return NextResponse.json({
    ...settings,
    smtpPass: settings.smtpPass ? "••••••••" : "",
    imapPass: settings.imapPass ? "••••••••" : "",
  });
}
